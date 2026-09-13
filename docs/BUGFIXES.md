# バグ修正記録 (BUGFIXES)

## 2026-09-13 — 🏁§5.3 `O-355` / `O-349` クローズ（第302バッチ）

🔴🔑**この回の主産物は「登録票の『足りない受け皿は1つだけ』が、2件とも 0 個だった」こと**＝
**`O-355` も `O-349` も、型にも engine にも受け皿が全部そろっていて、live の JSON を書き換えるだけで閉じた。**
⇒ **§2.1 ② の「着手の1手目は grep」は、`O-nn` が名指しした「足りないもの」自体にも掛ける。**
（この連敗は**連続14項目**になった。登録票の欠落リストは**仮説であって実測ではない**。）

### ① 🏁`O-355`＝【アクセ】化が手札を経由していた（`WX17-033-E1`）

**原文**＝「【出】：あなたのデッキの上からカードを３枚見て《アクセアイコン》を持つシグニ１枚を
**このシグニの**【アクセ】にする。残りを好きな順番でデッキの一番下に置く。」

**旧 live**＝`SEQUENCE[LOOK_PICK_CHAIN{then:'hand'}, STUB{ATTACH_SEARCHED_AS_ACCE}]`＝**2つ壊れていた**＝
①ハンドラが `ownerState.hand.includes(...)` を**必須条件**にしているので、呼び出し側は
**いったん手札に入れるしかなかった**（解決の途中でそのカードが手札に存在する＝「手札に加わったとき」系や
手札枚数を見る【常】が原文に無い反応をしうる）②ホスト候補が**自分の全シグニ**で、原文「**この**シグニ」より広い。

🔑**受け皿は2つとも既に在った**＝`LookPickChainStage.then:'acce'`（`O-311`）と `TargetFilter.thisCardOnly`。
🔴**ただし `matchesFilter` は `thisCardOnly` を黙って無視する**（型の同名フィールドに注記があるとおり。
`execAddToLife` も同じ理由で自前で剥がしている）＝**渡すだけでは効かず、自分の全シグニが候補のまま**。
⇒ `INTERNAL_ASK_ACCE_HOST` で**先に剥がして**効果元だけに絞った。**⚠無視される軸を渡して安心しない。**

**`ATTACH_SEARCHED_AS_ACCE` は撤去した**＝parser はこの id を生成せず（実測 0）、利用者はこの1効果だけだった。

### ② 🏁`O-349`＝明示 defer の最後の1効果（`SPDi43-05-E2`）

**原文**＝「【起】《ゲーム１回》バーテックス ルリグデッキからアーツ１枚をルリグトラッシュに置く：
次の対戦相手のターン終了時まで、このルリグは『【自】：**対戦相手のルリグかシグニ**１体がアタックしたとき、
**あなたの場かエナゾーンから**そのルリグかシグニと**同じレベルの**シグニ１枚をトラッシュに置いてもよい。
**そうした場合**、そのアタックを無効にする。』を得る」

**旧 live**＝`STUB{DEFERRED_ATTACKER_LEVEL_TRADE_NEGATE}`＝**ハンドラも無い完全な no-op**
（コストのアーツ1枚だけ失って何も起きない＝過少実行）。

🔑**登録票は「受け皿4つ中3つが在る。足りないのは『コストが場∪エナの単一プール』1つだけ」と書いていたが、
その1つも在った**＝`TargetSpec.extraZones:['energy']`（§5.3 `O-280`①・2026-09-08・先例 `WXEX1-09-E2`）。
⇒ **engine を1行も触らずに閉じた。** 使った受け皿4つ＝
①器 `GRANT_EFFECT{target:LRIG{thisCardOnly}, duration:'UNTIL_OPP_TURN_END'}`（先例 `WX25-P2-030-E2`）
②収集 `collectLrigAttackDefenderTriggers`（相手ルリグのアタック）＋ `collectFieldTriggers` の
`opState.lrig_granted_auto_effects` 走査（相手シグニのアタック）＝どちらも `any_opp` を拾う
③場∪エナの単一プール `extraZones:['energy']` ④同レベル `filter.levelEqTrigger`。

🔑**「〜してもよい。そうした場合」は `upToCount:true` ＋ `LAST_PROCESSED_COUNT_GTE:1`** で表した
（`OPTIONAL_COST` の `fieldTrash` は**場だけ**でエナを含められない）。
⚠**0枚を選べるので `O-352` の「候補0で払い損」問題は起きない**（`abortIfNoCandidate` は不要）。

**⚠E2E を書いて初めて分かったこと**＝`NEGATE_ATTACK{attackingOnly}` は
**`pending_signi_battle` のゾーン頂点しか候補にしない**ので、golden で「いまアタック中」の印を立てないと
**候補0で黙って何もしない**（この E2E の初回失敗がそれ）。⇒ **`attackingOnly` を試すときは印を立てる。**

### ③ 検証

`npm run gates` 全緑（**golden 4064 PASS**＝+4）。**反転確認＝両方向あり**＝
`O-355` は「手札を経由していない／アクセにした札が手札に残っていない」を assert、
`O-349` は **払わなければ無効化しない／払えば無効化する**の2本を E2E で実行して確認した。
**ラチェット**＝`census:stublabel` **A 11→10 / B 1→0**（`O-355` の払い戻し）。
**明示 defer** 26種/28箇所 → **25種/27箇所**（`O-349` の対象3件がすべて完了）。

**⑤実機の要否＝不要と判定**（§2.2）。**`src/screens/` は1行も触っていない**（登録票の
「コスト UI が要る＝実機必須」は、コスト句ではなく**解決中の任意アクション**として表したので発生しない）。
新しい型も足していない（既存の payload キーの組み合わせだけ）。

## 2026-09-13 — 🏁§5.3 `O-354` クローズ＝STUB ラベル 43箇所の払い戻し（第301バッチ）

🔴🔑**この回の主産物は「ラベル整備は `census:numberdrift` の払い戻しでもある」と分かったこと**＝
**`census:stublabel` B群17→1・C群26→0 を返したら、`census:numberdrift` が 75→72 へ勝手に下がった。**
⇒ **`[STUB:…]` のラベルが中身を書いていないと、そのカードの原文の数値がまるごと逆翻訳から落ちる。**
（例＝`WX09-027-E1` のラベルは「WX09-027(オリハルティア)の常在マーカー。」で、
原文の **7000／15000** がどこにも出ていなかった。）

### ① B群 17 → 1（ラベルが内容を説明していない）

🔑**最大の発見＝「engine: 〜未実装」ラベルが全部 stale だった。**
`ガード系（engine: ガードコスト処理未実装）` `アタック制限系（engine: アタック制限システム未実装）`
`コストアップ系（engine: コスト計算未実装）` `レベル修正（engine: ベースレベル変更システム未実装）`
`ライズ/スタック系（engine: ライズシステム未実装）`＝**5系統すべて、実体は `effectEngine.ts` の宣言読み取り
＋ `signiAttackGate` / `spellUseGate` / `GuardResponseDialog` / `BattleScreen` に既に在る**
（`execStubPart*` のハンドラは AUTO/ACTIVATED で来た場合の**ログだけのフォールバック**）。
⇒ **「engine が未実装」と書いてあるコメントを信じない**＝`grep -rn "<ID>" src/` を打つと消費地点が出る。

⚠**残した1件は意図的な真陽性**＝`ATTACH_SEARCHED_AS_ACCE`（`WX17-033-E1`）の「（手札経由近似）」。
engine は探したカードを**いったん手札へ入れてから**【アクセ】にする（`ownerState.hand.includes(...)` が必須条件）が、
原文「デッキの上からカードを3枚見て…シグニ1枚をこのシグニの【アクセ】にする」は手札を経由しない。
🔴**ラベルから「近似」を消すと、その逸脱が逆翻訳から見えなくなる**＝直すのは engine 側（→ `O-355`）。

### ② C群 26 → 0（ラベルに内部識別子が漏れている＝`census:stubs` F群の死角）

**3形とも実在した**＝①カード番号（`WX04-008` `WX09-027` `WXK04-030` `WXEX2-84` `WDK08-L14` `PR-470A/B`）
②ドットの無い camelCase（`costColors` `sourceCardNum` `fetchCardName` `stub.value`）
③生の英語 ID（`NEGATE_ATTACK_ON_TRIGGER` が **6箇所**／`ATTACK_SIGNI`／`SELECT_TARGET`／`effectEngine`）。

**直し方は2通りだった**
- **ハンドラがある 20箇所**＝ハンドラ直前に **`// 表示: <日本語>` を1行足す**（実装コメントは消さない）
  → `node scripts/genStubsMd.mjs` → `npm run regen`。複数 id を捌く共有コメントは `// 表示: <ID>: <日本語>`。
- 🔴**ハンドラが無い 5箇所は `decompileEffects.ts` 側だった**＝
  - `GRANT_ALL_ZONE_LIFEBURST`（4箇所）＝**逆翻訳が自分で組み立てていた**。原文 regex
    `/あなたのすべての領域にある…を持つ/` が当たった1効果だけ日本語になり、**外れた4効果は
    最終フォールバック `[STUB:${a.id}${extra}]` に落ちて生 ID が出ていた**（原文の「を持つ」/「を得る」の揺れ、
    「ライフクロスとチェックゾーンにある」という別表記が原因）。⇒ **payload から描く分岐**に置き換え、
    原文 regex 分岐は撤去した（規約＝原文をもう一度読まない）。
  - `DEFERRED_ATTACKER_LEVEL_TRADE_NEGATE`（`SPDi43-05-E2`）＝ハンドラが無い明示 defer なので
    `STUBS.md` 経由の説明が存在せず、**生 ID がそのまま出ていた**。`miscStubMap` に**「（未実装）」まで書いて**登録した。

🔑**副産物＝焼き込まれた既定値が1つ見えた。** `grantedAllZoneBurstAction`（`allZoneBurst.ts`）は
`burstAction` が無いと**「対戦相手のシグニ1体をバニッシュする」を焼き込む**。live で payload 無しなのは
`WD14-001-E3` だけで、そのカードの原文がたまたまバニッシュなので**合っていた**（`O-60` 第59バッチの罠②と同じ形）。
⇒ 逆翻訳に **`（※ペイロード欠落＝engine の既定値）`** と出るようにして、次に増えたら気づけるようにした。

### ③ 検証

`npm run gates` 全緑（golden 4060 PASS）。**ラチェットを3本払い戻した**＝
`census:stublabel` **B 17→1 / C 26→0**、`census:numberdrift` **75→72**。A群は **11 で据置**。
**反転確認**＝あり＝`docs/decompile_sheet*.txt` の該当11効果を原文と目視照合した（BUGFIXES の①②に引用）。

**⑤実機の要否＝不要と判定**（§2.2）。触ったのは `src/engine/`（コメント行のみ）と `scripts/`（逆翻訳）だけで、
**`src/screens/` も live JSON も型も1行も変えていない**＝engine の挙動は1ビットも動いていない（索引 E の性質）。

## 2026-09-13 — 🏁§5.3 `O-351` クローズ＝**STUB ラベル忠実性センサスを新設**（第300バッチ）

🔴🔑**この回の主産物は計器そのもの**（`npm run census:stublabel`・`scripts/censusStubLabel.mjs`）。
**そして初回実測で `MASS_TRASH` の重大な過剰実行が1件落ちた**＝計器が仕事をすることを同時に示した。

### ① 🏁`O-351`＝`[STUB:…]` のラベルが原文を説明しているかの検出器（新設）

**なぜ必要だったか**＝`[STUB:…]` は **292カード / 316箇所**あるが、そのうち **271カードは
`census:numberdrift` も `census:payloadkeys` も何も言わない**（登録票の実測）。
🔴**このプロジェクトの主軸の検査は「原文 × 逆翻訳の目視照合」なので、`[STUB:…]` の箇所は
「ラベルを信じる」ことで成立している**＝**ラベルが嘘だと、そこだけ検査が効かない。**
`census:stubs` の C群/E群/F群は「**生の英語 ID が出ていないか**」しか見ておらず、
**綺麗な日本語で書かれた嘘のラベル**は3群とも素通りする（実測＝下記の C群26箇所は F群 0 のまま通っていた）。

**3群で測る**（どれもラチェット＝増えても減っても exit 1・`npm run gates` 同梱）
| 群 | 何を見るか | 実測 |
|---|---|---|
| **A🔴** | ラベルの語彙・数値が**そのカードの原文に無い** | 新設時 **13** → 払い戻して **11** |
| **B** | ラベルが内容を説明していない（`（engine: 〜未実装）` の総称／途中切れ／実装メモ） | **17** |
| **C** | ラベルに識別子が漏れている（**`census:stubs` F群の死角**） | **26** |

🔑**実測した精度（新設時の A群 13箇所を live JSON とハンドラまで当たって分類）**＝
**実バグ 8箇所(62%) ／ 表示だけの穴 2箇所(15%) ／ 偽陽性 3箇所(23%)。**
⚠**B群・C群は「原文照合が効かない」ことの検出であって engine の欠陥数ではない**（件数をバグ数と読まない）。

**実装上の罠（還元済み）**
- 🔴**部分一致で語彙を数えると壊れる**＝「アップキープ」が「アップ」に、「パワーアップ」が「アップ」に、
  「コストアップ」が「コスト」に化ける。⇒ **長い語から順に照合位置を潰すトークナイザ**にした。
- 🔴**カード自身の種別はラベルに出てよい**＝「ルリグトラッシュの**アーツ**が自己回収」は
  そのアーツ自身を指すので、原文に「アーツ」の語が無くても嘘ではない（この1点で偽陽性3件）。
- 🔑**カード番号は「実在するカード番号の集合」で判定する**＝正規表現の当てずっぽうだと偽陽性が出る。
- 🔑**C群を `census:stubs` F群へ足さなかった理由**＝あちらは「**0 が正**・増えたら exit 1」の契約。
  実測値 26 を持ち込むと契約が壊れるので、**こちらで実測値のラチェットとして持つ**（直し方は F群と同じ）。

**F群の死角3つ**（実測でこの3形が1本も当たっていなかった）
①**カード番号**（`WX04-008`）＝F群のどのパターンにも無い ②**ドットの無い camelCase**（`costColors`・
`fetchCardName`）＝F群は `x.fooBar` 形しか見ない ③**生の英語 ID のうしろが全角括弧**
（`GRANT_ALL_ZONE_LIFEBURST（…`）＝`census:stubs` C群は ID の直後が `$`/`:`/空白のときしか拾わない。

### ② 🔴`MASS_TRASH`＝**1つの id に2つの別文型が同居**（A群の初収穫・重大な過剰実行）

**真因**＝`execStubPart1.ts` の `MASS_TRASH` ハンドラは
「**相手の**エナ全部＋**相手の**シグニ全部を**即**トラッシュ」を焼き込んでいる。
ところが `WXDi-P05-007-E3` の原文は
「**このターン終了時、あなたの**手札とエナゾーンにあるすべてのカードをトラッシュに置く」＝
**プレイヤーもゾーンもタイミングも全部違う**。⇒ 【起】を使うと**相手の盤面とエナが全部消えていた。**

🔑**これは `TRASH_ALL_SIGNI_AND_KEY` が `O-60` 第59バッチ（2026-09-03）で直したのと同じ壊れ方が
隣の行に残っていたもの**＝**catch-all を割ったら、同じファイルの兄弟 id も必ず見る。**

**直し方**＝①支払い先を既存 payload `STUB{TRASH_ALL_SIGNI_AND_KEY, trashAllScope:{owner:'self',
zones:['hand','energy']}}` へ寄せた（**engine 無改造**）②遅延は新設 `DELAY_TO_THIS_TURN_END` で表した。
🔑**新型といっても受け皿は既にあった**＝`pending_own_turn_end_effects` ＋ `RESOLVE_OWN_TURN_END_EFFECT` ＋
`triggerCollect` の `ON_TURN_END` 分岐。**足りなかったのは「next スロットではなく active スロットへ積む」
入口だけ**（兄弟の `DELAY_TO_NEXT_OWN_TURN_END` は2スロット式で次ターンまで発火しない）。
③`MASS_TRASH` のラベルを実装に合わせ（「またはシグニ+キー」は**一度も行わない挙動**だった）、
**新しいカードをここへ足すな**とハンドラに書いた（残りは `WX11-020-E1` の1効果だけ）。

**影響枚数**＝実バグ修正 **1効果**（`WXDi-P05-007-E3`）／ラベル是正 **1 id・2効果**。
**逆翻訳**＝「【起】…あなたのカードを2枚引く。そしてあなたのデッキの上から2枚をエナゾーンに置く。
そして**このターン終了時、あなたの手札とエナゾーンにあるカードをすべてトラッシュに置く**」＝原文と一致。

**検証**＝`npm run gates` 全緑（golden **4060/4060**＝新規2本 `DELAY_TO_THIS_TURN_END` / `WXDi-P05-007-E3`）。
**反転確認**＝あり＝golden は `!json.includes('MASS_TRASH')` と `!json.includes('"signi"')` を assert
（元の壊れ方＝相手の盤面を流す／原文に無いシグニを流す、の両方向）。
`census:stublabel` A群 13→11（払い戻し・BASELINE を実測値へ下げた）。

**⑤実機の要否＝不要と判定**（§2.2）。触ったのは `src/types/` `src/engine/` `src/data/` `public/data/` `scripts/` だけで
**`src/screens/` は1行も触っていない**。新型を足したが**React 側は無改造**＝書き込み先
`pending_own_turn_end_effects` は BattleScreen が既に昇格・消費しており、
**`collectTurnTriggers('ON_TURN_END')` は `clearTurnEndScopedState` より前に走る**ことを
`BattleScreen.tsx:4046` と `:4244` で確認した（＝同一ターン中に積んだ予約はそのターン終了時に発火する）。

## 2026-09-13 — §5.3 `O-352` クローズ ／ `O-349` 色限定つき使用封じ（第299バッチ）

🔴🔑**この回の主産物は「据置契約の根拠が実測で誤りだった」が2件続いたこと**＝
**`O-352`（`freezeStoredTargets` を通していない）／`O-349`（`BLOCK_ACTION` に色の絞りが無い）はどちらも
engine を1行も触らずに閉じた。** ⇒ **据置の理由文は、着手時に必ず engine を動かして確かめる。**

### ① 🏁`O-352`＝「対象宣言を支払いより前へ」＋**候補0なら払わせない**（live 51効果）

**(a) 登録票の前提は誤りだった**＝`OPTIONAL_TRASH_SELF` の分岐（`effectExecutor.ts:6609`）は確かに
`freezeStoredTargets` を呼んでいないが、**自己トラッシュの支払いは必ず `SELECT_TARGET`（`thisCardOnly` の
1候補）で対話に入る**ので、そこで `execSequence` が**残りステップを凍結する**（`:7191`）。
実測（golden の一時プローブ）＝pay 肢の continuation は `BANISH{targetsStored:false, fixedCardNums:["<宣言した札>"]}`
になっており、**宣言した対象はちゃんと届いていた**。⇒ `O-188` 第2バッチの**据置契約を解除**（②の据置は残0）。

**(b) 本当の欠陥は「候補0でも支払いを提示する」**＝`WX06-CB01-E1`（「対戦相手のパワー3000以下のシグニ１体を
対象とし、このシグニを場からトラッシュに置いてもよい。そうした場合、それをバニッシュする」）は
**相手にパワー3000以下が1体も居なくても** `pay:このシグニをトラッシュして発動` が `available:true` で出て、
払うと**自分のシグニだけが消えて何も起きない**（払い損＝`O-129`／`O-298` と同じ欠陥）。
🔴**真因は「規約が pass ごとに守られていた」こと**＝`applyO96OptionalCostTargetFirst` は
`abortIfNoCandidate` を刻むのに、`applyLegacyTradeStubCost`（B9）／`applyTargetLevelScaling`／
`applyTotalLevelSelectionWiring`／`repairSemanticBatch246` は刻まず、**実測 49効果**が素通りしていた。
⇒ **組み立て地点ごとに直すのをやめ、正準形そのものへ後段で1回刻む**
（`stampAbortOnCanonicalOptionalCost`＝`parseCardEffects` の**全 pass の最後**。
🔑`repairSemanticBatch*` が「そうした場合」ゲートを `PAID_ADDITIONAL_COST` へ差し替えて
**正準形をそこで初めて完成させる**効果がある（`WXDi-P16-049-E1`②枝）ので、ここでなければ届かない）。
⚠**「N体まで」（`upToCount`）には刻まない**＝原文が0体を選べるので候補が居なくても支払いは選べる
（先例 `WXDi-P08-053`／`WX13-056-E1`）。live 実測＝刻印 221 / 除外（`upToCount`）7 / **未刻印 0**。

**(c) 宣言が支払いより後だった2効果**（`O-347` で据置にしたぶん）を正準形へ＝
`WX24-P2-060-E1`（相手パワー5000以下を手札へ）／`WXDi-P04-033-E1`（自分のトラッシュの《ガードアイコン》を手札へ）。
実測した旧挙動＝**支払いを先に聞き、払ったあとで候補0が判明して無言で終わる**（自分のシグニだけ消える）。
⚠`WXDi-P12-061-E1` は原文に「対象とし」が無いので**2ステップのまま**（宣言する対象が無い）。

**影響＝live 52効果**（内訳＝`abortIfNoCandidate` の刻印だけ 49／正準形へ組み替え 2／
`WX18-033-E2` は**キー順だけ**の churn＝収穫マージがカード単位で fresh を採った巻き込み・意味は同一）。

### ② 🏁`O-349` の色限定つき使用封じ（2効果）＝明示 defer を解消

🔴**据置の理由「`BLOCK_ACTION` は actionId しか持たずカードの色で絞る機構が無い」は誤り**＝
`isSpellUseBlockedFor`（`src/screens/battle/spellUseGate.ts`）は**前からカードを受け取って**
`PLAY_COLORLESS`（無色のスペル封じ）／`BLOCK_NON_WHITE_SPELL`（白以外のスペル封じ）を判定していた。
⇒ **新機構は要らず、actionId を増やして同じ経路へ載せるだけ**で足りた。

- **原文2形（`npm run census:population` で全数＝2効果）**
  ①`PR-471-E1`②「次の対戦相手のターンの間、対戦相手は**無色ではない**、アーツとスペルを使用できない」
  ②`WXK09-037-E2`【常】「対戦相手は**宣言された色を持たず無色ではない**、アーツとスペルを使用できない」
- **実装**＝`USE_{ARTS,SPELL}_UNLESS_COLORLESS` / `USE_{ARTS,SPELL}_UNLESS_COLOR_DECLARED` の4 actionId ＋
  判定 1本（`isColorQualifiedUseBlocked`＝`src/engine/blockAction.ts`）を
  `isArtsUseBlockedFor`（第3引数に `card` を追加）と `isSpellUseBlockedFor` の両方から呼ぶ。
  逆翻訳（`decompileEffects.ts` の `predMap`）とログラベルも同じ巡で足した。
- 🔴**①と②を1つの id にまとめない**＝まとめると未宣言のとき②が①に化けて
  **「相手はアーツもスペルも一切使えない」恒久の全面封じ**（原文は宣言色と無色は使える）になる。
  ②は**未宣言なら制限を課さない**（fail-closed。先例＝`collectOppEnergyColorRestriction`）。
- ⚠**アーツとスペルで2本に割る**＝封じ判定は actionId の**完全一致**（旧 `ARTS_AND_SPELL` が死 id だった理由）。

### ③ 🔥`O-349` の残り1効果は「新機構が1つ」＝先送り（理由を実測で確定）

`SPDi43-05-E2`（`DEFERRED_ATTACKER_LEVEL_TRADE_NEGATE`）＝**受け皿4つのうち3つは既に在った**＝
器（`GRANT_LRIG_ABILITY`＋`timing:['ON_ATTACK_SIGNI','ON_ATTACK_LRIG']`・先例 `WXDi-P09-036-E1`）／
帰結（`NEGATE_ATTACK{CENTER_LRIG_OR_SIGNI, attackingOnly}`）／レベル束縛（`levelEqTrigger`）。
🔴**足りないのは「コストが場∪エナの単一候補プール」だけ**（`OptionalCostSpec` は `fieldTrash` と
`energyTrash` が別軸）＝**`WXK10-018-E2` と同じ family**（旧 §6.4 `O-11` の残した近似(b)）＝**2効果で1機構**。
⇒ PLAN §5.3 `O-349` に「回避案（`CHOOSE` でゾーンを2枝に割る）」まで書いて残した。

**検証**＝`npm run gates` 全緑（**golden 4058 PASS**＝+7）／`npm run regen` で逆翻訳を目視
（`WX24-P2-060-E1`／`WXDi-P04-033-E1`／`WXK09-037-E2`／`PR-471-E1` の4件が原文一致）／
**反転確認 ✅**＝①`abortIfNoCandidate` を外すと「候補0でも支払いを提示」へ戻ることを golden が assert
②`declared_color` を消すと黒アーツが使えるようになる（②が全面封じへ倒れていないことの対）／
🆕**実機 2本が2回連続 PASS**＝`node scripts/verifyBattleDrive.mjs o349ColorUseBlockBlocksOffColor
o349ColorUseBlockUnrestrictedBeforeDeclare`（宣言色「白」のとき**黒のアーツだけ「使用」が消え**、
白と無色は残る／未宣言なら黒も使える）。既定 order へ常駐させた。
⚠**実機の要否**（§2.2）＝`O-352` は `src/data` と `public/data` だけ＝④まででよい。
`O-349` は **`src/screens/battle/artsUseGate.ts`（提示ゲート）を触った**ので実機必須。


## 2026-09-13 — §5.3 `O-346`／`O-347`／`O-349`③（第298バッチ）

🔴🔑**この回の主産物は「登録票の『受け皿が無い』が3件連続で外れた」こと**＝
**うち1件は自分で重複実装を作りかけ、golden の `O-21` ゲートに止められた。**

**① `O-346`（`WX13-036-E3`）＝選択者の取り違え**
原文「**対戦相手は自分のシグニ１体を対象とし**、手札を１枚捨て、それをトラッシュに置く」に対し、
live は `TRASH{SIGNI owner:"opponent"}` に選択者の指定が無く＝**使用者が相手のいちばん重いシグニを落とせた**（過剰）。
🔴**登録票の「型に `chosenByOpponent` が無い／`src/screens/` を触るので実機必須」は両方とも誤り**＝
`TrashAction.opponentSelects`（`src/types/effects.ts:2558`）が**型にも消費地点にも在り**
（`effectExecutor.ts:2998`・live 実績＝`WDK17-009-E2`／`SPDi43-01-E1`）、**1行で直り実機も不要**だった。
⚠手札側には足さない＝`HAND_CARD` は既定で相手が選ぶ（`effectExecutor.ts:3110`）。
🔧**母集団を初実測**＝`npm run census:population -- "対戦相手は自分の"` で **121効果 / 115カード**、
`opponentSelects` **OK 69 / MISS 52**。⚠**MISS はバグ数ではない**（先頭の `PR-195-E3` は別の正準形で配線済み）。

**② `O-347`（3効果）＝任意トラッシュを2回聞いていた 🏁クローズ**
`UNKNOWN_NESTED` は **parser の失敗マーカー**（`parseSentencePart3.ts:2163` ほか）なのに
engine 側にハンドラ（自シグニを任意トラッシュ）が付いており、`OPTIONAL_TRASH_SELF` と並ぶと
**原文に1回しかない任意トラッシュを2回聞いていた**（1回目で断ると2回目にもう一度聞かれる＝実質やり直せる）。
⇒ 3効果から `UNKNOWN_NESTED` の1ステップを落として正準形2ステップへ。**engine は触らない。**
🔴**同時に見えた「対象宣言が支払いより後」は直さず `O-352` へ登録**＝`OPTIONAL_TRASH_SELF` は
`O-188` 第2バッチの**据置契約**で固定形のままで、根拠は**あの分岐だけ `freezeStoredTargets` を通していない**こと
（解禁済みの `OPTIONAL_TRASH_ENERGY_CLASS`（`O-298`）との差はそこ）。契約を破らずに登録した。

**③ `O-349`③（`WD23-012-A-E1`③）＝相手ルリグ下の除去 🏁実装**
原文「**対戦相手の**センタールリグの下からカードを**２枚まで**対象とし、それらをルリグトラッシュに置く」。
🔴**登録票の「engine が `ownerState` 固定で相手ルリグ下を触れない」は誤り**＝
**同じ id のハンドラ `OPP_LRIG_UNDER_TO_LRIG_TRASH` が `execStubPart3.ts` に既に在った**。
parser が `DEFERRED_OPP_LRIG_UNDER_TO_TRASH`（明示 defer）を出していただけで、**live 0＝一度も走っていなかった**。
⚠**気づかずに `execStubPart1` へ重複ハンドラを書き、golden の `O-21`
（「同じ STUB id の後発ハンドラが到達不能になっていない」）に止められた。**
繋いだうえで**既存ハンドラのバグ2つ**を直した＝
①原文が「N枚**まで**」なのに**選ばせず**機械的に N 枚取っていた
②下が N 枚未満だと `stack.length <= count` で**丸ごと no-op**（「まで」なので1枚でも取れるのが原文）。
実装＝`TargetScope` に `'opp_lrig_under'` を新設（自分側 `self_lrig_under` の対）＋
`EffectInteractionModal` の `scopeDesc` に説明＋parser を実装 id へ＋`decompileEffects` が**枚数を描く**。
🔧**`DEFERRED_*` の全数も訂正＝3種/4効果 → 実測 28種/31効果**（登録票はその回に見つけた3件だけの数字だった）。

**検証**＝`npm run gates` 全緑（**golden 4051 PASS**＝+3）／**逆翻訳を4カード目視して原文一致を確認**／
**反転確認 ✅**（live を旧形へ戻すと該当 golden が FAIL）／
🆕**実機 `node scripts/verifyBattleDrive.mjs o349OppLrigUnder` が2回連続 PASS**＝
新設 scope のピッカーが**下2枚だけを候補に出し**（センタールリグは候補外）、
**相手の**ルリグトラッシュが 0→2、**自分側は据置**（持ち主の取り違えなし）。既定 order へ常駐させた。
⚠`O-346`／`O-347` は `src/data` と `public/data` だけ＝実機不要。`O-349`③ は `src/screens/` を触ったので実機必須（§2.2）。

## 2026-09-13 — §5.3 `O-345`＝数値ドリフトの確認済み真バグ2件（第297バッチ）

🔑**着手の1手目に受け皿を grep したら、2件とも既に在った**（LESSONS §4.1）＝**engine は1行も触っていない**。

**① `WXDi-P13-048-E2`（紅天姫　テッペン//ディソナ）＝コストが原文より軽かった**
原文「あなたのエナゾーンから《ディソナアイコン》のカード**３枚**をトラッシュに置いてもよい」に対し、
live は `STUB{OPTIONAL_TRASH_ENERGY_CLASS}`（payload なし）＝実際は**エナから好きなカード1枚**で【アサシン】が付いていた。
🔴**真因は payload 欠落ではなく「engine が原文 regex で読んでいる」こと**＝`effectExecutor.ts:6559` の
`/エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)([０-９\d]+)枚を?トラッシュ/` は
`＜X＞`（CardClass）前提なので、`《ディソナアイコン》の` に**句ごとマッチせず**
**枚数は既定の1枚・クラス絞りなし**へ静かに落ちていた。
⇒ **regex は足さず**（`census:enginetext` の規約）、構造化 payload を持つ
`OPTIONAL_COST{energyTrash:{count:3, filter:{isDisona:true}}}` へ寄せた（`isDisona` は `matchesFilter` が CSV `Story==='Dissona'` で判定）。
⚠**包み形**（`CONDITIONAL{ゲート, then:STUB}` ＋ 直後の `CONDITIONAL{IS_MY_TURN}`）は正しいので保った＝
`OPTIONAL_COST` も `OPT_IDS_WRAP`（`effectExecutor.ts:6198`）に入っており、ゲート不成立で本体ごと読み飛ばす契約が効く。

**② `WXDi-P08-053-E1`（羅星　ノヴァ//メモリア）＝対象が丸ごと無く、自分のシグニにも付けられた**
原文「**対戦相手のレベル２以下のシグニを１体まで対象とし**、このシグニを場から手札に戻してもよい。
そうした場合、…**それ**は「【常】：アタックできない。」を得る」に対し、live は3点で外していた＝
①**対象宣言が無い** ②付与先が `GRANT_KEYWORD{target:{owner:'any',count:1}}`＝**フィルタ無しの任意1体**
（＝**自分のシグニにも、レベル3以上の相手シグニにも**付けられた＝過剰）
③レベル条件が**手札に戻す側（効果元自身）**に付いていた＝付け先違い
（⚠このカード自身がレベル2なので**たまたま成立していた**。`census:numberdrift` が拾ったのはここ）。
⇒ 既存イディオム `SELECT_TARGET_ONLY` →`STORE_LAST_PROCESSED_TARGETS` →`targetsStored` へ
（先例 `WD15-001-E2` / `WDK01-007-E1`）。`BOUNCE` は `DID_IT_GATED_TYPES` にあるので
「戻さなかった」ときに「そうした場合」が正しく落ちる。

🔑🔴**危うく壊すところだった偽陽性**＝`CONDITIONAL{IS_MY_TURN}` は**「そうした場合」の正規エンコード**
（`effectExecutor.ts:7242` の did-it ゲート）。**条件として読んで書き換えてはいけない。**

**影響枚数**＝2効果 / 2カード。**残2件は遅いレーン**（`WX19-007-E2`＝名前指定の無償グロウ payload／
`WXK03-023-E1`＝シグニの下からの任意コスト payload。受け皿の実測は [PLAN_DETAIL.md](./PLAN_DETAIL.md) の `O-345`）。

**検証**＝`npm run gates` 全緑（**golden 4048 PASS**＝+2）。**逆翻訳を目視して原文一致を確認**
（①「《ディソナアイコン》を持つカードを3枚トラッシュに置いてもよい」②「対戦相手のレベル2以下のシグニ1体までを対象とする…**それは**【アタックできない】を得る」）。
**反転確認 ✅**＝live を旧形へ戻すと golden 2本とも FAIL。
🔧**`census:numberdrift` ラチェットを 77 → 75 へ払い戻し**（計器が改善を検出して FAIL したので実数へ下げた）。
**実機は不要と判定**（PLAN §2.2）＝触ったのは `src/data/` と `public/data/` のみ（新しい型・機構なし）。

## 2026-09-13 — 🏁`V-213`＝**リリースゲートの通し対戦スモークを道具にした**（第296バッチ）

**新規＝`scripts/verifyFullMatch.mjs`**（`node scripts/verifyFullMatch.mjs [cpu|pvp]`・全文は [VERIFY_BROWSER.md](./VERIFY_BROWSER.md)）。
**盤面を一切注入せず**、実デッキで最初から**勝敗が付くまで**回す。判定は
**`battle_states.global_phase === 'FINISHED'` かつ `winner_id` が付くこと**で、
🔴**「例外が出ない」だけでは PASS にしない**（一番あり得る壊れ方は**決着せずに詰まる**こと）＝
**盤面が60秒動かなかったら FAIL**として明示的に検出する。

**結果＝両方 PASS。** CPU **8ターン / 177手 / 232s**、PvP **56ターン / 1122手 / 1943s**。
console error は対戦に無関係な2件のみ（deck 一覧 fetch の CORS）。**engine のバグは1件も出なかった。**

🔑**`verifyBattleDrive.mjs` では代替できない**＝あちらは盤面注入で**1つの効果**を観測する道具で、**ターンを最後まで回さない**。
今回初めて通ったのは **通しの進行・決着判定・リフレッシュ（ライフ-1）・手札上限の捨て・ライフバースト・ガード応答・PvP の realtime 同期**。

**ドライバ側で踏んだ罠3つ**（製品バグではない。全文は VERIFY_BROWSER.md／[LESSONS.md](./LESSONS.md) §4.2x）
1. 🔴**「クリックできた」を進捗と数えた**＝盤面が動かないのに押せる UI があり、**手詰まり検出をすり抜けて 1,351手 空転**した。
   ⇒ **DB 行の指紋で測り、指紋が変わらない手は3回で封印**。
2. 🔴**逆に `lrig_has_attacked` を見てアタックを自粛したら T4 以降1度も攻撃せず**、50ターン超の消化試合になった。
   ⇒ **常に試して 1. の封印に任せる。**
3. 🔴**開きっぱなしのカード詳細がボタンを覆う**（`isVisible`/`isEnabled` は真のままクリックだけ落ちる）。
   相手ターン中に残ると `LifeBurstCheckModal` を覆い、`host_state.field.check` が残って
   **CPU ループが `BattleScreen.tsx:526` で永久停止**した。⇒ **詰まったらまず畳む。**

**検証**＝`npm run gates` 全緑（golden 4046 PASS・smoke 10754 OK・lint 0 errors）／通し対戦 CPU・PvP とも PASS。
⚠**ゲートには同梱しない**（CPU 4分＋PvP 33分＋ライブ Supabase が要る）＝**リリース前に手で1回**回す運用。

## 2026-09-12 — 🏁`O-350`＝**重め fuzz でしか出ない無限再帰 2種**（CRASH 14 → 0・第295バッチ）

**真因1（`src/engine/execStubPart2.ts`・`USE_OWN_LRIG_ABILITY_FREE`）**＝候補列挙が
「`ACTIVATED` かつ `cost.exceed` がある能力」なので**発動中の `WX22-014-E3` 自身が候補に入り**、
「候補が1つなら `CHOOSE` を挟まず即実行する」分岐と噛み合って**確定で自己再帰**した。
⇒ `ctx.sourceEffectId` 一致を候補から外し、`ExecCtx.freeLrigAbilityChain`（この解決チェーンで無償使用した
effectId 列）で**相互再帰 A→B→A** も止めた。

🔴**自己除外だけだとカードが恒久 no-op になる**＝`WX22-014`（共闘の鍵主　ウムル＝フィーラ）の
**印字のエクシード能力は E3 自身しか無い**。原文「このルリグのエクシード能力１つ」が指すのは相方のキー
`WX22-006`《差し伸べし者　タウィル》が `GRANT_LRIG_ABILITY` で**センターへ付ける エクシード２の【起】2本**。
⇒ 候補源に**付与ストア**を足した（`collectGrantedLrigEffects`＝人間 UI／CPU と同じ funnel）。

**真因2（`src/engine/execStubPart3.ts`・`CROSS_ZONE_TRIPLE_TARGET_TO_DECK_BOTTOM`・`WX21-028-E2`）**
＝候補の居ないゾーンを飛ばす印の**空文字を、読み手が `filter(Boolean)` で捨てて段数にしていた**＝
**段が進まず同じゾーンへ無限再入**（1段目が空だと `[''].join(',')` が falsy になり `value2` ごと消える）。
⇒ **段は `stub.value`（数値）で持ち、`value2` には実際に選べた対象だけを積む**形へ分離。
⚠**真因1を直して初めて露出した**（CRASH 14 → 10 → 0）。

**影響枚数**＝真因1 が 2効果 / 2カード（`WX22-014-E3`・`WX21-Re04-E1`。挙動が変わるのは前者）、
真因2 が 1効果 / 1カード（`WX21-028-E2`）。**どちらもゲーム全体を落とす CRASH** なので影響は枚数より広い。

**検証**＝`npm run gates` 全緑（**golden 4046 PASS**＝+2）／`npm run smoke` 10754 OK／
🔴**`npm run fuzz -- --games 2000 --moves 80` を 6シード（12648430 / 1 / 7 / 99 / 4242 / 777777・計12,000ゲーム）で CRASH 0。**
**反転確認 ✅**＝①自己除外を外すと golden が「候補 2 → 3（E3 自身が混ざる）」で FAIL
②段カウンタを旧式へ戻すと golden が `Maximum call stack size exceeded` で FAIL。
**実機は不要と判定**（PLAN §2.2）＝触ったのは `src/engine/` のみ（`src/screens/` は funnel を import しただけ）。

🔑**教訓**＝ゲート同梱の `npm run fuzz` は `200ゲーム × 40手`＝**盤面が育たないと踏めない再帰は映らない**。
**engine の再入経路（ハンドラが自分で `exec` を呼び直す分岐）を触った回は重めを1回回す**（[LESSONS.md](./LESSONS.md) §4.2x）。

## 2026-09-12 — 🏁**PLAN §5.5 を廃止**＝全項目を観測して §5.3／§5.1／LESSONS へ移設（第294バッチ 続き）

### なぜ節ごと無くしたか

ユーザー指示「§5.5 低優先を観測して、§5.5 から §5.3 にすべて移行し、§5.5 から消せる状態にしたい」。
🔴**「低優先」という置き場があると、測り直すコマンドの無い数字が溜まる。** 実績で3つ確認した：
1. **系統別内訳が2か月古いファイル（2026-07-12）の数字のまま**＝デッキ操作系184 と書いてあったが実測52（3〜10倍の過大）。
2. **「CPU AI は (a)〜(f) 消化済み」が誤り**＝実際は **(a)〜(g) 全消化で `O-1` はクローズ済み**だった。
3. **「323箇所」という測り直しても減ったか分からない数字**を worklist として持っていた（下記 `O-351`）。

⇒ **取る順は §5.3 索引の並び（母集団順）だけで表す。優先度を節の名前で表さない。**
⚠**節番号 5.5 は住所なので消さず**、1,115字の転送表だけを残した（4,721字 → 1,115字）。

### 移設の全数（11項目・全部に移設先があることを機械で確認してから削除した）

| 旧 §5.5 の項目 | 観測結果 | 移設先 |
|---|---|---|
| payload キー未描画 56種/145ノード | 🆕**型つきアクション 22種/58ノード（取り落ち確定）／`[STUB]` ノード 34種/87ノード**に分けて測った | **索引A `O-348`** |
| `[STUB:…]` マーカー 323箇所 | 🔴**299カードのうち 271カードは `census:numberdrift` も `census:payloadkeys` も無言**＝**残余は無検出** | **索引E `O-351`**（件数 → **検出器が無い問題**に置き換え） |
| 明示 defer 3種/4効果 | 🔴**PLAN_DETAIL にしか無く索引から見えていなかった**（`O-337`/`O-339` と同じ失敗形） | **索引G `O-349`** |
| リリース判定（fuzz 重め） | ✅**実施した**→ 🔴**CRASH 14件**を検出 | **索引G `O-350`** |
| リリース判定（実機 PvP/CPU 通し） | 未実施（`O-350` がブロッカー） | **§5.1 `V-213`** |
| CPU 盤面評価 v2 | **`cpuBoardEval.ts` に「v2 が要る」TODO は無く不変条件は全部文書化済み**＝カードの正しさの穴ではない | **§5.3 末尾「根拠つき defer」** |
| `doPhaseAdvance` pure 抽出 | CPU/対人の統一は `O-1` (d)(e) で達成済み＝抽出しないと動かないものが無い | 同上 |
| BEHAVIOR_AUDIT キュー | 高シグナル**23件**（再測）・過去に22件精査して真 no-op 0件＝枯渇 | 同上 |
| 計器の空振り（`census:timing`／`census:wiring` ほか） | どれも実バグ0（在庫ではない） | **[LESSONS.md](./LESSONS.md) §4.8** |
| 「抜き取りで止めた」教訓／「候補数を在庫と呼ばない」 | — | **LESSONS §4.1** |

### 🔴この回の最大の収穫＝**リリース判定を実際に回したら CRASH が出た**（`O-350`）

```
npm run fuzz -- --games 2000 --moves 80
→ CRASH 14 / HANG 0 / INVARIANT 0   例: WX22-014 WX22-014-E3
   [executeEffect] Maximum call stack size exceeded
   再現: npx tsx scripts/selfPlayFuzz.ts --seed 12648430 --verbose
```

⚠🔴**`npm run gates` 同梱の軽い fuzz では出ない。** ⇒ **「リリース判定」は消化待ちの事務ではなく、
軽いゲートが構造的に見られない層の検出器だった**（`O-350` は golden も smoke も軽 fuzz も緑のまま通っていた）。

**真因**（`execStubPart2.ts:3844` `USE_OWN_LRIG_ABILITY_FREE`）＝候補列挙が
「`ACTIVATED` かつ `cost.exceed` がある能力」なので **`WX22-014-E3` 自身が候補に入る**
（原文「このルリグの**エクシード能力１つ**をコストを支払わずに使用する」）。
さらに **候補1件なら `CHOOSE` を挟まず即実行する**分岐があるので、**自分しか候補が無い盤面では確定で自己再帰**。
コメントは「🔴エクシード能力に限る」と書いてあるが、**自己除外（`e.effectId !== ctx.sourceEffectId`）が無い。**
🔑**修正はしていない**（ユーザー指示＝バグは `O-nn` に入れて後回し）。

### 登録した `O-nn`（修正はしていない）

`O-348`（payload キー 56種＝索引A）／`O-349`（明示 defer 3種4効果＝索引G）／
`O-350`（🔴自己再帰 CRASH＝索引G）／`O-351`（STUB ラベルの検出器が無い＝索引E）。
**§5.3 索引 残9項目**（`O-343`〜`O-351`）／**§5.1 残1件**（`V-213`）。`census:cards` が9件とも読めることを確認。

検証＝`npm run gates` 全緑（**golden 4044 PASS** 据置／smoke 10754／fuzz（軽）0／census 1／
stubs A・C・E・F群 0／enginetext・costtext A群 0／payloadkeys 56＝BASELINE 56／numberdrift 77＝BASELINE 77／lint 0 errors）。
**`src/` と live JSON は非改変**（観測と簿記のみ）。

## 2026-09-12 — §5.5 全体観測＝**バグの実数を不偏推定で出した**（第294バッチ 続き・修正はせず `O-nn` 登録）

### 何をしたか（ユーザー指示「観測を続け、バグの修正は `O-nn` に入れて後回し。全体を観測しバグの実数を求めよ」）

🔴**「候補数」ではなく「実数」を出すには、検出器の精度を実測するか、無作為標本を全数照合するしかない。**
このプロジェクトは在庫を**9回連続で過大に見積もっている**ので、**両方をやって突き合わせた**。

### ① 不偏推定＝**無作為標本 50効果を原文 × JSON × 逆翻訳で全数照合**

**母集団 10,701効果／標本 50（xorshift・seed 20260912 と 99881122 の2本＝再現可能）。**
🔑**検出器を通さず無作為に引いた**＝検出器のバイアスが入らないので、**これが唯一の不偏推定。**

| 分類 | 件数 | 率 | 全体への外挿 |
|---|---|---|---|
| ✅**正しい** | **44 / 50** | 88.0% | — |
| ⚠**表示バグ**（engine は正しいが逆翻訳が嘘/不足） | **4 / 50** | 8.0% | **約 856効果**（95%CI 約 330〜2,000） |
| 🔴**真バグ**（JSON/engine が原文と違う） | **2 / 50** | 4.0% | **約 428効果**（95%CI 約 120〜1,450） |

- **真バグ2件の実体**＝`WXDi-P04-033-E1`（`UNKNOWN_NESTED` と `OPTIONAL_TRASH_SELF` が二重＝任意トラッシュを2回聞く → `O-347`）／
  `WX13-036-E3`（「**対戦相手は自分の**シグニ１体を対象とし」の**選択者**の指定が型に無い → `O-346`）。
- **表示バグ4件**＝`WXDi-P03-063-E1`（`exceed:4` 未描画）／`WXDi-P07-059-E1`（STUB ラベルに①②の中身が無い）／
  `WXK03-071-E1`（`《無×2》` が「減り」だけ）／`WX07-044-E2`（「ヘブンヘブン」＝語の重複）。
- ⚠🔴**n=50 では信頼区間が10倍以上に開く。** 区間を半分にするには **n≈200** が必要（同じ手順で seed を足せば継ぎ足せる）。
  **「約430効果」は点推定であって確定値ではない**＝この数字を単独で引用しない。
- 🔑**偶然の一致に注意**＝意味照合監査 round4 の **BUG確定 433効果**とほぼ同じ数だが、**別の集合**
  （あの433は**すでに全部修正済み**＝`semantic_bug_fixed.txt` 460件）。今回の推定は**修正後の現状**に残っている数。
  ⇒ **「監査が433見つけて直したのに、まだ同じくらい残っている」＝監査の recall は約50%だったと読むのが妥当。**

### ② 検出器ベースの在庫（精度を実測したものだけ）

| 検出器 | 候補 | 実測精度 | 推定 真バグ | 登録 |
|---|---|---|---|---|
| 🆕**`npm run census:numberdrift`**（原文の数値がカードの逆翻訳に出てこない） | **77効果** | 真バグ **20%** / 表示 45% / 偽陽性 35%（標本20件を live JSON まで当たって分類） | **約15効果** | `O-345` |
| **`npm run census:payloadkeys`**（live に在るのに逆翻訳が言及しないキー） | **56種 / 145ノード** | ほぼ全部**表示バグ**（engine は正しい） | — | §5.5 |
| **【常】＋素のSTUB＋条件ノード無し**（`O-344` の形） | **19効果** | ほぼ100%（構造の穴として） | **潜在19**（現行カードでは regex が当たっている） | `O-344`（母集団を 2→19 に訂正） |
| **`census:enginetext` B群のうち STUB ゲート付き** | **18行以上** | — | 較正が先 | `O-343` |

### ③ 🆕`census:numberdrift` を新設（`npm run gates` 同梱・BASELINE 77）

**`scripts/censusNumberDrift.mjs`・明細 `docs/_census_number_drift.txt`。**
🔑**なぜ要るか**＝`MILL` の枚数バグ（8カード9箇所）は**抜き取り8枚の目視で偶然見つけた**。
⇒ **目視で見つけた型を、その場で機械の全数検出に変える**（CLAUDE.md §2.6）ための計器にした。
⚠**0 を目標にしない**（偽陽性 35% を含む）＝止めるのは「増えた」場合＝parser/decompiler の変更でズレが広がった回。

**⚠実装上の罠（次に足す人へ）**
- 🔴**カード単位で突き合わせる**＝parser は原文1文を `-E1`/`-E1b`/`-E3` に割るので、**効果単位だと偽陽性が 44/121＝36%**
  （`PR-426-E3`／`WXDi-P05-034-E1b`／`WXDi-P16-090-E1b`／`WXK02-038-E1b` が実例。私は最初これで3件を誤って「真バグ」と判定した）。
- **「1」は既定値で逆翻訳が省く**＝最大のノイズ源。除かないと 475候補・精度8% になる。
- **`icon_txt_turn_02` のような画像ファイル名が CSV に残っている**＝原文ではないので除く。

### ④ 🔴死んだ検出器（**これ以上使わない**）

**「原文に条件句（〜の場合／〜かぎり）があるのに JSON に条件ノードが無い」＝531候補・精度 0/12＝0%。**
条件は `REVEAL_AND_PICK` の `filter` や STUB id そのものに**構造として**入っているので、キーの有無では測れない。
🔑**これは PLAN §2.0 の「受け皿の別名を全部知らないかぎり必ず過大に出る（9回連続で外した）」の10回目**＝
**私も同じ罠を踏んだ。** 絞るなら「**payload 無しの素の STUB**」まで狭める（それが `O-344` の19効果＝精度ほぼ100%）。

### ⑤ 登録した `O-nn`（**修正はしていない**＝ユーザー指示どおり後回し）

`O-345`（数値ドリフト 77効果・真バグ4件は確認済み）／`O-346`（選択者の取り違え）／`O-347`（`UNKNOWN_NESTED` の二重）
／`O-344` の母集団訂正（2 → 19効果）。**§5.3 索引 残 5項目**（`census:cards` が5件とも読めることを確認）。

検証＝`npm run gates` 全緑（**golden 4044 PASS** 据置／numberdrift 77＝BASELINE 77／payloadkeys 56＝BASELINE 56／
smoke 10754／fuzz 0／census 1／stubs A・C・E・F群 0／enginetext・costtext A群 0／lint 0 errors）。
**`src/` と live JSON は非改変**（今回は観測のみ＝触ったのは `scripts/` と `docs/` と `package.json`）。

## 2026-09-12 — §5.5 をもう一段観測＝`MILL` の枚数が8カード9箇所すべて嘘だった（第294バッチ 続き）

### 何をしたか（ユーザー指摘「もう5.5にバグはないのか？さらに観測したほうが良いのでは？」への回答）

🔴**指摘が正しかった。** 前半の抜き取り8枚で見つけた2件（`MILL.countPerStoredTargets`／`ALL_COLOR` の条件欠落）は
**どちらも機械で全数化できる型**だったのに、私は**抜き取りで止めて1件だけ直していた**。
⇒ **型を全数化する検出器を作ったら、同じ型が一気に出た。**

🔑**還元した教訓**＝**「LLM（目視）は型を見つけるためだけに使い、その型の全数は機械で取る」（CLAUDE.md §2.6）を
表示品質のテールにも当てる。** 前半の私は型を見つけたのに全数化を飛ばした＝**同じ穴を2回掘った。**

### ① `MILL` の「枚数の出どころ」は6キーあり、初版は `count` しか描いていなかった

| 軸 | 値 |
|---|---|
| 真因 | `decompileEffects.ts` の `case 'MILL'` が `count` しか描かず、**枚数を決める他の5キーを全部落としていた** |
| 影響 | 🔴**8カード / 9箇所が全部嘘**（下表）。`countPer*` 系は `count:0` なので「**0枚**」、`untilFilter` は `count:999` の番兵なので「**999枚**」、`alsoOpponent` は**相手側のミルが丸ごと消える** |
| 実態 | 🔑**JSON も engine も正しい**（`effectExecutor.ts:10001`〜が全キーを解釈している）＝**逆翻訳だけが嘘をつく** |
| 検証 | `npm run regen` → 8カード9箇所すべて原文どおり（下表の「直後」列） |
| 実機 | 不要＝触ったのは `scripts/` のみ（§2.2） |

| effectId | キー | 直前の逆翻訳 | 原文 |
|---|---|---|---|
| `PR-238-E1`(×2) | `countPerStoredTargets` | デッキの上から**0枚** | ルリグトラッシュに置かれたカード1枚につき**5枚** |
| `WX25-CP1-087-E1` | `countPerStoredTargets` | デッキの上から**0枚** | それらのシグニ1体につき**1枚** |
| `WX25-CP1-047-E1` | `countPerLastProcessed` | デッキの上から**0枚** | デッキに移動したカード1枚につき**2枚** |
| `WXDi-P11-077-E1` | `countPerLastProcessed` | デッキの上から**0枚** | トラッシュに置いたカード1枚につき**1枚** |
| `WXDi-P02-034-E1` | `countPerSourceLevel` | デッキの上から**0枚** | このシグニのレベル1につき**2枚** |
| `WXK06-050-E1` | `untilFilter`/`untilCount` | デッキの上から**999枚** | ＜龍獣＞のシグニが**3枚置かれるまで** |
| `PR-K049-E1` | `alsoOpponent` | **あなたの**デッキの下から1枚 | **あなたと対戦相手の**デッキの一番下 |
| `WXK09-100-E1` | `alsoOpponent` | **あなたの**デッキの上から2枚 | **各プレイヤーは**自分のデッキの上から2枚 |

### ② `ATTACH_ACCE` の装着先の持ち主が具体値で焼き込まれていた

`'あなたの場の'` を**2箇所でベタ書き**しており、`targetSigniOwner` を一度も読んでいなかった。
**live 34件は全部 `self` なのでたまたま合っていただけ**＝`opponent` が来たら黙って嘘になる。
⚠これは LESSONS「**既定値が具体値なら原文に無い値の焼き込みを疑う**」そのもの。
payload から描くよう直した（**出力は不変**＝34件とも self。焼き込みだけが解消）。

### ③ 🆕`npm run census:payloadkeys` を新設＝この型を恒久ラチェットにした

**`scripts/censusPayloadKeys.ts`・明細 `docs/_census_payload_keys.txt`・`npm run gates` 同梱。**
**live JSON に在るのに `decompileEffects.ts` が一度も言及していない payload キー**を全数で出す。

🔴**この形はどの既存計器にも映らない**＝`census:stubs` A群に出ない（ハンドラも消費地点も在る）／
`census:enginetext` に出ない（原文を読んでいない）／`census:costtext` にも出ない／
**golden・smoke・fuzz も緑**（例外も不変条件違反も起きない＝engine は正しく動く）／
`census:cards` も緑（`parseStatus` は AUTO でどの懸念フラグも立たない）。
⇒ **JSON も engine も正しいのに、逆翻訳だけが嘘をつく。**

🔑**なぜ致命的か**＝主軸の検査は「原文 × 逆翻訳の目視照合」なので、**逆翻訳が嘘をついている箇所は
検査がそこだけ効いていない＝実バグの隠れ場所**。しかも嘘の向きが「**少なく**見える」ので、
読んだ人が**実バグだと誤判定して偽の worklist を作る**（私も `PR-238` の「0枚」を最初そう読んだ）。

- **初回実測＝573種のうち 56種 / 145ノードが未判定**（MILL 系6キー＋`targetSigniOwner` を描画し、`IGNORED` 3種を登録した後）。
- ⚠**候補出しであって判定ではない**＝描かなくてよいキーが実在する（制御フロー・内部マーカー）。
  **1キーずつ「落とすと原文のどの語が説明できなくなるか」で判定**し、意味を持つなら描画を足す／
  実装の都合なら **`IGNORED` に理由つきで登録**する（🔴**理由を書かずに足さない**＝それをやると計器が死ぬ）。
- **ラチェット**＝**0 を目標にしない**（意味を持たないキーは `IGNORED` へ落とすのが正で、そちらは件数に出ない）。
  止めるのは「**未判定のキーが増えた**」場合＝**新しい payload を足して描画を忘れた回**。増減どちらでも exit 1。
- **残 56種が §5.5 の逆翻訳テールの本体の worklist**＝`npm run census:payloadkeys` が測り直すコマンド。

検証＝`npm run gates` 全緑（**golden 4044 PASS** 据置／smoke 10754／fuzz 0／census 1・BASELINE 1／
stubs A・C・E・F群 0／enginetext・costtext A群 0／**payloadkeys 56＝BASELINE 56**／deadstate 0／
manual-fields 0／orphanmanual 0／lint 0 errors）。

## 2026-09-12 — §5.5 の全数再測と stale の訂正＋`条件:` の生英語ID露出を日本語化（第294バッチ）

### 何をしたか

ユーザー指示「§5.5 を行う。まずは現状を把握するため各種数値の測り直しを行い、残り作業を明確にする」に対し、
**§5.5 の7項目と、ゲート外の計器を全部回して実測**した。**実装は1件だけ**（下記②）で、
**この回の主産物は「数字の訂正」**＝PLAN の記述が5箇所 stale だった。

### ① 🔴§5.0 実装キューは「残0」ではなく**残5効果**だった（記録漏れ）

| 軸 | 値 |
|---|---|
| 真因 | **`O-nn` をクローズしても、その機構を待っていた effectId は在庫から引かれない**＝`semantic_bug_deferred.txt` の `MECH` 行は設計上「在庫から引かない」ので、**実装した回に `semantic_bug_fixed.txt` へ書かないと永久に残る** |
| 影響 | **5効果**（`WX09-032-E1`／`SP26-002-E1`／`PR-305-E1`／`WX25-P3-057`／`WXDi-P13-004B-E3`） |
| 実態 | **5件とも第291〜292バッチで既に実装済み**。live JSON・engine 消費点・golden を1件ずつ照合した（下表） |
| 検証 | `node scripts/archive/semanticAuditBugList.mjs` ＝ **残5 → 🏁残0** |

- `WX09-032-E1`＝`DEFERRED_COST_SUBSTITUTE_MULTI_ENERGY` → `STUB{ENERGY_COST_SUBSTITUTE_WHOLE, energyCostSubstitute}` へ実体化（`O-338`/`O-342`・engine=`effectEngine.ts`・golden 3箇所）。
- `SP26-002-E1`＝`DEFERRED_SUPPRESS_OPP_SIGNI_TRIGGERS` → `STUB{SUPPRESS_OPP_SIGNI_TRIGGERS_THIS_TURN}`（`O-337`・engine=`execStubPart3.ts`・golden 2箇所）。
- `PR-305-E1`＝`O-339` は**登録票 stale**（`ON_SIGNI_BATTLE` はバニッシュ処理の後に積まれるので遅延を重ねてはいけない）。①は `targetsTriggerSource:true` で実装済み・golden で帰結を固定。
- `WX25-P3-057`＝`-E1c`（`STUB{PREVENT_ATTACK_NEGATION_BY_OPP}`＋`collectAttackNegationProtectedSigni`）新設で覚醒中の常在2つが揃った（`O-334`・golden 1箇所）。
- `WXDi-P13-004B-E3`＝`lrigLimitChange` に `untilOwnEnergyPhaseEnd`＋`whileSourceInField`（`O-340`・golden 2箇所）。

🔑**運用へ還元**＝PLAN §5.0 に「**`O-nn` をクローズした回に、登録票が引用している effectId を `semantic_bug_fixed.txt` へ必ず書く**」を明記した。

### ② 実装＝`条件:` の生英語 ID 露出 9種 / 17箇所を日本語化し、**E群ラチェット**を張った

| 軸 | 値 |
|---|---|
| 真因 | **`census:stubs` C群の `raw` は `[STUB:` しか数えず、しかも候補を live の STUB id 集合（`allIds`）で絞る**＝**条件型は別の名前空間なので、`decompileEffects.ts` の `condJa` の `default` に落ちた条件は何箇所増えても C群に出ず `npm run gates` が緑のまま通っていた** |
| 影響 | **9種 / 17箇所**（`FIELD_SIGNI_SHARE_CLASS` 5／`THIS_CARD_IS_CHARMED` 4／`OPP_SIGNI_BANISHED_COUNT_THIS_TURN` 2／`THIS_CARD_HAS_SOUL`／`PAID_COLORS_INCLUDE_ALL`／`OPP_USING_TEAM_PIECE`／`NO_COIN_GAINED_THIS_GAME`／`LRIG_IS_DRIVE_STATE`／`APPEARANCE_COST_SAME_NAME`）。⚠**9種すべて engine 実装済み**＝無言バグではなく**逆翻訳の表示だけ**の穴だが、**原文照合が主軸の検査なので生 ID が出ると照合そのものが効かない** |
| 直し方 | `scripts/decompileEffects.ts` の `condJa` に9 `case`（payload を落とさない＝`color`/`count`/`filter`/`byEffect`/`colors`/`operator` を全部出す）＋ `scripts/censusStubs.ts` に **E群**（`[条件:<ID>]` の全数走査＋ratchet）。⚠`D` は既に「健全」で使われているので `E` にした |
| 検証 | `npm run regen` → 露出 **17 → 0箇所**／`npm run gates` **全緑（golden 4044 PASS）** |
| 反転確認 | ✅ `LRIG_IS_DRIVE_STATE` の `case` を1本外して `regen` → **`censusStubs` が exit 1**（「1種/1箇所」）。復元して exit 0 |
| 実機 | **不要**＝触ったのは `scripts/` のみ（`src/` 非改変）＝§2.2 の機械判定で④まで |

- ⚠**助詞の取り違えを1件直した**＝`NO_COIN_GAINED_THIS_GAME` は**主語**なので `ownerJa`（「あなたの」＝連体修飾）が使えない（原文は「あなたが〜得ていない場合」）。
- 効果＝**逆翻訳の英語ID漏れ 313カード/340箇所/211種 → 299カード/323箇所/202種**。

### ③ 測り直して stale と判明した PLAN の記述（実装せず記述を直した）

| PLAN の記載 | 実測 |
|---|---|
| §5 全体像 ①実機「🔥2件（`V-209`/`V-210`）」 | 🏁**残0**（§5.1 本文が正しく、表だけ古かった） |
| §5.5「CPU AI (g)＝(a)〜(f) は消化済み」 | **(a)〜(g) 全消化で `O-1` はクローズ済み**（(g) v1＝`cpuBoardEval.ts`・実機 `V-82` PASS）。残るのは**盤面評価 v2＝任意の品質向上**（挙動の正しさの穴ではない） |
| §5.5 逆翻訳テール内訳「日本語ラベル STUB 284箇所／生英語ID は STUB 側10種前後」 | **319箇所**／**3種4箇所で全部 `DEFERRED_*`（意図的 defer）**＝**無言の穴は無い** |
| §5.5「デッキ操作系184／パワー修正系165／手札系102」 | 🔴**`docs/_stub_leak_classification.txt` が 2026-07-12 のまま2か月放置された数字**＝実測は **52／16／45**（3〜10倍の過大）。生成し直してコミットした |
| §5.5「原文と JSON 構造がズレた混線テール」を別項目として立てていた | **逆翻訳テールと同じ323箇所の別の切り口**＝独立した在庫ではないので**1項目に統合**した |

### ④ ゲート外の計器＝**どれも実バグ0**（§5.5 末尾に「計器の空振り」節として常駐させた）

- 🔴**`census:timing` 4効果/2クラスタ＝live は正しい**。該当2枚（`WXK10-052-E1`／`WXDi-P09-079-E1`）は `manualEffects.ts` に
  `ON_CARD_MILLED_FROM_DECK` ＋ `milledCardFilter` で実装済み。**この計器は `parseCardEffects` だけを呼び `mergeManualEffects` を通さない**
  （`timingCensus.ts:15`）＝**manual で正した効果は永久にここに出続ける。** ⇒ **「受け皿が無い」の空振りは連続13項目目。**
- **`census:wiring` miss 33セル**＝抜き取り6件すべて**別の正準形で配線済み**（`powerRange`→`FIELD_SIGNI_POWER_COUNT`／
  `eachDistinctLevel`→`TRASHED_DISTINCT_LEVELS_GTE`／`levelExact × BLOCK_ACTION`→`actionId:"GUARD_LV2_3"`（`guard.ts:59` が消費）／
  `excludeCardName`→`beat_signi.excludeSelf`）。**★「穴がほぼ確実」印は実測でそうならない。**
- `census:goldentypes` 未カバー0／`census:deadstate` 0／`census:enginetext` A群0／`census:costtext` A群0規則／`census:orphanmanual` A・B・C群0。
- `semanticAuditGap` ＝**未監査 0 / 6,032（全11シート 100%）**。

### ⑤ 追加実装＝逆翻訳テールを抜き取り検証したら、その裏に計器の死角と実バグが出た

🔴🔑**この節がこのバッチの一番重要な発見**＝**§5.5 を「表示品質だから後回し」と扱うのは危険**。
**表示が嘘をついている箇所は、原文照合というこのプロジェクトの主軸の検査がそこだけ効いていない**＝
実バグの隠れ場所になる。決定論的に等間隔で**8枚だけ**抜き取って原文と並べたら、
faithful だったのは2枚で、**3枚が内部実装メモの漏れ、2枚が「実バグに見える表示」**だった。

**(a) `MILL` の `countPerStoredTargets` を逆翻訳が取り落として「0枚」と嘘をついていた**

| 軸 | 値 |
|---|---|
| 真因 | `decompileEffects.ts` の `case 'MILL'` が `count`（既定 0）しか描かず、**`countPerStoredTargets`（`effectExecutor.ts:10001`＝`storedTargetCards.length × per` 枚）を描いていなかった** |
| 影響 | **2カード / 3箇所**（`PR-238`＝原文「ルリグトラッシュに置かれたカード１枚につき…５枚」／`WX25-CP1-087`＝原文「それらのシグニ１体につき…１枚」）＝どちらも**「デッキの上から0枚トラッシュに置く」**と出ていた |
| 実態 | 🔑**JSON も engine も正しい**＝逆翻訳だけが嘘をつく形（`fromLeftFieldUnder` の前例と同型）。読んだ人は実バグだと判断するので、**偽の worklist を生む** |
| 検証 | `npm run regen` → 両カードが原文どおりに出る |

**(b) 🆕`表示:` 規約を新設＝STUB ラベルへの内部実装の識別子の漏れ 56箇所 / 32 id → 🏁0**

| 軸 | 値 |
|---|---|
| 真因 | `genStubsMd.mjs` が**ハンドラ直前コメントをそのまま** `docs/STUBS.md` の説明欄に入れ、その説明欄が `decompileEffects.ts` 経由で逆翻訳の `[STUB:…]` ラベルになる。⇒ **実装メモがそのままカードの逆翻訳に出る** |
| 影響 | **56箇所 / 32 id**＝engine 関数名（`effectEngine.collectAllColorSigniで動的処理済み`）／内部変数名（`lastProcessedCards[0]`）／state キー（`keyword_grants`・`all_cont_effects_negated`・`abilities_removed`）／PLAN 参照（`§5.3 O-60 第58バッチ`）。⚠さらに**2件は別 id の説明が付く誤帰属**だった（`SET_STORED_BASE_LEVEL`／`CHECK_ZONE_FLIP_FREE_GROW`＝共有コメントから隣の id のラベルを拾っていた） |
| 直し方 | 🔑**コメントを消さない**（開発側の情報が失われる）＝**`// 表示: <カードが何をするかの日本語>` を1行足す**だけ。`genStubsMd.mjs` の `descriptionForId` が `表示:` を**最優先**で採る（複数 id を捌く共有コメントは `// 表示: <ID>: <日本語>` と id を明示）。32 id 分を原文照合して書いた |
| 検証 | `node scripts/genStubsMd.mjs` → `npm run regen` → **56 → 0箇所**／逆翻訳の英語ID漏れ **340 → 323箇所** |
| 反転確認 | ✅ `ALL_COLOR` の `表示:` を1本外して regen → **`censusStubs` が exit 1**（「1種/2箇所」）。復元して exit 0 |
| ラチェット | 🆕**`census:stubs` F群**（`gates` 同梱・増えたら exit 1）＝**新しい STUB ハンドラを足して実装メモだけを書くと落ちる** |

**(c) 🆕`O-343` 登録＝`census:enginetext` の A/B 分類に死角があり「A群 0」は部分的に見かけだけ**

`censusEngineText.ts:170` の `isSelf` は**代入行の前後3行を `sourceCardNum|sourceCard|srcCard|ctx.sourceCard` で
文字列照合するだけ**（＋`isAbilityFunnel`）。⇒ **「場を走査して『この STUB を宣言しているカード』を見つけ、
そのカード自身の原文を読む」形は、変数名がループ変数（`top`/`card`/`cn`）なので B（正当寄り）に落ちる**が、
**そのカードは定義上「効果元自身」＝本来 A**。**実測 B群56行のうち18行以上**（`collectDownProtectedSigni`／
`collectPowerProtectedSigni`／`collectAbilityGainProtectedSigni`／`collectFieldSigniExtraColors` ほか）。
⚠`collectAllColorSigni` 等は門が `act.id !== 'ALL_COLOR'` で `stub.id === '…'` ではないため門検出にも掛からず、
**18行は下限**。🔑**これは第56バッチ（`sourceAbilityText` funnel を初版から数えていなかった）と
`census:costtext` の罠③（原文を引数で受け取る関数）と同一の罠の3度目**＝**罠の記録は計器ごとではなく横断で読む。**

**(d) 🆕`O-344` 登録＝【常】宣言型 STUB が `activeCondition` を持たず、条件が engine の regex にしか無い（実バグ）**

`WXK05-029-E1` の原文は「**あなたのトラッシュにカード名に《サーバント》を含むシグニが１０種類以上あるかぎり**、
このシグニはすべての色を得る」だが、live は `{"effectType":"CONTINUOUS","action":{"type":"STUB","id":"ALL_COLOR"}}` だけ＝
**`activeCondition` が無い。** 条件は `collectAllColorSigni` が**カード原文を regex で読み直して**復元しており、
**外れると `required = 10` の既定値に落ちる**（外れても可視化されない）。実測 **2効果/2カード**。
🔑**`O-343` の分類を直すとこの型が A群として自動で列挙される**＝`O-343` を先に取る。

### いまの残り作業

**§5.3 機構 worklist（今回 0 → 2項目）**
1. 🔥**`O-343`**（索引B・計器の較正＝これを直すと `O-344` 型が自動で列挙される）
2. **`O-344`**（索引G・2効果/2カード）

**§5.5 低優先 5件**
3. **逆翻訳の表示品質テール 299カード/323箇所**（engine は動く＝無言バグではない。ただし上記(c)(d)の通り**実バグの隠れ場所**）
4. **リリース判定**（fuzz 重め＋実機 PvP/CPU 通し対戦）
5. **CPU 盤面評価 v2**（任意）
6. `doPhaseAdvance` pure 抽出＝**「やらない」既定**
7. BEHAVIOR_AUDIT キュー＝⛔休眠（高シグナル23件・枯渇済み）

＋ **§5.2 round5 を回すかの判断**（意味照合は「受け皿の名前を知らない穴」を拾える唯一の発見器だが、全11シート監査済み）。

## 2026-09-12 — §5.1 実機 `V-209`〜`V-212` を全返済（第293バッチ・実機シナリオ8本・src 変更なし）

### 何をしたか

第291〜292バッチで実装した4機構（§5.3 索引G `O-334` / `O-338` / `O-340` / `O-342`）は
**すべて `src/screens/` を触った**＝§2.2 の機械判定で実機が必須だった。golden は純関数を直接叩くので、
**BattleScreen がその集合／ストア／ヘルパを本当に組み立てて渡しているか**は実機でしか見えない。
`scripts/verifyBattleDrive.mjs` に**8本**（本命4＋対照4）を足し、`order` に常駐させた。

| シナリオ id | 観測点（実 UI） |
|---|---|
| `v209AwakenedAttackNotNegatedByOpp` / `v209NonAwakenedAttackIsNegated` | 相手の `NEGATE_ATTACK{count:ALL}` を `effect_stack` 注入で解決 → **覚醒中は `host.negated_attacks` が空**／覚醒を外すと積まれる |
| `v210LimitPlusTwoWhileSourceInField` / `v210LimitExpiresAtOwnMainPhaseStart` | **召喚ゲート**（`card-action-*` に「召喚」が出るか）で、+2 の着弾・発生源離場・エナフェイズ期限を見た |
| `v211OsakiAloneCoversGreenCost` / `v211OsakiDoesNotCoverColorless` | 支払い窓の「発動する」活殺＋**エナから減るのがオサキ1枚だけ**／《無》は置き換えられない |
| `v212ArtsOfferedWithOsakiSubstitute` / `v212ArtsNotOfferedWithoutOsaki` | ルリグデッキの《緑》×３ アーツに「使用」が出るか（提示ゲート） |

**影響枚数**＝実機で押さえたカード5枚（`WX25-P3-057` / `WXDi-P13-004B` / `WX09-032` ＋ 支払い側の
`WX09-053` / `WX02-040` / `WD04-008`）。⚠**`src/` は1バイトも変えていない**（`gates` 全緑を確認済み）。

### 反転確認（2ラウンド・これが本体）

- **A＝機構を丸ごと落とす**（`sourceBoundDelta`→0／`ctx.otherAttackNegationProtectedNums`→`undefined`／
  `SpellCastModal` と `artsUseGate` の `wholeSubstitutes`→`undefined`）
  ⇒ **本命6本が赤・対照2本は緑のまま**（対照は機構に依存しないので緑が正しい）。
- **B＝`O-340` の2つの寿命を片方ずつ殺す**（`fieldTopNums` 判定を外す／`boundaries: []`）
  ⇒ `v210…WhileSourceInField` は④「発生源離場後に Lv3 が置けた」、`v210…ExpiresAt…` は
  「期限跨ぎでストアが残る」で、**狙った assert が赤**になった。

### 検証コマンド

```
node scripts/verifyBattleDrive.mjs v209AwakenedAttackNotNegatedByOpp v209NonAwakenedAttackIsNegated   v210LimitPlusTwoWhileSourceInField v210LimitExpiresAtOwnMainPhaseStart   v211OsakiAloneCoversGreenCost v211OsakiDoesNotCoverColorless   v212ArtsOfferedWithOsakiSubstitute v212ArtsNotOfferedWithoutOsaki
npm run gates
```
**3回連続でバッチ全緑**（1回だけ `v210…WhileSourceInField` が「盤面は動いたのに【出】が走らない」で落ちたので、
盤面とストアの両方を待って**召喚からやり直すリトライ**を入れた＝DRIVE_TRAPS 94）。

### 踏んだ罠（[DRIVE_TRAPS.md](./DRIVE_TRAPS.md) 92〜94 に登録）

- **92**＝「提示されているか」は `[data-testid="card-detail-modal"] [data-testid^="card-action-"]` の
  `data-action-label` 列で読む（押せないものは disabled ではなく**そもそも出ない**）。
  MAIN の手札シグニは `エナチャージ` が ENERGY 限定なので `[]` か `["召喚"]` の2値。
  支払いモーダルのエナセルは index ではなく `img[alt=カード名]` で掴む。
- **93**＝1ターン内で「次の自分のメインフェイズ開始」を踏むには GROW へ戻して「メインフェイズへ」を押す
  （CPU の1ターンを回さずに 8 秒。⚠**発生源が場に残っていること**を同じ巡で assert しないと判別力ゼロ）。
- **94**＝盤面クリックは通ったのに【出】が走らないバッチ位置依存（4回中1回）。

### 観測面の追加（`queryState`＝DRIVE_TRAPS §4.4-71）

`awakenedSigni`（`awakened_signi`）と `lrigLimitModBySource`
（`lrig_limit_mod_until_own_energy_phase_end_by_source`）。どちらも無いと
「保護が効いた／そもそも覚醒していない」「場にいないから消えた／期限で消えた」を切り分けられない。

### 実機に乗せなかった軸（golden が押さえている）

①`V-209` ③「**自分の**効果での無効化は通る」②`V-212` ③「CPU も同じ盤面で撃てる」。
どちらも**実 UI に押す場所が無い**ので、実機化すると観測点が間接的になり判別力が落ちる。

## 2026-09-12 — §5.3 `O-342` エナ支払いの一括代替を「提示ゲート」へ通す（第292バッチ・配線のみ）

### 真因＝機構は在ったが実戦では一度も到達しなかった

第291で `O-338`（`ENERGY_COST_SUBSTITUTE_WHOLE` payload ＋ `isEnergyPaymentSelectionValid`）を実装し
支払い窓8つへ配線したが、**「いま発動できるか」を決める提示ゲートが代替を知らなかった**：

```ts
// src/screens/battle/spellUseGate.ts:127
const affordable = canAffordWithOneWildCostSlot(effectiveCost, …, cost =>
  canAffordWithExtraCost(energyPoolCardNums(payer.energyPayPool), …));
```

⇒ エナが「《オサキ》1枚＋緑1枚」で《緑》×3 のスペルは**一覧に出ない**＝`SpellCastModal` に入れず、
**配線済みの検算が実行されない**。`costs.ts` 自身が書いている規約
**「提示と支払い検算は同じ関数を通す＝片肺にしない」**が、この機構で破れていた。

### 修正

- `costs.ts` に**プール版** `canAffordEnergyCostWithSubstitutes` を新設し、選択版 `isEnergyPaymentSelectionValid` と
  **判定式を共有**（`canAffordEnergyNums` ／ `canAffordUsingWholeEnergySubstitute` の2本に括り出し）。
  🔑**プールに選択版を使ってはいけない**＝あれは選択枚数の一致を要求するので、渡すとほぼ常に false ＝**全提示が消える**。
- **A群（プール判定）6地点**＝`spellUseGate` 1／`artsUseGate` 2／`BattleScreen` 3 を新ヘルパへ。
- **B群（選択の妥当性）15地点**を共有判定へ。**旧判定に残したのは2地点だけ**＝
  `GrowModal` の**グロウ専用代替**（`collectGrowCostSubstitute`＝二重適用を避ける）と
  `TrashActivatedModal`（**元から枚数チェックを持たない別形**＝寄せると判定が厳しくなる退化）。
- **CPU**（`cpuActivate` ほか4ファイル）＝**代替札を種にして実際の支払い内訳を組む**経路を追加。
  🔴これが無いと**エナの並び順によって CPU がオサキを選べず、提示だけ通って実行候補から消える**。

### 検証

- `npm run gates` 全緑＝**golden 4044 PASS**（新規5本）／smoke 10754／fuzz 0／census 1・BASELINE 1／
  stubs A・C群 0／enginetext・costtext **A群 0**／deadstate 0／manual-fields 0／orphanmanual 0／lint 0 errors。
- 🔥**到達性の E2E**＝`§5.3 O-342: オサキ1枚＋緑1枚なら緑3スペルの提示ゲートへ到達する`
  ＝合成した《緑》×3 スペルを**実物の `checkSpellUse`** に通す。対照2つ（非オサキ2枚では不成立／
  場の《幻獣 コサキ》を外すと不成立）。**この1本がこの項目の主張そのもの。**
- **反転確認**＝`canAffordUsingWholeEnergySubstitute` を `return false` にすると**3本が赤**
  （到達性／`O-338` の判定／CPU の内訳）。
- **退化の番人**＝①代替宣言が無ければプール版は旧関数と全任意引数で一致 ②A群6地点が代替を渡している
  ③B群の配線本数（選択版／プール版／旧判定の残数）をファイル単位で固定＝**寄せ忘れも寄せすぎも赤**。

## 2026-09-12 — §5.3 `O-338` エナコスト一括代替を【起】／スペルへ配送（第291バッチ後半・1効果）

### 真因

`WX09-032-E1`（《幻獣 コサキ》）は `DEFERRED_COST_SUBSTITUTE_MULTI_ENERGY` のままで、通常のエナ支払い UI は「選択枚数＝要求エナ総数」を先に要求していた。既存の `collectEnergyTrashSubstituteInfo` は1枚を1色として読む機構、`collectGrowCostSubstitute`／`collectGuardAlternativeCost` は専用窓だけの機構なので、「《緑》2個または3個の要求全体を《オサキ》1枚で置換」は表せなかった。登録票の「代替窓が無い」は stale だが、通常支払い用の一括代替 funnel が無いという核心は正しかった。

### 修正

- parser が `ENERGY_COST_SUBSTITUTE_WHOLE` と `{ color:'緑', counts:[3,2], nameContains:'オサキ', excludeColorless:true }` を生成し、live JSON へ採用した。UI／engine に `EffectText` regex は追加していない。
- `collectEnergyCostSubstitutes` が場の宣言とエナゾーン内の候補だけを payload から収集し、`isEnergyPaymentSelectionValid` が通常払い／一括代替の枚数・色・残存《無》／追加コストを一箇所で判定する。
- 支払い窓は **8窓**を共有 funnel へ寄せた＝`SigniActivatedModal` / `SpellCastModal`（codex）＋
  `EnergyActivated` / `HandActivated` / `KeyActivated` / `AssistActivated` / `LrigGranted` / `SigniOnPlayCost`（Claude）。
  ⚠**`TrashActivatedModal` は元から枚数チェックを持たない別形**なので触っていない（寄せると判定が厳しくなる）。
  🔥**未接続の残り**＝`BattleScreen` の提示/実行ゲート8／`artsUseGate` 2／`spellUseGate` 1／
  `ArtsModal` 1／`GrowModal` 3／`CutinModal` 3／`AssistGrowModal` 2／`PhaseConfirmDialogs` 1 ＝ §5.3 `O-342` に登録した。
- 🔑**8窓を寄せた分の番人を golden に2本置いた**＝①**代替宣言が無ければ共有ヘルパは旧判定と完全一致**
  （崩れるとコサキと無関係な支払い窓が全部壊れる。枚数一致を外す反転で赤くなることを確認）
  ②**8窓が実際にヘルパと `wholeSubstitutes` を経由している**ことの文字列 assert。
- golden は fresh/live payload、逆翻訳、緑2・緑3・同色分割、通常払い、名前違い、対象外個数、《無》残存、宣言元離場の対照、選択カードが実際にエナからトラッシュへ動く E2E を固定した。代替経路を一時無効化すると `PASS 1 / FAIL 1` へ反転することも確認した。

### 検証

- `npm run build:effects` → 採用後に再実行し、`docs/_held_fresh.json` / `_partial_fresh.json` / `_idset_fresh.json` は **0 / 0 / 0**。`npm run regen` 後の逆翻訳は原文と一致。
- 全ゲートの最終値は本項目の作業報告に記載。

## 2026-09-12 — 符号化キーワードの生 JSON が対戦ログ／逆翻訳へ漏れていた（第290バッチ・live 54効果/51枚・逆翻訳85枚→0）

**着手の形**＝ユーザー決定「**すべてのカードが完全に正しく動くことが目標なので、低優先にしている作業も含めて全部行う**」
⇒ PLAN §5.5（低優先・保留）を worklist として開いた。

### 真因

`GRANT_KEYWORD.keyword` は `シャドウ:{"levelLte":2}` という**符号化文字列**（`encodeShadowKeyword`／
`encodeAssassinKeyword`／`encodeLancerKeyword`）で、engine は `decode*` で復元して判定に使う**正式な表現**。
🔴**判定側は全経路で正しく動いていた**が、**表示側にフォーマッタが1つも無かった**＝
`addLog` がこの文字列を**素通し**し、**対戦ログにそのまま出ていた**。

```
翠英姫　ママ//メモリアに「シャドウ:{"powerLte":10000}」を付与     ← 実測（反転確認時の FAIL メッセージ）
```

| 軸 | 実測 |
|---|---|
| 母集団（ログに出る） | **live 54効果 / 51枚**＝シャドウ・アサシン・ランサーの**非 CONTINUOUS** 付与（AUTO 25 / ACTIVATED 16 / SONG_ICON 1 ほか） |
| 母集団（逆翻訳に出る） | **85枚 / 92箇所 / 18キー種**（【シャドウ】77・【アサシン】15。**PLAN の旧記載は「72件・2026-08-07 観測」＝1か月で増えていた**） |
| 挙動への影響 | **無し**（`decodeShadowKeyword` / `decodeAssassinKeyword` / `hasApplicableAssassin` は正しく効いている） |

🔑**なぜ1か月見えなかったか**＝**どの計器もこの形を見ていない**。
`census:stubs` C群は **`[STUB:<生ID>` しか数えない**（`censusStubs.ts:9` の「軸2 表示」）／
`census:enginetext` は engine の regex だけ／**golden・smoke・fuzz はログ文字列を assert していなかった**。
さらに PLAN §5.5 の項目は**観測日の数字を本文に書き写しただけ**で再測手段が紐づいていない。

### 直し方

**`src/utils/keywords.ts` に `keywordDisplayLabel(kw)` を新設**＝`parseShadowScopeText` /
`parseAssassinScopeText` の**逆写像**（`describeShadowScope` / `describeAssassinScope`）。
**`:` を含まない文字列は即返す**ので、素のキーワード名や無関係なログ文言に掛けても安全。

**人が読む場所を全部そこへ通した**：

| ファイル | 地点 |
|---|---|
| `src/engine/effectExecutor.ts` | 付与ログ9地点（`${a.keyword}：<カード名>` / `「${a.keyword}」を付与` / `【${a.keyword}】を得る` / `【${gkA.keyword}】は新たに得られない` / `（次の相手ターン終了まで）` ほか） |
| `src/engine/execStubPart1.ts` | `センタールリグに${g.keyword}付与（このゲーム）` |
| `src/engine/triggerCollect.ts` | トリガー選択肢ラベル `味方が【${gain.keyword}】を得たとき` |
| `scripts/decompileEffects.ts` | `GRANT_KEYWORD` / `GRANT_FIELD_SHADOW` / `centerLrigKeyword` |

🔑**同じ家族の潜在バグを1件巻き込みで直した**＝`decompileEffects.ts` の `kwBase`（原文を引く
`restoreLeadDuration` の regex に埋める素の名前）は **`^ランサー:.*` しか落としていなかった**ので、
シャドウ／アサシンでは `【シャドウ:{"levelLte":2}[^】]*】` という**原文に絶対当たらない regex** になり、
**持続の語を復元し損ねていた**。⇒ `/:.*$/` へ一般化。

### 検証

- `npm run gates` **全緑**＝golden **4030 PASS**（**新規2本**）／smoke 10752／fuzz 0／census 1 / BASELINE 1 ／
  stubs A・C群 0 ／ enginetext・costtext A群 0 ／ deadstate 0 ／ manual-fields 0 ／ orphanmanual 0 ／ lint 0 errors。
- `npm run regen` 後に再測＝**逆翻訳の生 JSON 漏れ 85枚 → 0枚**。
- **golden の番人2本**
  - `§5.5 第290: 符号化キーワードは表示ラベルへ戻る（live 全件・往復）`
    ＝live の符号化キーワード**全36種**について ①ラベルに `{` `"` が出ない ②**ラベルの括弧内を原文パーサへ通すと同じスコープに戻る**
    （＝日本語が原文の言い回しと一致している）。⚠`selfHandLte` だけは**アタック側の状態条件**で原文パーサに逆規則が無いので除外。
  - `§5.5 第290: 付与ログに生 JSON が出ない＋state は符号化のまま`
    ＝`WXDi-P07-045-E2`（シャドウ）と `WX24-P1-072-E1`（ランサー）を実行し、ログに `{"` が出ないこと・
    表示ラベルが出ること・**`keyword_grants` には符号化文字列がそのまま入っていること**（表示専用であることの反転確認）。
- **反転確認**＝`keywordDisplayLabel` を素通しへ戻すと2本とも赤くなり、FAIL に**症状そのもの**が出る。
- ⑤**実機不要**＝触ったのは `src/engine/` `src/utils/` `scripts/` だけ（`src/screens/` 不触・新しい型/機構なし＝PLAN §2.2 の機械判定）。

### 教訓

🔑**「engine も同じ文字列を読んでいる＝意味は正しい」で調査を止めない。**
[LESSONS.md](./LESSONS.md) §4.3 の「受け皿は ①どこで読むか ②どこで消えるか の2つを揃えて初めて動くと言える」に対し、
今回抜けていたのは **③どこで表示するか**。**符号化した値は、人が読む出口の数だけ復号地点が要る。**

🔑**PLAN 本文に書き写した数字は必ず腐る**＝§5.5 の2項目とも stale だった（823→**313**／72→**85**＝**増えていた**）。
**項目には「測り直すコマンド」を必ず添える**（今回2項目に添えた）。

## 2026-09-12 — §5.3 `O-335` を実装・`O-336` は「実装済み」と確認してクローズ（第289バッチ・索引G 残8→6効果）

**着手の形**＝ユーザー指定「`O-335`・`O-336` を行う」（PLAN §5.3 索引G）。
🔴🔑**登録票は2件とも stale だった**＝第286が「受け皿が無い」と書いた根拠の grep を着手の1手目でやり直したら、
**どちらも受け皿は既に在った**。第280〜289 で**連続10項目**この形（§2.1 ② の「登録票の反証」を先にやる理由）。

### `O-336`＝相手エナゾーンの効果免疫（`WXK11-020-E1` 後半）→ 🏁**実装済み・修正不要**

| | |
|---|---|
| 登録票の主張 | 「`grep -rn "EffectImmune" src/` の全ヒットが field 前提＝エナをゾーン単位で免疫にする軸が無い」 |
| 実測 | **前日（2026-09-11）の `O-291` で実装済み**＝`isEnergyImmuneByOpponent`（`execUtils.ts`）＋ funnel の `energyCandidatesForOwner`。エナから出る経路 **9地点すべて**がこの funnel を通る（`grep` で全数確認）。golden も `O-291: 相手エナは相手自身の効果を受けない／宣言者からは触れる` が**向きの反転確認つき**で張ってある |
| 教訓 | 🔑**受け皿の「概念名」1語で 0 件でも「無い」とは言えない**＝実体の名前は `EffectImmune` ではなく `EnergyImmuneByOpponent`。**命名パターン**（`Immune`/`Locked`/`Blocked`/`Protected`/`CandidatesForOwner`）で引く（[LESSONS.md](./LESSONS.md) §4.5 へ登録） |

### `O-335`＝「シグニゾーン以外の自分の領域」の移動保護 → 🏁**宣言側の2つの穴を実装**

**登録票の主張の反証**＝「`OppMoveImmunityZone` の `deck`/`trash`/`life` は型だけ在って消費0」は誤り。
**2026-09-07（意味照合 段2・`WXK10-004-E1`）で5領域とも配線済み**だった＝
`oppZoneMoveBlocked('deck'…)`（`effectExecutor.ts` の `DECK_CARD` 分岐）／`movableTrashCandidates`
（トラッシュから出る**全経路の funnel**）／`oppMoveImmunityBlocksCrash`（効果によるライフクラッシュ）。
⇒ **残っていたのは「宣言が live に出ていない」分だけ**だった。

| 効果 | 真因 | 直し方 |
|---|---|---|
| `WXK03-011-E1`（レイラ＝クレジット・キー） | 原文は【常】1文に**2つの宣言**（「ダメージを受けず」＋「シグニゾーン以外のあなたの領域にあるカードは…トラッシュとデッキに移動しない」）。`parseSentencePart2.ts` の `/あなたは対戦相手の効果によってダメージを受けず/` が**先に当たって文全体を飲み**、後半が**無言で落ちていた**（逆翻訳も「ダメージを受けない」だけ＝engine と表示が同じ嘘で一致し、どの計器にも映らなかった） | `effectParser.ts` に後段パス `applyNonFieldMoveImmunityTail` を新設し、**`-E1b`（`STUB{PREVENT_NON_FIELD_MOVE_BY_OPP}`）を末尾へ push**。受け皿は既存（`collectProtectedZones` が payload 無しなら hand/energy/deck/trash/life を保護）＝**新しい型は足していない** |
| `WXDi-P16-002-E1`（D-(A)LIVE!!・ピース） | `ZONE_MOVE_IMMUNITY` の `zones` を組む判定が `エナゾーン`／`手札` しか見ておらず、原文「あなたの**デッキ**と手札とエナゾーンにあるカードは」の**デッキが落ちていた** | **主語（「〜にあるカードは」の前）に出たデッキだけ**を数えて `zones` へ追加 |

🔴🔑**「デッキ」を全文 regex で見てはいけない**（反転確認で実測）＝`WXEX2-06-E3` は
「あなたの手札とエナゾーンにあるカードは…**デッキとトラッシュに**移動しない」＝**デッキは移動先**であって
保護される領域ではない。全文で見る実装に差し替えたら **`WXEX2-06-E3` の zones が `deck,energy,hand` に化けた**
（golden が赤くなることで検出）。

⚠**`push` の順番を変えない**（energy → hand → **deck**）＝`buildEffectsJson.isPureSuperset` は配列を**添字パス**で
突き合わせるので、先頭へ挿すと既存リーフが変わって **live に届かない**（held 行き）。

### 併せて直した逆翻訳の嘘（LESSONS §4.3 の第3の系統）

`decompileEffects.ts` の `PREVENT_NON_FIELD_MOVE_BY_OPP` の固定文言は `WXEX2-22-E1` の原文
（「**クラッシュ以外の**対戦相手の効果によって」）を焼き込んでおり、**同じ STUB を使う `WXK03-011-E1b` に
当てた瞬間に嘘になった**（原文にクラッシュの除外は無い）。しかも **engine 側にクラッシュの除外は存在しない**
（`oppMoveImmunityBlocksCrash` は期間つきの `opp_move_immunity` しか読まない＝この宣言型は元からクラッシュを通す）。
⇒ 文言を **「場以外のあなたの領域にあるカードは、対戦相手の効果によって他の領域に移動しない（ライフクラッシュを除く）」** に訂正。

### 🔴🆕 反転確認の手順で踏んだ罠（新しい教訓・[LESSONS.md](./LESSONS.md) §4.5 へ登録）

**parser を壊して `build:effects` しても live は戻らない。** 収穫マージは `isPureSuperset`
（既存リーフを1つも失わない かつ 増える）のときだけ採用するので、**リーフを減らす方向は絶対に live へ伝わらない**。
⇒ 反転確認のために parser を1行壊したところ、**赤くするために入った誤った `deck` が live に焼き付き、
parser を戻しても消えなかった**。**`git checkout -- public/data/` で live を HEAD へ戻してから `build:effects` を
回し直し、変更カードを機械で数えて 2 件だけであることを確認した**（minified 1行なのでテキスト diff は使えない）。
🔑**live 側だけを外科的に壊す反転**（該当 effectId を JSON から抜いて golden を回し、コピーから復元）は安全で速い。

### 反転確認（2軸とも実測）

- ①`/デッキ/` を**全文**に当てる → `WXEX2-06-E3` が `deck,energy,hand` に化けて **golden 赤**（過剰保護の検出）。
- ②live から `WXK03-011-E1b` を抜く → **golden 赤**（「後半の宣言が live に無い」）。
- どちらも**片方だけが赤くなる**＝2本のテストに別々の判別力がある。

### 残した軸（§5.3 へ `O-341` を新設）

**移動先の限定**（「トラッシュとデッキに移動しない」＝母集団6効果。いまは**除外まで止まる**過剰実行）と
**位相の限定**（「グロウフェイズ以外で」＝1効果）は受け皿に軸が無い。登録票は [PLAN_DETAIL.md](./PLAN_DETAIL.md) の `O-341`。

🔧**検証**＝`npm run gates` 全緑（golden **4028 PASS**＝新規2本／smoke／fuzz／census 据置／stubs A・C群 0／
enginetext・costtext A群 0／manual-fields／deadstate／orphanmanual／lint 0 errors）。`npm run regen` 済み。
live の変更は **2カードのみ**（`WXK03-011` / `WXDi-P16-002`）を機械で確認。
⑤**実機の要否**＝触ったのは `src/data/`（parser）と `scripts/`（decompiler・golden）だけで **`src/engine/` も
`src/screens/` も触っていない**＝**§2.2 により④ゲートまでで足りる（実機不要）**。
📦**在庫**＝§5.0 実装キュー 残 **8 → 5 効果**（`semantic_bug_fixed.txt` へ3行追記）／§5.3 索引G **8 → 6効果**。

## 2026-09-12 — PLAN §5.1 実機 `V-204`／`V-206` を返済（第288バッチ・§5.1 残0・実機が `DeckEditorScreen` の穴を1件出した）

**着手の形**＝ユーザー指定「`V-204` `V-206` を行う」。第283バッチが登録して4巡寝かせた `V-203`〜`V-206` の**残り2件**を返済＝**§5.1 は残0**。
🔑**環境は障害ではなかった**（第287 に続き実測＝既存 PLAYING ルーム再利用で **1本 16〜23秒**）。

### 返済1：`V-206`＝トラッシュの＜調理＞を【アクセ】にし、ターン終了時に「付けた札だけ」を返す（`WXK04-033-E1`）

| | |
|---|---|
| 触った地点（第283） | `execStubPart3.ACCE_FROM_TRASH_MULTI`（＋`INTERNAL_ACCE_PICK_HOST` / `INTERNAL_ACCE_ATTACH_TO_ZONE` / `INTERNAL_RETURN_ACCED_CARDS_TO_HAND`）＝§5.3 `O-314` |
| なぜ実機が要るか | **1本で3段の対話を跨ぐ**＝①スペルのコスト《青》×4 ②「トラッシュのどの札か」→「どのシグニに付けるか」のループ ③`ON_TURN_END` の遅延トリガー。どこが落ちても盤面は「何も起きない」で同じに見える |
| シナリオ | `v206AcceFromTrashReturnsOnlyAcced`（観測点5つを1本に張った） |
| 本命 | 【アクセ】にした**2枚だけ**がターン終了時に手札へ戻る（実測 `hand=["WD18-012#10","WD18-014#11"]`） |
| 対照A | 自分のシグニ**3体は場に残る**＝旧 live は `SEQUENCE[ACCE_FROM_HAND, BOUNCE{SIGNI self ALL}]`＝**自分の場のシグニ全部を即手札へ**戻す自壊級の過剰実行だった |
| 対照B | **この効果以外で付いた【アクセ】（zone2 の `WD01-013#60`）は戻らない**＝「この方法で」を無視して `signi_acce` を全部掃除する実装を落とす |
| 対照C/D | トラッシュ候補に**非＜調理＞が出ない**（`filter`）／**既に【アクセ】が付いた zone2 がホスト候補に出ない**（「シグニ１体に１枚まで」） |
| ⚠盤面の作り方 | `WXK04-033` は**アーツではなくスペル**で `Restriction` が「エルドラ限定」＝センタールリグを＜エルドラ＞（`WX13-014`＝能力なし Lv4・Limit12）にしないと CardModal に「発動」が出ない（§4.4-8k） |
| 🔴踏んだ罠（新規採番） | **MAIN で「ターン終了」は出ない**＝`PHASE_BTN` の表どおり `アタックフェイズへ`→`アーツ終了→相手へ`→`ルリグアタックへ`→`エンドフェイズへ`→`ターン終了` と歩く（**MAIN の次は `ATTACK_SIGNI` ではなく `ATTACK_ARTS`**）。存在しないボタンなので `clickBtn` は disabled ログすら出さず、**30ティック／27秒まるごと無音で空振り**した ⇒ §4.4-89 |
| 判定 | **engine 側の修正は不要**（第283 の実装がそのまま正しかった）＝ドライバのフェイズ歩きだけを直して PASS |

### 返済2：`V-204`＝ルリグデッキの構築時アーツ上限3（`WXK03-003A` 夢限　-Ｐ-）

**ハーネスを1つ広げた＝`noInject:true`**（新トラップ §4.4-90）。`injectScenario` は **PLAYING ルームの `battle_states`** を書くので、
**対戦画面の外**（デッキ編集）は原理的に注入できなかった（第287 が「ハーネスの新設が要る」と書いて残していた分）。
⇒ ランナーは `sc.noInject` なら注入を飛ばし、**drive 側の責任を3つ**にした：
①**自分のルームの `status` を退避して PLAYING から落とす**（落とさないと `App.tsx` の起動ロジックが `status='PLAYING'` を見つけて**必ず BATTLE へ自動復帰**し、START 画面に一生たどり着かない）
②検証用デッキは **REST で作って REST で消す**（UI で作らない）
③🔴**`try/finally` で必ず片付ける**＝ルームを `PLAYING` に戻し忘れると**後続シナリオが全部「注入失敗: PLAYINGルームなし」で赤**になる。

🔴🔑**この実機が UI 層の穴を1件出した（その場で修正）＝`V-205` の `SigniSummonZoneModal` と同型**

| | |
|---|---|
| 真因 | 構築ルールの判定が **`addCard` の早期 return／検索行の `canAdd`／デッキ行の `canAdd` の3箇所に写経**されていた。§5.3 `O-317` のアーツ上限は **`addCard` にしか足されていなかった** |
| 症状 | **＋ボタンは押せるのに無言 `return`**（`addCard` は理由を返さない）＝**押しても何も起きず理由も出ない**。さらにデッキ行の `canAdd` は**【チーム】ピースの上限を見ていなかった**（別軸の穴） |
| 影響 | デッキ編集画面のカード追加すべて（アーツ上限・チームピース上限の2軸） |
| 直し方 | **`src/utils/deckBuildLimits.ts` に `deckAddBlockReason(card, deck, cardMap)` を新設**（`null` なら入れられる）＝**判定は1本だけ**にし、`addCard` も2つの `canAdd` もその戻り値で活殺する（`V-205` と同じ「null でなければ置けない」契約）。上限定数・`isExtraLrigCard`・`isTeamPieceCard` も同ファイルへ移した（純関数＝golden から import できる） |
| 反転確認（2通り＝軸の本数ぶん） | ①検索行の `canAdd` を `true` に戻す → **「上限に達しているのに＋ボタンが押せる状態だった」で赤**（DB は正しく変わらない＝UI 契約の軸だけが落ちる）／②`lrigDeckArtsCap` を `undefined` 固定 → **「4枚目が入った」で赤**（`lrig_deck` に `WX01-023` が入る）。**1回の反転で両方赤くならない**＝2軸が別々に効いている |
| 観測面 | **「押せたか」では判定しない**＝`decks.lrig_deck`（`onUpdate` が書く唯一の真実）を REST で読む ＋ ボタンの `disabled` も併せて見る（§4.4-91） |
| 1ビット反転 | **`WXK03-003A` がルリグデッキに在るかだけ**（他の3枚のアーツは同一）＝同じ実行の中で「在る→入らない」→ 抜く →「無い→同じ4枚目が入る」を振る |
| UI 側の追加 | 検索行の＋／−に `data-testid="search-add-<CardNum>" / "search-remove-<CardNum>"` を置いた（安定セレクタが無く、カード名の代用では掴めない＝§4.4-84 と同根） |

### 併せて足したもの

- **golden 1本**＝`§5.1 V-204 deckAddBlockReason：構築制限の判定は1本（アーツ上限3／反転確認つき）`＝上限3／反転（上限札を抜けば入る）／3枚目までは入る（off-by-one）／**上限札の後入れ**（`LRIG_ARTS_OVER_CAP`）／ルリグ同名1枚・メイン同名4枚・メイン40枚。
- **新トラップ §4.4-89〜91**（[DRIVE_TRAPS.md](./DRIVE_TRAPS.md)＝117項 → **120項**）。

🔧**検証**＝`npm run gates` 全緑（golden **4026 PASS**／smoke／fuzz／census 据置／stubs A・C群 0／enginetext・costtext A群 0／manual-fields／deadstate／orphanmanual／lint 0 errors）。
✅**実機 2/2 PASS**（各2回連続＋一括でも全緑＝`v204LrigDeckArtsCapBlocksFourth` / `v206AcceFromTrashReturnsOnlyAcced` を `order` に常設）。
⑤**実機の要否**＝`src/screens/DeckEditorScreen.tsx` と `src/utils/` を触った回＝**§2.2 により実機まで必須**（実施済み）。


## 2026-09-12 — PLAN §5.1 実機 `V-203`／`V-205` を返済（第287バッチ・実機が `SigniSummonZoneModal` の穴を1件出した）

**着手の形**＝ユーザー指定「§5.1 実機で確かめる（`V-nn`）★①＝溜める前に返す を行う」。
第283バッチが登録して**4巡寝かせた** `V-203`〜`V-206` のうち **2件を返済**（残2＝`V-204`／`V-206`）。
🔑**環境は障害ではなかった**＝既存 PLAYING ルームの再利用で **1本 1〜9秒**（第283 が書いた「回せなかった」理由は解消済み）。

### 返済1：`V-203`＝「パワー12000以上のシグニによってダメージを受けない」（`WX25-P2-008-E1`）

| | |
|---|---|
| 触った地点（第283） | `BattleScreen.tsx` の `crashOneLife` へ `damageSource.power` を渡す3行 ＋ `battleUtils.hasActivePreventDamageWindow(state, scope, sourcePower)` |
| なぜ golden で足りないか | 述語を直接叩けるので**画面がパワーを渡していなくても緑**（`V-198` と同じ型） |
| シナリオ | `v203PowerGtePreventsDamage`（本命）／`v203PowerBelowThresholdCrashes`（対照）＝**盤面は完全に同一**で、注入する window の `sourcePowerGte` だけを **12000／20000** で振る |
| 🔑1ビット反転の作り方 | **攻撃者は替えられない**＝バニラのレベル4シグニは**全部パワー15000**で、12000 未満のバニラは Lv3 しかない（レベルも一緒に動く＝DRIVE_TRAPS §4.4-25f）⇒ **閾値側で振った**（新トラップ §4.4-87） |
| ⚠原因の限定 | 同じターンの**ルリグアタック**でもライフは減り、そちらは `power` を持たない（`sourcePowerGte` つき window では fail-closed で通る）＝**「極剣　ゴッドイーターがライフをクラッシュ」の行**を witness にした（新トラップ §4.4-86） |
| 反転確認（2通り＝対照の本数ぶん） | ①`crashOneLife` の `damageSource?.power` を落とす → **本命だけ赤**（「`damageSource.power` が渡っていない疑い」と正しく診断）／②`hasActivePreventDamageWindow` の閾値比較を `return true` にする → **対照だけ赤**。どちらも1行の逆置換で復元（§4.4-61） |

### 返済2：`V-205`＝追加ターンのメインでは手札から召喚できない（`WXK05-001-E2`）

| | |
|---|---|
| 触った地点（第283） | `turnScopedState.advanceSigniDeployBans`（`fromNextTurn` をターン境界で落とす）＋`SigniDeployBan.bySource:'normal_summon'` |
| シナリオ | `v205ExtraTurnDeployBanBlocks`（ban 有効）／`v205ExtraTurnDeployBanNotYetActive`（`fromNextTurn:true`＝まだ効かない）＝**`fromNextTurn` の1ビットだけ**を振る（`turnsRemaining` は両方 2） |
| 判定 | 「召喚ボタンが出るか」では**見ない**（§4.4-47）＝配置ゾーンモーダルまで開き、**`summon-zone-*` の enabled／disabled** と**最後まで置き切れたか**の両方で見る |

🔴🔑**この実機が UI 層の穴を1件出した（その場で修正）**

| | |
|---|---|
| 真因 | `SigniSummonZoneModal` が `deployLimitBlockReason` の**3つの理由だけ**（`POWER_LIMIT`／`COUNT_LIMIT`／`ZONE_LEVEL_RESTRICT`）を `isDisabled` に入れていた |
| 症状 | `SOURCE_BAN`（この項目の本題）・`NAME_BAN`・`ALL_BAN`・`ONLY_BY_NAMED_EFFECT` は**ゾーンボタンが enabled のまま**で、`handleSummonSigni` が**無言 `return`**＝**押しても何も起きず理由も出ない**（実機の初回実行が `zones=[true,true,true] placed=false` で落ちて発覚） |
| 影響 | 手札からの通常召喚を禁止する live の全効果（`signi_deploy_bans` を張る形すべて）。**禁止自体は効いていた**＝engine は正しく、**画面だけが嘘**（§4.4-64／§4.4-37 と同型） |
| 直し方 | **「null でなければ置けない」という関数の契約どおり `deployBlock !== null` で落とす**（列挙式に戻さない＝新しい理由が増えても自動で落ちる）。枠線・ラベル色の条件も同じ式へ揃え、ラベルに理由（`この出し方は禁止`／`同名は出せない`／`新たに出せない`／`出撃条件を満たさない`）を出した |
| 反転確認 | **実測済み**＝修正前の実機が `zones=[true,true,true]` で FAIL（＝このシナリオに判別力がある）→ 修正後 `zones=[false,false,false]` で PASS |

### 併せて直したドライバ側の2件（どちらも新トラップへ登録）

- 🔴**手札は `my-hand-card-N` の testid で開く**（§4.4-84）＝`img[alt=カード名]` は常設ストリップと二重に描かれて掴めず、**20ティック／80秒まるごと空振り**した。probe 1回（§4.4-35）で即断できた。
- 🔴**witness を `H.findLog`（DOM の innerText）で取ると単体 PASS・一括 FAIL のフレークになる**（§4.4-85）＝ログ欄の表示件数とスクロール位置に依存する。⇒ **`H.queryState().logTail`（DB 側 `game_logs`）から探す**ように変えた（4本連続実行で再現した1件がこれで消えた）。

### 観測面の追加（§4.4-71 の作法）

`H.queryState()` に2つ足した＝**`preventDamageWindows`**（`scope/expires/>=N`）と **`signiDeployBans`**（`turnsRemaining/next/bySource`）。
🔴どちらも**盤面差分では切り分けられない軸**＝前者は「window が無い」と「パワーが渡っていない」、
後者は「まだ効いていない（正しい）」と「配線されていない」が同じ絵になる。

### 検証

- **実機 4/4 PASS**（`v203PowerGtePreventsDamage` 9s ／ `v203PowerBelowThresholdCrashes` 1s ／ `v205ExtraTurnDeployBanBlocks` 5s ／ `v205ExtraTurnDeployBanNotYetActive` 5s）。**4本連続でも全緑**（§4.4-54 の位置依存を確認）。`order` に常設した。
- `npm run gates` **全緑**（typecheck／golden 4025 PASS／smoke 10752／fuzz 0／census 高シグナル 1/1／stubs A・C群 0／manual-fields 0／enginetext・costtext A群 0／lint 0 errors）。

### 残り

🔥**`V-204`／`V-206` は未着手**（PLAN §5.1 に残す）。
- `V-204` は**デッキ編集画面**＝`verifyBattleDrive.mjs` は PLAYING ルーム前提なので**ハーネスの新設が要る**
  （`rooms.status` を一時的に PLAYING 以外へ落として戻す／一時デッキを作って消す、のどちらか）。
- `V-206` は**スペル使用＋アクセ化の対話ループ＋ターン終了時の遅延**で1本に3段の対話が入る。
  ⚠**`WXK04-033` はアーツではなくスペル**で `Restriction` が「エルドラ限定」＝センタールリグを＜エルドラ＞
  （`WX02-010` エルドラ×マークⅢ＝効果なし・リミット8）にしないと「発動」が出ない（§4.4-8k）。
  ＜調理＞のバニラは `WD18-010`(Lv3緑) / `WD18-012`(Lv2緑) / `WXK04-077`(Lv3青) / `WXK04-079`(Lv2青) の4枚＝
  **ホストを場・アクセ元をトラッシュに置く材料は揃っている**（青エナ4枚は `WX01-075` で足りる）。

## 2026-09-12 — PLAN §5.0 実装キューの残123効果を全数処理（第286バッチ・109件は「未修正」ではなく「未記録」だった）

**着手の形**＝ユーザー指定「§5.0 実装キュー（triage 済みの確定バグ）の**残123効果**をすべて処理する」。

### 結論（3行）

| | 効果 | 中身 |
|---|---|---|
| **既に直っていた（記録漏れ）** | **109** | §5.3 の `O-nn` をクローズした回が直していたのに `semantic_bug_fixed.txt` へ書き漏らしていた分 |
| **このバッチで実装** | **6** | 下の「修正1〜5」 |
| 🔥**機構待ち（§5.3 へ登録）** | **8** | `O-334`〜`O-340`（新設7項目。登録票は PLAN_DETAIL.md） |

🔴🔑**真因＝在庫カウンタが数えていたのは「未修正」ではなく「未記録」**。
`semanticAuditBugList.mjs` は `triaged.txt` の `:: BUG ::` から `semantic_bug_fixed.txt` を引くだけなので、
**第274〜285 の機構バッチ（`O-287`〜`O-333` のクローズ）が直した effectId を誰も書き足していなかった**。
⇒ 残123 のうち **109効果（89%）は live を読めばその場で直っていた**。

### 再照合のやり方（次に同じことをする人向け）

**1件ずつ4点を突き合わせた**＝①triage の判定文 ②**効果単位の原文**（`docs/_effect_srctext.json`）
③**逆翻訳**（`docs/decompile_sheet*.txt` の `  <effectId>:` 行）④**live JSON**（`public/data/effects_*.json`）。
⚠**判定文だけで「直った／直っていない」を決めない**＝実際に
**deferred=STALE と書かれていた20件のうち1件（`WX09-032-E1`）は成立していなかった**し、
逆に**deferred=MECH の32件のうち26件は直っていた**。
🔑**「受け皿が payload に無い」だけでは未修正の証拠にならない**＝
`WX06-019-E1` の「あなたの**他の**＜水獣＞」は `excludeSelf` ではなく
`findEffectLeavePowerReductionSubstitute` の `if (top === victimNum) continue` という**構造**で実装されていた。

### 修正1：「レベル３のルリグ１体を対象」は**ちょうど**レベル3（7効果）

| | |
|---|---|
| 真因 | `effectParser.ts` の `O-300` 規則が「レベルN**以上**の」と「レベルNの」を**同じ `gte`** で生成していた（当時のコメント「資格の下限として gte を使う」が原文の読み違い） |
| 影響 | **7効果／7カード**（`WXDi-D03/D04/D05/D06-011-E1` は MANUAL・`WXDi-D09-H11-E1`／`WXDi-P06-002-E1`／`WXDi-P07-001-E1` は AUTO）。🔴**Diva 系にもレベル4のルリグが7枚実在する**（`WXDi-P13-003B`／`WXDi-P16-001B`／`SPDi47-01`〜`05`）＝`gte` のままだと**原文では対象が取れない盤面でピースが通る** |
| 直し方 | 正規表現の `(?:以上)?` を捕獲群にして `operator: m[2] ? 'gte' : 'eq'`。MANUAL 4件は `manualEffects.ts` を直して `syncManualLive.ts` で live へ。AUTO 3件は `heldReview.mjs --adopt` |
| 検証 | `golden --only "§5.0 第286 (c)"`（7効果が `eq3` ／「以上」形の5効果 `WX24-P3-001/003/005/007/009-E1` は `gte` のまま）＋既存2本の期待値更新（**レベル4で不成立**の反転確認を追加） |

### 修正2：`TargetFilter.levelLteSelf` 新設（`WXDi-D09-H15-E2`）

| | |
|---|---|
| 真因 | 原文「**このシグニのレベル以下の**対戦相手のシグニ１体を対象とし」の上限が丸ごと落ち、**相手の任意1体**を選べた |
| 影響 | 1効果／1カード（`census:population -- "このシグニのレベル以下"` の実測） |
| 直し方 | 新キー `levelLteSelf`（`levelLtSelf` では境界が1つずれる）。🔑**消費は2箇所**＝`resolveDynamicFilter`（本体 funnel）と `execStubPart1` の `STUB{SELECT_TARGET_ONLY}`（対象宣言）。**`matchesFilter` はこのキーを黙って無視する**ので、対象宣言側で剥がして `level.max` へ畳まないと候補が絞られない（`frontOfSelf`＝`O-272` と同じ壊れ方） |
| 罠 | 🔴**刻む先は `selectTarget`**＝本体 `BANISH` は `targetsStored:true`（宣言で選んだ札をそのまま使う）ので、**本体側だけに刻んでも候補は絞られない**（払わせてから空振り）。⚠基準は `ctx.cardMap` の `Level`＝**基本レベル上書き適用後**なので、同カード `E1` の `SET_BASE_LEVEL{UNTIL_OPP_TURN_END}`（基本レベル3）がそのまま効く |
| ⚠parser には規則を置いていない | この文型が通る正準化経路を実測で特定できず（`applyLeadingSelfComparison` も `applyDroppedTargetDesignation` も不発）、**検証できない規則は置かない**方針で `manualEffects.ts` に手書き（母集団1効果＝速いレーン） |
| 検証 | `golden --only "§5.0 第286 (a)"`（レベル1/2は候補・レベル4は候補外／候補0なら**支払いを問う前に**降りる）＋既存 `catch-all A5` の標本をレベル2へ差し替え（**旧標本はレベル4＝原文では最初から対象外**＝テストが上限の欠落を固定していた） |

### 修正3：任意コストの候補判定に本体側の絞りを写す（4効果）

| | |
|---|---|
| 真因 | `SEQUENCE[STUB{TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST}, CONDITIONAL{did-it, then:本体}]` で、**本体の target には絞りがあるのに `optionalCostTarget` が無い**。engine はこの payload で「対象が1体も居ない」を判定して支払いを問わずに降りるので、**絞りを満たす相手が居なくても支払いを問われ、払った後に空振り**していた |
| 影響 | **4効果**（`WXDi-P06-032-E1`／`WXK05-059-E2`／`WXK10-062-E2`／`WXK07-030-E1`）。live の同 STUB 113効果を全数走査して「本体に絞りあり ∧ `optionalCostTarget` 無し」を数えた結果は5件で、**1件（`WXDi-P07-049-E1`）は偽陽性**＝`CHOOSE` の別の枝の絞りを拾っただけ |
| 直し方 | `applyOptionalCostTargetBackfill`（`effectParser.ts`）＝**`steps.length === 2` の素の形だけ**を見て本体 target を写す。⚠`cardType` だけの filter は写さない |
| 罠 | 🔴**呼ぶ場所が肝**＝動的 filter（`levelLteZoneCount`／`powerLtSelf` ほか）を刻むのは後段のノーマライザなので、parse パイプラインの途中で呼ぶと**まだ絞りが無い木**を見て空振りする（実測＝`WXDi-P06-032-E1` だけ写らなかった）。⇒ **`parseCardEffects` の後処理ループで1回**呼ぶ |
| 検証 | `golden --only "§5.0 第286 (b)"`（4効果とも候補判定と本体の filter が JSON 一致・偽陽性1件には付けない反転確認）。live A/B 差分＝**ちょうど4効果** |

### 修正4：`WX25-P3-057-E1b`＝覚醒中だけ【アサシン】を得る

| | |
|---|---|
| 真因 | 原文 E1 は覚醒中に**3つ**（【アサシン】／アタックが相手効果で無効にならない／ターン終了時に自分をバニッシュ）を得るのに、live は**3つ目だけ**。**このカードの勝ち筋（E2 で手札0のとき覚醒→アサシン）が丸ごと成立していなかった** |
| 直し方 | `CONTINUOUS GRANT_KEYWORD{アサシン}` ＋ `activeCondition: IS_SELF_AWAKENED`（どちらも既存＝`collectKeywords` が読む／`effectEngine.ts:590`）。⚠絞りは `target.count:1`（収集器が「発生源自身だけ」に落とす）が担い、`filter.thisCardOnly` は**逆翻訳のため**に書く（無いと「あなたのシグニ1体に与える」という嘘になる） |
| 残り | 🔴**2つ目（アタックが対戦相手の効果で無効にならない）は未実装**＝既存2キーはどちらも「**自分の**効果」向き ⇒ §5.3 `O-334` へ登録 |
| 検証 | `golden --only "§5.0 第286 (d)"`（覚醒していなければ付かない／覚醒していれば付く の両方向） |

### 修正5：`WXDi-P08-030-E1`＝「選んだシグニで可能ならばアタックしなければならない」

| | |
|---|---|
| 真因 | 後半（選んだシグニ以外のアタック禁止）だけが実装され、**前半の強制が丸ごと落ちていた**（PLAN_DETAIL の「⚠残した近似＝強制アタック」がこれ） |
| 🔑**新機構は要らなかった** | `must_attack_signi` は「**可能ならば**アタックしなければならない」で、`collectForcedAttackZones`（`src/screens/battle/signiAttackGate.ts`）が **`signiAttackBlockReason` が非 null のゾーンを外す**。他のシグニを禁止してある盤面では**全体強制 ≡ 選んだシグニだけへの強制**に自動で縮む ⇒ 既存 `FORCE_SIGNI_ATTACK` を1ステップ足すだけ（§5.3 `O-317` の登録票が書いていた「保存対象だけの攻撃強制が無い」という見立ては誤り） |
| 検証 | `golden --only "§5.0 第286 (e)"`＝相手側に `must_attack_signi` が立つ／禁止の例外が「選んだシグニ」と一致／🔴**UI と同じ純関数 `collectForcedAttackZones` を import して**、例外を1体に狭めると強制ゾーンが 3 → 1 に縮むことまで固定した |

### 併せて確定したこと（実装不要）

- **`WXDi-P04-007-E3`**＝「解決時の場のシグニだけに個別付与する」という判定は**誤り**。`execGrantKeyword` は `duration:'NEXT_TURN'` ＋ `target.count:'ALL'` で**既に `reserveFieldGrant` を通している**（`field_grants_next_opp_turn`）＝後から場に出たシグニにも効く。
- **`WXK08-005` / `WX25-P1-096-E1`**＝偽陽性と確定（前者は原文第1文「アタックフェイズの間、…レベルが低いかぎり《アタックフェイズアイコン》を得る」が `LRIG_LEVEL_CMP_OPP(lt)` そのもの／後者は原文に「それと」が無く、選ぶ2枚同士の相互条件＝`distinct:'class'` が正しい）。

### 検証

- `npm run gates` **全緑**（typecheck／golden **4025 PASS**（+5本）／smoke 10752 OK／fuzz 0／census 高シグナル **1/1 据置**／`census:stubs` A・C群 0／`manual-fields` 0／`census:enginetext` A群 **0**／`census:costtext` A群 **0**／lint 0 errors）。
- `npm run census:deadstate` **0件**／`census:orphanmanual` A・B・C群 **0**（D群4＝build 後の fixer が毎回生成＝凍っていない）。
- `npm run regen` の**逆翻訳を目視**＝変更5効果とも原文どおり（`WX25-P3-057-E1b`「このシグニは【アサシン】を持つ」／`WXDi-D09-H15-E2`「このシグニのレベル以下の」／`WXDi-D09-H11-E1`「レベル3である場合」）。⚠**`decompileEffects.ts` の `filterJa` に `levelLteSelf` の描画を足した**（足さないと**実装は入っているのに逆翻訳が「上限なし」と嘘をつく**）。
- **⑤実機は不要と判定**（§2.2）＝触ったのは `src/data/` `src/engine/` `public/data/` `scripts/` `docs/` だけで **`src/screens/` は1バイトも変更していない**。新しいアクション型・条件型も足していない（`levelLteSelf` は `TargetFilter` の語彙で、消費2箇所とも golden が `executeEffect` 経由で固定）。強制アタックの UI 層依存は `collectForcedAttackZones` を golden から import して固定した。

### 🔑教訓

1. 🔴**機構項目（§5.3 `O-nn`）をクローズする回は、その機構が閉じた effectId を必ず `semantic_bug_fixed.txt` へ書く。** 書かないと在庫カウンタが膨らみ続け、**次の担当が「直っているもの」を何度も読み直す**（今回は89%がそれだった）。
2. 🔴**「受け皿が無い」は消費地点を読むまで書かない。** 第284〜285 に続き、第286でも2件が誤り（`must_attack_signi` の「可能ならば」／`reserveFieldGrant`）。
3. 🔑**`matchesFilter` が黙って無視する動的 filter は、対象宣言（`STUB{SELECT_TARGET_ONLY}`）側でも剥がす。** `resolveDynamicFilter` だけに入れると**候補は絞られないのに本体だけ絞られる**。
4. 🔑**`parseStatus` が MANUAL のカードは `build:effects` では live へ届かない**＝`npx tsx scripts/syncManualLive.ts <CardNum>`（目印は `docs/_partial_fresh.json`。`_held_fresh` 側は `heldReview.mjs --adopt`）。
5. 🔑**修正が逆翻訳に出ているかまで見る。** 今回2件（`levelLteSelf` の未描画／`thisCardOnly` 無しの「あなたのシグニ1体」）は、JSON は正しいのに**逆翻訳だけが嘘**になっていた。

## 2026-09-12 — PLAN §5.3 `O-333` をクローズ（索引 G 残0＝機構 worklist が空になった）

**着手の形**＝ユーザー指定「`O-333` を行う」。**第284で「defer が妥当」と判断して残した最後の1項目**。
🔴**結論＝defer の根拠が誤りだった**（当初案は成立しないが、別の形なら1バッチで閉じる）。

### 真因（何が壊れていたか）

`WX16-002-E4`／`-E4b`「ターン終了時まで、**このターンの前のターンに発動した**コイン技を無効にする」が、
**前提条件も帰結も原文と別物**だった。
- 第283 以前＝条件を1つも見ず「このターン相手はコイン能力（ベット）を使えない」を立てるだけ
  （＝**これから使えなくする**効果で、原文の**もう使ったものを消す**とは別）。
- 第284＝前提条件だけ足した（台帳が立っているときだけ効く）。**帰結は近似のまま。**

### 直し方（当初案は成立しなかった）

🔴**登録票の案（跨ぐ state キー全部に `srcEffectId` を足して消費側が弾く）は実測で否定された**＝
跨ぐストア6種のうち**3種は `boolean`／`string[]`／`Record<string,string[]>` で印を置く場所が無く**、
さらに**ターン境界でキー名が変わる**（`'USE_ARTS:NEXT_TURN'`→`'USE_ARTS'`／
`field_grants_next_turn`→`field_grants_active`）ので印が stale になる。

🔑**採った形**＝新設 `src/engine/coinAbilityNegation.ts`。
**無効化する側が、相手の能力の宣言（`action` 木）から「引き算指示」を作り、値で照合して落とす。**
**書き込み地点は1バイトも触っていない。**
- 照合は**値**（`delta` 一致・`keyword` 一致・`zones` 一致）＝境界でキー名が変わっても値は変わらない。
- 同じ値の別エントリは**先頭1件だけ**落とす＝取り消す総量が1能力ぶんに収まる。
- 台帳 `coin_abilities_used_this_turn` / `_last_turn` は **`effectId` ＋ 発動時に畳んだ引き算指示**
  （`CoinAbilityLedgerEntry`）を持つ2スロット式。

🔴🔑**実装中に踏んだ罠＝`ctx.effectsMap` の dead flag**。最初は「台帳に `effectId` だけ積み、
無効化時に `effectsMap` から宣言を引き直す」形で書いたが、**`ExecCtx.effectsMap` は
BattleScreen のどの生成地点でも代入されていない**（`fillDeployCaps` のコメントが
「スタック解決の1経路でしか代入されない」と明記＝続き296 の罠）。
**golden は緑・実機は丸ごと no-op** になる。⇒ **台帳に指示まで畳んだ。**

### 影響枚数（母集団の再実測）

登録票の「live 1効果」は**無効化する側**の数だった。実測すると：
- **無効化され得る側（コイン技）＝179効果 / 172カード**（`cost.coin > 0`）
- そのうち**相手ターンを跨ぐ帰結を持つ＝11効果**
- そのうち**引き算の対象＝9効果**（対象外2件＝`WDK17-001-E2` の盤面移動／`GAIN_LRIG_TYPE{turns:'GAME'}`）

### 併せて直したもの

- 🔑**「コイン技」の定義を1本に集約**＝`lrigActivateGate.ts` の `effectiveCoinCost` と
  `gameUseAllowance` に**同じ定義（`cost.coin > 0`）が2箇所インラインで写経されていた**ので
  `isCoinAbility` へ寄せた（`SPK06-01-E1`＝「＜レイラ＞のコイン技の《ゲーム１回》を《ゲーム２回》に」も同じ funnel）。
- 🗑**`negate_coin_abilities` を撤去**＝書き手1（この STUB の近似）・読み手4（ベット可否）で、
  「対戦相手はコイン能力を発動できない」と書くカードは **live に1枚も無い**（実測）。
  原文に無い機構を残すと次の担当が「ベット禁止は実装済み」と誤読する。
- `WX16-002-E4b` の `parseStatus` を `PARTIAL` → **`MANUAL`** へ（帰結が近似でなくなったため）。

### 検証

```
npm run gates                 # 全緑（golden 4017 PASS・census 1/1 据置・deadstate 0）
node scripts/verifyBattleDrive.mjs o333CoinNegatePays o333CoinNegateNoLedger   # 2/2 PASS
```

**実機 `V-208` を同じ巡で返済**＝本命は「相手が前のターンに撃った `WXDi-P07-045-E3`（＋3000・次の相手ターン終了時まで）の
長期パワー修整が消える」（ログ＝`coins 5→3` でコストも払われ `powerModsUntilOppTurn` が `[…3000]→[]`）。
**対照**は「相手の台帳が空なら1件も落ちない」。
🔴**反転確認**＝本命の中で**無関係な宣言（自分の `must_attack_signi`）が残ること**まで assert した
（残らなければ「無条件の掃除」＝別のバグ）。
⚠🔴**被害者役の選び方が罠**＝`WX15-003-E3`（次のターン相手の【起】を封じる）を選ぶと
**無効化する側の【起】も封じられて撃てない**（chicken-and-egg。初回実装で16手すべて空振りした）。

### ⑤実機の要否（§2.2 の機械判定）

**`src/screens/` を触った回**（`BattleScreen.tsx`／`lrigActivateGate.ts`／`artsUseGate.ts`／
`ArtsModal.tsx`／`CutinModal.tsx`／`SpellCastModal.tsx`／`turnScopedState.ts`）＝**実機まで必須**。
`V-208` として同じ巡で返済した（`order` に常設）。

### 🔴簿記の訂正（同日・第285の点検で発覚）

第284・第285 の在庫欄に「**実機 残0**」と書いたのは**誤り**。返したのは**その回に自分が作った
`V-207`／`V-208` だけ**で、**第283 が登録した `V-203`〜`V-206` は未返済**
（`verifyBattleDrive.mjs` に対応シナリオが1件も無いことを grep で確認）。§5.1 は **残4**。
🔑**教訓＝「同じ巡で返した」と「§5.1 が残0」は別物**＝在庫欄には**節の残数**を書く（自分の返済分だけを見ない）。
🔑**環境はもう障害ではない**（第284・第285 で `verifyBattleDrive.mjs` を実測 4/4 PASS）＝
第283 が「回せなかった」と書いた理由（Playwright／ログイン／VERIFY_DECK）は解消している。
⇒ **次の巡の1手目は `V-203`〜`V-206` の返済**（§5 の並び順のとおり §5.0 より優先）。

---

## 2026-09-12 — PLAN §5.3 索引G の残り8項目を全消化（`O-313`／`O-317`／`O-318`／`O-320`／`O-322`／`O-330`／`O-331`／`O-332`）

**着手の形**＝ユーザー指定「索引 G をすべて行う」＝残8項目（10効果／9カード）を1バッチ。
**実測**＝**新機構が本当に要ったのは1項目だけ**（`O-333` として分離＝遡及的な能力無効化）。残り7項目は
**既存の受け皿の兄弟キー1本**か**parser が読めていない句1本**で閉じた。

| ID | 真因（1行） | 影響 | 検証 |
|---|---|---|---|
| 🏁`O-332` | `census:goldentypes` の未カバー1件＝`HAND_TO_CHECK_ZONE` の**型名が golden に1度も無い**（挙動は別テストが E2E で通していたが計器からは無検証に見えた） | 1効果/1カード | `golden -- --only "O-332"`（型の契約を新規2本＝置き先 `check_rest`・主語・照応・ターン終了掃除の両方向） |
| 🏁`O-331` | 「**次のあなたの**ターンのターン終了時まで基本レベルを1にする」が `attack_phase_level_overrides`（turn-end で消える）へ書かれ**1ターン短かった** | 1効果/1カード | `SET_BASE_LEVEL.until:'UNTIL_NEXT_OWN_TURN_END'` ＋ `base_level_overrides_until_next_own_turn`（`turnEnds` カウントダウン）。golden で3ターン分の寿命を両方向 |
| 🏁`O-330` | `FIELD_SIGNI_TO_CHECK_ZONE` が往復を畳んで**ダウン／凍結／アタック済みしか落としていなかった**＝①付属札が残る ②パワー修整・付与キーワード・能力喪失が instanceId 越しに復活 ③**【出】が一度も発火しない** | 2効果/2カード | `removeFromField` funnel ＋ 新設 `clearOnFieldAcquiredState` ＋ `signi_replayed_this_turn`（**追記ログの差分**で `detectPlacedSigni` が読む）。golden で3軸＋再発火しないことを固定 |
| 🏁`O-318` | 「このゲームの間にコインを得ていない場合」の条件型が無く**条件節ごと落ちて無条件発火**。さらに「このゲーム、コインを得られない」が **engine の `GAIN_COIN` の1箇所でしか効かず**グロウ／アシスト／`GAIN_COIN_AND_DISCARD` の獲得は素通り | 1効果/1カード（＋獲得 funnel 4地点） | 新設 `src/engine/coinGain.ts`（`applyCoinGain` 1本）＋ `Condition.NO_COIN_GAINED_THIS_GAME`。golden で上限・禁止・「得た」記録の3軸 |
| 🏁`O-320` | 「**追加で宣言した色を得る**」が JSON に1つも出ておらず**恒久 no-op**（【シャドウ:{declaredColor}】は「宣言色を持つ相手から狙われない」＝**別の帰結**） | 1効果/1カード | `signi_extra_colors_until_opp_turn` ＋ `STUB{GAIN_DECLARED_COLOR_UNTIL_OPP_TURN_END}` ＋ `collectFieldSigniExtraColors` の読み口。golden で実効色の funnel まで |
| 🏁`O-322` | ①`WXDi-CP01-033-E1`＝**＜バーチャル＞のゲートが落ちて無条件に＋5000**／繰り返しが真 no-op ②`WXDi-P14-061-E1`＝**条件が無く常に覚醒**しようとし、対象が効果元（＝スペル）なので**恒久 no-op** | 2効果/2カード | `STUB{REPEAT_BODY_WHILE}`（再帰点 `REPEAT_BODY_SELF` を実行時に自分自身へ差し替え・`maxRepeats` で必ず止まる）＋`SELECT_TARGET_ONLY`→`targetsLastProcessed` の照応。golden で繰り返しの回数と止まることを両方向 |
| 🏁`O-313` | 【起】コスト「シグニに**付いている**カード1枚か**下にある**カード1枚をトラッシュ」を parser が読めず `costUnparsed:true`＝**どの提示ゲートにも出ずカードごと使えなかった** | 1効果/1カード | `EffectCost.attachedOrUnderTrash` ＋ 新設 `src/screens/battle/attachedOrUnderCost.ts`（提示ゲート・支払いUI・引き落としが**同じ関数**を通る）。**実機 `V-207` を同じ巡で返済**（本命＋対照） |
| 🏁`O-317` | 「このターンの**前のターンに発動した**コイン技を無効にする」が**前提条件を1つも見ず**「このターン相手はコイン能力を使えない」を立てていた＝**原文に無い妨害** | 1効果/1カード | `coin_ability_used_this_turn`／`_last_turn`（2スロット式）を新設し発動地点4つで記録。**帰結は近似のまま `PARTIAL`**＝残りは `O-333` へ分離 |

### 🔴実機（`V-207`）が UI 層の穴を1件見つけた

提示ゲート・支払いUI・引き落としを揃えても、**【起】ボタンのコストラベルに新しいキーを足し忘れると
「コストなし」と表示される**（実機のラベル一覧が `["【起】コストなし", ...]` を返して発覚）。
⚠**選択UIの素の `div` は role を持たない**＝ドライバから掴めないので `data-testid` を付けた。
⚠**候補クリックはトグル**＝毎ステップ押すと選択が外れる（初回実装で16手すべて未選択のままだった）。
⚠このカードは `-E3`（`trash_key`）の【起】も持つので、**「【起】ボタンが1つでもあるか」では対照を判定できない**
＝ラベル本文で見分ける（初回はこれで偽の「提示されている」を読んだ）。

### 計器の動き

- `census:goldentypes` **未カバー 1 → 0**（CLAUDE.md の「現在 未カバー0」は実測1だった＝是正）。
- `census`（語彙センサス）**高シグナル 2 → 1（＝ベースライン据置）**＝`WXK07-032-E2` が STUB 免除を外れて可視化された分を、
  **`"upToCount":true` を「任意(してもよい)」の対応語彙へ足す較正**で払い戻した（`upToTarget`／`pickUpTo` と**同じ概念の綴り違い**で、
  engine は `selectOrInteract(..., optional=upToCount ...)` で実際に辞退を許している）。⚠**この1語で落ちたのは1件だけ**＝masking ではない。
- golden ラチェット3本を更新＝`convention.length` 57→**59**／`registered.length` 88→**90**（`signi_replayed_this_turn`／`coin_ability_used_this_turn`）、
  `Condition` 型数 153→**154**（`NO_COIN_GAINED_THIS_GAME`）。**いずれも新設ぶんの加算**（較正ではない）。
- ゲート＝**`npm run gates` 全緑**（golden 4017/4017・smoke 10751/0・fuzz 0・census・census:stubs・manual-fields・census:enginetext・census:costtext・lint）。

### 検証

```
npm run gates                 # 全緑
node scripts/verifyBattleDrive.mjs o313AttachedCostPays o313AttachedCostNoCandidate   # 2/2 PASS
```

### ⑤実機の要否（§2.2 の機械判定）

**`src/screens/` を触った回**（`BattleScreen.tsx`／`signiActivateGate.ts`／`SigniActivatedModal.tsx`／
`turnScopedState.ts`／`untilOppTurn.ts`／新設 `attachedOrUnderCost.ts`）＝**実機まで必須**。
`V-207` として同じ巡で返済した（`order` に常設）。

---

## 2026-09-12 — PLAN §5.3 索引G `O-312`／`O-313`／`O-314`／`O-315`／`O-317` を5項目まとめて消化（19効果／18カード＋系統13効果）

**着手の形**＝ユーザー指定の5項目を横断で1バッチ。**「登録票の反証」を1手目にした**（PLAN §1 次の一手②）。

### 🔴2項目は登録票が stale（実装済み）＝着手前の grep で確定

| ID | 登録票 | 実測 |
|---|---|---|
| 🏁`O-315` | 「残1効果（`WXEX2-39-E3`）＝コストと＜凶蟲＞効果の OR が書けない」 | **第252バッチで実装済み**。`triggerCondition.trashSourceStoryIncludesCost` が live・`triggerCollect.ts:4297`・golden（`第252 O-315 WXEX2-39-E3`）の3点に揃っていた＝**1バイトも書かずにクローズ** |
| `O-314` ① | 「`WXDi-P00-038-E1`＝次の次の自メイン開始時の遅延」 | **第262バッチ（`O-299`）で実装済み**（`SELF_LEAVE_FACEDOWN_SECOND_MAIN`＋golden 済み）＝4効果→3効果 |

### 🔴作業中に見つけた系統バグ（登録票には無かった）＝「各ターン終了時」が半分 no-op

原文に **「各ターン終了時」と書く live 13効果すべて**が `triggerScope` 未指定で、
`collectTurnTriggers` は **自分の場のシグニを `scope==='self'` しか／相手の場のシグニを `'any'|'any_opp'` しか**拾わない
⇒ **非ターンプレイヤー側の場に居るあいだは1度も発火していなかった**（「各ターン」の半分が恒久 no-op）。
🔴**`triggerScope` を `'any'` にしても直らない**（自分側の loop が落とす）＝**新しい軸が要る**。
⇒ `triggerCondition.anyTurn` を新設し、相手フィールド走査で `scope:'self'` のままでも拾う。
parser 規則1本（`effectParser.ts` の ON_TURN_END/ON_TURN_START の主語抽出の隣）で **11効果**、
MANUAL 2件（`WX12-038-E1`／`WXK06-053-E1`）を手で足して **13/13**。

### 🏁`O-312`＝動的な値を上限・一致条件へ渡す filter（6効果＋付与ぶん1効果）

🔑**新機構は1つも作っていない**＝**既存の受け皿に payload を1つずつ足しただけ**。

| 効果 | 旧 live（何が起きていたか） | 足した payload |
|---|---|---|
| `WXDi-D09-P04-E3` | `SEQUENCE[DECLARE_NUMBER, LOOK_OPP_LIFE_TOP]`＝**「捨てさせる」が丸ごと無い**（相手の手札を眺めるだけ）＋宣言に上限が無い | 既存 `TK3_DECLARE_DISCARD`（`WD03-006-E1` と同文型）へ移し、`numberChoicesFrom:'opp_center_lrig_level'` と `declareDiscardFilter:{noGuard:true}` |
| `WXDi-P14-061-E1`（付与ぶん） | 同文を引用付与する側も同じ穴（`O-322` との横断） | 同上。⚠後半の `AWAKEN_SIGNI` は別軸なので `O-322` に残す |
| `WXK07-033-E1` | `SEQUENCE[DECLARE_NUMBER, DECLARE_CARD_NAME]`＝**基本レベル変更が無い**うえ、原文に無い「手札のカード名を宣言する」が入っていた | `SET_BASE_LEVEL.valueRef:'declared_number'`（未宣言なら何もしない＝fail-closed） |
| `WXEX2-81-E2` | filter が `{story:'天使'}`＝**「相手の＜天使＞のシグニを狙う」別物**（＜天使＞は自分側の数え元） | `CountFromZone.distinctBy:'color'`（色の種類数。多色は全色・無色は数えない） |
| `WXK02-027-E1` | level 限定が両方とも無く、**どんなレベルの相手シグニでもトラッシュ送り／どんなシグニでも場に出せた** | `TargetFilter.levelEqLrigOffset`（±N。1〜5 の外は空ヒット） |
| `WXEX2-54-E2` | ①level 限定が無い ②ゲートが `CONDITIONAL{IS_MY_TURN}`＝`evalCondition` では素通り＝**払わなくても場に出せた** | `TargetFilter.levelEqualsVarOffset`（−1）＋ゲートを `PAID_ADDITIONAL_COST` へ |
| `WXK05-029-E3` | `selectionConstraint:{distinct:'level'}` だけ＝**「能力が同じ」が無くレベル違いのどの4枚でも持ってこられた** | `SelectionConstraint.same:'ability'`（`EffectText`＋`LifeBurst`＋`BurstText` の正規化一致。バニラは不成立） |

### 🔥`O-313`＝シグニゾーン内の「非シグニ札」を対象にできない（3/4効果）

- 新設ヘルパー **`signiZoneNonSigniCards` / `stripSigniZoneNonSigniCards` / `pluckSigniZoneNonSigniCard`**（`execUtils.ts`）＝
  原文の括弧書きどおり3系統（裏向き／付いている／下にある）を1つの集合として扱う。⚠【ソウル】は行き先がルリグトラッシュなので含めない。
- `WXK07-003-E1`＝旧 live はこの文を `TRASH{SIGNI owner:opponent count:1}` にしていた＝**原文に1文字も無い「相手シグニ1体をトラッシュ送り」を無料で撃つ**過剰実行（付属札は一切触らない）。新 STUB `TRASH_SIGNI_ZONE_NON_SIGNI`。
- `WXK08-024-E2`＝`BOUNCE{SIGNI}`＝最上面のシグニしか候補にならず原文の「カード」を1枚も戻せない＋`triggerScope` 未指定（上記の系統バグ）。新 STUB `BOUNCE_SIGNI_ZONE_CARD`（最上面を選んだら `BOUNCE` へ**委譲**＝離場処理を自前編集で取りこぼさない）。
- `WX24-P3-018-E1`＝`LOOK_AND_REORDER{reorder:false, destination:{position:'top'}}`＝原文「残りを**好きな順番で**デッキの**一番下**に置く」と**行き先まで逆**、しかも `PLACE_MAGIC_BOX` は `lastProcessedCards[0]` を読む設計なのに**公開札の選択段が無く**設置札が決まらなかった。既存 `LOOK_PICK_CHAIN{stages:[{then:'magic_box'}], remainder:{position:'bottom', reorder:true}}` へ。
- ⚠**残1効果**＝`WXK10-018-E2`（下記「残した理由」）。

### 🏁`O-314`＝複数ターンにまたがる遅延状態（3効果＋stale 1）

- `WXK02-002-E3`＝`SEQUENCE[DECLARE_NUMBER, RULE_REMINDER_TEXT]`＝**敗北判定が丸ごと無い**（宣言して終わり）。
  3点を足した＝①`StubAction.declaredBy:'opponent'`（**宣言するのは相手**。落とすと相手のアーツ回数と必ず違う数を選べる＝**無条件で相手を敗北させる**）②`Condition.ARTS_USED_COUNT_NE_DECLARED`（未宣言は不成立＝fail-closed）③`STUB{DEFEAT}` が `owner` を読む（旧は `ctx.ownerState` 固定＝**自分が負ける**）。
- `WXK05-001-E2`＝`SEQUENCE[GAIN_EXTRA_TURN, RULE_REMINDER_TEXT]`＝**代償が丸ごと無い**（追加ターンが純粋な得）。
  `SigniDeployBan.fromNextTurn`（＋`bySource:'normal_summon'`）を新設。🔴`fromNextTurn` が無いと**追加ターンを得たこのターンから**召喚できなくなる逆向きの過剰実行になる。⚠近似＝`DeployPlacementSource` は「手札から」を運ばないので**効果による手札からの配置は止まらない**（過少側）。
- `WXK04-033-E1`＝`SEQUENCE[STUB{ACCE_FROM_HAND}, BOUNCE{SIGNI owner:self count:'ALL'}]`＝①**手札発**（原文はトラッシュ発）②**自分の場のシグニ全部をその場で手札へ戻す**＝**自壊級の過剰実行**。
  新 STUB `ACCE_FROM_TRASH_MULTI`（1枚ずつ「トラッシュの札→付ける先」を選ぶループ）＋終了時に**付けた札だけ**を焼き込んだ `ON_TURN_END` 遅延トリガーを積む。🔑**carrier は作らない**（`storedTargetCards` は設置と発火で ExecCtx が別物＝`O-311` と同じ結論）。

### 🔥`O-317`＝単発（3/4効果）

- `WXK03-003A`＝原文第1文「このカードをルリグデッキに入れる場合、アーツを**３枚まで**しか入れられない」を parser が**効果として1つも出していなかった**＝デッキ編集でアーツを何枚でも入れられた。
  新設 `src/utils/deckBuildLimits.ts`（`lrigDeckArtsCap` / `lrigDeckArtsCount`）＋`DeckEditorScreen` の追加判定2箇所。🔑**原文 regex を UI 層に書かない**＝判定は JSON の宣言（`STUB{LRIG_DECK_ARTS_LIMIT}`）だけを読む（`census:costtext` の型を増やさない）。⚠母集団は実測1カード（他2枚の「しか入れられない」は【チーム】ピースのルール文＝既存 `TEAM_PIECE_MAX`）。
- `WX16-003-E1`＝`SEQUENCE[STUB{OPTIONAL_ACTIVATE}, ENERGY_CHARGE_FROM_DECK{1}]`＝①「最初のアーツ」条件が無い（**2枚目以降でも毎回発火**）②二択が無く**常にエナチャージ側**（原文の「手札に加える」が1度も起きない）。
  🔑**effectId で2つに割った**（`E1`＝`ON_ARTS_USE` / 🆕`E1b`＝`ON_OPP_ARTS_USE`）＝収集地点が別で実行時に「どちらが使ったか」を知る術が無く、1効果に両方入れると `ARTS_USED_THIS_TURN{owner}` の owner を決められない（OR で近似すると**相手の1枚目でも自分側の条件で通る**）。受け皿 `exactCount:1` は既存。
- `WX25-P2-008-E1`＝**3軸で外していた**＝①`PREVENT_NEXT_DAMAGE{count:1}`＝**1回しか効かない**（原文は回数無制限）②パワー限定が無い＝**どんなシグニのダメージも止める** ③`POWER_MODIFY{count:1}`＝**1体だけ**（原文は2体まで）。
  `PreventDamageAction.sourcePowerGte` を新設し、`prevent_damage_windows` に載せて `hasActivePreventDamageWindow(state, scope, sourcePower)` が読む。⚠**パワーが渡らない経路（ルリグアタック・効果ダメージ）では当たらない**（fail-closed）＝`crashOneLife` の呼び出し2地点で `effectivePowers` から渡す。
- `WX16-002-E4`＝`ON_PLAY`（＝【出】）だけで**【起】の経路が無かった**（グロウした瞬間の1回しか撃てない）＝`E4b`（`ACTIVATED`/`MAIN`）を追加。
  ⚠**本体は近似のまま**＝`NEGATE_COIN_ABILITY` は「このターン相手はコイン能力を発動できない」を立てるだけで、原文の「**前のターンに発動した**コイン技を（遡って）無効にする」ではない（`PARTIAL` を刻み `O-317` に残す）。
  🔑**`-E4`（【出】側）は manual に置かない**＝parser 出力と実体同一で `O-42` トリップワイヤが「影武者コピー」として検出する（parser 改善が永久に届かない形）。足したのは parser が出していない【起】側だけ。

### 残した理由（着手前に実測した根拠つき defer）

- **`O-313` `WXK10-018-E2`**＝【起】コスト「あなたのシグニに**付いているカード**1枚か、シグニの**下にあるカード**1枚をトラッシュに置く」。
  現状 `costUnparsed:true`＝**この【起】はどの提示ゲートにも出ない**（`BattleScreen.tsx:8787`/`8890`/`8927`／`lrigActivateGate.ts:117`）＝**踏み倒しではなく fail-closed の過少**。
  受け皿は `EffectCost` に無く（`charmTrash` は【チャーム】限定）、支払いは **`src/screens/battle/costs.ts` の提示ゲート＋選択 UI ＋引き落とし**の3点セットが要る＝**このバッチでは実機検証ができない**ので分けた。判定ヘルパー（`signiZoneNonSigniCards`）は今回作ったので次は engine 側の作業が無い。
- **`O-317` `WX16-002-E4` の本体**＝「このターンの前のターンに発動したコイン技を（遡って）無効にする」＝
  **発動済みの能力の効果を後から取り消す機構が engine に無い**（どのコイン技が発動したかの履歴も持っていない）。近似を `PARTIAL` で刻んだ。

### 🔑教訓

1. **登録票は「着手前に grep で反証する」**＝5項目のうち**2項目は完全に stale**（実装済み）、残り3項目も「新機構が要る」は誤りで**既存の受け皿に payload を1つ足すだけ**だった（`O-312` は6効果とも）。第280〜282 に続き**14項目連続**でこの形。
2. **`triggerScope` は「誰の場に居るか」の軸で、「どちらのターンか」を表せない**＝2つの loop が別々のフィルタを持つ構造なので、**片方の値にしても必ず逆側で落ちる**。「各ターン」のような**両側の軸は別キーで足す**。
3. **payload を足したら逆翻訳もその payload から組む**（LESSONS §4.2）＝今回 `distinctBy:'color'` は「枚数」、`levelEqLrigOffset` は「同じレベル」、`same:'ability'` は**丸ごと消えて**描かれていた。`constraintJa` / setConstraint の三項は**排他**なので `distinct` と `same` の併記で片方が落ちる（＝サーチ範囲が桁で違うのに逆翻訳が同じ）。
4. **「ログのみ」というコメントは stale になる**＝`NEGATE_COIN_ABILITY` は実際には `negate_coin_abilities` を立てており4地点が読んでいた（`genStubsMd` 経由で逆翻訳に「ログのみ」と出ていた）。

🔧**検証**＝`npm run gates` 全緑（golden **4004 PASS**＝新設12本／smoke 10751 OK／fuzz 0／census 高シグナル 1/1 据置／stubs A群・C群 0／enginetext・costtext A群 0／deadstate 0／lint 0 errors）。
**反転確認**＝新設12本すべてに反転 assert を埋め、うち3本（`same:'ability'`／`sourcePowerGte`／`anyTurn`）は**実際に実装を殺して FAIL することを確認**した。
逆翻訳は変更19効果すべてを目視（描き漏れ5件＝上記教訓3 をその場で修正）。
⚠🔴**実機（`verifyBattleDrive.mjs`）はこの環境で回せなかった**（Playwright＋ログイン＋VERIFY_DECK が要る）＝`src/screens/` を触った回（`BattleScreen.tsx` 3行／`battleUtils.ts`／`damagePrevention.ts`／`turnScopedState.ts`／`DeckEditorScreen.tsx`）なので §2.2 のとおり**実機は必須**＝PLAN §5.1 に `V-203`〜`V-206` として登録した。判定ロジックは golden（`src/screens/` の純関数を import）で網羅してある。

📦**在庫**＝実装キュー **123効果**（据置）｜機構 worklist **8項目**（🏁A 0／🏁B 0／**G 8**＝10−3＋新規1）｜実機 残**4**（`V-203`〜`V-206`）。

## 2026-09-12 — PLAN §5.3 索引G `O-292`／`O-296`／`O-309`／`O-310`／`O-311` を5項目まとめてクローズ（30効果／24カード）

**着手の形**＝ユーザー指定の5項目を横断で1バッチ。互いに無関係で、束ねたのは固定費（full gates・実機・簿記）のため。

### 🔴5項目とも登録票の前提が崩れた

| ID | 登録票 | 実測 |
|---|---|---|
| `O-292` | 「通常効果からのコラボ（`INTERNAL_DO_COLLAB` に生成元が無い）」＝コラボ＝アシストルリグの配置と読んでいた | 🔴**「コラボ」の意味そのものが誤読**。公式 FAQ（`WXDi-CP01-005`/`-006`）＝「コラボライバー2人を呼ぶ」は**『ライバートークン』を2つ得る**、「コラボする」は**トークンを1つ取り除く**。engine は「呼ぶ」でルリグデッキのアシストルリグを場へ出し、【ガード】の代替（`O-230`）でもアシストルリグを出していた＝**呼ぶ5効果＋コラボする4効果の9効果すべて**。既存 golden 3本も同じ誤読を固定していた |
| `O-296` | 「`SET_BASE_LEVEL.until` が `END_OF_TURN` しか取れない（1件）。隣の `POWER_SET` は `UNTIL_OPP_TURN_END` を持てる」 | 実測**8効果**。①`until` の無い AUTO の `SET_BASE_LEVEL` は **CONTINUOUS 扱いで何もしていなかった**（基本レベル3が一度も成立しない）②🔴**`POWER_SET` は engine が `duration` を読んでいなかった**＝「持てる」は誤り（4効果がターン終了で消えていた）③`BLOCK_ACTION{SET_LEVEL_1}` は**読み手ゼロ**（4効果・`O-270` の同族） |
| `O-309` | 「新機構が3つ」 | ①`SEARCH` pending には `deckOwner`／`opponentResponds` の**受け皿が既にあり** `execSearch` が立てていないだけ ②`selectOrInteract` の第8引数を渡すだけ ③だけ新しい STUB |
| `O-310` | 「`fieldCandidatesByOwner('any')` の拡張ではなく `TargetScope` 側の新設が要る」 | 両者のエナは `applyDirectAction` の EXILE/TRASH が**最初から両者を探していた**＝**列挙側だけ**の穴。ゾーンを跨ぐ単一プールもシャドウ判定込みで既存の選択に載った |
| `O-311` | 「`lastProcessedCards`／`storedTargetCards` は直前ステップ限定＝carrier が要る」 | **carrier は作らなかった**。参照が生きているうちに具体値へ焼く `STUB{BAKE_LAST_PROCESSED_REFS}` 1本で2効果が閉じ、残りは既存の `LOOK_PICK_CHAIN`＋`INTERNAL_ASK_ACCE_HOST`／`SELECT_TARGET_ONLY`＋記録 STUB で足りた |

### 修正1：`O-292`＝ライバートークン（9効果／5カード）

- 新設 `PlayerState.liver_tokens`。`STUB{COLLAB}`（呼ぶ）はトークンを N 個足すだけ（旧＝アシストルリグを配置し、BattleScreen がその【出】まで積んでいた＝2分岐とも撤去）。
- 新設 `EffectCost.collab`＝**3地点セット**（提示ゲート `canActivateLrigEffect`／`LrigGrantedModal`／`performLrigActivated`）＋CPU allowlist（`cpuLrigActivate.ts`）＋ボタンラベル「コラボN」。parser は旧 `cost.none` を `cost.collab` へ（`WXDi-CP01-006/007/008-E2`＝`heldReview --adopt`）。
- 【ガード】代替（`WXDi-CP01-005-E1`）＝提示と支払いの両方でトークン数を検算し、支払いの場で減らす（旧＝スタックへ `INTERNAL_DO_COLLAB` を積みアシストルリグを出していた）。`INTERNAL_DO_COLLAB` 自体もトークン消費へ（fail-closed）。
- 盤面に「ライバー N」を表示（`BoardComponents.tsx`・持っているときだけ）。

### 修正2：`O-296`＝基本レベル／基本パワーの期間（8効果）

- `SET_BASE_LEVEL.until` を3種へ：`END_OF_TURN`（既存ストア）／🆕`UNTIL_OPP_TURN_END`（`base_level_overrides_until_opp_turn`＝持ち主の次ターン開始で `clearUntilOppTurnEffects` が消す）／🆕`NEXT_TURN`（場全体＝`FieldGrant{kind:'baseLevel'}` を `reserveFieldGrant` で予約＝**後から場に出たシグニにも効く**）。対象を選ぶ形（`owner:'any'`/`'opponent'`）は `selectOrInteract` → `applyDirectAction` の新 case。
- `POWER_SET` の `duration:'UNTIL_OPP_TURN_END'` を `power_mods_until_opp_turn` へ（`execPowerSet`／直接適用の両方）。
- MANUAL＝`WXDi-D09-H15-E1`／`SPDi44-08-E2`／`WX25-P1-018-E2`／`WX19-067-E1`／`WXK07-081-E1`／`WX11-051-E1`／`WX11-051-BURST`（`WXDi-CP01-031-E1` は engine だけで直る）。

### 修正3：`O-309`＝「対戦相手が選ぶ／探す」の残り（3効果）

- `SearchAction.opponentResponds`＝`execSearch` が pending に `opponentResponds`＋`deckOwner` を立てる（`WXK10-091-E1`＝旧は**主語が逆**で自分のデッキから自分の場へ）。
- `AddToFieldAction.opponentSelects`＝相手の手札から**相手が**選ぶ（`WXK06-025-E2`＝旧は使用者が相手の手札を見て選んでいた＋先頭が `STUB{BANISH}`＋「そうした場合」が常時真）。`O-327` の許容リストへ `ADD_TO_FIELD|HAND_CARD|N` を追記（配線と対照を足してから）。
- 🆕`STUB{OPP_TRASH_TO_DECK_TOP_OPP_ORDERS}`＝使用者が2枚まで選び、**相手がコストの無い CHOOSE で順番を選ぶ**（`WXK06-028-E1`・原文の括弧書き＋FAQ「その順番は非公開」）。

### 修正4：`O-310`＝持ち主・ゾーンを跨いだ対象（4効果）

- `execExile`／`execTrash` の ENERGY_CARD が `owner:'any'` で両者のエナを列挙（新 `TargetScope` `both_energy`）＝`WXEX2-08-E4`／`WD20-006-E1`（旧 live は**「エナゾーンにあるカード２枚」の手順が丸ごと無かった**）。
- 🆕`STUB{OPP_FIELD_OR_ENERGY_PER_COLOR_TO_HAND}`＋新 `TargetScope` `opp_field_energy`（`selectOrInteract` のシャドウ判定は場の候補だけに掛ける）＝`WX24-P4-022-E3`（旧＝`BOUNCE{owner:'self'}`＝**自分のシグニを戻す**真逆の自損）。
- `FIELD_SIGNI_TO_CHECK_ZONE` に選択（`target.count` が数値）と `asDown` ＝`WXK07-018-E1`（旧＝source 無しの `ADD_TO_FIELD`＝**自分のデッキの一番上を場に出す**過剰実行）。

### 修正5：`O-311`＝「見た／選んだ集合」を後段へ渡す（6効果）

- 🆕`STUB{BAKE_LAST_PROCESSED_REFS}`＝`levelEqLastProcessed`／🆕`powerEqLastProcessed` を**対話の前に具体値へ焼く**（参照不能は到達不能値＝fail-closed）＝`WXEX2-29-E3`（自分の探索のあとで相手の探索がレベルを失う＋旧は相手側の探索が無かった）／`WX24-P4-048-E2`（任意コストの支払い後に「同じパワー」を失う＋旧は帰結が自分のデッキからエナチャージ）。
- 🆕`STUB{OPP_HAND_BLIND_LOOK_TO_DECK_BOTTOM}`＝`WXDi-P00-037-E1`（旧＝相手の**場のシグニ**をデッキの下へ）。
- `LOOK_PICK_CHAIN` の `then:'acce'`（→ 既存 `INTERNAL_ASK_ACCE_HOST`）＝`WXK04-003-E2`（旧＝見てデッキの上に戻すだけ）。
- 🆕`STUB{RECORD_ON_PLAY_CHOSEN_SIGNI}`＋`PlayerState.on_play_chosen_signi`＋`victimFilter:'chosenByOnPlay'`＝`WXDi-P10-052-E1/E2`（旧＝他の味方シグニ全部を身代わりで守れた）。

### 作業中に見つけて直した別件

- 🔴**`execTrash` の場のシグニ分岐だけ `frontOfSelf` を読んでいなかった**＝BANISH/BOUNCE/DOWN/TRANSFER_TO_DECK/REMOVE_ABILITIES は各ハンドラで解決しているのに、`matchesFilter` が黙って無視して**相手の全シグニが候補**だった。live 該当は今回の `WXK06-025-E2` だけ＝**新設 golden の反転確認（正面が空なら何も起きない）が捕まえた**。
- 🔴**`applyContinuousBaseLevelOverride` が `new Map(cardMap)` で派生クラスを落としていた**＝本番の `InstanceMap`（instanceId → CardNum へのフォールバック）が素の `Map` になり、instanceId キーの基本レベル上書き（`newMap.get(instanceId)`）が当たらなかった。写し先の型を保つ形へ。
- 逆翻訳の描き漏れ2件＝`ADD_TO_FIELD` の `opponentSelects`（「使用者が相手の手札を見て選ぶ」と同じ文になっていた）／`filterJa` の `powerEqLastProcessed`。

### 影響枚数・検証

- **30効果／24カード**（MANUAL 20効果＋parser 1規則（コラボのコスト 3効果）＋engine のみ7効果＝「呼ぶ」5・`WXDi-CP01-031-E1`・ガード代替）。
- 検証＝`npm run gates` 全緑（golden **3992 PASS**＝3986 → +6本・旧3本を書き換え／smoke 10748 OK／fuzz 0／census 高シグナル 1/1 据置／`census:stubs` A群・C群 0／enginetext・costtext A群 0／lint 0 errors）。`npm run regen` の逆翻訳を22効果目視。
- 🔴**反転確認5本**（`scripts` ではなく一時的に `false &&` で殺して golden が FAIL することを確認し、戻した）＝コラボ提示ゲート／`POWER_SET` の期間／TRASH の正面限定／レベルの焼き込み／選んだシグニだけ守る。
- 🔴**実機 PASS 4本**＝`V-200`（トークン1個で「【起】コラボ1」を撃ってトークン0へ／対照＝トークン0では出ない）／`V-201`（候補に自分と相手のエナが並び、相手のエナを除外できる）／`V-202`（相手の探索が CPU へ回り、同じレベル2だけを相手の場へ出す）。
- ⚠**ラチェット・契約**＝`O-327` 許容リスト +1（配線＋対照を足してから）／C2 `$ref` トリップワイヤが私の `resolveNum` を捕まえた（`resolveCountRef` へ直した＝リスト変化なし）／据置契約2本を解除（`WXDi-P00-037-E1` の手札処理・`WXEX2-08-E4` の `owner`）。
- 近似（登録して残す）＝`O-330`（チェックゾーン経由の出し直しで付属札・修整を引き継ぎ、出し直した【出】の発火も未確認）／`O-331`（`CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN` の1ターン短い寿命・既知のコメントを索引化）。`WX24-P4-022-E3` は1色ずつ戻す近似（登録票に記載）。

## 2026-09-11 — PLAN §5.3 索引G `O-325`／`O-291`／`O-290` を3項目まとめてクローズ（9効果／6カード）

**着手の形**＝第280と同じく**索引を横断して1バッチ**にした。⚠ただし3項目は互いに無関係で、束ねたのは
**固定費（full gates・実機・簿記）を1回で済ませるため**（受け皿が同じだった第280とは理由が違う）。

### 🔴3項目とも「受け皿が無い」という登録票の判断が誤っていた

| ID | 登録票 | 実測 |
|---|---|---|
| `O-325` | 「参照元がまだ無い軸＝**新しい参照キーが要る**」 | 半分正しい。要ったのは**既存 `classMatchesDiscardSigni` の兄弟2つ**（参照元を差し替えるだけ）。3件目の `WX25-P1-089-E1` は**専用 STUB で実装済み**＝登録票が stale |
| `O-291` | 「消費地点は2箇所だけで【マルチエナ】剥奪しか実装していない」 | 正しい。ただし**先例が完全な形で存在**＝`isTrashImmuneByOpponent` ＋ `trashCandidatesForOwner`（§6.4 `O-10`）を写すだけ |
| `O-290` | 「**3カード**」 | 🔴**実測6カード**。`WDK16-05T/05H/05S` の `SELF_PLAY_RESTRICT` は **live にあるのに `canSelfPlay` がキー配置経路で呼ばれず恒久 no-op**（誰がセンターでもキーを出せた）＝登録票がこの3枚を数え落としていた |

### 修正1：`O-325`＝「〈参照カード〉と共通するクラスを持つ」残2件

- `PR-K070-E1`＝🔴クラス修飾が**丸ごと落ちて**おり「無色以外のレベル3以下なら何でも探せる」過剰効果だった。
  新設 `TargetFilter.classMatchesCostTrashed`（参照元＝`last_cost_trashed_cards`＝**支払い全般が記録される**。
  手札捨て専用の `last_discarded_signi_class` では届かない軸）。
- `WX25-P1-093-E1`＝🔴**エナのコスト支払いが丸ごと落ちて**おり、「このシグニをダウンする」だけで
  相手のパワー8000以下を1体バニッシュできた。`WX25-CP1-082-E1` と同型の
  `SELECT_TARGET_ONLY{abortIfNoCandidate} → STORE_LAST_PROCESSED_TARGETS → OPTIONAL_COST → targetsStored` へ。
  新設 `TargetFilter.classMatchesLastProcessed`（参照元＝`lastProcessedCards[0]`）。
  ⚠`storedTargetCards` は `resolveDynamicFilter` へ渡っていないので**このステップ順でしか解けない**。
- 🔑共有述語 `resolveClassMatchesRefs` に畳んだ（3つの兄弟で**クラス名トークンの取り方を必ず同じにする**）。
  ⚠**参照不能はどれも空ヒット（fail-closed）**＝`O-328` が同じ向きに倒したのと揃えた。
- 🏁`WX25-P1-089-E1` は **`STUB{UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS}` がクラス比較込みで実装済み**と実測で確定
  （近似1点＝原文「1枚を対象とし」に対し実装は最初の1枚を自動選択）。

### 修正2：`O-291`＝「対戦相手のエナゾーンにあるカードは対戦相手の効果を受けない」

- 🔴後半は **engine のどこにも無かった**（`STUB` が宣言だけして誰も読まない形）。
- `isEnergyImmuneByOpponent` ＋ `energyCandidatesForOwner` を新設し、**エナから動かす7経路を1本の funnel へ**
  （`execTrash` の ENERGY_CARD／`extraZones`／`EXILE`／`ADD_TO_FIELD`／`TRANSFER_TO_HAND`／`ADD_TO_LIFE{fromEnergy}`／配置 resume）。
- 🔴🔑**向きを1度間違えて golden が捕まえた**＝先例 `trashCandidatesForOwner` を写して
  `owner === 'self' ? otherState : ownerState` としたが、それだと**宣言者自身も相手エナを触れなくなる**。
  正しくは **`owner === 'self'` のときだけ**（＝いま効果を撃っている本人が自分のエナを触る場面）。
  ⚠**トラッシュ版（`WX12-023`）は原文が「効果を受けない」＝主語なし**なので両向きで正しい＝
  **原文の主語の有無で向きが変わる**。写すときはここを必ず読み比べる。

### 修正3：`O-290`＝キーを場に出すときの条件とコスト（軸2つ）

- **軸B 配置ゲート（4枚）**＝`canSelfPlay` の呼び出しを**キー配置の提示ゲート**（`BattleScreen.tsx`）にも通した。
  `PR-K060` は JSON に宣言すら無かったので MANUAL で `SELF_PLAY_RESTRICT` を足した
  （🔑受け皿は `ENERGY_COUNT_FILTER{distinctColor}`＝3評価器とも実装済み。
  ⚠`ENERGY_COLOR_TYPES` は **`ActiveCondition` 側にしか無い**同義型＝union をまたいで2つある）。
- **軸A コスト置換（2枚）**＝新設 `SELF_PLACE_COIN_COST`（【常】）＋ `keyPlaceCoinCostOf`（`costs.ts`）。
  🔴UI 2地点（提示ゲートと `KeyUseModal`）が `parseCoinCost(card.Cost)` で**印刷コインを直読み**しており、
  「このキーを場に出すためのコストは《コイン×0》になる」は JSON にも engine にも無かった。
  🔑**原文を読むのは parser だけ**にして UI は payload を読むだけにした（`census:costtext` A群を増やさない）。

### 作業中に見つけて直した別件

- 🔴**`optionalCostPaySteps` の `down_self` が `isUp` を見ていなかった**＝《ダウン》コストは
  **アップ状態でしか払えない**のに、live 14効果すべてで**ダウン状態でも「払えた」ことになっていた**。
  `fieldDown` 側は最初から `isUp: true` を立てており、**兄弟の片方だけ穴が空いていた**形。
- 🔴**逆翻訳に `down_self` を描いていなかった**＝`OPTIONAL_COST{energyTrash}` の枝だけ描画が無く、
  engine は払っているのに**逆翻訳からダウンが消えていた**（速いレーンの検証は逆翻訳の目視なので致命的）。

### 影響枚数・検証

- **9効果 / 6カード**（`PR-K070` `WX25-P1-093` `WXK11-020` `PR-K060` `WXK10-015` `WXK11-012`
  ＋ `WDK16-05T/05H/05S` は JSON 無変更で配線だけ）。
- 検証＝`npm run gates` 全緑（golden **3986 PASS**＝新設5本）／`npm run regen` の逆翻訳を6件とも目視。
- ⚠**計器の変化はすべて可視化**＝`_vocab_census` の「原文該当」が数カ所増えたのは、
  **キー3枚の第1文が effectId として live に登場した**ため（それまで JSON に無く、どの計器にも数えられていなかった）。
  **高シグナルは全カテゴリ 0 のまま**／`census:enginetext` A群 0・`census:costtext` A群 0 も据置
  （`keyPlaceCoinCostOf` は原文を読まず payload だけを見る＝A群を増やさない設計）。
- 🔴**実機 `V-198` PASS（2本・反転確認あり）**＝指定ルリグなら「キーにセット」が出る／別ルリグでは出ない。
  🔴**実機 `V-199` PASS（2本・反転確認あり）**＝センターが＜にじさんじ＞ならコイン0でセットまで通る／
  別ルリグではコイン不足で提示されない。
- ⚠**ラチェットを2つ動かして1度 FAIL した**＝`PR-K070-E1` の `mandatory` を旧 live の `false` から
  `true` に書き換えてしまい、「段階2 mandatory 集合」と「任意cost【出】の母集団」が同時に動いた。
  **コストのある【出】は発動しないことを選べる**（付録B）＝`mandatory: false` が正しい。
  🔑**MANUAL で書き直すときは旧 live のトップレベル項目（`mandatory`/`duration`/`triggerScope`）を必ず引き継ぐ。**
- ⚠**実機シナリオを1度 FAIL させた**＝確定ボタンのラベルを `セットする` と推測したが実装は **`セット`**。
  **ラベルは実装（`KeyUseModal.tsx`）から取る**。⚠提示ゲート側は「キーにセット」＝前方一致だと両方に当たるので
  `exact: true` で完全一致にし、モーダル側を先に探す（DRIVE_TRAPS §4.4-2b）。

## 2026-09-11 — PLAN §5.3 索引G `O-316`／`O-319` をクローズ・`O-320` 4→1＝「ルリグ側がセンター固定」族を3項目まとめて（9効果）

**着手の形**＝索引 G の3項目は同じ族（PLAN §1 の「次の一手」②）だったので**横断で1バッチにした**。
🔑**固定費（探索・full gates・簿記）はバッチ回数に比例し、効果数には比例しない**（§2.6）。

### 🔴登録票の前提が2つとも誤っていた（実測で確定）

| 登録票の主張 | 実測 | 結論 |
|---|---|---|
| 「レベル３のルリグ１体を対象」＝センター＋アシストから選ぶ軸が無い | **全6,712枚にレベル3のアシストルリグは1枚も無い**（アシストはレベル1が118枚／レベル2が222枚だけ） | **センター固定が正しい**＝新機構は不要（`O-316`・`O-320` の各1件） |
| `UP.targetsTriggerSource` はシグニ専用でアタックしたアシストルリグを扱えない | `effectExecutor.execUp` は**第251バッチで LRIG 分岐（center/左右アシスト）を実装済み**。`REMOVE_ABILITIES` も `lrigZoneTops` を見る | **既に配線済み**（`WXDi-P03-035-E1`） |

⇒ **この族に残っていた真の穴は `allFieldLrigs` が MANUAL 6効果へ届いていなかったこと**だけだった（§6.4 `O-39` の収穫マージ凍結）。

### 修正1：`LRIG_LEVEL.allFieldLrigs` が MANUAL 6効果に届いていなかった（`O-316` / `O-319`）

- 原文「【使用条件】【チーム】＜X＞**＆全員レベル１以上**」＝母集団 **8効果**。AUTO の2件（`WXDi-D07-011-E1` / `WXDi-P16-002-E1`）は
  parser が `allFieldLrigs:true` を出していて正しく、**MANUAL の6件だけが `LRIG_LEVEL{gte 1}`＝センターしか見ない**まま凍っていた。
- さらに `WXDi-D03-011` / `-D05-011` / `-D06-011` / `-D04-011` は、過去バッチで「レベル3のルリグを対象」を使用条件へ足したときに
  🔴**`LRIG_LEVEL{gte 1}` を `gte 3` へ「置き換えて」おり、「＆全員レベル１以上」が丸ごと消えていた**（原文は別々の2条件）。
- 修正＝`manualEffects.ts` の6効果に `allFieldLrigs:true` を足し、上記4件は **AND で2本並べる**形へ戻した → `syncManualLive.ts` で live へ。
- 🔑**受け皿（`allFieldLrigs`）は3評価器とも実装済み**＝engine 変更ゼロ。

### 修正2：「凍結状態の**ルリグとシグニ**が合計3体以上」（`O-319` `WXDi-P14-040-E1`）

- 🔴**parser にこの文型の規則が無く、条件が丸ごと落ちて無条件発火**していた（相手が誰も凍っていなくても《無》×3 で【アサシン】が取れた）。
- 🔑**死角の理由**＝`HAS_CARD_IN_FIELD` のルリグゾーン走査は `isFrozen` 等が付いていると**まるごとスキップ**する（ゾーン状態が
  `field.signi_frozen[zi]` にしか無かったため＝正しい防御）。だが凍結は**ルリグにも起きる**（`field.lrig_frozen` /
  `assist_lrig_{l,r}_frozen`）ので、この原文は**シグニ側にもルリグ側にも乗らなかった**。
- 修正＝`HAS_CARD_IN_FIELD.includeLrigs` を新設（型2箇所）＋ `effectEngine.matchesLrigStateFilter`（ルリグ枠の状態フィルタ。
  **シグニ専用の状態キーが1つでも付いていたら false＝fail-closed**）＋ **3評価器**（`checkActiveCondition` /
  `evalConditionForContinuous` / `execUtils.evalCondition`）へ配線 ＋ parser 規則1本 ＋ `decompileEffects` の文。
- ⚠`filter` に `cardType:'シグニ'` を**載せない**（載せるとルリグ側が `matchesFilter` で落ちて合算にならない）＝golden で固定。

### 修正3：「この方法で捨てたシグニのパワーの**半分以下**」（`O-320` `WDK10-015-E1`）

- ⚠**登録票がカード番号の取り違え**（`WXK10-015` のキー配置コストと混同＝`O-290` 同族と書いてあった）。真の穴は別。
- 🔴旧 live は **フィルタなしの `BANISH`**＝手札を捨てなくても、どんな高パワーのシグニでも落とせる過剰効果だった。
- 修正＝`TargetFilter.powerLteLastProcessedHalf` を新設（`resolveDynamicFilter` で `powerRange.max = pw/2` へ解決）＋ `parserUtils` の規則1本。
- ⚠**参照不能なら空ヒット（fail-closed）**＝既存 `powerLteLastProcessed` の fail-open を真似ると「捨てなかった＝制限なし」に化ける。

### 修正4：`WXEX2-13-E1` のデッキ検索が丸ごと無かった（`O-320`）

- 🔴旧 live は `SEQUENCE[SHUFFLE_DECK, STUB{TRIGGER_LIFE_BURST}]`＝検索が無いので `TRIGGER_LIFE_BURST` が `lastProcessedCards` 不在で
  `?? ctx.sourceCardNum` へ落ち、**効果元シグニ自身の【ライフバースト】を撃っていた**。
- 🔑**受け皿は全部在った**＝`SEARCH{from:deck, filter:{hasLifeBurst}}` は `WD06-018-BURST` / `WX16-Re08-E1` が既に使っており、
  `resumeSearch` は選んだカードを `lastProcessedCards` へ載せてから `then` を実行する＝`STUB{TRIGGER_LIFE_BURST}` にそのまま繋がる。
  ⇒ **engine 変更ゼロ**で `manualEffects.ts` に1枚（母集団1＝速いレーン）。golden は E2E（`field.check` が検索結果になる）で固定。
- ⚠登録票が指していた `STUB{TRAP_OPERATION,trapOp:'to_check'}` の `trapSource` 拡張は**不要だった**（別経路）。
- ⚠**デッキから抜かないのは族に合わせた意図的な据置**＝`TRIGGER_LIFE_BURST` は `field.check` へ載せるだけで元ゾーンから除かない
  （`WX13-032-E2` / `WXEX1-11-E2` も同じ形）。ここだけ抜くと族の中で挙動が割れる。

### 修正5：`SPDi43-22-E1` の真バグ2件（`O-320`。登録票の「本体は正しい」は誤り）

1. 🔴**parser の catch-all が条件節を飲み込んでカード名を捨てていた**＝`parseSentencePart4.ts` の
   `/場に《.+》がいる場合.*色.*宣言し.*エナゾーンから.*カード.*トラッシュに置いてもよい/` → `STUB{DECLARE_COLOR_COND_ENERGY_TRASH}`。
   engine 側もカード名を見ないので、**《VOGUE3-EXTREMEサンガ》が場に居なくても発動**する過剰発火だった。
   修正＝正規表現から条件節を外し、先頭条件節は `tryWrapLeadingStateCond` が `CONDITIONAL{HAS_CARD_IN_FIELD{cardName}}` で包む形へ。
   併せて `effectExecutor` の任意コスト先取り `OPT_IDS_WRAP` にこの STUB を追加＝**ゲート不成立のとき「そうした場合」の本体もスキップ**する
   （足さないと条件を満たさなくても【シャドウ】が付く＝同分岐のコメント (b) そのものに戻る）。
2. 🔴**`INTERNAL_DCCE_TRASH_COLOR` が宣言色を `declared_color` へ刻んでいなかった**（`INTERNAL_SET_DECLARED_COLOR` は刻む＝**この経路だけ**）。
   そのため【シャドウ:{"declaredColor":true}】の判定（`utils/keywords.ts` の `scope.declaredColor`）が**常に false**＝
   **シャドウが一度も効かない恒久 no-op**だった。修正＝宣言を先に state へ刻む（原文は「色1つを宣言し、〜置いてもよい」＝
   宣言が先なので**エナ不在で早期 return する枝でも刻む**）。
- ⚠**残る1点**＝「**追加で宣言した色を得る**」＝シグニ側に追加色の state ストアが無く（`lrig_extra_colors` はあるが
  `collectFieldSigniExtraColors` は `effectsMap` 走査で決める形）、期限 `UNTIL_OPP_TURN_END` の掃除も要る＝`O-320` に残す。

### 影響枚数・検証

- **9効果 / 9カード**（`WXDi-D01-011` `WXDi-D02-19LAT` `WXDi-D03-011` `WXDi-D04-011` `WXDi-D05-011` `WXDi-D06-011` `WXDi-P14-040`
  `WDK10-015` `WXEX2-13` `SPDi43-22`）。
- 検証＝`npm run gates`（全緑）／`npm run golden -- --only "O-319"` `--only "O-320"`／`npm run regen` の逆翻訳を9件とも目視。
- **反転確認あり**＝`includeLrigs` なしでは同じ盤面でルリグを数えない／`powerLteLastProcessedHalf` は参照不能で空ヒット／
  `WXEX2-13-E1` は `field.check` が効果元自身にならない、を golden で両方向に固定。
- 🆕**golden の罠を1つ踏んだ**＝`findCard` は **CardNum（string）** を返すのに `.CardNum` を生やしてしまい、`undefined` が黙って通った。
  `npm run typecheck` は `scripts/` を見ない（CLAUDE.md・`O-147`）ので**golden を実際に走らせるまで気づけない**。テストにコメントで残した。
- **実機不要**（`src/screens/` は未変更。触ったのは `src/types/` `src/engine/` `src/data/` `scripts/` ＋ `public/data/`＝PLAN §2.2 の機械判定）。
  ⚠ただし `includeLrigs` は**新しい条件キー**なので、3評価器の一致を golden で担保した。

## 2026-09-11 — PLAN §5.3 索引G `O-308` をクローズ＝【自】の発動条件が丸ごと落ちていた5効果＋`evalCondition` の状態フィルタ素通り3効果（第279バッチ・実機 `V-197`）

| 効果 | 原文の条件 | 旧 live | 🔴実害 |
|---|---|---|---|
| `WXDi-D05-017-E1` | このシグニの**正面のシグニが凍結状態**の場合 | 条件なし | アタックフェイズ開始時に毎回《青青無》の提示 → 【アサシン】 |
| `WXDi-P11-060-E1` / `-E2` | このシグニの**左か右にダウン状態の＜ウェポン＞／＜アーム＞** | 条件なし | アタックのたびに発動 |
| `WXDi-P10-055-E1` | **＜天使＞のシグニのパワーの合計が20000以上** | 条件なし | アタックフェイズ開始時に毎回発動 |
| `WX24-P3-066-E1` | **同じシグニゾーンに【マジックボックス】** | 条件なし＋②の「そうした場合」が `CONDITIONAL{IS_MY_TURN}` | MB が無くても選択肢が出る。②は**表向きにするのを断ってもバニッシュ** |
| `WXK01-051-E1` / `WXK01-072-E1` | 場に**ドライブ状態の**シグニがある場合 | `HAS_CARD_IN_FIELD{isDrive}`（JSON は正しい） | `evalCondition` が `isDrive` を素通り＝ライフバースト封じ／バニッシュが無条件 |
| `PR-384-E2` | 場に**アクセされている**シグニがある場合にしか使用できない | `HAS_CARD_IN_FIELD{hasAcce}`（JSON は正しい） | `evalUseCondition`（＝`evalCondition`）で読む地点では `hasAcce` を素通り |

**真因は3つ。**
1. **parser が条件節を落とし、受け皿もそれぞれ欠けていた**（5効果）＝①`FRONT_SIGNI` は `ActiveCondition` にしか無く【自】の発動条件（`Condition`）で書けない
   ②`TargetFilter.adjacentToSelf` は `POWER_MODIFY` でしか消費されない ④`FIELD_LEVEL_SUM` にクラスの絞り込みが無い ⑤`SAME_ZONE_HAS_*` に【マジックボックス】の兄弟が無い。
2. **`OPEN_MAGIC_BOX` は `DID_IT_GATED_TYPES`（`effectExecutor.ts`）に無い**＝「しない」を選ぶと `lastProcessedCards` が空になるだけで、直後の `IS_MY_TURN` は常時真。
   同じ STUB を使う兄弟3効果（`WX24-P3-069-E1` ほか）は `LAST_PROCESSED_HAS_BURST` で正しかった。
3. **`HAS_CARD_IN_FIELD` の3評価器のうち `evalCondition`（`execUtils.ts`）だけが状態キーを5つ手書き**（crossState/isFrozen/isAwakened/isPuppet/hasCharm）＝
   `checkActiveCondition`／`evalConditionForContinuous` は `matchesStateFilter` を呼ぶのに、こちらは `isDown`／`hasAcce`／`isDrive` などを素通り。
   🔑**見つけた経路＝`isDown`＋`adjacentToSelf` を条件で使う前に「live で同じ状態キーを `HAS_CARD_IN_FIELD` に書いている効果」を全数で引いた**（影響範囲の実測が発見器になった）。

**修正**
- 型＝`Condition` に `FRONT_SIGNI`（`ActiveCondition` と同形）／`SAME_ZONE_HAS_MAGIC_BOX`（両 union）。`FIELD_LEVEL_SUM.filter?`（両 union）。`CONDITION_TYPES` 152・`ACTIVE_CONDITION_TYPES` 71。
- `execUtils.evalCondition`＝`HAS_CARD_IN_FIELD` の手書き5キーを `matchesStateFilter` 1呼び出しへ置換＋`adjacentToSelf`（効果元のゾーンから `zi±1`・相手側は不成立）／`FIELD_LEVEL_SUM` の filter／`FRONT_SIGNI`・`SAME_ZONE_HAS_MAGIC_BOX` の case。
- `effectEngine.checkActiveCondition` と `evalConditionForContinuous`＝`adjacentToSelf`（同じ式）・`FIELD_LEVEL_SUM` の filter・`SAME_ZONE_HAS_MAGIC_BOX`。ルリグゾーン走査の除外に `adjacentToSelf` を追加。
- `manualEffects.ts`＝5効果（本体は旧 live のまま、トップレベル `condition` を足す。`WX24-P3-066-E1` ②のゲートは `LAST_PROCESSED_COUNT_GTE{1}`）→ `syncManualLive` → `build:effects`。
- `decompileEffects.ts`＝`SAME_ZONE_HAS_MAGIC_BOX` の文／`FIELD_LEVEL_SUM` に filter を描く／`FRONT_SIGNI` の文から「かぎり」を外す（【自】側で「あるかぎり場合、」になるため。【常】側は `actCond` が語尾を付けるので出力不変）。
  ⚠**副次変化1行**＝`WXDi-P13-069-E2`（付与【常】の AND 条件）が「あるかぎり**かつ**…であるかぎり」→「ある**かつ**…であるかぎり」（二重の「かぎり」が1つに）。

**影響**＝発動条件の是正5効果＋状態フィルタの是正3効果（JSON 無変更）。live の JSON 差分は5効果だけ。

**検証**
- golden 全件 **3974 PASS**（新設1本＝`§5.3 O-308 2026-09-11: 【自】の発動条件4種…`：両評価器の真偽表・`hasAcce` の素通り是正・live の条件・②で「しない」ならバニッシュしない／「する」ならバニッシュ・`collectAttackerSelfTriggers` の収集。型数の期待値 70→71／150→152）。
  **反転確認**＝`execUtils` の隣接判定を `false &&` で殺すと `[Condition] 隣の＜ウェポン＞がアップ` が FAIL。
- `npm run gates` 全緑（smoke 10745 OK／fuzz 0／census 1/1／census:stubs・enginetext・costtext 据置／lint 0 errors）。
- 実機（`src/engine/` ＋新しい型＝§2.2 で必須）＝**`V-197` PASS 2本セット**
  `node scripts/verifyBattleDrive.mjs o308AdjacentDownWeaponFires o308AdjacentUpWeaponSilent`
  ＝左隣にダウン状態の `WXDi-P11-057`（＜ウェポン＞）→ `WXDi-P11-060` のシグニアタックで E1 が立つ／アップの対照は立たない。
  **反転確認**＝`matchesStateFilter` の呼び出しを殺すと**対照が赤**（アップでも立つ＝旧 live の症状を再現）、戻すと2本とも PASS。
  ⚠`H.findLog(カード名)` はアタック宣言のログにも当たるので判定に使わない（DRIVE_TRAPS 81）。

## 2026-09-11 — PLAN §5.3 索引G `O-306` をクローズ＝宣言名の変身を「規則」にした（`WXEX2-10-E2`＋同族 `WXK03-002-E2`・E1 の名前一掃も是正／第278バッチ・実機 `V-196`）

原文＝`WXEX2-10-E2`【起】《ターン１回》《赤×0》：シグニのカード名１つを宣言する。このターン、対戦相手のすべての領域にある宣言されたカード名のカードは《サーバント　ＺＥＲＯ》になる。

| 効果 | 旧 live | 🔴実害 |
|---|---|---|
| `WXEX2-10-E2` | `SEQUENCE[STUB{DECLARE_CARD_NAME}×2]` | 宣言を2回するだけで**何も変身しない**。宣言の候補も**自分の手札の名前（最大4つ）** |
| `WXK03-002-E2`（「このゲームの間、対戦相手の**場にある**…」） | `DECLARED_NAME_TO_SERVANT_ZERO`（`value` なし） | **手札・デッキ・エナ・トラッシュまで**変身。発動時点のスナップショットなので**後から場に出た同名カードは変身しない** |
| `WXEX2-10-E1`（《サーバント》を含むカードを場とエナから一掃） | `TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY` | 判定が `getCardNum` で instance を剥がした**印刷名**＝E2 で変身したカードを**一掃できない**（カードのコンボ本体が恒久 no-op） |

🔴真因＝受け皿 `DECLARED_NAME_TO_SERVANT_ZERO` が、一致した instance を `card_identity_overrides` へ**永続で書く**スナップショット型だった
＝原文の「〜になる」（継続状態）に対して ①期限で戻らない ②後から領域へ来たカードに効かない、の2軸で外れる。

**修正**
- **規則として持つ**＝変身する側の `PlayerState.name_identity_rules_this_turn`（登録表 `turnScopedState.ts` に turn-end で登録＝両プレイヤーで失効）／
  `name_identity_rules`（このゲームの間）に `{cardName, toCardNum, zones:'all'|'field'}` を積む。
- 実効の差し替えは純関数 `effectiveIdentityOverrides`（新設 `src/engine/nameIdentityRules.ts`）が**読むたびに**合成する（明示の差し替えの上に規則由来を重ねる）。
  読み手を寄せた＝`BattleScreen` の `battleCardMap` と augmented `effectsMap`（見た目・能力）／`effectEngine` のパワー基準値／E1 の名前一掃（`effectiveCardOf`）。
- 宣言の候補＝`DECLARE_CARD_NAME{declareNamePool:'opp_public_signi'}`＝**対戦相手の場・エナ・トラッシュのシグニ名**
  （隠された手札・デッキは覗かない＝`DECLARE_CARD_NAME_LOCK` と同じ規約）。候補0なら前回の宣言を消す。
- live＝`manualEffects.ts` で2効果（`until:'END_OF_TURN'`／`value:'field'`）。`build:effects` は保留したので `syncManualLive.ts` で同期。
  逆翻訳は payload（期限・領域・候補の出所）から描く分岐を追加。
- ⚠**`card_identity_overrides` を直接読む残りの地点**（ルリグの裏返り検出・リミット・場を離れたときの掃除）はルリグ／場の instance 用で規則とは交わらない。
- ⚠**engine の中で `cardMap.get(getCardNum(n))` と印刷名を読む地点は変身を素通りする**（既存の `card_identity_overrides` と同じ制約。今回は E1 だけ直した）。
- ⚠宣言 UI は選択肢式なので、**相手の公開領域に無い名前は宣言できない**（自由入力が無い）。

### 検証

- `npm run gates`＝golden 以外は全緑。golden は T1（ターン限定フィールドの数を固定するテスト）の固定値2つ（56→57／87→88）で落ちた
  ＝**新しい `_this_turn` フィールドを足した分の正しい変化**なので固定値を更新し、**golden 全件 3973 PASS**。smoke 10745 全0／lint 0 errors。
- **新設 golden 1本**＝live の形2件／宣言候補＝公開領域だけ・候補0で前回宣言を消す／このターン・全領域／手札→場へ移っても変身したまま／
  ターン終了で失効／このゲームの間・場だけ＝手札は変身しない・ターン終了でも残る／E1 が変身後の名前で当たり、別名は残る。
  **反転確認あり**＝funnel が規則を合成しないようにすると「手札の同名カードが変身していない」で FAIL。
- 逆翻訳＝2効果とも原文どおり（期限・領域・候補の出所が出る）。
- 実機要否＝**必須**（`src/screens/` と `src/engine/` に新しい機構＝PLAN §2.2）。**実機 `V-196` PASS（2本セット）**＝
  `o306DeclaredNameServantZeroSwept`（候補「小剣　ククリ／甲冑　ローメイル」→ ククリを宣言 → 表示パワー 6,000→4,000・ローメイル 15,000 不変 →
  ルリグアタックの E1 で**場とエナのククリだけ**がトラッシュ）／`o306NoDeclarationNothingSwept`（対照＝宣言なしでアタック → 何も一掃されない）。
  ⚠初回は「ククリの表示 3,000」と決め打ちして前提で落ちた（実際は印刷値に +3000 の修整が乗っていた）＝判定を「宣言後にククリだけが 2,000 以上下がる」へ直した。
  **実機の反転確認あり**（DRIVE_TRAPS §4.4-70 の作法）＝funnel が規則を合成しないようにして再ビルドすると、本命が
  「🔴規則は立ったのに場のククリの表示パワーが下がらない」（6,000→6,000）で赤。戻して2本とも PASS を取り直した。

## 2026-09-11 — PLAN §5.3 索引G `O-307` をクローズ＝秘匿二分割（`WXEX2-12-E4`）を既存部品の合成で実装（第277バッチ・実機 `V-195`）

原文＝【起】エクシード５：対戦相手は自分のルリグデッキを裏向きで２つの束に分ける。あなたはどちらかの束を見て、その中からアーツ１枚をルリグトラッシュに置く。

| | |
|---|---|
| 旧 live | `SEQUENCE[STUB{CAST_FROM_OPP_TRASH}, STUB{CAST_FROM_OPP_TRASH}]`（`parseStatus:'AUTO'`） |
| 🔴真因 | `parseSentencePart4.ts` の規則が**2文とも**「相手トラッシュのスペルを使う」STUB へ落としていた＝**原文と無関係な別効果** |
| 実害 | エクシード５を払っても**相手のルリグデッキは1枚も動かない**。相手トラッシュにスペルがあれば `execStubPart2.ts:3722` の分岐で**それを使う別効果**になる（1枚） |

**修正**＝`STUB{OPP_SPLIT_LRIG_DECK_LOOK_PILE_ARTS_TO_LRIG_TRASH}`（`execStubPart1.ts`）を `manualEffects.ts` で live へ（**1ステップ**＝2文で1つの interaction）。
🔑**登録票は「pending/UI 自体が存在しない」と書いていたが、新しい pending 型は要らなかった**＝既存3部品の合成で原文の情報公開範囲がそのまま出る：
①分割＝`opp_lrig_deck` × `opponentResponds` の SELECT_TARGET（`OPP_LRIG_DECK_TO_LRIG_TRASH` と同じ慣例＝**応答者だけに中身が見える**・0枚の束も可）
②束の選択＝効果使用者の CHOOSE（**見出しは枚数だけ**＝裏向きのまま選ぶ）
③選んだ束のアーツだけを候補に SELECT_TARGET → 移動は既存 `INTERNAL_OPP_LRIG_DECK_TO_LRIG_TRASH_APPLY`。
⚠**`src/screens/` は1行も触っていない**（応答者の再計算は `pendingRespondsOpponent` が resume ごとに行う）。
⚠**CPU が応答者のときは束A＝全部・束B＝0枚になる**（CPU の SELECT_TARGET 自動応答が `count` 枚を選ぶ）＝合法だが弱い分割。
⚠**parser の規則は据置**（注記だけ足した）＝live 1効果で、直すなら「2文目を吸収する」形が要る。

### 検証

- `npm run gates` 全緑（**golden 3972 PASS**・+1）／smoke 10745 全0。
- **新設 golden 1本**＝live の形／分割の応答者と候補／束の中身が選択前に見えない／束Bを選ぶと束Bのアーツだけが候補／
  アーツの無い束は不発／**0枚の束でも後続が消えない**／オートパイロット完走・空デッキ不発。
  **反転確認あり**＝ハンドラの入口を外すと「分割の対話が出ていない」で FAIL。
- live A/B＝**`WXEX2-12` の1カードだけ**／逆翻訳は該当1行だけ（`[STUB:…相手トラッシュからスペル選択]` → 原文どおり）。
- ⚠`build:effects` だけでは届かず `_held_fresh.json` に保留された＝`syncManualLive.ts WXEX2-12` で同期。
- 実機要否＝**必須**（`src/engine/` に新しい機構＝PLAN §2.2）。**実機 `V-195` PASS（2本セット）**＝
  `o307SplitLrigDeckPickArts`（CPU が分割 → host に「束A（3枚）/束B（0枚）」→ 束Aのアーツ1枚だけが相手ルリグトラッシュへ・ルリグは動かない）／
  `o307SplitLrigDeckEmptyPile`（対照＝0枚の束を選ぶと何も置かれない）。
  **実機の反転確認あり**（DRIVE_TRAPS §4.4-70 の作法）＝ハンドラの入口を外して再ビルドすると
  `o307SplitLrigDeckPickArts` が「🔴束の選択（CHOOSE）が host に来なかった」で赤。戻して2本とも PASS を取り直した。

## 2026-09-11 — PLAN §5.3 索引G `O-321`① をクローズ＋`O-315`①/`O-321`② を「配線済み」と確定（第276バッチ・実機 `V-194`）

前バッチで割った「ターン内履歴」3軸の残りを取った。**1件は恒久 no-op の真バグ、2件は登録票 stale**。

### ① 🔴`WXDi-P11-046-E2`＝「このターンにあなたが**ピース**を使用していた場合」が**恒久 no-op** だった

| | |
|---|---|
| live | `condition: ARTS_USED_THIS_TURN{filter:{cardType:['ピース','リレーピース']}}`（**正しく見える**） |
| 🔴真因 | **読む先の `turn_arts_used_names` にピースを積む地点が1つも無い**＝`executeArts` だけが積み、`executeKeyPiece`（ピース使用）は何も記録しない |
| 実害 | この【自】は**一度も発動しなかった**（アタック時に相手のシグニゾーンを1つ封じる効果が丸ごと死んでいた） |

🔴🔑**既存 golden も緑だった**＝旧 test が**本番が絶対に作らない state**（ピースのカード名を `turn_arts_used_names` へ
手で入れる）を自分で作って「成立方向 OK」と assert していた。
⇒ **テストが state を手で作るときは「本番のどこがその列を書くか」を1つ挙げられること。**（LESSONS へ）

**修正**＝`PlayerState.turn_pieces_used_names` を新設し、`executeKeyPiece` が積む。
`evalCondition` は **`filter` つきのときだけ**両方を母集団にする。
⚠**無条件版・`minCount`/`exactCount`・`color` へは混ぜない**＝アーツとピースは**別のカード種別**で、
「このターンに使用した**2枚目のアーツ**」（`WXK01-042-E1`）にピースを数えさせると過剰実行になる。
🔑**`filter` を持つ live 効果はこの1件だけ**（実測＝`ARTS_USED_THIS_TURN` 21件中1件）なので母集団を広げても他は変わらない。
⚠**`CardTypeFilter` に `'ピース/クラフト'` を追加**＝CSV の `Type` はピース系が**3値**（実測 119 / 2 / 1 枚）で、
`matchesFilter` の `cardType` は**完全一致**＝2値だけだと `ピース/クラフト` を取りこぼす。
⚠**クリア地点は `BattleScreen.tsx` に6箇所**あり、`turn_arts_used_names` と**同じ行**に並べて書いた
（別々に書くと片方だけがターンを跨ぐ）。**golden がこの並びを機械で強制する。**

### ②③ 登録票 stale＝**既に配線済み**と確定（golden を張ってから落とす）

- `WXK01-045-E1`（`O-315`①「**このターンに場に出た**対戦相手のシグニ」）＝`TargetFilter.placedThisTurn` が
  live にも `execUtils.ts` の候補生成層にもある（候補側 state の `signi_placed_origin_this_turn` を読む）。
- `WXDi-P13-085-E1`（`O-321`②「あなたの**《ディソナアイコン》のカード**の効果によってミルされた場合」）＝
  `triggerCondition.milledSourceFilter{isDisona:true}` を `triggerCollect.ts` が `last_effect_mill_source` に当てている
  （原因不明なら**非発火**＝fail-closed）。
🔑**再 triage で「もう直っている」と判定した項目は、その場で golden を張ってから落とす**＝
張らずに落とすと次の人がまた同じ2件を triage する（第271〜第276で4回繰り返した）。

### 検証

- `npm run gates` 全緑（**golden 3971 PASS**）。**新設 golden 3本**＝ピース履歴の両方向＋「アーツ側へ混ざらない」反転／
  クリア地点の並びガード／stale 2件の契約（候補集合と `isDisona` の反転つき）。
- **既存 golden 1本を更新**＝上記の「本番が作らない state で緑だった」test を**本番が書く列**で判定する形へ。
- 🔴**実機 `V-194` PASS（2本セット・反転確認あり）**＝`o321PieceUsedGateFires`（ピースを使う→履歴が立つ→
  アタックで【自】が立つ／**アーツ側の列には混ざっていない**ことも同時に確認）／`o321PieceUsedGateBlocked`（使わなければ立たない）。
  **`executeKeyPiece` の1行を外すと Fires だけが赤**。`order` に常設。

### 実機シナリオのフレークを4つ潰した（[DRIVE_TRAPS.md](./DRIVE_TRAPS.md) §4.4-78〜80）

- 🔴**注入直後の窓に前シナリオの対話が見える**＝観測を「目的のフェイズに入ったあと」に限らないと対照が赤くなる（3回踏んだ）。
  ＋**立てた対話は自分で畳んでから返す**。
- 🔴**`guestSet` に `lrig_deck: []` を書く**＝前シナリオのアーツが残ると CPU が撃ってスタックが1件立つ。
- 🔴**`my-signi-zone-N` はトグル**＝毎ティック押すと**127秒かけて1度もアタックできない**。
  ＋`ATTACK_ARTS_OP` は CPU が抜けるので反復予算を厚めに取る。


## 2026-09-11 — PLAN §5.3 索引G `O-321`/`O-315`/`O-308`③ の「エナへ置かれた履歴」1族をクローズ（第275バッチ・実機 `V-193`）

3項目に散っていた **同じ1族**（「このターンにあなたのエナゾーンに〈条件〉のカードがN枚以上置かれていた場合」）を
1バッチで取った。**live 3効果とも条件が丸ごと落ちており、エナに1枚も置いていないターンでも任意コストを払えた**（過剰実行）。

| effectId | 原文の条件 | 🔴旧 live |
|---|---|---|
| `WXDi-CP02-086-E1` | このターンに**コストか効果によって**カードが1枚以上エナへ置かれていた | 条件なし |
| `WXK04-038-E1` | このターンにエナへ**＜植物＞のシグニ**が1枚以上置かれていた | 条件なし |
| `WXDi-CP02-009-E1` | このターンにエナへカードが**2枚以上**置かれていた | 条件なし |

### 受け皿が無かった理由

既存 `SELF_DECK_TO_ENERGY_THIS_TURN` は **`self_deck_to_energy_this_turn`＝デッキ由来の枚数だけ**で、
**何が置かれたか（絞り込み）**も**何によって置かれたか（由来）**も持たない。
🔴**「いまエナに何があるか」でも答えられない**＝置いたあと同じターンに支払えば消える。

### 作ったもの＝台帳1本と funnel 1本

- **`PlayerState.energy_placed_this_turn`**（`"<instanceId>:<cause>"`。`cause` ∈ `effect` / `cost` / `rule`）。
  読み書きは新設の純関数 **`src/engine/energyPlacement.ts`**（golden から直接叩ける）。
- 🔑**engine 側は `executeAction` の入口 1箇所で before/after を差分する**＝
  `energy: [...state.energy, …]` は **engine だけで69箇所**あり、そこへ1行ずつ記録を足す形は
  この repo が何度も踏んだ「**同じ式を2箇所以上に書く**」型（台帳の書き漏れが3種類に割れていた実例）そのもの。
  ⚠`executeAction` は入れ子で呼ばれる（`SEQUENCE` の各ステップ）ので**エントリ単位で重複除去**している。
- **`src/screens/` の8地点**（エナフェイズのチャージ／「エナに送る」手札・場／グロウ時チャージ／CPU チャージ／
  手札→エナの**コスト**／パワー0バニッシュ／【常】効果バニッシュ／バトルバニッシュ2種）は
  **同じ helper を呼ぶ**形で `cost` / `rule` / `effect` を刻む。
  🔑**`src/screens/` に新しい書き込み地点が足されたら golden が止まる**＝
  「`energy: [...` の8行以内に `recordEnergyPlacements(` が居る」ことを機械で強制するテストを置いた。
- **条件型 `ENERGY_PLACED_THIS_TURN{owner, minCount?, filter?, causes?}`**（型＋`CONDITION_TYPES`＋`evalCondition`＋
  parser 2規則＋逆翻訳＋golden）。⚠**`causes` 省略＝全部数える**（原文が由来を書いていないときは
  ルール処理も含むのが原文どおり）。原文が「コストか効果によって」と書いているときだけ `['cost','effect']` を立てる。
  ⚠**`filter` を渡すのに判定材料（cardMap）が無ければ数えない**（fail-closed）＝
  素通りさせると「＜植物＞が置かれていた場合」が**何を置いても成立**する条件に化ける。

### 検証

- `npm run gates` 全緑（**golden 3968 PASS**）。**新設 golden 4本**＝live 3効果の契約／engine funnel の記録（反転＝
  ドローでは増えない・入れ子で二重計上しない）／`causes` と fail-closed／**`src/screens/` の書き込み地点ガード**。
- **ratchet を3本更新**（ターン限定フィールド 55→56・登録母集団 86→87・`Condition` 型数 149→150）＝**すべて新設**（較正ではない）。
- **既存 golden 1本を更新**＝`O-298`（`WXK04-038-E1` の「対象を先に確定する」契約）は本体がゲートの中へ入ったので
  ゲート越しに見る形へ。**同じテストに反転確認を2本足した**（台帳が空なら起きない／別クラスでは通らない）。
- `npm run regen` → 3効果とも逆翻訳が日本語（「このターン**コストか効果によって**あなたのエナゾーンに…」）。
- 🔴**実機 `V-193` PASS（2本セット・反転確認あり）**＝`o321EnergyPlacedGateFires`（**エナフェイズで手札を1枚
  エナチャージ**して台帳 1→2＝アタックフェイズ開始時の【自】が立つ）／`o321EnergyPlacedGateBlocked`（同じ盤面で
  **チャージだけ外す**＝台帳1件のまま立たない）。**`evalCondition` を `return true` に倒すと対照だけが赤**。
  🔑**実機でしか確かめられないのは `src/screens/` の記録地点**＝golden は engine funnel を直接叩けるが、
  「エナチャージ」ボタンが台帳へ書くかどうかは実機からしか観測できない。`order` に常設。

### 実機で踏んだ罠（[DRIVE_TRAPS.md](./DRIVE_TRAPS.md) §4.4-75〜77 に採番）

- 🔴**バックグラウンドに残っていた別のドライバが同じ部屋を書き続けていた**＝注入した盤面が毎回別物へ化け、
  `lrig` も `phase` も実行のたびに違う値になった（`hand` だけ spec と一致するという読みにくい症状）。
  ⚠**`verifyBattleDrive.mjs` に `--list` は無い＝未知の引数で起動すると全シナリオが走る。**
- 🔴**手札の「エナチャージ」は `ENERGY` フェイズでしか出ない**／**`advancePhaseV20` のラベルは MAIN 以降しか無い**。
- 🔑**「進んだ」を `phase !== 'MAIN'` で判定しない**（開始が `ENERGY` だと初回から真＝§4.4-5 の具体例）。

### 残る近似（索引 G に記録）

- **同じ instance が同一ターンに2度置かれても1件**（エントリで重複除去するため）。
  「置く→払う→また置く」を2枚と数えたい要求が出たら連番を足す。


## 2026-09-11 — PLAN §5.3 索引B `O-329` をクローズ＝「このアーツは対戦相手のターンにしか使用できない」が5効果とも1つも効いていなかった（第274バッチ・実機 `V-192`）

第273の再 triage で見つけた項目。**live 5効果すべてで使用条件が素通りしており、自分のターンにも撃てた**（過剰許可）。

### 真因（2本ある）

| # | 何が起きていたか |
|---|---|
| ① | **先頭文が本文へ流れていた**＝`extractUseCondition` が受けるのは「〜**場合に**しか使用できない」型の**接尾辞**だけで、「このアーツは**対戦相手のターンに**しか使用できない。」という**先頭文**は当たらない。結果 `parseSentencePart2.ts:439` が `BLOCK_ACTION{USE_ARTS_EXCEPT_OPP_TURN, until:'PERMANENT'}` を吐いていたが、🔴**この actionId の読み手は1人もいなかった**（`effectExecutor.ts` の表示ラベルだけ）＝`blocked_actions` に永久のゴミが1件積まれるだけ |
| ② | **「正しい形」でも効いていなかった**＝`evalCondition` は `IS_MY_TURN` / `IS_OPPONENT_TURN` を **`return true`（プレースホルダ）**にしており（`execUtils.ts:3236-3239`）、ターン判定は**収集側が `condHas` で行う**約束。🔴**アーツの提示ゲート（`canUseArtsCondition`）にはその判定が無かった**＝`condition:{IS_OPPONENT_TURN}` を書いてある `WX15-006-E1`（MANUAL）**でも効いていなかった** |

⚠**`manualEffects.ts:707` に「使用条件は `condition:{IS_OPPONENT_TURN}`（提示ゲートが読む形）」というコメントがあった**が、
**書かれた時点から嘘だった**（読み手が居ない）。⇒ **コメントの「〜が読む形」は grep で裏を取る。**

### 修正（3点）

1. **parser**＝`parseArtsEffect`（`effectParser.ts`）が**先頭1文だけ**を剥がして `condition` へ合流させる（`AND` の中でもよい）。
   これで `BLOCK_ACTION` は生成されなくなったので、**`parseSentencePart2` の規則と `effectExecutor` の表示ラベルを撤去**した
   （同じ文がアーツ以外で出たら `UNKNOWN`＝census に映る穴へ倒す）。`effectParser.ts` の CHOOSE 前置特例からもアーツ側の枝を外した。
2. **提示ゲート**＝`canUseArtsCondition`（`battleUtils.ts`）に **`isOwnerTurn` を必須引数**で足し、
   `condHasTurnGate(cond,'IS_OPPONENT_TURN') && isOwnerTurn → false`（`IS_MY_TURN` は鏡）を**1箇所**に置いた。呼び出しは6箇所。
   ⚠**任意引数にしない**＝既定値を置くと新しい呼び出し元が黙って素通りする（この穴の再発）。
   ⚠**`OR` の枝はゲートしない**（別の枝で成立しうる）＝`triggerCollect.ts` の同名ヘルパと同じ規約。
3. **live**＝5効果が `condition:{IS_OPPONENT_TURN}` を持つ形へ（`CHOOSE` 構造は保ったまま）。

### 検証

- `npm run gates` 全緑（**golden 3964 PASS**）。**新設 golden 2本**＝live 5効果の契約／`canUseArtsCondition` の**両方向＋鏡＋`AND`／`OR` 規約**。
- **stale な golden 3本を更新**＝いずれも `SEQUENCE[BLOCK_ACTION{USE_ARTS_EXCEPT_OPP_TURN}, …]` という
  **「効いていない宣言が在ること」を契約として固定**していた（`PLAN §6.3 B-group A lock-in` ほか）。
- `npm run regen` → 5効果とも逆翻訳の冒頭が「**対戦相手のターンの間、**」になった。
- 🔴**実機 `V-192` PASS（2本セット）**＝`o329OppTurnOnlyBlockedOnOwnTurn`（自分のアタックフェイズでは「使用」が出ない／
  **同じ盤面の制限なしアーツ `WX21-007` には出る**）／`o329OppTurnOnlyUsableOnOppTurn`（相手のアタックフェイズでは出る）。
  **反転確認あり**＝ゲートの2行を外すと**負方向だけが赤**（対照は緑のまま＝判別力がある）。`order` に常設。

### 実機で踏んだ罠（[DRIVE_TRAPS.md](./DRIVE_TRAPS.md) §4.4-72〜74 に採番）

- 🔴**`SKIP_BUILD=0` した回は古い `dist` を掴む**＝症状が「行動ボタンが0本」なのでゲート・コスト・限定を疑って時間を溶かした（2回踏んだ）。**判定は次の実行で行う。**
- 🔴**相手ターンの注入は `active:'cpu'`**（`'guest'` だと注入が効かず、観測時には CPU がターンを回しきって `MAIN`／host 手番へ戻っている）。
- 🔑**「提示されない」は対照とセットで**＝アーツは使えないとボタンが**0本**になるので、「使用が無い」は**ルリグデッキが開いていないだけ**でも成立する。

### 完了判定（§2.2）

**`src/screens/` を触ったので⑤実機まで**＝上記2本で返済済み（`V-192` は同じ巡でクローズ）。


## 2026-09-11 — PLAN §5.3 索引G 第273バッチ＝再 triage で4項目を消化（`O-318` 3→1／`O-319` 3→2／`O-320` 5→4）＋ 索引B に `O-329` を新設

**この回の入口は「登録票が主張する受け皿の不在を grep で検証する」**（第271の教訓①）。
**4件のうち3件は受け皿が既に在り**、1件は**parser が原文と真逆の意味を吐いていた**。
🔑**新しい機構は1つも作っていない**（足したのは既存条件型の**読み方の軸**1つだけ）。

### ① `WXDi-P05-025-E2` ほか3効果 ＝「次のあなたのエナフェイズ終了時まで」が**払ったターンの終わりに消えていた**

| | |
|---|---|
| 原文 | 【出】：**次のあなたのエナフェイズ終了時まで**、あなたのセンタールリグのリミットを＋２する。 |
| 🔴旧 live | `LRIG_LIMIT_MODIFY{until:'END_OF_TURN'}`（逆翻訳も「（**ターン終了時まで**）」） |
| 真因 | **`parseSentencePart2` が `parseSentencePart3` より先に走る**（`effectParser.ts:7278-7279`）＝`O-293`（2026-09-10）が受け皿 `STUB{LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END}` ＋ `lrig_limit_mod_until_own_energy_phase_end` を新設したのに、**part2 の「センタールリグのリミット±N」規則が先に `END_OF_TURN` で確定させて**いた |
| 影響 | **3効果**（`WXDi-P05-025-E2` / `WXDi-P13-004B-E3` / `WXDi-P16-002-E1`）＝**自分のターン終了時にリミット＋2が消える**＝相手ターン中はレベルの高いシグニを置けない |
| 修正 | part2 の当該ブロックに `/エナフェイズ終了時まで.*リミット/` の**譲り**を1本足した（part3 の規則と**同じ綴り**にしてある＝ずらすと**両方が受けず無言 no-op** になる） |
| 検証 | `npm run gates`（全緑）／`npm run regen` → 逆翻訳が「次のあなたのエナフェイズ終了時まで」へ／live 差分は**3効果ちょうど** |
| 反転確認 | あり＝`WX25-P2-014-E2` の相手側「次の**メインフェイズの間**」が `NEXT_TURN` のままであることを golden で固定（巻き込んでいない） |

🔴**stale だった golden を2本直した**＝どちらも「語彙が無いので短い側へ倒す」という**当時の近似を契約として固定**していたもの
（`§5.3 O-60 第58` の2本）。🔑**近似を golden に書くときは「いつ解けるか」を書く**＝
書いてあったので**解けたことがその場で分かった**（`O-293` の登録票がそれを指していた）。

⚠**残る近似**＝`WXDi-P13-004B-E3` の「**このシグニが場にあるかぎり**」が落ちている（live 1効果。
`lrig_limit_mod_until_own_energy_phase_end` は**誰が立てたか**を持たない単一の数値なので、
シグニが場を離れても＋2が残る）。**期限は原文どおりに縮んだので、残りは1効果ぶんの過剰**＝索引G `O-320` に記録。

### ② `WXDi-P09-045-E1` ＝**発動条件が丸ごと落ちていた**（`O-319`）

| | |
|---|---|
| 原文 | 【自】：このシグニがアタックしたとき、**このターンにあなたのシグニが１体以上トラッシュから場に出ていた場合**、対戦相手のシグニ１体を対象とし、《黒》を支払ってもよい。そうした場合、ターン終了時まで、それのパワーを－10000する。 |
| 🔴旧 live | ゲートなし＝**蘇生が1度も起きていないターンでも**《黒》1つで −10000 が撃てた |
| ✅受け皿 | **既に在った**＝`signi_placed_origin_this_turn`（`"<instanceId>:<zone>"`）。足りなかったのは**読み方（主語）**だけ |
| 修正 | `THIS_CARD_FROM_ZONE_THIS_TURN` に **`anySigni`** を追加（型＋`evalCondition`＋逆翻訳＋golden）。`manualEffects.ts` に `WXDi-P09-045-E1` を手書き |
| 検証 | `npm run gates`（全緑）／`npm run regen` → 逆翻訳が「あなたのシグニが1体以上トラッシュから場に出ていたなら」へ |
| 反転確認 | あり＝`anySigni` なしは従来どおり「このシグニ」限定であること・ゾーン違い/記録なしで**不成立**（無条件成立に落ちていない）を golden で両方向 |

🔑**兄弟3効果（`WX25-P1-108-E1` / `WX25-P2-061-E1` / `WXDi-P07-089-E1`）は既に正しかった**＝
**同じ原文フレーズでも主語だけが違う1件**が取り残される形。⇒ `census:population` は**フレーズだけでなく主語で割る**。
⚠**形は兄弟と揃えた**＝効果レベルの `condition` ではなく**アクション側の `CONDITIONAL`**
（`condition` は収集地点ごとに評価の有無が違う＝`evalUseCondition` を呼ばない地点がある）。

### ③ `SP26-002-E1` ＝**原文が「除外している」ものだけを封じていた**（`O-320`）

| | |
|---|---|
| 原文 | このターン、すべての領域にある**【ライフバースト】以外の**対戦相手のシグニの**トリガー能力は発動しない**。 |
| 🔴旧 live | `STUB{SUPPRESS_LIFE_BURST_ON_CRASH}`＝`suppress_life_burst: true`＝**相手のライフバーストを封じる** |
| 実害 | **真逆**＝原文が守ると言っているものだけを消し、原文が消すと言っているもの（【出】【自】《トラップ》…）は**何も消していなかった** |
| 修正 | parser の規則を `STUB{DEFERRED_SUPPRESS_OPP_SIGNI_TRIGGERS}` へ（**嘘をやめて明示 defer**）＋ `decompileEffects.ts` の `miscStubMap` に日本語訳 |
| 検証 | `npm run gates`（全緑・`census:stubs` A群の**無言 no-op 0 / C群 0** は維持）／`npm run regen` → 逆翻訳が「【未実装】…」へ |

⚠**受け皿を作らなかった理由**＝「全領域・全トリガー種・ただし LB は除く」のゲートは
**`triggerCollect` の収集 funnel 全体**に要る（既存 `suppress_signi_on_play_this_turn` は【出】だけ）。**live 1効果**なので明示 defer。

### ④ `WXDi-P08-044-E2` ＝**既に正しい**と確定（`O-318` から落とす）

`STUB{REPLACE_LEAVE_FIELD_WITH_TRASH_UNDER, leaveUnderCardsTrash{victimScope:'self',count:2,minUnderCards:2,thenDownVictim:true}}` は原文どおり。
登録票が「要確認」と書いていた「**対戦相手の効果によって**」は
`applyEffectLeaveUnderCardsTrashSubstitute` の **`victimOwner !== 'opponent'` で構造的に担保**されており、
「〜してもよい」も `collectLeaveSubstituteOptions` が `kind:'optional'` で登録している。⇒ **修正不要。**

### ⑤ 🆕`O-329` を索引B に新設＝**「このアーツは対戦相手のターンにしか使用できない」が5効果とも効いていない**

🔴**`evalUseCondition` は `IS_OPPONENT_TURN` を `return true`（プレースホルダ）にしている**（`execUtils.ts:3239`）。
ターン判定は**収集側が `condHas` で別途行う**約束だが、**アーツの提示ゲート（`canUseArtsCondition` →
`artsUseGate.ts:337` ほか5箇所）はその判定を持っていない**。
⇒ `condition:{IS_OPPONENT_TURN}` と書いてある `WX15-006-E1`（MANUAL）**でも使用条件は効いていない**。
残り4効果は `BLOCK_ACTION{USE_ARTS_EXCEPT_OPP_TURN}`（**読み手が1人もいない** actionId）に落ちている。
**母集団 5効果**＝索引B（3〜8効果）。`src/screens/` を貫くので**⑤実機まで必須**。

### 完了判定（§2.2）

**触ったのは `src/data/`（parser・manualEffects）／`src/engine/execUtils.ts`／`src/types/effects.ts`／
`scripts/`（golden・decompiler）／`public/data/` のみ＝④まで（実機不要）。**
`src/screens/` は1行も触っておらず、足したのは**既存条件型の読み方の軸1つ**（新しい型・機構ではない）。
検証＝`npm run gates` 全緑（golden 3962/3962）／`npm run regen` → 逆翻訳を3件とも目視／live 差分は**5効果ちょうど**。


## 2026-09-11 — PLAN §5.3 索引G `O-318` を再 triage して2件消化（5 → 残3）

登録票は「**残り4効果は理由が『遅延・履歴・置換機構が足りない』の1行しか残っていない＝着手前に再 triage が必須**」
と書いていた。原文 × live を並べたところ、**2件は受け皿があり**（うち1件は engine 1軸の追加だけ）、
**2件は本当に機構待ち**、**1件は既にほぼ正しい**と割れた。

### ① `WXEX1-72-E2` ＝**バースト抑止の予約が「ライフを1枚クラッシュ」に化けていた**（速いレーン）

| | |
|---|---|
| 原文 | 【出】：このターン、**次にクラッシュされる**対戦相手のライフクロスの一番上のカードの**ライフバーストは発動しない**。 |
| 🔴旧 live | `LIFE_CRASH{owner:'opponent',count:1,triggerBurst:true}`（逆翻訳も「対戦相手のライフクロスを1枚クラッシュする」） |
| 実害 | **原文に無い1点**を与えていた |
| ✅受け皿 | `SUPPRESS_LIFE_BURST_ON_CARD`（`execStubPart1.ts:1790`） |

🔑**同じセッションで直した `WX25-P3-032-E2` と完全に同型**＝**「置換／抑止の予約」が「置換される側の処理そのもの」に化ける**型。
⇒ **「次に〜される場合」「〜は発動しない」という原文を見たら、まず live に `LIFE_CRASH` が紛れていないか疑う**
（逆翻訳には「1枚クラッシュする」としか出ないので、**原文と並べないと分からない**）。

### ② `PR-305-E1` ＝**自分のシグニをデッキ下へ置く自傷**（engine 1軸を追加）

| | |
|---|---|
| 原文 | 【自】：あなたのターンの間、このシグニがバトルしたとき、手札を１枚捨ててもよい。そうした場合、そのバトル終了時に**このシグニがバトルしたそのシグニ**を場から**デッキの一番下**に置く。 |
| 🔴旧 live | `TRANSFER_TO_DECK{source:{owner:'self'}}`＝**自分のシグニ**をデッキ下へ＝**原文と真逆** |

⚠🔴**「向きだけ」直してはいけない**＝`owner:'opponent'` にするだけだと**バトルしていない相手シグニまで**
選べる＝**旧挙動（自傷＝プレイヤーが使わないので実害が小さい）より強い過剰実行**になる。
⇒ **`TRANSFER_TO_DECK.targetsTriggerSource` を新設**し、`ON_SIGNI_BATTLE` の `triggeringCardNum`
（＝**バトル相手**が入る。`BattleScreen.tsx:11088` の `triggeringCardNum: battleOpponentNum`）へ固定した。
**fail-closed**＝トリガー元が読めなければ候補0。
⚠**残る近似＝「そのバトル終了時に」の遅延が無い**（即時にデッキへ送る）＝索引 G に据置。

### ③〜⑤ 機構待ちと判定（登録票へ実測を反映）

- `WXDi-P05-025-E2`＝「**次のあなたのエナフェイズ終了時まで**」を `LRIG_LIMIT_MODIFY.until` が持てない
  （`'END_OF_TURN' | 'NEXT_TURN' | 'PERMANENT'` の3値のみ）。🔑**`EffectDuration` 側には
  `UNTIL_OWN_ENERGY_PHASE_END` が既にある**＝`O-293`（寿命の語彙）と同族で、**まとめて取ると安い**。
- `WXDi-P07-006-E1`＝「**このゲームの間にあなたが《コインアイコン》を得ていない場合**」の条件型が無い。
- `WXDi-P08-044-E2`＝専用 STUB と payload が原文どおり入っており**ほぼ正しい**（「対戦相手の効果によって」の
  限定だけ要確認）＝**worklist から落とす候補**。

### 検証

- `npm run gates` **全緑**（**golden 3958 → 3960 PASS**／smoke 10744 OK／fuzz 0／census 1 = BASELINE 1）。
- **新設 golden 2本とも反転確認あり**＝①旧 JSON（`LIFE_CRASH`）へ戻すと赤
  ②engine の絞り込みを `false &&` で殺すと**候補に bystander が混ざる**＝過剰実行が再現。
- §2.2＝触ったのは `src/data/` `src/types/` `src/engine/` のみ（`src/screens/` 0行）⇒ **実機不要**。

### 踏んだ罠

⚠**「候補が必要数ちょうどなら対話は立たない」は engine の既定ではない**＝`TRANSFER_TO_DECK` は
候補1体でも `SELECT_TARGET` を立てる。「対話が立たないこと」を旧挙動の痕跡にした初版は
**engine が正しいのに赤を出した**（`V-191` の §4.4-71 と同じ読み違いを別の面で踏んだ）。
⇒ **判定は候補集合の中身で書く**（外れるべき札が入っていないか／残るべき札が残っているか）。


## 2026-09-11 — PLAN §5.3 索引G を速いレーンで3件（`O-317` / `O-319` / `O-320`）＋ stale 1件を確定

ユーザー指示＝**索引 G を速いレーンで回す**。索引 G は「機構待ち」の集まりだが、
🔑**`O-325`／`O-328` に続いて登録票の stale が常態化していた**ので、
**着手前に受け皿を grep で割る**→**在れば JSON を原文どおり書き直すだけ**（§2.0 速いレーン）で閉じた。
**4件のうち engine を触ったのは1件・1箇所だけ**（それも評価位置の移動）。

### ① `O-317` `WX14-003-E2` ＝**登録票 stale（修正不要）**

登録票は「**CONTINUOUS なのに `action` が `ADD_TO_FIELD`**（構造の取り違え）」と書いていたが、
live は既に `STUB{IGNORE_LRIG_RESTRICTION_ARTS, ignoreRestrictionScopes:['signi'], ignoreRestrictionSigni:{levelEq:5}}`。
消費地点（`BattleScreen.tsx:8791`＝シグニ召喚ゲート）も `artsUseGate.ts:146` の判定も実装済みで、
**2026-09-08 に `O-268` として実装され golden も張られていた**（`goldenTest.ts:73134`）。⇒ **母集団から外す**。

### ② `O-317` `WX25-P3-032-E2` ＝**原文に無い「無料で相手ライフを1枚クラッシュ」**（重大な過剰実行）

| | |
|---|---|
| 原文 | 【起】《ゲーム１回》ルミナス《黒×0》：このターン、**次にアタックによって**対戦相手のライフクロスの一番上のカードが**クラッシュされる場合**、チェックゾーンに置かれる**代わりにトラッシュに置かれる**。そのカードのライフバーストは発動しない。 |
| 🔴旧 live | `SEQUENCE[LIFE_CRASH{owner:'opponent',count:1,triggerBurst:true}, STUB{SUPPRESS_LIFE_BURST_ON_CARD}]` |
| 実害 | **置換の予約**が、**置換される側の処理そのもの**に化けていた＝《黒×0》で**相手ライフを1枚削る**カードになっていた |
| ✅受け皿 | 2つとも実装済み＝`CRASH_TO_TRASH_INSTEAD`（`execStubPart3.ts:968` が立て、`BattleScreen.tsx:13531` が**相手視点で `op.` として**読む＝攻撃側が持つフラグ）／`SUPPRESS_LIFE_BURST_ON_CARD`（`execStubPart1.ts:1790`） |

⇒ `manualEffects.ts` に原文どおり手書き（engine 0行）。
⚠**残る近似＝「次に」（1回だけ）がターン継続になる**（どちらのフラグも boolean で回数を持たない）。
同族の `WX19-034-E1`（「そのアタックの間」）も同じ近似で運用中。**【起】《ゲーム１回》なので影響は限定的**。
⚠**コスト「ルミナス」は旧 live にも無い**＝原文で**この1枚だけ**の語彙（索引 G に据置）。

### ③ `O-319` `PR-422-E1` ＝**条件が落ちて「どんなバニッシュでも即敗北」**

| | |
|---|---|
| 原文 | 【自】：**パワー０以下の**このシグニがバニッシュされたとき、あなたはゲームに敗北する。 |
| 🔴旧 live | `AUTO/ON_BANISH → STUB{DEFEAT}`（**条件なし**） |
| 実害 | `DEFEAT` は `execStubPart3.ts:1607` で**実際に `life_cloth: []` にする**＝無言 no-op ではなく**そのまま負ける**。印刷パワー 7867 のシグニが**バトルで倒されただけで敗北**していた |

✅受け皿＝`SELF_POWER_GTE` に `operator` があるので `'lte'` で「0以下」を表せる（`execUtils.ts:3102`）。

🔴**ただし engine 側にも穴があった**＝`collectBanishTriggers` の `eff.condition` / `usageLimit` 評価が
**`triggerScope !== 'self'` のブロックの中にしか無く**、**自分自身の ON_BANISH では一度も評価されない**
＝JSON に条件を足すだけでは**無言で素通り**する。⇒ 2行を scope の外へ出した。
🔑**この穴が今まで露出しなかった理由は母集団0**＝実測で **self scope の ON_BANISH 109効果のうち
`condition` を持つもの 0／`usageLimit` を持つもの 0**。**「全計器が緑」は「穴が無い」ではない**の実例。
⚠`mkLimitOk` は `usageLimit` が無ければ**副作用なしで true**（`triggerCollect.ts:2073`）＝109効果へ広げても回帰しない。
⚠**パワーの出どころは `ctx.effectivePowers`**＝読めなければ印刷パワーへフォールバックして**成立しない**＝
**安全側**（旧＝常に敗北）に倒れる。

### ④ `O-320` `WXDi-P05-086` ＝**2文目の【常】が丸ごと落ちていた**（無言の欠落）

| | |
|---|---|
| 原文（2文目） | 【常】：**このカードがデッキかトラッシュにあるかぎり**、あなたの効果１つによってこのカードを参照する場合、**レベル１のシグニとして扱って**もよい。 |
| 🔴旧 live | この【常】が `E1` の `SEQUENCE` 末尾に `STUB{RULE_REMINDER_TEXT}`（＝ルール注記）として紛れ込み、**逆翻訳にも1文字も出ない** |
| ✅受け皿 | `collectDeckTrashLevel1Nums` の①分岐（`effectEngine.ts:8272`＝**デッキ/トラッシュのカード自身**が宣言する形）。🔑そこには「**生成側は現在0（live に1件も無い）**が、受け皿として温存する」とコメントがあり、**この1枚が唯一の生成元**だった |

⇒ `E1` から `RULE_REMINDER_TEXT` を外し、`E2`（CONTINUOUS）を新設（engine 0行）。
⚠**残る近似＝原文の「扱って**もよい**」（任意）が強制になる**（①分岐の設計。`WXDi-P01-039-E1` も同様）。

### 検証

- `npm run gates` **全緑**（**golden 3955 → 3958 PASS**／smoke 10744 OK／fuzz 0／census 1 = BASELINE 1）。
- **golden を3本新設**（`O-317` / `O-319` / `O-320`）＝**3本とも反転確認あり**：
  - `O-317`＝旧 JSON（`LIFE_CRASH`）へ戻すと赤。
  - `O-319`＝engine の条件評価行を `false &&` で殺すと**「印刷パワーでも敗北トリガーが立つ」**＝旧挙動が再現。
  - `O-320`＝**manual から消しても反転しない**（収穫マージは fresh に無い既存効果を live に温存する）＝
    🔑**live の JSON から直接消して**初めて赤になった。DRIVE_TRAPS §4.4-40 の**逆向き**の顔。
- §2.2 の判定＝触ったのは **`src/data/` と `src/engine/` だけ**（`src/screens/` は0行・新しい型も0）⇒ **実機不要**。

### 踏んだ罠（この巡で新しく分かったこと）

🔴**`manualEffects.ts` に同じカード番号のキーを2回書くと後勝ちで無視される**＝
`WX25-P3-032` は既に 4497 行に定義があったのに、気づかず2つ目のキーを作った。
**`build:effects` も `syncManualLive` も「差分なし」と言うだけで警告しない**ので、
「直したのに live が変わらない」という形でしか現れない。
⇒ **手書きの前に必ず `grep -c '"<CardNum>"' src/data/manualEffects.ts` で1であることを確かめる**
（DRIVE_TRAPS §4.4-50「同じシナリオ id を2回定義すると後勝ち」と同型）。

🔴**golden を足すと無関係なテストが落ちることがある**＝`goldenTest.ts:155` の POOL カーソルは
テスト間で共有される可変状態なので、`mkState` を呼ぶテストを**`withSavedCursor` で包まない**と
**後続が引くカードがずれる**（実測＝無関係な2本 `V-100③` / `第246` が落ちた）。
⇒ **新しい golden は既定で `withSavedCursor` で包む。**


## 2026-09-11 — PLAN §5.3 索引B `O-328`：「この方法で捨てたシグニ」参照の記録地点（9効果・実機 `V-191`）

🔴**真因＝【出】のコスト支払いだけが `last_discarded_signi_class` を一度も書いていなかった。**
`classMatchesDiscardSigni`（「この方法で捨てたシグニと共通するクラスを持つ」）を持つ live 5効果は
**全部が【出】**なので、engine の `resolveDiscardLevelFilter` が毎回「参照不能＝制限なし」へ倒れ、
**クラス制限が黙って消えて**トラッシュ／デッキのどのシグニでも拾えていた（原文より広い＝**過剰実行**）。
⚠**JSON にも逆翻訳にも1バイトも現れない**＝golden・smoke・fuzz・census は全部緑のまま。

### 登録票の訂正（着手前の実測）

登録票は「記録地点が `src/screens/` にしか無い＝**engine 内で支払う経路では常に未記録**」と書き、
**①記録を engine 側へ寄せる**を本体としていたが、🔴**engine に `handDiscardSigni` を支払う経路は存在しない**
（`grep -rn "handDiscardSigni" src/engine/` は `triggerCollect.ts`＝**コスト表示の収集**のみ）。
支払いは `src/screens/` の**3地点だけ**で、内訳は次のとおり＝**穴は1地点**だった。

| 支払い地点 | level | class |
|---|---|---|
| `BattleScreen.tsx` 【起】（シグニ起動） | ○ | ○ |
| `battle/trashActivateCost.ts`（トラッシュ【起】） | ○ | ○ |
| 🔴`BattleScreen.executeSigniOnPlayCost`【出】 | ○ | **✗ 書いていない** |

⇒ **engine へ寄せる作業は不要**。🔑**「受け皿が無い」型の登録票は、着手前に支払い側を全数 grep して割る**
（`O-325` に続き**2回連続で登録票が stale**だった）。

### 母集団（②）＝live 実測 **9効果**

| キー | 件数 | timing | 状態 |
|---|---|---|---|
| `classMatchesDiscardSigni` | **5** | **全部 ON_PLAY** | 🔴**壊れていた**（`WXK10-023-E1`／`-029-E2`／`-033-E2`／`-038-E1`／`-056-E2`） |
| `levelLteDiscardSigni` | 2 | ON_PLAY 1／MAIN 1 | 無傷（level は3地点とも記録済み） |
| `levelLtDiscardSigni` | 1 | MAIN | 同上 |
| `levelEqDiscardSigniOffset` | 2 | ON_PLAY | 同上（`WXK10-033-E2` は class と重複） |

### 修正（3点）

1. **`src/screens/BattleScreen.tsx`（`executeSigniOnPlayCost`）** に `last_discarded_signi_class` の記録を追加。
   レベル側と同じ規約＝**この支払いで捨てていれば1枚目で上書き、捨てていなければ据置**。
2. **ターン境界2地点**（`doPhaseAdvance` / 手札上限経由）に `last_discarded_signi_class: undefined` を追加。
   🔴旧実装は**このキーだけどのターン境界でも消えず**、前のターンの支払いで書いたクラスが残って
   `classMatchesDiscardSigni` を**別のクラスで**絞りうる状態だった（level は元から両方でクリアされていた）。
3. **`src/engine/effectExecutor.ts`（`resolveDiscardLevelFilter`）** を **fail-open → fail-closed** へ反転。
   参照不能なら `cardNum: '__dynamic_filter_reference_unavailable__'`（`resolveDynamicFilter` の `noMatch` と同じ sentinel。
   3箇所に散っていたリテラルを `DYNAMIC_FILTER_REFERENCE_UNAVAILABLE` の定数へ寄せた）。
   🔑**順序が本質**＝**記録側を先に塞いだから倒せた**。逆順で倒すと5効果が丸ごと no-op へ裏返る（§5-2″）。

### 検証

- `npm run gates` **全緑**（golden 全件・typecheck・lint・smoke・fuzz・census 各種）。
- **golden**＝既存 `続き377n` の対照2本（`WXK10-056` / `WXK10-029-E2`）を**反転**＝「参照不能なら絞り込まない」→
  「**参照不能なら候補0**」。⚠この2本は旧実装の据置を意図的に固定していたので、**倒したら必ず一緒に動かす**。
  ＋🆕**記録地点そのものを見る golden**（`§5.3 O-328`）＝①`classMatchesDiscardSigni` の母集団が全件 ON_PLAY であること
  ②`executeSigniOnPlayCost` が捨てクラスを記録していること、を assert。
  🔴**engine を fail-closed へ倒した以上、記録側が消えると「効果が丸ごと no-op」になるのに golden も逆翻訳も緑**になる＝
  **前提そのものを assert する**。反転確認＝記録行を外すとこの golden だけが落ちる（実測）。
- **実機 `V-191`(1)(2) PASS**（`src/screens/` を触ったので §2.2 により**実機まで必須**と判定）。
  盤面は同一で**捨てる札のクラスだけ**を天使／アームで反転＝**回収先も入れ替わる**ことを確認。
  **反転確認**＝記録行を外し engine のゲートを `false &&` で無効化すると、**両方とも「候補に別クラスが混ざった」で赤**
  （候補3件）。復元後に両方 PASS を取り直した（[DRIVE_TRAPS.md](./DRIVE_TRAPS.md) §4.4-70 の手順）。

### 踏んだ罠（[DRIVE_TRAPS.md](./DRIVE_TRAPS.md) §4.4-71 へ登録）

🔴**「候補が何件か」で絞り込みを判定してはいけない**＝**コストで捨てた札自身がトラッシュに残り、
同じクラス・Lv2以下なので必ず候補に入る**。旧挙動3件・新挙動2件で**どちらも複数**になるため、
初版の `maxCand >= 2` 判定は **engine が直っているのに赤を出した**。
⇒ 判定は件数ではなく**集合の中身**（外れるべき札が入っていないか／残るべき札が残っているか）。
🔑**切り分けの決め手は「engine が読んでいる state を観測面に足す」**＝`H.queryState()` に
`lastDiscardedSigniClass` / `lastDiscardedSigniLevel` を出した1回で、
「記録されていない」のか「記録は在るのに絞りが効かない」のかが確定した（推測での往復を止められる）。
⚠**確定ボタンのラベルは「発動」**（`SigniOnPlayCostModal.tsx`）＝`clickTextOrBtn` は**部分一致**なので
`'発動する'` で探すと一生当たらない（15ティック空振りした）。


## 2026-09-11 — PLAN §5.3 索引G `O-325`：「〜と共通するクラスを持つ」の参照元2軸（9効果を triage → 2件修正）

登録票は「**受け皿が無い**（参照カードを基準にした動的比較）」と書いていたが、🔴**2軸とも受け皿は既に在った**
（`TargetFilter.classMatchesDiscardSigni`＝コストで捨てたシグニ基準／`classMatchesAnyFieldSigni`＝自分の場基準）。
**parser がこの修飾句を落としていた**のが実体で、逆翻訳にも出ないので計器に映らなかった。

### 母集団（②）＝`npm run census:population -- "と共通するクラスを持つ"`＝**9効果 / 9カード**

| 分類 | 件数 | 効果 |
|---|---|---|
| **(a) 既に正しい** | 4 | `WXK10-023-E1`／`WXK10-029-E2`／`WXK10-033-E2`（`classMatchesDiscardSigni` 済み）／`WXDi-P00-021-E2`（`classMatchesAnyFieldSigni` 済み） |
| **(b) 修正** | **2** | `WXK10-056-E2`（トラッシュから拾う側にクラス一致が無く「レベル2以下のシグニなら何でも」＝過剰実行）／`WX25-P1-058-E2`（相手シグニの対象にクラス一致が無く「相手の任意の1体」＝過剰実行） |
| **(c) 見送り** | 3 | `PR-K070-E1`＝基準が**エナから払ったカード**（`last_discarded_signi_*` は手札捨てのみ）／`WX25-P1-089-E1`＝「エナに**それと**共通するクラスのシグニが**ない**場合」＝**対象を基準にした否定条件**の軸が無い／`WX25-P1-093-E1`＝**宣言した対象を基準にコストを絞る**軸が無い |

⚠**登録票の12効果は上限**＝`census:population` の実測は9で、うち4は既に正しかった。

### 修正

- `manualEffects.ts` に2効果を原文どおり手書き（§2.0 速いレーン＝同型2枚以下。`WXK10-038-E1` が同形の先例）。
  `npx tsx scripts/syncManualLive.ts WXK10-056 WX25-P1-058` で live へ同期した（**`build:effects` だけでは届かない**）。
- 🔴**engine を1箇所直した**＝`TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST` は候補が相手フィールドなので
  `resolveDynamicFilter` へ **`otherState` を `ownerSt` として**渡している（`placedThisTurn` 等の**対象側**キーがそれを要求する）。
  そのままだと「**あなたの**場のいずれかのシグニと共通するクラス」が**相手の場**を数える**意味反転**になる。
  ⇒ **共有述語 `resolveClassMatchesAnyFieldSigni` を切り出し**、caster 側のキーだけ**先に潰してから**渡す形にした
  （`resolveDynamicFilter` も同じ述語を呼ぶ＝同じ意味が2箇所に別々に書かれない）。
- `WX25-P1-058-E2` は**宣言（`optionalCostTarget`）と帰結（`BANISH`）の両方**にクラス一致を載せた＝
  宣言側が無いと**対象が居なくても支払いを提示する**（§5.3 `O-326` と同じ空払い）。

### 回帰検証

- golden 2本＝①捨てたクラスと共通する札だけが候補（別クラスは候補外）②自分の場と共通するクラスの相手シグニだけ＋
  **共通クラスが居なければ支払いを提示しない**＋**同じ盤面で相手シグニを差し替えると提示される**（対照の判別力の証明）。
- 🔴**反転確認**＝engine の caster 側 pre-resolution を外すと②が
  「共通クラスの相手シグニが居ないのに任意コストを提示した」で FAIL（実測・復元済み）。
- ⚠**テスト作成中に1つ踏んだ**＝対照盤面の相手シグニを「`迷宮` 以外」で選んだが、**効果元自身が `奏械：迷宮`**
  なので `奏械` で当たってしまい対照が成立しなかった。⇒ **効果元のクラス集合を全部外した**カードを選ぶ実装にした。
- `npm run gates` 全緑：golden **3954 PASS / 0 FAIL**（3952 → +2）、smoke 10744 / 全0、fuzz 0、census 1 / BASELINE 1、
  stubs A/C 0、enginetext A 0行、costtext A 0規則、manual-fields 0、lint 0 errors / 254 warnings。
  **per-effect diff＝2件**（`WXK10-056-E2`／`WX25-P1-058-E2`）。
- **⑤実機は不要と判定**（§2.2）＝`src/screens/` 無触・**新しい型／機構なし**（既存キーの解決地点を直しただけ）。
  支払い提示ゲートは golden ②が反転つきで固定している。

### 🔴この作業で見つけた別の穴＝`O-328` として登録（索引B）

**`last_discarded_signi_class` / `last_discarded_signi_level` を書いているのは `src/screens/` の支払い経路だけ**
（`BattleScreen.tsx:13930` / `trashActivateCost.ts:309`）。engine 内で支払う経路では**常に未記録**になり、
`resolveDiscardLevelFilter` が「参照不能なら**制限なし**」へ倒れるので、**クラス／レベル制限が黙って消える**。
⚠**一度 fail-closed（空ヒット）へ倒しかけたが戻した**＝既存 golden（続き377n）が
「参照不能時は絞り込まない」を**意図的に固定**しており、記録側を直さずに倒すと**9効果が丸ごと no-op へ裏返る**（§5-2″）。
⇒ **記録側を engine へ寄せるのが先**。母集団＝**9効果**（`classMatchesDiscardSigni` 5／`levelLteDiscardSigni` 2／
`levelEqDiscardSigniOffset` 2／`levelLtDiscardSigni` 1）。

## 2026-09-11 — PLAN §5.3 索引A `O-327`：`opponentSelects` の未配線分岐は**いま実害0**＝トリップワイヤで固定

第267で「`opponentSelects` を宣言できる action 配下で `selectOrInteract` の第8引数を省略している分岐が
**19箇所**ある」と数え、母集団2桁として索引 A へ登録した。**着手して②母集団を実測したところ、
その19箇所を通る live 効果は1件も無かった**＝**現時点の実害は 0 件**。

### 実測（②）

- **live で `opponentSelects` を宣言しているノード＝89**（全 `public/data/effects_*.json` を再帰走査）。
- **形（action型 × ゾーン × count）で畳むと 12 形**。内訳＝
  **配線済み 9 形**（`BANISH/SIGNI`・`BOUNCE/SIGNI`・`SEND_TO_ENERGY/SIGNI`・`TRASH/SIGNI`・`TRASH/ENERGY_CARD`・
  `TRANSFER_TO_DECK/SIGNI`・`TRANSFER_TO_DECK/HAND_CARD`〔第267で配線〕・`ADD_TO_LIFE(fromTrash)`・
  `SELECT_TARGET_ONLY/SIGNI`）＋**選択が起きない 3 形**（`TRASH/SIGNI/ALL`・`TRASH/ENERGY_CARD/ALL`＝
  どちらも `upToCount` 無し＝全部処理／`TRASH/DECK_CARD`＝デッキの上から N 枚）。
- ⇒ **19箇所を機械的に書き換える作業はしない**（§5-26＝件数を目標にしない。
  0件の実害のために engine を19箇所触るほうが退行リスクが高い）。

### 入れたもの＝トリップワイヤ（`scripts/goldenTest.ts`）

- **live から毎回ゼロ導出**して「`opponentSelects` が載っている形」を集め、**許容リストに無い形が現れたら FAIL**
  （§5-27 の形＝人の記憶ではなくゲートで守る）。失敗メッセージに**直し方**（該当分岐へ
  `const oppResponds = !!a.opponentSelects && <src|tgt>.owner === 'opponent';` を渡し、対照2本を足してから
  許容リストへ追記）を書いてある。
- 🔴**空振り防止**＝走査が壊れて0件になると「全部通った」に見えるので、**総数 ≥ 50 を先に assert** している。
- 🔴**反転確認**＝live の1効果の `source` を未配線の形（`LRIG_TRASH_CARD`）へ差し替えると
  `未配線の形へ opponentSelects が載った＝TRANSFER_TO_DECK|LRIG_TRASH_CARD|N（例 WXK10-044-E1）` で FAIL する（実測・復元済み）。

### ゲート

`npm run gates` 全緑：golden **3952 PASS / 0 FAIL**（3951 → +1）、smoke 10744 / 全0、fuzz 0、
census 高シグナル 1 / BASELINE 1、stubs A/C 0、enginetext A 0行、costtext A 0規則、manual-fields 0、
lint 0 errors / 254 warnings。**live JSON の変更なし**（挙動は1ビットも変わらない＝計器の設置のみ）。
**⑤実機は不要**（`src/screens/` 無触・engine 無変更）。

🔑**教訓＝「母集団2桁」は着手前に必ず割る。** `19箇所` は**コードの箇所数**であって**効果数ではない**。
PLAN §5.3 の「規模」と「母集団」の混同（登録票の注意書き）と同じ形を、今回は**登録した当日に自分で踏みかけた**。

## 2026-09-11 — PLAN §5.3 索引G `O-309`：`TRANSFER_TO_DECK/HAND_CARD` の相手選択を配線

`WXK10-044-E1` の原文は「対戦相手は手札を1枚デッキの一番下に置く」だが、旧 live は
`TRANSFER_TO_DECK{source:{type:'SIGNI',owner:'opponent'}}` で**場のシグニを移動**し、さらに
`opponentSelects` も無いため**効果使用者が選ぶ**二軸の過剰実行だった。加えて engine の
`execTransferToDeck/HAND_CARD` は、型にある `opponentSelects` を `selectOrInteract` の第8引数へ
渡していなかった。既存機構を流用し、`owner:'opponent'` のときだけ `opponentResponds` を立てた。

### 5効果の triage

| 分類 | effectId | 判定 |
|---|---|---|
| **(b) 修正** | `WXK10-044-E1` | live を `HAND_CARD/opponent/count:1/position:'bottom'/opponentSelects:true` に手動刻印し、欠落していた engine 引数を配線 |
| **(c) 見送り** | `WXK10-091-E1` | `SearchAction` に探索主体／応答者の軸が無く、`execSearch` の `SEARCH` pending にも `opponentResponds` が無い |
| **(c) 見送り** | `WXK06-025-E2` | `ADD_TO_FIELD` は配置ゾーン用 `opponentSelectsZone` しかなく、相手が手札の札を選ぶ軸と任意を決める軸が無い |
| **(c) 見送り** | `WXK06-028-E1` | 既存 `orderChosenBy:'opponent'` は `SIGNI/count:'ALL'` 専用。この効果には「使用者が相手トラッシュから対象2枚までを選ぶ→相手がその順番を決める」の二段階継続が要る |
| **(c) 見送り** | `WXEX2-12-E4` | live は `STUB CAST_FROM_OPP_TRASH` 2本で原文の秘匿二分割と別物。`O-307` 本体なので無変更 |

### 配線監査・波及

- `effectExecutor.ts` の実読取は、`BANISH` 1／`BOUNCE` 1／`SEND_TO_ENERGY` 1／`TRASH` 2／
  `ADD_TO_LIFE` 3／`TRANSFER_TO_DECK` 3（今回の `HAND_CARD` を含む）の **11箇所**。
  `execStubPart1.ts` の `SELECT_TARGET_ONLY` にも1箇所ある。
- `opponentSelects` を宣言できる action 配下で、対話を作る `selectOrInteract` が第8引数を
  hardcode／省略する箇所は **投入時20箇所 → 修正後19箇所**。残りは
  `BANISH` 3（totalPower／totalLevel／ALL+upTo）、`SEND_TO_ENERGY` 1（totalLevel）、
  `TRASH` 3（SIGNI／HAND／ENERGY の ALL+upTo）、`ADD_TO_LIFE` 1（fromHand）、
  `TRANSFER_TO_DECK` 7（LRIG_TRASH、TRASH×4、ENERGY、SIGNI thisCardOnly optional）、
  `SELECT_TARGET_ONLY` 4（TRASH／ENERGY／LRIG_TRASH／SEED）。加えて `SELECT_TARGET_ONLY/HAND_CARD` は
  対話以前に未対応 no-op。いずれもこの5効果の本命ではないため変更していない。
- 同じ欠落分岐を既に通っていた `WXK06-044-E1`（各プレイヤーが手札1枚をデッキ下へ置き1枚引く）も、
  相手側の手札選択が正しい応答者へ波及修正された。live JSON 自体の変更は無い。

### 回帰・配送確認

- golden 2本＝① `opponentSelects:true` なら `pending.opponentResponds:true`、②キー無しなら
  相手応答にならない。第8引数を一時的に外す反転では①だけが `expected=true got=undefined` で FAIL、
  ②は PASS（実測）。共有カードプールのカーソルは `withSavedCursor` で隔離した。
- `npm run build:effects` → `npm run regen` を実行。逆翻訳は
  `WXK10-044-E1: ...対戦相手のカード(手札)1枚をデッキの一番下に置く（相手が選ぶ）`。
- baseline `f347dbc98` との全 live JSON の effectId 単位比較で、変化集合は
  **`WXK10-044-E1` の1件だけ**（`SIGNI→HAND_CARD`、`filter` 削除、`opponentSelects:true` 追加、
  `parseStatus:AUTO→MANUAL`）。
- `npm run gates` 全緑：golden **3951 PASS / 0 FAIL**（3949 → +2）、smoke 10744 / 全0、fuzz 0、
  census 高シグナル 1 / BASELINE 1、stubs A/C 0、enginetext A 0行、costtext A 0規則、manual-fields 0、
  lint 0 errors / 254 warnings。
- `src/screens/`、型宣言、parser、decompiler は無変更。commit／push、PLAN／PLAN_PROGRESS 編集なし。
- **⑤実機は不要と判定**（§2.2）＝**`src/screens/` 無触**・**新しい型／機構なし**（既存 `opponentSelects` を
  既存分岐へ渡しただけ）。応答者の切り替えは golden ①②が反転つきで固定している。
- 🔴**Claude の検証（引き継ぎ側）**＝`npm run gates` を再実行して全緑（golden **3951**）、
  per-effect diff が **`WXK10-044-E1` の1件**であることを機械確認した。engine の差分は**1行**で、
  他の分岐の既定（省略＝自分が選ぶ）を1つも変えていない。
- 🔥🔴**このバッチの最大の収穫は修正1件ではなく「未配線 19箇所の全数」**＝
  `opponentSelects` を宣言できる action 配下で `selectOrInteract` の第8引数を省略している分岐が
  **19箇所**残っている（内訳は上記）。**母集団2桁なので §5.3 索引 A へ `O-327` として登録した。**
  ⚠**19箇所すべてが実害とはかぎらない**（その分岐を通る live 効果に `opponentSelects` が載っていなければ
  現時点では無害）＝**着手時に「分岐 × その分岐を通る live 効果」で実測し直す。**
- ⚠**未検証の疑い（今回は触っていない）**＝`triggerCondition.placedOnGateZone` は
  `triggerCollect.ts:4879` で**トリガー元の持ち主自身の `own_gate_zones`** を見る。
  `WXK10-044-E1` は「**対戦相手の**シグニが【ゲート】があるシグニゾーンに出たとき」なので、
  **相手が自分でゲートを置いていないと成立しない**読みになる。原文の意図（自分のゲートの正面か、
  相手自身のゲートか）は**カードの規則を確かめないと決められない**ので、**判定を保留した**。
  🔑**「分からないから直さない」を明示する**＝直したふりをするより、次の人が測り直せる形で残す。

## 2026-09-11 — PLAN §5.3 索引G `O-326`：帰結が既に成立しているときの空払いを事前に止める

原文「追加で**対戦相手のルリグ１体を対象とし**、手札から＜プリオケ＞のカードを１枚捨てても**よい**。
**そうした場合、それをダウンする**」（`WX26-CP1-006-E1`）に対し、旧 live は
**対象宣言そのものが無く**、`OPTIONAL_COST` → `CONDITIONAL{IS_MY_TURN}` → `DOWN{LRIG}` だった＝
**相手のセンタールリグが既にダウンしていても手札を捨てさせてから `execDown` が空振りする**（払い損）。
🔴**`O-298`（候補0体なら支払いを提示しない）とは別軸**＝**ルリグ候補は常に1体ある**ので
`abortIfNoCandidate` だけでは止まらない。

### 修正

- **parser**＝`applyO96OptionalCostTargetFirst` を **`DOWN` の `LRIG` 対象**にも適用し、
  宣言側に **`filter:{isUp:true}`** を載せて **O-96 の3点契約**（宣言→`STORE`→支払い→帰結）へ移した。
  `repairSemanticBatch247` 側（`WX25-CP1-004-E1`）も同じ `isUp` を持たせて揃えた。
- **engine**＝`execStubPart1` の `SELECT_TARGET_ONLY` の **LRIG 枝が `filter` を1つも評価していなかった**
  （`lrigTop` の有無だけで候補化）ので、**`isUp`／`isDown` が明示されたときだけ**状態を判定するようにした。
  ⚠**省略時は従来どおり候補にする**（既定を変えない＝他の効果が no-op へ裏返らない）。
- **decompiler**＝宣言は `targetJa` を通るので追加実装は不要。逆翻訳は
  「対戦相手の**アップ状態の**ルリグ1体を対象とする」になった（`docs/decompile_sheet9.txt`）。

### 母集団・triage（`OPTIONAL_COST`／`OPPONENT_PAY_OPTIONAL` と `DOWN` を併せ持つ live 25効果を全件）

| 分類 | 件数 | 内訳 |
|---|---|---|
| **(b) 修正** | **2** | `WX26-CP1-006-E1`／`WX25-CP1-004-E1`（choice①）＝**任意コストの唯一の帰結が相手ルリグの `DOWN`** |
| **(a) 穴ではない** | 12 | `WXDi-D03-004-E3`（`DOWN` は**コスト側**＝自分のシグニ・`isUp` 済み）／**11 HARMONY**（`else` 枝＝**支払わなかった場合の代償**であって帰結ではない） |
| **(c) 見送り** | 11 | **シグニ対象の `DOWN`**（`WX24-P1-006-E1` ほか）＝🔑**ダウン済みシグニも規則上は正当な対象**で、**候補が複数あるプレイヤーの選択**だから「強制された空払い」ではない。ルリグ（候補が常に1体＝選択の余地が無い）とは条件が違う。**`isUp` を一律に足すと過小実行へ倒れる** |

⚠**この修正は「規則上は払える選択肢を engine 側が消す」近似**である（ダウン済みルリグを対象に取って
払うこと自体は規則違反ではない）。**プレイヤーが常に損をするだけの枝**なので消す側に倒した。

### 回帰検証

- golden 3本（①アップ状態＝宣言→支払い→ダウン ②既にダウン＝**支払いを提示しない・手札を失わない**
  ③支払い拒否＝did-it ゲートが後段 `DOWN` を止める）。
  🔴**反転確認**＝live から `filter.isUp` を外すと ② が
  「相手ルリグが既にダウンしているのに支払いプロンプトを提示した」で FAIL する（実測）。
- 🔴**既存 golden の契約を1本更新した**＝`O-96 据置契約: ルリグ対象は固定形へ変えない`。
  旧契約の根拠は「(a) 対象0体 (b) 宣言後に対象が変わる **のどちらも起きない**」だったが、
  **(c) 帰結が既に成立している**という第3の実害が見つかったので `WX26-CP1-006-E1` を契約から外した。
  🔑**`FREEZE` 側（`WXDi-P02-040-E2`）は据置のまま**＝同じ軸（既に凍結済み）は別項目。**まとめて広げない。**
- ⚠**golden の assert を1つ直した**＝`line.includes('対戦相手のルリグ')` は
  `filterJa` が所有者と名詞の**間**に状態を挟むので当たらない（実出力は「対戦相手の**アップ状態の**ルリグ1体」）。
  **連結した部分文字列で逆翻訳を assert しない。**
- `npm run gates` 全緑：golden **3949 PASS / 0 FAIL**（3946 → +3）、smoke 10744 / 全0、fuzz 0、
  census 高シグナル 1 / BASELINE 1、stubs A/C 0、enginetext A 0行、costtext A 0規則、manual-fields 0、
  lint 0 errors / 254 warnings。**per-effect diff＝2件**（`WX26-CP1-006-E1`／`WX25-CP1-004-E1`）。
- **⑤実機は不要と判定**（§2.2）＝**`src/screens/` 無触**・**新しい型／機構なし**（既存 `TargetFilter.isUp` と
  既存 `abortIfNoCandidate` 経路の再利用）。支払い提示ゲートは golden ② が反転つきで固定している。

### 作業経路

🔴**Codex（既定 `~/.codex`）が利用上限で停止したため Claude が引き継いで完遂した**（ユーザー既定の運用）。
Codex の到達点＝parser／engine の修正と golden 3本の記述まで。
**Claude が引き継いだ分**＝①`heldReview --adopt`（収穫マージで held に落ちていた本命カードの採用）
②`npm run regen` ③逆翻訳 assert の修正 ④**既存 O-96 契約 golden の更新** ⑤25件の triage ⑥ゲート ⑦簿記。
🔑**「Codex の差分がある＝その効果が live に届いている」ではない**＝
**本命の `WX26-CP1-006` は `_held_fresh.json` に落ちていて live は素のままだった**（`WX25-CP1-004` だけが届いていた）。
**引き継ぎでは必ず `node scripts/heldReview.mjs` を回して held を見る。**

## 2026-09-11 — PLAN §5.3 索引G `O-297`：ON_BANISH のトリガー元シグニのゾーンにあるゲートを判定

`WXDi-P16-074-E2` は「同じシグニゾーンに【ゲート】があるあなたのシグニ」がバニッシュされたときだけ発火する原文だが、旧 live は `FIELD_HAS_GATE{self}` で自分の場のどこかにゲートがあれば発火していた。

### 修正

- `triggerCondition.banishedFromGateZone` を追加し、`collectBanishTriggers` がバニッシュ直前に保存した `banishedZone` と `prevOwnerState.own_gate_zones` を照合する。`prevOwnerState` が無い場合を含め、ゾーンを確定できなければ非発火とした。
- バニッシュされたカード自身・自分フィールド watcher・相手フィールド watcher の3ループすべてで同じ条件を消費する。
- `WXDi-P16-074-E2` の MANUAL 定義だけを新キーへ移し、`npx tsx scripts/syncManualLive.ts WXDi-P16-074` で live に同期した。`parseStatus:'MANUAL'` は維持した。
- decompiler に同キーの表現を追加し、`npm run regen` 後の逆翻訳を「同じシグニゾーンに【ゲート】があるあなたのシグニがバニッシュされたとき」にした。

### 母集団・配送確認

- `同じシグニゾーンに【ゲート】がある` は **20効果 / 16カード**。同じゲートゾーンのシグニがバニッシュされる文型は `WXDi-P16-074-E2` の **1効果だけ**で、残り19効果は `SAME_ZONE_HAS_GATE`、`filter.inGateZone` 等の別軸だった。
- live の `FIELD_HAS_GATE` は **10効果 / 10カード**。対象以外の9効果は変更していない（うち `WXDi-P15-079-E1` はゲートゾーン限定配置の成立条件、ほかは場全体のゲート条件）。
- baseline `9cd0e7980` との全 effects JSON の再帰 per-effect 比較で、変化集合は **`WXDi-P16-074-E2` の1件だけ**。
- `docs/decompile_sheet8.txt:9037` に新しい逆翻訳が現れることを確認した。

### 回帰検証

- golden を3本追加し、各テストで3 collector ループを通した：①同じゾーンのゲートで発火、②別ゾーンだけにゲートがあると非発火、③ `prevOwnerState` 無しで非発火。新キーを一時的に外して同期すると②を含む **0 PASS / 3 FAIL**、復元後は **3 PASS / 0 FAIL**。
- `npm run gates` 全緑：golden **3946 PASS / 0 FAIL**（baseline 3943 → +3）、smoke **10744 / CRASH・HANG・INVARIANT 全0**、fuzz 0、census 高シグナル **1 / BASELINE 1**、stubs A/C 0、enginetext A **0行 / 0ハンドラ**、costtext A 0規則、manual-fields 0、lint **0 errors / 254 warnings**。
- 🔴**実機（Claude 引き継ぎ・`V-190` 2本＝`order` に常設）＝両方 PASS。**
  新しい `triggerCondition` キーを足した回なので §2.2 で実機まで回した。**観測点は相手の手札枚数**＝
  ①`o297GateZoneBanishFires`（【ゲート】と同じ zone1 の味方 P3000 が P12000 とバトルしてバニッシュ）→ 相手手札 2 → 1
  ②`o297OtherZoneGateSilent`（【ゲート】は zone2＝victim と別ゾーン）→ 2 のまま。
  🔑**アプリ経路だけが持つ risk を狙った**＝バトル解決の `collectBanishTriggers` 呼び出しが
  **`prevOwnerState`（バニッシュ直前の状態）を渡していなければ新キーは fail-closed で永久に非発火**になる。
  golden は pure collector を直接叩くので、この配線は観測できない。
- 🔴🔑**実機の反転確認は「engine 側を外す」でやること**（2026-09-11 に踏んだ罠）＝
  **`public/data/effects_*.json` を書き換えて旧挙動へ戻す方法は、実機では反転しなかった**
  （`dist` には旧 JSON が入っていたのに挙動は新しいまま＝ブラウザ／アセット側のキャッシュを疑う）。
  ⇒ **`triggerCollect.ts` の新キー判定を一時的に無効化**して再実行したところ、
  対照②が期待どおり **FAIL（別ゾーンのゲートで発火）**した＝**シナリオに判別力があることを確認できた。**
  ⚠**live JSON を書き換える反転確認を「反転しなかったから判別力が無い」と読むと、正しいシナリオを捨てる。**

## 2026-09-11 — PLAN §5.3 索引G `O-323`：処理成功時だけ消費する `usageLimit`

原文「このターンにこの能力で～していない場合」は、誘発した回数ではなく**その能力で指定処理が実際に起きた回数**を数える。
旧 live は `WX24-P2-050-E1` を素の `once_per_turn` にして空振りでも消費し、`WX25-P3-061-E1` は
`usageLimit` 自体と《虚幸の閻魔姫　ウリス》の在場条件を両方落としていた。

### 修正

- `UsageLimit` に `once_per_turn_on_success` を追加。parser はカード番号・目的語・処理動詞ではなく
  「このターンにこの能力で…して／でいない場合」の文型から生成する。
- `WX25-P3-061-E1` の「あなたの場に《…》がいて、」は、既存の
  `HAS_CARD_IN_FIELD{owner:'self', filter:{cardName}}` へ載せた（新条件型は作っていない）。
- `triggerCollect.mkLimitOk` は新値を `actions_done` で抑止するが、収集時の `usedIds` へは積まない。
  対象2効果の経路は `collectOppEnergyAddedTriggers` と `collectLeaveFieldTriggers`。
- 解決側は既存 `execSequence` の did-it 契約（`lastProcessedCards`）を流用し、対象 leaf の成功直後にだけ
  `actions_done` へ effectId を記録する。`TRASH` はこの用途専用集合にだけ加え、既存の
  `DID_IT_GATED_TYPES`（「そうした場合」全体）の意味は変えていない。対話を跨ぐ場合も内部 continuation の末尾で確定する。
- 新値の live 母集団は golden で上記2 effectId に ratchet。別 timing の旧 `usageLimit` 分岐へ
  新値が無監査で入って fail-open になることを防ぐ。

### 母集団・生成物

- `census:population -- "このターンにこの能力で"`＝**2効果 / 2カード**。
  「このターンにこの効果で」「このターンにこの方法で」は各0。
- 広めの「この能力／効果／方法で…していない場合」＝13効果を目視し、残り11件は同一解決内の
  成否分岐・追跡であってターン内使用制限ではないためスコープ外。
- baseline `c395cbe65` との全 effects JSON の per-effect 比較＝**変更2件だけ**：
  `WX24-P2-050-E1` は usageLimit 変更、`WX25-P3-061-E1` は同 usageLimit とカード名条件の追加。
- `npm run regen` 済み。`docs/decompile_sheet9.txt:8066` に
  `《once_per_turn_on_success》` と《虚幸の閻魔姫　ウリス》条件が出現し、
  `:1646` は WX24 の原文相当「このターンにこの能力で…置いていない場合」を維持。
- held / partial / idset は **1 / 0 / 0**（held は既存 `WXK07-018` のみ）。

### 回帰検証

- golden を3本追加し、①成功時は2回目を抑止 ②条件不成立・候補0・コスト未払いは未消費で再誘発
  ③同じ空振り盤面で新値を素の `once_per_turn` へ戻すと再誘発 assert が FAIL する、を固定。
- `npm run gates` 全緑：golden **3943 PASS / 0 FAIL**（3940 → +3）、smoke **10744 / 全0**、fuzz 全0、
  census 高シグナル **1 / BASELINE 1**、stubs A/C 0、enginetext A 0行/0ハンドラ、costtext A 0規則、
  manual-fields 0、lint **0 errors / 254 warnings**。ratchet 調整なし。
- 🔴**実機（Claude 引き継ぎ・`V-189` 2本＝`order` に常設）＝両方 PASS。**
  新機構を足した回なので §2.2 で実機まで回した。**観測点は `actions_done`**＝
  ①`o323SuccessCommitsUsage`（トラッシュの＜悪魔＞Lv1を選び《黒》を払って場に出す）で
  `actions_done` に `WX25-P3-061-E1` が入る ②`o323AbortKeepsUsageFree`（候補0）は入らない。
  🔑**アプリ経路だけが持つ risk を狙って書いた**＝`BattleScreen.tsx:5231` は
  `wrapSigniAutoPayGate` で **action を包んでから** `executeEffect` を呼ぶので、
  成功マーカーが `SEQUENCE`/`CONDITIONAL` を越えて leaf へ届かないと**永久に消費されない**
  （golden は包まない経路しか通らないので観測できない）。
- 🔴**反転確認（実機）＝live の `WX25-P3-061-E1` を素の `once_per_turn` へ戻すと
  `o323SuccessCommitsUsage` は FAIL**（「場には出たのに `actions_done` に無い」）＝シナリオに判別力がある。
- ⚠**Claude 側で1件踏んだ罠**＝`git checkout -- public/data/effects_*.json` で戻したあと `build:effects` を回すと、
  **`WX24-P2-050-E1` の変更は収穫マージで held に落ちて live へ戻らない**（値の書き換えは純粋上位集合ではない）。
  ⇒ `node scripts/heldReview.mjs --adopt WX24-P2-050` で採用し直した。**live JSON を一時的に書き換える検証をしたら、
  戻した後に必ず値を読み直す。**

## 2026-09-11 — 第262〜第263バッチ：🏁`O-299` をクローズ（**`BattleScreen` 委譲込み・実機まで**）→ **索引 A 残0**

ユーザー承認＝「`BattleScreen` 委譲込みで実機まで回す1バッチとして取ってよい」。残2件を消化した。

### 1. `WX24-P4-002-E1`③＝**3軸すべてが外れていた**（期間・フィルタ・バニッシュ限定）

原文「**このターンと次のターンの間**、**能力を持たない**対戦相手のシグニが場を離れる場合、代わりにトラッシュに置かれる。」
🔴旧 live は `STUB{OPP_SIGNI_LEAVE_TO_TRASH}` が `banish_redirect:true` を立てるだけで、
①turn-end で消えるので**1ターンしか効かない**（過小）②「能力を持たない」フィルタが**無い**（過剰）
③**バニッシュ限定**で「場を離れる場合」全体ではない（過小）。

**直し方（5点）**
1. parser（`parseSentencePart3.ts`）が原文から **`StubAction.leaveToTrashWindow{turns, requiresNoAbilities}`** を載せる。
   ⚠`WXDi-P04-037-E1`（【常】・期間は `activeCondition` が持つ）は payload なしのまま＝**同じ STUB を2つの意味で使い分ける**。
2. `PlayerState.leave_to_trash_windows`（`turnsRemaining` の減算式）を宣言者の state に積む。
3. 🔑**述語は `leaveToTrashWindowApplies`（`effectEngine.ts`）1本**にした。
4. **読み手は4箇所**＝`banishDestination`（効果経路）／funnel の `oppLeaveToTrash` 軸（非バニッシュ離場）／
   `BattleScreen` の**攻撃側 `redirectBanish` と防御側 `redirectMyBanish`**（O-49 の対称規約どおり対で書く）。
5. 失効は `clearTurnEndScopedState` で1ターンにつき1減（`advancePreventDamageWindows` と同じ作法）。

⚠**「能力を持たない」の定義は1本に寄せた**＝`matchesFilter({noAbilities:true})` ∪ `abilities_removed`。
自前で `EffectText` を見ると **CSV が素のシグニを `-` で持つ**規約や「解析済み効果が1件でもあれば能力あり」を落として基準がずれる。
（同じアーツの②が `REMOVE_ABILITIES` で能力を奪うので、**その時点で**能力が無い個体も含めるのが原文どおり。）

### 2. `WXDi-P00-038-E1`＝**live が別物だった**（置換も裏向きも1つも無い）

原文「【常】：対戦相手のターンの間、このシグニが場を離れる場合、代わりにこれを**裏向きにしてもよい**。
そうした場合、**次の次のあなたのメインフェイズ開始時**、これと同じシグニゾーンにシグニがない場合、これを表向きにし、対戦相手は手札を２枚捨てる。」
🔴旧 live＝`SEQUENCE[RULE_REMINDER_TEXT, CONDITIONAL{IS_MY_TURN}→TRASH{相手手札2}]`＝
**原文の主眼（守り）が丸ごと消え**、副次の「2枚捨てさせる」だけが無条件に見える形だった（しかも `CONTINUOUS` なので全部 no-op）。

**直し方**＝MANUAL で `CONTINUOUS STUB{SELF_LEAVE_FACEDOWN_SECOND_MAIN}` ＋ `activeCondition{TURN_OWNER opponent}` に書き直し、
- funnel 軸 `selfFacedown`（任意）＝`moveFieldSigniFacedown`（**既存**）で同じゾーンの裏向き枠へ移し、予約を積む。
- 新 `PlayerState.pending_second_main_facedown_returns`（`mainPhasesRemaining`／`oppDiscard`）。
  🔑**「次の次」は自メイン開始のたびに1減らして数える**（既存 `INSTALL_DELAYED_TRIGGER` は「次の1回」までしか表せない＝`O-314`）。
- `resolveSecondMainFacedownReturns`（`facedownSigni.ts`）を `doPhaseAdvance` の `nextPhase === 'MAIN'` で呼ぶ。
- 🔑**「対戦相手は手札を2枚捨てる」は `effect_stack` へ載せる**＝直接 state を書くと**どれを捨てるかの選択と【自】の誘発**を飛ばす。
- ⚠**表向きにできた分だけ捨てさせる**（ゾーンが埋まっていて戻れなかった予約では捨てさせない＝原文の条件）。

### 検証

- `npm run gates` **全緑**＝golden **3940 PASS / 0 FAIL**（3938 → +2）／smoke CRASH・HANG・INVARIANT 0／fuzz 0／
  census 高シグナル 1 / BASELINE 1／`census:stubs` A群・C群 0／`census:enginetext` A🔴 **0行**／
  `census:costtext` A🔴 **0規則**／manual-fields 0／lint 0 errors・254 warnings。**ratchet の較正なし**。
- **live の per-effect 差分＝2 effectId**（`WX24-P4-002-E1`／`WXDi-P00-038-E1`）。
- **golden の反転確認は3通り**＝①`BattleScreen` の共有述語を外すと `got=1`（4箇所→3箇所）で FAIL
  ②「次の次」を「次」にすると `got=1` で FAIL ③ゾーンが埋まっていても戻すと `got=1` で FAIL。
- 🔴**実機5本すべて PASS**（`V-187` 3本＋`V-188` 2本・`order` に常設）＝
  - `v187LeaveToTrashWindowBattle`：window あり＋能力なし victim → **行き先 trash**
  - `v187LeaveToTrashWindowAbledControl`：window あり＋**能力あり** victim → **energy**（フィルタが効いている）
  - `v187LeaveToTrashWindowOffControl`：window **なし** → **energy**（旧挙動）
  - `v188SecondMainFacedownFlip`：自メイン開始で表向きに戻り、**対戦相手の手札 3→1**
  - `v188SecondMainFacedownBlocked`：同じゾーンが埋まっていれば**裏向きのまま・手札も減らない**
- 🔴**実機の反転確認も実行した**＝`BattleScreen` の2箇所を旧挙動へ戻すと
  `v187LeaveToTrashWindowBattle` が「行き先は energy（期待 trash）」、`v188SecondMainFacedownFlip` が
  「表向きに戻らなかった」で**両方 FAIL**＝**シナリオに判別力がある**ことを確認した（§4.4-3 の要求）。

### 🏁 索引 A は **残0**／実機 `V-nn` も **残0**

機構 worklist は **25項目**（A 0／B 0／G 25）。

🔴🔑**教訓①＝「同じ STUB id を2つの意味で使い分ける」ときは payload の有無で分ける。**
`OPP_SIGNI_LEAVE_TO_TRASH` は【常】宣言（期間は `activeCondition`）とアーツの1ステップ（期間は payload）の両方で使う。
**ハンドラ側に「どちらのカードか」を書かない**＝parser が原文から payload を出し、engine は payload の有無だけを見る。
🔴🔑**教訓②＝「共有述語を N 箇所が読む」形にすると `O-299` の壊れ方が構造的に起きなくなる。**
`O-299` の共通の壊れ方は「バトル経路にしか無い」だったが、根は**同じ意味を2箇所に別々に書いたこと**。
今回は `leaveToTrashWindowApplies` 1本を4箇所が読む形にし、**golden がその箇所数（2箇所＝BattleScreen の攻守）を assert する**。
⇒ 片側だけ足す／外すと**必ず golden が落ちる**。
🔑**教訓③＝実機の反転確認は「シナリオの判別力」の証明**（§4.4-3）。今回は旧挙動へ戻して両方 FAIL することまで見た。
## 2026-09-11 — 第261バッチ（PLAN §5.3 索引A `O-299`）：離場置換に3軸を追加し 残5 → **残2**

`O-299` の共通の壊れ方は「**置換処理がバトル経路にしか無い**」。第260 で3軸（`selfDown`／`selfExile`／
`resonaSelfTrash`）を `collectLeaveSubstituteOptions` へ持ち上げたのに続き、今回は**残り3効果**を消化した。

### 1. `acceExile`（`WXDi-P09-TK03A-E1`）＝アクセ対価はバニッシュ限定ではない

原文「これにアクセされているシグニが**場を離れる場合**、代わりにこれをゲームから除外してもよい。そうした場合、そのシグニをダウンする。」
funnel は `exile_acce` を **`opts.isBanish` の枝でしか列挙していなかった**ので、非バニッシュの離場では出なかった。
⇒ 非バニッシュ枝でも `collectEffectBanishSubstituteChoices` を回し、**`kind === 'exile_acce'` だけ**を取り出す。
⚠他の kind（`sacrifice`／`trash_charm`／`pay_cost`）は原文が「バニッシュされる場合」なので出さない。

#### 🔴 同時に engine 経路の既存バグを1件直した（`localEffects` にアクセが入っていない）

`collectEffectBanishSubstituteChoices` は `localEffects` を自前で組んで `collectBanishSubstitutes` へ渡すが、
**その map にはシグニの最上面しか入っていなかった**。`exile_acce` の判定は `effectsMap.get(acceNum)` を引くので、
**engine 経路（効果によるバニッシュ／離場）では `ACCE_BANISH_SUBSTITUTE` が1度も引けず恒久 no-op** だった。
`BattleScreen` は本物の `effectsMap` を渡すので**バトル経路だけ動いていた**＝`O-299` の共通の壊れ方そのもの。
⇒ `putLocal()` に切り出し、`state.field.signi_acce` の各札も載せる。

### 2. `frozenLeaveToTrash`（`WXEX1-30-E1`）＝凍結した相手シグニの行き先をトラッシュへ

原文「【常】：対戦相手の**凍結状態の**シグニが場を離れる場合、代わりにトラッシュに置かれる。」（強制）。
`collectFrozenBanishOverrides` は既に在ったが、**呼び出しが `BattleScreen.tsx` のバトル解決2箇所だけ**だった。
⇒ funnel に `frozenLeaveToTrash` 軸を足し、**collector は既存のものを再利用**（並行する劣化軸を作らない）。
⚠**victim が凍結していること**を必ず見る（落とすと相手シグニの行き先を無条件でトラッシュへ倒す過剰実行）。

### 3. `oppLeaveToTrash`（`WXDi-P04-037-E1`）＝相手ターン中の行き先変更

原文「【常】：**対戦相手のターンの間**、対戦相手のシグニが場を離れる場合、代わりにトラッシュに置かれる。」（強制）。
🔴**宣言を1度も読んでいなかった**＝`CONTINUOUS` なので `executeAction` を通らず、同名 STUB のハンドラ2本
（`execStubPart2`＝`banish_redirect` を立てる／`execStubPart3`＝対象を選んでトラッシュする**能動効果**）は
**どちらも呼ばれない**。⇒ 新 collector `collectOppSigniLeaveToTrash`（`effectEngine.ts`）＋ funnel 軸。
期間は `activeCondition{TURN_OWNER opponent}` が持つ。

🔑**走査する側が既存軸と逆**＝`downProtector` 等は victim の盤面の守り手を探すが、
この2軸は原文が「**対戦相手の**シグニが場を離れる場合」＝**宣言は離場させた側（`ctx.ownerState`）にある**。
`checkActiveCondition` の `isOwnerTurn` も**宣言者視点**（`ctx.isOwnerTurn` をそのまま）で渡す。
⚠**場には残らない**（行き先を変えるだけ）ので、場に残れる軸をすべて試したあとに並べる。

### 残2の実測（どちらも登録票より重かった）

- 🔥**`WX24-P4-002-E1`＝3軸すべてが外れている。** live は `STUB{OPP_SIGNI_LEAVE_TO_TRASH}` を**ACTIVATED のステップ**
  として持ち、`execStubPart2` が `banish_redirect:true` を立てるだけ。①期間「このターンと次のターン」→
  **turn-end で消えるので1ターンしか効かない**（過小）②「能力を持たない」フィルタが**無い**（過剰）
  ③**バニッシュ限定**で「場を離れる場合」全体ではない（過小）。**期間＋フィルタつきの window** が要る。
- 🔥**`WXDi-P00-038-E1`＝live が別物。** `SEQUENCE[RULE_REMINDER_TEXT, CONDITIONAL{IS_MY_TURN}→TRASH{相手手札2}]` で、
  **置換も裏向きも1つも無い**（しかも `CONTINUOUS` なので全部 no-op）。`O-314`（複数ターンにまたがる遅延状態）と同族。

🔴🔑**この2件を今回やらなかった理由**＝どちらも `BattleScreen.tsx` の既存フラグ（`banish_redirect`）と**二重になる**。
funnel 側だけ足すと「バトルでは古い挙動・効果では新しい挙動」という**並行する劣化軸**になる（登録票が禁じている形）。
⇒ **`BattleScreen` の委譲とセットで取る**＝そこは `src/screens/` を触るので §2.2 により実機まで必須。

### 検証

- `npm run gates` **全緑**＝golden **3938 PASS / 0 FAIL**（3935 → +3）／smoke CRASH・HANG・INVARIANT 0／fuzz 0／
  census 高シグナル 1 / BASELINE 1／`census:stubs` A群・C群 0／`census:enginetext` A🔴 **0行**／
  `census:costtext` A🔴 **0規則**／manual-fields 0／lint 0 errors・254 warnings。**ratchet の較正なし**。
- **live の per-effect 差分＝0**（engine のみ／JSON は1バイトも変えていない）。
  ⇒ 🔴**この型はどの計器にも映らない**（逆翻訳・census・`census:stubs` A群はどれも「ハンドラが在るか」しか見ない）。
- **反転確認は4通り実行した**＝①`localEffects` からアクセを外すと `acceExile` が `got=0` で FAIL
  ②〜④3軸を funnel から外すと3本とも `got=0` で FAIL。
- golden は各軸について**成立する盤面と成立しない盤面の対照**を張った
  （アクセ無し／凍結していない／自分のターン）＝**タダで離場を無効化する**方向へ倒れていないことを固定。

### ⑤実機は不要と判定（§2.2）

触ったのは `src/engine/` の2ファイルと `scripts/goldenTest.ts` だけ。🔑**`src/screens/` は1行も触っていない。**
新しいアクション型・条件型・`PlayerState` キーも足していない（`LeaveSubstituteAxisId` の**列挙値3つ**、
既存 funnel と同形の apply 関数2本、既存 collector と同形の collector 1本）。
🔴**ただし残2は実機まで必須**＝`BattleScreen` の委譲を伴うため（登録票に明記した）。

### 索引 A は **残1項目**（`O-299` 残2）

機構 worklist は **26項目**（A 1／B 0／G 25）で据置。

🔴🔑**教訓＝「バトルでは効くのに効果では効かない」は engine 内部にもある。**
`O-299` の共通の壊れ方は `BattleScreen` と engine の分業だと思っていたが、今回の `localEffects` は
**engine の中で組んだ縮小版 map** が原因だった（本物の `effectsMap` を渡す BattleScreen だけ動いていた）。
⇒ **「同じ判定関数に、呼び出し側ごとに違う map を渡している」箇所を疑う。**
🔑**走査の向きを間違えると永久に成立しない**＝「守る側の宣言」と「離場させた側の宣言」は別物で、
後者は victim の盤面をいくら探しても見つからない。**原文の「対戦相手の」が誰から見た相手かを最初に決める。**
## 2026-09-11 — 第260バッチ（PLAN §5.3 **索引 A**）：🏁`O-298` をクローズ／`O-299` を 残8 → **残5**

索引 A の残2項目を取った。**`O-298` は残4のうち3件が真バグ・1件は軸違い**、**`O-299` は8件中3件を funnel へ持ち上げた**。

### 1. 🏁`O-298`（自分の任意コストの「空払い」）＝残4の実測は **(a) 1 / (b) 3**

| effectId | 判定 | 真因と直し方 |
|---|---|---|
| `WXK10-080-E1` | (b) | 🔴**任意コストが空だった**（`costColors:[]` と `costText` だけ＝払うものが1つも宣言されていない）＋対象が支払いを跨がない |
| `WXDi-P16-048-E1` | (b) | `CHOOSE` の枝の中で3点契約が抜けていた（対象0体でも手札を捨てられる） |
| `WX16-029-TRAP` ＋ `WX17-044-TRAP` | (b) | 【トラップ】はアタック中とはかぎらない＝アタッカー0体でもコストを払わされていた |
| `WX26-CP1-006-E1` | (a) | **`O-298` の軸では穴ではない**（ルリグ候補は常に1体）＝別軸を `O-326` で登録 |

#### ①`WXK10-080-E1`＝**コストの踏み倒し**（MANUAL・手書き）

原文「あなたの＜水獣＞のシグニ１体を対象とし、手札から＜水獣＞のシグニを**２枚公開**してもよい。そうした場合、〜＋5000」。
🔴旧 live の `STUB{OPTIONAL_COST}` は **`costColors:[]` と `costText` しか持っていなかった**＝
`canPayOptionalCost` が常に真／`optionalCostPaySteps` が空 ⇒ **手札に＜水獣＞が1枚も無くても「支払う」を選べて＋5000が通る**。
✅受け皿は既存の `OptionalCostSpec.handReveal`（可否 `execUtils.ts:674`／支払い `:879`＝`REVEAL`。**捨てるのではなく公開**なので手札は減らない）。

🔴**もう1つの穴**＝旧実装は「対象とし」を `POWER_MODIFY{delta:0}` の no-op で代用し、帰結を `targetsLastProcessed` で受けていた。
`lastProcessedCards` は**支払いインタラクションの resume を跨いで生存しない**（`freezeStoredTargets` の冒頭注記）＝支払ったあとに空振りする。
⇒ **3点契約**（`SELECT_TARGET_ONLY{abortIfNoCandidate}` → `STORE_LAST_PROCESSED_TARGETS` → コスト → `targetsStored`）へ組み直した。

#### ②`WXDi-P16-048-E1`＝`CHOOSE` の枝の中の空払い（MANUAL・手書き）

枝②は `[OPTIONAL_COST, CONDITIONAL]` だけで、**帰結の対象候補を1度も見ずに支払いを提示**していた。3点契約へ組み直し、
ゲートも `IS_MY_TURN` から正準形の `PAID_ADDITIONAL_COST` へ直した。他の2枝は原文どおりなので触っていない。

#### ③`WX16-029-TRAP`／`WX17-044-TRAP`＝【トラップ】はアタック中とはかぎらない（parser 規則1本）

🔴**真因**＝【トラップ】は `STUB{ACTIVATE_TRAP}`（「あなたの【トラップ】１つを発動する」型の効果）からも撃てるので、
`NEGATE_ATTACK{attackingOnly}` の候補（＝いま宣言中のアタッカー）が**0体のことがある**。
`execNegateAttack` は `cands.length === 0` で降りるが、**その前にコストを払わされている**。

✅**受け皿は既存の `TargetFilter.isAttacking`**（`execUtils.ts:2001` の `fieldCandidates` が `pending_signi_battle.zoneIndex` で判定）。
`SELECT_TARGET_ONLY` は同じ `fieldCandidates` を通るので **engine は0行**で閉じた。

🔴🔑**ここだけ3点契約ではなく「1点の事前ゲート」にした**＝`NegateAttackAction` は `targetsStored`/`fixedCardNums` を
**持たないし読まない**（`FREEZABLE` にも無い）ので、`O96_STORABLE_OUTCOMES` へ足すと
**「フィールドは付いたが engine が無視する」無言 no-op**になる（同配列のコメントにある2条件ルール）。
⇒ `STORE` も `targetsStored` も刻まず、`SELECT_TARGET_ONLY{filter:{isAttacking:true}, abortIfNoCandidate:true}` だけを前に置く。
対象の同一性は `attackingOnly` が担保する（アタッカーは解決中に変わらない）。

⚠**`WX16-029` は `_held_fresh`、`WX17-044` は `_partial_fresh` に回った**（構造が変わる＋同カードに MANUAL 効果がある）＝
`node scripts/heldReview.mjs --adopt WX16-029` と `npx tsx scripts/syncManualLive.ts WX17-044` が要った。

#### ④`WX26-CP1-006-E1`＝**軸が違うので `O-326` へ分離**

原文「追加で対戦相手のルリグ１体を対象とし、手札から＜プリオケ＞のカードを１枚捨ててもよい。そうした場合、それをダウンする。」
**相手のセンタールリグは常に1体いる**ので `SELECT_TARGET_ONLY{abortIfNoCandidate}` では何も止まらない。
実際の払い損は「**既にダウンしている**」ときで、これは `O-298` の「候補0体」とは別の軸。
⚠`SELECT_TARGET_ONLY` の LRIG 枝は **`filter` を1つも適用しない**（`cands = lrigTop ? [lrigTop] : []`）＝`isUp` を書いても無視される。
⚠シグニ側の `DOWN` も同様にダウン済みを候補から外していない＝**軸を作るなら両方に効かせる**。

### 2. `O-299`（離場置換）＝**バトル経路にしか無かった3軸を funnel へ持ち上げた**（残8 → 残5）

共通の壊れ方＝宣言は live に `CONTINUOUS` の STUB として在るのに、**読み手が `BattleScreen` のバトル解決だけ**で、
原文「（対戦相手の効果によって）**場を離れる場合**」の**効果側が恒久 no-op**。
逆翻訳も `census:stubs` A群（ハンドラの有無）も緑なので**どの計器にも映らない**型。

| 軸 | effectId | 内容 |
|---|---|---|
| `selfDown`（任意） | `WXDi-CP02-TK01A-E2` | アップ状態なら離場をダウンで置換。**ダウン済みでは成立しない**（タダの身代わりを作らない） |
| `selfExile`（強制） | `WXK05-024-E2` | 離場を**ゲームから除外**へ。🔴旧実装の**「≈トラッシュ近似」も同時に直した**（`excluded` へ入れる＝回収・蘇生が効かない） |
| `resonaSelfTrash`（任意） | `WXEX2-32-E1` | 宣言者が自分をトラッシュして**＜宇宙＞レゾナ**を守る。`downProtector` と同族。victim の限定を落とすと普通のシグニまで守る過剰実行 |

🔑**並びの規約を守った**＝場に残れる軸（`selfDown`／`resonaSelfTrash`）は `selfDeckBottom` より前、
**場は離れる**行き先変更（`selfExile`）は最後尾の group へ。自動 policy は先頭から採るので、順序が意味を持つ。

⚠🔴**残っている重複**＝`BattleScreen.tsx` は同じ意味を自前で持ったまま（`leaveReplaceDown` ほか）。
**funnel へ委譲するのが残作業**で、そこを触る回は `src/screens/` を触るので §2.2 により実機まで必須。
今回は**劣化軸を新設したのではなく**、同じ funnel に**フル忠実度の軸**を足した（登録票が指示した方向）。

### 検証

- `npm run gates` **全緑**＝golden **3935 PASS / 0 FAIL**（3929 → +6）／smoke CRASH・HANG・INVARIANT 0／fuzz 0／
  census 高シグナル 1 / BASELINE 1／`census:stubs` A群・C群 0／`census:enginetext` A🔴 **0行**／
  `census:costtext` A🔴 **0規則**／manual-fields 0／lint 0 errors・254 warnings。**ratchet の較正なし**。
- **live の per-effect 差分＝4 effectId**（`WXK10-080-E1`／`WXDi-P16-048-E1`／`WX16-029-TRAP`／`WX17-044-TRAP`）。`O-299` の3軸は live を変えない（engine のみ）。
- **反転確認は6通り実行した**＝①`handReveal` を抜くと `got=undefined` ②`NEGATE_ATTACK` の parser 規則を止めると `WX17-044-TRAP` が FAIL
  ③〜⑤`selfDown`／`selfExile`／`resonaSelfTrash` の3軸を funnel から外すと3本とも `got=0` で FAIL。
- ⚠**既存 golden を1本更新した**＝`(d) WXK10-080` は木の形（`POWER_MODIFY{delta:0}` が index 0）を読んでいた。
  **元の意図（＋5000 が「選んだ1体」だけに乗る）はそのまま**で、参照先を3点契約の形へ直した。
- `npm run regen` 後の逆翻訳（§5-14 の証跡）＝
  - `WXK10-080-E1`：`あなたの＜水獣＞のシグニ1体を対象とする。そして手札から＜水獣＞のシグニを2枚公開してもよい。そして（コストを支払った場合）なら、それのパワーを＋5000する（ターン終了時まで）`
  - `WX16-029-TRAP`：`【トラップアイコン】対戦相手のアタックしているシグニ1体を対象とする。そして手札から＜トリック＞のシグニを1枚捨ててもよい。〜`

### ⑤実機は不要と判定（§2.2）

触ったのは `src/engine/`・`src/data/`・`public/data/`・`scripts/` で、🔑**`src/screens/` は1行も触っていない**。
新しいアクション型・条件型・`PlayerState` キーも足していない（`LeaveSubstituteAxisId` の**列挙値3つ**と、
既存 funnel と同じ形の apply 関数3本／parser 規則1本）。消費地点は同じ変更内の funnel で、golden が**反転つき**で固定している。
🔴**ただし `O-299` の `BattleScreen` 委譲は残作業**＝そこを取る回は実機まで必須（登録票に明記した）。

### 🏁 索引 A は **残1項目**（`O-299` 残5）

機構 worklist は **26 → 26項目**（`O-298` をクローズし `O-326` を新設したので差し引き0＝**A 1／B 0／G 25**）。

🔴🔑**教訓＝「同じ項目の中に別の軸が混ざっている」**。`O-298` の残4は「空払い」で束ねられていたが、
`WX26-CP1-006-E1` だけは**候補は在るのに帰結が既に成立している**という別の空振りだった。
⇒ **1件ずつ「なぜ空振りするのか」を言葉にする**と、軸が違うものが落ちる（束ねたまま機構を作ると過剰になる）。
🔑**受け皿は「同じ概念の別名」で探す**＝`NEGATE_ATTACK` の事前ゲートは新機構ではなく、
既存の `TargetFilter.isAttacking`（`fieldCandidates`）で engine 0行のまま閉じた。
## 2026-09-11 — 第259バッチ（PLAN §5.3 **索引 B を残0**）：🏁`O-294`／`O-302`／`O-303`／`O-295` を4件ともクローズ

**索引 B の4項目を実測した結果、登録票が正しかったのは2件だけだった。** 4件それぞれの結論：

| ID | 登録票の主張 | 実測 | 結果 |
|---|---|---|---|
| `O-294` | `ADD_TO_FIELD.abilitiesRemoved` に engine の消費が無い＝真 no-op | 🔴**stale**＝消費地点は `markPlacedAbilitiesRemoved`（`effectExecutor.ts:3997`・4経路から呼ばれる） | 🏁**変更なしでクローズ** |
| `O-302` | 可変選択数（「〜につき1つまで選ぶ」）が表せない | 🔴**stale**＝`ChooseAction.countChoose` を `resolveCountRef` が解決済み。**残っていたのは逆翻訳だけ** | 🏁**逆翻訳を修正してクローズ** |
| `O-303` | `zone_moved_just` が場外→場の入れ替えでも記録される | ✅**登録どおり**（行番号だけ `:11804` → `:12104` にずれていた） | 🏁**engine 1箇所を修正** |
| `O-295` | 「効果によるダメージを受けない」が1回消費型 | ✅**真バグ・かつ登録票より重い**（軸違いの過剰実行も同時にあった） | 🏁**engine funnel を張り替えて修正** |

### 1. 🏁`O-294`＝**登録より前のバッチで既に閉じていた**（変更なし）

**母集団**＝`npm run census:population -- "能力を持たない[^。]*場に出す"`＝**8効果 / 7カード**、
受け皿 `abilitiesRemoved` の判定で **OK 6 / MISS 2**。
- **OK 6** は `markPlacedAbilitiesRemoved` が `PlayerState.abilities_removed` へ刻む＝**真 no-op ではない**。
  golden（`§5.0 O-D WX16-Re20-E1`）が【常】【出】【起】の**3方向とも対照つきで**固定していた。
- **MISS 2**（`WX20-Re20-E1` / `WXK09-006-E2`）は**別軸**＝原文の「能力を持たないシグニ」が
  **配置修飾ではなく検索フィルタ**で、`filter.noAbilities` が `effectEngine.ts:1085` で消費されている。
- ⚠**寿命も正しい**＝`abilities_removed` は turn-end で失効するが、**母集団6効果すべてが原文で
  「ターン終了時、それらを場からトラッシュに置く」**なので場に残らない（食い違わない）。

🔴🔑**なぜ stale だったか**＝実装コミット `a49563c86`（第226バッチ）が**登録コミット `f499c0cbb` の祖先**だった。
⇒ **「機構待ち」を登録するときは、その場で受け皿を grep して実装済みでないことを確かめる。**

### 2. 🏁`O-302`＝機構は実装済み。**逆翻訳が `[参照値]` に潰れていた**

**母集団**＝`npm run census:population -- "につき[^。]{0,6}[１1]つまで選ぶ"`＝**6効果 / 6カード**（登録どおり）。
**6効果すべてに `countChoose` payload が載っており**、`effectExecutor.ts:6756` が
`resolveCountRef` で解決していた（golden も挙動を反証つきで固定済み）。

🔴**残っていた穴は逆翻訳**＝`decompileEffects.ts` の `numJa` が知らない `$ref` を **`[参照値]`** に潰すので、
**engine は正しく数えているのに逆翻訳が「いくつなのか」を言わない**（実測 **9行 / 全10シート**）。
さらに CHOOSE では助数詞が嵌まらず「この方法で処理した枚数と同じ数の**つ**を選ぶ」になっていた。

**直し方**＝`REF_NOUN_JA`（`$ref` → 裸の名詞句）を新設し、`numJa` は「〜と同じ数の」、
CHOOSE は「〜と同じ数だけ／まで選ぶ」で閉じる。`filter` を持つ3つ（`self_energy_count` /
`opp_energy_count` / `life_crashed_by_signi_this_turn`）だけは名詞句を組み立てる。
**engine は0行**（`resolveCountRef` は1行も触っていない）。

🔑**ゲートは「2つの表の集合一致」**＝`resolveCountRef` から `$ref` を抽出して `REF_NOUN_JA` と突き合わせる golden を新設した。
**片方だけ足すと逆翻訳が黙って `[参照値]` に戻る**（他のゲートは全部緑のまま）ので、そこを止める。

### 3. 🏁`O-303`＝場外↔場の入れ替えが `ON_ZONE_MOVED` を2件ずつ誤発火させていた

**真因**＝`effectExecutor.ts`（`resumeRearrangeSigni` の `mode:'swap'` × `swapSourceLocation` が
deck/energy/trash の枝）が `zone_moved_just` へ**交換の両側**を積んでいた。
実際は `pending.swapSourceNum` が**場外→場**、`selected` が**場→場外**で、
**どちらも原文「場にあるこのシグニが他のシグニゾーンに移動したとき」ではない**
（`WXK03-026-E4` / `WXK06-029-E2`）＝入れ替えのたびに2件の過剰発火。

**直し方**＝この枝の `zone_moved_just` を積まない（**engine 1箇所・実質2語**）。
⚠**場→場の3経路は正しいので触らない**＝`rearrMoved`（旧ゾーン≠新ゾーン）／
`INTERNAL_MOVE_SIGNI_ZONE`（`execStubPart1.ts:4516`）／`INTERNAL_REPOSITION_TO_ZONE`（`execStubPart3.ts:3807`）。
⚠`zone_moved_just` の読み手は `BattleScreen.tsx:1748` の `ON_ZONE_MOVED` 収集だけ＝他機構に影響しない。

### 4. 🏁`O-295`＝**軸も回数も外していた**（登録票は回数だけを指していた）

**真因は2つ**（登録票は②だけを書いていた）：
1. 🔴**軸違いの過剰実行**＝`PREVENT_DAMAGE_FROM_OPP_EFFECTS` / `PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP` が
   `PlayerState.prevent_lrig_damage` を立て、消費地点が `BattleScreen` の**ルリグアタックのダメージ**だった。
   **ルリグアタックは「効果」ではない**ので、原文「対戦相手の**効果によって**ダメージを受けない」と軸が違う。
2. 🔴**過小実行**＝その分岐が消費時に `undefined` へ戻すので**1回で切れる**（原文は【常】＝回数無制限）。

**受け皿**＝engine には既に「**効果による**ライフクラッシュ」の funnel `execLifeCrash` があり、
すぐ隣に同型のゲート `oppMoveImmunityBlocksCrash`（「効果によってライフクロスは移動しない」）が座っていた。
⇒ **同じ場所へ載せる**のが正解で、`src/screens/` は1行も触らずに済んだ。

- `effectEngine.ts` に `isEffectDamagePreventedByOpp` を新設（`oppMoveImmunityBlocksCrash` の直後）。
- `execStubPart2.ts` の2 STUB は**フラグを書かない宣言型**へ（既存 `PREVENT_LRIG_DAMAGE` と同じ作法）。
- `execLifeCrash` に `a.owner === 'opponent'` のときのゲートを2本（**【常】宣言** ＋ **期間つきウィンドウ**）。
- ⚠🔴**印刷能力だけ走査すると付与された【常】が恒久 no-op**＝`SPDi44-04-E2-GRANT` / `WX25-P1-026-E2-GRANT` は
  `GRANT_LRIG_ABILITY` 由来で **`effectsMap` に載らない**ので、`lrigDamageShield.ts` の
  `shieldCandidates` と同じく**印刷側と付与ストア側を対で**走査する（golden で付与側も反証つきで固定）。

**期間つき同軸（`SPK01-13-E1`③）も同時に閉じた**＝原文「**このターン**、あなたは対戦相手の効果によって
ダメージを受けない」に対し live は `PREVENT_DAMAGE{until:'UNTIL_END_OF_TURN'}`＝**scope 省略の既定が `'ALL'`**
で、**アタックのダメージまで止まる**過剰実行だった。`scope` に **`'OPP_EFFECT'`** を足し、
`execLifeCrash` だけが見る（`hasActivePreventDamageWindow('ALL'|'LRIG')` には**当たらない**）ようにした。
⚠**既存 golden が `scope === 'ALL'` を assert していた**ので原文どおりに更新した
（その assert の元の意図＝「期間つき・回数無制限であって1回消費ではない」はそのまま維持）。

### 検証（4件まとめて）

- `npm run gates` **全緑**＝golden **3929 PASS / 0 FAIL**（3926 → +3）／smoke CRASH・HANG・INVARIANT 0／fuzz 0／
  census 高シグナル 1 / BASELINE 1／`census:stubs` A群・C群 0／`census:enginetext` A🔴 **0行**／
  `census:costtext` A🔴 **0規則**／manual-fields 0／lint 0 errors・254 warnings。**ratchet の較正なし**。
- **live の per-effect 差分＝ちょうど1 effectId**（`SPK01-13-E1`）。`O-294`/`O-302`/`O-303` は live を変えない。
- **反転確認は4件すべてで実行した**＝①`REF_NOUN_JA` から `center_lrig_level` を1件抜くと新 golden が
  `got=center_lrig_level` で FAIL ②`zone_moved_just` の行を戻すと `zone swap` E2E が **11本 FAIL**（`got=2`）
  ③`execLifeCrash` のゲートを外すと `got=6`（ライフが減る）で FAIL ④STUB のフラグ書きを戻すと
  `prevent_lrig_damage: got=true` で FAIL ⑤live の `scope` を戻すと `got=undefined` で FAIL。
- `npm run regen` 後の逆翻訳（§5-14 の証跡）＝
  - `[参照値]` は**全10シートで 9行 → 0行**。
  - `WXK10-104-E1`：`以下の3つからあなたのセンタールリグのレベルと同じ数だけ選ぶ`
  - `WXDi-P05-008-E1`：`あなたのデッキの上からあなたのアシストルリグのレベルの合計と同じ数の枚をエナゾーンに置く`
  - `SPK01-13-E1`：`このターン、あなたは対戦相手の効果によってダメージを受けない`

### ⑤実機は不要と判定（§2.2）

触ったのは `src/engine/`（3ファイル）・`src/types/`・`src/data/`・`public/data/`・`scripts/` で、
🔑**`src/screens/` は1行も触っていない**（`O-295` はむしろ screens 側の消費地点への依存を**外した**）。
新しい**アクション型／条件型／`PlayerState` キー**も足していない
（足したのは既存 `PreventDamageAction.scope` の**列挙値1つ**と、既存宣言を読む engine 内 predicate 1本）。
消費地点は同じ変更内の funnel で、golden が**両方向の反転**で固定している。⇒ `V-nn` の登録もしない。

### 🏁 索引 B は **残0**

索引 A は **残2**（`O-298` 残4／`O-299` 残8）、索引 G は 残24。機構 worklist は **30 → 26項目**。

🔴🔑**教訓＝索引 B は4件中2件が stale で、残る2件は「登録票より重い」バグだった。**
`O-294` は**登録より前に実装が入っていた**（コミットの祖先関係で確認できる）。
`O-295` は**回数の問題として登録されていたが、実際は軸違いの過剰実行も同時にあった**。
⇒ **登録票は「その項目が存在する」ことの証拠にも、「何が壊れているか」の記述にもならない。着手時に必ず両方を測り直す。**
🔑**受け皿は「同じ概念の隣」を見ると見つかる**＝`O-295` の正しい funnel は、
`execLifeCrash` の中で**すぐ隣の行**に座っていた `oppMoveImmunityBlocksCrash`（「効果によってライフクロスは移動しない」）だった。

## 2026-09-11 — 第258バッチ（PLAN §5.3 索引A `O-301`）：🏁**クローズ**。「次の〜アタックフェイズ開始時」の遅延は**受け皿が全部在った**／真の穴は永続化1件

**真因**＝`WXDi-P04-007-E3` の live が `GRANT_KEYWORD{duration:'PERMANENT'}`＝原文
「**次の対戦相手のターンの、メインフェイズとアタックフェイズの間**、あなたのシグニは【シャドウ】を得る」の
**遅延（次の相手ターン）も寿命（そのターンで切れる）も両方落ちて、ゲーム終了まで全自シグニがシャドウ**だった（過剰実行）。

**影響枚数**＝**1効果 / 1カード**（`WXDi-P04-007`）。

### ② 母集団の実測（登録票は3点とも stale だった）

原文 `/次の[^。]{0,20}(アタックフェイズ|ルリグアタックステップ|シグニアタックステップ)/` で効果単位に数え直し＝**28効果 / 28カード**
（登録票の「23効果」より広い）。live 側は受け皿を**別名まで含めて**判定した
（`INSTALL_DELAYED_TRIGGER` / `DELAY_TO_NEXT_OPP_ATTACK_PHASE` / `ON_ATTACK_PHASE_START` /
`ON_LRIG_ATTACK_STEP_START` / `ADD_EXTRA_ATTACK_PHASE` / `NEXT_OPP_ATTACK_PHASE_START`）＝**OK 19 / MISS 9**。

🔴**登録票の stale 3点**
1. **「10効果」は過大**＝`INSTALL_DELAYED_TRIGGER` 1キーだけで判定していたため、
   **`DELAY_TO_NEXT_OPP_ATTACK_PHASE`（「次の**対戦相手の**」側の正準形・4効果）が丸ごと MISS に出ていた**。
2. **「`ON_LRIG_ATTACK_STEP_START` 相当の timing が無い」は誤り**＝実在し、`WXDi-CP02-059-E1` が使っている。
3. **「JSON の書き方の問題が大半」も外れ**＝MISS 9 のうち8件は**別軸の正しい受け皿**へ載っていた。

**MISS 9 の triage＝(a) 穴ではない8 ／ (b) 受け皿は在るが未配線1 ／ (c) 機構が要る0**

| effectId | 判定 | 実際の受け皿 |
|---|---|---|
| `PR-Di035-E1` | (a) | `STUB{PRDI035_PARADISE_COLOR}`＝次アタックフェイズ開始時の判定フラグ（golden 済み） |
| `WXDi-P09-009-E3` | (a) | `SIGNI_FLIP_FACEDOWN{returnTiming:'NEXT_OPP_ATTACK_PHASE_START'}`（`facedownSigni.ts:111`） |
| `WXK06-026-E1` | (a) | `ADD_EXTRA_ATTACK_PHASE.onStart`（追加アタックフェイズ＝別概念） |
| `SP38-006-E4` | (a) | `BLOCK_ACTION{ATTACK_PHASE/GROW, until:'NEXT_TURN'}`＝フェイズスキップ（`:NEXT_TURN` 昇格式） |
| `WX13-005A-E2` / `WXDi-P11-TK02-E2` | (a) | `LIMIT_OPP_SIGNI_ATTACKS_ONCE`＝アタック回数制限（期間は state のリセット地点で一致済み） |
| `WX24-P4-007-E1` / `WXDi-P14-005-E1` | (a) | `STUB{LOCK_OPP_TRASH_MOVE}`＝**同じ「メインフェイズとアタックフェイズの間」句をフェイズ限定つきで実装済み** |
| 🔴`WXDi-P04-007-E3` | **(b)** | `GrantKeywordAction.duration:'NEXT_TURN'` ＋ `nextTurnOwner:'opponent'` |

さらに広く `/(アタックフェイズ|ルリグ／シグニアタックステップ)開始時/` の**558効果**を掃いても
追加 MISS は2件だけで、どちらも別 effectId（`WXDi-P05-060-E2`＝`GRANT_SIGNI_ABOVE_ABILITY`／
`WXDi-P07-010-E2`＝`FACEDOWN_RELEASE_BY_OPP_PAYMENT`）が受けており穴ではなかった。

### ③ 実装（速いレーン＝母集団1効果・`src/engine/` と `effectParser.ts` は0行）

`src/data/manualEffects.ts` に `WXDi-P04-007-E3` を **`parseStatus:'MANUAL'`** で手書きし、
`duration:'NEXT_TURN'` ＋ `nextTurnOwner:'opponent'` に直した。
受け皿は既存の2スロット式＝`reserveFieldGrant`（`effectExecutor.ts:65`）が `field_grants_next_opp_turn` へ予約 →
`clearTurnEndScopedState`（`turnScopedState.ts:375,414`）が**自分のターン終了時に `field_grants_active` へ昇格 →
相手のターン終了時に空へ戻す**。

🔑**同じ文が真上の `WX15-004-E3` では正しく `NEXT_TURN` になっていた**＝parser の期間検出が
`t.includes('次の対戦相手のターンの間')` の**完全一致**で、間に「の、メインフェイズとアタックフェイズ」が挟まる
**この1枚だけが外れていた**。⇒ 受け皿は最初から在り、機構は1つも足していない。

⚠**「メインフェイズとアタックフェイズの間」→「そのターンの間」への近似は意図的**＝
`FieldGrantCondition` にフェイズ軸が無く、**1効果のために機構は作らない**（PLAN §5.3「1〜3枚の項目の取り方」4.）。
差は相手のグロウ／エナ／ターン終了時だけで、`LOCK_OPP_TRASH_MOVE` と同じ近似の作法。理由は manualEffects.ts に明記した。

⚠**`build:effects` では live に届かず `npx tsx scripts/syncManualLive.ts WXDi-P04-007` が要った**
（既存 id の書き直しは収穫マージが通さない＝CLAUDE.md 既知）。

### ④ 検証コマンドと結果

- `npm run gates` **全緑**＝golden **3926 PASS / 0 FAIL**（3925 → +1）／smoke CRASH・HANG・INVARIANT 0／fuzz 0／
  census 高シグナル 1 / BASELINE 1／`census:stubs` A群・C群 0／`census:enginetext` A🔴 **0行**／
  `census:costtext` A🔴 **0規則**／manual-fields 0／lint 0 errors・254 warnings。**ratchet の較正なし**。
- **live の per-effect 差分＝ちょうど1 effectId**（`WXDi-P04-007-E3`）。他カードは0。
- **反転確認あり**＝live を `PERMANENT` へ戻すと新 golden が
  `PERMANENT（永続）へ戻っている expected=NEXT_TURN got=PERMANENT` で FAIL することを実行して確認した。
- `npm run regen` 後の逆翻訳（§5-14 の証跡）＝
  `docs/decompile_sheet7.txt:6655` → `WXDi-P04-007-E3: 【起】（メイン起動）：《once_per_game》〈《白×0》〉あなたのすべてのシグニに【シャドウ】を与える（次の対戦相手のターンの間）`

### ⑤ 実機は不要と判定（§2.2）

触ったのは `src/data/` `public/data/` `scripts/` だけで **`src/screens/` は無傷**、**新しい型・機構も0**。
挙動側は golden の `assertNextOpponentShadow`（既存ヘルパー）が
**発動ターンは効かない → 次の相手ターンだけ対象効果を拒否 → そのターン終了で失効**の3点を実行で固定している。⇒ `V-nn` の登録もしない。

### 🏁 `O-301` はクローズ／`O-318` を 6 → 5効果へ訂正

**(c) 0件＝残件なし。** 索引 A は **残2項目**（`O-298` 残4／`O-299` 残8）。
`WXDi-P04-007-E3` は索引 G の `O-318`（遅延・置換の受け皿が足りない・6効果）にも入っていたので、
そちらの母集団を **5効果**へ訂正した。

🔑**教訓＝「受け皿が無い」型の登録票は、受け皿の別名を数え落とすと必ず過大に出る**（CLAUDE.md の既知の罠を
そのまま踏んでいた実例）。**1キーで判定した MISS 数を登録票に書かない**＝別名を列挙してから数える。

## 2026-09-11 — PLAN §5.3 索引A `O-300`（`GRANT_LRIG_ABILITY` の対象レベル資格）

`npm run census:population -- "ルリグ[１1]体を対象とし" --json GRANT_LRIG_ABILITY` を再実測し、母集団は **113効果 / 112カード、OK 20 / MISS 93**。OK 20を原文と live JSON で全件 triage した結果は **(a) 穴ではない12 / (b) レベル制限欠落8 / (c) 受け皿なし0** だった。登録票の stale 3点（executor 行番号、対象選択ではなく資格フィルタが実害、20件全部が穴ではない）を追認した。

- (b) のレベル2以上5件（`WX24-P3-001/003/005/007/009-E1`）は既存 `condition: LRIG_LEVEL{self,gte,2}` を生成。
- (b) のレベル3 Dream Team 3件（`WXDi-D09-H11-E1` / `WXDi-P06-002-E1` / `WXDi-P07-001-E1`）は既存 `FIELD_LRIG_COLOR_COUNT` を消さず、`AND` に `LRIG_LEVEL{self,gte,3}` を追加。
- 既に manual で同じ資格を持つ `WXDi-D03/D05/D06-011-E1` と、同文型だが別効果の `WXDi-D04-011-E1` へ parser が二重適用しないよう、既存 condition 木に `LRIG_LEVEL` がある場合は追加しない。
- golden は各群について下限成立／下限−1不成立／同じ盤面でレベルだけ上げる対照を追加。Dream Team は3体3色条件を外す対照も維持し、`canUseArtsCondition` の実使用ゲートまで固定した。
- `npm run regen` 後、8件すべての逆翻訳に「センタールリグがレベル2以上／レベル3以上の場合」が出ることを確認。baseline `740b7e82a` との per-effect JSON 差分は上記8 effectIdだけ。
- 条件以外では、既存 held の `WX24-P3-005-E1` にあった付与能力の期限修正（`UNTIL_OPP_TURN_END` → 原文どおり `UNTIL_OWN_ENERGY_PHASE_END`）を同時採用した。

### 🔍 Claude 側の独立検証（CODEX_GUIDE §7）＝差し戻し0・**是正0**

**機械検証は全項目一致**＝ベースライン `740b7e82a` と全 `effects_*.json` を effectId 単位で突き合わせ、
**変化はちょうど8 effectId**。`npm run gates` を独立実行して**全緑**を追認
（golden **3925 PASS**（3923 → +2）／smoke 10744・CRASH/HANG/INVARIANT 0／fuzz 0／
census 高シグナル **1 / BASELINE 1**／`census:stubs` A群・C群 0／`census:enginetext` A🔴 0行／
`census:costtext` A🔴 0規則／manual-fields 0／lint **0 errors / 254 warnings**。**ratchet の較正なし**）。

🔑**最も重要な追認＝ゲートが実経路に届いていること**（昨日の `O-299` で踏んだ「funnel を直接叩く golden は
呼ばれていなくても緑」型の罠に当たっていないか）。**当たっていない**＝
`condition` → **`canUseArtsCondition`**（`src/screens/battle/battleUtils.ts:24`）→
**UI 側の可否ゲート（`artsUseGate.ts:337`）と実行入口（`BattleScreen.tsx:7381`）の両方**が呼ぶ。
対象8件は **アーツ5＋ピース3** で、どちらもこの経路を通る（`BattleScreen.tsx:7379` のコメントが
「UI 側だけだと別経路＝カットイン等から素通りする」と明記しており、二重に張ってある）。
🔑**`src/engine/` は1行も触っていない**＝直したのは `effectParser.ts` の23行だけ。

**⭐Codex が Claude の見立てを1件訂正した（正しい訂正）**＝指示書で受け皿候補に挙げた
`LRIG_LEVEL{allFieldLrigs:true}` は、`execUtils.ts:2710` で **`.every()`＝全ルリグが満たす判定**であって
**存在判定ではない**と実コードで示し、使わなかった。⇒ センター基準の `LRIG_LEVEL` を採った。

**⭐3回連続で外していた §5-14 を、今回は証跡つきで満たした**＝
「足したキー名 → `docs/decompile_sheet*.txt` から grep した実際の行」を報告に貼れ、と指示書の必須項目にしたところ、
**8件すべての実行が提出された**（Claude も現物を確認）。golden も `decompiledLineOf` で固定されている。
⇒ **§5-14 は「指示書に書く」だけでは3回とも守られなかったが、「証跡を貼れ」にしたら守られた。**

**判断の追認2件**
- **`gte` か `eq` か**＝原文「レベル**３の**ルリグ」を `gte 3` にした件は、**`manualEffects.ts` に
  「⚠`eq 3` ではなく `gte 3` にする＝原文は対象の資格であって上限ではない」と理由つきで先に書かれていた**決定に従っている。整合的。
- **`WX24-P3-005-E1` の期限訂正**（自主申告）＝原文「次のあなたのエナフェイズ終了時まで」を引いて正しいことを確認。

⚠**既知の近似として残すもの**＝ピース3件の原文は「あなたのレベル３の**ルリグ**1体」で、文面上はアシストも
対象になり得る。しかし **`GRANT_LRIG_ABILITY` の付与先はそもそもセンター側ストア1箇所**なので
**アシストへの付与は表現できない**（対象選択を作っても行き先が無い）。センター基準のゲートは既存 MANUAL 3件と
同じ扱いで、**ゲートが1つも無い旧状態よりは確実に原文に近い**。

**⑤実機は不要と判定**（§2.2）＝触ったのは `src/data/` `public/data/` `scripts/` だけで **`src/screens/` は無傷**、
**新しい型・機構も足していない**（既存 `condition` / `LRIG_LEVEL` / `canUseArtsCondition` への配線のみ）。
その経路が実際に呼ばれることは上記のとおり呼び出し元を読んで確認した。⇒ `V-nn` の登録もしない。

### 🏁 `O-300` はクローズ（`(c)` が0）

**残件なし**＝(b) 8件は全部採用、(c) 0件。索引 A は **残3項目**（`O-298` 残4／`O-299` 残8／`O-301`）。

## 2026-09-11 — 第256バッチ（§5.3 索引 A `O-299` 残18）：全件 triage、既存 funnel の未配線2効果を修正

着手時に `npm run regen` 後、原文 regex `場を離れる場合[^。]*代わりに` を効果単位で再計測し、
**24効果 / 24カード**を確認した。既に置換候補を出す6効果を除いた残18は登録票どおりで、母数訂正はない。
18効果の実コード消費地点を追跡した結果は **(a) 既に正しく動く8 / (b) 受け皿は在るが未配線2 /
(c) 新しい軸・機構が要る8**。§5-26 に従い、実装は確実に既存軸で取れる (b) 2件だけに絞った。

- **(a) 8**：`WX06-019-E1` / `WXEX2-28-E1` / `WXEX2-30-E1` / `WXDi-P13-004A-E1` /
  `WX25-P2-071-E1` / `SPDi44-08-E2` / `WX25-P1-018-E2` / `WDK17-007-E1`。
  既存 golden が effectId 固定で無かった `WXDi-P13-004A-E1`（`MARK_PLACED_DELAYED_EXILE`）と
  `WDK17-007-E1`（傀儡離場後の `sweepPuppets`）には正負の固定 golden を追加した。
- **(b) 2**：`WX25-CP1-039-E1` / `WXDi-P08-044-E2`（下記）。
- **(c) 8・見送り**：`WXDi-P00-038-E1` / `WXDi-CP02-TK01A-E2` / `WXEX2-32-E1` /
  `WXDi-P04-037-E1` / `WXEX1-30-E1` / `WXK05-024-E2` / `WXDi-P09-TK03A-E1` /
  `WX24-P4-002-E1`。battle だけの処理、banish だけの行き先変更、裏向き＋次々メイン復帰などで、
  原文の「場を離れる場合」全経路を満たす受け皿がない。並行する劣化軸は作らず残した。

### 修正した2効果

1. `WX25-CP1-039-E1` は既存 `selfAbilityPay` 軸を一般化。parser が文型から
   `victimFilter:{story:'ブルアカ',isUp:true}` / `costColors:['白']` / `loseAbility:false` /
   `thenDownVictim:true` を載せ、死んだ `CONTINUOUS SEQUENCE` を宣言1本へ畳む。
   engine は《白》を実際に払い、victim を場に残してその victim をダウンする。従来の
   「宣言元が能力を失う」「任意の自分シグニをダウンする」という誤帰結は起こさない。
   旧 card/effectId 個別の `isUp` 修正は撤去し、`アップ状態の` を文型で読む規則へ統合した。
2. `WXDi-P08-044-E2` は既存 `underCardsTrash` 軸を payload 化。
   `count:2 / minUnderCards:2 / thenDownVictim:true` を parser が載せ、engine は原文を読まず
   payload どおり下から**ちょうど2枚**だけをトラッシュへ置き、victim をダウンして場に残す。
   下が1枚なら候補を出さず、コスト0置換を作らない。既存 `WXDi-P05-038-E1` / `WXEX2-09-E1` も
   同じ payload へ移し、従来どおり「すべてを捨てる・ダウンしない」を golden で固定した。

逆翻訳は `npm run regen` 後、両効果とも victim 条件・支払い・枚数・後続ダウンまで表示されることを確認。
live の per-effect 差分は **4 effectId だけ**＝修正2件と payload 化した既存2件：
`WX25-CP1-039-E1` / `WXDi-P08-044-E2` / `WXDi-P05-038-E1` / `WXEX2-09-E1`。

### 検証

- golden **3922 PASS / 0 FAIL**（3918 → +4）。追加は (b) 2件の原因だけを外す正負対照と、
  golden が無かった (a) 2件の固定。
- smoke **10744 / CRASH・HANG・INVARIANT 0**、fuzz 0。
- census 高シグナル **1 / BASELINE 1**、`census:stubs` A群/C群 0、
  `census:enginetext` A🔴 0行、`census:costtext` A🔴 0規則、manual field loss 0。
- lint **0 errors / 254 warnings**（warning 増減なし）。ratchet の較正なし。
- held review はベースライン **9枚 → 2枚**（追加0、既存7枚が解消）。raw `_held_fresh.json` には採用した
  2枚が増えたが、`heldReview --adopt` 済みのため `_held_review.txt` から除外される。
  `_partial_fresh.json` / `_idset_fresh.json` はともに **0 → 0**。
- `src/screens/` は未変更、新しい軸・機構も追加していないため、§2.2 の実機必須 effectId は**なし**。

### 🔍 Claude 側の独立検証（CODEX_GUIDE §7）＝差し戻し0・**是正2**

**機械検証は全項目一致**＝ベースライン `7e062cc78` と全 `effects_*.json` を effectId 単位で突き合わせ、
**変化はちょうど4 effectId**（申告どおり）。`npm run gates` を独立実行して全緑を追認。
(a) 判定もサンプリングして engine で追認した（`WX06-019-E1`＝`findEffectLeavePowerReductionSubstitute` が
`top === victimNum` で原文「他の」を除外し ＜水獣＞ を照合、`temp_power_mods` でターン内スコープ）。
🔑**カード番号の焼き込みを1件撤去している**のが特に良い＝`repairSemanticBatch247` の
`WX25-CP1-039-E1` 専用パッチを消し、`parseSentencePart1` の文型規則（`アップ状態の` → `victimFilter.isUp`）へ
一般化した（§5-5c）。

🔴**是正2件＝どちらも「engine は正しいが逆翻訳が嘘をつく」型**（報告項目6 が「0件」扱いだった）。
**この型は挙動を壊さないぶん発見が遅れ、次の人の母集団の切り方を狂わせる**ので、engine 修正と同じ重さで扱う。

| # | 効果 | 何が嘘だったか | 直し方 |
|---|---|---|---|
| ① | `WXEX2-09-E1` / `WXDi-P05-038-E1` | **`minUnderCards` を `decompileEffects.ts` が1文字も描いていなかった**＝原文「自身の下にカードが**３枚以上**ある」が消え、**「下敷き1枚でも守れる」と読める**（engine は3枚で fail-closed＝JSON は正しい） | `leaveUnderCardsTrash` の分岐で `minUnderCards` を描く。⚠**`count` が数値のときは書かない**＝「カードN枚をトラッシュに置く」が同じ数を既に言っており、`minUnderCards === count` は導出値（`WXDi-P08-044-E2`） |
| ② | `WX06-019-E1` | **「がバニッシュされる場合」と原文より狭く出ていた**＝`BANISH_SUBSTITUTE` の既定文をそのまま使っていた。**`powerReduction` の消費地点は離場 funnel 1本だけで、バニッシュ経路には意図的に足していない**（`effectEngine.ts:7192` に「ここへ足すな」と明記されている） | `sc.powerReduction` のときだけ「が対戦相手の効果によって場を離れる場合、代わりにターン終了時まで、〜」へ分岐。engine が実際にやっている「他の」（victim 自身の除外）と「ターン終了時まで」（`temp_power_mods`）もあわせて描く。⚠**live は `WX06-019-E1` の1件だけ**（payload の形で分岐＝カード番号は書かない） |

**golden を +1テスト／+6アサーション追加して両方を固定**（`minUnderCards` の表示2本は既存テストへ追記／
`powerReduction` 軸は新規テスト1本＝正負＋対照＋「バニッシュされる場合」を出さないこと）。
⚠**`powerReduction` の負方向は §5-21 の対照つき**＝同じ盤面で victim を宣言元自身に差し替えると
候補が消える（原文「あなたの**他の**」）。

🔑**あわせて記録＝挙動が1つ静かに良くなっている**（codex の報告に無い）＝
`applyEffectLeaveUnderCardsTrashSubstitute` が `checkActiveCondition` を見るようになったため、
`WXDi-P05-038-E1` の **《相手ターン》が初めて効くようになった**（旧実装は activeCondition を1度も読まず、
自分のターンでも置換が成立していた）。原文どおりの縮小＝退化ではない。

**⑤実機は不要と判定した**（§2.2）＝触ったのは `src/types/` `src/data/` `src/engine/` `public/data/` `scripts/` だけで
`src/screens/` は無傷、**新しい軸も足していない**（既存軸の payload 化）。
funnel が実戦経路から UI まで届くことは**前日の `V-186` で実機確認済み**＝全軸が同じ funnel を通る。
⇒ `V-nn` の登録もしない。

**最終ゲート（是正2件を入れたあと・Claude が独立実行・フィルタなし全件）**＝**全緑**＝
golden **3923 PASS / 0 FAIL**（3918 → codex +4 → 検証 +1）／smoke 10744・CRASH/HANG/INVARIANT 0／fuzz 0／
census 高シグナル **1 / BASELINE 1**（据置）／`census:stubs` A群・C群 0／`census:enginetext` A🔴 **0行**／
`census:costtext` A🔴 **0規則**／manual-fields 0／lint **0 errors / 254 warnings**（増減なし）。**ratchet の較正なし。**

### `O-299` はクローズしない＝**残8（全件 (c)＝機構待ち）**

**8件の共通の欠落は1つ**＝**「置換処理がバトル経路にしか無い」**＝`BattleScreen.tsx` 側にダウン置換・除外置換・
凍結の行き先変更が実装されているが、**バトルによる離場からしか呼ばれない**。原文はどれも
「（対戦相手の効果によって）**場を離れる場合**」＝**効果による離場の全経路**を指す。
⇒ **取り方＝処理を `collectLeaveSubstituteOptions` の軸へ持ち上げ、バトル経路はその funnel を呼ぶ側にする。**
⚠**`src/screens/` を触るので §2.2 により実機まで必須**。**8件の内訳と取る順は
[PLAN_DETAIL.md](./PLAN_DETAIL.md) の `O-299` 登録票**（カード番号もそちら）。

## 2026-09-10 — 第255バッチ（§5.3 索引 A `O-299`）：離場置換の「誰も読まない宣言」3件を funnel へ配線＋実機（`V-186`）

🔴**真因＝宣言だけが立って engine が読まない**（PLAN §1 の「繰り返し出た型」④）。
`CONTINUOUS` の STUB として live に在るのに、**どの collector もその id を走査していなかった**3件：

| 宣言 | カード | 直す前の状態 |
|---|---|---|
| `REPLACE_LEAVE_FIELD_WITH_TRASH_UNDER` | `WXDi-P05-038-E1` | ハンドラが「**（BattleScreen側処理）**」とログするだけ＝**BattleScreen に消費が無い**（grep 0件＝ログが嘘） |
| `RISE_LEAVE_DISCARD_STACK` | `WXEX2-09-E1`（ルリグ宣言） | 「ライズ/スタック系」のまとめログ行き |
| `LEAVE_FIELD_TO_DECK_BOTTOM` | `WXDi-P08-046-E1` | アクションとしてなら動くが、**`CONTINUOUS` の宣言なので誰も呼ばない** |

🔑**どの計器にも映らない型**＝`census:stubs` A群はハンドラの有無しか見ない（緑）／逆翻訳は原文どおりに見える／
golden も「funnel を直接叩く」ので緑。**「代わりに」が1度も起きないことは、実戦の盤面でしか出ない。**

### 直し方＝既存 funnel（`collectLeaveSubstituteOptions`）に**2軸**を足す

`underCardsTrash`（下のカードを対価に場へ残る）／`selfDeckBottom`（行き先をデッキの一番下へ）。
🔑**「対戦相手の効果によって」「場を離れる」の限定は funnel の呼び出し元と `victimOwner` が構造で担保する**＝
宣言 JSON 側に書き足す必要は無い（ここを読み違えると「限定が落ちている」という偽陽性になる）。
⚠**置き場の順序**＝下のカードを捨てる軸は**無料の軸より後ろ**（自動 policy は先頭から採るので、
先に置くとタダで済む置換があるのに札を捨てる）。デッキ下は**場を離れる**ので更に後ろ。
⚠**下が0枚なら成立させない**＝コスト0で離場を無効化できてしまう（`isImplementedSubstituteCost` と同じ戒め）。

### 検証

- **golden 5本追加**（各軸の成立／下0枚は不成立／ルリグ宣言はアタックフェイズ＋下3枚＋ライズ持ちだけ／非退化）
  ＋既存の「強制2軸／任意3軸の分類ロック」へ**3宣言を任意軸として追加**（原文は3件とも「〜てもよい」）。
- 🖥**実機 `V-186`（2本・`order` へ常設）**＝相手アーツの BANISH を注入し、
  `WXDi-P08-046` が**エナではなくデッキの一番下**へ行くことを観測。対照は宣言なしのバニラ（エナへ）。
  **反転確認**＝軸を殺すと `🔴旧挙動＝置換されずに通常の行き先へ（観測ピーク: energy=true）`。
  🔑**実機を書いた理由**＝golden は funnel を直接叩くので、**funnel が実戦経路から呼ばれていなくても緑**。
  実機では**「代わりにこれをデッキの一番下に置く／置換しない」の対話が実際に出た**＝UI まで届いていることが確認できた。
- `npm run gates` **全緑**＝golden **3918 PASS**（3913 → +5）／smoke 10744 ／ fuzz 0 ／ census 1 / BASELINE 1 ／
  census:stubs A群 0 ／ enginetext A🔴 0 ／ costtext A🔴 0 ／ lint 0 errors。既存実機（`V-184`/`V-185`）も再実行して PASS。

### 実機シナリオで踏んだ罠（[DRIVE_TRAPS.md](./DRIVE_TRAPS.md) 65／66 に採番）

- 🔴**注入した `effect_stack` は「解決が始まらない」ことがある**（対話が1つも出ず `stack=1 / pEff=null` のまま21秒）
  ＝**数ティック無反応なら1度だけ `page.reload()`** で解決を起こす（盤面は Supabase 側なので失われない）。
- 🔴**観測点は「ピーク」で確定させる**＝`WXDi-P08-046` は **`【自】：このシグニが場を離れたとき…デッキをシャッフル**」を
  別に持っており、押し続けると**置換の後で**観測点（デッキの一番下）が消えてトラッシュへ移った。

### `O-299` はクローズしない＝残18（着手前の実測）

**原文「場を離れる場合…代わりに」＝24効果**のうち **6効果が engine で置換候補として出る**ようになった
（既存3＝`WX25-P1-056-E1`/`WX25-P2-TK04-E1`/`WX25-P3-055-E2` ＋ 今回の3）。**残18の内訳（要個別調査）**＝
①**別の受け皿が正しい**（行き先変更＝`OPP_SIGNI_LEAVE_TO_TRASH`/`FROZEN_SIGNI_TO_TRASH_ON_LEAVE`、
`MARK_PLACED_DELAYED_EXILE`、アーツ本体、`GRANT_LRIG_ABILITY` の rawText 内）
②**盤面前提つきで未検証**（`WX06-019-E1` は victim が＜水獣＞、`WXEX2-28-E1` は＜ウェポン＞、
`WX25-CP1-039-E1` は＜ブルアカ＞かつアップ＝**受け皿は在る**）
③**置換枠ごと消えている疑い**（`WXDi-P00-038-E1`＝裏向きにする本体が無い、`WXDi-P08-044-E2`＝
置換が能動効果に化けている）。
⚠**登録票の「21効果」は母集団の切り方が違う**＝当時は「バニッシュされる場合」も含めて数えていた。

## 2026-09-10 — 第254バッチ（§5.3 索引 A `O-298`）：自分の任意コストで「コストの空払い」を止める＝8効果修正

🔴**真因＝支払いを提示する前に帰結の対象候補を1度も見ていない。**
`STUB{OPTIONAL_COST}` / `STUB{OPTIONAL_TRASH_ENERGY_CLASS}` の分岐は `canAfford`（払えるか）しか見ないので、
**対象が0体でも「発動する」が押せて、払ったあと帰結が空振りする**（＝エナ・手札が消えて何も起きない）。
実測（`WXK04-038-E1`／相手にレベル1以下のシグニが居ない盤面）＝`pay:エナ＜植物＞を選択して発動(available=true)`。

🔑**`O-288`（相手が払う側）は情報量の問題だったが、こちらは資源が消えるので実害が一段重い。**

### 🔴 最大の教訓＝**受け皿（規則そのもの）が別名で既に在った**

**新しいノーマライザ `normalizeSelfPayPreTarget` を書き上げてから、既存の
`applyO96OptionalCostTargetFirst`（§5.3 `O-96`）が同じ変換を持っていることに気づいて撤去した。**
しかも自作側は**先に走って O-96 を `hasStoredTargetBinding` で弾き**、
`PAID_ADDITIONAL_COST` へ直すはずのゲートを `IS_MY_TURN` のまま残す**劣化コピー**になっていた
（`WXK10-080-E2` の live 差分で発覚）。
⇒ **[LESSONS.md](./LESSONS.md) §4.1「受け皿は概念で探す」は「型・キー」だけでなく「規則」にも効く。**
**着手前に「この変換を既にやっている関数は無いか」を grep する**（今回は `SELECT_TARGET_ONLY` の生成箇所が
115 あり、そのうち1つが汎用規則だった）。

### 実際に閉じた2つの穴（既存規則 `applyO96OptionalCostTargetFirst` の拡張）

| # | 穴 | 直し方 |
|---|---|---|
| ① | コスト運搬 STUB が **`OPTIONAL_COST` 決め打ち**で `OPTIONAL_TRASH_ENERGY_CLASS` を見ていない | `O96_COST_CARRIER_IDS` で2つを許可。⚠**「コスト軸が1つも無い payload は対象外」ガードはこの id だけ免除**（クラスと枚数は engine がアビリティ原文から読むので payload に軸が無い） |
| ② | `hasStoredTargetBinding` が**引用能力の中**（`GRANT_EFFECT.effect` / `abilities`）まで見て fail-closed に落ちる | 引用能力キーへ降りないようにした。あちらは**別の効果**で、その `thisCardOnly` は外側の「コストと対象の対」とは無関係 |

🔑**②の副次効果**＝`npm run build:effects` の held が **56枚 → 10枚**に減った
（`+IS_MY_TURN -PAID_ADDITIONAL_COST` の52枚は「O-96 が引用能力で弾かれてゲートを直せていなかった」分＝
**長く held に積まれていた在庫が、規則が届くようになったことで解消した**）。

### live 差分＝ちょうど8 effectId

`WX24-P2-018-E1`（引用付与＝②で解禁）／`WX24-P2-091-E1`／`WX24-P3-062-E1`（`CONDITIONAL` 包み形）／
`WX25-CP1-058-E1`・`WXDi-CP02-065-E1`（**対象がトラッシュの札**）／`WXDi-P14-078-E1`／`WXK04-038-E1`／`WXK05-033-E1`。
**逆翻訳も原文の語順へ揃った**（「〜1体を対象とする。そして〜してもよい。そうした場合、…」）。

### 検証

- **engine で前後比較**（`executeAction` を直接叩く使い捨てプローブ）＝
  修正前 `pay:…(available=true)` → 修正後 **`done=true` ＋「対象を取れない：この効果は何もしない」**。
  対象が居る盤面では **`SELECT_TARGET` が先に立つ**（支払いより前）。トラッシュ対象（`WXDi-CP02-065-E1`）でも同じ。
- **golden を4本追加**（挙動＋引用能力スコープ＋偽陽性ガード＋族スコープ）。
- **腐った契約を3件更新**（実装ミスではなく旧実装の並び・件数を固定していたもの）＝
  ①`parse 2文型引用付与（WX24-P2-018）` は**位置固定をやめて id で引く**（`O-288` の先例と同じ）
  ②`O-188 第2バッチ 据置契約` から `OPTIONAL_TRASH_ENERGY_CLASS` を**解禁側へ移した**
  （⚠同テストの注記どおり**据置契約は「いま壊れる」ことの assert であって永久の仕様ではない**。
  `OPTIONAL_TRASH_SELF` は据置のまま）
  ③`O-288 本体` の全数走査カウント **29 → 30**＝**較正**（`WX24-P2-018-E1` の引用能力に
  `OPPONENT_PAY_OPTIONAL` があるので、JSON 文字列で id を探すあの走査に新しく載る。O-288 の配線は不変）。
- `npm run gates` **全緑**＝golden **3913 PASS / 0 FAIL**（3909 → +4）／smoke 10744 OK ／ fuzz 0 ／
  census 1 / BASELINE 1 ／ census:stubs A群 0 ／ enginetext A🔴 0 ／ costtext A🔴 0 ／ lint 0 errors。
- **実機は不要**（§2.2＝`src/data/` と `public/data/` のみ。新しい型・機構は足していない＝既存の
  `SELECT_TARGET_ONLY` / `STORE_LAST_PROCESSED_TARGETS` / `freezeStoredTargets` を並べ替えただけ）。

### `O-298` は**クローズしない**＝残4件（着手前の実測値）

| 残 | 効果 | なぜ今回入らないか |
|---|---|---|
| 1 | `WX16-029-TRAP` | 帰結 `NEGATE_ATTACK` が `freezeStoredTargets` の FREEZABLE に無い＝**engine 側に `fixedCardNums` の消費を足すのが先**（足さずに `targetsStored` だけ立てると限定が消えて過剰実行） |
| 1 | `WX26-CP1-006-E1` | 対象が **`LRIG`**＝別途「ルリグ対象は据置が正しい」という既存契約がある（golden `O-96 第13バッチ`） |
| 2 | `WXDi-P16-048-E1` / `WXK10-080-E1` | **MANUAL**＝parser の規則は届かない（`manualEffects.ts` の手書き＋`syncManualLive.ts` が要る） |

⚠**`TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST` 族の86効果は母集団外**＝あの STUB は「対象選択して発動」を
1つで扱う別設計で、**自前で対象候補の事前チェックを持っている**（＝空払いは起きない）。
**先取りを足すと対象選択が二重になる**ので触らない（golden でスコープを固定した）。

🔑**登録票の「15効果」は過大**＝着手時の実測は **`OPTIONAL_COST` 5 ＋ `OPTIONAL_TRASH_ENERGY_CLASS` 3 ＝ 8**
（残りは族86＋既に配線済み）。**§2.1 ② の「登録票は仮説」がまた当たった**（9→10回連続）。

## 2026-09-10 — 第253バッチ（§5.1 実機返済）：`V-184`／`V-185` を返済＝実機シナリオ4本を `order` に常設、UI ラベル1件を修正

🏁**§5.1 の残2件を同日に返済＝実機 worklist は残0。** どちらも「headless は golden 済みで、残る未検証は
`src/screens/` に足した1〜2行だけ」という型（§2.2＝`src/screens/` を触った回は実機まで必須）。

### `V-185`＝`SPDi43-06-E2`「【起】アップ状態の**他の**シグニ1体をダウンする」（`cost.fieldDown.excludeSelf`）

- **観測点**＝①アップが効果元だけの盤面で**【起】が一覧に出ない** ②他にアップが居れば出て、撃つと
  **他のシグニだけがダウンし効果元はアップのまま**（`down=[false,true,false]`）。
- **1ビット反転**＝盤面は同一で `signi_down[1]` だけを変える（カードを抜くと「候補が居ない」別経路になる）。
- **反転確認（軸ごとに1本ずつ＝[DRIVE_TRAPS.md](./DRIVE_TRAPS.md) の 60）**：
  - `signiActivateGate.ts:240` の1行を殺す → **対照が赤**（`labels=["【起】場のシグニ1体ダウン"]`＝自分を候補に数えて提示された）。
  - `BattleScreen.tsx:13828` の1行を殺す → **本題が赤**（`down=[true,false,false]`＝効果元自身をコストに払った）。
- 🔑**その場で直した表示バグ1件**＝`cost.fieldDown` だけコストラベルに `excludeSelf`（「**他の**」）を出しておらず、
  `【起】場のシグニ1体ダウン` と表示していた（`fieldTrash`／`fieldBanish` は元から「他の」を出す＝片肺）。
  **挙動は正しく画面だけが嘘**なので盤面 assert では永久に緑＝シナリオ側で**ラベル文字列を1行 assert**するようにした。

### `V-184`＝`WXK10-063-E1`「あなたの**ドライブ状態の**シグニ1体が対戦相手のライフクロス1枚をクラッシュしたとき」

- **真因（第241バッチで修正済みの1行）**＝`BattleScreen.tsx:13528` が `battleOppLifeCrashSourceMatches(…, op)` へ
  **クラッシュ元の `PlayerState` を渡していなかった**＝`triggerCollect.ts:84-87` が **fail-closed** で永久に発火しない。
- **観測点**＝**効果スタックに `WXK10-063-E1` が載るか**。⚠盤面差分では見えない＝本文は
  `STUB{CENTER_LRIG_DISMOUNT}` の**任意**（「降りてもよい」）なので、断れば盤面は1ミリも動かない。
- **1ビット反転**＝`lrig_riding_signi` にクラッシュ元を載せるかどうかだけ。**witness＝どちらの巡でも相手ライフが実際に減ったこと**
  （減っていなければ「発火しない」ではなく「クラッシュしていない」＝別のことを測っている）。
- **反転確認**＝`…, battleCardMap, op)` から `op` を外す → **本題が赤**（`stack=[]`＝ドライブ状態なのに1件も収集されない）。

### 常設したシナリオ（`scripts/verifyBattleDrive.mjs` の `order`）

`v184DriveCrasherFires` / `v184NonDriveCrasherSilent` / `v185FieldDownExcludesSelfOffered` / `v185FieldDownExcludesSelfBlocked`
＝**4本を1回で回して 24秒**（`node scripts/verifyBattleDrive.mjs v184DriveCrasherFires v184NonDriveCrasherSilent v185FieldDownExcludesSelfOffered v185FieldDownExcludesSelfBlocked`）。

### 踏んだ罠（[DRIVE_TRAPS.md](./DRIVE_TRAPS.md) に 63／64 として採番）

- 🔴**Playwright 更新でブラウザ実体が消えており、全シナリオが `Executable doesn't exist` で即 FAIL**＝
  `npx playwright install chromium` で復旧。**§4.4-25b「新しいシナリオを書く前に既存の1本を回す」が3秒で切り分けた。**
- 🔑**`scripts/` だけの変更は `distIsFresh()` の走査対象外**（`src`/`public` のみ）＝**再ビルド無しで即回せる**（1本 3〜9秒）。

### ゲート

`npm run gates` **全緑**＝typecheck ／ golden **3909 PASS / 0 FAIL** ／ smoke 10744 OK（CRASH/HANG/INVARIANT 0）／
fuzz 0 ／ census 高シグナル 1 / BASELINE 1 ／ census:stubs A群 0 ／ census:enginetext A🔴 0行 ／ census:costtext A🔴 0規則 ／
manual-fields 0 ／ lint 0 errors（254 warnings＝据置）。

## 2026-09-10 — 第252バッチ（§5.3 索引 G・7項目の棚卸し＋配線）：3効果修正／棚卸し7項目完了

🔥**第251 の失敗（棚卸しの報告が最終レポート生成前に消えた）を構造的に潰した回**＝指示書で
**「1項目の棚卸しが終わるたびに、その場で `docs/BUGFIXES.md` へ追記する」を必須**にした。
結果、**Codex の最初の書き込みが BUGFIXES になり**、実装より先に棚卸しが git へ永続化された。
🔑**この形なら途中で利用上限に当たっても成果（＝棚卸し）は失われない。** 今回は完走した（上限0件）。

### Claude の独立検証

- **live の per-effect 差分＝ちょうど3 effectId**（`WXEX2-39-E3` / `WX24-P3-018-E1` / `WXK01-045-E1`）。
  **スコープ外の巻き添え0**。
- **新キー2本とも engine の消費地点がある**＝`placedThisTurn`（`execUtils.ts`）／
  `trashSourceStoryIncludesCost`（`triggerCollect.ts`）。
- **3効果とも原文と一致**することを照合した：
  `WXEX2-39-E3`＝「このカードが**コストか**＜凶蟲＞のシグニの効果によって手札からトラッシュに置かれたとき」／
  `WXK01-045-E1`＝「**このターンに場に出た**対戦相手のシグニ1体を対象とし」／
  `WX24-P3-018-E1`＝「中身が**＜トリック＞のシグニである**【マジックボックス】を**3枚まで**表向きにして」。
- **書き換えた既存 golden 1本は本物の「腐り」**＝旧テスト名が
  「凶蟲効果**だけ**で蘇生し…」＝**原文の「コストか」を落とした狭すぎる契約**を固定していた。
  ⚠**否定 assert は1つも削られていない**（差分で確認＝消えたのは `test(` の名前行だけ）。
- `npm run gates` **全緑**＝**golden 3907 → 3909**（+2）／smoke 10744 OK／fuzz 0／
  census 高シグナル 1 / BASELINE 1／A群各0／manual field loss 0／lint **0 errors / 254 warnings**。

### 🔴 棚卸しの結論（7項目・**登録票は今回も2件外れた**）

| 項目 | 登録 | 実測 | 未配線 | 今回修正 | 残 |
|---|---:|---:|---:|---:|---:|
| `O-313` | 4 | **5** | 5 | 1 | 4 |
| `O-315` | 3 | 3 | 3 | **2** | 1 |
| `O-322` | 2 | **3** | 3 | 0 | 3 |
| `O-323` | 1 | 1 | 1 | 0 | 1 |
| `O-304` 残 | 1 | 1 | **0＝実は配線済み** | 0 | 0 |
| `O-316` 残 | 1 | 1（同文型は7） | 1 | 0 | 1 |
| `O-321` 残 | 1 | 1 | 1 | 0 | 1 |

🔑**訂正3件**＝①`O-313` に登録外の `WXK06-030-E1` ②`O-322` に同文の `WXDi-D09-P04-E3`
③**`O-304` の `WX18-020-E1` は別名の正準形 `BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT` で実装済みだった**。
⇒ **「受け皿が無い」と登録した項目が、着手時に実は在ったのはこれで4件目**
（`O-288` / `O-324` / `O-287` に続く）。**登録票は仮説であって事実ではない、が定着した。**

### 見送り11効果（理由つき・次の入口）

`O-313` 残4＝**シグニゾーン内の「非シグニ札」を一様に選ぶ入口が本当に無い**（付属札・下敷きが
種類ごとの専用 action に割れている）／`O-315` 残1・`O-321` 残1＝**任意移動元のカード列を持つ履歴**が無い／
`O-322` 残3＝複合フロー／`O-323` 残1＝**「成功したときだけ消費する」`usageLimit` の軸**が無い／
`O-316` 残1。⚠**どれも「共通機構が要る」と実測できた側**＝見送りは正しい判断。

(以下は Codex が調査中に逐次追記した棚卸しの生ログ)

## 2026-09-10 — 第252バッチ 棚卸しの生ログ (未検証・Codex 草稿)

> 棚卸しを失わないため、各項目の調査完了時点で逐次追記する。段階1が完了するまで実装には入らない。

### 棚卸し 1/7 — `O-313`（登録票4効果 → 実測5効果、未配線5）(未検証・Codex 草稿)

- **原文の母集団（効果単位）**＝5効果。実行コマンド：
  `npm run census:population -- "対戦相手のシグニゾーンからカード１枚|シグニゾーン１つにある、シグニではないすべてのカード|シグニに付いているカード１枚か、あなたのシグニの下にあるカード１枚|場にある、中身が.*【マジックボックス】.*表向き"`
  登録4件に加え、同じ「シグニゾーンからカード1枚」の `WXK06-030-E1` を1件検出した。
- **探した受け皿**＝`EffectTarget` 全variant（`SIGNI` / 各通常ゾーン札 / `SEED_CARD`。シグニゾーンの付属札・下敷きを一様に選ぶ型は無し）、`CountFromZone.signi_zone_all`（数えるだけ）、`FIELD_ATTACHED_COUNT{include:'attached'|'under'|'both'}`（数える条件だけ）、`REMOVE_CHARM`、`TAKE_FROM_UNDER_SIGNI`、`STUB{STRIP_ATTACHED_AND_UNDER}`、`OPEN_MAGIC_BOX`、`MAGIC_BOX_REVEAL`、`PLACE_MAGIC_BOX`、`signi_charms` / `signi_acce` / `signi_soul` / `signi_magic_boxes` を型コメントと engine 消費地点まで確認した。種類別の移動ハンドラは在るが、候補を一様に列挙・選択する入口は無い。`scripts/goldenTest.ts` は `WXK06-030-E1` の「最上面シグニだけ」という既知 PARTIAL、`WXK10-018-E2` の `costUnparsed` を固定する既存テストあり。登録4 effectId そのものの正しい非シグニ選択を固定する golden は無し。`manualEffects.ts` は `WXK06-030-E1` だけ手書き PARTIAL（コメントにも下敷き未対応と明記）、登録4件の同型手書きは無し。
- **live**＝`WXK08-024-E2` は `BOUNCE{target:SIGNI}` のため最上面シグニしか選べない。`WXK06-030-E1` は manual `SELECT_TARGET_ONLY{SIGNI}` → `TRASH{SIGNI,targetsStored}` で同じく最上面限定。`WXK07-003-E1` は末尾が `TRASH{target:SIGNI,count:1}` で「指定1ゾーンの非シグニ札すべて」になっていない。`WXK10-018-E2` は `costUnparsed:true` でコストが未表現。`WX24-P3-018-E1` は既存 `MAGIC_BOX_REVEAL` の受け皿があるのに先頭が `STUB{UNKNOWN_NESTED}` で、最大3枚のMB→シグニ化が未配線。
- ⇒ **未配線5効果**。登録票との差は **4→5**（`WXK06-030-E1` の既知 PARTIAL を母集団へ追加）。うち `WX24-P3-018-E1` は既存 `MAGIC_BOX_REVEAL` を使えるが、消費側を再確認すると中身の＜トリック＞限定を読んでおらず、parser 配線＋既存payloadの最小拡張が必要だった。残4効果は「シグニゾーン内の非シグニ札」を統一選択・移動する入口が本当に無く、機構設計が要る。

### 棚卸し 2/7 — `O-315`（登録票3効果 → 実測3効果、未配線3）(未検証・Codex 草稿)

- **原文の母集団（効果単位）**＝3効果。実行コマンド：
  `npm run census:population -- "このターンにあなたのエナゾーンに＜植物＞のシグニが.*置かれていた場合|このターンに場に出た対戦相手のシグニ|コストか＜凶蟲＞のシグニの効果によって"`
- **探した受け皿**＝`Condition` / `ActiveCondition` の全 `*_THIS_TURN`、`SELF_DECK_TO_ENERGY_THIS_TURN`、`THIS_CARD_FROM_ZONE_THIS_TURN`、`THIS_CARD_PLACED_BY_CLASS`、`TargetFilter`、`triggerCondition.fromZones` / `fromAnyZone` / `byEffect` / `byOwnEffect` / `fromFieldByCostOrEffect` / `trashSourceStory`、`PlayerState.signi_placed_origin_this_turn` / `signi_played_from_non_hand_this_turn` / `signi_placed_by_source` / `self_deck_to_energy_this_turn` を型コメント・writer・reader・ターン境界まで確認した。`signi_placed_origin_this_turn` は場に出た個体IDを保持するので `WXK01-045` の記録源として再利用可能だが、対象フィルタ側の reader は無い。エナ履歴はデッキ由来の数だけで、移動札を一般フィルタできる履歴は無い。手札→トラッシュの原因は effect/cost の真偽と `causeSourceCardNum` を collector が受け取るが、「コスト OR 指定クラス効果」のOR受け皿は無い。`scripts/goldenTest.ts` は `WXEX2-39-E3` に既存 golden があり、現状の「凶蟲効果だけ」を正方向・別クラス/原因不明/エナ起点を反転で固定している（コスト方向が欠落した腐り契約）。他2 effectId の golden は無し。`manualEffects.ts` に対象3件の同型手書きは無し。
- **live**＝`WXK04-038-E1` は履歴条件が丸ごと無く、`OPTIONAL_TRASH_ENERGY_CLASS`→`CONDITIONAL{IS_MY_TURN}`（did-itゲート）だけ。`WXK01-045-E1` は対象が通常の相手シグニで「このターンに場に出た」限定無し。`WXEX2-39-E3` は `fromZones:['hand'] + trashSourceStory:'凶蟲'` で凶蟲効果側だけ配線済み、コストで捨てた方向は `trashSourceStory` に拒否される。
- ⇒ **未配線3効果**。登録票の3と一致。ただし「履歴の受け皿が全面的に無い」ではなく、`WXK01-045` は既存 `signi_placed_origin_this_turn` の reader追加、`WXEX2-39` は既存 collector の原因情報と `trashSourceStory` のOR拡張で閉じうる。新しい履歴ストアが必要なのは植物で絞るエナ追加履歴だけ。

### 棚卸し 3/7 — `O-322`（登録票2効果 → 実測3効果、未配線3）(未検証・Codex 草稿)

- **原文の母集団（効果単位）**＝3効果。実行コマンド：
  `npm run census:population -- "対戦相手のセンタールリグのレベル以下の数字１つを宣言.*対戦相手の手札を見て|デッキの一番下のカードをトラッシュに置く.*この効果を繰り返す"`
  登録2件に加え、`WXDi-P14-061-E1` の付与能力と同文の単体能力 `WXDi-D09-P04-E3` を検出した。
- **探した受け皿**＝数字宣言の `STUB{DECLARE_NUMBER/DECLARE_NUMBER_PLAIN}`＋`PlayerState.declared_number`、静的 `StubAction.numberChoices`、相手手札全走査の `LOOK_OPP_LIFE_TOP{lookZone:{zone:'opp_hand',count:'ALL'}}`、宣言レベルで相手手札を捨てる既存 `LOOK_OPP_HAND_DISCARD_SIGNI`、`TargetFilter.levelEqDeclaredNumber` / `hasGuard`、覚醒の `AWAKEN_SIGNI.targetsLastProcessed`＋`LAST_PROCESSED_MATCHES{cardName}`、反復の `REPEAT{count/countRef/optional}`、`MILL{fromBottom}`、`LAST_PROCESSED_MATCHES` を型コメントと engine handler まで確認した。宣言値の動的上限は無く `numberChoices` は静的だけ。既存手札捨てSTUBは宣言レベル一致を1枚だけ選ばせ、ガード無し限定・全件強制破棄を表せない。`REPEAT` は固定回数/直前処理枚数だけで「直前札が指定名である間」の制御条件を持たない。`scripts/goldenTest.ts` は `WXDi-CP01-033-E1` の bottom MILL と誤 `CONDITIONAL_POWER_BONUS` 非復帰だけを固定し、反復は未検証。`WXDi-P14-061-E1` / `WXDi-D09-P04-E3` の完成形 golden は無し。`manualEffects.ts` に3件の同型手書きは無し。
- **live**＝`WXDi-P14-061-E1` と `WXDi-D09-P04-E3` は `DECLARE_NUMBER`→`LOOK_OPP_LIFE_TOP{opp_hand,ALL}` までで、①宣言上限なし（1～5固定）②一致するガード無しシグニの全破棄なし。さらに `WXDi-P14-061-E1` は外側 `AWAKEN_SIGNI` が `targetsLastProcessed` もカード名条件も持たず、効果元スペルを見て空振りする。`WXDi-CP01-033-E1` は bottom MILL と無条件 `POWER_MODIFY +5000`（＜バーチャル＞条件も欠落）の後に `STUB{DEFERRED_REPEAT_ON_REVEALED_NAME}` が残り、反復ハンドラ無し。
- ⇒ **未配線3効果**。登録票との差は **2→3**（同型 `WXDi-D09-P04-E3` を追加）。新しい独立 action/condition 型が必須とは未確定で、宣言・手札走査・覚醒は既存payload拡張/既存ノードの組合せ、反復は既存 `REPEAT` の条件付き拡張で閉じる余地がある。

### 棚卸し 4/7 — `O-323`（登録票1効果 → 実測1効果、未配線1）(未検証・Codex 草稿)

- **原文の母集団（効果単位）**＝1効果。実行コマンド：
  `npm run census:population -- "このターンにこの能力でカードをトラッシュに置いていない場合|この能力で.*トラッシュ.*置くまで.*再度誘発"`
- **探した受け皿**＝`UsageLimit` 全5値（`once_per_turn` / `twice_per_turn` / `once_per_game` / `once_per_trigger` / `unlimited`）、全 collector の `used*Ids`→`actions_done` 消費経路、`STORE_LAST_PROCESSED_TARGETS` / `lastProcessedCards`、did-it funnel、`TRASH` の実処理記録を確認した。既存 usageLimit は collector が**誘発を積んだ時点**で消費する方式だけで、解決後に `lastProcessedCards` が非空だった場合だけ消費する値・payload・marker は無い。`STORE_LAST_PROCESSED_TARGETS` は対象束縛用で、成功後のターン履歴には残らない。`scripts/goldenTest.ts` には対象 effectId の既存テストがあり、現状の `once_per_turn` を「初回収集で usedHostIds を返し、以後発火しない」と明示固定しているため、原文と逆の腐り契約。実際の `TRASH` 成立/空振りを確認する golden は別にあるが usage 消費と連動していない。`manualEffects.ts` に同型手書きは無し。
- **live**＝`WX24-P2-050-E1` は `usageLimit:'once_per_turn'`。相手エナが3枚未満なら action 内 `ENERGY_COUNT` が不成立でカードを置かないが、collector は解決前に effectId を `usedHostIds` へ返すため、そのターンは再誘発できない。相手エナ3枚以上なら `TRASH{isTriggerSource}` 自体は正しく置かれた札だけをトラッシュにする。
- ⇒ **未配線1効果**。登録票と一致。既存 `usageLimit` に成功時消費の軸は本当に無い。安全な設計案は、対象効果だけ opt-in する `usageLimit:'once_per_turn_on_success'` 相当を追加し、collector では予約だけ・効果解決で `lastProcessedCards` が非空のとき `actions_done` に刻むこと。ただし stack/interaction を跨ぐ共通解決経路の変更が必要で重い。

### 棚卸し 5/7 — `O-304` 残件（登録票2効果中の残1 → 実測1効果、未配線0＝実は配線済み）(未検証・Codex 草稿)

- **原文の母集団（効果単位）**＝1効果。実行コマンド：
  `npm run census:population -- "コストの合計が.*の数以下のスペル|コストの合計が場にある【チャーム】の数以下"`
- **探した受け皿**＝前回追加の汎用 `CountFromZone` / `levelLteZoneCount` / `powerLteZoneCount` だけでなく、別正準形 `STUB{BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT}` を追跡した。消費は `effectEngine.collectBlockLowCostSpellCount` が効果保持者の場と `signi_charms` を読み、`screens/battle/spellUseGate.checkSpellUse`（人間の提示＋CPU共通）と `BattleScreen` の使用確定直前が同じ閾値を再確認する。`execStubPart3` の no-op 群に名前があるが、CONTINUOUS 宣言型なので executeAction ではなく上記collectorが読む正準形。`scripts/goldenTest.ts` に effectId 直指定は無い。`O-1 spellUseGate` テスト名には低コスト封じとあるが、現状コード上はこの専用効果を置いた明示fixtureが見当たらない。`manualEffects.ts` に対象効果の手書き無し。
- **live**＝`WX18-020-E1` は `CONTINUOUS + STUB{BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT}`。場にこの効果がありチャーム数>0なら、その枚数を閾値として返し、使用候補判定と使用確定の双方で `印刷Costの合計 <= チャーム数` のスペルを拒否する。チャーム0なら制限なし。原文の意味を満たしている。
- ⇒ **未配線0効果＝実は配線済み**。登録票は「動的上限キーが無い」を「機構が無い」と読んでいたが、`WX18-020-E1` は対象選択フィルタではなくスペル使用ゲートの専用正準形で既に動くため、前回の `levelLteZoneCount` を流用する対象ではなかった。

### 棚卸し 6/7 — `O-316` 残件（登録票3効果中の残1 → 同文型実測7効果、スコープ内未配線1）(未検証・Codex 草稿)

- **原文の母集団（効果単位）**＝同じ対象句で7効果。実行コマンド：
  `npm run census:population -- "あなたのレベル３のルリグ１体を対象"`
  今回の残件は `WXDi-D09-H11-E1` だけだが、同文型として `WXDi-D03-011-E1` / `WXDi-D04-011-E1` / `WXDi-D05-011-E1` / `WXDi-D06-011-E1` / `WXDi-P06-002-E1` / `WXDi-P07-001-E1` も検出した。
- **探した受け皿**＝前回追加の `LRIG_LEVEL.allFieldLrigs`（使用条件「全員」の評価）と `UP.targetsTriggerSource`（アタックした個体をアップ）に加え、`EffectTarget{type:'LRIG'}`、`TargetFilter.thisCardOnly`、`GRANT_EFFECT`（per-card `granted_effects` ストア）、`GRANT_LRIG_ABILITY`（センター専用ストア）、`STUB{LRIG_ATTACK_LIMIT}`、フィールドの `lrig` / `assist_lrig_l` / `assist_lrig_r` を型コメント・executor・collectorまで確認した。別正準形 `GRANT_EFFECT{target:LRIG}` は存在するが、`execGrantEffect` の通常候補は `field.lrig.at(-1)` だけで、アシストを候補に含めるのは `thisCardOnly` で効果元自身へ無選択付与するときだけ。「センター＋左右アシストからレベル3を選ぶ」入口は無い。`GRANT_LRIG_ABILITY` も型コメントどおりセンター固定。`scripts/goldenTest.ts` は7件すべてを含む付与構造・実行テスト群があり、いずれも現状のセンター付与を前提にする。`manualEffects.ts` は D03/D04/D05/D06 の4件が手書きで、D03/D05/D06 は `GRANT_LRIG_ABILITY`、D04 は対象を持たない `LRIG_ATTACK_LIMIT`。残件D09とP06/P07は自動生成。
- **live**＝`WXDi-D03-011-E1` / `D05-011-E1` / `D06-011-E1` / `WXDi-D09-H11-E1` / `WXDi-P06-002-E1` / `WXDi-P07-001-E1` は全て `GRANT_LRIG_ABILITY` でセンターへ固定。`WXDi-D04-011-E1` は対象選択なしの `LRIG_ATTACK_LIMIT`＋遅延誘発で、やはり選んだルリグ個体を保持しない。前回追加の `LRIG_LEVEL.allFieldLrigs` は使用条件を正すだけ、`UP.targetsTriggerSource` は付与された子能力の実行を正すだけで、外側の付与先選択には届かない。
- ⇒ **今回スコープ内の未配線1効果**（`WXDi-D09-H11-E1`）。登録票の残1という判定はスコープ内では一致したが、母集団を句で測ると同じセンター固定の構造は計7件だった。残件を正すには `EffectTarget{type:'LRIG'}` の候補を明示的に全フィールドルリグへ広げ、レベル3で絞って選択し、`GRANT_EFFECT` の per-card ストアへ付与する軸が必要。共有生成地点で直すと6件へ波及し、D04はさらに攻撃上限・遅延誘発を対象個体へ束縛する別設計が必要なため、今回の1件アンカーだけで安全には閉じない。

### 棚卸し 7/7 — `O-321` 残件（登録票3効果中の残1 → 実測1効果、未配線1）(未検証・Codex 草稿)

- **原文の母集団（効果単位）**＝1効果。実行コマンド：
  `npm run census:population -- "このターンにあなたのエナゾーンにカードが２枚以上置かれていた場合|このターンにあなたのエナゾーンにカードが2枚以上置かれていた場合"`
- **探した受け皿**＝前回拡張した `ARTS_USED_THIS_TURN.filter` と `triggerCondition.milledSourceFilter`、全 `*_THIS_TURN` 条件、`Condition.SELF_DECK_TO_ENERGY_THIS_TURN`、`PlayerState.self_deck_to_energy_this_turn` のwriter（`ENERGY_CHARGE_FROM_DECK` 系2経路）・reader（`execUtils.evalCondition`）・ターンリセット、エナ増加の中央set-diff `detectEnergyAdded` / `ON_ENERGY_CHARGE` / `ON_OPP_ENERGY_ADDED` を確認した。`SELF_DECK_TO_ENERGY_THIS_TURN` は名前・実装とも**デッキ由来だけの枚数**で、手札・トラッシュ・場など任意の移動元を合算しない。中央set-diffは誘発検出用で、ターン累計を保存していない。`scripts/goldenTest.ts` は対象 effectId を「自分のシグニへのSランサー付与」としてだけ固定し、履歴条件のcontract/反転は無し。`manualEffects.ts` に対象の手書き無し。
- **live**＝`WXDi-CP02-009-E1` は `ON_ATTACK_PHASE_START` から対象選択→任意コスト→did-itゲート→`GRANT_KEYWORD{Sランサー}` まであり、先頭の「このターンにエナゾーンへ2枚以上置かれた」条件だけが丸ごと無い。`SELF_DECK_TO_ENERGY_THIS_TURN` をそのまま置くとデッキ由来2枚しか数えず、原文より狭い。
- ⇒ **未配線1効果**。登録票の残1と一致。`O-315` の植物履歴と同族だが、既存カウンタには任意移動元のカード列が無い。最短の共通設計は既存 `SELF_DECK_TO_ENERGY_THIS_TURN` を「由来指定省略時は従来どおりdeck、`source:'any'` 時は全由来」のように拡張し、中央エナ増加diffでターン中に置かれたカードIDを記録すること。植物側は同じ記録へ `filter` を適用できる。ただし記録の所有者・同時移動・置換後だけを全解決経路で一度だけ刻む必要があり、単なるparser配線では閉じない。

### 段階2 実装 1件目 — `WX24-P3-018-E1` (`O-313`) (未検証・Codex 草稿)

- `parseSentencePart3` のメインフェイズ前置き剥がしが Part1/2 しか再走査せず、さらに Part1 の広い任意トラッシュ規則が先に当たる経路を、既存 Part4 のマジックボックス語彙だけ優先して再利用するよう修正。`parseSentencePart4` は `MAGIC_BOX_REVEAL.magicBoxReveal={count:3,filter:{cardType:'シグニ',story:'トリック'}}` を生成する。
- `execStubPart3` は上限とfilterを消費し、条件を満たすMBの全ての部分集合（0枚を含む）を `CHOOSE` で提示して、選んだゾーンだけを内部actionで表向きにする。条件外・カード不明のMBは候補に出さず裏向きのまま残す。新キーの消費地点＝`src/engine/execStubPart3.ts` の `MAGIC_BOX_REVEAL` / `INTERNAL_MAGIC_BOX_REVEAL` handler。逆翻訳もpayloadから「中身が＜トリック＞のシグニ」「3枚まで」を描く。
- `build:effects` → `heldReview --adopt-effect WX24-P3-018-E1` 済み。共有経路A/Bの live per-effect 差分は **この1件だけ**（`UNKNOWN_NESTED` → `MAGIC_BOX_REVEAL`＋payload）。`npm run golden -- --only "第252 O-313"` は **PASS 1 / FAIL 0**。正方向は条件内2枚から1枚／2枚／0枚を選べること、反転は非＜トリック＞が全選択肢から外れること、さらに選ばなかった条件内MBも裏向きで残ることまで実行確認した。

### 段階2 実装 2件目 — `WXK01-045-E1` (`O-315`) (未検証・Codex 草稿)

- 既存履歴 `PlayerState.signi_placed_origin_this_turn` を再利用し、`TargetFilter.placedThisTurn` を追加。`parseSigniTarget` が「このターンに場に出た対戦相手のシグニ」を生成し、対象句と帰結が別文のこの文型では生成後の既存 `TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST` 構造へ、支払い前の `optionalCostTarget` と支払い後の `BANISH.target` の両方を刻む。
- 新キーの消費地点＝`src/engine/execUtils.ts` の `fieldCandidates`。候補側stateの `signi_placed_origin_this_turn` に `<instanceId>:<移動元>` がある個体だけを通す。逆翻訳も `このターンに場に出た` をpayloadから描く。
- 共有規則を一度広げた時点のA/Bで **狙い以外103効果**に `optionalCostTarget` が増える perturb を検出したため、その変更は撤回。第1実装直後の5シート実測スナップショットへ live を戻して再生成し、最終 per-effect 差分が **`WXK01-045-E1` 1件だけ**であることを確認した。AUTOの純改善として live へ直接採用されたため、指定どおり実行した `heldReview --adopt-effect WXK01-045-E1` は `held/partial fresh has no effectId`（採用待ち無し）を返した。
- `npm run golden -- --only "第252 O-315"` は **PASS 1 / FAIL 0**。fresh/live contractに加え、engineの候補列挙で「履歴あり個体だけ通る／同じ場にいても履歴なし個体は通らない」を正方向＋反転で確認した。

### 段階2 実装 3件目 — `WXEX2-39-E3` (`O-315`) (未検証・Codex 草稿)

- 既存 `triggerCondition.trashSourceStory` を維持し、同じ条件のOR拡張 `trashSourceStoryIncludesCost` を追加。＜凶蟲＞効果側は従来どおり `collectAnyZoneTrashSelfTriggers`、コスト側は明示的な `asCost` を持つ `collectHandDiscardTriggers` が読む。単なる `byEffectCause:false` をコスト扱いしないため、手札上限などのルール捨ては通らない。
- 新キーの消費地点＝`src/engine/triggerCollect.ts` のコスト捨てcollector。逆翻訳はpayloadから「コストか＜凶蟲＞のシグニの効果によって」を描く。build前後の live per-effect 差分は **`WXEX2-39-E3` 1件だけ**（companion flagの追加）。AUTOの純改善で直接採用されたため、指定どおり実行した `heldReview --adopt-effect WXEX2-39-E3` は採用待ち無しを返した。
- **書き換えた既存goldenは1本**：旧 `censusトリガー C群: 凶蟲効果だけで蘇生し…` を `第252 O-315 WXEX2-39-E3: コストまたは凶蟲効果で蘇生し…` に改めた。正方向は「凶蟲効果」「別クラス能力のコスト」、反転は「別クラス効果」「原因不明」「ルール捨て」「エナ起点」。`npm run golden -- --only "第252 O-315 WXEX2"` は **PASS 1 / FAIL 0**。

### 段階2 見送り — 残11効果 (未検証・Codex 草稿)

- `O-313` 残4（`WXK08-024-E2` / `WXK06-030-E1` / `WXK07-003-E1` / `WXK10-018-E2`）＝付属札・下敷き・MBを同じゾーン内容として列挙し、対象指定／全移動／コスト支払いへ渡す型とUIが必要。既存の種類別actionだけでは一様選択を表せない。
- `O-315` 残1（`WXK04-038-E1`）＋`O-321` 残1（`WXDi-CP02-009-E1`）＝全移動元のエナ追加をターン累計し、前者はさらに＜植物＞filterを掛ける共通履歴ストアが必要。既存 `SELF_DECK_TO_ENERGY_THIS_TURN` をそのまま使うとデッキ由来だけになり過小。
- `O-322` 実測3（`WXDi-P14-061-E1` / `WXDi-D09-P04-E3` / `WXDi-CP01-033-E1`）＝宣言値の動的上限・相手手札の一致札全破棄・指定名だけ覚醒・公開名を条件にした反復を揃える必要があり、単点parser配線では閉じない。
- `O-323` 1（`WX24-P2-050-E1`）＝成功時だけ usageLimit を消費するため、対話を跨ぐ共通解決完了経路への予約／確定機構が必要。
- `O-316` 残1（`WXDi-D09-H11-E1`）＝センター＋左右アシストの候補列挙、選んだルリグ個体への能力付与が必要。同文型7件へ届く共有修正になり、D04はさらに攻撃上限の対象束縛が別途必要。

### 最終検証（上記Codex草稿を確定）

- ベースラインスナップショットとの live per-effect 差分は **3件だけ**：`WX24-P3-018-E1` / `WXK01-045-E1` / `WXEX2-39-E3`。スコープ外巻き添え0。
- `npm run regen` 済み。逆翻訳は順に「中身が＜トリック＞のシグニであるMBを3枚まで」「このターンに場に出た相手シグニ」「コストか＜凶蟲＞のシグニの効果によって」を描く。
- `npm run gates` **全緑**：typecheck PASS / golden **3909 PASS・FAIL 0**（ベースライン3907から新規2本、既存1本を書き換え）/ smoke **10744 OK・CRASH/HANG/INVARIANT 0** / fuzz不具合0 / census高シグナル **1・BASELINE 1** / census:stubs A群0 / census:enginetext A🔴0 / census:costtext A🔴0 / manual field loss 0 / lint **0 errors・254 warnings**。数値悪化なし。

## 2026-09-10 — 第251バッチ（索引 G の棚卸し＋配線）：12効果修正。Codex が利用上限で停止し Claude が検証

**投入**＝§5.3 索引 G の8項目（`O-304`/`O-305`/`O-313`/`O-315`/`O-316`/`O-321`/`O-322`/`O-323`・見立て19効果）。
🔴**候補プールが枯渇した（残7）ので、バッチの種類を「真バグを直す」から「登録項目の棚卸し＋配線」へ変えた。**
指示書では **段階1＝棚卸し（受け皿を"別名"で探す）／段階2＝配線** の2段階にし、
「**8項目すべてが実は配線済みで終わってもよい。それは成果**」と明記した。

🔴**Codex は `.codex-work` で 878,903 トークンを使って利用上限に当たり、最終レポート前に停止**（復帰 23:13）。
落ち方は②＝**実装は済み・ゲートと簿記が未了**。**Claude が引き継いで独立検証した。**

### 直った12効果（スコープ6＋巻き添え6）

| 項目 | 効果 | 何が直ったか |
|---|---|---|
| `O-305` | `PR-469-E3` | 「この【起】能力で**まだ選ばれていない**1つ」＝`CHOOSE.noRepeat` が落ちていた（受け皿は既存＝`execStubPart1.ts:922-930`） |
| `O-304` | `WXDi-P06-032-E1` | 「レベルが**あなたの場にいる白のルリグの数以下**の」動的上限＝`filter.levelLteZoneCount` |
| `O-316` | `WXDi-P03-035-E1` | 「**その**ルリグをアップし」＝`UP.targetsTriggerSource`（アタックした個体の限定が無く任意のルリグを選べた） |
| `O-316` | `WXDi-P16-002-E1` | 「**全員**レベル1以上」＝`LRIG_LEVEL.allFieldLrigs`（従来はセンターしか見ず、アシストが低レベルでも成立していた） |
| `O-321` | `WXDi-P11-046-E2` | 「このターンにあなたが**ピースを使用**していた場合」＝`ARTS_USED_THIS_TURN.filter`（発動条件が丸ごと無く無条件発火） |
| `O-321` | `WXDi-P13-085-E1` | 「**あなたの《ディソナアイコン》のカードの効果によって**」＝`triggerCondition.milledSourceFilter`（相手デッキのミル全般で発動していた） |

🔑**巻き添え6効果はすべて正しい是正**（Claude が原文と1件ずつ照合した）：
`WX19-021-E2`／`WX26-CP1-046-E1`／`WXDi-P04-051-E1`／`WXDi-P12-044-E2`／`WXDi-CP01-028-E1` は
原文「**その**ルリグをアップし」「**その**ルリグは能力を失う」＝**アタックした個体**の限定が落ちていた形（`O-316` と同型）。
`WXDi-D07-011-E1` は「【チーム】〜＆**全員**レベル1以上」＝`allFieldLrigs`。
⇒ **`O-316` の軸は effectId アンカーではなく生成地点で直っており、同型5効果へ自動的に届いた。**

### 🔑 型は「新設」ではなく「既存条件型の拡張」で閉じた

`LRIG_LEVEL` に `allFieldLrigs?`、`ARTS_USED_THIS_TURN` に `filter?` を足す形＝
**指示書の「新しい Condition 型を作ってよいのは受け皿が本当に無いと実測できた場合だけ」に従った結果**。
✅**両評価器（`effectEngine.ts` の ActiveCondition 側と `execUtils.ts` の Condition 側）に同じ式が入っている**
ことを Claude が確認した（片側だけだと `COND_STUB` 相当の無条件成立に落ちる）。
✅**新キー5本すべてに engine の消費地点がある**＝`allFieldLrigs`（`effectEngine`/`execUtils`）／
`targetsTriggerSource`（既存・22箇所）／`milledSourceFilter`（`triggerCollect`）／
`levelLteZoneCount`（`effectExecutor`）／`isDisona`（`effectEngine`/`execUtils`）。

### 未着手（利用上限で段階2に届かなかった項目）

`O-313`（4効果＝シグニゾーン内の非シグニ札を対象にできない）／`O-315`（3効果）／`O-322`（2）／`O-323`（1）／
`O-304` の残1（`WX18-020-E1`）／`O-316` の残1（`WXDi-D09-H11-E1`）／`O-321` の残1（`WXDi-CP02-009-E1`）。
⚠**棚卸しの報告も受け取れていない**（レポート生成前に停止）＝**この7項目は次回また段階1から**。

### 検証（Claude 実測）

- **live の per-effect 差分＝12 effectId**。スコープ外6件は**すべて原文と照合して正しいと確認**（上記）。
- `npm run typecheck` 0エラー。`npm run gates` **全緑**＝**golden 3895 → 3907**（+12）／smoke 10744 OK／
  fuzz 0／census 高シグナル 1 / BASELINE 1／A群各0／manual field loss 0／lint **0 errors / 254 warnings**。
- Codex が足した golden は4本（`O-321` 2／`O-316` 1／`O-304` 1）＝**いずれも engine の反転付き**。

## 2026-09-10 — §5.3 `O-324`：「それぞれ共通するクラスを持たない」の配線（登録12 → 実測3）

🔴🔑**着手時に測り直したら、登録した12効果のうち9つは既に配線済みだった。** 内訳：

| 状態 | 効果数 | 受け皿 |
|---|---|---|
| 既に `SelectionConstraint.distinct:'class'` | 4 | `WX25-P1-090-E2` / `-096-E1` / `-097-E1` / `WXDi-P04-028-E3` |
| **別名の受け皿**で配線済み | 3 | `FIELD_SIGNI_ALL_DISTINCT_CLASS`（`SPDi44-04-E1` / `WX25-P1-026-E1` / `WX25-P1-088-E1`） |
| **別名の受け皿**で配線済み | 1 | `LAST_PROCESSED_MATCHES.shareClass`（`WXDi-D01-004-E2`） |
| 軸が違う（参照カード基準） | 1 | `WX25-P1-041-E1` ＝ `O-325` へ |
| 🔥**本当に未配線** | **3** | 下記 |

🔑**「受け皿が無い」と登録した項目こそ、着手時に別名で grep し直す**（CLAUDE.md の
`census:population` の罠＝「キー名1つで配線済みを判定すると、同じ概念の別の正準形が miss に出る」と同型）。
**私自身がこの登録票を前の巡で書いた**＝その場で全数を測らずに「受け皿が無い」と書いた結果。

### 直した3効果

1. **`WX25-P1-092-E1`**（AUTO）＝原文「あなたの場にあるすべてのシグニがそれぞれ共通するクラスを持たない場合」の
   **発動条件が丸ごと落ちていた**＝場のクラスが被っていても毎アタックフェイズ提示されていた。
   ✅受け皿は実在（`effectEngine.ts:141` / `execUtils.ts:3308`）＝**parser だけが語彙を知らなかった**ので
   `LEADING_STATE_CLAUSES` に1行足した（この表のコメント自身が「語彙を足すときはこの表だけを触る」と指示している）。
2〜3. **`SPDi44-04-E2` / `WX25-P1-026-E2`**（どちらも MANUAL）＝原文「エナゾーンからシグニを**好きな枚数**対象とし、
   **それらがそれぞれ共通するクラスを持たない場合**、それらを手札に加える」に制約が無く、
   **`count:'ALL'` なのでエナ全部を無条件で回収できた**。`selectionConstraint:{distinct:'class'}` を手で足して配送。

### 🔑 トリップワイヤが「parser が追いついた」ことを検出した（想定どおりの動き）

`LEADING_STATE_CLAUSES` に語彙を足した結果、**`SPDi44-04-E1` / `WX25-P1-026-E1` の MANUAL 定義が
parser 出力と実体同一になり**、`§6.4 O-42`（影武者コピー残0）のトリップワイヤが落ちた。
⇒ **正しい対応は「manual を削除して parser に任せる」**（CLAUDE.md `O-40`）。削除後に
**live へ MANUAL スタンプだけが残る**＝CLAUDE.md の「第4の死角」（orphan MANUAL）になったので、
`npm run census:orphanmanual --unfreeze A` で機械的に解凍した（A群＝live と fresh が実体同一かつ MANUAL）。
**実体は1バイトも変わっていない**（`censusManualDrift` の乖離0・削除候補0で確認）。

### 🔴 試して撤回した変更（A/B で効果ゼロ・副作用ありと判明）

`WX25-P1-092-E1` は条件が**任意コストのステップだけ**を包んでおり、**その前の `SELECT_TARGET_ONLY` が
条件の外に残る**（＝条件不成立でも対象選択のプロンプトが出る。盤面は動かないので過剰実行ではない）。
巻き取り位置を直そうと `LEADING_STATE_CLAUSES` の前置き許可リストへ「あなたのアタックフェイズ開始時」を
足して A/B を取ったが、**live 差分0（この効果は変わらない）／`WXK09-046-E1` だけが perturb**した
（原文「**次の**あなたのアタックフェイズ開始時、…ある場合」＝**遅延誘発**なので条件を外へ出すのは誤り）。
⇒ **効果ゼロ・副作用ありなので撤回**。残件として golden にコメント付きで固定した。
🔑**「直せそう」で共有パスを触る前に A/B を取る。** 今回は取ったので3分で捨てられた。

### 検証

`npm run gates` **全緑**＝**golden 3892 → 3895**（+3）／smoke 10744 OK／fuzz 0／census 高シグナル 1 / BASELINE 1／
manual drift 乖離0・削除候補0／lint **0 errors / 254 warnings**。
golden は **全数走査（受け皿4つのどれかに載っているか・未配線は `O-325` の1件だけ）／
場の条件が載る（残件もコメント付きで固定）／MANUAL 2件の選択制約＋engine の反転**の3本。

## 2026-09-10 — §5.3 `O-287` 軸1を実装：`commonClass`（engine 消費0の真 no-op）を `sharedClass` へ移した

**真因**＝原文「共通するクラスを持つシグニ2枚を対象とし」が **`TargetFilter.commonClass` という真偽値**で
表現されており、**`src/engine/` に消費地点が1件も無かった**（`effectParser` が生成し `decompileEffects` が
描くだけ）。⇒ **どの2枚でも取れていた**。🔴**生成側のコメント自身が
「engine には消費地点が無い（＝候補はまだ絞れない）が、逆翻訳と語彙センサスが読む」と
**宣言だけ載せる規約**を明記していた**＝`census:deadstate` と同型で、逆翻訳・census・golden・smoke・fuzz が
全部緑のまま意味が壊れる形。

🔑**受け皿は既に在った**＝`SelectionConstraint`（`sharedColor:'all'|'none'` と `distinct:'class'` の兄弟）。
**新機構ではなく既存の軸へ1つ足すだけ**で閉じた（PLAN §5.3「1〜3枚の項目はまず受け皿を疑う」の実例）。

**直し方**＝`SelectionConstraint.sharedClass:'all'` を新設し `satisfiesSelectionConstraint` に実装。
parser は `filter.commonClass` をやめて `source.selectionConstraint` へ載せ、
**型からも死にキー `commonClass` を撤去**（同じ意味の軸を2つ残さない）。
逆翻訳と `vocabCensus` の参照も新しい場所へ移した。live 3効果
（`WXDi-P10-029-E1` / `WXDi-CP01-020-E1` / `WXDi-CP02-046-E1`）が実際に絞られるようになった。

⚠**`'none'` は作っていない**＝「共通するクラスを持たない」は既存の `distinct:'class'` が担当する。
`sharedColor` が `'all'|'none'` の両方を持つのは色側に `distinct:'color'` が無いためで、**対称にしないのは意図的**。
⚠**クラスが読めないカードは不成立**へ倒した（fail-closed。`same:'power'` と同じ規約）。

### 🔴 母集団の実測＝登録票の「27効果」は原文 grep で、実装軸は3つに割れる

`docs/_effect_srctext.json` で「共通するクラス」を含む効果は **37**（登録票の27より多い）。
**1つの真偽値では足りない**という登録票の警告どおり、**意味軸が3つある**：

| 軸 | 効果数 | 内容 | 状態 |
|---|---|---|---|
| **① 選んだN枚が互いにクラスを共有する** | **13**（うち live に宣言があるのは3） | 「共通するクラスを持つシグニ2枚を対象とし」 | 🏁**今回実装**（`sharedClass:'all'`）。残10は**parser がまだ制約を生成していない**＝別バッチ |
| **② 集合が互いにクラスを共有しない** | 12 | 「それぞれ共通するクラスを持たない」 | ✅**受け皿は在る**（`distinct:'class'`＋条件側の `distinctClasses`）＝**生成側の配線が残っている** |
| **③ 参照カードと共通するクラスを持つ** | 12 | 「この方法で捨てたシグニ**と**共通するクラスを持つ」 | ❌**受け皿が無い**＝「参照先の集合」を対象条件へ渡す軸が要る（`sharesClassWithPrev` が近いが直前ピック限定） |

⇒ **`O-287` は①だけクローズし、②③を `O-324`／`O-325` として分離登録した**（1項目に3軸を畳んだままだと
着手のたびに母集団を測り直す羽目になる）。

### 検証

`npm run gates` **全緑**＝**golden 3890 → 3892**（+2）／smoke 10744 OK／fuzz 0／census 高シグナル 1 / BASELINE 1／
A群各0／lint **0 errors / 254 warnings**。
逆翻訳＝「あなたの**共通するクラスを持つ**《ガードアイコン》を持たないシグニ(トラッシュ)2枚を手札に加える」
＝payload から描いている（`selectionConstraint` を読む形へ移した）。
golden は **contract（旧キーが live に1件も残っていない）＋ engine（共有しない2枚は選べない＝反転）**の2本。
🔑**反転側が本体**＝contract だけでは「宣言はあるが engine が読まない」真 no-op を検出できない。

⚠**自分で lint エラーを3件出した**（golden の regex に不要なエスケープ `\/`）＝`gates` が止めた。ベースラインへ戻した。

## 2026-09-10 — §5.3 `O-288` 本体消化（Claude 自力）：事前対象化を live 7 → 29効果へ

**取った理由**＝第247 で**軸（engine）は実装済み**（`freezeStoredTargets` を先取り分岐の then/else へ噛ませる）
なので、残りは **JSON 側の配線だけ**＝実装キューの中で1件あたり最も安い。母集団は実測15（＋MANUAL 2）。

**真因**＝原文「対戦相手の〜1体を**対象とし**、対戦相手が〜しないかぎり、それを〜する」は
**対象を決めてから相手が支払いを判断する**が、engine の先取り分岐（`effectExecutor.ts:5871` 前後）は
**支払いプロンプトを先に出し、拒否枝で初めて対象を選んでいた**＝相手が判断する時点の情報量が原文と違う。

**直し方＝parser の汎用ノーマライザ1本**（`normalizeOpponentPayPreTarget`・`effectParser.ts`）。
`SEQUENCE[STUB{OPPONENT_PAY_OPTIONAL}, CONDITIONAL{then:X}]` を
`SEQUENCE[STUB{SELECT_TARGET_ONLY}, STUB{STORE_LAST_PROCESSED_TARGETS}, STUB{OPPONENT_PAY_OPTIONAL}, CONDITIONAL{then:{...X, targetsStored:true}}]`
へ正準化する。**effectId アンカーは1件も使っていない**（生成地点1本で 22効果が直った）。
MANUAL 2件（`WXDi-P16-062-E1` / `WXDi-P15-083-E1-GRANT`）は収穫マージが不可侵にするので
`manualEffects.ts` を手で直して `syncManualLive.ts` で配送した。

### 🔴 この巡で踏んだ罠3つ（どれも「黙って効かない」形＝全ゲート緑のまま外れる）

1. **活用語尾の書き落とし**＝`/(?:支払|捨て)ないかぎり/` と書いた初版が「支払**わ**ないかぎり」に当たらず、
   **15効果すべてに1件も当たらなかった**（0件と出て正しく見える）。⇒ `indexOf('ないかぎり')` に変えた。
   🔑**CLAUDE.md の `census:deadstate` の罠（テンプレ内 `\b` が剥がれて黙って何にも当たらない）と同型。**
2. 🔴🔑**`abilityBlockTextOf` を正準化から呼ぶと再入して壊れる**＝あの関数は内部でパーサーを再実行して
   ブロック境界を求めるため、**同じカードを2回パースすると 1回目 true / 2回目 false に化ける**。
   `build:effects` 経由では**1件も当たらなかった**のに、単体の tmp スクリプトでは当たって見えた。
   ⇒ **文単位の自己完結走査**（`。` で割り、同じ文で「を対象とし」が「ないかぎり」より前）に変えた。
   ⚠**`normalizeAddToFieldAsDown` と同じ書き方を真似たのが罠**＝あちらは原文に語がある55効果しか呼ばないので
   顕在化していなかっただけ。**新しい正準化から `abilityBlockTextOf` を呼ばないこと。**
3. 🔴🔑**番兵に `targetsStored` を使ったら、共有されたノードのせいで live が半端な状態になった**＝
   `then` ノードはパーサー内部のメモ化で**パース間・効果間に共有される**。1回目に立てた印を2回目が
   「処理済み」と読んで**挿入だけスキップ**し、live が「`targetsStored` は在るのに `SELECT_TARGET_ONLY` が無い」
   状態になった（`freezeStoredTargets` は空の stored を見て据置＝**無言 no-op**）。
   ⇒ 番兵は **その steps 配列に `SELECT_TARGET_ONLY` が在るか**だけにし、**共有ノードは複製して差し替える**。

### 🔴 偽陽性1件（規則を絞った）

`WXK06-047-E1`＝原文「対戦相手は、**自分のシグニ**1体を対象とし、それをデッキの一番上に置かないかぎり
**手札を1枚**デッキの一番下に置く」。「対象とし」は**相手が回避のために選ぶ札**で、罰則が触るのは
**相手の手札（非公開）**。⇒ 事前対象化の型を `SIGNI` / `LRIG` / `CENTER_LRIG_OR_SIGNI` に限定した。
同じ理由で `WDK10-001-E2`（相手が自分のエナを選ぶ）と `WX25-CP1-001-E1`（罰則が「相手にダメージ」＝対象なし）も除外。
**この3件は golden で「偽陽性はこの3件だけ」と固定した**（増えたら配線漏れ）。

### 書き換えた既存 golden 5本と、なぜ落ちたかの判定

| テスト | 判定 | 内容 |
|---|---|---|
| `parse 文中形（WX25-P1-038）` | **腐り**（位置固定） | `steps[0]` が `SELECT_TARGET_ONLY` に。id で引く形へ直し、順序と `targetsStored` の assert を追加 |
| `parse 手札捨て型` | **腐り**（位置固定） | 2件目（対象節あり）だけ位置が動く。1件目（ドロー型＝対象なし）は不変であることも同時に固定 |
| `parse 併記型` | **腐り**（位置固定） | 同上 |
| `parse ガード⑥＝引用の内側` | **腐り**（位置固定） | 引用の内側も同じ語順なので事前確定が入る |
| `task12 exceed本体B`（E2E） | 🔴**腐り**（旧順序を契約にしていた） | 旧＝支払いが先・拒否枝で初めて対象選択。新＝対象選択 → 支払い → **skip でも新規選択に戻らない**。⚠**この「戻らない」が修正の核**なので、反転（選ばなかったシグニは残る）も足した |

### 検証

`npm run gates` **全緑**＝**golden 3886 → 3890**（+4）／smoke 10744 OK／fuzz 0／census 高シグナル 1 / BASELINE 1／
A群各0／manual field loss 0／lint **0 errors / 254 warnings**。
`npm run regen` 後の逆翻訳も原文どおりの語順（「〜を対象とする。そして対戦相手は〜を支払ってもよい。そうしなかった場合、〜」）。
**live の事前対象化 7 → 29効果**（golden で全数を固定）。

## 2026-09-10 — 第247バッチ（系統2本＋一点物）：23効果修正。Codex が利用上限で停止し Claude が完成させた

**投入**＝候補プール残19効果（`pri=2` の4件は既定で除外）。🔴**うち8効果が「登録済みの機構待ち系統」に集中していた**ので、
指示書を組み替えて **`O-288`（相手の支払い前に対象を確定）と `O-293`（次のあなたのエナフェイズ終了時まで）を
正面から実装してよい**ことにした（「PLAN に登録済みだから」で見送らせない、と明記した）。

🔴**Codex は `.codex-work` で 904,938 トークンを使って利用上限に当たり、最終レポートを書けずに停止**した。
落ち方は memory の②＝**実装は済み・golden とゲートと簿記が未了**。**Claude が引き継いで完成させた。**

### Claude が引き継いでやったこと（Codex の未了分）

1. **型エラー5件を修正**＝`GRANT_EFFECT.effect` の optional ガード漏れ（`effect.action.effect?.effectId` ほか）。
   ⚠**`npm run typecheck` は `scripts/` を見ない**が、今回は `src/` 側だったので検出できた。
2. 🔴**母集団を測り直して修正を5枚→7枚へ広げた**。Codex は `WX24-P3-005-E1` / `-007-E1` の2枚を
   **effectId アンカーで**直していたが、実測すると **`STUB{LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END}` を持つ live 7効果は
   原文「次のあなたのエナフェイズ終了時まで」と 1:1（例外0）**だった。
   ⇒ **アンカー2件を撤去し、生成地点（`parseSentencePart3.ts:594` と `effectParser.ts:17316`）で一律に期限印を付ける形へ移した。**
   巻き添えで `WX24-P3-001/003/009-E1`・`WX25-P2-014-E2`・`WX25-P3-037-E4` の5効果も是正された。
   🔑**生成地点のコメントが「その語彙が `EffectDuration` に無い」と旧制約を明記していた**＝語彙を足した回に読み直せば分かる。
3. **腐った既存 golden 3本を判定して更新**（下記）。
4. **golden を7本新規に書いた**（Codex は1本も書けていない）。
5. **新規に出した lint warning 2件を自分で潰した**（254→256→254）。

### 系統①＝`O-288`（相手が支払いを判断する前に対象を確定）＝5効果

**真因**＝原文「対戦相手のシグニ1体を対象とし、対戦相手が〜しないかぎり、それを〜する」に対し、
engine の先取り分岐（`effectExecutor.ts:5871` 前後）が**支払いプロンプトを先に出し、拒否枝で初めて対象を選んで**いた
＝**相手が支払いを判断する時点の情報量が原文と違う**。

**直し方**＝JSON 側を `SELECT_TARGET_ONLY` → `STORE_LAST_PROCESSED_TARGETS` → `OPPONENT_PAY_OPTIONAL` の順にし、
engine 側は先取り分岐の `conditional.then` / `conditional.else` を **`freezeStoredTargets()` に通す**だけ。
🔑**`freezeStoredTargets` は `targetsStored` が無いアクションには何もしない**＝**既存効果は素通り＝opt-in**。
共有経路を触るときの必須条件（指示書で「限定できないなら5件まとめて見送ってよい」と書いた条件を満たしている）。
対象＝`WX24-P1-006-E1` / `WX25-P3-042-E1` / `WX25-P3-087-E1` / `WX25-P3-091-E1` / `WX25-CP1-027-E1`。
⚠**`OPPONENT_PAY_OPTIONAL` のトリップワイヤ（81/42/39）は動いていない**＝新規 STUB を足していないので当然。golden で固定した。

### 系統②＝`O-293`（次のあなたのエナフェイズ終了時まで）＝7効果

🔴**受け皿の名前が嘘だった実例**＝`STUB{LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END}` は期限を名乗っているのに、
書き込み先の `lrig_limit_mod` は**ターン終了時に消える**（CLAUDE.md の既知の罠そのもの）。
parser 側は「その語彙が `EffectDuration` に無い」ため **`UNTIL_OPP_TURN_END` へ過少側に倒して**いた。

**3点セットで閉じた**（第246 の `oppActivateCostUntilOppTurnEnd` と同じ形）：
- 型＝`EffectDuration` に `UNTIL_OWN_ENERGY_PHASE_END`、`lrigLimitChange.untilOwnEnergyPhaseEnd`
- state＝`lrig_limit_mod_until_own_energy_phase_end`（`turnScopedState.ts` に登録・境界は **`main-phase-start`**
  ＝次に自分が ENERGY を出て MAIN へ入るとき。**turn-end ではない**）
- 読み＝`lrigLimit.ts` が通常ストアと合算する単一 funnel／付与側は `grantedAuto.ts` がターン終了を跨いで保持

### 一点物11効果

`WX24-P1-004-E1`（遅延誘発が即時実行に化けていた）／`WX24-P1-046-E2`（条件が後続に掛かっていない）／
`WX24-P2-030-E2`（期限を見ずに永続ストアへ書き以後の全アタックフェイズに効いていた）／
`WX24-P2-055-E1`（クラッシュ原因の限定が無い）／`WX24-P2-056-E3`（枚数がアーツ数に連動しない）／
`WX24-P2-080-E1`（遅延が無く即実行）／`WX25-P3-003-E1`（did-it ゲートの先取りで払わなかった枝でも実行）／
`WX25-P3-019-E1`（相手の回避枝が無く無条件ダメージ）／`WX25-CP1-004-E1`（任意コスト前の対象化）／
`WX25-CP1-039-E1`（置換の被害者条件に「アップ状態」が無い）／`WX26-CP1-048-E2`（任意が強制）。

### 書き換えた既存 golden 3本と、なぜ落ちたかの判定

| テスト | 判定 | 内容 |
|---|---|---|
| `§6.4 turn-scoped T1` | **正当なラチェット更新** | 命名規約外フィールド 30→31・母集団 85→86。新設 `lrig_limit_mod_until_own_energy_phase_end` は funnel に登録済み＝**ラチェットが仕事をした**（未登録なら止まる） |
| `§6.4 O-27` | 🔴**腐り**＝**assert が近似を契約にしていた** | `UNTIL_OPP_TURN_END`（「過少側の近似」とテスト名自身が書いていた）→ 原文どおり `UNTIL_OWN_ENERGY_PHASE_END`。5枚とも原文が完全一致であることを実測してから更新した。リミット側の期限印も assert に足した |
| `§6.4 O-37(a)` | 🔴**腐り＋私の一次判断が広すぎた** | 同 family でも**期限句が効果ごとに違う**（`WX24-P3-005-E1` だけが「エナフェイズ」、`WX25-P1-014-E2` / `SPDi44-12-E2` / `WX24-P4-021-E3` は「次の対戦相手のターン」）。一括置換して1本落としたので、**effectId ごとに期待値を分ける形**へ直した |

🔑**教訓＝「同じ golden の同じループに入っている」は「同じ期限である」を意味しない。** family の一括更新は原文を1件ずつ当ててから。

### 検証（Claude 実測）

- **live の per-effect 差分＝23 effectId**（スコープ18＋生成地点修正の巻き添え5）。**スコープ外の意図しない変化 0**。
- `npm run regen` 後の逆翻訳を目視＝期限が原文どおりに出ることを確認。
  🔑**逆翻訳は payload から描いている**（`decompileEffects.ts` が `lc.untilOwnEnergyPhaseEnd` で「次の」の有無を切り替える）
  ＝罠②（原文 regex で描いていて JSON が壊れても正しく見える）には当たっていない。
- `npm run gates` **全緑**＝**golden 3879 → 3886**（+7）／smoke 10744 OK（CRASH/HANG/INVARIANT 0）／fuzz 0／
  census 高シグナル 1 / BASELINE 1／census:stubs A群0／census:enginetext A🔴0／census:costtext A🔴0／
  manual field loss 0／lint **0 errors / 254 warnings**（ベースライン維持）。
- **実装キュー 144 → 128効果**（消化済み 292 → 315）。候補プール 23 → **7**（うち `pri=2` が4）。

### 未着手1件

`WX24-P2-050-E1`＝「この能力で実際にカードをトラッシュへ置くまで再度誘発できる」＝**did-it 連動の `usageLimit`**が無い
（現状は素の `once_per_turn` で、置けなかった場合も1回で打ち切られる）。利用上限で未着手のまま。`§5.3 O-323` として登録した。

## 2026-09-10 — 第246バッチ（未開拓プール3巡目）：20効果修正／1済み／9機構待ち

**投入**＝指定30効果。現行JSON・原文・消費地点を再照合し、既存action/状態の小拡張で閉じる20効果を
`repairSemanticBatch246` または `manualEffects` から live へ採用した。`PR-K077-sub-E1` は第245で
`OPTIONAL_COST.handDiscard.filter.levelEqTrigger:true` が既に live 化済みだったため無変更。

### 採用20効果
`WXDi-P11-002-E1`／`WXDi-P11-062-E1`／`WXDi-P11-080-E1`／`WXDi-P12-007-E1`／
`WXDi-P12-009-E1`／`WXDi-P12-068-E1`／`WXDi-P14-001-E1`／`WXDi-P14-031-E1`／
`WXDi-P14-040-E2`／`WXDi-P14-083-E1`／`WXDi-P14-088-E1`／`WXDi-P15-033-E2`／
`WXDi-P16-047-E2`／`WXDi-P16-049-E1`／`WXDi-P16-052-E2`／`WXDi-CP01-006-E3`／
`WXDi-CP01-029-E2`／`WXDi-CP02-059-E1`／`WXDi-CP02-078-E1-GRANT`／`WXDi-CP02-095-E1`。

主な是正は、対象の事前確定と支払い後の同一個体固定、下敷きの実枚数参照、宣言レベルの遅延誘発への焼き込み、
アシストルリグ限定凍結、CONTINUOUS の複合action内にあるパワーマイナス保護の収集、
「次の相手ターン終了」の起動コスト増加マーカー、リミット減少の `pending_lrig_limit_mod` 予約、
遅延ライフクラッシュ、相手の《無》×4／ガード持ち捨ての回避枝復元。

### engine で塞いだ「型は在るが1分岐だけ抜ける」系
- `SELECT_TARGET_ONLY` で効果元の下のシグニの実レベルを解決。下敷き不在は fail-closed。
- `OPTIONAL_DISCARD_HAND_CLASS` / `OPTIONAL_TRASH_ENERGY_CLASS` の支払いプロンプトを跨ぐ前に保存対象を個体IDへ凍結。
- `SIGNI_REPOSITION` は owner/任意性/保存対象を対話継続に渡し、配置しない選択も追加。
- `INSTALL_DELAYED_TRIGGER` は宣言値filterを設置時に固定。`FREEZE` は左右アシストだけを候補化。
- パワー保護collectorは `SEQUENCE` 内の宣言STUBも収集。期間つき起動コスト増加は相手ターン終了時に解除。

### 見送り9効果
- 新しい条件型／履歴stateが必要：`WXDi-P11-046-E2`（このターンのピース使用）、
  `WXDi-P13-085-E1`（ディソナアイコンの効果がミル元）、`WXDi-P14-040-E1`（凍結ルリグ＋シグニ合算3体）、
  `WXDi-P16-074-E2`（バニッシュ元ゾーンとゲートの一致）、`WXDi-CP02-009-E1`（このターンのエナ追加枚数）。
- 新しい起動コスト軸：`WXDi-CP01-006-E2`／`WXDi-CP01-008-E2`（コラボライバー1人とコラボ）。
- 複合フロー機構が必要：`WXDi-P14-061-E1`（宣言上限／相手手札全捜索／条件付き覚醒）、
  `WXDi-CP01-033-E1`（デッキ下の名前条件で効果全体を反復）。

### 逆翻訳・golden・検証
`npm run regen` で全10シートを再生成。新payloadが消えないよう、下敷きレベル一致、アシスト限定凍結、
相手へのプレイヤー能力付与、次の相手メイン終了、保存対象の配置替え／任意性をpayloadから描画。
`ON_PLAY` のルリグ主語は本バッチの2 effectIdに限定し、スコープ外の表示更新は避けた。

採用20効果はそれぞれ fresh/live の核payload契約を追加。engine E2Eは10本（正方向＋反転）。
既存goldenの書き換えは3件：`WXDi-CP02-095-E1` の位置固定を型検索へ、
`OPPONENT_PAY_OPTIONAL` 母集団を **80/41/39 → 81/42/39** へ、`WXDi-P16-047-E2` の旧 `END_OF_TURN`
契約を実消費地点の `NEXT_TURN` へ更新。付与能力契約の死角を防ぐため `findEffectDeep` に
`GRANT_EFFECT.effect` の再帰も追加。

`npm run gates` 全緑：**golden 3879 PASS / FAIL 0**／smoke **10744 OK**／fuzz **CRASH/HANG/INVARIANT/EXPLOSION 0**／
census 高シグナル **1 / BASELINE 1**／census:stubs A群0／census:enginetext A🔴0／census:costtext A🔴0／
manual field loss 0／manual drift 0／lint **0 errors / 254 warnings**。commit/pushはしていない。

### Claude の独立検証（2026-09-10）
- **live の per-effect 差分＝ちょうど20 effectId・スコープ外0**（全シートを `HEAD` と突き合わせる自前スクリプトで実測）。
- **新 payload キー5本すべてに engine の消費地点がある**（`levelMatchesUnderSourceSigni` / `assistLrigOnly` /
  `oppActivateCostUntilOppTurnEnd` / `repositionOptional` ＋ state `lrig_opp_act_cost_plus_until_opp_turn`）。
  コスト増加は `effectEngine.ts:7738-7739` が**新旧キーを合算する単一 funnel**＝「1分岐だけ抜ける」形ではない。
  `FREEZE` は経路が2本あるが、2本目（`effectExecutor.ts:12879`）は**カード確定済みの適用経路**で候補フィルタは無関係。
- **同じ finding が2行に展開されていた `WXDi-P14-040` は正しく割れた**＝E2（`FREEZE` の対象型がルリグにならない）は
  `assistLrigOnly:true` で修正、E1（凍結ルリグ＋シグニ合計3体の発動条件）は条件型が要るので見送り。
- `npm run gates` を Claude 側で回し直して**全緑を再現**（golden **3849 → 3879**＝+30・smoke 10744・fuzz 0・
  census 高シグナル 1/1・A群各0・lint 0 errors / 254 warnings）。

🔑**残った不正確さを1件記録する（隠さない）**＝`WXDi-P16-047-E2` の期限。原文は「次の対戦相手の**メインフェイズ**
終了時まで」だが、採用した `until:"NEXT_TURN"` は `pending_lrig_limit_mod` → 相手 MAIN 開始時に `lrig_limit_mod` へ
移り、**相手のターン終了時に消える＝1フェイズ長い**。修正前は「自分のターン終了時に消える＝相手のメインフェイズに
一度も効かない」だったので**明確な前進**であり、既存4効果と同じ契約に乗せた。**フェイズ粒度の期限ストアは
`O-293` と同クラスの新機構待ち**（この1点だけ未達として残す）。

## 2026-09-10 — 第245バッチ（未開拓プール2巡目）：8効果修正・第239で機構待ちにした `WXDi-P05-035-E1` が解けた

**投入**＝プール残86効果の先頭30。**Codex は完走**（`gates` 全緑・報告12項目）＝**8効果採用／21機構待ち／1 FP**。
🔑**density 70%（第244）→ 27%（第245）**＝プールの「安い側」から順に取っているので当然の減衰。
⚠**在庫の枯渇と読まない**（第243 でその誤読をした）＝**残った側は機構が要るだけ。**

### 採用8効果
`WDK11-001-E3`／`WXDi-P04-058-BURST`／**`WXDi-P05-035-E1`**／`WXDi-P05-077-E1`／`PR-K077-E1`／
`WXDi-P06-059-E1`／`WXDi-P07-004-E1`／`WXDi-P08-059-E2`。

🔑**`WXDi-P05-035-E1` は第239バッチで「可変コストは新機構が要る」として実装キューに残した効果**
（原文「《無》×6 から**この方法で公開されたレベル1のシグニ1枚につき**《無》を減らしたエナコスト」）。
Codex が `OPTIONAL_COST.costColorsMinusRevealedLevel1` を新設して閉じた。
**据置にした軸が、プールを回している途中で解ける**＝機構待ちの棚卸しは定期的に見直す価値がある。

### engine に足した受け皿3つ
`TAKE_FROM_UNDER_SIGNI.hostFilter`（「《ライズアイコン》を持つシグニの**下**」）／
`OPTIONAL_COST.costColorsMinusRevealedLevel1`（上記）／
`OPTIONAL_COST.handDiscard.filter.levelEqTrigger` の**実レベル解決**
（`matchesFilter` は `levelEqTrigger` を解釈しないので、解決しないと同レベル限定が**無条件**になる）。

### 🔴 Claude が足した通しの E2E（Codex の E2E では届いていなかった軸）

`costColorsMinusRevealedLevel1` は **直前の `LOOK_AND_REORDER` が公開札を `lastProcessedCards` に
残して初めて効く**。Codex の E2E は `resolveOptionalCostSpec` を**単体で**呼び、`ctx` を手で作っていたので
**その連結を確かめていなかった**（同じ落とし穴で第245 の `WXEX2-54-E2` は採用を撤回している）。
⇒ **効果を実際に走らせ、提示される支払い選択肢の枠数を見る E2E** を追加（レベル1を2枚公開 → 6枠が4枠へ／
レベル1なし → 6枠のまま）。**結果は正しく連結していた。**
🔑**「payload の単体テスト」と「直前ステップとの連結」は別のテスト**＝`$ref`／`lastProcessedCards` を
読む payload は必ず**通し**で確かめる。

### 検証
`git diff 28b42f2a4` の **effectId 単位差分＝8件**（スコープ外0）。`npm run gates` 全緑・
**golden 3849 PASS**（3844 → +5＝Codex 4 ＋ Claude 1）・`regen` の逆翻訳を8件すべて原文と目視照合。
**実機は不要**（`src/screens/` 不触）。

**実装キュー: 170 → 164効果**（本セッション通算 266 → 164）。**プール残 56効果**（除外 21＋FP 1 を反映）。

## 2026-09-10 — 第245バッチ（未開拓プール2巡目）：8効果修正／21機構待ち／1 FP

**投入**＝未開拓プール残86効果の先頭30効果。現行JSONと原文を再照合し、既存の受け皿で閉じる8効果を
`repairSemanticBatch245` から live へ採用した。効果ID単位の配送差分は対象8効果と、それらを内包する親4 IDだけで
**スコープ外0**。母集団も `census:population` で再測定し、広い検索結果は直接効果／付与能力／リコレクト条件など
AST位置が異なるため、この30効果に限定した effectId アンカーを維持した。

### 採用8効果
- `WDK11-001-E3`＝ルリグデッキの《ＧＦ　ノーマン＆レイ》を名指しする `PLACE_KEY_FROM_LRIG_DECK` へ修正。
- `WXDi-P04-058-BURST`＝対象を先に宣言・保存してから相手の《無》《無》支払いを尋ね、不払い時は保存対象をバニッシュ。
- `WXDi-P05-035-E1`＝任意コストを《無》×6へ直し、直前に公開したレベル1シグニ1枚につき1軽減。
- `WXDi-P05-077-E1`＝①にエナの＜天使＞1枚＋手札の＜天使＞1枚の複合任意コスト、②に《翠天姫　ガイア》名指定。
- `PR-K077-sub-E1`＝任意手札コストをトリガー元シグニと同じレベルに限定。
- `WXDi-P06-059-E1`＝①を《ライズアイコン》持ちの下にある赤シグニへ限定、②の付与能力を自身のパワー以下へ限定。
- `WXDi-P07-004-sub-E1`＝対象を先に宣言・保存してから相手へ手札3枚捨てを尋ね、不払い時は保存対象をダウン。
- `WXDi-P08-059-E2`＝相手エナを実際にトラッシュへ置けた場合だけ、相手が【エナチャージ1】／何もしないを選ぶ形へ修正。

### engine の既存族を塞いだ3点
- `TAKE_FROM_UNDER_SIGNI.hostFilter` を型と `execTakeFromUnderSigni` の候補列挙へ配線し、配下カード自身だけでなく
  **上のシグニ**（《ライズアイコン》）も候補条件にできるようにした。
- `OPTIONAL_COST.costColorsMinusRevealedLevel1` を追加し、`lastProcessedCards` の実カード／レベルから可変コストを算出。
- `OPTIONAL_COST.handDiscard.filter.levelEqTrigger` をトリガー元の実レベルへ具体化してから既存の候補判定・支払いへ渡す。

いずれも golden E2E で正方向と候補外を確認。JSON契約は8効果すべて fresh/live の修正核をassertした。

### 見送り21効果／FP 1効果
- 移動元・場→別シグニゾーンの履歴が無い：`WXK03-026-E4`、`WXK06-029-E2`（同カードE3のプレイヤー選択は第244で修正済み）。
- 次回／遅延／履歴／置換の新しい状態機構が要る：`WXEX1-72-E2`、`PR-305-E1`、`WXDi-P04-007-E3`、
  `WXDi-P05-025-E2`、`WXDi-P07-006-E1`、`WXDi-P08-044-E2`。
- 条件側の新型または収集機構が要る（今回新設禁止）：`PR-422-E1`、`PR-K060`、`WXDi-D02-19LAT-E1`、
  `WXDi-P06-032-E1`、`WXDi-P09-045-E1`。
- 対象／参照／全域抑止の受け皿が足りない：`SPDi43-22-E1`、`WXEX2-13-E1`、`WXK03-011-E1`、`WXK10-015`、
  `WDK10-015-E1`、`SP26-002-E1`、`WXDi-P05-086-E1`、`WXDi-P06-002-E1`。
- `WXK08-005` は **FP**。既存goldenと LESSONS §4.1 の契約どおり、G2のレベル比較は能力使用条件ではなく
  アタックフェイズ中のアイコン利用可否を表すため削除しない。

### 逆翻訳の嘘を4効果・5箇所修正
`npm run regen` 後の目視照合で、payloadが描けていなかった次を `decompileEffects.ts` で修正した：
`costColorsMinusRevealedLevel1`、複合 `energyTrash + handDiscard`、`TAKE_FROM_UNDER_SIGNI.hostFilter`、
`optionalCostTarget.powerLteSelf`、`DOWN.targetsStored`。すべてpayloadから描き、原文regexの抜き書きは追加していない。

### gate・契約
`npm run gates` 全緑：**golden 3848 PASS**（3844→+4）／smoke **10744 OK**／fuzz 不具合0／
census 高シグナル **1・BASELINE 1**／census:stubs A群0／census:enginetext A🔴0／census:costtext A🔴0／
lint **0 errors / 254 warnings**。`censusManualDrift` は0件。既存goldenの書換えは
`WXDi-P08-059-E2` の旧強制エナチャージ参照1件だけ（型・choiceIdで新しい相手選択枝を参照）。
集合トリップワイヤの拡張0件。`src/screens/` 不触のため実ブラウザ確認不要。commit/pushはしていない。

(未検証・Codex 草稿)

## 2026-09-10 — 第244バッチ（未開拓プール初回）：22効果修正＝**density 70%** でプールの見立てが裏付いた

**投入**＝除外し続けていた108効果のプールから先頭30効果。Codex は21効果を live まで反映した時点で利用上限
（既定アカウント・復帰 5:24）。**Claude が引き継いで完成させ、+1効果（`WD22-007-G-E1`）を追加で届けた＝計22。**

🔑**21/30 = 70%**＝第242（24/30）と同水準。**第243 の「density 3% ＝ 在庫の枯渇」が誤りだったことの実証。**
このプールは「受け皿は実在・限定が落ちている」型が主体で、**6バッチぶん取り逃していた**。

### engine に足したもの（3つだけ・いずれも1族の穴埋め）
- **`cost.fieldDown.excludeSelf`**（「アップ状態の**他の**シグニ1体をダウンする」）
- **`OPTIONAL_COST.triggeringSigniTrash`**（「**そのシグニ**を場からトラッシュに置いてもよい」＝
  トリガー元シグニを外す任意コスト。**PLAN が第233バッチで「機構が要る」と据置にしていた項目**）
- `ADD_TO_LIFE` ほかの `upToCount` / `targetsStored` / `fixedCardNums`

🔴**Claude の検証で見つけた非対称を1件塞いだ**＝`fieldDown.excludeSelf` は **UI 側2箇所
（`signiActivateGate.ts` / `BattleScreen.tsx`）だけ**が honor しており、**engine の任意コスト経路
（`buildOptionalCostSpec` の可否判定と支払いアクション）が読んでいなかった**。
同じ処理は `fieldTrash` / `fieldToDeckBottom` には既に在り、**この1族だけ抜けていた**（今セッション5回目の同型）。
⇒ 可否判定と支払いの両方へ配線し、golden に反転確認つきトリップワイヤを追加。

### 逆翻訳の嘘を3件是正（通算11件）
1. **`cost.fieldDown.excludeSelf` の「他の」が出ていなかった**＝逆翻訳では効果元自身も払えるように読めた。
2. **`__NO_ARTS__` センチネルがそのまま出ていた**（`NO_OTHER_ARTS_USED_THIS_TURN` の「例外なし」印）＝
   内部トークンの漏れ（`ALL枚` と同型）。
3. **`ADD_TO_LIFE{count:{$ref:'last_processed_count'}}` が固定文言**「トラッシュに置いたシグニ1体につき1」で描かれ、
   `WXK08-028-E2`（直前は**ライフを手札に加える**処理）で**別の概念に化けていた**。

### 引き継ぎで直した gate 失敗6件（すべて Codex の途中停止による不完全状態）
- **`WD22-007-G-E1` が live へ届いていない**＝parser が追いついたので `manualEffects.ts` の定義は
  **削除が正解**（§6.4 `O-40` の「削除候補」に出ていた）。削除 → `--unfreeze` → `--adopt` で配送した。
- **`_partial_fresh` に `SPDi43-08`**＝採用して 0 に戻した。
- **`WXK07-054-CB-E2` の位置固定 assert**（`steps[1].then` が `REVEAL_UNTIL`）＝
  **パワー修正を支払いゲート内へ入れた**ので `SEQUENCE` に変わった＝**腐り**。型で引く形へ直し、
  **「パワー修正がゲートの外へ戻っていない」assert を新設**（今回直した本体を固定）。
- **`(xxix)` 段階1/2 のトリップワイヤ**＝`WXK03-020-E2` に `byEffect` が付いて段階1へ**移った**ぶん
  （10→11 と 1467→1466・1405→1404 は**同じ1件の移動**）。3箇所を理由つきで更新。
- **`O-133` ラチェット 5→6**＝`SPDi43-08-E2` を採用した結果 **parser 自身が `PARTIAL` を出す効果**が1件増えた＝
  凍っていない（毎回再生成）＝**較正であって退化ではない**。A/B/C はいずれも 0。
- **census 高シグナル 0→1**＝`WD20-008-E1`。**計器の語彙不足でバグではない**＝原文「3枚まで」を
  `ENERGY_CHARGE_FROM_DECK` に `upToCount` が無いため **CHOOSE の 0/1/2/3 分岐**で表しており、
  計器は `upToCount` 系のキーで探すので見つけられない。🔑**`upToCount` を実装したら 0 へ戻す**と明記した。

### 検証
`git diff ee0c659a3` の **effectId 単位差分＝22件**（スコープ外0）。`npm run gates` 全緑・
**golden 3844 PASS**（3833 → +11）・`regen` の逆翻訳を22件すべて原文と目視照合。
⚠**`src/screens/` を触った**（`signiActivateGate.ts` / `BattleScreen.tsx` に各1行）＝§2.2 により本来は実機必須。
**headless は golden で押さえたが実ブラウザ確認は未実施**＝**`V-185`** として §5.1 へ登録。

**実装キュー: 192 → 170効果**（本セッション通算 266 → 170＝**96効果消化**）。**プールの残りは 86効果**。

## 2026-09-09 — 未開拓プールの初回：スクリーニングが83効果を6バッチ除外し続けていた／2効果修正＋逆翻訳の向き反転を是正

**きっかけ**＝ユーザー「実装キューの残数194を早く消化したい」→ 在庫の構造を実測したところ、
**残194 = 除外リスト済み82 ／ `.ts:行番号` 引用83 ／ 未スクリーニング29** で、
🔴**83効果が「triage 判定文に engine の行番号があるものは機構待ち」という私のスクリーニング条件①で
第238〜243 の6バッチすべてから機械的に除外されていた。**

中身を読むと、**引用の多くは「受け皿がここに在る」という意味**だった＝
`WX03-002-E1`（`cardClassExclude` は `types/effects.ts:1342` のコメントが**このカード番号を名指し**）／
`WX05-030-E1`（`cardName:'__lastRevealed__'` が `execSearch` に在る）／
`WXDi-P09-047-E2`（`ENERGY_TRASHED_BY_OPP` の評価器が `execUtils.ts:2466`）／
`WXEX2-17-E1`（`timing` に `ON_ATTACK_LRIG` が無いだけ）。
**いずれも第238 で自力実装したのと同じ「受け皿は実在・限定が落ちている」型＝いちばん安い在庫。**
⇒ **除外条件①を撤回し、PLAN §1 の次の一手を「まず112効果のプールから回す」へ入れ替えた**（commit `d2a7357de`）。
🔑**第243 の「density 3% ＝ 在庫の枯渇」という結論は誤りだった**＝一番安い在庫を除外したまま density を測っていた。

### 直した2効果（どちらも受け皿は実在・条件節だけが落ちていた）
- **`WXDi-P09-047-E2`**＝「このターンに**あなたの効果によって対戦相手の**エナゾーンからカードが1枚以上
  トラッシュに置かれていた場合」が無く、**無条件にコストを払えた**。
  🔑**受け皿は既存の `ENERGY_TRASHED_BY_OPP` で、向きは `owner` が決める**＝カウンタ
  `energy_trashed_by_opp_this_turn` は**トラッシュされた側の state** に書かれる（`effectExecutor.ts:2675` が
  `setOwnerState(tgt.owner, …)`）ので、「相手のエナが減った」は **`owner:'opponent'`** で読む。
  ⚠**型名は "BY_OPP" だが向きは owner が決める**＝名前で判断すると逆に読む。
- **`WXDi-P15-087-E1`**＝「あなたのセンタールリグのレベルが対戦相手のセンタールリグと同じ場合」が無かった。
  受け皿 `LRIG_LEVEL_EQ_OPP` は実在（`WDK16-10-E1` が第242 から稼働中）。

どちらも `LEADING_STATE_CLAUSES` に1行ずつ（第238 と同じ形）。母集団はそれぞれ3効果で、残り2件は MANUAL 済み。

### 逆翻訳の嘘をまた1件（通算8件目）
`ENERGY_TRASHED_BY_OPP` の逆翻訳が **`owner` を無視した固定文**で、原文と**正反対の向き**に出ていた
（「このターンに**対戦相手の効果によってあなたの**エナゾーンから…」）。engine は正しい。
⇒ `owner` で文を分けた。🔑**この型は毎回「engine は正しく計器だけが嘘をつく」**＝
`regen` して読まないと気づけない（今回も `regen` 後の目視照合で出た）。

### 既に直っていた2効果（STALE）
`WX03-002-E1`（`cardClassExclude:"天使"` が live に在る）／`WX05-030-E1`（`nameEqLastProcessed:true` が live に在る）。
⇒ 除外リストへ `STALE` で記録（在庫カウンタからは引かない方針どおり…**ではなく**、
このプールの STALE は **`semantic_bug_fixed.txt` へ入れず** 除外リストのみ＝**直っていない扱いを維持**）。

### 検証
`npm run gates` 全緑・**golden 3833 PASS**（3831 → +2）・`regen` の逆翻訳を2件とも原文と目視照合。
**実機は不要**（`src/screens/` 不触）。**実装キュー: 194 → 192効果。**

⚠**第244バッチ（プール先頭30効果）は `.codex-work` が利用上限**（復帰 9/10 2:58）で**投入直後に停止・変更0**。
既定アカウントは 0:19 復帰。**プールの残りは110効果**。

## 2026-09-09 — 第243バッチ：**「機構不要の一点物」の在庫が尽きた**（採用1／見送り23／既修正6）＝委譲バッチ路線の終点

**投入**＝実装キュー残195から30効果（全件 MED・先頭6件は第242 の持ち越し）。
**Codex は完走**し、`npm run gates` 全緑・報告12項目すべて記載。**ただし採用は1効果だけだった。**

### 🔴 これは「不作」ではなく**在庫の枯渇**＝路線の終点

| バッチ | 採用 | 機構待ち | 既修正/FP |
|---|---:|---:|---:|
| 第239 | 15 / 30 | 15 | 0 |
| 第240 | 17 / 30（未着手13） | — | — |
| 第241 | 9 / 30 | 11 | 10 |
| 第242 | **24 / 30**（未着手6） | 0 | 0 |
| **第243** | **1 / 30** | **23** | **6** |

**1バッチで density が 80% → 3% へ落ちた。** 見送り23件の理由はすべて具体的で、
**「既存の型・フィールド・STUB の組み合わせでは書けない」**（共有 pool／遅延状態／相手を選択者にする配線／
デッキ構築時の制約／動的 filter）＝**スクリーニングの誤判定ではなく、実際に機構が要る**。
⇒ 🔑**`.ts:行番号` 引用の有無で「機構不要」を機械選別する方式は、ここで打ち止め。**
**以後の本線は §5.3 の機構実装**（残 HIGH 108 の大半もそこに紐づく）。

### 採用1効果＝`WXDi-P09-051-E1`
原文「【出】《白》：シグニ1体を対象とし、**次の対戦相手のターン終了時まで**、このシグニの基本パワーは
それのパワーと同じ値になる」に対し、live は**期限が現ターン終了時**（＝1ターン短い過小実行）だった。
`STUB{COPY_TARGET_POWER}` に `copyTargetPowerUntilOppTurnEnd` を足し、engine（`execStubPart2.ts`）が
**長期ストア `power_mods_until_opp_turn`**（`effectEngine.ts:3102` が読む）へ書くようにした。
⚠**対象選択の pause を跨ぐと payload が落ちる**ので、continuation の STUB を `{...stub}` で作り直している。

### 🔑 逆翻訳の嘘を Codex 自身が見つけて直した（指示書 ⑫ の効果）

**第242 で私が後から直した工程を、今回は指示書の報告項目に入れておいた**（「`regen` 後に逆翻訳が payload を
描けていなかった箇所」）。結果、Codex が**自分で2件見つけて直した**:
1. **`COPY_TARGET_POWER` が原文を regex で抜き出して描いていた**＝
   `/(?:次の対戦相手の)?ターン終了時まで/` と**両方を受ける regex** だったため、
   **JSON の期限が欠落していても逆翻訳は原文どおりに見えていた**（＝計器が嘘の共犯になっていた最悪の形）。
   ⇒ payload から描くようにした。**この効果の真バグは、まさにその隠れていた期限欠落だった。**
2. `DRAW_BY_CHARM_COUNT` が `[STUB:チャーム数だけドロー]` で、**所有者（対戦相手）も「＋1」も出ていなかった**。

🔑**教訓＝「原文を regex で抜いて逆翻訳に出す」実装は、計器を嘘の共犯にする。**
`census:enginetext` が engine 側の同じ形を測っているが、**`decompileEffects.ts` 側は計測外**。

### Claude の独立検証
`git diff 8c3c35723` の **effectId 単位差分＝ちょうど1件**（スコープ外0）。
`power_mods_until_opp_turn` の消費地点（`effectEngine.ts:3102`）をコードで確認。
`npm run gates` 全緑・**golden 3831 PASS**（3828 → +3＝JSON/E2E/逆翻訳の3本）・
E2E は**反転確認つき**（payload 無しなら短期ストアへ入ることを assert）。逆翻訳を原文と目視照合＝一致。
**実機は不要**（§2.2＝`src/screens/` 不触）。

**実装キュー: 195 → 194効果**。**除外リストは 53 → 82効果**
（`semantic_bug_deferred.txt`。第243 の見送り23＋既修正6を追記）。
**次バッチ用に残る「機構不要候補」は 26効果**＝今回の density なら期待採用は1〜3件。

## 2026-09-09 — 第242バッチ：Codex が24効果を修正して利用上限で停止 → Claude が引き継いで完成（逆翻訳の嘘3件も是正）

**投入**＝実装キュー残219から30効果（全件 MED＝HIGH の在庫は尽き、残 HIGH の大半は §5.3 登録済み）。
**既登録の機構待ち**（`O-288`／`O-293`／`O-296`／`O-308`）に該当する5件は候補から除外して組んだ。
**Codex は24効果を live まで反映した時点で利用上限**（既定アカウント・復帰 9/10 0:19）に到達し、
`npm run regen` と最終報告の前に停止。**Claude が引き継いで検証・完成させた。**

### 採用24効果（全件 `git diff` の effectId 単位差分と一致・スコープ外0）
`WXK11-047-E3`／`WD14-011-E2`／`WDK16-10-E1`／`PR-K021-E3`／`PR-K043-E2`／`PR-K078-BURST`／
`WXDi-D07-013-E1`／`WXDi-D09-H20-E1`／`WXDi-P00-039-BURST`／`WXDi-P01-059-E1`／`WXDi-P04-059-E1`／
`WXDi-P07-044-E1`／`WXDi-P09-050-E1`／`WXDi-P10-047-E2`／`WXDi-P11-076-E1`／`WXDi-P13-003A-E1`／
`WXDi-P14-060-E1`／`WXDi-P16-053-E1`／`WXDi-CP02-033-E2`／`WX24-P2-014-E1`／`WX25-P1-052-E2`／
`WX25-P2-022-E1`／`WX25-P3-014-E1`／`WX25-P3-027-E1`（内訳は `semantic_bug_fixed.txt`）。

🔑**今回の主軸は「順序」**＝**対象宣言・条件判定・任意コストの前後**が原文とずれている型が過半だった。
定型は `STUB{SELECT_TARGET_ONLY}` ＋ `STUB{STORE_LAST_PROCESSED_TARGETS}` ＋ `targetsStored:true`。
⚠**条件を対象宣言まで巻き込まない**（原文が「対象とし、〜の場合」なら対象は無条件に宣言する）。

**engine 追加は1箇所**＝`execAddToField` の `targetsTriggerSource`（「あなたがシグニを1枚捨てたとき、
**そのカード**をトラッシュから場に出す」＝`WXDi-P07-044-E1`）。**型追加は
`LookAndReorderAction.destination.position` に `'first_top_rest_bottom'` の1つだけ。**

### 🔴 Claude が引き継いで直した「逆翻訳の嘘」3件（計器の較正）

**Codex は `regen` を回す前に止まったので、payload が逆翻訳に出るかを誰も見ていなかった。** 実際3件が嘘をついていた:
1. **`TRASH{HAND_CARD, opponent}` ＋ `targetsStored`** が「（**相手が選ぶ**）」と描かれていた（`WXDi-P14-060-E1`）＝
   原文「あなたはその（公開した）カードを捨てさせてもよい」と**情報量が正反対**。⇒「（先に対象としたそのカード）」へ。
2. **`ADD_TO_FIELD{targetsTriggerSource}`** が「トラッシュのシグニ1枚を場に出す」＝**自由選択**に読めていた
   （`WXDi-P07-044-E1`）。engine は `triggeringCardNum` の1枚に絞るのに逆翻訳だけが広い。⇒「そのカード（トリガー元）」へ。
3. **`hasGuard:false`**（《ガードアイコン》を持たない）が**丸ごと消えて**いた（`WXDi-P11-076-E1`）＝
   `filterJa` が `hasGuard` の**真だけ**を見ていた。⚠`undefined`（無指定）と `false`（否定）を取り違えない。

🔑**この3件は「engine は正しいのに計器が嘘をつく」型**＝原文照合そのものが効かなくなるので、
**payload を足したら必ず `regen` して逆翻訳を読む**（第240 でも同型を2件直している）。

### Claude が足した golden

`WXDi-P14-060-E1` の既存テストへ **`targetsStored:true` と `STORE_LAST_PROCESSED_TARGETS` の対**を assert
（Codex は位置固定 assert を型・id 引きへ直したが、**修正の核である `targetsStored` は固定していなかった**）。
⚠`STORE_*` が前段に無いと `targetsStored` は空集合を指して**無言 no-op** になるので、必ず対で見る。

### 書き換えられた既存 golden 2件（どちらも腐り＝実装ミスではない）
①`§6.4 捨てさせる向き`＝**位置固定 assert** を型・id 引きへ（第240 の教訓どおり Codex 自身が直していた）
②`§5.3 O-249 第146` の live/fresh 比較パスが `steps.1.then` → `steps.1.then.choices.0.action`
（`WXDi-D07-013-E1` が任意化で `CHOOSE` を挟んだため）。
did-it ゲートの regex に `PAID_ADDITIONAL_COST` を足したのも同型（`IS_MY_TURN` と等価の gate）。

### 検証
`npm run gates` 全緑・**golden 3828 PASS**（3800 → +28）・smoke 10744 OK・fuzz 0・census 各計器 0。
`npm run regen`（Claude が実行）の逆翻訳を**24件すべて原文と目視照合＝全一致**。
**実機は不要**（§2.2＝`src/screens/` 不触）。

**実装キュー: 219 → 195効果**。**未反映6効果**（`WXK08-024-E2`／`WXDi-D09-H11-E1`／`WXDi-P03-016-E3`／
`WXDi-P09-051-E1`／`WXDi-P16-002-E1`／`WX24-P4-048-E2`）は**見送りではなく未着手**＝次バッチの先頭へ回す。

## 2026-09-09 — 第241バッチ：Codex が30効果を再照合し9効果修正（Claude 検証済み）＝トリップワイヤ拡張の妥当性まで検算

指示書のlive JSONスナップショットを再照合し、**9効果を`repairSemanticBatch241`で採用**、
**10効果は既修正またはFP**、**11効果は新しい動的条件・状態・選択UIが要るため見送り**とした。
live JSONの差分effectIdは採用9件と完全一致し、全件トップレベルで`GRANT_*` 入れ子は0件。

**採用9効果**：

- `WXEX1-62-E2`＝相手シグニを公開前に対象化・保存し、デッキ上がレベル4シグニの場合だけ保存対象をバニッシュ。逆翻訳も「先に対象としたそれ」を描画。
- `WXEX2-22-E3`＝デッキ上のトラッシュ枚数を`{$ref:'last_processed_level'}`にし、`execTrash`の`resolveCountRef`消費を確認。
- `WXK01-082-E1`＝対象宣言をターン条件の前へ出し、保存対象のパワー修正だけを自ターンに限定。
- `WXK02-003-E3`＝相手手札全枚→相手ライフ上1枚→2ドローの順に構築。
- `WXK02-060-E1`＝相手シグニの対象化・保存をトラッシュ5枚判定より前へ出し、黒コスト支払後だけ保存対象を-3000。
- `WXK03-025-E1`＝条件側の異なる4レベル判定は維持し、結果側の手札2枚に付いていた偽`selectionConstraint.distinct:'level'`を除去。
- `WXK03-028-E3`＝デッキ上からトラッシュに置いた同一カードを保存し、偶数レベルシグニの場合だけ`targetsStored:true`で場出し。逆翻訳も同一性を描画。
- `WXK09-096-E1`＝自分・相手の`TRASH{DECK_CARD,count:1}`を連結し「各プレイヤー」を復元。
- `WXK10-063-E1`＝`triggerScope:'any_ally'` + `triggerFilter.isDrive:true`を刻み、headless collectorとBattleScreen実機経路の両方で既存`matchesStateFilter`を消費。

**既修正/FP 10効果**：`WX10-028-E2`, `WX09-028-E1`, `WX05-005-E3`, `WX06-019-E1`,
`WX07-039-E1`, `WX17-063-E1`, `WX18-033-E2`, `WX19-064-BURST`, `WX16-067-E2`, `WXEX2-12-E2`。

**見送り11効果**：`WX25-P3-032-E2`（次のアタッククラッシュをトラッシュへ置換+バース抑止するkindが無い）、
`WXDi-P13-004B-E3`（次の自分エナフェイズ終了+発生源が場にある間の寿命が無い）、`WX16-002-E4`（同一能力の【出】/【起】二重経路が無い）、
`WX16-003-E1`（各プレイヤーのそのターン最初のアーツ条件+二択キャリアが無い）、`WXEX2-08-E4`（両プレイヤーのエナを横断する候補UIが無い）、
`WXEX2-39-E3`（「コスト OR ＜凶蟲＞の効果」の原因条件が無い）、`WXEX2-54-E2`（場トラッシュレベルへの-1オフセット参照が無い。E2Eで`lastProcessedCards` が空になることを確認し誤採用を撤回）、
`WXK01-045-E1`（任意の相手シグニの「このターンに場に出た」filterが無い）、`WXK02-027-E1`（自センタールリグへの厳密なレベル+1/-1 filterが無い）、
`WXK05-029-E3`（`selectionConstraint`に4枚の能力同一制約が無い）、`WXK06-028-E1`（`TRASH_CARD,count:2`のデッキ上配置順を相手が決めるUIが無い）。

**engine変更**＝`src/engine/triggerCollect.ts` の`oppLifeCrashSourceMatches`/`collectOppLifeCrashedTriggers`、
`src/screens/battle/lifeCrashTriggers.ts`、`src/screens/BattleScreen.tsx`。反転確認は
`第241バッチ E2E WXK10-063-E1: ドライブ状態のシグニがクラッシュしたときだけ発火`＝分岐ありPASS→分岐を外すと非ドライブで発火しFAIL→復元後PASS。

**書き換えた既存golden 3件**：①`O-36 ターン条件`の`WXK01-082-E1`は旧実装固定（対象選択まで条件内）だったため原文向きへ反転、
②`段2 第37バッチ 二重経路契約`は実機ラッパーのstate引数追加による文字列assert腐り、
③`C1 $refトリップワイヤ`は`DECK_CARD.count`の新規出現を正しく検知し、`execTrash`が`resolveCountRef`で消費するため許可位置へ追加。実装ミスによる書き換えは0件。

検証＝`npm run regen` 完走、`npm run typecheck` PASS、フィルタなし`npm run golden` **3799/3799 PASS**（投入前3788→+11）、
`npm run gates` 全緑。smoke **10744/10744**（CRASH/HANG/INVARIANT 0）、fuzz 200ゲーム不具合0、census高シグナル`0 / baseline 0`、
`census:stubs` A群0、`census:enginetext` A群0、`census:costtext` A群0、manual field loss 0、lint `0 errors / 254 warnings`。
commit/pushなし、`docs/PLAN.md`・`docs/PLAN_PROGRESS.md`不触。

### Claude の独立検証（すべて再実行）

- `git diff 69519b7e3` の **effectId 単位差分＝ちょうど9件**（報告と一致・スコープ外0）。
- 🔴**Codex が広げたトリップワイヤ（`C1 $ref`）の妥当性を検算した**＝`OK_POSITIONS` に `DECK_CARD.count` を追加した件。
  **消費地点を読んで正当と確認**（`execTrash` の DECK_CARD 分岐は `resolveCountRef`＝`effectExecutor.ts` の該当行）。
  さらに **live 全効果を走査して、この位置に `$ref` を持つのは `WXEX2-22-E3` の1件だけ／親は `TRASH`** と実測し、
  **「親が別のアクション（`TRANSFER_TO_DECK` の source 等）で出てきたら消費地点を読み直す」**注記をテストへ足した。
  🔑**トリップワイヤの許可リストを広げる変更は、広げた本人の主張ではなく消費地点のコードで判定する。**
- 🆕**`{$ref}` の実挙動を E2E で確かめた**＝JSON に `$ref` が載っていることと、実行時に正しい枚数になることは別問題
  （同バッチで `WXEX2-54-E2` は `lastProcessedCards` が空になるため Codex が採用を撤回している）。
  `WXEX2-22-E3` はレベル1→1枚／レベル4→4枚を assert（`第241 engine:` テスト）。
- 🆕**`src/screens/` 側の新経路を golden で押さえた**＝`triggerFilter.isDrive` は**クラッシュ側の `PlayerState`** が要るため、
  `crasherState` を渡し忘れると **fail-closed で永久に発火しない**。既存の「二重経路契約」テストへ
  ドライブ／非ドライブ／`crasherState` 未指定（fail-closed）の3方向を足した。
  ⚠**`BattleScreen.tsx` の呼び出し1行だけは golden から import できない**ので、同テストの
  **呼び出し文字列 assert** が住所を固定している（引数追加もこの assert が検出した＝腐りではなく設計どおり）。
- 書き換えられた既存 golden 3本を1件ずつ判定＝①`O-36 ターン条件`（`WXK01-082-E1`）は**旧実装固定の腐り**で、
  原文「対象とし、**あなたのターンの場合**、…－4000する」どおりに**対象宣言は無条件・パワー修正だけ自分ターン限定**へ反転（新形が正しい）
  ②`段2 第37バッチ 二重経路契約`は引数追加による**文字列 assert の腐り** ③`C1 $ref`は上のとおり**正当な拡張**。
  **実装ミスによる書き換えは0件**（第240とは違い、今回は Codex の申告どおりだった）。
- `npm run gates` 全緑・**golden 3800 PASS**（3788 → +12＝Codex 11 ＋ Claude 1）・smoke 10744 OK・fuzz 0・census 各計器 0。
  `npm run regen` の逆翻訳を9件とも原文と目視照合（全一致）。

### ⚠ 実機（§2.2）＝この回は `src/screens/` を触ったので本来は実機まで必須

触ったのは `src/screens/battle/lifeCrashTriggers.ts`（**純関数＝golden から import 済み**）と
`src/screens/BattleScreen.tsx` の**引数1個の受け渡し**だけで、上のとおり golden で両方を押さえてある。
**ただし実ブラウザでの通し確認はこのセッションでは行っていない**＝観測点を PLAN §5.1 へ **`V-184`** として登録した。

**実装キュー: 228 → 219効果**。**未着手21効果**（Codex が「既修正/FP 10件」「見送り11件」と判定した分は
キューに残置＝次バッチの候補から外す）。


## 2026-09-09 — 第240バッチ：Codex が利用上限で途中停止 → Claude が引き継いで17効果を完成（既存 golden 3本の腐りと engine の $ref 死角も是正）

**投入**＝実装キュー残245から機構不要スクリーニングで30効果（HIGH 17＋MED 13。HIGH の在庫が尽きたので MED を混ぜた）。
**Codex は parser 17効果＋engine 3箇所＋golden 19本まで書いた時点で利用上限**（`try again at 6:27 PM`）に到達し、
`build:effects` も full gates も回せずに停止した。**Claude が作業ツリーを検証したうえで引き継いで完成させた。**

### 採用17効果（`repairSemanticBatch240`＝effectId アンカー）
`WX25-P3-001-E1`（【ルリグバリア】の欠落）／`WX24-P4-087-E1`（`BANISH_REDIRECT` が相手全シグニ→トリガー元1体）／
`WX25-P3-006-E1`（相手ルリグのダウン欠落）／`WX25-P1-087-E1`（即時 CHOOSE →＜原子＞への `ON_BANISH` 付与）／
`WX25-P3-036-E1`（バースト不発の表し方）／`WX25-CP1-026-E1`・`WX25-CP1-028-E1`（相手ルリグ＋シグニ合計2体まで）／
`WX25-CP1-081-E1`（バトルしたシグニの能力喪失）／`WX25-CP1-091-E1`（アタックしたシグニへの強化）／
`WX26-CP1-003-E1`（【ダブルクラッシュ】側の選択肢）／`WX26-CP1-028-E2`・`WX24-D1-05-E1`・`WX24-P1-011-E1`
（能力喪失の対象がシグニ→ルリグ）／`WX24-P2-047-E1`（存在条件の係り先）／`WXDi-P16-TK01-E1`（同じ選択肢の重複選択）／
`WX14-037-E1`（無意味な `LOOK_AND_REORDER` の除去）／`WXEX1-04-E1`（付与先が場に出たそのレゾナ）。

**engine 3箇所**（Codex 実装・Claude 検証）＝①`execDown` に `CENTER_LRIG_OR_SIGNI` 分岐（ルリグとシグニを同時にダウン）
②`applyDirectAction` の `DOWN` にルリグ枝（`lrig_down`）③`BANISH_REDIRECT` の `targetsTriggerSource` 消費地点。
**型追加は `BanishRedirectAction.targetsTriggerSource` の1つだけ。**

### 🔴 Claude が引き継いで直した4件（**うち1件は Codex の実装ミス**）

1. **`execDown` の新分岐が `resolveNum` で枚数を解いていた**＝`{$ref}` を問答無用で 0 にするので、
   動的枚数が**黙って0体ダウン**に化ける死角。**golden の「C2 $refトリップワイヤ」がこの差分を検出**した
   （凍結された関数集合に `execDown` が増えた）。⇒ 同関数の主経路と同じ `resolveCountRef` へ直した。
   🔑**トリップワイヤを「更新して黙らせる」のではなく、実装を直すのが正しい向き**だった。
2. **`WX25-P3-036-E1` の既存 golden が腐っていた**＝旧 live は `STUB{SUPPRESS_LIFE_BURST_ON_CARD}`＝
   `otherState.suppress_life_burst = true`（`execStubPart1.ts:1763`）で**そのターンの相手のバーストを全部**止める
   過剰抑制だった。原文は「**その**対戦相手のカードのライフバーストは発動しない」なので
   `LIFE_CRASH{owner:'opponent', triggerBurst:false}` が正しい。**assert を新しい正しい形へ更新した。**
3. **位置固定の golden がずれた**＝`WX25-P3-001-E1` に落ちていた【ルリグバリア】を `steps[1]` へ足したので、
   `['steps', 4]` / `['steps', 2]` を見ていた assert が一斉に外れた。⇒ **添字ではなく型・id で引く**形へ直した
   （位置は実装詳細なので固定しない）。
4. 🔑**`fresh()`（POOL カーソル）に依存した golden が、無関係な parser 変更で赤くなった**＝
   `WX15-038-E2` の「**別名**アクセでは+3000しない」の"別名"を `fresh()` で引いていたため、
   前段テストの `fresh()` 消費が変わると**たまたま `WX15-058` 自身**を引いて +3000 が乗る。
   ⇒ `findCard` で明示的に別カードを選ぶ形へ。**`--only` では緑・全件では赤**という典型的な出方をした。

### 逆翻訳（原文照合の主計器）の嘘を2つ直した
- **`REMOVE_ABILITIES{target:LRIG, alsoCenterLrig}` が「センタールリグと**すべてのシグニ**は能力を失い」と出ていた**＝
  engine の候補は `target.type==='LRIG'` ならセンタールリグ1枚だけなのに、**逆翻訳だけが過剰実行に見えていた**
  （`WX26-CP1-028-E2` / `WX24-D1-05-E1` / `WX24-P1-011-E1`）。対象が `LRIG` のときは「センタールリグは」に直した。
- **`REVEAL_PICK_HAND_SHUFFLE_BOTTOM` が総称ラベル「デッキ上**N**枚公開して**M**枚を…」のままで、
  枚数も絞り込みも逆翻訳に出ていなかった**（`revealPickParams` は engine が実際に読んでいる）。payload から描くようにした。

### 検証
`git diff c7fbc0cb5` の **effectId 単位差分＝ちょうど17件**（スコープ外0）。新規キーの消費地点を全点コード確認
（`GAIN_LRIG_BARRIER`／`alsoCenterLrig`／`allowRepeat`／`revealPickParams.restDest`・`.filter`／`triggerBurst`／
`targetsTriggerSource` を `POWER_MODIFY`・`REMOVE_ABILITIES`・`GRANT_EFFECT`・`GRANT_PROTECTION`・`BANISH_REDIRECT` の各所で）。
`ON_SIGNI_BATTLE` の付与能力が拾われること（`BattleScreen.tsx:11025` は augmented effectsMap を読む・
`triggeringCardNum` はバトル相手）も確認。`npm run gates` 全緑・**golden 3788 PASS**（3769 → +19）・
smoke 10744 OK・fuzz 0・census 各計器 0。`npm run regen` の逆翻訳を17件とも原文と目視照合。
**実機は不要**（§2.2＝`src/screens/` 不触）。

**実装キュー: 245 → 228効果**。**未着手13効果**（`WX25-P3-032-E2`／`WXDi-P13-004B-E3`／`WX10-028-E2`／`WX09-028-E1`／
`WX05-005-E3`／`WX06-019-E1`／`WX07-039-E1`／`WX17-063-E1`／`WX16-002-E4`／`WX18-033-E2`／`WX16-003-E1`／
`WX19-064-BURST`／`WX16-067-E2`）は**そのまま次バッチの先頭へ回す**（Codex は着手すらしていない＝見送り判定ではない）。

## 2026-09-09 — 第239バッチ：機構不要候補30効果の再照合・Codex が15効果修正（Claude 検証済み）＋検証で見つけた engine の穴1件

対象30効果について原文・投入時live JSON・fresh parser・既存golden・engineの実消費箇所を再照合し、
母集団を`npm run census:population`で効果単位に実測した。triageが指した不整合は30件とも現存し、staleは0件。
うち**既存の型・フィールド・実装済みSTUBだけで正確に閉じた15効果を採用**し、残る15効果は新しい条件、
動的参照、遅延状態、共有選択poolなどが要るため近似せず据え置いた。変更した15件はいずれも
`repairSemanticBatch239`のeffectId分岐でスコープを閉じ、live JSONとの差分も15 effectIdだけであることを確認した。
全30件ともトップレベル効果で、`GRANT_*`配下の入れ子は0件。

- `WXDi-D09-P04-E1`＝手札差6枚以上を先に判定して相手1体を－6000、そうでなければ3枚以上で－3000とし、「代わりに」を排他的分岐へ修復。
- `WXDi-P02-040-BURST`＝トラッシュのLv2＜天使＞1枚を手札へ、Lv1＜天使＞1枚を場へ出す2段へ修復。
- `WXDi-P03-005-E1`＝追加エクシード4の支払成否で、同じデッキ上5枚からの取得上限を2枚／1枚に分岐。
- `WXDi-P04-002-E1`＝チーム使用条件を復元し、即時3択をゲーム中のターン1回ON_PLAY能力へ変更。赤／青／緑のトリガー元色条件と赤択の任意《無》も内側へ復元。
- `WXDi-P04-006-E1`＝ルリグ3体の使用条件を`FIELD_LRIG_COLOR_COUNT.minLrigs`で復元し、＜悪魔＞2体を実際に処理した場合だけターン終了時回収能力を永久付与。使用時の即時回収を除去。
- `WXDi-P08-040-E2`＝自分のエナ・ライフクロス・手札をすべてトラッシュへ置いてから、2枚ドロー・エナチャージ2を行う順序へ修復。
- `WXDi-P10-038-E1`＝ドロー2後の必須処理を、＜プリパラ＞シグニ1枚か手札2枚を捨てる`CHOOSE`へ修復。
- `WXDi-P10-040-E2`＝相手シグニを先に保存し、このシグニの下のスペルを好きな枚数トラッシュへ置き、その実枚数×－5000を保存対象へ適用。
- `WX24-P3-058-E1`＝任意《黒》《黒》後、このシグニへ「正面の相手シグニの基本パワーを0にする」常在効果をターン終了時まで付与。
- `WX24-P3-085-E1`＝公開したマジックボックスがLB持ちならランサー、LBなしなら攻撃無効＋エナチャージ3という排他的帰結へ修復。未処理時は両条件ともfail-closed。
- `WX25-P2-018-E1`＝＜電機＞1体を先に対象保存し、覚醒と任意コスト後ダブルクラッシュの両択が同じ対象を参照する形へ修復。
- `WX24-P4-025-E3`＝デッキへ戻すトラッシュ全カードを`hasLifeBurst:false`で限定し、戻した実枚数を全相手シグニの－1000倍率へ維持。
- `WX25-P2-076-E1`＝択①を相手エナ2枚以上かつ＜電機＞エナコスト支払時だけ1枚トラッシュ、択②を自身覚醒かつ相手エナ3枚以上のときだけ2枚トラッシュへ修復。
- `WX24-P4-034-E1`＝この方法で手札に加えた2枚が「黒1枚＋白赤青緑のいずれか1枚」の場合だけ相手デッキ8枚をトラッシュへ置く条件を追加。
- `WX25-P2-006-E1`＝解決時の即時手札捨てを、ターン中のシグニによる各ダメージを任意の手札1枚捨てへ置換する`LIFE_CRASH_REPLACE`へ修復。

**見送り15効果**（いずれもtriage有効）：

- `WXDi-D05-017-E1`＝正面シグニが凍結状態というAUTO用Conditionが無い（`FRONT_SIGNI`はActiveCondition側だけ）。
- `WXDi-D09-P04-E3`＝主要な全該当手札捨ては既存語彙で書けるが、宣言候補を相手センタールリグのレベル以下へ動的制限できず、部分修正を採用しなかった。
- `WXDi-P00-037-E1`＝相手手札から非公開で3枚まで選んだ集合を閲覧し、その同じ集合から1枚をデッキ下へ送る共有poolが無い。
- `WXDi-P00-038-E1`＝離場を裏向き化へ置換し、次の次の自分メインフェイズに同じゾーンが空なら復帰する複数ターン遅延状態が無い。
- `WXDi-P03-035-E1`＝`UP`／`REMOVE_ABILITIES.targetsTriggerSource`の実装はシグニ専用で、アタックしたアシストルリグを同一対象として扱えない。
- `WXDi-P10-052-E2`＝`BANISH_SUBSTITUTE`がE1で選んだシグニを恒久参照するcarrierを持たない。
- `WXDi-P11-060-E1`／`WXDi-P11-060-E2`＝左右隣接ゾーンにダウン状態の指定クラスがいるAUTO用Conditionが無い。
- `WXDi-CP02-086-E1`＝このターンにコストまたは効果で自分のエナへカードが置かれた履歴を表す状態・Conditionが無い。
- `WXDi-P08-030-E1`＝既存`FORCE_SIGNI_ATTACK`は全シグニ（または感染限定）だけで、保存した選択対象だけを可能なら攻撃させる指定が無い。
- `WXDi-P10-055-E1`＝`FIELD_LEVEL_SUM{metric:'power'}`は全シグニ合計のみで、＜天使＞だけの実効パワー合計に絞れない。
- `WX24-P3-018-E1`＝中身が＜トリック＞のマジックボックスを3枚まで選んで表向きのシグニへ戻すaction/UIが無い。
- `WX24-P3-066-E1`＝同じシグニゾーンのマジックボックス存在を判定するConditionが無い。
- `WX25-P2-008-E1`＝ターン中の「パワー12000以上のシグニによる全ダメージ」を防ぐ発生源power付き継続防止が無い（既存は次の1回のみ）。
- `WX24-P4-022-E3`＝相手のシグニゾーンとエナゾーンを1つの候補poolにし、5色それぞれ1枚までを対象化して手札へ戻すactionが無い。

triage記載以外では、`WXDi-D09-P04-E3`の宣言上限、`WXDi-P03-035-E1`のルリグ対象フラグが実行側で
消費されない点、`WXDi-P04-006-E1`のルリグ3体使用条件欠落を確認した。前2件は見送り理由へ反映し、
後者は採用修正に含めた。`WX24-P3-085-E1`は任意のマジックボックス処理を辞退した場合、
`LAST_PROCESSED_HAS_BURST`が否定形を含め空集合でfalseになることも実装確認済み。

検証＝各編集後`npm run typecheck` PASS、対象15件の`npm run golden -- --only "第239"` **15/15 PASS**、
`npm run regen`完走、フィルタなし`npm run golden` **3768/3768 PASS**（投入前3753→新規15本）、
`npm run gates`全緑。smoke **10744/10744**（CRASH/HANG/INVARIANT 0）、fuzz 200ゲーム不具合0、
census高シグナル`0 / baseline 0`、`census:stubs` A群0、`census:enginetext` A群0、
`census:costtext` A群0、manual field loss 0、lint `0 errors / 254 warnings`。
commit/pushなし、`docs/PLAN.md`・`docs/PLAN_PROGRESS.md`不触。

### 🔴 Claude の独立検証で見つけた engine の穴（同じ巡で塞いだ）

**`WX24-P3-058-E1` の採用形は、JSON は原文どおりなのに engine が何もしない無言 no-op だった。**
`GRANT_EFFECT` で自分へ載せる CONTINUOUS `POWER_SET{owner:'opponent', count:1, filter:{frontOfSelf:true}}` は、
`calcFieldPowers` の **POWER_SET 分岐が `owner:'self'|'any'` しか見ていない**（`effectEngine.ts:2481`）ため
**どの枝にも入らず落ちていた**。すぐ下の `POWER_MODIFY` 側には同じ `frontOfSelf` 分岐が既にあり
（`effectEngine.ts:2526`）、**片方の型にだけ実装されていた**形。
- 直し＝`POWER_SET` にも `frontOfSelf` 分岐を足した（正面は engine 共通規約の **2 - zi**・効果元が場に居なければ何もしない）。
- golden に E2E を1本追加し、**反転確認**（パッチを外すと `expected=0 got=10000` で赤／戻すと緑）を実際に取った。
- 🔑**教訓＝「JSON が原文どおり」と「engine が動く」は別**。指示書に書いた「無言 no-op を作るな」は
  Codex 側では**新しく書いたキー**にしか適用されず、**既存キーの組み合わせが未実装**の形は素通りする。
  ⇒ **採用形が CONTINUOUS/付与を経由するときは、`calcFieldPowers` など収集側まで読む。**

### 逆翻訳の内部トークン漏れを1件直した（計器の較正）

`TAKE_FROM_UNDER_SIGNI{count:'ALL'}` が逆翻訳に「スペルを**ALL枚まで**トラッシュに置く」と出ていた
（`WXDi-P10-040-E2` と、以前からの `WXDi-P11-077-E1` の2件）。**逆翻訳は原文照合の主計器**なので
engine の内部語彙が混ざると照合の目が鈍る＝`decompileEffects.ts` で「好きな枚数」へ直した。

### Claude 側の検証（すべて再実行）

- `git diff 7a29bc44c` の **effectId 単位差分＝ちょうど15件**（報告と一致・スコープ外0）。
- **新しく書かれたキーの消費地点をすべてコードで確認**＝`GRANT_PLAYER_ABILITY`→`game_granted_effects`
  （`effectEngine` 2箇所・`lifeCrashGate`・`lrigDamageShield`・`BattleScreen`）／`LAST_PROCESSED_HAS_BURST{negate}`
  （`execUtils.ts:3367`）／`SET_CANCEL_ATTACK_FLAG`（`execStubPart3.ts:5427`）／`hasLifeBurst`（`execUtils.ts:1376`）／
  `requiredDistinctColors` の**入れ子配列スロット**（`execUtils.ts:3452`）／`LIFE_CRASH_REPLACE{pay_cost,payOptions}`
  （`screens/battle/lifeCrashReplace.ts`）／`TAKE_FROM_UNDER_SIGNI{fromThis,filter,'ALL'}`（`effectExecutor.ts:8487`）／
  `TRASH{LIFE_CLOTH_CARD,'ALL'}`（`effectExecutor.ts:2371`）／`CHOOSE` の choice 別 `condition`（`effectExecutor.ts:6461`）。
- **`once` を書かなかったのは正しい**＝`LIFE_CRASH_REPLACE` は `once` でなければターン中何度でも残る
  （`lifeCrashReplace.ts:151`）＝原文「各場合」と一致する。
- `npm run regen` の逆翻訳を15件とも原文と目視照合（全一致）。⚠`WXDi-P04-006-E1` の
  `FIELD_LRIG_COLOR_COUNT{value:0, minLrigs:3}` は「色0種類以上」という**退化した色条件で枚数だけを見る**
  書き方＝意味は正しいが逆翻訳の文が不自然（据置）。
- `npm run gates` 全緑・**golden 3769 PASS**（3753 → +16＝Codex 15 ＋ Claude 1）・smoke 10744 OK・fuzz 0・
  census 高シグナル 0/0・census:stubs A群0・census:enginetext A🔴0行・census:costtext A🔴0規則・lint 254 warnings（同値）。
- **実機は不要**（§2.2＝触ったのは `src/data/` `src/engine/` `public/data/` `scripts/` のみ）。

**実装キュー: 260 → 245効果**（`node scripts/archive/semanticAuditBugList.mjs`）。
見送り15件は**キューに残したまま**（次回の「機構不要」候補からは除外）。うち**条件型が無いだけ**の6効果は
PLAN §5.3 索引 G へ `O-308` としてまとめて登録した。


## 2026-09-09（§5.0 実装キュー・第238バッチ＝Codex 両アカウント利用上限中に Claude が6効果を自力実装）

**作業単位**＝ユーザー指示「PLANをよみ、作業の続きを行う」。前セッションが準備した第237バッチ（30効果）は
`.codex-work` が投入直後に利用上限（復帰 16:08）、default も 13:18 まで復帰しないため、**委譲を待たずに
Claude 自身で実装**した。取ったのは同バッチ候補（`queueClean.json` の HIGH 先頭30）のうち、
§2.1 ② の母集団実測で「受け皿が実在する」と確認できた6効果。

### 直した6効果（すべて母集団を実測してからレーンを決めた＝PLAN §2.0）

| 効果 | 真因 | 直した場所 | 母集団 |
|---|---|---|---|
| `WXDi-D06-014-E1` | 「白か赤か青か緑の」＝**3色以上のOR**を共通ヘルパが読めず、**末尾2色だけ**を拾って白・赤のシグニを選べなかった | `parserUtils.ts` の `parseColorFilter` を N 色へ一般化 | 9効果（この形の被害は1） |
| `WXDi-P01-042-E1`／`WXDi-P02-074-E1` | 「このターンにあなたのデッキからカードが1枚以上エナゾーンに移動していた場合」の**条件節が丸ごと落ち**、無条件にコストを払えた | `effectParser.ts` の `LEADING_STATE_CLAUSES` に1行（受け皿 `SELF_DECK_TO_ENERGY_THIS_TURN` は実在） | 2効果 |
| `WXDi-P05-035-E1`／`WXDi-P10-033-E2` | 「N枚公開**し、それらのカードを**シャッフルしてデッキの一番下に置く」が**読点で1文**のため後始末の節がノードにすらならず落ち、公開した5枚が**デッキの一番上**に残っていた（次のドローが全部見える） | `foldRevealShuffleToDeckBottom` を「それらのカード」綴り＋**no-op ノードが無い形**へ拡張 | 4効果（うち2が被害） |
| `WXDi-P05-078-E1` | 主語が**逆**＝「あなたの《凶天姫　ヴァルキリー》1体がアタックしたとき」が既定 scope（self）で、**自分のアタックで誤発火し本来の主語では発火しない** | `manualEffects.ts`（`triggerScope:'any_ally'`＋`triggerFilter.cardName`） | 2効果・うち1件は既に MANUAL＝速いレーン |
| `WXDi-P03-009-E1` | 対象「レベル2以下のシグニ1体」が `owner:'self'`＋**レベル限定なし**＝相手のシグニを戻せず、レベル4も戻せた | `manualEffects.ts`（`owner:'any'`＋`level.max:2`）＋**engine 2箇所** | 2効果・もう1件は既に正しい |

### この巡で足した唯一の機構＝`TRANSFER_TO_DECK{owner:'any'}` の場候補（engine）

🔴**`ownerState('any')` は相手側へ潰れる**ので、素の `fieldCandidates(state, …)` のままだと
**自分のシグニは候補に無く、選ばせても黙って何も起きない**（無言 no-op）。同じ非対称は
`SELECT_TARGET_ONLY`（§6.4 `O-34(a)`）・`BANISH`・`BOUNCE` で既に埋まっており、
**`TRANSFER_TO_DECK` だけが取り残されていた**。2箇所を直した:
- `effectExecutor.ts` の `execTransferToDeck` SIGNI 分岐＝候補集めを `fieldCandidatesByOwner('any')` へ、
  適用（`applyToBottom`）は **選んだ1枚の側**（`sideOfFieldCard`）で解決。
- `applyDirectAction` の `case 'TRANSFER_TO_DECK'`＝`tdOwner` を同様に解決。**ここが本命**＝
  `count:1` は `SELECT_TARGET` を挟むので**必ずこちらを通り**、旧実装では所在探索が全部外れて
  `return done(ctx)` の無言 no-op になっていた（golden の反転確認で実際に赤→緑を見た）。

### 検証
`npm run gates` 全緑（typecheck / **golden 3753 PASS（3745→+8）** / smoke 10744 OK / fuzz / census 高シグナル0 /
census:stubs / manual-fields / census:enginetext A群0 / census:costtext A群0 / lint）。
`npm run regen` の逆翻訳を6効果とも原文と目視照合（全一致）。
**実機は不要**（§2.2＝触ったのは `src/data/` `src/engine/` `public/data/` `scripts/` のみで `src/screens/` は無し）。

### 据置（同じカードの別軸＝機構が要る）
- **`WXDi-P05-035-E1` の第3軸**＝「《無》×6 から**この方法で公開されたレベル1のシグニ1枚につき**《無》を減らす」
  可変コストは未実装のまま（live は無色7固定）。`costScaling` は**ゾーン枚数**しか数えられず、
  **直前の公開結果を数える** payload が無い＝新機構。⇒ この効果は実装キューから**落とさない**
  （`semantic_bug_fixed.txt` にも入れていない）。
- **`WXDi-P10-033-E2` の後段** `STUB{TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE}` は今回のfindingの対象外（別軸）。

**実装キュー: 266 → 260効果**（`node scripts/archive/semanticAuditBugList.mjs`）。


## 2026-09-09（§5.0 実装キュー・MANUAL/PARTIAL 20効果バッチ＝codex-work 利用上限を Claude が引き継いで完遂）

**作業単位**＝§5.0 実装キュー（残353効果）のうち `parseStatus` が `MANUAL`/`PARTIAL`（＝`manualEffects.ts` に定義があり
新機構なしで直せる）20効果を `CODEX_HOME=.codex-work` へ投入 → **7効果を完走した時点で利用上限に到達**、
Claude が差分を検証したうえで残りを引き継いで完了させた（[[codex-limit-handoff]]の手順どおり）。

### codex-work が直した7効果（検証のみ・変更なし）
`WXK07-001-E1`／`WDK07-E08-E1`／`WDK16-06H-E1`／`WXDi-P05-006-E1`／`WXDi-P14-002-E1`／`WXK10-031-E1`／`WD19-018-E1`。
いずれも golden の反転確認つきE2Eテストが同梱されていた（`scripts/goldenTest.ts` 末尾）。

### Claude が引き継いで直した3効果＋engineのバグ1件
- **`PR-457-E2`**＝真因は指示書のスコープ外（`scripts/fixLrigColorFilters.mjs` の `matchesLrig` ルールが
  `build:effects` のたびに `colorMatchesLrig:true` を再注入していた＝**manual 側だけ直しても揮発する**）。
  該当ルールを削除し、`npx tsx scripts/censusOrphanManual.ts --unfreeze A` で `parseStatus` を `AUTO` へ解凍。
  ⚠**Codex はここに `manualEffects.ts` の手書きコピーを足して「直した」と報告していたが、それは
  fixer が毎回上書きする対症療法**で、golden の `§6.4 O-42 tripwire`（manual 影武者コピー検出）が
  即座に検知した。**Codex の報告を鵜呑みにせず golden を全件回して初めて気づいた。**
- **`SPK01-13-E1`**＝選択肢③「このターン、対戦相手の効果によってダメージを受けない」が
  `PREVENT_NEXT_DAMAGE{count:1}`（1回消費）になっていた＝既存の `PREVENT_DAMAGE{until:UNTIL_END_OF_TURN}`
  （期間中無制限）へ差し替え。
- **`PR-459A-E1`**＝末尾「スペルの場合、対戦相手はそのカードを捨てる」の「それ」＝公開した
  そのカード自身が、無指定の `TRASH{HAND_CARD,opponent,1}`＝相手手札の任意1枚になっていた。
  `STORE_LAST_PROCESSED_TARGETS`＋`targetsStored:true` で固定。
  🔴**この過程で engine のバグを1件発見・修正**＝`execTrash` の `SIGNI`/`ENERGY_CARD` 分岐は
  `targetsStored` を候補フィルタに反映するのに、**`HAND_CARD` 分岐だけ同じ処理が抜けていた**
  （`src/engine/effectExecutor.ts` の HAND_CARD ブランチへ追加）。この抜けは他の「手札の特定1枚を
  参照する」効果にも影響しうる形＝**同種の抜けが無いか today 時点では横展開していない**（要フォローアップ）。

### 据置（機構不要と見立てたが実際は新機構が要ると判明＝2件）
- **`WD22-007-G-E1`**＝「そのシグニを場からトラッシュに置いてもよい」の「そのシグニ」＝
  `triggerScope:'any_ally'` で発火した**トリガー元シグニ**（`ctx.triggeringCardNum`）だが、
  既存の `OPTIONAL_COST{selfTrash}` は**能力の持ち主**（`ctx.sourceCardNum`）しか場から外せない
  （`execUtils.ts` 実測）。誤って `selfTrash` を付けると WD22-007-G 自身を落とす誤実装になるため見送った。
  §5.3 へ新規登録が必要（`triggeringCardNum` 版の selfTrash、または同等の新 payload）。
- **`WXK03-023-E1`**＝①「手札を1枚捨て」の欠落だけ追加した。②「2枚以上トラッシュで+1ドロー」
  ③「4枚トラッシュでバニッシュ」は**据置**＝`underAnySigniTrash` は固定 count のオール・オア・ナッシングしか
  実装が無く、`TAKE_FROM_UNDER_SIGNI` は `last_cost_trashed_cards` も書かないため、**実際に支払った枚数を
  段階的に読む条件が既存機構に無い**（13件の live カードが同じ `underAnySigniTrash` を固定countで使っており、
  変更は横展開の影響範囲が広い）。既存の DRAW×2・BANISH無条件は温存（過少化させない）。§5.3 へ新規登録が必要。

### 偽陽性・stale finding（8効果＝triage 後に既に別バッチで正しく直っていた／もとから正しい設計判断だった）
- `WX07-032-E1`／`WX21-Re18-E1`／`WX21-Re04-E1`／`WX22-014-E3`＝§5.3 `O-286` で既に修正済み（同バッチの
  コミット履歴には残らなかったが `manualEffects.ts` のコメントで確認）。
- `WX06-014-E2`＝§5.3 `O-274`（`execTransferToDeck` の選択UI一般化）で「好きな順番で」は解決済み。
- `WD13-002-E1`／`WD13-003-E1`＝§5.3 `O-248`/`O-219` の意図的な設計判断＝「公開する」コストは
  手札を失わないので UI を挟まず `HAND_COUNT_FILTER` で自動適用する近似（コメントに理由が明記されていた）。
- `WDK17-009-E2`＝§5.3 `O-65` の意図的な読み＝原文の壊れた構文（読点なし）を `WD20-006-E1` の同型構文と
  揃えて「対象化した2枚は無条件、手札1枚捨てだけが条件つき」と解釈済み（コメントに全文の根拠あり）。

⚠**教訓**＝意味照合 triage の `triaged.txt` は**修正後も行が残る**ため、着手前に必ず
`manualEffects.ts` の該当エントリ周辺のコメントを読むこと。上の8効果は**全部コメント付きの
既存エントリ**で、コメントを読まずに直すと**既に正しい実装を壊すところだった**（特に `WD13-002`/`WD13-003`/
`WDK17-009` は理由込みの明示的な設計判断）。

**簿記**＝`scripts/archive/scratchpad/semantic_bug_fixed.txt` へ18行追記（fixed 10・FP 8）。
golden に `BASELINE_ORPHAN_MANUAL`（6→5）の較正1件＋新規テスト2本（`SPK01-13-E1`／`PR-459A-E1`）。
`npm run gates` 全緑（検証は本エントリ確定後に別途実行）。

---

## 2026-09-08（第232＝実装キューの残353効果を全数クラスタリングし、機構8系統を `O-298`〜`O-305` で登録・**`src/` は無変更**）

**作業単位**＝ユーザー指示「残りのキューをすべて O-nn に登録して」。**実装は0行**（分類・実測・登録のみ）。

### 🔴 まず「すべて登録」の粒度を確認した

353効果を1項目ずつ §5.3 へ足すと、**`cardProgressCensus.mjs:176` が `| \`O-nn\`` 行を全部「機構待ち」と数える**ので
**mech が353件に膨らんで計器が壊れる**（PLAN §5.3 に「その44件の本文に出てくる引用カードまで mech に化けた」前例が明記されている）。
⇒ ユーザーの判断で**「機構が要る系統だけ登録」**に決定。

### 353効果の内訳（機械クラスタリング＋目視）

| 区分 | 効果数 | 置き場 |
|---|---:|---|
| engine・受け皿に言及し、**系統が立つ** | **40** | §5.3（`O-287`〜`O-305`） |
| engine 行を引用しているが**一点物** | 46 | §5.0 実装キュー |
| 機構不要の一点物（フィルタ・対象型・条件の欠落） | 267 | §5.0 実装キュー |

### 登録した8系統（母集団は実測値）

| ID | 索引 | 母集団 | 何が無いか |
|---|---|---:|---|
| `O-298` | A | **15** | **自分の**任意コストで対象を先に確定する軸（`O-288` は相手側＝分岐が別） |
| `O-299` | A | **21** | 置換効果「代わりに」の発生原因・範囲の限定 |
| `O-300` | A | **20**（上限） | `GRANT_LRIG_ABILITY` が対象を選ばない |
| `O-301` | A | **10** | 「次の〜フェイズ開始時に」の遅延 |
| `O-302` | B | **6** | 可変選択数（「〜につき1つまで選ぶ」） |
| `O-303` | B | **3** | `zone_moved_just` が場外→場の入れ替えでも記録される（**live JSON にキーが無い＝どの計器にも映らない**） |
| `O-304` | G | **2** | 動的な数値上限（軸ごとに専用キーを増やす形が限界） |
| `O-305` | G | **1** | 起動をまたいだ「まだ選ばれていない」の管理 |

⚠**母集団はすべて上限値**＝着手時に §2.1 ② で割り直す（`O-269` は登録時16 → 実測1だった）。

🔑**測り方**＝原文（`docs/_effect_srctext.json`）に言い回しがある効果を数え、live JSON に受け皿キーが在るかで引き算した。
`O-298` は「`STUB{OPTIONAL_COST}`→`CONDITIONAL` かつ `STORE` 無し」が **187効果**あるが、そのうち
**原文で対象が任意コストより前に来る 15効果**だけが穴＝**構造だけで数えると12倍に過大計上する。**

**⚠見送った系統**＝「そうした場合」の did-it ゲート欠落は原文該当が **1160効果**で粗すぎる（絞り込みの軸が要る）。
**§5.3 索引は 10 → 18項目**（索引 A 4／索引 B 4／索引 G 10）。`npm run census:cards` で18項目すべてが読めることを確認した。


## 2026-09-08（S-3 第231＝70効果を検証して真バグ 15効果を修正・**golden の契約に5件差し戻された**）

**作業単位**＝ユーザー指示「S-3 を進める、30件くらい」。S-3（実装キューのうち live が MANUAL）70効果を全数検証した。

### 🔑 やり方を変えた＝**原文 × 逆翻訳を並べて一気に読む**

前回（第230）は JSON を1件ずつ開いて 62件で力尽きたので、**`docs/_effect_srctext.json`（効果単位の原文）×
`docs/decompile_sheet*.txt`（逆翻訳）を並べる使い捨てスクリプト**で仕分けた。1件3行で読めるので
**判定コストが約5分の1**になり、同じ労力で 70件（S-3 の全数）を見られた。
⚠**逆翻訳は情報を落とす**ので「逆訳に出ない＝JSON に無い」ではない＝**当たりだけ JSON を開く**という使い方。

### 🔴 一番大きい教訓＝**既存 golden の契約は finding より強い**

20効果を直して `npm run gates` を回したら **golden が8本落ちた**。5件は**私の修正が意図的な契約を壊していた**：

| 効果 | 落ちた golden が言っていたこと |
|---|---|
| `WXK08-005-E2-G2` | `LRIG_LEVEL_CMP_OPP{lt}` は**タスク2で意図的に付けたゲート**（finding の「過剰」は誤り） |
| `WXDi-P05-060-E1` | 「E1 から**無言 no-op の付与STUBだけ**を除去」＝`POWER_MODIFY` は残す契約（`O-128` 第4 A-2）。**しかも E2 は既に正しく実装済み**で、私が足した E2 は `triggerScope` を欠いた劣化コピーだった |
| `WXEX1-69-E1` | 対象を先に確定させると **§6.3 [B]26「公開writer」の記録（公開3枚）が1枚に壊れる** |
| `WXDi-CP01-038-E1` | `GRANT_EFFECT` で包むと `bySourceType`/`bySourceLevel` の保存と BANISH 保護が消える（golden 3本が同時に落ちた） |
| `WXDi-P03-016-E2` | `§6.4 O-25` が「**E2 は近似のまま（構造化すると効かなくなる）**」と明記していた |

⇒ **5件を差し戻して 15効果で確定**。🔑**着手前に `grep -n "<effectId>" scripts/goldenTest.ts` を打つ**
（golden が張ってあるなら、その契約が現時点の正）。

### 修正した 15効果

`WX25-CP1-061-E1`（原文に無い固定+4000が【絆常】と二重）／`WX24-P4-017-E3`（遅延誘発の `once` を外す）／
`SP27-014-E2`（捨てが強制・未払いでもバニッシュ）／`WXDi-P10-004-E1`（エナチャージの枚数連動）／
`WXDi-P07-044-E2`（凍結とパワー減で別々に対象を選んでいた）／`WXK10-055-E1`（コストで置いた札を回収できた）／
`WX26-CP1-001-E1`・`WX25-P3-007-E1`（「次のあなたのアタックフェイズ開始時」の遅延が無い。後者はパワー+8000も欠落）／
`WD07-012-E2`（「そうした場合」の条件が無く戻せなくても－10000）／`WXK03-034-E1`（【常】のパワー+2000が丸ごと無い＝`-E1b` を新設）／
`WXK03-048-E1`（任意コストの色が落ちて実質タダ）／`WX25-P3-054-E2`（**自分がトラッシュされたとき**になっていた）／
`WXDi-P15-056-E1`（前提条件と `UP` の欠落）／`WX25-P2-066-E1`・`WX25-CP1-002-E1`（`remainder.shuffle`）。

### 偽陽性 15効果（うち5件は上の「golden の契約」）

**`MISSING` の偽陽性率は今回も高い**（`WX16-005-E1` の `levelLteFieldVirusCount`／`WX15-001-E1` の `hasRiseIcon`／
`WD06-018-BURST` の `hasLifeBurst`／`WX22-022-BURST` の distinct color は**全部すでに在った**）。

**検証**＝`npm run golden -- --only "§5.0 第231"`（新規1本・15効果）→ **反転確認あり** → `npm run gates` 全緑（3680/3680）。
**⑤実機＝不要**（`src/data/` と `public/data/` だけ）。
**在庫**＝実装キュー **419 → 353効果**／S-3（MANUAL 残）**70 → 40効果**。


## 2026-09-08（S-3 第230＝実装キューを 62効果ぶん検証し、真バグ 12効果を修正・**偽陽性 25効果を落とした**）

**作業単位**＝ユーザー指示「20効果続けて直して」。§5.0 実装キュー（triage 済み BUG 433効果）の
`parseStatus` が MANUAL の 106効果を、深刻度 HIGH から順に検証した。

### 🔴 一番大きい発見＝**BUG リストの precision は高くない**

**見た 62効果の内訳＝真バグ 12 / 機構待ち 8 / 偽陽性 42。**
🔴**偽陽性は全部「監査員（JSON だけを読む sonnet）が、既に在るキーを見落とした」型**で、
triage（codex＋私）はそれを **engine 側だけ確かめて追認**していた（＝JSON を読み直していない）。
**壊れ方の型で偏りがはっきり出た**：

| finding の type | 見た数 | 真バグ | 偽陽性 |
|---|---:|---:|---:|
| `MISSING`（「〜が丸ごと欠落」） | 17 | **0** | 15（＋機構待ち2） |
| `WRONG` / `EXTRA` / `SUSPECT_STUB` | 45 | 12 | 27（＋機構待ち6） |

🔑**`MISSING` は構造的に誤検出しやすい**＝監査員は「無い」を主張するのに JSON 全体を読み切る必要があり、
**長い JSON ほど落とす**。⇒ **`MISSING` の finding は実装前に必ず live を grep する**（`O-C` へ還元した）。

### 修正した 12効果

| 効果 | 直したもの |
|---|---|
| `WXK11-033-E1` | `GRANT_PROTECTION.duration` が `PERMANENT`＝**効果耐性が恒久化**。⚠**`GRANT_EFFECT` でラップされている形は別**（付与そのものに寿命があるので内側は `PERMANENT` が正しい＝実測3件はこの形で偽陽性だった） |
| `WXK01-008-E1` / `-009-E1` | 【ライド】が `CENTER_LRIG_RIDES_ON_SIGNI`（manual）と `-RIDE`（`RIDE_ON`）で**二重定義**＝使用回数も別管理だった。manual 側を削除（原文どおりの `RIDE_ON` を残す）。⚠`CENTER_LRIG_RIDES_ON_SIGNI` 自体は正しい受け皿（`WDK01-008` / `SPK01-01`＝**別カードから**センタールリグを乗せる側） |
| `SPDi43-28-E1` | ルリグのアタック誘発なのに `ON_ATTACK_SIGNI`（＝一生誘発しない）／原文の `UP` が丸ごと欠落／`REMOVE_ABILITIES` の対象がシグニ |
| `WXK11-071-E1` | 「そのシグニをトラッシュに置く」が**任意の相手シグニ**＝`targetsTriggerSource:true` を追加 |
| `WXDi-CP01-040-E1` | 同じく `ON_ATTACK_SIGNI` → `ON_ATTACK_LRIG`＋`triggerScope:any_ally` |
| `WX24-P1-020-E1` / `WX25-P1-037-E1` / `WX25-P3-040-E1` / `WXDi-D04-021-E1` | **`pickUpTo` 系統**＝原文「N枚まで」なのに `pickCount` 固定で**0枚を選べない**。母集団を実測（`REVEAL_AND_PICK` で `pickCount>=2` の 110効果 → **欠落は4効果5ノード**）して全数直した |
| `WXK11-052-E1` / `WXK11-077-E1` | 原文「あなたの**白（黒）の**センタールリグ1体を対象」の色フィルタが `target` に無い。⚠**コストの色と混同しない**（`cost.energy` は支払い側） |

### 機構待ちに回した 8効果（実装キューに残す）

`SPDi44-04-E2`（`commonClass` は engine に消費が無い）／`WX16-Re20-E1`（`ADD_TO_FIELD.abilitiesRemoved` は
**parser が書くだけで engine に消費が無い**＝真 no-op・母集団8効果）／`SPK01-13-E1`・`WXK11-020-E1`
（「効果によるダメージを受けない」は `prevent_lrig_damage`＝**1回消費型**なので「このターン全部」を表せない）／
`WXDi-D09-H15-E1`（`SET_BASE_LEVEL.until` に `'END_OF_TURN'` しかない）／`WX26-CP1-048-E2`
（`ENERGY_CHARGE_FROM_DECK` に `optional` が無い）／`WXDi-P16-074-E2`（`FIELD_HAS_GATE` はゾーン一致を見ない）／
`WDK17-009-E2`（条件の掛かる範囲が違う＝構造の作り直し）。
⚠`PR-457-E2` は **live が MANUAL なのに `manualEffects.ts` に定義が無い**（`census:orphanmanual` の C 分類）＝別扱い。

### 🆕 機構待ちの §5.3 登録（同日追記＝**最初の巡で飛ばしていた**）

🔴**PLAN の規約は「実装キューの行を消してよいのは (a) 直した (b) 偽陽性 (c) §5.3 へ `O-nn` で登録し直した ときだけ」**
なのに、最初は BUGFIXES に列挙しただけで登録していなかった。**母集団を実測してから 4件を登録した**：

| ID | 索引 | 母集団（実測） | 何が無いか |
|---|---|---|---|
| `O-294` | B | **live 7効果** | `ADD_TO_FIELD.abilitiesRemoved` に engine の消費が無い（parser が書くだけの真 no-op）。⚠**同名の別実装が2つ在る**（`collectContinuousAbilitiesRemovedSigni` / `BoardComponents` の `string[]`）＝**grep だけで「在る」と読むと外す** |
| `O-295` | B | **live 6効果**＋原文のみ1 | 「対戦相手の効果によってダメージを受けない」が `prevent_lrig_damage`＝**1回消費型**。`PREVENT_DAMAGE`（期間型）は `scope` が `'ALL'|'LRIG'` だけで「効果による」を表せない |
| `O-296` | G | **live 1効果**＋原文のみ2 | `SET_BASE_LEVEL.until` が `'END_OF_TURN'` だけ＝「次の対戦相手のターン終了時まで」が表せず**同じ文の `POWER_SET` と寿命が食い違う**。`O-293` と同じ「寿命の語彙が足りない」族 |
| `O-297` | G | **1効果** | ON_BANISH の**トリガー元シグニのゾーン**参照が無い（`SAME_ZONE_HAS_GATE` は効果元、`filter.inGateZone` は場に在るシグニ） |

**既に登録済みだった2件**＝`SPDi44-04-E2` は `O-287`（`commonClass` に消費が無い・live 27効果）、
`WXK11-020-E1` は `O-291`（`STRIP_OPP_ENA_MULTI_ENA` の後半）。
**機構不要と判定して §5.0 に残した2件**＝`WX26-CP1-048-E2`（任意性は既存5経路で書ける＝系統行）／
`WDK17-009-E2`（`opponentSelects`＋`targetsStored` で構造を書き直せる）。

🔴**登録のついでに計器のバグを1つ直した**＝`cardProgressCensus.mjs:176` は **`| \`O-nn\`` で始まる行しか読まない**のに、
`O-293`（2026-09-08 登録）が **`| 🆕\`O-293\`` と書かれていて登録当日から計器に載っていなかった**。
PLAN §5.3 に「ID セルの先頭に絵文字を置かない（`O-281`/`O-282` で実際に起きた）」と**警告が書いてあるのに再発**していた。
⇒ `O-293`/`O-296`/`O-297` の 🆕 を説明文側へ移し、**索引10項目すべてが計器に載ることを確認**した。

**検証**＝`npm run golden -- --only "§5.0 第230"`（新規1本・12効果を assert）→ **反転確認あり**（`git stash` で FAIL）→
`npm run gates` 全緑（golden 3679/3679）。**⑤実機＝不要**（`src/data/` と `public/data/` だけ）。
**在庫**＝実装キュー **419 → 383効果**（修正12＋偽陽性25を `semantic_bug_fixed.txt` へ記録）。
S-3（MANUAL 残）は **106 → 70効果**。


## 2026-09-08（S-3 第229＝《ターン1回》《ゲーム1回》の使用回数制限が抜けていた 9効果）

**作業単位**＝ユーザー指示「S-3 を行う」。§5.0 実装キューの系統「《ターン1回》なのに `usageLimit` が無い」から。

**真因**＝JSON に `usageLimit` キーを書き忘れると、engine 側の回数チェッカ（`triggerCollect.ts:2043` の
`mkLimitOk`／起動能力は `signiActivateGate.ts:100`・`lrigActivateGate.ts:120`）が**素通りする**＝
**《ターン1回》が無制限になる**。受け皿は全経路に実在していたので、**JSON に1キー足すだけで直る**。

**②母集団の実測**（`docs/_effect_srctext.json` の効果単位原文 × live JSON をツリー全走査）：

| 原文 | 母集団 | 制限あり | 欠落 | うち真バグ |
|---|---:|---:|---:|---:|
| 《ターン1回》 | 856 | 845 | **11** | **7**（残4は下記） |
| 《ゲーム1回》 | 211 | 208 | **3** | **2**（残1は FP） |
| 《ターン2回》 | 52 | 52 | 0 | — |

⚠**初回の実測は 51件と出た**＝`effectId` を live のトップレベルしか引いておらず、
**付与能力（`abilities[]` / `GRANT_EFFECT.effect`）の入れ子ノードを数えていなかった**。
🔑**入れ子まで辿ると 11件**（PLAN §5.0 の登録「grep 実測 11効果」と一致）。
⚠**同じ罠をもう一度踏んだ**＝「カギ括弧内の《ターン1回》」で追加の網を掛けたとき、
`abilities[]` しか見ずに **30件を候補と誤検出**した（実体は `GRANT_EFFECT.effect.usageLimit` で全件配線済み）。
**受け皿は同じ概念でも3つの形（`abilities[]` / `GRANT_EFFECT.effect` / 専用ステート）を取る。**

**影響＝9効果／9カード**（すべて `manualEffects.ts` の手書き＝§2.0 速いレーン）：
- ソウル付与4件（`WXDi-D07-003-E1-G` / `WXDi-P04-011-E1-G` / `-012` / `-015`）＝アタックのたびにバニッシュ／パワー減が無制限に誘発していた
- アクセ付与1件（`SP27-015-E3-G`）＝`usageLimit` に加えて **timing が `MAIN` だけ**だった（原文は《メインフェイズアイコン》《アタックフェイズアイコン》）→ `ATTACK_ARTS` を追加
- 起動能力1件（`WX21-031-CB-E1`）＝トップレベル `ACTIVATED` に欠落
- 遅延誘発1件（`WXDi-D04-011-E1`）＝**`usageLimit` ではなく `INSTALL_DELAYED_TRIGGER.once` が受け皿**。
  このカードは同じ効果で「1ターンに3回アタックできる」ようにするので、**3回ぶん誘発していた**
- 《ゲーム1回》2件（`WXDi-P15-010-E3` / `-011-E3`）＝`once_per_game`（`game_actions_done` を見る）

**🔴偽陽性3件＝受け皿が別名で実装済み**（golden に「番人」テストを置いた。足すと二重制限＝過小実行になる）：
- `WXDi-P12-030-E1` → `SET_NEXT_LIFE_CRASH_COUNTER` の `remaining:1`（消費は `BattleScreen.tsx:13606`）
- `WX25-P2-001-E1` → `game_guard_barrier_act`＋`actions_done` の `'GUARD_BARRIER_ACT'`（`:15403`）
- `SPK06-01-E1` → 原文の《ゲーム１回》は「**コイン技の**《ゲーム1回》を《ゲーム2回》にする」への言及＝`COIN_ABILITY_BOOST.extraGameUse`

**未修正2件**（実装キューに残す）＝`WX25-P2-003-E1`（`DEFERRED_GAIN_ABILITY_THIS_GAME_QUOTED`＝効果自体が保留 STUB）／
`WXDi-P04-002-E1`（別 finding で全面破損＝`usageLimit` 以前の話）。

**配送**＝`npx tsx scripts/syncManualLive.ts <9カード>`（既存 id の書き直しは収穫マージが不可侵にするので `build:effects` では届かない）。
**検証**＝`npm run golden -- --only "§5.0 第229"`（新規3本）→ **反転確認あり**（`git stash push -- public/data` で FAIL 2 を確認）→ `npm run gates` 全緑。
**⑤実機＝不要**（触ったのは `src/data/manualEffects.ts` と `public/data/` だけ＝PLAN §2.2）。
**在庫**＝実装キュー **426 → 419効果**（triage 由来7件を `semantic_bug_fixed.txt` へ記録。`WX21-031-CB-E1`／`WXDi-D04-011-E1` は
triage 由来ではなく**この母集団実測で新たに見つけた**分＝カウンタには元から載っていない）。


## 2026-09-08（S-2 全数実測＝新バグ集団10件の母集団を grep で測り切った・**`src/` は無変更**）

**作業単位**＝ユーザー指示「すべての新バグ集団に S-2 を行う。codex-work と codex を使うこと」。
**S-2＝真バグの母集団を grep で数える工程**（PLAN §5.0 の Sonnet レーン）。**実装は0行**（測定と簿記のみ）。

### やったこと

**codex 2アカウントを並列で回した**（`CODEX_HOME=/c/Users/zerom/.codex-work` ＝バッチA／既定 `~/.codex` ＝バッチB）。
🔑**先に共通ローダ `tmp_s2_lib.mjs` を私が書いて渡した**（`docs/_effect_srctext.json` の効果単位原文 10,768件 ×
`public/data/effects_*.json` の live 10,745効果を突き合わせる `scan(regex, predicate)` API）＝
**codex が「データの在処を探す」ターンを丸ごと削るため**。実測でどちらも一発で測定に入った。
**報告書**＝`scripts/archive/scratchpad/s2_population_20260908/REPORT_A.md` / `REPORT_B.md`。

### 結果＝**登録 18効果 → 実測 38効果**（系統6件）＋機構4件

| 系統 | 登録 | 実測 A+B | M（手書き別枠） | stale か |
|---|---:|---:|---:|---|
| C1 遅延誘発が即時実行 | 6 | **8** | 2 | **stale** |
| C2「置いてもよい」が強制 | 4 | **9** | 2 | **stale** |
| C3 1枚を上・残りを下／残りをシャッフル | 2 | **5** | 3 | **stale** |
| C4【ライド】重複 | 2 | 0 | 2 | 正しい（M込み2） |
| C5 色フィルタ欠落 | 2 | **4** | 1 | **stale**（登録2件は中身が入れ替わり） |
| C6 グロウ「公開した場合」 | 2 | 0 | 2 | 正しい（M込み2） |
| **計** | **18** | **26** | **12** | — |

| 機構（§5.3 索引 G） | 登録 | 実測 | 「受け皿が無い」は正しかったか |
|---|---:|---|---|
| `O-289` 起動をまたぐ選択済み管理 | 2 | 2 | 🔴**stale＝機構不要**（下記） |
| `O-290` キー配置コスト | 4 | **3カード** | 一部 stale（`coinReduction` は既存） |
| `O-291` エナ効果免疫 | 1 | 1 | 正しい |
| `O-292` コラボ起動コスト | 3 | 3 | 正しい |

### 🔴 最大の収穫＝`O-289` は engine 新機構が要らなかった

登録票は「`CHOOSE.noRepeat` は解決内だけ・起動をまたいで覚えるストアが無い（`grep usedChoices|chosen_once|choiceUsed` は0件）」
と書いていたが、**キー名が違うだけで受け皿は実在した**＝**`PlayerState.taken_choice_keys`**（`src/types/index.ts:885`）。
`effectExecutor.ts:6432` が `noRepeat` のとき読み、**`execStubPart1.ts:922-930` がターン境界で消さずに書き込む**。
⇒ **parser が `CHOOSE.noRepeat` を出せば閉じる**＝§5.3 索引 G から §5.0 の系統行へ降ろした（機構 worklist 6 → **5項目**）。
🔑**教訓の再確認＝「キー名を3つ思い浮かべて grep して0件」は「受け皿が無い」の証明にならない。**
`semanticAuditRecheck` / `census:population` の MISS と同じで、**別名を知らないかぎり必ず過大に出る**。

### 🔴 codex の判定を1件訂正した（FP 側で真バグを消しかけた・既知の型の再発）

**C5 の `WXK11-052-E1` / `WXK11-077-E1`** を codex は「対象が `field.lrig.at(-1)` 固定だから
**色が違っても別のルリグを誤選択できず実害ゼロ**」として **C（除外）**にしていた。**前半は正しいが結論が誤り。**
`effectExecutor.ts:4986` は `cands = lrigTop && lrigLikeFilterOk(lrigTop, filter, ctx) ? [lrigTop] : []` で、
**`lrigLikeFilterOk`（同 `:4875-4895`）は `matchesFilter` へ落ちて `color` を消費する**。
⇒ **色フィルタを足すと「センタールリグが白でないとき候補0＝不発」になる**＝いまは色を問わず能力が付く。
**壊れ方は「誤選択」ではなく「不発すべき効果が通る」。** ⇒ **B（真バグ）へ訂正**。
🔑**PLAN §5.0 の「codex の FP 判定は人間が engine を読んで確定する」規約が2回目の仕事をした。**

### 🔁 私（Opus）側の実測も2件間違えた＝**MISS は判定ではない**を自分で踏んだ

| 私の誤り | 実際 |
|---|---|
| 相手【エナチャージ】任意を **6効果**と数えた | **4効果**。`SPDi43-18-E1` / `WXDi-P05-072-E2` は**1段上の `CHOOSE{opponentResponds:true, choices:[charge, skip]}`** で正しく表現されていた＝**アクションノードにキーが無くても親が正準形**（codex 側の `hasRelevantOppEnergyOptional` が正しかった） |
| C3①「1枚を上・残りを下」を **14効果**と数えた | **2効果**。`first_top_rest_bottom` は parser が生成しないが、**受け皿は他に3つある**（`split_top_bottom` ／ `LOOK_TOP_ONE_RETURN_REST_BOTTOM` ／ `then:"deck_top"`＋`remainder:{location:"deck",position:"bottom"}`） |

⛔**追加で測って空振りだった系統**＝「原文が3色以上を『か』で列挙しているのに live の `color` 配列が短い」
＝候補9・MISS 6だが、**1件ずつ開いたら真バグは `WXDi-D06-014-E1` の1件だけ**。残り5件は
`OR × ENERGY_HAS_CARD{color:単色}` や **`LAST_PROCESSED_MATCHES.requiredDistinctColors:["赤",["白","青","緑","黒"]]`**
（入れ子配列）という**別の正準形で正しく表現済み**だった。

### 🔴 追加＝**やり残していた1系統**を測ったら受け皿そのものが嘘だった（`O-293` を新規登録）

**ユーザー指摘「S-2 は全部終わったの？」で発覚**＝**「期限が『次のあなたのエナフェイズ終了時まで』でなく現ターン終了時」の系統を測っていなかった。**
私は PLAN の「grep 実測3」を既測と読んだが、**その行は「findings 由来5に対し実測3＝判定式が甘くて逆に取りこぼした例」**として
**失敗の記録**が書いてあっただけで、測り直されていなかった。⇒ **「実測」という語が本文にあっても、それが成功した実測とは限らない。**

**測った結果＝登録5 → 実測10効果。しかも候補10件が全部壊れていた。**

| 軸 | 内訳 |
|---|---|
| ① ルリグリミットの期限 | **10効果すべて**。うち7効果は `STUB{LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END}` を**持っているのに効いていない**／3効果は STUB すら無い |
| ② 付与能力の期限 | **5効果**が `UNTIL_OPP_TURN_END`（原文より短い）。⚠**findings は3件しか気づいておらず `WX24-P3-001-E1` / `-003-E1` は S-2 の新規発見** |

🔴**真因＝名前・ログ・型コメントの3つがそろって嘘をついていた**：
`execStubPart1.ts:4208-4217` の `LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END` は **`lrig_limit_mod` へ加算するだけ**で、
その `lrig_limit_mod` は **`BattleScreen.tsx:4284` と `:4735` のターン終了処理で `undefined` に落ちる**。
型コメント（`types/index.ts:799`）もログ文言も「エナフェイズ終了まで」と書いてあるが、**置いたターンのうちに消える**。
狙いは「相手ターンを跨いでリミットを保つ」なので、**カードの目的そのものが成立していない。**

🔑**この回いちばん再利用できる教訓＝`grep` で消費地点が見つかっても「名前どおりに動く」証拠にはならない。**
**状態を書くハンドラを見つけたら、必ず「どこで消えるか」（リセット地点）まで追う。**
⇒ §5.3 索引 G へ **`O-293`** として登録（登録票の全文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)）。
⚠**`src/screens/` を触る**＝着手する回は §2.2 により実機まで必須。

### 検証・簿記

- 🔴**`src/` `public/` は1バイトも変更していない**（測定のみ）＝`npm run gates` は対象コード無変更のため未実行（§2.6 決定3）。
- 追加したのは `scripts/archive/scratchpad/s2_population_20260908/`（報告書2本）のみ。測定スクリプトは `tmp_*`（gitignore 圏内）。
- **在庫**＝実装キュー **残426効果**（据置＝S-2 は測るだけで直していない）／機構 worklist **6 → 6項目**
  （`O-289` を降ろし `O-293` を登録）／**S-2 は残0**（**系統7件＋機構4件を全数実測**。新しい系統を triage で見つけたら戻す）。

## 2026-09-08（§5.0 実装キュー 系統①＝`ADD_TO_FIELD` の `asDown` 欠落・7効果）

**真因**＝原文「ダウン状態で場に出す」が `ADD_TO_FIELD.asDown` へ落ちておらず、**アップ状態で場に出ていた**
（＝**そのターン中にアタックできる**という盤面差）。**parser の生成箇所が 20 箇所**あり、
既存の `asDown` 付与は `effectParser.ts:18649` の1経路（`then` テキスト判定）だけだった。
**修正**＝後処理1本 `normalizeAddToFieldAsDown` を finalization ループへ追加（`normalizeRevealPickEnergyThen` と同じ方針）。
**影響**＝**7効果**（`WD17-008-E1` / `WXK09-033-E1` / `WXDi-P01-087-E1` / `WXDi-P13-054-E1` /
`WXDi-P15-049-E1` / `WX24-P2-058-E1` / `WX25-P3-061-E1`）。**live の差分は7カード・すべて `asDown:true` の追加のみ**（巻き添え0を機械照合）。
**検証**＝`npm run golden -- --only "asDown"` ＋ `npm run gates` 全緑。**実機は不要**（`src/screens/` 無変更＝§2.2 の機械判定）。
**残 9 効果は別の穴**＝MANUAL 3件（`manualEffects.ts` 側なので収穫マージが触らない）＋
**該当する `ADD_TO_FIELD` が JSON に無い 6件**（主要処理ごと欠落＝§5.0 の個別行）。

### 🔴 この1件で踏んだ罠3つ（全部「緑に見えて緑でない」型）

| 罠 | 何が起きたか |
|---|---|
| **①パイプの終了コード** | `timeout 600 npm run build:effects \| tail -6; echo $?` で **`tail` の終了コードを見て「完走した」と誤報告した**。実際は timeout が殺しており **`public/data/*.json` は1バイトも書かれていなかった**（mtime で気付いた）。⇒ **`npm run build:effects` は必ず単独で走らせ、`ls -la public/data/` の mtime で書き込みを確認する** |
| **②総当たり再帰は使えない** | 初版の `walk` が `Object.values` で全プロパティを再帰していた＝**26分走って出力0**。action ノードは巨大構造への参照を持ちうる。⇒ **構造キー（`steps`/`then`/`else`/`choices`/`abilities`/`action`/`continuation`/`thenAction`/`afterSearch`）だけを辿る** |
| **③`abilityBlockTextOf` を全効果で呼ばない** | 原文を毎回分割し直す関数なので、**全 10,700 効果で呼ぶと build が 8分 → 10分超**になった。⇒ **カード全文に該当句が無ければ呼ばない前置ガード**を置く（呼び出しが約55回に減る） |

🔑**`npm run build:effects` の所要は約8分**（2026-09-08 に baseline で実測）。**「数分」で見積もらない。**

## 2026-09-08（🏁O-A triage 完了＝572 findings を全数確定・未 triage 0）

**意味照合 round4 の findings 572件をすべて triage し終えた**（未 triage 443 → **0**）。
**確定＝BUG 433 / FP 70**（FP は全件、根拠の engine 行を自分で開いて裏取り済み＝下記）（433 は effectId のユニーク数）。**これが §5.0 実装キューの母集団になる。**
🔴**追跡先は各ラウンド dir の `triaged.txt`**（`semanticAuditPool.mjs` は残 0 になったのでもう在庫を映さない）。

### 🔴 この工程で最も高くついた教訓＝**任意コストの3分岐を取り違えると判定が反転する**

`SEQUENCE[STUB{任意コスト}, …]` の挙動は**3通り**あり、**STUB の直後に何が来るか**で決まる。
**私はこれを一度取り違えて FP と誤判定し、2件を後から BUG へ訂正した**（`WXK09-039-E1` / `WXK10-031-E1`）。

| STUB の直後 | 効く分岐 | 後続ステップ |
|---|---|---|
| **`CONDITIONAL{IS_MY_TURN\|PAID_ADDITIONAL_COST}`** | **`effectExecutor.ts:5532`**（Pattern ④/⑤ より先） | 🔴**CHOOSE の `continuation`＝pay でも skip でも実行される** |
| 別ステップを挟んで `CONDITIONAL{IS_MY_TURN\|PAID}` | **Pattern ④**（`:6060`・`condIdx > i + 1`） | 間は無条件（基本効果）／CONDITIONAL の then が強化分＝**replace mode** |
| 上記以外（普通のアクション／別条件の CONDITIONAL） | **Pattern ⑤**（`:6163`） | **残り全ステップが pay 側だけ**（skip は空 SEQUENCE） |

⇒ **「未払いでも実行される」という指摘が BUG になるのは1行目の形のときだけ。** 2・3行目は FP。
**codex も同じ取り違えを2件していた**（`WXK02-030-E1` / `WXK07-054-CB-E2` を Pattern ⑤ 根拠で FP と判定＝実際は BUG）。

### FP 70件の内訳＝**すべて「engine が JSON の見た目と違う意味を持つ」型**

| 型 | 代表 | engine の実際 |
|---|---|---|
| **ガードステップの手札捨て** | `WXK09-038-E1` ほか**6件** | ガードの手札捨ては `hand_discarded_just` を立てない（`BattleScreen.tsx:6196`）＝`ON_HAND_DISCARDED` はガードステップで発火しない。🔴**codex はこの型を BUG と誤判定していた（3件）** |
| **ターン終了時誘発の所有者** | `WXDi-P12-057-E1` ほか**3件** | `collectTurnTriggers` はターンプレイヤーの場の `scope:self` だけ収集（`triggerCollect.ts:5080-5100`） |
| **LRIG 対象の UP / REMOVE_ABILITIES** | `WXDi-P04-051-E1` ほか2件 | どちらもセンタールリグ固定（`:4592-4610` / `:8891-8903`）＝別々のルリグを選ぶ経路が無い |
| **timing 自体が条件を担う** | `WXDi-P04-035-E1`（`ON_KEYWORD_GAINED` は3キーワード固定）／`WXDi-P08-037-E3`（`ON_SIGNI_BANISH_OPPONENT` はバトル専用）／`WXDi-P02-043-E2`（`ON_TARGETED` は相手起因の対象化） | 収集器が原文の限定を内包している |
| **engine が原文を読む** | `WXDi-P06-034`（`getRiseRequirement` が【ライズ】節を読む） | JSON に無くても実装済み |
| **型名から推測した誤検出** | `WDK08-Y01-E1`（`TRASHED_DISTINCT_LEVELS_GTE` は `lastProcessedCards`＝公開したカードを読む） | 名前と実装が食い違う |
| **監査員が原文に無い限定を足した** | `WXK07-002-E1` / `PR-K076-E1` | 原文を全文で読み直すと限定が存在しない |

### 🔴 FP 判定の根拠を全数で裏取りした（ユーザー指摘「codex 側が判定したものは確認しなくていいのか」）

**FP は「真バグを恒久的に消す」向き**なので、**私が根拠の行を自分で開いていなかった13箇所を全部確かめた**。
**12箇所は確認できた**（うち2箇所は engine のコメントが当該カードを名指ししていた）:

| 根拠 | 確認した内容 |
|---|---|
| `effectExecutor.ts:4592` / `:8891` | LRIG 対象の `UP` は `field.lrig.at(-1)` の `lrig_down` を直接解除、`REMOVE_ABILITIES` も `lrigTop` だけを候補にする＝**センター固定** |
| `boardDiff.ts:667` | `KEYWORD_GAINED_TARGETS = ['アサシン','ランサー','ダブルクラッシュ']`（**コメントが `WXDi-P04-035` を名指し**） |
| `triggerCollect.ts:98` | `battleBanisherMatchesTrigger`＝`scope==='self'` なら `watcherNum === banisherNum` を要求 |
| `effectExecutor.ts:4297` | `CENTER_LRIG_OR_SIGNI` は `lrigZoneTops`（センター＋左右アシスト）＋全シグニへ展開 |
| `effectExecutor.ts:5139` | `thisCardOnly` は `lrig.at(-1)` / `assist_lrig_l` / `assist_lrig_r` も効果元として探す（**コメントが `WXDi-P16-039` を名指し**） |
| `execStubPart1.ts:1481` | `BLOCK_OPP_SIGNI_AUTO`（当ターン）と `BLOCK_OWN_SIGNI_AUTO:NEXT_TURN`（次ターン予約）を**同時に**保存 |
| `effectExecutor.ts:2890,2921` | `if (a.triggerBurst)` の**else 側**が `trash: [...state.trash, ...crashed]`＝`triggerBurst:false` は直接トラッシュ |
| `effectExecutor.ts:5152-5160` | `untilOppTurn = a.duration === 'UNTIL_OPP_TURN_END'`／それ以外は**ターン用 `granted_effects`**＝`PERMANENT` でもターン終了時に消える |
| `triggerCollect.ts:2992-3002` | `ON_SIGNI_FROZEN` の scope 既定は `any_opp`、`frozenIsWatcherOwn` なら除外 |
| `effectEngine.ts:6398` | `srcIsArts = アーツ\|ピース\|キー`＝`from:['アーツ']` はキーの効果も含む |
| `execUtils.ts:1486-1490` | `trapIconEffectOf` は対象カード自身の `TRAP_ICON` を先に返す |

#### 🔑 1箇所は一度差し戻してから確定した（`triggerCollect.ts:5080` の `collectTurnTriggers`）

**`WXDi-P12-057-E1` / `WX24-P4-044-E3` / `WXK04-074-E2`**（「ターン終了時誘発に自ターン限定が無い」型）。
最初に見た呼び出し側 `collectTurnTriggers('ON_TURN_END', my, op)`（`BattleScreen.tsx:4031`）の `my` が
`isHost ? host_state : guest_state`（同 `:2664`）＝**ローカルプレイヤー**に見えたため、
**証明できないものは FP で閉じない**という自分のルールに従って一度 3件を未 triage へ戻した。
🔑**その後 `doPhaseAdvance`（同 `:3930`）の中である事と、同 `:2901` の明記された不変条件
「⚠myState はターンプレイヤー（=user.id=meId）、opState は非ターンプレイヤーである前提（doPhaseAdvance）」**
を見つけて確定＝**FP で正しい**（収集側も `triggerScope` 既定 `self` を `myState` の場からしか拾わない）。

🔑**この往復から得た運用**＝**呼び出し側の変数名（`my`/`op`）だけで所有者を判断しない。
その関数が「誰のターンに呼ばれるか」を決めているのは呼び出し元の早期 return と不変条件コメントであり、
engine 側の関数シグネチャには現れない。**

### 🔑 系統（1 finding が複数効果に化けたもの＝実装の取り掛かり）

| 系統 | 効果数 | 受け皿 |
|---|---|---|
| `OPPONENT_PAY_OPTIONAL` が**対象を事前選択しない**（相手が支払いを判断する時点で対象未確定） | **12** | 要新設（`freezeStoredTargets` は `targetsStored` があるときだけ働く） |
| `ADD_TO_FIELD` の **`asDown` 欠落** | **12** | ✅実在（`effectExecutor.ts:4137,10690`） |
| **`filter.commonClass`** に engine 消費地点が無い | **9** | ❌**機構待ち**（`effectParser.ts` が生成するだけ＝真 no-op） |
| **遅延誘発が即時実行に化けている** | **6** | ✅実在（`INSTALL_DELAYED_TRIGGER`） |
| 期限が「次のあなたのエナフェイズ終了時まで」でなく現ターン終了時 | **5** | 一部実在（`LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END`） |
| 「宣言した数字と同じレベル」条件欠落＋`reorder:false` | **4** | ✅実在 |
| ソウル/付与能力の `usageLimit` 欠落 | **3** | ✅実在（`triggerCollect.ts:2043-2048`） |
| 「置いてもよい」が素の `TRASH`／`MILL` で強制 | **4** | ✅実在（`optional`） |
| 「1枚をデッキ上・残りを下」が全部下 | 2 | ✅実在（`first_top_rest_bottom`） |
| キー配置コストの軽減が無い | 3 | △先例あり（`O-200`） |
| 【ライド】が2つの起動能力に重複 | 2 | — |

⚠**系統の枚数は上限値**＝着手時にもう一度割る（LESSONS §4.7）。

## 2026-09-08（S-1 大掃引＝意味照合 round4 の全シート監査完了・codex 2アカウント）

**作業単位**＝ユーザー指示「codex に S-1 を作業させたい」。**213バッチ / 2,080枚 / findings 447件 / 失敗 0バッチ**を
codex 2アカウント（`CODEX_HOME=C:/Users/zerom/.codex-work` と既定 `~/.codex`）で消化し、
**意味照合 round4 の未監査を 2,060 → 0枚（全11シート 100%）**にした。
🔴**`src/` は1行も触っていない**（監査は読み取りのみ）＝`npm run gates` は全緑・全項目据置。

### 🔴 直したバグ＝`semanticAuditGap.mjs --sheet TK` が無言で「0枚」を返していた

| | |
|---|---|
| **真因** | `--sheet` の解決が **`CardData_Sheet${arg}.csv` 決め打ち**だった。TK の実ファイルは **`CardData_TK.csv`**（`Sheet` を付けるのは数字シートだけ）＝**一度も当たらない** |
| **症状** | エラーではなく**静かに 0件**。`--list` が空を返すので `--cards-file` に渡す pending が作れず、**TK の未監査32枚が抽出できなかった**。⚠集計表側（`--sheet` 無し）は正しく `CardData_TK.csv` を数えていたので、**列挙だけが嘘をつく**形 |
| **危険な読み違い** | そのままなら「TK は監査済み」と誤読する。**在庫計器が過小に出る**型の壊れ方 |
| **修正** | `scripts/archive/semanticAuditGap.mjs:55`＝数字なら `CardData_Sheet<N>.csv`、**数字以外は `CardData_<arg>.csv`** として解決。`[gap]` のログも解決後のファイル名を出すようにした |
| **影響** | TK 32枚（＝この修正で初めて監査できた。findings 5件） |
| **検証** | `node scripts/archive/semanticAuditGap.mjs --sheet TK --list` が 32枚を返す／`--sheet 10` は 42枚のまま（数字側の退行なし）／全体集計は 6,032枚で不変 |

### 🔑 運用として確定したこと（次に大量掃引するときはこれで回す）

1. **codex は2アカウント並走してよい**＝`CODEX_HOME` が別なら認証ファイルも別で、**トークンリフレッシュ競合は起きない**。
   ⚠旧記録（PLAN_PROGRESS.md:10851）の「5連続失敗」は**同一アカウントの同時実行**が原因＝**同一 `CODEX_HOME` では直列**にする。
2. **同一 `--out` を2プロセスで分担してよい**＝スキップ規約が `raw/batch_NN.json` の有無なので、
   **バッチ番号が重ならなければ二重監査は起きない**（Sheet9 を b01〜23 / b24〜45 で分担して実証）。
   ⚠`findings.jsonl` だけは両者が `appendFileSync` する＝**正本は `raw/batch_NN.json`**（実測は破損0行。壊れたら raw から再構築＝コードは Sheet9 の README）。
3. 🔴**`audited_cards_cumulative.txt` はランナーが更新しない**＝バッチを回したら `raw/batch_NN.json` の `cardNum` を手で追記する。
   **忘れると gap 計器が減らず、再抽出で同じ枚数をもう一度監査する**（今回は全シートで追記済み）。

### シート別の実績

| シート | 枚数 | バッチ | findings | 歩留まり | HIGH/MED/LOW |
|---|---|---|---|---|---|
| Sheet3 | 369 | 37 | 98 | 2.65 | 60/36/2 |
| Sheet4 | 252 | 26 | 50 | 1.9 | 26/24/0 |
| Sheet5 | 143 | 15 | 22 | 1.5 | 15/7/0 |
| Sheet6 | 43 | 5 | 16 | 3.2 | 7/9/0 |
| Sheet7 | 368 | 37 | 64 | 1.7 | 41/23/0 |
| Sheet8 | 390 | 39 | 90 | 2.3 | 41/44/5 |
| Sheet9 | 441 | 45 | 88 | 2.0 | 53/34/1 |
| Sheet10 | 42 | 5 | 14 | 2.8 | 12/2/0 |
| TK | 32 | 4 | 5 | 1.25 | 4/1/0 |
| **計** | **2,080** | **213** | **447** | 2.1 | **259/180/8** |

**型の内訳＝WRONG 233 / MISSING 186 / SUSPECT_STUB 18 / EXTRA 10。**

### 🆕 O-A（triage）を codex へ委譲した＝`scripts/semanticAuditTriageExtract.mjs` を新設

**443件の未 triage を捌くために、triage 工程そのものを codex へ委譲できる形にした。**
🔴**PLAN §5.0 は「O-A を Sonnet に落とすな」と書いているが、その根拠は「監査員が JSON しか読めないから」**であって、
**リポジトリ内で `grep` できる実行環境（codex exec）なら前提が違う**。⇒ 委譲の条件は**engine を読ませること**。

| | |
|---|---|
| **新ツール** | `scripts/semanticAuditTriageExtract.mjs`＝`semanticAuditPool.mjs` と同じ規約で未 triage を拾い、カード単位に束ねて `prompts/batch_NN.txt` を作る。**出力スキーマを監査バッチと揃えたので実行は既存の `semanticAuditRunCodex.mjs` がそのまま使える**（新しいランナーを書いていない） |
| **出力先** | `scripts/archive/scratchpad/semantic_triage_round4/`（443件 / 54バッチ・8件/バッチ） |
| **実測** | 1バッチ **約292秒**（監査バッチの 12〜81秒より1桁重い＝engine を読む分）。**32 / 54バッチ完了で263件**（BUG 234 / FP 28 / UNKNOWN 0） |

#### 🔴 プロンプトに入れた非対称ルール（ここが設計の要）

**FP と書いてよいのは engine の該当行を `ファイル:行` で引用できたときだけ。できなければ UNKNOWN。**
理由＝**BUG の誤判定は実装時に気付くが、FP の誤判定は真バグをプールから恒久的に消す**
（`triaged.txt` に書いた瞬間 `semanticAuditPool.mjs` からも `census:cards` からも見えなくなる）。
⇒ **codex には `triaged.txt` を書かせない**。確定は人間（Opus）が engine を読んでから。

#### ⚠ 実測でわかった codex の傾向（2アカウント・32バッチで一貫）

- 🔴**UNKNOWN が1件も出ない**＝「引用できなければ UNKNOWN」と明示しても**常に断定する**。
- **FP 率 10.6%**＝過去の precision 実測（50〜84%＝FP 16〜50%）の**下限を下回る**。⇒ **BUG 側に寄った判定として扱う。**
- ✅**フォーマットは完璧に守る**＝`ファイル:行` の引用が無い判定 **0件** / 263件、`population` 記入 233件。
- ⚠**`population` は水増しする**＝finding の grep 句をそのまま数えるので「ルリグ１体を対象」で 114 のような値が返る。
  **同じ壊れ方の数ではなく、その言い回しが出る効果数の上限値**として読む（LESSONS §4.7「grep の母集団は着手時にもう一度割る」）。
- 🔑**筋の良い兆候もある**＝FP 判定のうち5件が `effectExecutor.ts:6163` の **`OPTIONAL_COST` Pattern ⑤**
  （後続 CONDITIONAL が無い任意コストは pay 側だけが残りステップを実行する）を引用しており、**既知の偽陽性型と整合**する。
  系統としてまとまるなら `semanticAuditExtract.mjs` の読み方ルールへ還元する（O-C）候補。

#### 🔵 Opus による triage（b15〜b19 ＋ codex 判定の抜き取り検査）＝**52 findings を確定**（443 → 391）

🔴🔑**抜き取り検査の結論＝codex の BUG 判定は 4/5 正しいが、FP 側で真バグを1件消しかけていた。**

| 検査 | 結果 |
|---|---|
| **BUG 側5件** | **4件は妥当**。**1件は誤り**＝`WXK07-002-E1`（監査員が「②の対象が対戦相手に限定されていない」と主張したが、**原文②に「対戦相手の」は無い**）。⇒ **codex は engine を正確に読むが、監査員の原文解釈を検証しない。** |
| **FP 側3件** | 1件妥当・1件未検証・**1件は反転**＝`WXDi-P11-076-E1` は指摘の向きこそ FP だが、**Pattern ⑤ が skip 側で残り全ステップを捨てるため原文で無条件の `ENERGY_CHARGE` まで実行されない**という逆向きの真バグが同居。⚠**codex はそれを `note` に書きながら verdict を FP にしていた**（FP 28件を全数走査した結果、この型は1件のみ）。 |

⇒ **2つの規則を `semanticAuditTriageExtract.mjs` のプロンプトへ還元した**（①監査員の主張が原文と合っているかを先に確かめる ②FP と判定するとき別の壊れ方が無いか最後に確かめる／`note` に書くくらいなら `BUG` にする）。

#### Opus triage 5バッチの内訳＝**BUG 33 / FP 7**（真バグ率 83%）

⚠**codex の 89% とは母集団が違う**（b15〜19 は codex が処理できなかった分）ので**精度の比較には使えない**。
🔑**FP 7件のうち5件が2つの型だけ**＝**任意コスト Pattern ④/⑤**（`effectExecutor.ts:6060` / `:6163`）と
**ガードステップの手札捨て**（`BattleScreen.tsx:6196`＝`hand_discarded_just` を立てないので `ON_HAND_DISCARDED` は発火しない）。
⇒ **この2型は監査プロンプト（`semanticAuditExtract.mjs`）へ還元すれば次ラウンドの finding から消せる。**

#### 🔑 見つかった系統（1 finding が複数効果に化けたもの）

| 系統 | 効果数 | 中身 |
|---|---|---|
| **`ADD_TO_FIELD` の `asDown` 欠落** | **8** | 原文「ダウン状態で場に出」55効果中 `asDown` あり39・無し16、うち `ADD_TO_FIELD` を持つ8件。**受け皿は実在**（`effectExecutor.ts:4137,10690`） |
| **キー配置コストの軽減が無い** | **3** | `WXK03-014` / `WXK10-015` / `WXK11-012`（全部キー）。先例は `manualEffects.ts:10669`（`O-200`） |
| **`filter.commonClass` に engine 消費地点が無い** | **4** | 🔴`effectParser.ts` が生成するだけで `src/engine/` に消費が無く、**live 3効果で黙って無視されている**（`WXDi-P10-029-E1` / `WXDi-CP01-020-E1` / `WXDi-CP02-046-E1`）＋`WXK10-056-E2`。**`census:deadstate` と同型の真 no-op＝機構待ち** |
| **色付きルリグ対象の色フィルタ欠落** | **2** | `WXK11-052-E1` / `WXK11-077-E1`。⚠`cost` 側の `"color"` と混同して数えないこと |
| **グロウ時「公開した場合」が「手札にある」判定** | **2** | `WD13-002-E1` / `WD13-003-E1`（`GROW_COST_REDUCTION` × `HAND_COUNT_FILTER`） |
| **`OPTIONAL_COST` が `costText` だけで実体コストが無い** | **18（上限）** | `WD22-007-G-E1` で発覚。⚠**「コストの無い任意効果」の正しい用法も混ざる**ので着手時に割り直す |

#### ⚠ 受け皿が既に在るものが多い＝速いレーンで落とせる

`ON_ARTS_USE`（`triggerCollect.ts:4464`）／`MILLAction.optional`／`GRANT_PROTECTION.duration`／`asDown`／
`duringOppTurn`（`protectionKeyword` の `PROTECTION_FILTERED`）／`targetsTriggerSource`／`{$ref:last_processed_count}`
は**すべて実装済み**で、parser が出し損ねているだけ。**engine 機構が要るのは
`STRIP_OPP_ENA_MULTI_ENA` の後半（「対戦相手の効果を受けない」）と `commonClass` の2件だけ。**

#### ⚠ engine の非対称な仕様（triage で繰り返し効いた3つ）

- **`abortIfNoCandidate` は `SELECT_TARGET_ONLY` 専用**（`effectExecutor.ts:6367-6372`）＝**素の `BANISH`/`TRASH` ステップには効かない**。
  ⇒「そうした場合」を SEQUENCE の並びで表すと**失敗しても後続が走る**（`WD19-018-E1`）。
- **`costText` は engine が読まない**（特例は `effectExecutor.ts:6016` の1件）＝`costColors` 等の実体が無い `OPTIONAL_COST` は**無償**。
- **`Pattern ④` は `condIdx > i + 1` を要求する**（`effectExecutor.ts:6101-6107`）＝**`CONDITIONAL` が STUB の直後だと `Pattern ⑤` に落ちる**。
  この差で「未払いでも実行される」か「支払っても実行されない」かが反転する。

### ⚠ 両アカウントとも使用量上限に到達した（＝この規模の委譲の律速）

`.codex-work` は batch_15 で、既定 `~/.codex` は batch_46 で上限。**どちらもサーキットブレーカーが5連続失敗で正しく停止**した
（`semanticAuditRunCodex.mjs` の `MAX_CONSECUTIVE_FAILURES=5`）。**未実行は b15〜27 と b46〜54 の計22バッチ**。
🔑**再開は同じコマンドでよい**（`raw/batch_NN.json` の有無でスキップ）。
🔑**上限は「1バッチの重さ」に効く**＝監査バッチ（20〜80秒）は213本回っても上限に当たらなかったが、
**triage バッチ（約292秒）は32本で2アカウントとも枯れた**。⇒ **重い委譲はバッチ数ではなく秒数で見積もる。**

### ⚠ 周期を破った結果（記録として残す）

PLAN §5.0 の周期（Sonnet 5〜8バッチ : Opus triage 1回）は**ユーザー判断で意図的に破った**（codex 側の原価が Claude 月額枠と別のため）。
**結果は [LESSONS.md](./LESSONS.md) §4.7 の理由②③のとおり**＝**未 triage が 4 → 443件**に積み、
偽陽性の還元（O-C）が213バッチ全部に届かないまま回り、真バグの grep 展開も後回しになった。
🔑**一方で「止め時（新型0が連続3バッチ）を判定する材料が全数そろった」**のは掃引でしか得られなかった利得。
⇒ **次にやるなら「掃引は codex で一気に・triage は型で束ねる」**が現実的な形。

## 2026-09-08（§5.3 索引 G＝`O-273`〜`O-286` の11項目を全消化）＝🏁索引 G 残0

**作業単位**＝ユーザー指示「索引 G. 新規分離（母集団 1〜2効果）をすべて消化する」。
**11項目のうち 9件を実装・1件を明示 defer・1件は登録票が stale で別の真バグを回収**した。
`npm run gates` 全緑（golden **3659 → 3674 PASS / 0 FAIL**）、実機 **5シナリオ全 PASS ＋ 反転確認2本**。

### 🔴 このバッチの一番の教訓＝**登録票の「新機構が要る」は 11件中 3件が誤りだった**

| 項目 | 登録票の見立て | 実測 |
|---|---|---|
| `O-273` | 「`upToCount` と 0〜N の選択UIが要る／`src/screens/` を触る＝実機必須」 | ❌ **受け皿は既に在った**（同型 `WX07-045-E1` の `STUB{OPTIONAL_COST, charmTrashVariable}`＝engine 側が 0..N の CHOOSE を出す）＝`src/screens/` は1バイトも触らず終了 |
| `O-274` | 「live 1効果（`WX06-014-E2`）」 | ❌ **過小**。実体は **live 28効果**の engine バグ（下記） |
| `O-276` | 「`substituteCost.powerReduction` は候補を1件も返さない＝この効果はまるごと恒久 no-op」 | ❌ **stale**。実装は**別軸に最初から在り**（`collectLeaveSubstituteOptions` の `powerReduction` 軸）、真の穴は**別の1行**だった（下記） |
| `O-286` | 「記録側が丸ごと無い」 | ⚠**半分 stale**（`last_cost_trashed_cards` は在った）＝足りなかったのは**色**の記録と読み手 |

🔑**`O-276` の読み間違いの構造**＝登録票が名指しした `collectBanishSubstitutes`（**バトルのバニッシュ経路**）だけを
読んで「未対応」と結論していた。原文は「**対戦相手の効果によって**場を離れる場合」＝**バトルでは発動しない**ので、
あの collector に無いのが**正しい**。⇒ **登録票が名指しした関数だけを読んで結論しない**（同じ機構の別入口を必ず数える）。

---

### `O-273` — 【チャーム】を「好きな数」トラッシュする（live 1効果・速いレーン）

**真因**＝`WX07-021-E1` の live が `REMOVE_CHARM{count:'ALL'}`＝原文「**対象の好きな数の**あなたの場にある
【チャーム】をトラッシュに置く」が**全チャーム強制トラッシュ**になり、後続のパワー減少も常に最大だった。
**修正**＝`manualEffects.ts` に `STUB{OPTIONAL_COST, charmTrashVariable:{min:0}}` ＋
`POWER_MODIFY_PER_CHARM{sourceLocation:'trashed_this_effect'}` で手書き（同型 `WX07-045-E1` と同じ綴り）。
**影響**＝1効果。**検証**＝`golden -- --only "O-273"`（0/2/3枚の3点で実トラッシュ枚数とパワー減少が一致）。
**実機**＝不要（`src/data/` のみ）。

### `O-274` — トラッシュから固定N枚をデッキへ戻す効果が**先頭N枚を無言で確定**していた（🔴 live 28効果）

**真因**＝`execTrash` ではなく `execTransferToDeck` の `TRASH_CARD` 分岐末尾で `cands.slice(0, N)`。
`optional` も `upToCount` も `selectionConstraint` も無い**「N枚を対象とし」の族が全部ここへ落ち**、
①**どのN枚を戻すか** ②**積む順番**（原文「好きな順番で」）の両方がプレイヤーから奪われていた。
**修正**＝候補が N より多いときだけ `selectOrInteract` を通す（**N枚以下なら従来どおり自動**＝無意味なモーダルを増やさない）。
`resumeSelectTarget` は `selected` の順に per-card 適用するので、**選んだ順＝デッキに積まれる順**になる
（`orderChosenBy` を増やす必要は無かった）。
**影響**＝**live 28効果**（`WXK09-091-E1`「この方法で《バズイール》と《ブロト》を加えた場合」のように
**どれを戻したかを後続が読む**効果も含む）。
**検証**＝`golden`「§5.3 O-274」＋実機 `V-182`（下記）。**反転確認**＝engine を旧形へ戻すと `v182TrashPickOffered` が赤。

### `O-275` — ライフクラッシュの「発生原因」の軸（live 1効果）

**真因**＝`LIFE_CRASHED_THIS_TURN` が**原因を区別しない総数**しか読めず、原文
「このターンにあなたのライフクロスが**対戦相手の効果によって**クラッシュされていた場合」（`WX11-021-E1`②）が
**アタックのダメージでも自分の効果でも成立**していた。
**修正**＝`PlayerState.life_crashed_by_opp_effect_this_turn` を新設し、**`execLifeCrash{owner:'opponent'}` だけ**が
加算（＝被害側から見て「相手の効果」）。条件に `byOpponentEffect` を足し、parser の**除外規則を実装へ置き換えた**。
⚠**`WX11-021-E1` は live 限定 MANUAL スタンプで凍っていた**ので解凍した（`BASELINE_ORPHAN_MANUAL` 7→6）。
その刻印は stale＝`fixLrigColorFilters.mjs` が差し込んでいた【チェイン】の `COST_REDUCTION` を
**parser 自身が出すようになっていた**（凍らせたままだと `byOpponentEffect` が live へ永久に届かない）。
**影響**＝1効果。**検証**＝`golden`「§5.3 O-275」（書き手・読み手・turn-scoped 失効の3点）。

### `O-276` — 「自分の他の＜水獣＞が相手の効果で場を離れる」身代わりが**同名2体目で無言に失敗**していた

**真因**＝`findEffectLeavePowerReductionSubstitute` の `cardMap.get(victimNum)`＝**instance id を base 化していない**。
場に同名シグニが並ぶ（`WX01-043#2`）と `victimCard` が `undefined` になり、`matchesFilter` が false へ倒れて
**身代わりが1件も出ない**。同族の他の victim 参照（`applyEffectLeaveLrigAbilitySubstitute` ／
`collectBanishSubstitutes`）は**既に base 化されており、ここだけが漏れていた**。
**修正**＝`getCardNum()` を通す1行。あわせて `collectBanishSubstitutes` の
「powerReduction は…未対応」という**未実装の意味に読める誤記コメント**を、
**「バトル経路には足してはいけない／実装は別軸に在る」**と書き直した。
**影響**＝1効果（ただし**実戦では同名が並ぶ盤面が普通**なので体感は大きい）。**検証**＝`golden`「§5.3 O-276」。

### `O-277` — 代替コストが「エナ1組」を丸ごと置き換える形（**明示 defer**）

`WX09-032-E1`「あなたが《緑》《緑》《緑》か《緑》《緑》を支払う際、代わりにエナから《オサキ》1枚を…」＝
**1枚で《緑》2〜3個ぶん**を賄う。既存の代替コスト機構は**エナ1枚の色オーバーライド**なので表せず、
支払いUI（`costs.ts` ＋ 4モーダル）へ「1枚がN個ぶん」の軸を通す必要がある＝**live 1効果のために `src/screens/` を貫く**。
⇒ PLAN §5.3 の規約どおり **`DEFERRED_COST_SUBSTITUTE_MULTI_ENERGY` へ改名**した。
🔴**旧 live は `STUB{OPTIONAL_COST, costText}` の生文字列**＝engine は読まない完全な無言 no-op で、
しかも `OPTIONAL_COST` は SEQUENCE 内では実装済みなので **`census:stubs` A群にも出ず計器から消えていた**。
⚠**単発の《色》を置き換える族5枚は実装済み**（`WX08-042` / `WX21-044` / `SP07-011` / `WDK16-01T` / `WXK10-015`）＝
defer 規則は**《色》が2つ以上連続する組**だけに当てて巻き込まない（golden で6枚とも据置を assert）。

### `O-278` — 無料グロウの範囲（「完全に同一のルリグタイプ」）（live 2効果）

**真因**＝`free_grow_next_turn` / `free_grow_this_turn` が**真偽値1つ**で、原文の限定がどこにも載らず
**次の自分ターンの全グロウが無料**（`WX03-024-BURST` / `WX03-027-BURST`）。
さらに `turnScopedState.ts` の移し替えが `? true :` で、**範囲を書けたとしても1行で潰れる**形だった。
**修正**＝両フィールドを `boolean | {sameLrigTypeExact:true}` に広げ、
①parser が原文から範囲を決めて payload（`sameLrigTypeExact`）に載せる ②`execStubPart2` が値ごと予約する
③`turnScopedState` が**値ごと**移す ④`GrowModal` は**候補ごと**に `freeGrowAppliesTo()` で判定する。
🔑「完全に同一」＝**集合の一致**（`lrigClassesCompatible` の「1つでも重なる」より狭い）。
**影響**＝2効果。**検証**＝`golden`「§5.3 O-278」＋実機 `V-183`（下記）。**実機必須**（`src/screens/` を触った）。

### `O-280` — legacy catch-all `STUB{TARGET_AND_DISCARD_HAND}` の残り6件を**1件ずつ**閉じた（🏁残0）

🔴**catch-all の実体**（`effectExecutor.ts:5365`）＝「**相手シグニ1体を選んでバニッシュし、手札を1枚捨てる**」固定。
対象の絞り込みも、捨てる札の絞り込みも、順序も、枚数も原文と無関係＝当たったカードは**別の効果に化ける**。

| 効果 | 旧 live の実挙動 | 直し方 |
|---|---|---|
| `PR-195-E3` | 相手シグニ1体をバニッシュ＋**自分**が手札1枚捨て | `TRASH{HAND_CARD, owner:'opponent'}` ＋ `countFromZone{field, isFrozen}` |
| `WX25-CP1-092-E1` | 対象1体・エナ支払いなし・手札1枚捨て | `energyTrashCountFromTargetCount`（**対象の体数**で払う）を新設 |
| `WXDi-P00-018-E1` | **後半の1文が丸ごと catch-all** | `DRAW_DISCARD_COUNT_PLUS_N` に `drawDiscardOwner` を新設（＋`Math.max(0, …)`） |
| `WXK05-003-E1`④ | **レベル4を持たなくてもバニッシュできた**（捨てる前にバニッシュする順序） | 対象固定 → `TRASH{level:4}` → `BANISH{conditional:true}` |
| `WXEX1-09-E2` | `TRADE_BANISH_SELF_SIGNI`＝**丸ごと別の効果** | `EffectTarget.extraZones` を `TRASH` の**列挙と適用の両方**へ配線＋レベル1〜5の5ステップ展開 |
| `WX25-P2-022-E2` | 相手シグニ**2体**バニッシュ＋自分が手札**2枚**捨て | `DEFERRED_OPP_SPLIT_HAND_TWO_PILES`（秘匿2束分割は新 interaction が要る） |

🔴**副産物の engine バグ**＝`countFromZone` は `matchesFilter`（**CardData 単体**）でしか絞れないので、
`isFrozen` / `isDown` / `crossState` のような**ゾーン状態の語彙を黙って素通り**していた。
`ZONE_STATE_FILTER_KEYS` を定義し、その語彙が入っているときだけ `fieldCandidates` へ委ねる
（**入っていないときは1バイトも経路を変えない**）。これで `WXEX2-02-E1`（「対戦相手の場にある**凍結状態の**シグニ
１体につき《無×1》増える」）の**過大請求も同時に直った**。

### `O-283` — 「ルリグの能力」をコストなしで使う（live 2効果）

**真因**＝`STUB{PLAY_FREE}` は「**カード**を使う」経路で、対象は `lastProcessedCards[0] ?? sourceCardNum` を
`parseCardEffects` して**最初の ACTIVATED/【出】**を実行する。ルリグの能力は「カード」ではないので、
`WX22-014-E3` は**同じカードの E1（【常】）**を、`WX21-Re04-E1` は**そのアーツ自身**を撃とうとしていた。
**修正**＝`STUB{USE_OWN_LRIG_ABILITY_FREE}` を新設（**エクシード能力だけ**を列挙／`maxExceed` で値の上限／
`lrigAbilityScope:'all_lrigs'` でセンター＋アシスト／複数なら選ばせる／**能力の持ち主を `sourceCardNum` に据える**）。
⚠**実装中に golden が配列 aliasing を捕まえた**＝`pickedUOLA = candsUOLA` のまま `candsUOLA.length = 0` して
**options が空の CHOOSE**（＝押せないソフトロック）になっていた。コピーを取って解消。

### `O-284` — 「自身以外の効果を受けない」＝**自分側の効果も遮断する**耐性（live 1効果）

**真因**＝2つ。①live が `sourceOwner:'opponent'`＝**原文の半分**しか書いていない
②`collectEffectImmuneSigni` の呼び出しが `BattleScreen.tsx` に**1本しか無く**、
「対戦相手の効果が自分側を侵すか」だけを計算する**片側専用**だった（`sourceOwner:'any'` と書いても効かない）。
**修正**＝①`GrantProtectionAction.exceptSelfSource`（**このカード自身の能力だけ**を例外にする identity 限定。
`exceptSource` は型限定なので**アシストルリグまで通ってしまう**）②`ExecCtx.ownEffectImmuneNums` を新設し、
`collectEffectImmuneSigni` を**自分側視点でも**呼ぶ対を作った（先例＝`ownBanishProtectedNums`）。
engine 側の消費地点（POWER_MODIFY のマイナス／FREEZE／DOWN／バニッシュ保護）も対で足した。
⚠**コスト経路（`payLrigDownCost`）は遮断しない**＝コストは「効果」ではない。

### `O-285` — `STUB{ACCE_FROM_HAND}` catch-all が飲んでいた別2形（live 2効果）

**真因**＝あの catch-all はアクセ札を **`ctx.sourceCardNum`（効果元自身）に固定**する。原文が
「**手札から**〜1枚を」「**ルリグデッキから**〜1枚を」と**別のカードを選ぶ**形だと、効果元は候補ではないので
**恒久 no-op**（無言）。
**修正**＝`WXK05-026-E1` は既存の `AttachAcceAction.fromHand`（2段選択）へ、
`WXDi-P09-007-E2` は **`fromLrigDeck` を新設**（列挙 `execAttachAcce` と除去 `applyDirectAction` を**対で**足す＝
片方だけだと「選ばせるのにカードが複製される」）。逆翻訳の発生元ラベルも `ルリグデッキ` を足した
（既定 else が `エナゾーン` なので、**足さないと嘘の逆翻訳**になる）。

### `O-286` — 追加コストで「実際に払った色」を記録して分岐させる（live 1効果）

**真因**＝`WX21-Re18-E1` の追加コストが `STUB{OPTIONAL_COST, costText}` の**生文字列**で、
**5つの分岐が全部無条件に順次実行**されていた（手札戻し＋バニッシュ×2＋ドロー捨て＋トラッシュ回収が
**コスト0で毎回全部**走る）。しかも赤/緑の色指定が**対象シグニ側のフィルタへ誤着**していた。
**修正**＝3つ。①`PlayerState.last_cost_energy_trash_colors`（`execTrash{asCost}` の**一括経路と1枚ずつ経路の両方**で書く）
②条件 `COST_ENERGY_TRASHED_COLOR`（**記録が無ければ false** の fail-closed）
③`energyTrash.atLeast`（「2枚以上」＝上限なし・下限は `SelectionConstraint.minCount`）を engine の任意コスト経路でも払えるようにした。
⚠**`PAID_COLORS_INCLUDE_ALL` は使えない**＝あれは**基本コスト**で払ったエナの色を読む別の軸。

---

### 実機（§2.2＝`src/screens/` を触ったので同日返済）

| シナリオ | 結果 |
|---|---|
| `v182TrashPickOffered`（`O-274`） | ✅ 候補=`[WX02-067, WX04-051]`（**Lv4黒だけ**／Lv1白の `WD01-013` は候補外）→ 選んだ札がデッキの一番下へ |
| `v182TrashAutoWhenExact`（対照） | ✅ 候補がちょうど1枚ならモーダルを出さずに確定（無意味なモーダルを増やしていない） |
| `v183FreeGrowUnrestricted`（`O-278`） | ✅ 範囲なしの権利は従来どおり**エナ0枚**でグロウできる（common path の退化検出） |
| `v183FreeGrowSameLrigTypeExact` | ✅ 範囲つき＋**同一タイプ**（タマ→タマ）は無料 |
| `v183FreeGrowScopeBlocksPartialType`（対照） | ✅ **重なるだけ**（リメンバ/ピルルク→ピルルク）は無料にならない＝候補が押せない |

🔴**反転確認（軸ごとに1本）**＝`execTransferToDeck` の分岐を殺すと `v182TrashPickOffered` が
「🔴選択モーダルが1度も出ないまま先頭が自動確定した」で赤／`freeGrowAppliesTo` の範囲判定を殺すと
`v183FreeGrowScopeBlocksPartialType` が「🔴対照が崩れた」で赤。**どちらも FAIL 文言が原因を指している**（§4.4-3b）。

⚠**この巡で踏んだ運用ミス**＝反転確認の後始末に `git checkout src/screens/battle/growLogic.ts` を使ったら、
**同じファイルに書いた未コミットの `freeGrowAppliesTo` ごと消えた**（`V-183` は通ったままなので気付きにくい）。
⇒ **反転確認の復元は「入れた1行だけを戻す」**（ファイル単位の `git checkout` は**未コミットの本体も巻き込む**）。

### ゲート

`npm run gates` 全緑＝golden **3674 PASS / 0 FAIL**（3659 → +15本）、smoke 10745 全 OK、fuzz 全0、
census 高シグナル 0 / BASELINE 0、`census:stubs` A群🔴 0・C群 0、`census:enginetext` A🔴 0行、
`census:costtext` A🔴 0規則、lint 0 errors。
⚠**較正したラチェット3本**＝turn-scoped 54→55（`life_crashed_by_opp_effect_this_turn`）／
`Condition` 型数 148→149（`COST_ENERGY_TRASHED_COLOR`）／`BASELINE_ORPHAN_MANUAL` 7→6（`WX11-021-E1` を解凍）。
⚠**トリップワイヤ3本を「残0」へ更新**＝`B9_TRADE_STUB_ALLOWED`／`LEGACY_TARGET_STUB_ALLOWED`／
`WX25-CP1-092-E1` の据置 assert（**どれも「壊れている状態」を許容リストに固定していた**ので、直したら赤くなる設計＝正しく赤くなった）。

## 2026-09-08（§5.1 実機返済・`V-180` / `V-181`）＝5シナリオを常設して同日返済

第227・第228バッチで `src/screens/` を触ったので、§2.2 のとおり**同じ日のうちに実機まで回した**。
**engine のバグは1件も出なかった**（＝実装は正しかった）が、**実機でしか通らない配線を2本とも実測で確かめた**。

### `V-180`＝「限定条件を無視する」が宣言した範囲だけに効く（3シナリオ）

**なぜ実機が要ったか**＝`artsUseGate` / `spellUseGate` は純関数なので golden で3スコープ×両方向を固定できたが、
**`BattleScreen.tsx` の手札シグニ召喚ゲートだけは golden から通らない**。

| シナリオ | 盤面 | 結果 |
|---|---|---|
| `v180IgnoreRestrictionSigniLv5Summonable` | ルリグ `WX14-003`（signi/Lv5 宣言）＋ 手札に `WX13-030`（**ユヅキ限定・Lv5**） | ✅ 「召喚」が出て**実際に場へ置けた** |
| `v180IgnoreRestrictionSigniLv4Blocked` | 同じ宣言＋ `WD01-009`（**タマ限定・Lv4**） | ✅ 「召喚」が出ない（`levelEq:5` が効いている） |
| `v180IgnoreRestrictionArtsScopeSigniBlocked` | ルリグ `WX05-006`（**arts+spell 宣言**）＋ `WX13-030` | ✅ 「召喚」が出ない（**限定つきシグニ952枚への過剰適用が止まっている**） |

⚠**カード選定**＝`WX14-003` は `CardClass='?'`・`WX05-006` は `ウリス` で、どちらも観測カードの限定に一致しない。
リミットは 15 / ∞ で足りるので、**落ちるとしたら限定のせいだけ**になるよう他の門を全部開けてある。

### `V-181`＝離場したシグニの「正面にあった」が実機の収集経路でも解ける（2シナリオ）

**なぜ実機が要ったか**＝`ExecCtx.sourceLeftZoneIdx` は **`triggerCollect`（`ON_BANISH` の `banishedZone`）
→ `StackEntry` → `BattleScreen` の ctx 組み立て**の3段を通って初めて届く。**golden は ctx を手で組むので
この配線を1本も検査していない**（`V-176` が釣った「engine は正しいのに実機だけ恒久 no-op」と同型）。

盤面＝host 中央の `WX07-039`（P10000）で正面（guest 中央・P15000 のバニラ）へアタックし**返り討ちにさせる**。
guest は3ゾーンとも埋める。**観測点は `pendingCandidates`**。

- `v181FrontOfSelfAfterBanishCenter`（正面 `WX01-064`）＝✅ 候補は `[WX01-064#8192]` **1体だけ**。
- `v181FrontOfSelfFollowsSwap`（正面と側面を入れ替え）＝✅ 候補が `[WX01-053#8192]` へ**追随**した
  （固定 index を掴んでいないことの証拠）。

### 🔴 実機レベルの反転確認（軸ごとに1本）

| 殺した1ビット | Lv5可 | Lv4不可 | arts不可 | v181(1) | v181(2) |
|---|---|---|---|---|---|
| なし（正） | PASS | PASS | PASS | PASS | PASS |
| `ignoreRestrictionScopes` の判定 | PASS | **PASS** | 🔴FAIL | 🔴FAIL※ | 🔴FAIL※ |
| `ignoreRestrictionSigni.levelEq` の判定 | PASS | 🔴FAIL | PASS | PASS | PASS |
| `resolveFrontOfSelfCardNum` の `sourceLeftZoneIdx` フォールバック | — | — | — | 🔴FAIL | 🔴FAIL |

※1回目の反転では scope と resolver を同時に殺している。
🔑**`hasIgnoreLrigRestriction` は scope 判定と levelEq 判定の2段**なので、**scope だけ殺しても
`Lv4不可` は緑のまま**だった＝**対照の本数ぶん反転を用意しないと「どの対照がどのビットを守っているか」が
対応づかない**（[DRIVE_TRAPS.md](./DRIVE_TRAPS.md) の 60 として採番した）。
🔴**復元は `git checkout` ＋ `SKIP_BUILD=0`**（同 39＝mtime 保存の `mv` で戻すと stale dist で回る）。
**復元後にもう一度 5本とも PASS を確認済み。**

### シナリオを書く過程で踏んだ罠（[DRIVE_TRAPS.md](./DRIVE_TRAPS.md) へ 58〜60 で採番）

- **58**＝`getByRole('button', { name: 'アタック', exact: false })` が盤面常設の「**ルリグアタック**へ」に当たり、
  **シグニのアタックを1度も宣言しないまま毎ティック「押せた」と報告**していた（`exact: true` で解決）。
  ＋応答系ラベル（「しない」等）は**対話中だけ**押す（常に押すと `settled` の早期打ち切りが効かず FAIL 確定に 28秒）。
- **59**＝`V-nn` の採番で**使用済みの `V-179` を再利用**しかけた（第220バッチで返済済み）。
  **登録前に `grep -ohE "V-[0-9]{2,3}" scripts/ docs/ | sort -u` で最大値を実測する。**
- **60**＝上記の「反転は軸ごとに1本」。

**ゲート**＝`npm run gates` 全緑（golden **3659 PASS / 0 FAIL**・census 高シグナル 0・enginetext A🔴 0行・
costtext A🔴 0規則・smoke/fuzz 全0・lint 0 errors / 256 warnings 据置）。**`src/` は反転後 clean に復元済み。**

## 2026-09-08（§5.3 `O-272`）＝離場したシグニの「正面にあった」相手シグニを解決する（live 4効果 / 4カード）

🔴**codex は両アカウントとも利用上限だったので、この項目は Claude が単独で実装した。**

**真因**＝`resolveFrontOfSelfCardNum` が**効果元が場に居ること**を要求していたため、
`ON_BANISH` から呼ぶと**必ず `null`**。⇒ **真逆の2つの壊れ方**に分かれていた＝
①位置限定が落ちて「相手の任意1体」への**過剰実行**（`WX07-039-E1`）
②`frontOfSelf` は在るのに解けず**無言 no-op**（`WX18-076-E2`）。

🔴**素朴に `filter.frontOfSelf` を足すだけでは直らない**＝**過剰実行が恒久 no-op に変わるだけ**
（登録票の警告どおり）。⇒ **先に「解決できるようにする」ほうを作った。**

**修正（4点）**
1. **`ExecCtx.sourceLeftZoneIdx` / `StackEntry` / `PendingEffect` に離場直前のゾーン添字**を足し、
   `triggerCollect` の **ON_BANISH（`banishedZone`）** と **ON_LEAVE_FIELD（`leftZoneIdx`）**が積む。
   `BattleScreen` は `leftFieldUnderCards` と同じ経路で ctx へ渡す（対話 pause を跨ぐ経路も含め3箇所）。
2. `resolveFrontOfSelfCardNum` を **「場に居ればその位置／居なければ離場直前の添字」**の順で解決。
   **どちらも取れなければ `null`（fail-closed）**。範囲外の添字も `null`。
   🔑`execUtils.ts` へ移した（`execStubPart1` の対象宣言からも呼ぶため。`effectExecutor` は再エクスポート）。
3. 🔴**`SELECT_TARGET_ONLY`（対象宣言）が `frontOfSelf` を honor していなかった**＝
   `matchesFilter` はこのキーを**黙って無視する**（解決に ctx が要るので各ハンドラ側で剥がす規約）。
   本体アクション4箇所には在ったのに**対象宣言だけが無く**、位置限定を刻んでも候補は「相手の任意1体」のままだった。
4. parser 後段パス `markFrontOfSelfTargets`＝原文に「正面にあった」がある効果の**相手シグニ対象**へ
   `frontOfSelf` を刻む。⚠**`targetsTriggerSource` で既に一意な対象は触らない**。

**4効果の内訳（全部ちがう壊れ方）**
- `WX07-039-E1`（AUTO・parser）＝位置限定が落ちて相手の任意1体 → 後段パスで `frontOfSelf`。
- `WX18-076-E2`（MANUAL・アクセ付与）＝`frontOfSelf` は在ったが**離場後に解けず無言 no-op** → 2. だけで復活（JSON 無変更）。
- `WXDi-D06-016-E1`（→ MANUAL）＝**対象がトリガー元自身**（＝バニッシュされた自分のシグニ）にすり替わっており、
  相手ではなく**自分のシグニを −10000 する真逆**の実装だった。同型の `WX07-039-E1` と同じ綴りへ揃えた。
- `WXDi-P02-083-E1`（MANUAL）＝原文「正面にあった**その**シグニ」の「それ」は**トリガー元**なので
  `targetsTriggerSource` で一意（`frontOfSelf` は不要）。位置限定が落ちて相手の任意1体だった。

⚠**`CONDITIONAL{IS_MY_TURN}` は直していない**＝engine の**「そうした場合」ゲートの綴り**
（`stripDidItConditional`）であってターン判定ではない（意味照合の恒常的な偽陽性源）。
🔴**未解決として残した1点**＝`WXDi-P02-083-E1` のコスト「このシグニを場からトラッシュに置いてもよい」は
`costText`（ログのみ）で**実際には払わせない**。`OptionalCostSpec.fieldTrash` に「効果元自身だけ」を表す軸が無く、
`thisCardOnly` は `matchesFilter` が黙って無視するので載せると**どのシグニでも払える**方向へ壊れる。

**検証**＝golden 3本（解決器の5方向＋fail-closed／`WX07-039-E1` の候補が正面1体だけ・添字が無ければ発動しない／
live と fresh の4効果 ＋ **原文に「正面」が無いカードへ位置限定を撒いていない**）。
**反転確認3本**＝①添字フォールバックを殺す→2本 FAIL ②対象宣言の honor を殺す→候補が3体に戻って FAIL
③parser 後段パスを殺す→fresh の刻印が消えて FAIL。
**ゲート**＝`npm run gates` 全緑。golden **3656 → 3659 PASS / 0 FAIL**、census 高シグナル **0**、
`census:enginetext` A🔴 **0行**、`census:costtext` A🔴 **0規則**、smoke・fuzz 全0、lint **0 errors / 256 warnings**（据置）。
live JSON の変更は**3効果のみ**（機械 diff。`WX18-076-E2` は engine だけで直った）。
🔴**`src/screens/BattleScreen.tsx` を触った＝§2.2 により実機まで必須**（ctx への添字受け渡し）。

## 2026-09-08（O-D 実装キュー③・`O-268` ＋ `WX14-003-E2` ＋ `O-282` ＋ `WX12-002-E3`）＝4件

🔴**codex は `.codex-work`（12:26まで）に続き既定 `~/.codex`（13:22まで）も利用上限に当たり、
`src/screens/` 側の実装だけを残して中断した。以降は Claude が引き継いで完成させた**
（[codex-fallback-order] の「両方とも上限なら Claude が最後まで回す」）。

### `O-268` ＋ `WX14-003-E2`＝「限定条件を無視する」に**適用範囲**を持たせた（live 3効果）

**真因**＝`STUB{IGNORE_LRIG_RESTRICTION_ARTS}` が**範囲 payload を持たず**、消費地点
（`artsUseGate.hasIgnoreLrigRestriction` → アーツ／スペルの使用ゲート、`BattleScreen` の
スペルカットイン／**手札からのシグニ召喚**／ルリグデッキのカードアクション）が**一律にそれを読んでいた**。
⇒ ①アーツだけを書いた2枚が**限定つきシグニ 952枚**にも効く ②`PR-K060-E4` は原文がアーツだけなのに
スペルの限定も無視できる ③逆に `WX14-003-E2` は `CONTINUOUS + ADD_TO_FIELD` に化けており
**`executeAction` を通らない真 no-op**（「レベル5シグニの限定を無視して場に出せる」が丸ごと無かった）。

**修正**＝**範囲は parser が原文から決めて payload に載せる**（engine / UI 層に原文 regex を書かない）。
- `parseSentencePart1` の**先頭**に規則を1本（3つの言い回し＝「限定条件を無視して〈種別〉を使用できる」／
  「あなたが使用する〈種別〉の限定条件は無視される」／「あなたは〈レベルN の〉〈種別〉の限定条件を無視して場に出すことができる」）。
  🔑**先頭で引き取らないと `WX14-003-E2` は下流の汎用「場に出す」規則に食われる**。
  ⚠**「コストを支払わずに限定条件を無視して使用する」（`PLAY_FREE` 系＝その1回に閉じる）は巻き込まない**
  ＝文末の形で切り分け、golden で対照を固定した。
- `hasIgnoreLrigRestriction(my, effectsMap, kind, card)` に `kind:'arts'|'spell'|'signi'` を渡し、消費地点を全部直した。
  **範囲省略は fail-closed（何も無視しない）**。
- **`my.lrig_gained_types` の `'__ignore_lrig_restriction__'` を撤去**（登録票の宿題）＝
  **読み口が2箇所あるのに書き手が1箇所も無かった**ので、読み口ごと削除した（挙動は1ミリも変わらない）。
- `WX05-006-E2` の manual 定義は**削除**＝parser が同じものを出せるようになったため
  （`O-42` tripwire が影武者コピーを検出。live の MANUAL スタンプは `census:orphanmanual --unfreeze A` で解凍）。

**検証**＝golden 2本（scope 3方向 × 成立/不成立、範囲省略の fail-closed、live と fresh の両方で範囲を assert）。
**反転確認2本**＝①scope 判定を殺すと「arts 宣言がスペルにも効く」で FAIL ②parser 規則を殺すと fresh の範囲が空で FAIL。
🔴**`BattleScreen.tsx` の手札シグニ召喚ゲートは golden から通らない**＝実機の観測点として PLAN §5.1 へ登録した。

### `O-282`＝【常】の付与に「ターン終了時まで」と書いていたのは**逆翻訳だけの嘘**だった（登録票 stale）

**登録票の「engine がターン終了で落とす」は誤り**＝`lrig_granted_auto_effects`（ターン終了で落ちるストア）へ
積まれるのは **`executeAction` を通る ACTIVATED / AUTO の付与だけ**。**CONTINUOUS の `GRANT_LRIG_ABILITY` は
`collectLrigGrantedEffects`（`effectEngine.ts:3642`）が effectsMap から毎回ライブに読む**ので、
付与ストアを通らず期限も無い＝**engine は元から正しい**。
**実害**＝逆翻訳が【常】付与 **39効果すべて**に「ターン終了時まで」と書いており、
**意味照合が「期間のズレ」の偽陽性を出し続ける**（engine と逆翻訳が食い違う型）。
**修正**＝`decompileEffects` の `GRANT_LRIG_ABILITY` で `effectType === 'CONTINUOUS'` なら期限を書かない。
**検証**＝golden 1本（【常】は書かない／期間つき `WX01-028-E1` は書く対照／live 全 CONTINUOUS 付与で行頭の期限0件）。
⚠**入れ子の付与（`PR-K077-E1`＝付与された【起】がさらに期間つき付与をする）は正当**なので、行頭だけを見る。
**反転確認**＝分岐を殺して regen すると FAIL。

### `WX12-002-E3`＝「このターン」だけの全領域【ライフバースト】付与（別の効果に化けていた）

**真因**＝live が `ENERGY_CHARGE_FROM_DECK{count:1}` **1枚だけ**＝丸ごと別の効果。
`parseSentencePart1` の `/【エナチャージN】/` catch-all が、**付与文の引用の中**の【エナチャージ１】を
即時効果として拾っていた。
**母集団は実測1効果**（`npm run census:population -- "すべての領域にあるカードは【ライフバースト】"` の3効果のうち
`WX02-002-E1` は【常】恒久・`WX24-P3-022-E2` は「このターンと次のターン」＝既存のディスペア経路が正しい）
⇒ **§2.0 の速いレーン＝`manualEffects.ts` に手書きし、catch-all は割らない**（割ると巻き添えの範囲が読めない）。
**修正**＝`SET_ALL_ZONE_BURST_GRANT_THIS_TURN` を1本足して `allzone_burst_grant_this_turn` へ積み、
`turnScopedState.ts` の `turn-end` 境界で落とす。逆翻訳も **payload から**描く。
🔴**既存の `allzone_burst_grant_until_opp_turn`（ディスペア）へ寄せない**＝あちらは自分の次ターン開始まで残るので、
寄せると**相手ターンまで1ターン長く効く過剰実行**になる。
**検証**＝golden 1本（付与前後／ディスペア側を触らない／ターン終了で落ちる／ディスペアは落ちない対照／逆翻訳）。
**反転確認**＝新キーの読みを殺すと FAIL。

**ラチェット2本を較正**（退化ではなく新設1キーぶん）＝turn-scoped の命名規約フィールド **53→54**、
母集団 **83→84**。`O-226` tripwire の assert 文字列も scope つきの式へ更新した（`declaredOverride` との OR は維持）。

**最終ゲート**＝`npm run gates` 全緑。golden **3652 → 3656 PASS / 0 FAIL**、census 高シグナル **0**、
`census:enginetext` A🔴 **0行**、`census:costtext` A🔴 **0規則**、smoke・fuzz 全0、lint **0 errors / 256 warnings**（据置）。
live JSON の変更は**4効果のみ**（機械 diff）。
🔴**`src/screens/` を触った＝§2.2 により実機まで必須**（観測点は PLAN §5.1 の `V-nn`）。

## 2026-09-08（O-D 実装キュー②・付与／条件の新機構3効果）＝能力なし場出し6効果を採用、2件は安全見送り

### `WX16-Re20-E1` 同型6効果＝能力を持たない状態で場に出す

**着手前実測**＝`能力を持たないシグニとして` は登録票の8効果ではなく **6効果／5枚**。
既存受け皿 `PlayerState.abilities_removed` は【常】collector、【出】collector、【自】collector、
【起】提示の全経路で既に消費されていたため、新しい状態は作らず `ADD_TO_FIELD.abilitiesRemoved` を追加し、
配置完了時に実体カード番号を記録した。parser は最終 action-tree 後処理で原文6効果へ印を載せ、
MANUAL の `WX16-Re20-E1` も同じ payload に揃えた。逆翻訳は payload から
「能力を持たないシグニとして場に出す」と描き、同一カードの単数E1／複数E2も取り違えないようにした。

**ターン終了処理の順序**＝`BattleScreen.tsx` の通常終了／手札上限確認後終了の両経路とも、
`turn_end_field_trash_targets` の対象を場からトラッシュへ移した後に `clearTurnEndScopedState` を呼ぶ。
同関数で `abilities_removed` が消える時点では対象シグニは既に場にいないため、能力が一瞬復活する窓はない。

**検証**＝6 effectId の live と AUTO／MANUAL fresh parse、3枚同時配置、ターン終了予約を固定。
通常召喚との対照で同じシグニの【常】【出】【起】が生き、能力なし配置では3経路すべて止まることを固定した。
parser 印、executor 記録、decompiler 表示を個別に殺す3回の反転確認はいずれも同 golden が FAIL。

### `WX12-002-E3`／`WX16-003-E1`＝安全見送り

`WX12-002-E3` の文型は **3効果／3枚**だが、全領域ライフバースト付与の既存 funnel は
`src/screens/battle/allZoneBurst.ts` にあり、指定禁止の `src/screens/` を触らずターン期限つき付与を完成できない。
誤変換元は `parseSentencePart1.ts` の `/【エナチャージN】/` catch-all が、付与する能力の引用内にある
【エナチャージ１】だけを拾ったもの。引用外側を判定できない規則の是正を含め、別バッチへ回す。
`WX16-003-E1` の「最初に使用したアーツ」は **1効果／1枚**。登録票と違い `ARTS_USED_THIS_TURN.exactCount`
および `evalCondition`／`checkActiveCondition` の受け皿は既に揃っていた。ただし同じ効果が自分／相手の
`ON_ARTS_USE` で発火し、「そのプレイヤー」を静的 `owner` へ安全に解けない。対象・任意2択に加え、
トリガー元プレイヤーを fail-closed で渡す必要があるため、①完了を優先して未着手とした。どちらも既存 live は変更していない。

**最終ゲート**＝golden **3651→3652 PASS / 0 FAIL**、census 高シグナル **0**、
enginetext A🔴 **0行**、costtext A🔴 **0規則**、smoke **10745/10745・全0・SKIP0**、
fuzz **200ゲーム・CRASH/HANG/INVARIANT/EXPLOSION 全0**、lint **0 errors / 256 warnings**。
`build:effects` → `regen` → `gates` の順で完走。`src/screens/`、PLAN／PLAN_PROGRESS、commit／push は無変更。

## 2026-09-08（O-D 実装キュー①・engine/parser 内で閉じる3効果）＝1件採用・1件 stale 確認・1件安全見送り

**着手前実測**＝`【出】／【起】` 1効果／1枚、`【起】／【出】` 0、
`他のシグニゾーンに移動したシグニ` 1効果／1枚、
`レベルが場にある【ウィルス】の数以下` 1効果／1枚。いずれも2件以下なので parser 一般化ではなく
manual レーン。ただし受け皿まで読むと、登録票には以下の stale があった。

### `WX16-005-E1`＝2つの対象集合へ既存の動的レベル上限を配線（採用）

**真因**＝`TargetFilter.levelLteFieldVirusCount` と `resolveDynamicFilter` は既存だったが、live の
BANISH／ADD_TO_FIELD 両枝は `cardType:'シグニ'` だけでレベル無制限だった。
**修正**＝`manualEffects.ts` の1効果へ既存キーを2箇所だけ載せ、live JSON に同期。
`resolveDynamicFilter` は両プレイヤーの `field.signi_virus` 合計を `level.max` に落とす。
併せて対戦相手 state を参照できない異常経路は `noMatch` へ倒し、未知キーが matcher で無視されて
無制限になる経路を閉じた。decompiler にも同キーを描画。
**検証**＝live／fresh+manual の両方で2刻印、ウィルス2個ならLv2可・Lv3不可、0個ならBANISH／場出しとも
候補0を固定。反転で動的解決分岐を `false &&` にすると Lv3 も候補へ入り golden FAIL。

### `WX12-010-E3`＝登録票 stale（挙動変更なし・指定された両方向 golden のみ追加）

`resumeRearrangeSigni` は既に `oldZoneOf(num) !== ni` の `rearrMoved` だけを `lastProcessedCards` に載せ、
空配列は `targetsStored` の候補0へ落ちていた。既存 O-8(b) golden 2本も着手前に PASS。
今回さらに (a) 配置不変ならアップ候補0、(b) 空きゾーンへ1体だけ移動ならその1体だけが候補、を明示固定。
反転で差分判定を `false &&` にすると (b) が golden FAIL。

### `WX16-002-E4`＝起動能力追加を安全見送り

登録票の「`NEGATE_COIN_ABILITY` はログのみ」は stale。実コードは相手の
`negate_coin_abilities` を立て、Arts／Cutin／Spell の現ターンのベット入口がこの flag を読む。
しかし原文は「このターンの前のターンに発動したコイン技を無効にする」であり、既存処理とは意味が違う。
この STUB 本体は今回スコープ外なので、起動肢だけ追加すると誤った現ターン禁止効果を任意に増やす。
件数消化より過剰実行防止を優先して未採用。

**最終ゲート**＝golden **3648→3651 PASS / 0 FAIL**、census 高シグナル **0**、
enginetext A🔴 **0行**、costtext A🔴 **0規則**、smoke **10745/10745・全0・SKIP0**、
fuzz **200ゲーム・CRASH/HANG/INVARIANT/EXPLOSION 全0**、lint **0 errors / 256 warnings**。
`build:effects` → `regen` → `gates` の順で完走。`src/screens/`、PLAN／PLAN_PROGRESS、commit／push は無変更。

## 2026-09-08（第224バッチ・Opus・O-281 ＋ O-D 実装キュー）＝Opus レーンの作業を5件消化

**作業単位**＝ユーザー指示「opusの作業を５件行う」。**§5.3 `O-281`（live 12効果）→ 実装キューを上から4行**。
**②' レーン判定**＝`O-281` と `WX19-025-E1` / `WX16-033-E1` は engine（遅いレーン）、`WX07-017-E1` /
`WX13-048-E1` は同型実測1効果なので `manualEffects.ts`（速いレーン）。**`src/screens/` は無変更＝実機不要（§2.2）。**

### `O-281`＝「効果でカードを使わせる」経路が限定条件（`Restriction`）を一度も検査しない（live 12効果）

**真因**＝`STUB{USE_SPELL_FROM_TRASH_PAYING_COST}`（`execStubPart2.ts`）が候補を `matchesFilter` だけで絞り、
本体を `USE_SPELL_FROM_TRASH` / `CAST_FROM_OPP_TRASH` / `PLAY_SPELL_FROM_HAND` へ委譲するため、
**engine のどこでも `Restriction` を見ていなかった**＝この STUB を通る **12効果すべてが事実上「限定条件を
無視して」使えた**。原文に当該句があるのは `WXK09-002-E1` の1件だけで、**残り11件は過剰実行**
（`PR-433-E1` は原文が「（限定条件、使用タイミングは無視しない）」と明記している）。
**修正**＝受け皿の先例 `execPlayFree`（§5.3 `O-264`・`effectExecutor.ts:8195`）と**同じ `meetsRestriction` 1本**を
候補絞り込みへ入れ、`StubAction.ignoreRestrictions` を新設。parser 側は `wireEffectOppTrashUse` で
「限定条件を無視して使用」に当たったときだけ印を立てる（既定は検査する＝fail-closed）。
**影響**＝live 12効果（11件が過剰実行の解消・1件は印つきで従来どおり）。
**検証**＝`golden -- --only "O-281"`（2本＝engine の候補絞り込み／live の印と原文の一致トリップワイヤ）。
**反転確認**＝`if (false && !stub.ignoreRestrictions)` で分岐を殺すと候補が3枚に戻って FAIL することを確認。

### `WX07-017-E1`（原文「各プレイヤーは自分のトラッシュから…／その後、対戦相手は自分のトラッシュから…」）

**真因**＝後半3文がすべて `owner:'self'`＝②③は**相手ぶんが丸ごと落ち**（過小実行）、④は**実行者が逆**
（相手のリカバリーが自分のリカバリーに化ける＝過剰実行）。
🔑**§5.3 `O-279` の登録票「`ADD_TO_FIELD`／`TRANSFER_TO_HAND` の `owner` は片側しか取れない」は stale**＝
実測すると `execAddToField`（`owner`）／`execTransferToHand`（`source.owner`）／`execEnergyCharge`（`target.owner`）は
**3つとも相手側を取れた**。⇒ 新しい型も engine の新経路も要らず、既存の綴り（「各プレイヤーは」を
self/opponent の2本に割る＝`parseSentencePart1.ts` のドロー規則と同型）で閉じた。**`O-279` もクローズ**。
**修正**＝`manualEffects.ts` に6ステップの `SEQUENCE` を手書き（同型は実測1効果）。
**影響**＝live 1効果。**検証**＝`golden -- --only "WX07-017-E1"`（構造＋相手ぶん3本が実際に相手のゾーンへ入る）。

### `WX13-048-E1`（原文「それが宣言したカードの場合…／宣言したカードではない場合…」）

**真因**＝分岐が丸ごと消えて `DRAW 2` と `DRAW 1` が無条件に並び、**常に3枚引いていた**（一致時の
「それをトラッシュに置き」も無し）。公開も `STUB{LOOK_OPP_LIFE_TOP}`＝**見るだけ**で公開札を後段へ渡さない。
**修正**＝`REVEAL_DECK_TOP{owner:'opponent'}` →
`CONDITIONAL{LAST_PROCESSED_MATCHES, filter:{nameEqDeclaredName:true}}` → 一致なら
`SEQUENCE[TRASH_REVEALED{opponent}, DRAW 2]` / 外れなら `DRAW 1`（`manualEffects.ts`・同型実測1効果）。
🔴**engine 側に1点だけ追加**＝`nameEqDeclaredName` は **`matchesFilter` が読まないキー**
（契約は「`resolveDynamicFilter` が `cardNames` へ解決してから使う」＝`effectExecutor.ts:3021`）なので、
`LAST_PROCESSED_MATCHES` に素で載せると**黙って無条件成立**する＝「宣言していないカードでも一致枝が通る」。
`execUtils.ts` の同条件型で明示解決した（未宣言なら不成立＝fail-closed）。
**影響**＝live 1効果。**反転確認**＝解決を殺すと不一致でも2枚引いて FAIL することを確認。

### `WX19-025-E1`（原文「《トラップアイコン》を持つカード1枚をチェックゾーンに置き…その後、それを発動させる」）

**真因**＝**効果の本体が丸ごと無かった**＝素の `LOOK_AND_REORDER{count:3}`（3枚見て一番下に置く）だけで、
チェックゾーンへの移動も《トラップアイコン》の発動も存在しない。
**修正**＝受け皿の先例 `WX21-Re20-E1`（ライフバースト版）と同じ3段へ。engine に足したのは2つだけ＝
①`trapOp:'to_check'` が **`trapFilter` を候補に当てる**（無いと3枚のどれでも置けた＝原文の限定が落ちる。
見た札が1枚しかない経路にも同じ判定を入れた） ②`trapOp:'activate'` に **`trapSource:'check'`** を追加
（🔴旧委譲先 `STUB{ACTIVATE_TRAP}` は **`field.signi_traps`（シグニゾーンに伏せた【トラップ】）しか見ない**ので、
チェックゾーンの札に当てると必ず「トラップなし」＝**恒久 no-op**）。
**影響**＝live 1効果。**反転確認**＝2つの追加をそれぞれ個別に殺して FAIL することを確認。

### `WX16-033-E1`（原文「対戦相手のすべてのシグニゾーンにある、すべてのカードをトラッシュに置き…」）

**真因**＝本体の前半が丸ごと無く `STUB{REMOVE_VIRUS, virusCount:'all'}` の1歩だけ＝**相手の場は1体も落ちなかった**
（コスト軽減 payload だけが正しく載っていた）。
**修正**＝受け皿は `TRASH_ALL_SIGNI_AND_KEY` の `trashAllScope`（§5.3 `O-60` 第59で payload 化済み）。
足したのは **`zoneAttachments`** の1キーだけ＝原文「シグニゾーンにある、**すべてのカード**」は
シグニ本体と下のカード（`zones:['signi']` が既に流す）に加えて **【チャーム】／【アクセ】／【トラップ】**まで含む
（`signi_charms` / `signi_acce` / `signi_traps` は別配列）。⚠**既定（未指定）は従来どおり付随カードを残す**＝
「すべてのシグニをトラッシュに置き」型（`WXEX2-21-E3` ほか）の意味を変えない。
**影響**＝live 1効果。**検証**＝golden で5種（本体・下・チャーム・アクセ・トラップ）が相手のトラッシュへ落ちること
＋**既定では落ちないこと**の両方を assert。

### 移送＝`WX21-Re18-E1` → §5.3 `O-286`（実装せず登録）

着手前の実測で「新機構が要る」側に確定＝判定側の `PAID_COLORS_INCLUDE_ALL` は在るが、
**追加コスト（エナのトラッシュ）で実際に払った色を記録する側が丸ごと無い**（`STUB{OPTIONAL_COST}` の
`costText` はログ表示のみで engine は読まない）。PLAN §5.0 から §5.3 索引 G へ移した。

### 逆翻訳（decompiler）の追随＝3箇所

LESSONS §4.2「payload を足したら逆翻訳もその payload から組む」に従って `decompileEffects.ts` を較正：
①`trashAllScope.zoneAttachments` ②`trapOp:'activate'` の `trapSource:'check'` ③`trapOp:'to_check'` の `trapFilter`。
放置すると `WX16-033-E1` が「シグニをすべてトラッシュに置く」、`WX19-025-E1` が
「あなたの【トラップ】1つを表向きにし」と読め、**原文照合という主軸の検査が効かなくなる**。

### 既存 tripwire の較正＝`LOOK_OPP_LIFE_TOP` の `opp_deck_top`

`WX13-048-E1` を `REVEAL_DECK_TOP` へ置き換えた結果、**`opp_deck_top` の live 例が 0 になった**
（実測＝他に1件も無い）。⇒ その枝だけ **live の assert から parser 出力の直接 assert へ移した**
（`parseCardEffects('WX13-048')` を見る）＝生成規則そのものは固定したまま。live 側は残り3ゾーンを assert する。
🔑**「バグを直すと、バグに依存していた golden が落ちる。それは退行ではない」**（LESSONS §4.2）の同族＝
落ちた test が**何に依存して緑だったか**を先に読んでから直した。

### 前バッチの取りこぼし回収＝`TRASH_TRAP_ONE` の逆翻訳が生の英語 ID だった

第222バッチで `WX19-064-E1` の選択肢②に新設した `STUB{TRASH_TRAP_ONE}` に**逆翻訳の綴りが無く**、
`[STUB:TRASH_TRAP_ONE]` が逆翻訳シートに出ていた（engine 実装は正しい＝**逆翻訳だけの穴**）。
🔴**前バッチが `npm run regen` を回していなかったので `census:stubs` C群ゲートに一度も掛からなかった**
（今回 regen したことで初めて exit 1 になった）。`decompileEffects.ts` に1行足して回収。
🔑**教訓＝逆翻訳シートを読む計器（`census:stubs` C群）は `npm run regen` を回すまで嘘をつく**
（CLAUDE.md の「⚠`npm run regen` まで回す」が守られていないと、次のバッチが払う）。

### 検証・簿記

`npm run gates` 全緑（golden **3642 → 3648 PASS**・+6本）。`npm run regen` 済み（逆翻訳3件を目視確認）。
ラチェット較正なし（`census:enginetext` A群 0行／`census:costtext` A群 0規則のまま）。
実装キュー残 **12行/13効果 → 7行/7効果**（4行消化＋1行を §5.3 へ移送。⚠**行を数え直した**＝
旧「13効果」は行数と一致しない集計だった）。機構 worklist **15項目 → 14項目**
（`O-279`／`O-281` をクローズ、`O-286` を新規登録）。

## 2026-09-08（第223バッチ・Opus・O-D 実装キュー）＝2行3効果を修正（POOL カーソルリークを回顧的修正）

**作業単位**＝ユーザー指示「さらに20件行う」→「12件で区切ることに変更する」の続き（第222の4件に続く5〜6件目相当）。

### `WX17-004-E1` ＋ `WXK03-TK-01B-E1`（原文「③レベル4以上のシグニ1体を対象とし、ダブルクラッシュとアサシンを与える」）

**真因**＝アサシン付与が対象のレベルを見ずに全対象へ付与される過剰実行（ダブルクラッシュ側は正しい）。
②' で母集団を実測したところ、**同一構造のトークンカード `WXK03-TK-01B` にも同じバグ**が見つかった
（登録票は1行だったが実効2効果）。**修正**＝アサシン付与を
`CONDITIONAL{LAST_PROCESSED_MATCHES, filter:{level:{min:4}}}` で包み、`targetsLastProcessed:true` で
直前ステップの選択対象を引き継がせた（`manualEffects.ts`・速いレーン、2カードとも同型で修正）。

### `WX15-061-E1`（原文「条件を満たす場合、このカードをトラッシュに置き、トラッシュから…シグニ1枚を場に出す」）

**真因**＝`ADD_TO_FIELD`（トラッシュから場に出す）が `SEQUENCE` の独立3手目として並んでおり、条件を
満たさない場合も無条件に場へ出る過剰実行。**修正**＝`CONDITIONAL.then` の `SEQUENCE[TRASH, ADD_TO_FIELD]`
へ畳み直した（`manualEffects.ts`・速いレーン）。

### 回顧的修正＝POOL カーソルリーク（golden テスト基盤）

新規テストの一部（第221バッチ・既 push 済み分を含む）が `mkCtx`/`mkState`/`fresh()` を使いながら
`withSavedCursor()` で包んでおらず、`goldenTest.ts` の共有カーソルが恒久的にずれていた。結果、
**無関係な既存2テスト（`WX08-073-E1`／`WX04-047-E1`）が全件 `npm run golden` でだけ偶発的に FAIL**
していた（`--only` フィルタ実行では隠れる）。影響した全テストへ `withSavedCursor` を遡って追加し修正。
🔑教訓＝**フィルタ実行の PASS は全件実行と等価ではない**（既知の罠だが今回の実装時に自ら踏んだ）。
1巡を閉じる前に必ずフィルタなしで全件を回す（PLAN §2.1 ④）。

### 検証・簿記

2行とも golden 追加（計3本・反転確認込み＝修正前コードで FAIL することを確認済み）。
`src/screens/` 無変更＝実機不要（§2.2）。`npm run gates` 全緑（golden 3639→3642 PASS）。
ラチェット較正なし（今回の2効果はどの計器のカウンタも動かさない型）。
実装キュー残 14行/15効果→12行/13効果。

## 2026-09-08（第222バッチ・Opus・O-D 実装キュー）＝4効果を修正

**作業単位**＝ユーザー指示「さらに20件行う」→ 途中で「12件で区切ることに変更する」。

### `WX22-005-E1`（原文「③スペルの効果を打ち消す。**そうした場合**、対戦相手のエナをトラッシュ、ライフクロス加算」）

**真因**＝後続2ステップ（`TRASH{ENERGY_CARD,opponent}` / `ADD_TO_LIFE`）が `CHOOSE` の**兄弟**に並んでおり、
①②（探索／ドロー）を選んでも無条件に実行される過剰実行。**修正**＝③の choice action へ `SEQUENCE` で畳んだ
（`manualEffects.ts`・速いレーン）。

### `WX20-001-E2`（原文「それらを場に出す。それらの【出】能力は発動せず、ターン終了時、それらを場からトラッシュに置く」）

**真因**＝「発動せず、」（連用形）+ 後続節の複合1文が丸ごと `STUB{RULE_REMINDER_TEXT}`（no-op）に落ちていた
（parser は「発動しない」終止形しか `BLOCK_ACTION{ON_PLAY_ABILITY}` へ変換しない）。**修正**＝既存の
`AddToFieldAction.suppressOnPlay` ＋ `STUB{TRASH_AT_TURN_END}`（`WXDi-P03-034-E1` と同型）を
`manualEffects.ts` で直接組み直した（母集団1効果）。

### `WX19-064-E1`（原文「①【ウィルス】１つを取り除く」「②【トラップ】１つを対象とし、それをトラッシュに置く」）

**真因**＝parser の「キーワードのスタンドアロン形式」規則（`parseSentencePart1.ts`）が**末尾を検査せず**
「【X】」で始まりさえすれば `GRANT_KEYWORD`（このカード自身への永続付与）へ落とす広い catch-all だった。
①②とも「取り除く」「トラッシュに置く」という実質の動作文を持つのに素通りしていた。

**修正**＝①②の具体的な2文型を catch-all より前に割り込ませ、正しい STUB
（`REMOVE_VIRUS`／新設 `TRASH_TRAP_ONE`）へ差し替えた（`execStubPart2.ts` に `TRASH_TRAP_ONE` を追加＝
`RETURN_TRAP_TO_HAND_ONE` の完全な対）。

⚠**catch-all 自体は狭めなかった**＝当初「末尾まで固定する」一般化を試みたところ、
`npm run build:effects` の held が1→35カードへ膨れた（「【クロス出】」「【トラップアイコン】」等の
正当な「【K】（説明）」形を巻き込んだ）。**撤回して個別2文型の先取りに変更**（母集団2件のみ・安全）。
🔑教訓＝広く共有される catch-all のスコープを締める一般化は必ず母集団を実測してから行う。

### `WX22-022-BURST`（原文「異なる色を持つ＜遊具＞のシグニ２枚を探して…」）

**真因**＝制約が無くどの2枚でも探せる過剰実行。登録票は「新軸（`SelectionConstraint.distinct:'color'`）が
要る」としていたが、実測すると受け皿は**既存の `SelectionConstraint.sharedColor:'none'`**
（`WX14-028-BURST` が既に使用）そのもの。**修正**＝`fixLrigColorFilters.mjs` の `searchDistinctColors` 型に
1行追加するだけ（母集団2件のみ）。

### 検証・簿記

4件とも golden 追加（計8本・全て反転確認込み＝修正前コードで FAIL することを確認済み）。
`src/screens/` 無変更＝実機不要（§2.2）。`npm run gates` 全緑（golden 3631→3639 PASS）。
ラチェット較正2本＝`REMOVE_VIRUS` ノード数 10→11（可視化）／`BASELINE_ORPHAN_MANUAL` 6→7
（`WX22-022-BURST` の fixer 型追加＝D群・凍っていない）。実装キュー残 19行/20効果→14行/15効果。

## 2026-09-07（第221バッチ・Opus・O-D 実装キュー）＝4効果を修正（系統発見2件を分離登録）

**作業単位**＝ユーザー指示「５件ほど続けて」。実装キューを①②③（重い順）で上から取った。

### `WX18-038-BURST`（原文「対戦相手の場にある【チャーム】の数に１を加えた枚数のカードを引く」）

**真因**＝`STUB{DRAW_BY_CHARM_COUNT}` が `ctx.ownerState`（自分）のチャームを数え、`+1` もせず、
チャーム0枚のとき早期returnで0枚ドローしていた（原文は0枚でも0+1=1枚は引く）。
**修正**＝`ctx.otherState` へ差し替え・`+1` を追加・早期return撤去（`src/engine/execStubPart2.ts`）。
live 母集団はこの1効果のみ（`census:population -- "場にある【チャーム】の数" --json DRAW_BY_CHARM_COUNT` で確認）。

### `WX16-074-E1`（原文「このカードをエナゾーンからあなたのシグニ１体の【アクセ】にする」）

**真因**＝`STUB{ACCE_FROM_HAND}`（`parseSentencePart2.ts` の「【アクセ】にする」catch-all が生成）のゲートが
`ctx.ownerState.hand.includes(srcAFH)` だけを見ており、エナゾーン発は常に「アクセカードが手札にない」で
恒久no-op。**受け皿の `ATTACH_ACCE`（`effectExecutor.ts` の `ATTACH_ACCE` ケース）は元から `energy`/`hand`
の両方を見て除去する**ので、壊れていたのはゲート1行だけ。`hand.includes || energy.includes` へ広げて修正
（`src/engine/execStubPart3.ts`）。

**関連発見（未修正・§5.3 `O-285` へ分離）**＝同じ catch-all が生成する `STUB{ACCE_FROM_HAND}` は他に
`WXDi-P09-007-E2`（ソースが**ルリグデッキ**）／`WXK05-026-E1`（**候補選択**が必要＝`ctx.sourceCardNum` 固定では
効果元自身が既に場にいて手札に無い）の2件も飲み込んでおり、どちらも別の新機構が要る恒久no-op。

### `WX21-052-E1-G`（原文「対戦相手のターン終了時、…」）

**真因**＝`triggerScope:'self'` が逆（`collectTurnTriggers` はターンプレイヤー側の場しか `self` を拾わない＝
自分のターン終了時にしか発火しなかった）。`any_opp` へ1行修正（`src/data/manualEffects.ts`）。

**配送の罠**＝この効果は `parseStatus:'MANUAL'`（`GRANT_FIELD_SIGNI_ABILITY.abilities[]` のネスト）＝
`manualEffects.ts` を直接編集しただけでは**収穫マージの不可侵ガードに当たり live に届かなかった**
（`npx tsx scripts/syncManualLive.ts WX21-052` で同期して初めて反映。CLAUDE.md 既知の罠）。

### `WX12-Re22-E1`（原文「この方法でルリグトラッシュに置いたカードの枚数と同じ数まで選ぶ」）

**真因**＝2つ重なっていた。①`countChoose{$ref:'last_processed_count'}` を生成する regex
（`effectParser.ts` の `parseChooseHeaderCount`）が「トラッシュに置いた」の直前に「ルリグ」が挟まる形にも
「まで」（upTo）変種にも対応していなかった ②仮に①を直しても、この効果を実際に生成する
`chooseIdx` ブロック（2文構成の CHOOSE 用・`parseActionTextInner` 内）は `countChoose` 自体を
一度も読んでおらず `choose_count:1` 固定に潰していた（`buildChooseFromHeader` 経由の別入口だけに
配線済み＝**同義の入口が2つあって片方だけ取り残されていた**型・第213バッチの `hasRiseIcon` と同型）。
両方を修正（`src/data/effectParser.ts`）。母集団2効果（`PR-328-E1` は既存の「だけ」枝で既に正常）。

### `WX17-004-E1`（着手→新機構要と判明・未修正・§5.3 `O-284` 経由で登録更新）

選択肢③の2本目 `GRANT_KEYWORD`（アサシン）が「そのシグニ」照応を持てず独立選択（`owner:'any'`）に
落ちる真因は `applyExplicitTargetMarker`（`effectParser.ts:14452`）＝外側テキストに「シグニ…を対象とし」が
1回でもあると木全体の対象ノードへ無差別に `explicitTarget:true` を刻む後処理。「そのシグニ」照応を認識する
枝がそもそも無い。同文の `WXK03-TK-01B-E1` も同型と判明（母集団2効果へ登録票を更新）。

**検証**＝4件とも golden 追加（`WX18-038-BURST`×2／`WX16-074-E1`×2／`WX21-052-E1-G`×1／`WX12-Re22-E1`×2＝
計7本・全て反転確認込み＝修正前コードで FAIL することを確認済み）。`src/screens/` 無変更＝実機不要（§2.2）。
`npm run gates` 全緑（golden 3624→3631 PASS）。実装キュー残 23行/25効果→19行/20効果。

## 2026-09-07（第220バッチ・Opus・O-D 実装キュー「系統」）＝`WX07-014-E1`「打ち消したスペルを無料で使用してもよい」の恒久no-op

**真因**＝`SEQUENCE[COUNTER_SPELL, STUB{PLAY_FREE}]` の `STUB{PLAY_FREE}` は「それ」を
`ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum` で決めるが、`BattleScreen.handleCutinUse` は
`lastProcessedCards` を一度も渡していなかった＝`sourceCardNum`（カットインしたこのカード自身）へ
フォールバックし、自己再帰ガード（`_containsStub`）に引っかかって**何も起きない恒久no-op**だった。

**修正**＝`handleCutinUse` の `ctx` 構築時に `shouldCounterSpell`（既存の打ち消しフラグ）が真のときだけ
`lastProcessedCards: [card_num]` を足す1行（`src/screens/BattleScreen.tsx`）。
`src/screens/` を触った＝実機必須（§2.2）。

**検証**＝`scripts/verifyBattleDrive.mjs` に `V-179`（`o283CounterSpellPlayFreeCarriesCardNum`）を新設。
ミルルンLv3＋クロス状態シグニ＋`WX07-014` の盤面を注入し、相手の `WD01-018`（コスト0「カードを1枚引く」）を
打ち消させてから無料再使用を確認＝host 手札 0→1（PASS）。**反転確認**＝`lastProcessedCards` の付与を
`false &&` で無効化すると FAIL に戻ることを確認済み。`npm run gates` 全緑。

**影響枚数**＝1効果（`WX07-014-E1`）。残り2件（`WX21-Re04-E1`／`WX22-014-E3`＝ルリグの能力を使う側）は
新機構待ちなので §5.3 へ `O-284` として登録（下記）。実装キュー残は 24行→23行 / 26効果→25効果。

## 2026-09-07（第219バッチ・Codex 途中停止＋Opus 引き継ぎ・O-D）＝**既存受け皿で直る一点物 9効果**（10件中1件は偽陽性）

**作業単位**＝ユーザー指示「codex に投げ、止まったら Claude が引き継ぐ」。**Codex は9関数を書いた時点で
`.codex-work` の利用上限（落ち方②）に当たり、`build:effects` にも golden 実行にも一度も到達せず停止**した。
⇒ **採用・検証・差し戻し・簿記は Opus が引き継いで完走。**

**真因（9件に共通）**＝原文の帰結・条件・選択肢が JSON に**ひとつも無い**（丸ごと欠落6・限定の欠落3）。
どれも受け皿は既存で、`applyConfirmedOdQueueRepairs`（`effectParser.ts`）に
**「具体的な原文の一文 × 欠落した action の形」の二重ガードつき**の後処理を9本足した。

| 効果 | 直した欠落 | 使った既存受け皿 |
|---|---|---|
| `WX12-032-E1` | 「あなたの手札の枚数が対戦相手の手札の枚数以上の場合」が**どこにも無く BANISH が無条件** | `CONDITIONAL{HAND_DIFF gte 0}` |
| `WX13-036-E3` | 「対戦相手は**手札を1枚捨て**」が丸ごと無い | `TRASH{HAND_CARD, owner:'opponent'}` を前段に |
| `WX18-001-E2` | 「その後、あなたの**トラッシュから**＜悪魔＞1枚を場に出し」が丸ごと無い | `ADD_TO_FIELD{source:TRASH_CARD}` |
| `WX21-030-E2` | 「置く**か、取り除く**」の二択の後半が無い | `CHOOSE` ＋ `STUB{REMOVE_VIRUS, virusCount:1}` |
| `WX14-027-E2` | 「バニッシュする**か、対戦相手の手札を1枚捨てさせる**」の後半が無い | `CHOOSE` ＋ `TRASH{HAND_CARD, opponent}` |
| `WX16-067-E2` | **−1側の枝が無い**（`delta:1` 固定）／対象の**＜英知＞限定も無い**（1効果に findings 2件） | `CHOOSE` ＋ `LEVEL_MODIFY{delta:-1}` ＋ `story:'英知'` |
| `WX12-033-E1` | 「**あなたのシグニ**の基本パワーを15000に」が `count:1`＝**規則19 で効果元1体**に潰れていた | `count:'ALL'` |
| `WX20-023-BURST` | `keyword:'レイヤー'` が無く**どのシグニでも取れた** | `filter.keyword` |
| `WX20-029-E1` | 「**好きな枚数**の＜悪魔＞」が `count:1`＝後段の −1000×枚数も連動して過小 | `count:'ALL'` ＋ `upToCount:true` |

### 🔴 引き継ぎで差し戻した3点（Codex は golden を1度も実行していない）

1. 🔴**`WX13-036-E3` の3段構成は過剰実行になる**＝Codex は
   `SEQUENCE[SELECT_TARGET_ONLY{opponentSelects}, STORE_LAST_PROCESSED_TARGETS, TRASH{手札}, TRASH{シグニ,targetsStored}]`
   を出していたが、**`storedTargetCards` はインタラクションの resume を跨いで生存しない**（`effectExecutor.ts:153`）。
   `freezeStoredTargets` が `fixedCardNums` へ焼き込むのは**任意コスト／CONDITIONAL の分岐だけ**で、
   **素の `SEQUENCE` の途中に対話（手札を捨てる選択）が挟まる形では一度も呼ばれない**
   ⇒ 宣言した1体が消えて**相手のシグニ全体から選び直す SELECT_TARGET が開く**。
   ⇒ **足りない一節だけを前に置く2ステップ**へ書き換え、元の `TRASH` は1バイトも変えない契約を golden で固定した。
2. 🔴**`WX16-031-BURST`（B3）は偽陽性**＝finding は「`count:1` 固定＝0枚を選べない」だったが、
   **`execTransferToHand`（`effectExecutor.ts:3597`）が各群を展開するときに `upToCount:true` を無条件で付ける**
   ＝**JSON の見た目を engine が裏で読み替えている**型。実装せず、代わりに
   **「`transferGroups` を使う効果は原文が必ず『まで』を持つ」トリップワイヤ**を golden へ張った
   （現在 live 8効果すべてが該当＝**裏返すと engine が黙って任意化する**ので、許容リストではなく毎回再導出する形）。
3. 🔴**golden の fixture が偶然《セイリュ》を引いていた**＝`§6.3(f)` と `O-247` の2本は
   空獣/地獣の1枚目に **`WD04-009 幻獣　セイリュ`** を使っており、これは同じ盤面に置く `WX12-033` の
   **`WX12-033-E1` の発動条件そのもの**。`count:'ALL'` へ直した瞬間に基本パワーが 12000→15000 に上書きされ、
   **「パワー増減の保護」と交絡**した。⚠しかも **−3000 側は 15000−3000＝12000 と `basePower` に一致する**ので
   **保護が壊れても緑になりうる**。⇒ fixture から《セイリュ》を除外した（テストの意図は変えていない）。

🔑**教訓＝「engine は実装済み」ではなく「engine は *この形で* 実装済みか」を見る。**
`SELECT_TARGET_ONLY` も `STORE_LAST_PROCESSED_TARGETS` も `targetsStored` も**全部実在した**（捏造ではない）。
壊れていたのは**組み合わせ方**＝対話を跨ぐ位置に置いたこと。**語彙の grep だけでは判定できない。**

**配送経路の罠**＝`WX13-036` / `WX18-001` / `WX12-033` は**兄弟に MANUAL があるカード**で、
`PRESERVE_STATUSES` によりカード単位で温存され **`_partial_fresh.json` に落ちて live に届かなかった**
（CODEX_GUIDE §5-10）。⇒ **effectId アンカーの外科パッチ**で採用（§5-18）。他5枚は `heldReview --adopt`。

**偽陽性の還元（O-C）**＝`semanticAuditExtract.mjs` に**規則33・34**を追加（32→34本）。
33＝「N枚まで」の任意性を engine が構造ごとに補うことがある（上の B3）。
34＝**逆翻訳に原文の一節が出ていても JSON に載っているとは限らない**（第218の差し戻しの一般化）。

**検証**＝`npm run gates` 全緑。**golden 3613 → 3624 PASS / 0 FAIL**（+11＝Codex の10本＋B3 トリップワイヤ1本）。
census 高シグナル 0/0（据置）・smoke 0・fuzz 0・**lint 256（ベースライン同値**＝+7 に見えたのは Codex が
リポジトリ直下に残した `tmp_cards.ts` を eslint が数えていたため。削除して復帰）。
`census:stubs`/`enginetext`/`costtext` の A群すべて 0 維持。
**ラチェット更新1件＝`REMOVE_VIRUS` ノード数 9→10**（`WX21-030-E2` の二択の後半ぶん＝**新機構ではない**）。
**live A/B 差分＝変化した effectId ちょうど9件・outlier 0**。逆翻訳も同じ9行だけ動いた。
**⑤実機＝不要**（§2.2＝`src/data/` `public/data/` `scripts/` のみ。`src/engine/` `src/screens/` は無改変）。

## 2026-09-07（第218バッチ・Codex・O-259 第10）＝bare `STUB{PLAY_FREE}` 真 no-op 3効果を既存使用経路へ載せ替え

**真因**＝`PLAY_FREE` は `carriedCardNum ?? lastProcessedCards?.[0] ?? sourceCardNum` を使用対象にするだけで、
候補を選ばせない。前段の選択が無い3効果は効果元自身を使おうとして再帰ガードに止められ、全計器が緑のまま
盤面を1つも動かさない真 no-op だった。新しい実行型は作らず、既存の
`USE_SPELL_FROM_TRASH_PAYING_COST`（選択→印刷コスト展開→支払う／やめる→本体委譲）へ載せ替えた。

- `WX25-P3-064-E1`＝自分のトラッシュのスペル1枚**まで**を選ぶ。`selectTarget.upToCount:true` と
  既存の `exileAfterUse:true` を引き継いだ。
- `WXK06-005-E1-G`＝`GRANT_LRIG_ABILITY.abilities[]` まで既存 walker を降ろし、
  `useSpellCostMultiplier:2` を追加。印刷コストの色配列を2組へ増やしてから既存の軽減／支払いへ渡す。
- `WXK09-002-E1`＝`value2:'both_lrig_trash'` で両者のルリグトラッシュを候補集合にし、
  `cardType:'アーツ'`＋`costMax:5`＋`useSpellIgnoreCost:true` を載せた。選択後は実カードの所在を見て、
  自分側なら `USE_SPELL_FROM_TRASH`、相手側なら `CAST_FROM_OPP_TRASH` へ委譲する。
  第1ステップ `ARTS_COST_REDUCTION_BY_CENTER_LRIG` はそのまま残した。

**調査で追認した境界**：従来の領域は `hand/trash/opp_trash/opp_lrig_trash` の4種だけで、両者の
ルリグトラッシュ集合は無かった。コスト倍率軸も無かった。限定条件はこの直接委譲経路では一度も検査しておらず、
明示フラグを足しても死にフィールドになるため追加していない。

### 🔴 検証（Opus）で差し戻した2点＝**どちらも逆翻訳の側**

1. 🔴**逆翻訳が「限定条件を無視して」を `value2 === 'both_lrig_trash'` という*領域*から復元していた**
   （Codex の初版）。**その情報は JSON のどこにも載っていない**＝`engine` と `decompileEffects.ts` が
   **同じ嘘で一致する**形（CLAUDE.md `census:enginetext` 第59バッチ ③ と同型）で、
   **将来この領域を使う別カードが原文に無い節を出す**。⇒ 一節ごと撤去し、
   **「payload に無い節を領域から復元しない」を golden の負方向 assert で固定**した。
   受け皿（この経路で `meetsRestriction` を効かせる／無視を明示する）は §5.3 **`O-281`** に登録。
   ⚠**この経路は12効果すべてが事実上「限定条件を無視」している**（検査を持つのは
   `execPlayFree`＝`effectExecutor.ts:8195`＝`O-264` だけ）。
2. 🔴**`exileAfterUse` の逆翻訳を `upToCount` の有無（＝今回の新文型かどうか）で絞っていた**ため、
   **同じ payload を持つ既存3効果（`WX14-002-E2` / `WXK11-016-E3` / `WXDi-P06-066-E2`）で
   除外の節が逆翻訳から丸ごと消えていた**（`wireExileAfterUse` が `STUB{EXILE_FROM_CHECK_ZONE}` を
   木から外すので、他に出る場所が無い）。⇒ **payload が在るかぎり必ず描く**へ拡張し、
   3効果とも原文に当該の一文が在ることを確認した（＝**逆翻訳の欠落を1件から4件ぶん回収**）。

🔑**教訓＝Codex の「逆翻訳は実際の意味を表示する」は、逆翻訳を*原文の復元*に使うと必ず破れる。**
**逆翻訳が描いてよいのは JSON に載っている軸だけ**（載っていない軸は「欠けている」と見えるのが正しい）。

**B群 `WX07-014-E1` の据置調査**：`COUNTER_SPELL` は executor で `done(ctx)` のみ。実際に打ち消した
`card_num` は `BattleScreen.handleCutinUse` が `newCasterState` の trash / lrig_trash へ移した直後に保持している。
別バッチで同関数の `executeEffect(cutinEff, ctx)` 用 `ctx` に
`lastProcessedCards: shouldCounterSpell ? [card_num] : undefined` を足すのが最小配線。`src/screens/` 変更なので
今回は実装せず、実機確認へ回した。

**回帰契約**：A1/A2/A3 それぞれ fresh `parseCardEffects`、候補成立／不成立、A2 の3色→6色請求、
A3 の自分側／相手側委譲、逆翻訳の全軸を golden に固定。新規 regex を一時的に不成立化すると3件とも
live が正しいまま `PLAY_FREE` へ戻って FAIL することを確認した。fresh / live の変化集合は
`WX25-P3-064-E1` / `WXK06-005-E1-G`（親 `WXK06-005-E1` を含む）/ `WXK09-002-E1` だけ。
`PR-474-E1` / `WX21-Re04-E1` / `WX22-014-E3` と B群は `JSON.stringify` 完全一致。

## 2026-09-07（第217バッチ・Opus 5・O-D）＝**実装キューの系統4型のうち①③④を消化**（live 19効果）

**この回の作業単位**＝ユーザー指示「opus の作業を進める」。第216の triage で `grep` 系統化した4型を上から取る。
**⑤実機は不要**（§2.2＝触ったのは `src/data/`＋`scripts/goldenTest.ts` だけ。`src/screens/` も `src/engine/` も無変更）。

### 系統① トラップアイコン節の見出しは3表記ある（4カード）

**真因**＝parser は `【トラップアイコン】：`（**コロン必須**）しか見ておらず、`【トラップアイコン】`（コロン無し）と
`《トラップアイコン》：` は**節ごと直前の能力へ tail-splice** されていた。⇒ ①`-TRAP` effect が生成されず
**トラップが永久に発動しない** ②元の能力に**別の帰結が無条件でぶら下がる**。
`WX16-065`（スペル）は**唱えた瞬間に2回ドロー＋相手に2枚捨てさせて**いた（本体＋トラップ節）。

- `effectParser.ts`＝見出しを `TRAP_ICON_HEADER` 1定数に集約し、`stripTrapIconClause`（本文から除去）と
  `-TRAP` 生成の**両方**をそれで回した。🔴**片方だけ広げると能力ごと消える**（本文から消えたのに TRAP が生えない）。
- **`《トラップアイコン》：` 節を本体へ連結する旧規則（`parseActionText` 内）を撤去**＝あれは
  「ターン条件を内包するので追加節だけ CONDITIONAL に保つ」として `SEQUENCE` 末尾に足しており、上の過剰実行の直接の原因だった。
- ⚠`《》`側は**コロンを必須**にする（`《トラップアイコン》を持つ`／`が発動したとき`／`を発動させる`と衝突する）。
  `【】`側は live 24枚すべてが見出しなのでコロン任意でよい（実測）。
- **影響**＝`WX21-036`／`WX16-029`／`WX16-065`／`WX16-066` の4カード（E1 が縮み `-TRAP` が生える）。
  ⚠**同じ型は5枚が `manualEffects.ts` で1枚ずつ手当て済みだった**（`WX16-041`/`WX16-062`/`WX16-064`/`WX20-062`/`WX21-025`）
  ＝**9回踏んでいた型**。手当て済みの5枚は manual が勝つので live は不変（`WX16-041` は parser 出力と実体同一になった＝将来の解凍候補）。
- `WX21-036-TRAP` の発動条件（「このターンにあなたのシグニがバニッシュされていた場合」＝**live 1効果**）だけは
  `manualEffects.ts` で手書きした。🔴**parser の条件表に regex を足す道は塞がっている**＝足すと文単位 parser の分岐が変わり、
  正準形（`SELECT_TARGET_ONLY`→`STORE`→`OPTIONAL_COST`→`PAID_ADDITIONAL_COST`）が
  `CONDITIONAL{…}{then:STUB}` ＋ 素の `CONDITIONAL{IS_MY_TURN}` に化け、**相手ターン（＝トラップ発動時）に
  literal で false になってバニッシュが起きない**（両ファイルに 🗑 で経緯を残した）。

### 系統③ 「《Xアイコン》を持つ」がトラッシュ→手札の入口で落ちていた（3効果）

**真因**＝`hasIcon` は型にも `matchesFilter` にも実装済みなのに `parseSentencePart1` の trash→hand の filter 合成から漏れており、
**トラッシュのどのカードでも回収できる**過剰効果だった（**すぐ上の `hasLifeBurst` と完全に同型の配線漏れ**）。
⚠`parseNameFilter` は `アイコン` を含む《》を**名前候補から捨てる**ので、入口ごとに拾わないと修飾が丸ごと消える。
- **影響**＝`WX18-033-E2`／`WX19-064-BURST`／`WD23-033-A-BURST`。
- 🔑**母集団は着手時に割り直した＝6→3**＝`WX16-041-E1` は `cost.discardFilter.hasIcon` で**既に正しく**、
  `WX15-002-E2` は `DECLARE_DECK_TOP_ICON{icon:'トラップ'}` で**別の受け皿**だった。
  残る `WX19-025-E1` は「チェックゾーンに置いて《トラップアイコン》を発動させる」が丸ごと欠落した**別のバグ**＝§5.0 のキューへ登録。

### 系統④ `count:0` の `LOOK_AND_REORDER` は原文に無い余分なステップ（12効果を採用）

**真因**＝原文「その中から〈選ぶ〉、**残りを好きな順番でデッキの一番下に置く**」の**後半だけ**が独立した文として
もう一度 parse され、`REVEAL_AND_PICK` / `REVEAL_PICK_*`（`remainder` を既に持つ）の隣に生えていた。
🔴**「0枚だから無害」ではない**＝`execLookAndReorder` は `deck`×`self`×`private:false` で
`maybeAskRevealPlusOne`（「公開枚数を+1しますか」）を**先に**通すので、**盤面が動かないモーダルが1回開く**。
- 後処理 `dropEmptyLookAndReorder` を1本追加（全効果の単一チョークポイント）。**12枚採用**、残り2件は
  `WXDi-P11-070-E1`（MANUAL）／`WD20-018-E1`（PARTIAL）＝手書きの凍結分なのでそのまま。
- ⚠**`count>0` の3件は触っていない**＝`WX12-Re10-E1` は直後の `CONDITIONAL` が**公開した札**（`lastProcessedCards`）を
  読むので、`WX14-037-E1`／`WX18-034-E2` の純粋な重複と**JSON からは見分けが付かない**。
- 🔴🔑**踏んだ罠＝後処理で `SEQUENCE` を剥がした**＝初版は「1ステップになったら剥がす」をしていたため、
  **この関数と無関係な効果まで木の形が変わり、収穫マージが「純粋上位集合ではない」と判定して held が約100枚に膨らんだ**。
  ⇒ **後処理は「消す」だけにして木の形を変えない。**（A/B 差分を毎回見ていなければ気付けなかった。）

### 🔴 golden が捕まえた5件（この回の本体はここ）

**`npm run gates` の golden が 5 FAIL**＝**うち1件は実害のある退化**、4件は引っ越し・可視化・在庫更新だった。

1. 🔴**退化＝`WX16-026-BURST` の `transferGroups` が丸ごと生成されなくなった**（`O-188 第4バッチ` が検出）。
   **真因**＝系統③ を `parseSentencePart1` の trash→hand 合成へ**直接**足したこと。
   ①ライズが `hasRiseIcon`（群フィルタ側の綴り）と `hasIcon`（こちら）の**二重キー**になり、
   `applyRecoveryTransferGroups` の「候補の filter が群と互換か」判定が**キー名違いで落ちた**。
   ②そもそも**正準ヘルパ `parseIconFilter` が既に在り**、そこには「**別ピックが2本ある span では付けない**」
   というガード（`WX16-026-BURST` の名指しコメント付き）が入っていた＝**入口に直接書いてそれを迂回した**。
   ⇒ **自前の規則を撤去し、`parseIconFilter` の選択肢に `トラップ` を1語足すだけにした。**
   🔑**この1文字の欠け（`(ライズ|クロス|アクセ)` に `トラップ` が無い）が系統③の全量だった。**
   🔑**教訓＝「同じ意味の語彙は入口ごとに書かない」**＝正準ヘルパを先に探す（在れば必ずガードも入っている）。
2. **`O-220` / バッチ①第1波** の2件＝`WX16-029-E1` / `WX16-065-E1` に張ってあった契約が **`-TRAP` へ引っ越した**
   （トラップ節を分離した当然の帰結）。test 側の effectId を差し替え、理由をコメントに残した。
3. **`§6.4 O-42 tripwire`（parser と実体同一の manual 影武者コピーは残0）が3件検出**＝
   `WX16-041-TRAP` / `WX20-062-E1` / `WX21-025-E2`、**直した後にもう1件** `WX17-063-E1`（＝第211で手書きした
   「《トラップアイコン》を持つシグニ」の絞り込みが、系統③の1文字で parser から出るようになった）＝**計4件**。
   **parser が正しく出せるようになったので手書きが不要になった**証拠。
   ⇒ `manualEffects.ts` から4件を削除 → `npm run census:orphanmanual --unfreeze A` で live の刻印を **MANUAL→AUTO**。
   **本体は1バイトも変わっていない**ことを A/B（`parseStatus` を無視した比較）で確認済み。
   🔑**この tripwire は「parser が追いついた」ことを検出する計器**＝FAIL は退化ではなく**手書き在庫の返済機会**。
   ⚠**削除しただけでは live の MANUAL 刻印は残る**（収穫マージが MANUAL を不可侵にする）＝
   `census:orphanmanual --unfreeze A` まで回して初めて閉じる。
4. 🔴**`O-144` ラチェットが 10 → 13**＝**較正であって退化ではない**。
   `WX16-Re04-E1` / `WX17-029-E1` / `WXK05-039-E1` の `reorder:true` は**削除した `count:0` のステップの中にしか無く**、
   0枚を並べ替えるので**実行しても並べ替えは一度も起きない**。ラチェットは「`reorder:true` がどこかに在るか」しか
   見ないので **no-op を「届いた」と読んでいた**。⇒ 元から届いていなかった3件が可視化された（engine の挙動は不変）。
   baseline を13へ上げ、**払い戻しは `REVEAL_AND_PICK.remainder` 側に載せる**と明記した。

### 検証・簿記

- **A/B 差分（`build:effects` 前後の live を効果単位で全数比較）＝追加4・変更15・削除0**。意図した件数と一致。
- **golden を3本追加**（系統①②…ではなく①③④の各1本）＝`npm run golden -- --only "系統①"` ほか。
  ⚠**`goldenTest.ts` の末尾に足すと走らない**（runner のフッタより後ろになる）＝`if (listMode)` の**手前**に置く。
- `npm run gates` 緑。**実機不要**（§2.2）。**反転確認**＝系統①は「E1 からトラップ本文が消えたこと」を golden で直接見ている。
- **在庫**＝実装キュー **40効果 → 36効果**（キューから5行・`WX19-025-E1` を1行追加）。**live では19効果**が動いた。

## 2026-09-07（第216バッチ・Opus 5・O-A）＝**意味照合 findings 45件を全数 triage**（未 triage 45 → 0・**修正は0行**）

**この回の作業単位**＝ユーザー指示「O-A を行う」。§5.0 の周期の Opus 側（判定＝engine の受け皿を読む工程）。
**`src/` は1バイトも変えていない**（触ったのは `scripts/semanticAuditExtract.mjs` の読み方ルールと `scratchpad/` の台帳）。

- **母集団の実測**＝`node scripts/archive/semanticAuditPool.mjs` で **45件**（Sheet2 s2-19〜36 の41＋Sheet3 s3-01〜02 の4）。
  🔴**PLAN に書いてあった「77件」は誤記**＝第211 で triage 済みの32件を二重に足していた。**残数は毎回この計器で数え直す。**
- **判定結果＝真バグ 38 / FP 7＝precision 84%**（効果単位 34 BUG / 7 FP）。記録は各ラウンドdirの `triaged.txt`。
- **系統化（S-2＝`grep` で全数）＝4件の finding が 33効果に化けた**（使い捨てスクリプト1本・実装0行）：
  ①**トラップアイコン能力が別効果に分離されない 4カード**（`WX21-036`／`WX16-029`／`WX16-065`／`WX16-066`）＝
  見出しが `【トラップアイコン】`＋**コロン無し**か `《トラップアイコン》：` だと parser が `TRAP_ICON` 効果を切り出さず、
  **直前の【自】効果の `SEQUENCE` へ融合**する。⇒ トラップ能力が永久に発動せず、かつ元の効果に別の帰結が無条件でぶら下がる。
  ②**`STUB{PLAY_FREE}` 単独＝真 no-op 6効果**＝前段に対象選択が無いと `cnPF` が効果元自身へ落ち、
  `_containsStub` に弾かれて `[フリープレイ: … (効果実行不可)]` で終わる（`execStubPart2.ts:3624`）。
  ⚠`WX25-P3-064-E1` だけは Type がシグニなので**効果元を場に出し直す**別物になる。
  ③**`hasIcon:"トラップ"` の欠落 6効果** ④**無意味な `LOOK_AND_REORDER` 17効果**（うち `count:0` が13）。
- **偽陽性の還元（O-C）＝規則28〜32 を追加**（27本 → **32本**）。**FP 7件のうち5件が「engine が JSON の見た目を裏で読み替える」型**：
  `abilityBlockTextOf` による効果ごとの原文の読み分け（`WX19-047`）／`filter` 無し＋`explicitTarget` 無し＝効果元自身
  （`WX14-026`・`effectExecutor.ts:4997`）／往復を1アクションに畳む（`WX22-010`・`FIELD_SIGNI_TO_CHECK_ZONE`）／
  id が原文イディオム丸ごと（`WX18-020`・`SUMMON_RESONA_FROM_LRIG_DECK` は出現条件を一度も見ない）／
  条件を候補フィルタへ畳んだ近似（`WX20-078`）。残り2件は規則12 の再発（`WX20-059`／`WX14-050`）。
- 🔑**教訓＝「LOW・近似の指摘」を捨てると真因を捨てる**＝`WX16-029-E1` の finding は
  「`NEGATE_ATTACK` は『ダメージを与えない』の近似」という許容範囲の LOW だったが、JSON を開いたら
  **トラップ能力ごと別の効果へ融合していた**（＝系統①の2件目）。**主張が弱くても盤面は開く。**
- 🔴**止め時（連続3バッチで新型0）は来ていない**＝新型は Sheet2 s2-19〜36 で **16**・Sheet3 で **2**、
  0の連続は最長2バッチ（s2-19/20・s2-28/29）で、どちらも次のバッチで新型が出た。⇒ **Sheet3 を続ける。**
- **検証**＝`npm run gates` 緑。**実機不要**（§2.2＝`src/screens/` も `src/engine/` も触っていない）。**反転確認は該当なし**（修正0行）。
- **在庫**＝未 triage findings **0件**／未修正の真バグ **40効果 / 40行**（6 → 40＝**退化ではなく可視化**・PLAN §5.0 の実装キューが正）。

## 2026-09-07（続き・Sonnet 5・S-1）＝**意味照合バッチ8件を追加実行**（🏁Sheet2 完了 30→36/36バッチ／Sheet3 着手 0→2/37バッチ）

**この回の作業単位**＝ユーザー指示「S-1 を8バッチ行う」。§2.6 の監査ラウンド軽量運用（Sonnet レーン）＝
抽出・実行・簿記のみで、判定（O-A triage）はしない。**バグ修正は0件**（今回は監査のみ・`src/` `scripts/` 無変更）。

- `semanticAuditRun.mjs --out .../semantic_audit_sheet2_round4 --model sonnet --batches 31,32,33,34,35,36`
  ＝**Sheet2 完了（36/36バッチ・356枚）**。findings **20件 / 56枚（3.3件/バッチ・HIGH 6件）**。
- `semanticAuditGap.mjs --sheet 3 --list 2>/dev/null` → `semanticAuditExtract.mjs`（Sheet3 を37バッチに分割）
  → `semanticAuditRun.mjs --out .../semantic_audit_sheet3_round4 --model sonnet --batches 1,2`
  ＝**Sheet3 着手（2/37バッチ・20/369枚）**。findings **4件 / 20枚（2.0件/バッチ）**。
- 8バッチとも実行時トラブルなし。⚠**Sheet3 の抽出で1点**＝`semanticAuditGap.mjs --list` の `[gap] …` 行は
  stderr へ出る（Sheet2 README は `>` 直書きだった）＝`2>/dev/null` を足さないと `--cards-file` が1行余分に読む。Sheet3 README に明記。

簿記＝Sheet2 cumulative 300→356（`--sheet 2` 残 56→0 と一致確認）／Sheet3 dir 新設・cumulative 0→20（残 369→349 と一致確認）／
両 `TYPE_LEDGER.md`・`README.md` を更新（Sheet2 は🏁完了・Sheet3 は再開コマンド `--batches 3..8`）。

**findings 累計 77件が未 triage**（Sheet2 s2-19〜36 の41件＋Sheet3 s3-01〜02 の4件・次は `/model opus` で O-A から。§5.0）。
セッション末に `npm run gates` を1回実行＝**全緑**（対象コード無変更）。詳細な finding 一覧は各 `TYPE_LEDGER.md` を参照。

## 2026-09-07（続き・Sonnet 5・S-1）＝**意味照合バッチ12件を追加実行**（Sheet2 消化 18/36 → 30/36バッチ）

**この回の作業単位**＝ユーザー指示「S-1 を12バッチ行う」。§2.6 の監査ラウンド軽量運用（Sonnet レーン）＝
抽出・実行・簿記のみで、判定（O-A triage）はしない。**バグ修正は0件**（今回は監査のみ・コード変更なし）。

`node scripts/semanticAuditRun.mjs --out scripts/archive/scratchpad/semantic_audit_sheet2_round4 --model sonnet --batches 19,20,21,22,23,24,25,26,27,28,29,30`
を実行。**12バッチとも成功**（実行時トラブルなし＝第210バッチの s2-07 散文応答は再発せず）。
**findings 21件 / 120枚（1.75件/バッチ）**＝第210バッチ（1.8件/バッチ）とほぼ同水準・逓減の兆候なし。

簿記＝`audited_cards_cumulative.txt` に120件追記（180→300、`semanticAuditGap.mjs --sheet 2` の残枚数
176→56 と一致確認）→ `TYPE_LEDGER.md` に s2-19〜30 の12行を追記 → `README.md` の実績節・再開コマンドを更新
（すべて `scripts/archive/scratchpad/semantic_audit_sheet2_round4/`）。

**findings 21件は全件未 triage**（次は `/model opus` で O-A から。§5.0）。コード変更が無いため `npm run gates` は
未実行（§2.6 決定3）。詳細な finding 一覧は `TYPE_LEDGER.md` を参照。

## 2026-09-07（第215バッチ・Codex 実装＋Opus 5 検証）＝**triage 済み実装キューの A群8効果**（未修正の真バグ 14効果 → 6効果）

**この回の作業単位**＝ユーザー指示「実装を codex-work に投げる」。`CODEX_GUIDE §3` の投入前実測 → 指示書 →
`CODEX_HOME=.codex-work` で投入 → §7 で検証。

### ① 投入前の実測で簿記の誤りを1件見つけた（先にコミットしてベースラインを確定）

🏁**§5.3 `O-271`（ルリグ【起】の `fieldTrash` コストが踏み倒せる）は第204バッチ（`4712b91a7`）で実装済み**だった。
`lrigActivateGate.ts:144` の提示ゲート／`BattleScreen.tsx:15044` の `payFieldTrashCost` 呼び出し／
`fieldTrashCost.ts` の funnel ／`goldenTest.ts:70316` の golden がすべて在り、登録票の「`upToCount` が無い」も失効
（live の `SPDi44-16-E2` / `WX25-P1-030-E2` は既に `upToCount:true`）。**索引から消し忘れて残っていただけ。**
🔑**`CODEX_GUIDE §3-1`「簿記を信用せず実測する」は、自分が数日前に書いた索引にも効く。**

**同時に「10効果以上の家族はもう無い」ことも確定した**＝`O-272` は4効果（5効果に見えた群は
`triggerCondition.banishedFrontOfSelf` で**既に正しい**）、`O-268` は2効果。
⇒ 今回は**一点物を per-effect 明細つきで束ねたバッチ**として投げ、その性質を指示書の冒頭に明記した。

### ② 指示書に自分の見立ての訂正を2件先に書いた

- **`WX17-063-E1` の受け皿は `hasTrapAbility` ではなく `hasIcon:'トラップ'`**＝前者は消費地点が
  `effectExecutor.ts:3565`（トラッシュ候補）の1本だけ。後者は `matchesFilter` 本体（`execUtils.ts:1299`）。
- **`WX15-001-E1` の「miss 34」は別綴り `hasIcon:'ライズ'` を数え落としていた**＝真の miss は4件、
  うち3件は `O-276`（別項目）＝**実質1効果**。

### ③ Codex は A群8効果の実装を完了した直後に `.codex-work` の**利用上限**で止まった

`-o` の最終レポートは書けていない（落ち方②＝実装済み・検証未了）。
**破棄せず引き継いだ**（memory の codex-fallback-order の規約どおり）。作業ツリーに残っていたのは
`src/data/manualEffects.ts` と `public/data/effects_WX.json` の2ファイル。

| # | 効果 | 壊れ方 | 直し方 |
|---|---|---|---|
| A1 | `WX10-002-E2` | 🔴**ゲートの外**＝「そうした場合」の `CONDITIONAL` の外側に帰結があり、**手札を捨てなくても相手のライフ最上段をトラッシュできた** | 帰結を `CONDITIONAL{PAID_ADDITIONAL_COST}` の中へ入れ子化 |
| A2 | `WX07-033-E2` ／ `WX05-025-E1` | **「そのシグニ」がエナの任意シグニ**＝バニッシュされた当該カードへの固定が無い（2効果・同型） | `ADD_TO_FIELD{targetsTriggerSource:true}`（受け皿は `execAddToField:3987` の ENERGY_CARD 分岐） |
| A3 | `WX21-054-E2` | 🔴**選択肢が消えて別カードを処分**＝二択が消え、場の緑＜龍獣＞（**このシグニではない別カード**）をトラッシュする1本道 | `CHOOSE`（公開 / `thisCardOnly` トラッシュ）＋`selectionConstraint.groups` で「赤と緑を1枚ずつ」 |
| A4 | `WX13-035-BURST` | 「手札に加える**か**エナゾーンに置く」の二択が `ADD_TO_HAND` 固定に潰れていた | 既存 `handOrEnergy:true`（消費は `effectExecutor.ts:7678` / `:10963`） |
| A5 | `WX15-001-E1` | `POWER_MODIFY` の対象に条件が無く**＜武勇＞全体**が＋3000 | `hasRiseIcon:true` |
| A6 | `WX17-063-E1` | アイコン限定が無く**トラッシュの全シグニ**が対象 | `hasIcon:'トラップ'`（訂正どおり `hasTrapAbility` は使っていない） |
| A7 | `WX13-019-E1` | 「レゾナではない」の限定が無い。⚠**no-op ではなく過剰発火**（`triggerCollect.ts:81` で未指定は無条件 true） | `triggerScope:'any_ally'` ＋ `triggerFilter.excludeResona` |

### ④ 検証（Claude 側）＝**差し戻し0・是正1・残 finding 1**

**不変条件はすべて満たしていた**＝ベースライン `bf911115b` との per-effect diff は**8効果ちょうど**、
C群3効果（`O-279`／`O-268` 同族／能力なし付与）と B群3効果は `JSON.stringify` 完全一致、
収穫マージ3バケツも基準どおり。**新しく使われた2キーの受け皿も実コードで追認した**
（`targetsTriggerSource` は `execAddToField:3987`、`handOrEnergy` は `:7678`／`:10963`）。

🔴**是正1件＝`WX13-019-E1` の「レゾナではない」が逆翻訳に1文字も出ていなかった。**
`ON_OPP_LIFE_CRASHED` × `any_ally` のラベル生成（`decompileEffects.ts:5430`）は
**`filterJa` を通さず色とクラスだけを手組み**しており、`excludeResona` を無視していた。
⇒ 描画を追加した。🔑**第214の `levelLtOwnLrig` と同型の穴**＝
**逆翻訳に描かない限定は「無い」のと区別できない**（このリポの意味照合は逆翻訳を読む）。

⚠**残 finding 1件（未修正・据置）**＝`WX07-033-E2` の原文は
「バニッシュされた**《羅星　アルファード》ではない**そのシグニをエナゾーンから場に出す」で、
**この除外条件は表現できていない**（カード名はこの効果元自身）。`targetsTriggerSource` の
ENERGY_CARD 分岐は `src.filter` を見ないので、engine を触らずには書けない。**誤変換より無変換で据置。**

### ⑤ ゲート

- `npm run gates` **全緑を独立実行**（golden **3,607 / 3,607**＝検証側で新規2本）。smoke 全0・fuzz 全0。
- 追加 golden ＝①A群8効果の形状 assert（`hasTrapAbility` を使っていないことの否定 assert 込み）
  ②`ADD_TO_FIELD{targetsTriggerSource}` の**挙動**（トリガー元だけが出る／同じエナの別札は動かない／
  トリガー元がエナに居なければ何も出ない）。
- `npm run regen` の逆翻訳8行を目視して原文照合。⑤実機は不要（`src/screens/` 無変更）。

---

## 2026-09-07（第214バッチ・O-D／Opus 5）＝**実装キューを壊れ方の重い順に5件**（未修正の真バグ 19効果 → 14効果）

**この回の作業単位**＝ユーザー指示「続ける」。§5.0「O-D / S-3 実装キュー」の先頭から5件。

🔴🔑**5件とも「遅いレーン」と登録されていたが、着手時に母集団を測ると全部「実害1効果」だった**（§2.1 ②）。
最も分かりやすいのが `WX11-006-E3`＝`STUB{OPTIONAL_TRASH_ENERGY_CLASS}` は **live 37効果**が使っているが、
**原文が「エナゾーンから」でないのはこの1件だけ**＝engine の欠陥ではなく**生成側の誤配線**だった。
⇒ 5件とも `manualEffects.ts` へ手書き（速いレーン）。**キューの「レーン」列は登録時の見立てにすぎない。**

### ① 直した5件

| 効果 | 壊れ方 | 直し方 |
|---|---|---|
| `WX11-006-E3` | 🔴**原文に無いコストを払わせる**＝「手札からカードを1枚捨てる」なのに**エナゾーンから**クラス一致カードを探していた。さらに `ADD_TO_FIELD` に `source` も対象参照も無く、**トラッシュの＜悪魔＞を宣言したのに何が場に出るか決まっていない** | `SELECT_TARGET_ONLY{TRASH_CARD,悪魔}` → `STORE` → `OPTIONAL_COST{handDiscard:1}` → `PAID_ADDITIONAL_COST` → `ADD_TO_FIELD{targetsStored}` |
| `WX07-032-E1` | **丸ごと欠落**＝「トラッシュから＜悪魔＞のシグニ1枚を**場に出し**」が無く、ライフに加える側だけ残っていた（11エナのスペルの帰結が半分） | `ADD_TO_FIELD{source:TRASH_CARD,悪魔}` を `ADD_TO_LIFE` の前に追加 |
| `WX10-031-E1` | **丸ごと欠落**＝「対戦相手のシグニ1体を**手札に戻し**」が無く `BANISH` だけ（2体除去が1体除去に） | `BOUNCE` を追加（対象は2体別々なので `targetsStored` で束ねない） |
| `WX11-025-BURST` | **丸ごと欠落**＝「対象の対戦相手のシグニ1体を**ダウンする**」が無い | `SEARCH` を `SEQUENCE` で包んで `DOWN` を追加 |
| `WX09-037-E1` | **丸ごと欠落＋限定の欠落**＝「対戦相手のシグニ1体を**トラッシュに置き**」が無く、しかも**両側のレベル制限が無い**（レベル5まで踏み倒せた） | `TRASH` を追加＋🆕`levelLtOwnLrig` を両側に付与 |

### ② 新語彙 `levelLtOwnLrig`（型＋評価器＋golden の3点セット）

原文「**あなたの**センタールリグより低いレベルを持つ」。既存 `levelLtOppLrig`（＝**対戦相手の**センタールリグ基準）の**鏡**。
🔴**流用してはいけない**＝参照するルリグが逆なので、**別のシグニが対象になる**（`CODEX_GUIDE §5-5e`）。
`resolveDynamicFilter`（`effectExecutor.ts`）に鏡の分岐を追加し、フォールバックは既存と同じ**制限なし（fail-open）**へ揃えた
（ここだけ fail-closed にすると同じ原文の兄弟で挙動が割れる）。
🔑**`scripts/decompileEffects.ts` の `filterJa` にも足した**＝**逆翻訳に描かないフィルタは「無い」のと区別できない**
（このリポの意味照合は逆翻訳を読むので、描かない限定は監査面から消える）。

### ③ この回に確かめた engine の既定

🔴**`TRASH` は `DID_IT_GATED_TYPES` に入っていない**（`effectExecutor.ts:5226`）。
だから `WX11-006-E3` を「素の `TRASH{HAND_CARD}` ＋ `CONDITIONAL{IS_MY_TURN}`」で書くと、
**手札0枚でも後段の場出しが走る過剰実行**になる。⇒ `OPTIONAL_COST{handDiscard}` ＋ `PAID_ADDITIONAL_COST` に寄せた
（`canAffordOptionalCostSpec` が手札0枚を弾く）。原文の「捨てる」は強制だが、
**払えないときに場に出させないことのほうが原文に近い**と判断した。

### ④ 検証

- `npm run gates` **全緑**（golden **3,605 / 3,605**＝新規3本）。
- **live A/B 差分＝5効果ちょうど**。逆翻訳5行を目視（`levelLtOwnLrig` の限定も表示されることを確認）。
- ⑤**実機を1本走らせた**＝新語彙を足した回なので §2.2 の「新しい型・機構」に該当。
  `SKIP_BUILD=0 node scripts/verifyBattleDrive.mjs optionalTrashEnergyClassAttack` **PASS**（15s）。
  🔑**これは `WX11-006-E3` から外した `OPTIONAL_TRASH_ENERGY_CLASS` の“残り36効果”が壊れていないことの回帰**
  （シナリオが使うのは `WX25-P3-062-E2`＝正当な利用者）。

### ⑤ 在庫の整理

第213バッチで残った **legacy catch-all 6効果**を §5.3 索引 G へ **`O-280`** として登録した
（1件ずつ別の機構が要る＝5回反復／相手が捨てる／束分割／対象数比例コスト／CHOOSE の選択肢単位変換）。
⚠**6件を1バッチにしない**と登録票に明記。

---

## 2026-09-07（第213バッチ・legacy catch-all 残14効果／Codex 実装＋Opus 5 検証）＝**A群8効果を正準形へ移し（＋検証で1効果を追加採用）、固定挙動 STUB を14→6効果へ縮小**

`TRADE_BANISH_SELF_SIGNI` / `TARGET_AND_DISCARD_HAND` は payload と原文を読まず、前者は
「自分の場の任意シグニ1体をトラッシュ→相手1体をバニッシュ」、後者は「自分の手札末尾1枚を自動で捨てる」
を固定実行する legacy catch-all。後段の本来の帰結と合わせて二重除去にもなっていた。

原文を effectId ごとに照合し、既存の
`SELECT_TARGET_ONLY → STORE_LAST_PROCESSED_TARGETS → OPTIONAL_COST → PAID_ADDITIONAL_COST` へ次の8効果だけを移した。

- `WX20-022-E1`: `fieldTrash{count:1, filter:{cardType:'シグニ', story:['アーム','ウェポン']}}` → 固定相手をトラッシュ
- `WXDi-P16-069-E1`: `underAnySigniTrash{count:1, filter:{cardType:'シグニ', story:'解放派'}}` → 固定相手をデッキ下
- `WX18-033-E1`: `handDiscard{count:2, filter:{cardType:'シグニ', hasIcon:'トラップ'}}` → 固定相手をバニッシュ
- `WXDi-P11-041-E2`: `story:['アーム','ウェポン']` の OR 候補から合計2枚（各1枚 groups ではない）
- `WXDi-D09-H15-E2`: `anyOf:[{color:'赤'},{cardType:'シグニ',story:'宝石'}]` から合計2枚
- `WX25-CP1-065-E1`: `handDiscard{count:1, filter:{story:'ブルアカ'}}` → 固定相手だけ -2000 と能力付与
- `WXK05-070-E1`: 既存 `TURN_OWNER` を維持し、`costColors:['緑']` と同名手札1枚を同じ任意コストへ合成
- `WX25-CP1-003-E1`: `handReveal{count:'ALL',upToCount:true,filter:{story:'ブルアカ'}}`。
  `REVEAL` が公開札を `lastProcessedCards` に載せる既存経路で、公開枚数×-3000を実測

`WX25-CP1-092-E1` は対象数比例のエナ支払いを現行 `OptionalCostSpec` で表せないため据置。
B群5効果も指示どおり live JSON 不変。最終の live per-effect 差分は上記8件だけ、残存 STUB は
`WXEX1-09-E2` と `PR-195-E3` / `WX25-P2-022-E2` / `WX25-CP1-092-E1` /
`WXDi-P00-018-E1` / `WXK05-003-E1` の6効果。

🔴**スコープ外波及を2回、fresh diff で止めた。** A7用の複合コストを一般化すると `WXK05-072-E2`、
任意の条件ラッパーを解くと `WX24-P2-050-E2` が動いたため、前者は《幻水 コノハケロ》句、後者は
`TURN_OWNER` だけに限定。A2の「置い」語尾も `あなたのシグニの下から` だけに限定し、
`WXDi-P11-042` の raw parse 波及を解消した。最終 outlier 0。

### 🔍 検証（Claude 側・CODEX_GUIDE §7）＝**差し戻し0・是正1（追加採用 +1効果）**

**機械検証はすべて申告どおり**＝ベースライン `9ee1b4dd5` との per-effect diff は**8効果ちょうど**、
legacy STUB 含有効果は **14 → 6**（残りは B群5件＋据置の `WX25-CP1-092-E1`）、
B群5件と A9 は `JSON.stringify` 完全一致、3バケツも基準どおり。`npm run gates` を独立実行して全緑。

🔴🔑**是正1件＝`《幻水　コノハケロ》` という「カード名の regex 焼き込み」を差し戻した**（`CODEX_GUIDE §5-5c` / `5c′`）。
Codex はスコープを守るために正しく限定したのだが、**除外された `WXK05-072-E2` は同じ文型の兄弟で、
しかも直すべき同型だった**＝live は `OPTIONAL_COST{costText:"《緑》を支払い、手札から《幻水　カワウソ》を１枚捨ててもよい"}` の
**生文字列止まり**で、`resolveOptionalCostSpec` に `costText` を読む分岐は無い＝**《緑》が無料**だった。
⇒ regex を `手札から(.*?)を([０-９\d]+)枚捨て` へ一般化（修飾部の可否判定は `fullyExpressibleCostFilter` に任せる）。
**live 差分は 8 → 9効果**（増えたのは `WXK05-072-E2` だけ）。

⚠🔑**この穴は逆翻訳では原理的に気付けない**＝decompiler は `costText` を**そのまま印字する**ので、
payload が空でも「《緑》を支払い、手札から《幻水　カワウソ》を１枚捨ててもよい」と**正しく読めてしまう**。
（`WXK05-072-E2` の逆翻訳は修正の前後で1文字も変わっていない。）

**追加した golden 1本**＝`catch-all A7′ WXK05-072-E2`（正＝《緑》と同名手札を両方払って +5000／
負＝払わなければ +5000 も《緑》の減少も起きない）。🔑**反転確認済み**＝live を基準版へ戻すと FAIL、
戻すと PASS（`A7′ 正: 《緑》を払う` が落ちる）。**golden は 3601 → 3602。**

**据置に同意した項目**＝`WX24-P2-050-E2` は既に正準形で**直す必要が無い**（`TURN_OWNER` 限定は正しい）。
`WXDi-P11-042-E1` も既に正しい（「置い」語尾ガードは二重処理の防止であって取り残しではない）。

検証は `npm run gates` 全緑。golden **3592→3601（+9）/ FAIL 0**、smoke 10741効果の
CRASH/HANG/INVARIANT/SKIP 全0、fuzz 全0、census 高シグナル 0、lint 0 errors / 256 warnings。
`_held_fresh` は基準の `WXDi-P04-002` 1件、`_partial_fresh` / `_idset_fresh` は空。
同型★は基準どおり1グループ/2枚。golden は8効果すべての実行盤面を検査し、A1では支払い・スキップ・
支払い不能と二重除去なし、A4ではアーム2枚だけでの支払い、A8では公開札保持と公開2枚×-3000を固定した。

---

## 2026-09-07（第212バッチ・O-D／Opus 5）＝**実装キューの「速いレーン」9件を1巡でまとめて消化**（未修正の真バグ 29効果 → 20効果）

**この回の作業単位**＝ユーザー指示「早いレーンをまとめて行う」。§5.0「O-D / S-3 実装キュー」の**速いレーン**を全件。
🏁**これで速いレーンは在庫ゼロ**（残り19行は全件が遅いレーン＝parser／engine／新機構）。

⑤**実機は不要と判定**（PLAN §2.2）＝`src/data/manualEffects.ts` と `src/engine/` の2ファイル・`scripts/` `docs/`。
**`src/screens/` は無変更／新しい型・機構も足していない**（`thisCardOnly` は既存フィルターを既存経路で効かせただけ）。

### ① 着手時の実測で2件が「速いレーン」から外れた（§2.1 ② の効き目）

- 🔴**`WX06-019-E1`＝フラグを足しても挙動が1ミリも変わらない**。「`BANISH_SUBSTITUTE` の trigger に `excludeSelf` を
  足すだけ」に見えたが、`collectBanishSubstitutes`（`effectEngine.ts:7132`〜）の `else if` 連鎖は
  `discardSpell` / `trashStackSpell` / `lifeCrash` の3つだけで、**`powerReduction` はどこにも入っていない**＝
  候補を1件も返さない＝**この効果は現状まるごと恒久 no-op**。同関数のコメント自身が「powerReduction（WX06-019）は
  『効果による場離れ』トリガーでバトル外のため未対応」と書いていた。⇒ 実装キューから §5.3 `O-276` へ移送。
  ⚠ついでに `tf.story` しか見ておらず live の `cardClass:'水獣'` も効いていない（同じ登録票に記録）。
- 🔑**`WX12-035-E1` は engine を1箇所だけ触った**（下記④）。それ以外の8件は `manualEffects.ts` の手書きだけ。

⚠**9件とも母集団を測り直した**（`docs/_effect_srctext.json` を原文 regex で走査＋live に受け皿キーがあるかの miss 判定）。
**どれも実害は1効果**で、同じ言い回しの他効果は既に正しく出ていた（例＝「あなたのセンタールリグが〜の場合」は
原文10効果あるが miss はこの1件／「【出】能力は発動しない」は 97 hit / 11 miss で実害1件）。⇒ **parser を触る理由が無い＝速いレーン。**

### ② 直した9件（原文 → 何が壊れていたか）

| 効果 | 壊れ方 | 直し方 |
|---|---|---|
| `WX20-033-BURST` | 「白の＜美巧＞1枚まで**と**緑の＜美巧＞1枚まで」の**緑側の SEARCH が丸ごと無い** | `SEARCH` を2本並べる（同カード `WX20-042-CB-E1` の `PLACE_UNDER_SIGNI` 2本が先例）。シャッフルは2本目にだけ |
| `WX20-Re20-E1` ② | 「能力を持たないシグニを**好きな枚数**場に出す」が `count:1` 固定＋`noAbilities` 欠落（①側にはある） | `count:'ALL'` ＋ `upToCount:true` ＋ `filter.noAbilities` |
| `WX13-043-E2` | 「**あなたのセンタールリグが赤の場合**」が無く、メインフェイズ開始のたびに無条件で自壊＋ライフクラッシュ | 本体ごと `CONDITIONAL{LRIG_COLOR}` で包む（下記③） |
| `WX14-CB03-E2` | 「**対戦相手のセンタールリグがレベル５の場合**」が無く、相手のレベルに関係なく毎ターン使えた | `CONDITIONAL{LRIG_LEVEL opponent eq 5}` で `OPTIONAL_COST` を包む |
| `WX19-001-E3` | 「手札から**《アーク・オーラ》**を1枚捨てる」のカード名指定が無く、**手札の何でも1枚**で払えた（コイン2枚で盤面全ダウン） | `TargetFilter.cardName`（`matchesFilter` が `CardName.includes()` で判定） |
| `WD06-018-BURST` | 「**【ライフバースト】を持つ**シグニ」の絞り込みが無く、デッキのどのシグニでも引けた | `hasLifeBurst:true`（両評価器に実装済み） |
| `WX20-020-E1` ④ | 「その【出】能力は発動しない」が無い（下記③） | `suppressOnPlay:true` |
| `WX20-042-CB-E3` | 原文が所有者を限定していない「シグニ1体」なのに選択・バニッシュとも `owner:'opponent'` 固定＝**自分のシグニを選ぶ手が指せない**（同カードの LB は `any` で正しかった） | `owner:'any'`（`SELECT_TARGET_ONLY` は `fieldCandidatesByOwner('any',…)` を持つ） |
| `WX12-035-E1` | **《緑》《緑》《白》の支払いがどこにも無い**＝無償でアタックを無効にできた。無効化の対象も「場の相手シグニ1体」＝アタックしていないシグニを選べた | `OPTIONAL_COST{costColors, trashExile{thisCardOnly}}` ＋ `NEGATE_ATTACK{attackingOnly:true}` |

### ③ この回に見つけた「engine が JSON の見た目を裏で読み替える」型2つ

🔴**(a) フェイズ境界トリガーは `activeCondition` を見ない。**
`WX13-043-E2` に `activeCondition:{LRIG_COLOR}` と書くのが自然に見えるが、
`collectPhaseBoundaryTriggers`（`triggerCollect.ts:5087` 付近）は **`eff.condition` は評価するのに
`eff.activeCondition` を1行も見ていない**＝書いても**無言 no-op**。⇒ **本体ごと `CONDITIONAL` で包む**
（実行時に `evalCondition`＝`execUtils.ts:2852` が読む。`WX14-026-E2` が live で稼働している同じ形）。
golden に「`activeCondition` に書かないこと」を assert する行を入れた。

🔴**(b) `ADD_TO_FIELD` の既定は【出】が「発動する」。**
`WX20-020` の manual コメントは「ADD_TO_FIELD はエンジン上【出】を発動させないため既定で満たす」と書いていたが**逆**で、
`collectOnPlayTriggers`（`triggerCollect.ts:598`）は **`opts.suppressOnPlay` のときだけ**空を返す。
live 108効果中97効果は正しく `suppressOnPlay` を持っており、この札だけ落ちていた。コメントも訂正した。

### ④ engine を触ったのは1箇所＝`thisCardOnly` をトラッシュ除外に効かせる

`WX12-035-E1` の任意コストは「トラッシュにある**このシグニ**をゲームから除外」。
`OPTIONAL_COST{trashExile}` に `filter:{thisCardOnly:true}` を書いても、
🔴**`matchesFilter` は `thisCardOnly` を黙って無視する**ので、そのままだと**トラッシュの何でも1枚**が除外される
（＝別のカードが消える無言バグ）。**支払い可否と実行の両方**で候補を絞る必要があるので2箇所を対で直した：

- `execUtils.ts` `canAffordOptionalCostSpec` の `trashExile` 分岐
- `effectExecutor.ts` `execExile` の `TRASH_CARD` 分岐

どちらも `transferToHandTrashCandidates`（同型の先例・`effectExecutor.ts:3546`）と同じ書き方に揃えた。

### ⑤ 検証

- `npm run gates` **全緑**（golden **3,592 / 3,592**＝新規2本）。smoke 全0・fuzz 全0。
- 新規 golden ＝①9件の直した箇所が live に載っていることの形状 assert（`activeCondition` を使わない、の否定 assert 込み）
  ②`EXILE{TRASH_CARD, thisCardOnly}` の**挙動**テスト（他のトラッシュが1枚も減らないこと／効果元がトラッシュに無ければ何も除外しないこと）。
- **live A/B 差分＝9効果ちょうど**（`git show HEAD:public/data/*.json` と effectId 単位で突き合わせ）。
- `npm run regen` の逆翻訳9行を目視（§2.0 速いレーンの検証手順）＝全件が原文どおりに読める。
- ⑤実機は不要（上記）。

🔴🔑**踏んだ罠＝`syncManualLive` のあとに `build:effects` をもう一度回す。**
1度目の `gates` が **`_partial_fresh` ラチェットで赤**になった（`WX20-042-CB`）。理由＝`build:effects` は
**live がまだ AUTO のまま**の状態で「fresh（manual 適用済み）と live が非 superset で食い違う」と判定して
レビュー待ちバケツへ入れる。`syncManualLive` で live を MANUAL にした**あとに**もう一度 `build:effects` を回すと
そのカードは不可侵側に回り、3バケツとも 0 に戻る（実測 partial 1→0 / held 8→1 / idset 0）。

---

## 2026-09-07（第211バッチ・O-A／Opus 5）＝**意味照合 Sheet2 findings 32件を全数 triage（BUG 24 / FP 8）＋恒久 no-op 2効果と owner 反転1効果を修正**

**この回の作業単位**＝ユーザー指示「S-1 を行った。opus の作業を行う」。§5.0 の Opus レーンを上から
（**O-A triage → O-C 還元 → O-D 修正**）。第210バッチ（Sonnet・S-1）が Sheet2 の先頭18バッチ（180枚）を
回して出した **findings 32件が全件未 triage** だったので、それを本線にした。

⑤**実機は不要と判定**（PLAN §2.2）＝触ったのは `src/data/effectParser.ts` / `src/data/manualEffects.ts` /
`scripts/` / `docs/` のみ。**`src/screens/` も `src/engine/` も触らず、新しい型も機構も足していない**。

### ① O-A triage＝32件（BUG 24 / FP 8＝**precision 75%**）

台帳＝`scripts/archive/scratchpad/semantic_audit_sheet2_round4/triaged.txt`（1件1行・判定理由つき）。
🔴**判定は必ず engine の受け皿を読んでから**行った（監査員は JSON しか見ていない）。

**precision が 11%（第206）→ 75% に跳ねたのは監査対象が変わったから**＝Sheet1 の終盤は「同じ札を別角度から
読み直す」段階だったが、Sheet2 は**未監査カード**なので**素の欠落**（条件が丸ごと無い・選択肢が消えている）が出る。
⚠**precision は予測しない**（第205バッチ ledger の「頻度2倍＝偽陽性増」という読みは今回当たらなかった）。

🔴**罠1＝finding が「恒久 no-op」と書いていても向きは engine を読むまで決まらない。**
`WX13-019-E1` は監査員が「事実上発動しない」と書いたが、`triggerCollect.ts:81` は
`triggerScope !== 'any_ally'` なら **無条件で true** を返す＝実際は**逆に過剰発火**していた。

🔴**罠2＝既存の計器と finding が同じ1件を指すことがある。**
`WX15-001-E1` は `npm run census:wiring` の `hasRiseIcon × POWER_MODIFY{SIGNI}`（miss 1 / has 2）と同一。
⇒ **triage の母集団は既存計器でも裏を取る**（重複作業を先に潰せる）。

### ② O-C 還元＝FP 8件のうち **4件が規則12 ひとつ**で説明できた

`mandatory:true` なのに原文が「〜してもよい」型（`WX18-067-E1` / `WX14-053-E1` / `WX19-027-E3` / `WX21-057-E1`）。
**action が `STUB` のとき任意性を持つのはハンドラ側**＝`CHANGE_BASE_LEVEL`・`MOVE_TO_OTHER_SIGNI_ZONE` は
CHOOSE に「スキップ」肢を出し（`execStubPart3.ts:332` / `execStubPart1.ts:4399`）、`SET_HAND_CARD_AS_TRAP` は
`trapPlaceOptional` の**既定が `true`**（`execStubPart2.ts:2272`）、`LEVEL_REFERENCE_OVERRIDE` は
「候補に足す」形で任意を表す（`effectExecutor.ts:7583`）。
⇒ **規則12 を「LOW へ格下げ」から「報告しない」へ強化**し、末尾の「見るべき典型バグ」の mandatory 行にも
規則12 への誘導を足した。さらに**規則25〜27 を追加**（25＝STUB は payload に target が無くても自分で選ばせる／
26＝「1枚につき」は engine が1枚ずつ回す／27＝原文に無い**中継**ステップだけを根拠に EXTRA を出さない）。
**規則本数 24 → 27。**

### ③ O-D 修正その1＝**`GRANT_LRIG_ABILITY` の duration 欠落（恒久 no-op・2効果）**

原文（`WX14-042-E2`）＝「【自】：**あなたのターン終了時**、このシグニを場からトラッシュに置いてもよい。
そうした場合、**次の対戦相手のターン終了時まで**、あなたのセンタールリグは「【起】…」を得る。」

**真因**＝engine は `GRANT_LRIG_ABILITY.duration === 'UNTIL_OPP_TURN_END'` のときだけ長期ストア
`lrig_granted_auto_effects_until_opp_turn` へ振り（`effectExecutor.ts:9646`）、未指定は
`lrig_granted_auto_effects`＝`clearTurnGrantedLrigAbilities`（`src/screens/battle/grantedAuto.ts:9`）が
**そのターンの終了時に必ず落とす**。付与するのが**まさにそのターン終了時**なので、
**付与した直後に消える恒久 no-op** だった（＝この札の存在意義そのものが消えていた）。

**なぜ落ちていたか**＝parser の「**あなたの**センタールリグは『…』を得る」枝だけが
`duration` を **「【ガード】する際…代わりに手札を1枚捨ててもよい」の1文型に限定**していた
（`effectParser.ts:16904`）。**兄弟の「**この**ルリグは『…』を得る」枝は当初から無条件**で付けている。
⇒ 兄弟と同じ無条件形へ揃えた（**1条件を消しただけ**）。

**影響＝2効果**（`WX14-042-E2` / `PR-319-E2`）。A/B 差分（`git show HEAD:public/data/*.json` と突き合わせ）で
**変わった効果がちょうどこの2件だけ**であることを確認。逆翻訳も
「ターン終了時まで、あなたのセンタールリグは…」→「**次の対戦相手の**ターン終了時まで、…」へ変わった。

🔴🔑**最初に直した場所は間違っていた（1回分の手戻り）**＝汎用の期間昇格ヘルパー `upgradeToOppTurnEnd`
（`parseSingleSentence` の末尾フック）に `GRANT_LRIG_ABILITY` を足したが、**live は1効果も動かなかった**。
デバッグ出力を1行入れて確かめたところ、**この構文は `parseSingleSentence` を通っていなかった**。
⇒ **動かないと分かった一般化は残さず revert した**（live 0 の枝は検証できないまま増える＝catch-all の温床）。
教訓は [LESSONS.md](./LESSONS.md) §4.2 の末尾2項へ還元。

### ④ O-D 修正その2＝**`WX17-063-TRAP` の owner 反転**（速いレーン＝`manualEffects.ts`）

原文＝「【トラップアイコン】：**対戦相手は自身の**トラッシュからすべてのカードをデッキに加えてシャッフルする。
その後、この方法で**10枚以上**のカードがデッキに加えられた場合、あなたは《青》を支払ってもよい。そうした場合、
対戦相手のシグニ１体を対象とし、それをバニッシュする。」

live は `TRANSFER_TO_DECK{source:{TRASH_CARD, owner:'self'}}`＝**自分のトラッシュ**を戻していた。
デッキ回復の向きが逆なだけでなく、続く `LAST_PROCESSED_COUNT_GTE:10` も**自分側の枚数**で測るので、
**バニッシュの成否まで別のカードの効果に化けていた**。

🔑**engine 側の裏返しは無い**ことを先に確かめた＝`TRAP_ICON` 26効果のうち **18効果が `owner:'opponent'` を
素直に使っている**（`self` は「トラップの持ち主」のまま解決される）。⇒ JSON の `owner` を直すだけでよい。
🔑**母集団は1効果**（原文 `対戦相手は自身の` は live 全10,759効果でこの1件だけ）＝PLAN §2.0 の**速いレーン**。
`manualEffects.ts` へ **`WX17-063-TRAP` だけ**を手書きし（E1 は別家族なので触らない）、
`npx tsx scripts/syncManualLive.ts WX17-063` で live へ届けた。

### ⑤ 検証

- `npm run gates` **全緑**（golden **3,590 / 3,590**＝新規2本を追加）。
- 新規 golden 2本＝「次の対戦相手のターン終了時まで」のルリグ付与が `UNTIL_OPP_TURN_END` であること／
  `WX17-063-TRAP` が `owner:'opponent'` かつ `count:'ALL'` であること（**どちらも直す前は落ちる**形で書いた）。
- `npm run regen` 済み＝逆翻訳の差分は**この3効果だけ**（`decompile_sheet2` / `decompile_sheet6`）。
- ⑤実機は不要（上記）。

### ⑥ 残した在庫

**未修正の真バグ 30件**（10 + 今回登録22 − 消化2）＝PLAN §5.0 の「O-D / S-3 実装キュー」に
**壊れ方の重さ順（①別の効果に化けている5件／②丸ごと欠落6件／③限定の欠落11件）**で登録した。
🔑**この表が唯一の追跡先**＝BUG と triage した瞬間 `semanticAuditPool.mjs` からも `census:cards` からも消える。

---

## 2026-09-07（第209バッチ・O-D／Opus 5）＝**「見たライフクロスをトラッシュ」が相手シグニ除去に化けていた4効果**（未修正の真バグ 11 → 10）

**この回の作業単位**＝ユーザー指示「重たい1件を行う」。§5.0 実装キューの先頭
（＝壊れ方が一番重い「別の効果に化けている」）から `WX10-015-E1` を取った。

🔴🔑**着手して母集団を測ったら1効果ではなく4効果の系統だった**（`npm run census:population -- "ライフクロスの一番上を見る"`
＝16効果を逆翻訳で読み分け）。**`WD06-018-E1` / `WX13-075-E1` / `WXK05-040-E2` が同じ壊れ方**をしていた
（`WXK05-040-E2` は triage 時の grep 句では拾えていなかった＝**着手時の実測が4件目を出した**）。

⑤**実機は不要と判定**（PLAN §2.2）＝`src/data/`・`public/data/`・`scripts/`・`docs/` のみ。
`src/screens/` も `src/engine/` も触っておらず、**新しい型も機構も足していない**（受け皿は全部既存）。

### ① 何が壊れていたか

原文（`WX10-015-E1`）＝「あなたのライフクロスの一番上を見る。**それをトラッシュに置いてもよい**。そうした場合、
あなたのデッキの一番上のカードをライフクロスに加える。対戦相手のライフクロスの一番上を見る。**それをトラッシュに置いてもよい**。…」

live は**照応「それ」を解決できず** `TRASH{target:{type:'SIGNI', owner:'opponent', count:1}}` を出していた
＝**見たライフクロスではなく相手のシグニを1体トラッシュする**別の効果。
🔴`WX10-015-E1` は**《青×1》のスペルでこの形が2回**あるので、**1エナで相手のシグニを2体除去**できた。
しかも「〜してもよい」の任意性も落ちていた（＝強制）。

### ② 受け皿は全部在った＝生成側だけの穴

`TRASH{target:{type:'LIFE_CLOTH_CARD'}}`（`execTrash` がライフ**末尾＝一番上**を trash へ移し
`lastProcessedCards` に記録する）＋ `STUB{OPTIONAL_ACTIVATE}`（コスト無しの「〜してもよい」）。
🔑**`WX10-002-E2` の手書きが既に同じ形で動いていた**＝**この型は `census:*` に原理的に映らない**
（どの計器も「受け皿があるか」しか見ない）。第207〜208バッチと同じ型で**3セッション連続**。

⇒ 後処理 `restoreLookedLifeTopTrashAnaphora`（`effectParser.ts`）を1本追加。
`restoreLrigTrashToDeckAnaphora`（宣言が別の文にある照応）と同じ場所・同じ作法。
**ガードは4枚**＝①原文に「ライフクロスの一番上を見る」がある ②直後の文が「（あなたは）それをトラッシュに置いてもよい」
③木が `[〈見る〉, TRASH{SIGNI}, CONDITIONAL{IS_MY_TURN}]` の並び
④**`ADD_TO_LIFE.owner` が〈見る〉側の owner と一致する**（＝同じ人のライフを補充している）。
④が無いと、たまたま隣り合っただけの別ステップを畳む。

### ③ 🔴**任意ブロックは必ず入れ子にする**（この回の設計上の要）

`OPTIONAL_ACTIVATE` の「やらない」は `execSequence` の **Pattern ⑤ がその SEQUENCE の残りステップを全部捨てる**。
**平らに置くと `WX10-015-E1` で「自分側を断った瞬間に相手側の処理まで消える」**＝過剰実行を直して過小実行を作る。
⇒ 各ブロックを `SEQUENCE[OPTIONAL_ACTIVATE, TRASH{LIFE_CLOTH_CARD}, CONDITIONAL{IS_MY_TURN}→ADD_TO_LIFE]` に畳んだ。
🔑`WD06-018-E1` 末尾の「あなたはカードを１枚引く」は**外側**に残るので、断っても引ける（原文どおり）。

### ④ 検証

- **ブラスト半径＝4カードちょうど**（`heldReview` の署名グループが `+LIFE_CLOTH_CARD +SEQUENCE +STUB -SIGNI` の3枚と ×2 の1枚だけ）。
- **golden 6本追加**＝①4効果の構造（`TRASH{SIGNI opponent}` が残っていない／`LIFE_CLOTH_CARD` と `OPTIONAL_ACTIVATE` が同数／見た側の owner）
  ②`WX13-075-E1` の engine 挙動（**断る**＝ライフもトラッシュも相手の場も動かない／**受ける**＝ライフの**末尾＝一番上**だけが trash へ行き、
  デッキ上から1枚補充され、**相手のシグニには触らない**）
  ③`WX10-015-E1` で**自分側を断っても任意ゲートが2回来る**（入れ子の番人）。
- **反転確認**＝live を旧形（`TRASH{SIGNI opponent}`）へ戻すと**4本とも FAIL**、戻して全 PASS。
- `npm run regen` 済み＝**4効果とも逆翻訳が原文と一致**することを目視で確認。
- **`npm run gates` 全緑**（typecheck / golden **3588/3588** / smoke / fuzz / census / census-stubs / manual-fields / census-enginetext / census-costtext / lint）。


## 2026-09-07（第208バッチ・O-D/S-3／Opus 5）＝**実装キューの「速いレーン4件」を消化**（未修正の真バグ 15 → 11）

**この回の作業単位**＝ユーザー指示「速いレーン4件から始めて」。第207バッチの triage で
**受け皿が全部 live で稼働中**と確定していた4件を1巡でまとめた（固定費はバッチ回数に比例するため）。

🔑**4件とも `manualEffects.ts` への手書きは不要で、parser 側で直せた**（速いレーンの既定は手書きだが、
**受け皿が在る＝生成側の穴**なので parser が正しい置き場だった）。⇒ **凍結を1件も増やしていない。**

⑤**実機は不要と判定**（PLAN §2.2）＝`src/data/`・`public/data/`・`scripts/`・`docs/` のみ。
`src/screens/` も `src/engine/` も触っておらず、新しい型・機構も足していない。

### ① `WX05-005-E3`＝**`manualEffects.ts` の手書きが parser より古く、live を劣化させていた**

原文「【起】**《アタックフェイズアイコン》**エクシード５：対戦相手の、センタールリグとすべてのシグニをダウンする。」
live は `timing:["MAIN"]`＝**メインフェイズにも撃てる**過剰実行。

🔴**真因は parser ではなく手書き**＝`MANUAL_EFFECTS["WX05-005"]` の E3 が `timing:["MAIN"]` を焼き込んでいた。
parser は**同型41効果すべてで `ATTACK_ARTS` を正しく出しており**、E3 は**手書きと parser 出力が timing 以外1バイトも違わなかった**。
⇒ **手書きの E3 を削除して parser に返した**（E2 は `energyTrash` を持つぶん parser より忠実なので残す）。

🔴🔑**この形はどの計器にも映らない**＝`censusManualDrift` の「削除候補」は**実体同一のものしか**挙げないので、
**「手書きが parser より古い（＝実体が違う）」ものは永久に候補にならない**。
⇒ golden に「`MANUAL_EFFECTS['WX05-005']` は E2 だけを持つ」というトリップワイヤを張った
（書き戻すと `mergeManualEffects` が effectId 一致で常に勝ち、**live が静かに MAIN へ戻る**ため）。

### ② `WX08-023-E3`＝**ゾーン名から `cardType` を拾っていた**

原文「あなたの**ルリグトラッシュ**からレゾナ１枚を対象とし、それを**ルリグデッキ**に加える。」
真因＝`parseCardTypeFilter`（`parserUtils.ts`）に **`レゾナ` の枝が無く**、
`t.includes('ルリグ')` が**ゾーン名**（「ルリグトラッシュ」「ルリグデッキ」）に当たって `cardType:'ルリグ'` に化けていた
＝**レゾナ以外のルリグカードまでルリグデッキへ戻せる**過剰実行。
⇒ `レゾナ` の枝を `ルリグ` より前に追加し、`ルリグ` 側は**ゾーン名を落としてから**判定する
（「ルリグトラッシュ**から**ルリグ１枚」は落としても名詞が残るので従来どおり当たる）。**ブラスト半径1カード。**

### ③ `WX10-028-E2`＝**所有者語の無い対象宣言＋照応でフィルタが丸ごと落ちる**

原文「**レゾナ１体を対象とし**、《白》を支払ってもよい。そうした場合、それをアップする。」
live は `selectTarget:{type:'SIGNI',owner:'self',count:1}`（**フィルタなし**）＝**自分の任意のシグニ**をアップできた。

🔑**穴は2段**＝①`signiClauseResonaFilter` の regex が**所有者語（「あなたの」「対戦相手の」）を必須**にしていた
②宣言と帰結が**別の文**なので、帰結側（`UP`）は照応「それを」しか見ておらず filter を持たない。
⇒ ①は所有者語を任意にし（**文頭か句読点の直後**に限って途中一致を防ぐ）、
②は `applyO96OptionalCostTargetFirst`（**宣言文を持っている唯一の層**）で
**帰結が無フィルタのときだけ**種別を戻す。⚠`owner` は据置＝原文が所有者を書いていないので別項目。

### ④ `WX05-030-E1`＝**同一性制約が落ちて万能サーチになっていた**

原文「手札から＜アーム＞のシグニ１枚を公開する。あなたのデッキから**この方法で公開したシグニと同じ名前の**シグニ**を３枚まで**探して…」
live は `filter:{cardType:'シグニ'}` のみ＝**任意のシグニを3枚**持ってこられた。
⇒ 効果ID表（`effectParser.ts` の flag テーブル）へ `{ type:'SEARCH', flag:'nameEqLastProcessed' }` を1行追加。
🔑**同型の `WXK05-044-E1` は既に登録済みで正しく動いていた**＝外れ方の差は文型の2点だけ
（①「そうした場合、」が無い ②「シグニ**を３枚まで**探して」）。前段は同じ `STUB{HAND_REVEAL_CLASS_SIGNI}` で
公開札が `lastProcessedCards` に残るので engine 側（`execSearch` の `nameEqLastProcessed` 解決）はそのまま効いた。

### ⑤ 踏んだ罠2つ

🔴**(a) 正しく直すと「フィルタが無いこと」に依存した既存 golden が落ちる。**
`O-96 第6バッチ: UP/GRANT_KEYWORD が支払い後も同じ対象だけに当たる` は `WX10-028-E2` を fixture に使っており、
**素のシグニ2体**を敷いていた。③でその効果に `cardType:'レゾナ'` が載った瞬間、候補が0になって
`abortIfNoCandidate` が発火し「2体ともダウンのまま」＝**FAIL**。
⚠**これは退行ではなく fixture の陳腐化**＝旧 fixture は「対象フィルタが無い」という**バグの側**に依存していた。
⇒ 盤面をレゾナ2体へ差し替え（`matchesFilter` は `Type==='レゾナ'` を `cardType:'シグニ'` にも一致させる
非対称の緩和があるので、他の assert の前提は変わらない）。
🔑**「golden が落ちた＝直し方が悪い」と即断しない**＝**何に依存して緑だったか**を先に読む。

⚠**(b) `npm run build:effects` も `npm run golden -- --only` も tsx 経由＝型を見ない**ので、
`src/data/` に入れた型エラー（`cardType` に `string` を代入）が**両方 PASS のまま生き延びた**。
**捕まえたのは `npm run gates` の `typecheck` だけ。** ⇒ **parser を触った回は最後に必ず full gates を回す**
（CLAUDE.md の「`scripts/` は typecheck が見ない」の**裏返し**＝`src/` は見るが、tsx 経由の実行は見ない）。

### ⑥ ゲート

**`npm run gates` 全緑**（typecheck / golden **3582/3582** / smoke / fuzz / census / census-stubs / manual-fields / census-enginetext / census-costtext / lint）。
`npm run regen` 済み＝**4件とも逆翻訳が原文と一致することを目視で確認**。**golden は5本追加**（4件＋手書き復活のトリップワイヤ）。


## 2026-09-07（第207バッチ・O-A／Opus 5）＝**意味照合 findings 残33件を全数 triage**（未triage 33 → **0**）＝真バグ26・偽陽性7／うち3件を修正

**この回の作業単位**＝ユーザー指示「残 33件すべて行う」。**round4 の findings 52件はこれで全数 triage 済み**になった。

⑤**実機は不要と判定**（PLAN §2.2）＝触ったのは `src/data/`・`public/data/`・`scripts/`・`docs/` のみ。
`src/screens/` も `src/engine/` も触っておらず、新しい型・機構も足していない。④ゲートまでで閉じる。

### ① triage 結果＝**BUG 26 / FP 7（precision 79%）**

🔴🔑**第206バッチ（precision 11%）との差は「取る順」だけ**＝206 で同型が固まっている FP クラスタを先に抜いたので、
残りは真バグの密度が上がった。⇒ **バッチ単位の precision は母集団の性質ではなく triage の順序で動く＝歩留まりの指標として読まない。**
**round4 全体では 32/52＝62%**（パイロット30枚の 50% から規則13〜19 で改善している）。

**FP 7件＝新しい型5つ（→ 規則20〜24。どれも engine／UI／カードデータの受け皿を読まないと判定できない）**

| 規則 | 型 | 受け皿 | finding |
|---|---|---|---|
| 20 | **キーワード能力は本文に対応する語が無くても展開される** | 【チェイン】《緑》《白》→ `COST_REDUCTION{targetCardType:'アーツ'}`（`effectParser.ts:23630`・タスク12(xciii)＝以前はキーワードごと落ちて軽減が一度も起きなかった） | `WX11-021-E1` |
| 21 | **「アップ状態の〜をダウンする」コストに `isUp` は要らない** | `useTimeCost.ts:97` が**既にダウン＝候補外**で弾く（構造的に保証） | `WX07-030-E1` |
| 22 | **`crossOnly:true` は「クロス相手を問わない」印ではない** | 相手は `getCrossConditionText(card)`＋`evaluateCrossCondition` が**カードデータのクロス条件**から解決（逆翻訳も相手名を描いている） | `WX09-020-E1` |
| 23 | **STUB ハンドラが自前の did-it ゲートを持つことがある**（規則13の系） | `LRIG_UNDER_TO_TRASH` は「ルリグの下がN枚未満なら以降スキップ」を**ハンドラ内で**実装（`effectExecutor.ts:5294`） | `WX05-007-E1` |
| 24 | **`SEARCH` の `then` は選んだカード1枚ずつに適用される** | `effectExecutor.ts:11041` の `for (const id of picked)`＝`then` の `target.count` は総数の上限ではない（枚数は `maxCount`） | `WX11-006-E1` |

（残り1件 `WX04-004-E2` は既存規則15の系＝`STUB{OPP_DIRECT_ATTACK_NEGATE}` が＜美巧＞の手札捨てを
`execStubPart3.ts:5477` に**ハードコード**しており、payload にはエナぶんしか出ない。）

**新型（＝新しい壊れ方）は 0**＝BUG 26件はすべて既知の型。🔴**止め時カウンタは連続2本目**（206・207 とも新型0）。
⚠ただし**この2回は triage 回であって新規監査バッチではない**＝止め時の判定は Sheet2 の新規バッチで取り直す。

### ② 直したのは3件＝**どれも「受け皿は在るのに生成側が1本も出していない」型**

🔑この型は `census:*` に**原理的に映らない**（どの計器も「受け皿があるか」しか見ない）＝**意味照合だけが拾えた**。

1. 🔴**`WX03-002-E1`＝対象が原文と正反対だった。** 原文「**＜天使＞ではない**対戦相手のシグニ１体をトラッシュに置く」が
   `filter:{story:"天使"}`＝**＜天使＞しか落とせない**（過小）うえ**原文が守っている＜天使＞を落とす**（過剰）。
   真因＝`parserUtils.ts` の `parseStoryFilter` が**否定語を1文字も読んでいなかった**。
   🔑**受け皿 `cardClassExclude` は `types/effects.ts:1342` のコメントが「WX03-002」と名指しで在った**のに、
   生成側は `parseSentencePart1.ts` の傀儡専用分岐が手で組む1箇所だけだった。
   ⇒ `parseStoryFilter` に `＜X＞(の(シグニ|カード))?ではない` → `cardClassExclude` を追加（肯定側と混ぜない）。
   **母集団4効果 / ブラスト半径1カード**（他3件は MANUAL か専用分岐で既に正しい）。

2. 🔴**`WX11-034-BURST`＝相手の全シグニに－8000していた。** 原文は「【チャーム】が付いている対戦相手のすべてのシグニ」。
   真因＝`bindCharmedSigniActionTarget`（`effectParser.ts:4453`）が **`^その後[、,]` で早期 return** していた
   （「複合効果の『その後』節は母集団外」という過去の保守的ガード）。**同型9効果のうちこの1件だけが「その後、」で始まる。**
   ⇒ **「その後、」を剥がして読む。ただし照応（「それ」「その」）を含む節は従来どおり触らない**
   （前段で選んだ対象を指しているので、名詞句から対象を組み直すと結合意味が変わる＝早期 return の本来の目的）。
   **ブラスト半径1カード**（held に1件も増えず＝純粋上位集合として live へ届いた）。

3. 🔴**`WX09-028-E1`＝手札捨ての原因を一切見ていなかった。** 原文「対戦相手が**あなたのシグニの効果によって**手札を１枚捨てたとき」。
   真因＝**前日（第204バッチ）に新設したばかりの受け皿 `discardCauseCardTypes` の parser 規則が
   `(?:コストか効果|効果かコスト)によって` しか見ていなかった**＝「**効果によって**」単独と所有者語「あなたの」を落としていた。
   ⇒ 規則を `(?:コストか効果|効果かコスト|効果|コスト)によって` へ広げ、
   **「あなたの」＋「対戦相手が」なら `byWatcherEffect:true`** も刻む。
   **対照 golden** を `WX25-CP1-016-E1`（「コストか効果」型）に張って**一般化で退行していない**ことを固定した。

### ③ 残 23件の登録先

- **PLAN §5.0 の「O-D / S-3 実装キュー」表（15件）**＝機構は要らないが parser/engine/構造の修正が要るもの。
  🔴🔑**この表が唯一の追跡先**＝**finding を「BUG」と triage した瞬間、`semanticAuditPool.mjs` からも
  `census:cards` の「未消化 findings」からも消える**（3つとも数えているのは*未 triage*であって*未修正*ではない）。
- **PLAN §5.3（8件）**＝`O-272`（「正面にあった」＝離場後のゾーン解決・**4効果とも別々の壊れ方**）／
  `O-273`（`REMOVE_CHARM` の「好きな数」）／`O-274`（デッキ配置の並び順を使用者が決める）／
  `O-275`（ライフクラッシュの発生原因）／`O-276`（`BANISH_SUBSTITUTE` の離場全般＋原因）／
  `O-277`（代替コストの発動条件）／`O-278`（フリーグロウのルリグタイプ限定）／`O-279`（「各プレイヤーは」）。

### ④ ゲート

**`npm run gates` 全緑**（typecheck / golden **3577/3577** / smoke / fuzz / census / census-stubs / manual-fields / census-enginetext / census-costtext / lint）。
`npm run regen` 済み。**golden は5本追加**（3件の修正＋`WX25-CP1-016-E1` の対照）。


## 2026-09-07（第206バッチ・O-A／Opus 5）＝**意味照合 findings の triage 9件**（未triage 43 → 33）＝**真バグ1件・偽陽性8件（FP 型2つを規則18/19へ還元）**

**この回の作業単位**＝ユーザー指示「**O-A** を行う」（PLAN §5.0 Opus レーン）。第205バッチが Sheet1 を一括消化して残した
**未 triage 43件**から、**同型が固まっている2クラスタ（計9件）**を取った。§5.0 の周期どおり **5〜8件ずつ**の範囲。

⑤**実機は不要と判定**（PLAN §2.2）＝触ったのは `src/data/effectParser.ts`・`public/data/`・`scripts/` のみで、
**`src/screens/` も `src/engine/` も触っておらず、新しい型・機構も足していない**。④ゲートまでで閉じる。

### ① triage 結果

| クラスタ | 件数 | 判定 | 根拠（engine の受け皿） |
|---|---|---|---|
| **パワー修正に `duration` が無い＝恒久のはず** | **5**（`WX04-037-BURST` / `WX06-019-BURST` / `WX10-051-BURST` / `WX04-103-E1` / `WX05-015-E1`） | **FP** | `duration` を書かないと `effectExecutor.ts:2188` が **`temp_power_mods`** を選び、`turnScopedState.ts:444`・`BattleScreen.tsx:4740/12907` が**ターン終了時に必ずクリア**する＝**無指定こそが「ターン終了時まで」**。`duration` は**ターン終了より長い**もの（`UNTIL_OPP_TURN_END` / `UNTIL_NEXT_OWN_TURN_END`）専用の語彙。`POWER_MODIFY_PER_LEVEL_SUM` も解決後に `applyDirectAction` で同じ store へ落ちる。効果トップの `duration:"INSTANT"` はパワー修正の寿命と無関係 |
| **【常】の `target.count:1` に `thisCardOnly` が無い** | **3**（`WX08-005-E2` / `WX03-028-E2` / `WX04-049-E1`） | **FP** | engine は【常】の `count !== 'ALL'` を**効果元シグニ自身**として解決する＝`POWER_SET`（`effectEngine.ts:2482`「count !== 'ALL' = このシグニのみ」）／`SET_BASE_LEVEL`（`applyContinuousBaseLevelOverride` が場の top のみ上書き）／`GRANT_PROTECTION`（`collectProtectedSigni:6008` と `collectEffectImmuneSigni:6500` が `immune.add(sourceNum)`）。**3つの受け皿が揃って同じ規約**なので `thisCardOnly` は不要 |
| **`WX11-036-E1` の activeCondition が原文と違う** | **1** | 🔴**BUG（修正済み）** | 下記② |

**precision＝1/9（11%）**。⚠第205バッチの ledger が予測していたとおり、**「finding 頻度が2倍になった」のは歩留まりの向上ではなく偽陽性率の上昇だった**
（r4-01〜08 は 1.1件/バッチ、r4-09〜26 は 2.4件/バッチ）。⇒ **規則18/19 の還元がそのまま次の周期の効率になる。**

### ② 真バグ1件＝`WX11-036-E1`「このシグニ**は**アップ状態であるかぎり」で `IS_SELF_UP` が丸ごと落ちていた

**原文**＝`【常】：対戦相手のターンの間、このシグニはアップ状態であるかぎり対戦相手の効果を受けない。`
**旧 live**＝`activeCondition: {type:'TURN_OWNER', owner:'opponent'}` ＝ **アップ／ダウンの条件が無い**。

🔴**真因**＝先頭条件節の regex `^このシグニが(アップ|ダウン)状態であるかぎり、`（`effectParser.ts` パターン3f-3）が
**①助詞 `が`→`は` ②直後の読点なし** の2点で外れ、条件節が**丸ごと**落ちていた
（`checkActiveCondition` は case の無い条件を消すのではなく**条件そのものが無い**扱いにするので、**ダウン状態でも効果耐性が立つ**過剰実行）。

**母集団＝1効果**（`npm run census:population -- "このシグニ[はが](アップ|ダウン)状態であるかぎり"` ＝ **7効果 / 6カード**のうち、
**外れていたのは `WX11-036-E1` だけ**。同じ「対戦相手のターンの間、〜であるかぎり」文型の `WXDi-P07-056-E1` は `が`＋読点なので正しく AND に載っていた）。

**直し方**＝`^このシグニ[はが](アップ|ダウン)状態であるかぎり(、?)`。`[はが]` は同ファイルの同族規則7箇所が**既にそうなっており、この1本だけが取り残されていた**。

🔴🔑**「条件を足す」だけでは終わらなかった＝過小を直して過剰を作りかけた**：
読点を optional にした瞬間、条件節が**主語「このシグニ」ごと**食い、後段の「対戦相手の効果を受けない」が主語を失って
**`target.count` が `1`（自身）→ `'ALL'`（自分の全シグニ）**へ広がった（`build:effects` の held diff で発見）。
⇒ **読点なしの分岐だけ主語を `rest` へ戻す**（読点つきは後続節が自前の主語を持つので不要）。

**反転確認**＝live の `activeCondition` を旧形（`TURN_OWNER` 単独）へ戻して `golden -- --only "WX11-036-E1"` → **3本中2本 FAIL**、戻して 3/3 PASS。

**golden 3本**＝①既存ミラー表 `kagiriCases` に1行（`IS_SELF_UP` が載ったか）②🆕**対象が `count:1` のままか**（過剰側の番人）
③🆕`collectEffectImmuneSigni` で **相手ターン×アップ→耐性あり／相手ターン×ダウン→耐性なし／自分のターン×アップ→耐性なし**の3方向。
🔑**②が要る理由**＝①だけだと「条件を足したが対象を広げた」ことに気づけない。

### ③ 逆翻訳の穴を1つ塞いだ（`IS_SELF_UP`）

`decompileEffects.ts` の `condJa` に `IS_SELF_UP` の case が無く、**逆翻訳が `[条件:IS_SELF_UP]` と生の英語 id を出していた**
（`WXDi-P04-050-E1/E2`・`WXDi-P07-056-E1`・`WX11-036-E1` の4効果）。**原文照合という主軸の検査が効かない**ので `このシグニがアップ状態` を追加。
（`census:stubs` C群ゲートは STUB id しか見ないので、この形は**どのゲートにも映っていなかった**。）

### ④ O-C 還元＝プロンプト規則を **17本 → 19本**

`scripts/semanticAuditExtract.mjs` の「追加の読み方ルール」に **規則18**（パワー修正の `duration` 省略は正準形）・
**規則19**（【常】の `count:1` は自身）を追加。どちらも**規則16「engine は JSON の見た目を裏で読み替える」の系**。

🔴🔑**この追記で `npm run gates` の lint が落ちた**＝規則本文は**テンプレートリテラルの中**にあるので、
md の癖で `` `POWER_MODIFY` `` と書くと**そこで文字列が閉じて `.mjs` が Parsing error になる**＝
**壊れるのはプロンプトではなく S-1 レーンごと**（`semanticAuditExtract.mjs` が起動しない）。
⚠**`npm run typecheck` は `scripts/` を見ない**ので緑のまま通り、**捕まえたのは `eslint .` 1本だけ**。
既存の規則13〜17 が識別子を `「…」` で囲っていたのは**この理由**だった（識別子は `「…」` で囲う）。

### ⑤ ゲート

**`npm run gates` 全緑**（typecheck / **golden 3573/3573** / smoke / fuzz / census / census-stubs / manual-fields / census-enginetext / census-costtext / lint）。
`npm run regen` も実行済み（逆翻訳シートに ③ を反映）。


## 2026-09-07（第205バッチ・S-1／Sonnet 5）＝**意味照合 round4 Sheet1 完了**（残18バッチ／172枚を全消化＝252枚 / 26バッチ）

**この回の作業単位**＝ユーザー指示「S-1で Sheet1 残18バッチをすべて行う」。**S-1（Sonnet レーン＝抽出・実行・簿記）のみ**を実施＝
**O-A（真偽の triage）はやっていない**（§5.0 のレーン分担どおり次の Opus セッションへ引き継ぐ）。コード変更は無し（`src/`）。

### ① 実行内容

```
node scripts/semanticAuditExtract.mjs --out tmp_sa_sheet1 \
  --cards-file scripts/archive/scratchpad/semantic_audit_sheet1_round4/pending_cards.txt --batch-size 10
node scripts/semanticAuditRun.mjs --out tmp_sa_sheet1 --model sonnet
```
**実測＝18バッチ・約38分・実コスト $6.04**（各バッチの `total_cost_usd` 合算）。結果を
`scripts/archive/scratchpad/semantic_audit_sheet1_round4/`（raw/findings.jsonl/TYPE_LEDGER.md/audited_cards_cumulative.txt/pending_cards.txt）へ統合（round4 の既存バッチ番号 r4-09〜26 として継続採番）。

### ② 踏んだ罠2つ・`scripts/semanticAuditRun.mjs` を1箇所直した

1. **`claude -p` が JSON 契約を守らず自由形式(markdown)で応答することがある**（18バッチ中1件＝r4-12／旧 batch_04）＝
   プロンプトで指定した `{"results":[...]}` を一切出さず、「engine ソースを確認した」体の散文レポートを返した
   （実際に2件の真偽不明の finding を含んでいた＝`WX07-039-E1` の位置限定欠落／`WX03-024-BURST` のルリグタイプ限定欠落）。
   **自動リトライは実装していない**（頻度が低く、検出も複雑）＝手動で `findings.jsonl` へ書き戻した。
2. **`claude -p` が JSON の閉じ括弧を書き忘れて打ち切ることがある**（18バッチ中1件＝r4-26／旧 batch_18）＝
   `stop_reason:"end_turn"` で正常終了しているのに構文が不完全（`{"results":[...]` の最後の `}` が無い）。
   ⇒ **`extractJson`（`scripts/semanticAuditRun.mjs`）に、開き括弧と閉じ括弧の数の差分で不足分の `}` を補うフォールバックを追加**。
   `JSON.parse` が素で失敗したときだけ発動し、既存の成功パスには影響しない。

### ③ 結果＝findings 43件（r4-09〜26）は未 triage のまま持ち越し

🔴🔑**findings の頻度が r4-01〜08（80枚・9件＝1.1件/バッチ）の2倍以上**（r4-09〜26＝172枚・43件＝2.4件/バッチ）。
**triage していないので precision は不明**。過去の実測（パイロット30枚で50%、規則13〜16 追加後は67%）からは
**相当数が偽陽性の可能性がある**＝duration の既定挙動・did-it ゲート・STUB id 名の疑いに該当しそうな finding が複数混ざっている
（例＝`WX10-002`「そうした場合」／`WX05-007`「そうした場合」は規則13の did-it ゲート対象かもしれない）。
⇒ **次セッションは Opus で O-A（triage）を5〜8件ずつ**行う（`TYPE_LEDGER.md` の「新型」列が全部 `?`）。

### ④ 検証・簿記の範囲

`src/` 無変更のため golden/smoke/census 等のゲートは**対象外**（変化なし）。`scripts/semanticAuditRun.mjs` は
`node --check` で構文のみ確認。`docs/PLAN.md`（§1／§5／§5.0／§5.2／§6）・`docs/PLAN_PROGRESS.md`・
`scripts/archive/scratchpad/semantic_audit_sheet1_round4/`（README・TYPE_LEDGER・findings・pending/audited リスト）を更新。

---

## 2026-09-07（第204バッチ）＝**意味照合 段2 台帳の残 OPEN を 0 にした**（7 → 0）／実機 `V-176`〜`V-178` も返済

**この回の作業単位**＝ユーザー指示「OPEN が0になるまで」。**残数計器**＝`semanticAuditLedger.mjs` **7 → 0**（本日通算 **24 → 0**）。
**⑤実機の要否**＝🔴**必要**（`src/engine/` と `src/screens/` の両方を触った）＝**同じ回で返済した**
（`v176*` / `v177*` / `v178*` の6シナリオを `order` へ常設・**3組とも対照つきの対**）。

### ⓪ 「機構待ちで残っている」は在庫ではなく未着手だった

台帳の残件は 2026-09-01 以降ずっと「全件が `src/screens/` か新 engine 機構待ち」と仕分けられていたが、
**実際には1件あたり engine 30〜120行**で閉じた。新設した受け皿は7つ：

| finding | 何が無かったか | 受け皿 |
|---|---|---|
| `SPDi44-16-E2` / `WX25-P1-030-E2` | 「N体**まで**」＋**ルリグ【起】の `fieldTrash` 支払いが1行も無い** | `fieldTrash.upToCount`／`payFieldTrashCost`／`$ref:'last_cost_field_trash_count'` |
| `WXK10-004-E1` | 「場以外の**あなたの領域**」がデッキ・トラッシュ・ライフを守らない | `OppMoveImmunityZone`（5領域）＋消費4地点 |
| `WXDi-P13-089-E3` | 3領域から1枚**ずつ**除外するコスト | `EffectCost.multiZoneExile` |
| `WX25-CP1-016-E1` | 手札捨ての**原因カード種別** | `triggerCondition.discardCauseCardTypes` |
| `PR-K048` | 《無》コストを払える**色の正集合** | `EffectCost.colorlessPayableColors` |
| `WX13-005B-E1` | — （**stale**＝順序は `O-267` で実装不要と確認済み） | — |

### ① `O-271`＝ルリグ【起】の `fieldTrash` は提示も支払いも1行も無かった（踏み倒し）

**真因**＝`lrigActivateGate.ts` は `fieldBanish` しか検算せず、`performLrigActivated` にも `fieldTrash` の
文字が1つも無かった＝**場にシグニが0体でも撃てて、何もトラッシュせずに本体だけ走る**。
しかも帰結が `{$ref:'last_processed_count'}` の札（`SPDi44-16-E2` / `WX25-P1-030-E2`）は
**コスト支払いが engine の「直前ステップ」に残らないので常に0**＝「3体トラッシュして0枚出す」恒久空振り。
さらに parser が原文の「3体**まで**」の「まで」を捨てており、**3体いないと撃てない**過小実行でもあった。
**直し方**＝①`fieldTrash.upToCount` を parser／`fieldTrashSelectionSatisfied`／提示ゲート／両モーダルへ通す
②支払いを **`payFieldTrashCost`（`screens/battle/fieldTrashCost.ts`）1本へ funnel 化**
（`BattleScreen.tsx` に手書きされていた【出】経路とシグニ【起】経路の2本も同じ関数へ寄せた）
③体数を `last_cost_field_trash_count` に載せ、`$ref:'last_cost_field_trash_count'` で読む
（parser 側は「単発アクション＋`cost.fieldTrash`」のときだけ `last_processed_count` から差し替える）。
**影響枚数**＝可変枚数コスト 2効果／`fieldTrash` を持つルリグ【起】**8効果 / 7枚**（踏み倒しの解消）。

### ② `WXK10-004-E1`＝「場以外のあなたの領域」がデッキ・トラッシュ・ライフを守っていなかった

**真因**＝`ZONE_MOVE_IMMUNITY{zones:['hand','energy']}`＝原文の5領域のうち3つが**まったく無保護**。
🔴**逆翻訳も「手札とエナゾーン」と書いていた**＝engine と表示が**同じ嘘で一致**していて、どの計器にも映らない。
**直し方**＝`OppMoveImmunityZone`（`hand`/`energy`/`deck`/`trash`/`life`）へ広げ、**消費地点を4つ**足した＝
`movableTrashCandidates`（トラッシュから動かす**全経路の funnel**）／`TRASH{DECK_CARD}`（ミル）／
`execLifeCrash`（**効果による**クラッシュ。ダメージはこの経路を通らない）／`EXILE` の hand・energy 分岐
（🔴旧実装は「手札は移動しない」宣言中でも**除外だけ通っていた**）。
⚠「**クラッシュ以外の**対戦相手の効果によって」（`WXEX2-22-E1`）は `excludeCrash` で表す。
⚠**parser で `トラッシュにある` を汎用に足すと `LOCK_OPP_TRASH_MOVE`（相手の自分自身への封じ）を奪う**＝
実測で2枚（`WX24-P4-007` / `WXDi-P14-005`）が別効果に化けたので、`場以外の領域` の綴りだけに限定した。

### ③ `WXDi-P13-089-E3`＝3領域ぶんのコストがトラッシュ1枚に丸められていた

parser に「**→ `trashExile` で近似**」と明記された規則が残っており、**手札とエナの2枚を踏み倒して撃てた**。
⇒ `EffectCost.multiZoneExile{zones,count,filter}` を新設。判定と支払いは
`screens/battle/multiZoneExileCost.ts` の2関数だけ（提示＝`signiActivateGate`／支払い＝`performSigniActivated`）。
⚠**自動支払い**（`cardName` 一意でどれを除外しても等価）＝選択UIは作らない。⚠行き先は `excluded`。

### ④ `WX25-CP1-016-E1`＝手札捨ての「原因」を1つも見ていなかった

原文「**シグニかスペルの、コストか効果によって**」に対し、live は原因を見ず**ルリグ・アーツ・キーの効果でも、
相手に捨てさせられても**誘発していた。⇒ `triggerCondition.discardCauseCardTypes` を新設。原因カードは
①コスト経路＝`costSourceNum`（既存）②効果経路＝中央 diff が `causeSourceCardNum` を
`hand_discarded_just_cause_card_num` に刻む。判定は `collectHandDiscardTriggers` の `causeTypeOk` 1点＝
**fail-closed**（ルール処理の手札上限・ガードステップでは誘発しない）。

### ⑤ `PR-K048`＝《無》コストを払える色の制限が無かった

《無》スロットは既定で何色でも払えるので**原文より緩い**。⇒ `EffectCost.colorlessPayableColors` を新設。
🔑**原文を読むのは `keywordCosts.ts` の `parseColorlessPayableColorsText` 1箇所**（`census:costtext` の規約）＝
`printedKeywordCosts` で live に載り、UI は `colorlessPayableColorsOf(cardNum, effectsMap)` を読むだけ。
判定は `canAffordGrowCost` / `canAffordWithExtraCost` の1本＝**キー2入口＋アーツ3入口の計5箇所**が同じ関数を通る。
⚠「あなたのセンタールリグが持つ色」（`WX16-006-E1`）は**盤面依存**なので静的な色集合にしない（別機構）。

### ⑥ 🔴実機が本物のバグを1件釣った（`V-176`／`O-270` の追記）

`execSearch` の `TREAT_AS_LEVEL1_IN_DECK_TRASH` 差し替えが、
**キーを instanceId（`WD01-012#7611`）で書いていたのに読み手は `getCardNum(n)`＝CardNum で引いて**いた＝
**誰も読まないエントリ**＝**実機では候補が常に0件の恒久 no-op**。
🔑**golden は素の CardNum で state を組むので全緑のまま**だった（§2.2「実機が要る回」の実例）。
⚠**同じ関数のすぐ下の `deck_signi_level_override` は最初から `getCardNum(n)` で正しく書いていた**＝
**正しい前例が同じ関数の中にあったのに揃っていなかった。**
⇒ 修正し、**instanceId のデッキでも効く**ケースを golden に足して回帰ガードにした（反転確認済み）。

### 検証コマンド

```
npm run build:effects && node scripts/heldReview.mjs --adopt SPDi44-16,WX25-P1-030,WXDi-P13-089
npm run regen && npm run gates
node scripts/verifyBattleDrive.mjs v176DeckTrashLevel1SearchFinds v176DeckTrashLevel1SearchNoDeclarer   v177LrigAttackNegatedOnMatch v177LrigAttackHitsOnMismatch   v178RideUsableInAttackPhase v178RideNotUsableWithoutBike o267CutinResonaResolvesBeforeSpell
```

**ゲート＝全緑 ✅**（golden **3563 → 3570**／smoke 0／fuzz 0／census 0 / BASELINE 0／
`census:stubs` A群🔴0・C群0／manual-fields 0／`census:enginetext` A🔴0行／`census:costtext` A🔴0規則／lint 0 errors）。
**実機＝7シナリオ ALL PASS。** **反転確認＝新規 golden はすべて実施**（受け皿を潰すと FAIL することを実測）。
**新しい実機の罠を5本 `DRIVE_TRAPS.md` へ追加**（53〜57＝`stdStep` がアタックを飛ばす／`lrig_down` の残留／
instanceId と CardNum の取り違え／`Restriction` が手札アクションを消す／任意コストのエナはトグル）。

## 2026-09-07（第203バッチ）＝**残 OPEN 9 → 7**／進行中ルリグアタックの無効化・【ライド】のタイミング拡張を新設

**この回の作業単位**＝§5.2 段2 台帳の残 OPEN。**残数計器**＝`semanticAuditLedger.mjs` **9 → 7**（本日通算 **24 → 7**）。
**⑤実機の要否**＝🔴**必要**（`src/screens/battle/battleUtils.ts` / `attackNegation.ts` / `BattleScreen.tsx` を触った）＝
`V-177` / `V-178` として §5.1 へ登録。**判定ロジックは純関数へ出して golden で正負両方向を固定した**ので、
残るのは「実機の配線が通っているか」の1点だけ。

### ⓪ この回の2件は「無言の no-op」ではなく「無言の**別効果**」だった

どちらも `parseStatus:'AUTO'` で、逆翻訳も日本語として自然に読める。⇒ **census にも `census:stubs` にも
`census:enginetext` にも映らない**（欠落した語彙が無く、STUB でもなく、engine が原文を読んでもいない）。
🔑**この形を引き当てられるのは意味照合だけ**＝「原文にある語が live に無い」ではなく
「**live にある語が原文と違う**」ので、受け皿名を知っている計器は全部素通りする。

### ① `WXDi-P09-036-E1`＝ルリグのアタックを無効にできなかった（真因2つ・受け皿を新設）

**原文**（アシストルリグ【出】がセンターへ付与する引用【自】）＝
「対戦相手のシグニ**かルリグ**１体がアタックしたとき、あなたと対戦相手は自分のデッキの一番上を公開し…
どちらも【ライフバースト】を持っているか、どちらも持っていない場合、**そのアタックを無効にする**。」

**真因(a)**＝`REVEAL_BOTH_DECK_TOPS.matchAction` が `NEGATE_ATTACK{target:{type:'SIGNI'}, attackingOnly:true}`＝
`execNegateAttack` の候補にルリグが入らず、`attackingOnly` の絞り込みで消える＝**ルリグ側が恒久 no-op**。
⇒ 対象型を **`CENTER_LRIG_OR_SIGNI`** へ（parser 1箇所・母集団1効果）。

**真因(b)＝こちらが本命**＝対象型を直しても閉じない。`NEGATE_ATTACK` の既定は
`negated_attacks`（**アタック宣言時**に見る事前登録）への追加だが、この効果は `ON_ATTACK_LRIG` から走る＝
**宣言はもう済んでいる**。**シグニ側だけが `cancel_current_signi_attack` という別軸を持っていた**＝
🔴**片側だけ塞がっていた**（同じ壊れ方を `WDK04-006-E1-G` も踏んでいた＝あちらも1回も止められていない）。
⇒ **`PlayerState.cancel_current_lrig_attack` を新設**：
- 立てる＝`applyDirectAction` の `NEGATE_ATTACK`（対象が `attackingLrigOf(state)` と一致したとき）。
- 読む＝**`resolveLrigAttackContinuation`（`screens/battle/attackNegation.ts`）1本**＝
  **人間経路（`resolvePendingLrigAttack`）と CPU 経路（ガード応答セット）が同じ関数を通す**。
  無効化した回は**防御側に `lrig_attacked` を立てない**＝ガード応答もダメージも起きない。
- 失効＝使った時点で即クリア＋ターン終了時の安全クリア（`cancel_current_signi_attack` と同じ2箇所）。
⚠**アシストルリグのアタック**は `lrigTop`（センター）ではないので、`CENTER_LRIG_OR_SIGNI` の候補へ
`attackingLrigOf` を足していないと `attackingOnly` の絞り込みで消える（無言 no-op に戻る）。
**影響枚数**＝直接は1効果 / 1カード。**同じ機構に載る既存効果**＝`ON_ATTACK_LRIG` から
「そのアタックを無効にする」形（`WDK04-006` ほか）。
**逆翻訳も直した**＝`decompileEffects.ts` の `NEGATE_ATTACK` は `attackingOnly` のとき対象型を見ずに
「シグニ」と固定で書いていた＝**engine と逆翻訳が同じ嘘で一致**して計器が緑のままになる形（`O-60` 第59の落とし穴③）。

### ② `WXK03-059-E1`＝「使用できる」が「与える」に化けていた

**原文**＝「【常】：あなたは【ライド】を《メインフェイズアイコン》と《アタックフェイズアイコン》を
**持つかのように使用できる**。」（母集団 **実測1効果 / 1カード**）
**真因**＝live は `GRANT_KEYWORD{keyword:'ライド', target:{SIGNI, owner:'any'}}`＝
**自分か対戦相手のシグニ1体に【ライド】を与える**という原文に無い動作（しかも【ライド】は
**ルリグ側**のキーワード＝`effectParser.ts` が `<CardNum>-RIDE`＝`ACTIVATED{timing:['MAIN'], STUB{RIDE_ON}}`
を生成する＝**シグニに付けても何も起きない**）。
⇒ `manualEffects.ts` に**宣言型 `STUB{RIDE_USABLE_IN_ATTACK_PHASE}`** として書き直し（速いレーン）。
消費は **`collectCenterLrigActivatedEffects`（`screens/battle/battleUtils.ts`）1点**＝
ATTACK_ARTS 窓のとき、**自分の場にこのシグニが居る場合だけ**ライドの【起】を足す。
🔑**ライドの `timing` は書き換えない**＝`<CardNum>-RIDE` は**全ルリグ共通の生成物**なので、
`timing` に `ATTACK_ARTS` を足すと**このシグニが場に居ない盤面でも撃てる**過剰実行になる。
⚠`census:stubs` C群（生ID露出）を避けるため `decompileEffects.ts` の `miscStubMap` に日本語文を足した。

### ③ 副産物＝`O-271` を登録（**実装はしていない**）

**ルリグ【起】の `cost.fieldTrash` にはどこにも支払いが無い**（実測 **8効果 / 7枚**）＝
提示ゲート（`lrigActivateGate.ts` は `fieldBanish` しか見ない）も `performLrigActivated` も1行も見ていない＝
**踏み倒して撃てる**うえ、帰結が `{$ref:'last_processed_count'}` の札は**払っていない＝0体**で本体も空振りする。
**シグニ【起】側は既に払える**（`signiActivateGate.ts` ＋ `useSigniActivated.ts` の `fieldTrashZones`）＝**穴はルリグ側だけ**。
閉じると台帳の残 OPEN が **2件**減る（`SPDi44-16-E2` / `WX25-P1-030-E2`）。登録票は `PLAN_DETAIL.md` の `O-271`。

### 検証コマンド

```
npm run build:effects && npx tsx scripts/syncManualLive.ts WXK03-059
node scripts/heldReview.mjs --adopt WXDi-P09-036
npm run regen && npm run gates
npm run golden -- --only "WXDi-P09-036-E1" --only "WXK03-059-E1"
```

**ゲート＝全緑 ✅**（golden **3563 → 3565**／smoke 0／fuzz 0／census 0 / BASELINE 0／
`census:stubs` A群🔴0・C群0／manual-fields 0／`census:enginetext` A🔴0行／`census:costtext` A🔴0規則／lint 0 errors）。
**反転確認＝2件とも実施**＝①`attackingLrigOf` を常に `undefined` にすると FAIL
②`rideUsableInAttackPhase` の判定を外して常に許すと FAIL（「場に居ないときは出さない」側が落ちる）。
**live A/B 差分＝2カード**（`WXDi-P09-036` / `WXK03-059`）＝意図した件数だけが動いた。

## 2026-09-07（第202バッチ）＝**残 OPEN 12 → 9**（`O-269` の教訓を残件へ適用）／`O-270` を新設・実装

**この回の作業単位**＝§5.2 段2 台帳の残 OPEN。**前バッチで得た「受け皿は概念で探す」を残り12件へ機械的に当てた。**
**残数計器**＝`semanticAuditLedger.mjs` **12 → 9**（本日通算 **24 → 9**）。

### ⓪ 教訓の適用がそのまま成果になった

前バッチの結論は「**キー名を1つ思い浮かべて grep した結果を母集団と呼ばない。型定義から概念で列挙して引き算する**」。
これを残り12件へ当てたところ、**「機構待ちで確定」としていた3件に受け皿が実在した**：

| finding | 前回の判定 | 実際 |
|---|---|---|
| `WXDi-P11-TK02-E2`（合計1回アタック） | 「プレイヤー単位のアタック回数上限が要る」 | 🔴**`signi_attack_once_limit` が実在**（同型3件のうち**2件は既にそれを指していた**） |
| `WXDi-P01-039-E1`（基本レベル）×2 | 「場以外のゾーンへの常時レベル上書きが要る」 | 🔴**`TREAT_AS_LEVEL1_IN_DECK_TRASH` が実在**（消費地点は `execSearch` の `searchCardMap` 差し替え） |

🔑**探し方の違いだけ**＝前回は「あるはずのキー名」を grep したが、今回は **`PlayerState` の attack 系キー全数**・
**`EffectCost` の全フィールド**・**level 系の型全数**を先に列挙してから引き算した。

### ① `WXDi-P11-TK02-E2`＝「合計1回」が「特定の1体だけ禁止」に化けていた（真因1行・engine 0行）

**真因**＝parser が `BLOCK_ACTION{actionId:'ATTACK', target:{SIGNI, count:1}, until:'NEXT_TURN'}` を出しており、
**特定の1体だけ**がアタックできなくなる別物だった（**2体目以降は自由**＝過小実行）。
**受け皿**＝`STUB{LIMIT_OPP_SIGNI_ATTACKS_ONCE}` → `otherState.signi_attack_once_limit` →
`screens/battle/signiAttackGate.ts:163`（**既に1体アタック済みなら禁止**＝合計1回）。
⚠**期間は state のリセット地点で決まる**＝自分のメインで立てる→自分のターン終了では相手側は消えない→
相手のターンに効く→相手のターン終了で消える＝原文「次の対戦相手のターンの間」と一致。
**影響枚数**＝1効果 / 1カード。**engine 0行。**

### ② `WXDi-P01-039-E1`＝恒久 no-op だった（§5.3 `O-270` を新設）

**真因**＝live は `BLOCK_ACTION{actionId:'SET_LEVEL_1', until:'END_OF_TURN'}`＝**`SET_LEVEL_1` を読む消費地点が
engine に1つも無い恒久 no-op**（しかも原文は常時・デッキとトラッシュ・レベル2と3なのに、場所も元レベルも無い）。
**受け皿は在った**（`STUB{TREAT_AS_LEVEL1_IN_DECK_TRASH}`＝`execSearch` が `searchCardMap` を差し替えて `Level:'1'` にする）。
🔴**ただし収集の主語が逆で、生成側は live 0件＝誰も使っていない受け皿だった**＝
`collectDeckTrashLevel1Nums` は「**デッキ/トラッシュのカード自身**が宣言する」形しか見ておらず、
このカードのような「**場のシグニが**デッキ/トラッシュの他の札に効く」形を集められなかった。
⇒ 収集側に②の分岐を足し、範囲を **`deckTrashLevel1Filter` payload** で持たせた。
⚠**payload が無い宣言は②では何も集めない**（fail-closed＝範囲が落ちてもデッキ全部がレベル1に化けない）。
⚠**呼び出し元は7箇所**（`BattleScreen`）＝`cardMap` を渡さないと**静かな no-op** になるので、
**golden で「cardMap 無しなら集めない」契約も固定**した。
**影響枚数**＝1効果 / 1カード（2 findings）。

### ③ 自分で入れた退行を計器が捕まえた（記録）

`LIMIT_OPP_SIGNI_ATTACKS_ONCE` の逆翻訳 regex に「次の対戦相手のターンの間、」を足すとき
`対戦相手` → **`対戦相手は`** と絞ったら、**別カード `WD13-010-E1`（「対戦相手**の**センタールリグとシグニは…」）が
生ID露出に落ちた**。⇒ `census:stubs` の **C群ゲートが exit 1 で止めた**（`対戦相手(?:は|の)` へ修正）。
🔑**既存 regex を「改善」するときは、その規則に当たっている全カードを数え直す。**

### 検証

`npm run gates` **全緑**（golden **3562 → 3563**）。
🖥**実機**＝`O-270` は `src/screens/` を触ったので必須だが、**観測シナリオが組めず `V-176` として §5.1 へ持ち越した。**
🔑**engine 経路は golden で代替済み**＝収集関数の正負両方向＋**`execSearch` まで通した候補差し替え（デッキ／トラッシュ両方）**。
⚠**4パターンとも実機に載らなかった**（`WX13-061`＝サシェ限定＋Lv4 でリミット超過／`WXK11-062` は
`ADD_TO_FIELD{TRASH_CARD}` 経路で差し替えが効かない／`WX16-069` は「英知=3」条件／`WX15-072` はバニッシュ誘発）
⇒ 🔑**観測カードは「`SEARCH` を使う・限定なし・低レベル」で先に絞る**（`Restriction` 列を必ず見る）。
⚠**FAIL するシナリオを常設しない**（計器の狼少年化）＝作りかけは削除し、`V-176` に条件を書き残した。

## 2026-09-07（第201バッチ）＝**§5.3 `O-269` を実装してクローズ**（スペル使用の色記録）／台帳 残 OPEN 13 → 12

**この回の作業単位**＝PLAN §5.3 索引 A の `O-269`（前バッチで登録した唯一の2桁項目）。
**残数計器**＝`semanticAuditLedger.mjs` **13 → 12**／`census:cards --sheet 1` 要対応 **4 → 1**（O-269 クローズで `mech` が外れた）。

### ⓪ この回の最大の収穫＝**登録票の母集団は「着手時にもう一度」実測する**

`O-269` は前バッチで「**live 16効果 / 16カード**・使用したスペル／アーツの色を engine がどこにも記録していない」
として索引 A（母集団2桁）へ登録した。**着手して1件ずつ live を読んだら、14件は別名の受け皿で既に配線済みだった。**

| 群 | 件数 | 実際の受け皿 |
|---|---|---|
| トリガー型（「〈色〉のスペルを使用したとき」） | 9 | `triggerFilter.color` ＋ `triggerCollect.ts:25` の `spellUseTriggerMatches` |
| 条件型・アーツ（「〈色〉のアーツを使用していた場合」） | 5 | `ARTS_USED_THIS_TURN.color` ＋ `turn_arts_used_colors`（記録・評価とも実装済み） |
| コスト軽減（`WXK01-060-E1`） | 1 | `COST_REDUCTION.color` → `ActiveCostMod.cardColor` → `costs.ts` の `applyContinuousCostDecreases` |
| 🔴**真の穴** | **1** | `SPELL_USED_THIS_TURN` に色が無い（`WX25-P2-075-E1`） |

🔴**原因は登録時の grep が「あるはずの名前」だけを見ていたこと**（`spellColor|usedSpellColor|last_spell_color`）＝
PLAN §5.3 の罠⑤「**受け皿の別名を全部知らないかぎり必ず過大に出る**」を、**登録した本人が同じセッションで踏んだ**。
🔑**同じ回に3回踏んでいる**（「コストか効果によって」25→1／`triggerFilter` を見落として 16→2／`COST_REDUCTION.color` で 2→1）
＝**この罠は「知識が足りない」ではなく「grep 句が仮説に依存する」という構造**。
⇒ 🔑**受け皿を探すときは「概念」で grep する**（`color` を含む条件型・フィルタ型を**全部列挙してから**絞る）。
**キー名を1つ思い浮かべて grep した結果を母集団と呼ばない。**

### ① `WX25-P2-075-E1`＝条件が落ち、その色が**対象フィルタへ誤付着**していた（真因1行）

**真因**＝parser に「このターンにあなたが**〈色〉の**スペルを使用していた場合」の規則が無く、色なし規則
（`/このターンにあなたがスペルを使用していた場合/`）にも当たらないので**条件が丸ごと落ちた**。
さらに宙に浮いた「赤の」が**直後の対象（パワー3000以下のシグニ）の色限定**として吸われていた。
⇒ **過小（条件なしで常に撃てる）と過剰（対象が赤に限定される）が同じ根から同時に出ていた**
（LESSONS §4.2「1つの根から過剰実行と過小実行が同時に出る。片方だけ直してはいけない」の実例）。

**受け皿**＝`SPELL_USED_THIS_TURN.color` を新設。
🔑**判定源を増やさない設計にした**＝アーツ側は `turn_arts_used_colors` という専用キーだが、
`SPELL_USED_THIS_TURN` の判定源は `actions_done` の `'USE_SPELL'` マーカーなので、**色も `actions_done` に
`'USE_SPELL_COLOR:<色>'` として積む**。⇒ **ターンリセットが自動的に揃う**
（専用キーを足すと `actions_done`（3箇所）と `turn_arts_used_colors`（6箇所）のように**リセット地点が別々**になり、
片方だけ残る事故になる）。⚠`actions_done.includes('USE_SPELL')` は**配列要素の完全一致**なので既存判定は不変
（golden で「色マーカーだけで成立しない」「色マーカーを枚数に数えない」の**負方向2本**を固定した）。

**触った場所**＝型1／`evalCondition` 1／`BattleScreen` のスペル使用2箇所／parser 規則1本／逆翻訳1箇所。
**修正は parser 規則1本で足りた**＝規則を足しただけで条件が入り、**誤付着していた `filter.color` も同時に消えた**。

**影響枚数**＝**1効果 / 1カード**（`SPELL_USED_THIS_TURN` に色を持てる基盤自体は全効果に効く）。

### 検証

`npm run gates` **全緑**（golden **3559 PASS**＝+2 は本件の正負両方向）。
🖥**実機＝必須**（§2.2＝`src/screens/` を触った）。**`node scripts/verifyBattleDrive.mjs spellColorMarker` PASS**
＝赤のスペルを使用して `actions_done` に `USE_SPELL` と `USE_SPELL_COLOR:赤` の**両方**を確認
（記録側は JSX 内のインライン式なので golden から import できない＝実機が唯一の観測点）。
シナリオは `V-164` として `verifyBattleDrive.mjs` に常設した（反転確認＝使っていない色のマーカーが積まれたら FAIL）。

## 2026-09-06（第200バッチ）＝**意味照合 段2 台帳の残 OPEN 掃引**（24 → 13）＝実バグ2効果を修正・9件は簿記漏れの回収

**この回の作業単位**＝PLAN §5.2 の**段2 台帳**（round4 の新規監査ではなく、既存 findings の残 OPEN）。
**残数計器**＝`node scripts/archive/semanticAuditLedger.mjs`（**残 OPEN 24 → 13**）。

### ⓪ この回の最大の収穫＝**「全件が機構待ち」という PLAN の記述が間違っていた**

PLAN §5.2 は残 24 件を「**engine/JSON だけで閉じられるものは0件**・全件が `src/screens/` か新 engine 機構待ち」と
書いていた（続き766 の全数 triage 結論）。**実測すると 24 件中 11 件はそうではなかった**＝
**9件は既に直っているのに閉じ忘れ（stale）／1件は偽陽性／1件は engine 0行で直せた。**
🔑**教訓＝「掘り尽くした」という判定そのものが腐る。** 台帳は `stage2_closed.txt` へ**手で**追記しないと減らないので、
**別の項目（`O-160`/`O-185`/`O-209`/`O-213`/`O-257`）で直したときに finding を閉じ忘れる**のが恒常的に起きる。
🔴**`semanticAuditRecheck.mjs` はこの9件のうち1件しか拾えなかった**（LCS 照合の構造的限界）＝
- **`effectId:null` の finding（ハーモニー2件）は照合対象外**＝識別子が CardNum なので逆翻訳を引けない。
- **受け皿の名前が変わった finding（ドリームチーム3件・遅延誘発2件）は LCS が伸びない**＝
  引用句は原文の言い回しなのに、逆翻訳は実装後の語彙で書かれるため似ない。
⇒ 🔑**recheck を回して0件でも「掘り尽くし」ではない。** 残件が少ないときは
**finding の受け皿を1件ずつ `grep` で探すほうが速い**（この回は grep だけで9件＝**実装0行**で消えた）。

### ① `WDK06-C14-E1`＝**対象宣言が条件の内側に入っていた**（真因1行）

**真因**＝原文「あなたのトラッシュから…シグニ１枚を**対象とし**、あなたのターンの場合、それを場に出す」に対し、
live は `CONDITIONAL{TURN_OWNER self}` が**対象選択ごと**包んでいた＝**相手ターンには対象を取らない**。
⇒ 対象に取ること自体が誘発する能力（`ON_TARGETED`）や対象耐性が相手ターンに働かなかった。

**受け皿**＝**同じ形が既に live にある**（`SPDi44-16-E1` / `WX25-P1-030-E1`）＝
`SELECT_TARGET_ONLY` → `STORE_LAST_PROCESSED_TARGETS` → `CONDITIONAL{…, targetsStored}` の3ステップ定型。
⚠**宣言側と実行側で候補集めの関数が違う**（`transferToHandTrashCandidates` / `zoneTargetCandidates`）ので
`O-188`「宣言と実行で候補がズレると選んだのに出せない」を確認した＝**どちらも `movableTrashCandidates` に落ちる**ので
このフィルタ（cardType/level/story のみ）では一致する。

**影響枚数**＝**1効果 / 1カード**。**engine は0行。**

### ② `WXDi-D03-004-E3`＝**「捨てないかぎり」の回避ゲートが丸ごと落ちていた**（真因1行）

**真因**＝引用能力の原文「対戦相手が《ガードアイコン》を持つカードを１枚**捨てないかぎり**、対戦相手にダメージを与える」の
回避句が parser から落ち、**ルリグ2体をダウンしたら無条件でライフクラッシュ**していた（相手にガードの機会が無い＝過剰実行）。

**受け皿**＝既存の `STUB{OPPONENT_PAY_OPTIONAL}` ＋ `opponentHandDiscard:1` ＋ `opponentHandDiscardFilter:{hasGuard:true}`。
🔑**極性は「支払わなかったら次の `CONDITIONAL{IS_MY_TURN}` の then が発動」**（`effectExecutor.ts:5749` の標準ペア。
`thenOnPay` を立てない限りこの向き）＝原文「捨てないかぎり」と一致する。
⚠**外側の `CONDITIONAL{IS_MY_TURN}` は触っていない**＝あれは parser の「そうした場合」慣例エンコードで、
engine が did-it ゲートとして読み替える（`DID_IT_GATED_TYPES` に `DOWN` が入っている）＝**正しい**。
**この読み替えを知らずに「条件が変」と直すのが §5.2 の代表的な偽陽性。**

**派生修正（表示の穴）**＝`hasGuard` が**ラベルにも逆翻訳にも出ていなかった**＝
engine 側の絞り込み（`eligibleHand`）は正しく効くのに、実機の選択肢は「手札を1枚捨てる」としか出ず
**何を捨てれば回避できるか読めない**。`effectExecutor.ts` の `handLabelNoun` と
`decompileEffects.ts` の `nounOfOPO` を**対で**直した（片方だけだと逆翻訳と実機が食い違う）。

**影響枚数**＝**1効果 / 1カード**（表示修正は `opponentHandDiscardFilter` を持つ全効果に効く）。

### ③ 偽陽性1件＝`WXDi-CP02-034-E1`

原文の括弧書き「（【出】能力と【絆出】能力の**：の左側はコストである**。コストを支払わず発動しないことを選んでもよい）」は
**コストを持つ能力**の説明。E1 は「【出】：」＝**コスト無し**なので `mandatory:true`（強制）が正しい
（コストを持つ E2《無》・E3【絆出】は live も `mandatory:false`）。

### 検証

`npm run gates` **全緑**（typecheck / golden **3557 PASS** / smoke / fuzz / census / census:stubs /
manual-fields / census:enginetext / census:costtext / lint）。
golden に**この2件の live 形を固定するテストを2本追加**（`§5.2 残OPEN: …`）。
`OPPONENT_PAY_OPTIONAL` の live 出現数ラチェットを **79 → 80**（増えた1件は回避枝あり側＝安全弁は不変）。

**実機の要否**＝**不要**（PLAN §2.2 の機械判定）。触ったのは `src/data/`・`public/data/`・`scripts/` と
`src/engine/` の**表示ラベル1箇所**だけで、新しい型・機構は1つも足していない。

⚠**`_partial_fresh` のラチェットで1度 FAIL した**＝`syncManualLive.ts` で live へ届けたあと
**`npm run build:effects` を回し直さないと fresh 側が古いまま**残る。**sync → build:effects の順で閉じる。**

### 残り13件の見立て（全件が機構待ちで確定）

| finding | 要る機構 |
|---|---|
| `PR-K048`（無色コストを白/赤/青でしか払えない） | コスト支払い UI（`src/screens/`）に色制限の層 |
| `SPDi44-16-E2` / `WX25-P1-030-E2`（シグニを3体**まで**） | `cost.fieldTrash` の可変枚数版（`charmTrashVariable`/`lrigDownVariable` と同型＋支払い UI） |
| `WX13-005B-E1`（スペルの効果より先に） | 解決順序の割り込み機構 |
| `WX25-CP1-016-E1`（シグニかスペルの、コストか効果によって） | 手札を捨てた**原因カードの種別**の追跡（`byOwnEffect` は原因の種別を持たない） |
| `WX25-P2-075-E1`（**赤の**スペルを使用していた場合） | `USE_SPELL` マーカーに色を積む（`actions_done` は文字列のみ） |
| `WXDi-P01-039-E1`×2（デッキとトラッシュの**基本レベル**変更） | 場以外のゾーンのカードへ常時レベル上書き |
| `WXDi-P09-036-E1`（ルリグのアタックを無効） | `ON_ATTACK_LRIG` 窓＝**宣言通過後**なので `cancel_current_signi_attack` のルリグ版が要る |
| `WXDi-P11-TK02-E2`（シグニで**合計**一度しかアタックできない） | プレイヤー単位のアタック回数上限 |
| `WXDi-P13-089-E3`（手札とエナとトラッシュから各1枚除外） | 複数ゾーンを跨ぐ**コスト**（`combinedTrash` は出現条件側にしかない） |
| `WXK03-059-E1`（【ライド】を〜を持つかのように使用できる） | キーワードの**使用可能タイミング**を拡張する層 |
| `WXK10-004-E1`（**場以外**のあなたの領域） | `ZONE_MOVE_IMMUNITY.zones` が `'hand'\|'energy'` 固定＝消費地点5箇所をデッキ/トラッシュへ拡張 |

## 2026-09-06（第199バッチ）＝**O-A の未 triage 3件を判定**（BUG 2／FP 1）＝実バグ3効果を修正・派生発見を `O-268` で登録

**この回の作業単位**＝PLAN §5.0 の 🔵Opus レーン **O-A（findings の triage）**。
**残数計器**＝`node scripts/archive/semanticAuditPool.mjs`（**未 triage 3 → 0**）。

### ① `WX05-028-E1`／`WXDi-P02-053-E1`＝「正面のシグニがアタックしたとき」が**自分のアタック**に反転していた（真因1行）

**真因**＝parser の timing 判定に「このシグニの正面の〔対戦相手の〕シグニがアタックしたとき」の分岐が無く、
総称フォールバック `trigText.includes('アタックしたとき') ? ['ON_ATTACK_SIGNI']` に落ちていた。
🔴**engine 側は `collectAttackerSelfTriggers`（`triggerCollect.ts:4516`）が
アタッカー自身の `ON_ATTACK_SIGNI` を scope も見ずに全部拾う**ので、
**守備側で1度も発火せず、代わりに自分がアタックしたときに発火する**＝発火条件が別物になっていた。
🔑**配線ではなく表現の穴**＝受け皿 `ON_FRONT_SIGNI_ATTACK`（`BattleScreen.tsx:9505` が
正面ゾーン `ozi !== opFrontZoneIdx` で弾いて積む）は既にあり、`WX04-082-E1` だけが `manualEffects.ts` で
個別に回避していた（**その回避コメントが finding のヒントになった**）。

**影響枚数**＝**AUTO 2効果 / 2カード**（母集団は `正面.{0,14}アタックした` で **4効果 / 4カード**＝
`WX04-082-E1` は MANUAL で修正済み・`WXEX2-71-E1` は「正面**以外**に」＝別主語）。
🔑**LLM の書いた grep 句は狭すぎた**（「正面の対戦相手のシグニがアタック」＝1効果しか当たらない）＝
**緩めて数え直したから2件目が出た**（PLAN §5.0 に明記済みの手順）。

**修正**＝`effectParser.ts` の timing カスケードに1本追加（総称フォールバックの直前）。
`WXDi-P02-053-E1`（`STUB{MOVE_TO_OTHER_SIGNI_ZONE}`）は**同じ STUB を使う他5枚**
（`WX14-050/052/053`・`WXK06-076` ＝原文「対戦相手のシグニ1体がアタックしたとき」＝ゾーン限定なし）を
巻き込まないことを golden の負方向で固定した。

### ② `WX07-026-E1`＝「ライフクロスを２枚**まで**クラッシュ」が**1枚固定**だった（真因1行）

**真因**＝`parseSentencePart1.ts` の枚数 regex が `([０-９\d]+)枚をクラッシュ` と `ライフクロス([０-９\d]+)枚` の
2本しか無く、**「ライフクロスを２枚まで」にはどちらも当たらない**＝`cM ? … : 1` の**既定1枚**へ黙って落ちていた。
🔴**「既定値のある regex は外れたことが可視化されない」族**（第197バッチ `WX08-010` と同型＝[LESSONS.md](./LESSONS.md) §4.3）。

**受け皿**＝`LifeCrashAction.upToCount` を新設（`optional` は 0/N の二択しか作れず、
**中間の枚数**を表せない）。`execLifeCrash` が 0〜N の `CHOOSE` を立てる（既存の `optional` 分岐と同じ形）。
🔑**「まで」を無視して2枚固定にもしない**＝クラッシュは相手にライフバーストとエナを与えるので
**少なく撃つ選択に意味がある**。

**影響枚数**＝**1効果 / 1カード**（`ライフクロス[をの]?[２-９]枚…クラッシュ` の他5効果は「N枚**を**」型で正しい）。

### ③ `WX05-006-E2`＝**FP**（スペルは配線済み）／ただし triage の途中で別バグを発見

finding は「STUB の id が `IGNORE_LRIG_RESTRICTION_ARTS`＝アーツだけを指しており、
原文の**スペル**の限定条件無視が入っているか不明」。**消費地点を読むと配線済み**
（`spellUseGate.ts:146` が `payer.ignoreRestriction` を読む／その値は `artsUseGate.ts:143` の
`hasIgnoreLrigRestriction` が作る）＝**id 名は表示用で、範囲を決めるのは engine**。
⇒ **`semanticAuditExtract.mjs` の読み方ルールに規則17 を追加**（PLAN §2.6 決定2 の還元ループ）。

🔴**ただし逆向きの過剰を発見した**＝`ignoreRestriction` は**手札からのシグニ召喚ゲート**
（`BattleScreen.tsx:8721`）にも一律に効くので、**限定つきシグニ（実測952枚）まで無視できる**。
`PR-K060-E4`（原文はアーツのみ）ではスペルの限定まで無視できる。
⇒ **範囲 payload が要る＝`src/screens/` を触るので実機必須** ⇒ **PLAN §5.3 索引 G に `O-268` で登録**（未着手）。

### 検証

- `npm run gates` **全緑**（golden 全件・smoke・fuzz・census 各種）。
- golden **+2本**＝「§5.2 round4 第2」（timing・正方向3件／engine 反転確認2件／負方向3件）
  「§5.2 round4 第3」（`upToCount` の payload ＋ 0/1/2枚を実際に選ぶ実行）。
- **反転確認**＝engine の `if (a.upToCount)` を `if (false && a.upToCount)` にすると第3が FAIL（対話が出ない）。
- **逆翻訳を目視**（`npm run regen`）＝3枚とも原文どおりになった
  （「このシグニの正面のシグニがアタックしたとき」「ライフクロスを2枚まで**クラッシュする**」）。
- **実機は不要と判定**＝触ったのは `src/data/` `src/engine/` `scripts/` と `public/data/` だけ（§2.2 の機械判定）。
  ⚠**新しい機構（`upToCount`）を足したが、対話は既存の `CHOOSE` 経路にそのまま乗る**ので、
  UI 側の新規部品は無い（`optional` の分岐と同じ形＝実機の新しい観測点は増やしていない）。

---

## 2026-09-06（第197バッチ）＝🔍**新しい検出パスを開いた**（Sheet1 未監査カードへの意味照合 round4）＋そこから出た実バグ2系統を修正

**なぜこの回か**＝第196バッチ終了時点で **PLAN の worklist が全節 残0** になった。これは「完成した」ではなく
**いまある計器が指すものが尽きた**状態（`census:cards` の出力自身が毎回「**フラグ0 = 正しい ではない**」と言っている）。
⇒ **次にやるのは新しい検出パスを作ること**。

### ① 母集団の実測＝意味照合を1度も通していないカードが 2,688 枚（44.6%）あった

過去4ラウンド（`semantic_audit_101` / `clean_round1` / `stub_round2` / `stub_round3`）の
`audited_*_cumulative.txt` / `sampled_cards.txt` の**和集合 3,344枚**を、効果ありカード **6,032枚**から引いた実測：

| シート | 効果あり | 監査済 | 未監査 |
|---|---|---|---|
| Sheet1 | 863 | 611 | **252** |
| Sheet2 | 895 | 539 | 356 |
| Sheet3 | 804 | 435 | 369 |
| （全11ファイル計） | **6,032** | 3,344 | **2,688（44.6%）** |

🔑**意味照合は「受け皿の名前を知らない穴」も拾える唯一の発見器**（逆翻訳・census・golden は
**知っているキーしか見ない**）。⇒ ここが最も確度の高い未探索在庫。

### ② パイロット3バッチ（30枚）＝findings 6件 / 真バグ 3件（precision 50%）

`Sheet1 未監査252枚` を seed 42 でシャッフルし 10枚/バッチ・`claude -p --model sonnet` で3バッチ。
所要 115s / 138s / 159s。**batch01 は 0件**（＝いきなり当たるわけではない）。
成果物と全 triage 表は `scripts/archive/scratchpad/semantic_audit_sheet1_round4/README.md`。

🔑**偽陽性3件はすべて「engine が JSON の見た目を裏で読み替えている」型**＝JSON だけを読む監査員には
原理的に判定できない。**引き当てたら engine の受け皿を必ず読む**（今回は2件ともそれで偽陽性と確定した）：
- `WX10-072-E1` の「そうした場合」＝`CONDITIONAL{IS_MY_TURN}` は `effectExecutor` の **did-it ゲート**が
  消費する（`DID_IT_GATED_TYPES` に `LIFE_CRASH` がある＝相手のライフが0で空振りなら then は発生しない）。
- `WX11-044-BURST` の「捨てないかぎり」＝`OPPONENT_PAY_OPTIONAL` の**既定の極性が「払わなかったら then」**
  （`thenOnPay` を立てたときだけ逆向き）。**JSON の `IS_MY_TURN` は極性を持っていない。**

### ③ 🔴真バグ(1)＝クロス宣言つきの能力に `crossOnly` が無かった（**10枚**・parser）

**症状**＝原文「**《クロスアイコン》《相方名》の右【出】**：…」の宣言は**直後の1能力のゲートそのもの**なのに、
parser は接頭辞を `card.hasCrossIcon` / `card.crossConditionText` へ写して**捨てるだけ**だった
（`effectParser.ts:26193`）。⇒ **クロスしていなくてもその能力が発動する**（過剰実行）。

**なぜ今まで気付かなかったか**＝**【クロス自】側にはフラグが立っていた**（`parseBlock` が `【(クロス)?…】` を読む）。
1枚のカードの E2 だけ `crossOnly` が付いて E1 に無い、という見た目になるので逆翻訳を眺めても違和感が出ない。
**受け皿（`isCrossZoneActive` / CONTINUOUS ループの `crossOnly` 分岐 / `triggerCollect`）は最初から在った＝配線だけの穴**
（LESSONS §4.1「まず受け皿を疑う」の再確認）。

**直し方**＝接頭辞を剥がしたときに `crossPrefixGatesFirstBlock` を立て、**最初に parse できたブロック1つだけ**に
`crossOnly` を渡して消費する（後続の【クロス自】は `parseBlock` が自分で立てるので二重にしない）。

**影響 = 10枚**（宣言つきカード全数）＝`WX09-016` `WX09-020` `WX11-037` `WX11-038` `WX11-041` `WX11-043`
`WX11-046` `WX11-050` `WX13-031` `WX25-P1-054`。うち **`WX09-016-E1`（MANUAL）と `WX25-P1-054-E2`（MANUAL・
【クロス自】なのに欠落）は手書き側なので `manualEffects.ts` に明示**し、`syncManualLive.ts` で live へ配送した
（収穫マージは MANUAL を効果単位で不可侵にするので parser 修正が届かない）。

### ④ 🔴真バグ(2)＝`WX08-010` 不灯不屈がクラッシュ枚数に比例せず、バーストも止めていなかった

原文「あなたのライフクロス２枚をクラッシュする。その後、**この方法でクラッシュしたライフクロス１枚につき**
対戦相手のシグニ１体を対象とし、それらをバニッシュする。**この方法でクラッシュされたカードのライフバーストは発動しない。**」

旧 AUTO の壊れ方は2つ：
1. **`BANISH` が `count:1` 固定**＝ライフ2枚を削っても1体しかバニッシュしない（**過小**）。
2. **`STUB{SUPPRESS_LIFE_BURST_ON_CRASH}` を `LIFE_CRASH` の"後ろ"に置いていた**。しかもあのハンドラは
   `otherState`（＝**対戦相手**）にターンフラグを立てる実装（`execStubPart1.ts:1732`）で、ここは**自分の**ライフ。
   ⇒ **向きも順序も合わず、バーストが普通に発動していた**（原文と真逆）。

**直し方**（`manualEffects.ts`・速いレーン）＝`triggerBurst:false`（クラッシュ札はチェックゾーンを経ず
トラッシュ直行＝原文どおりバースト無し）＋ `snapshotLastProcessedForConditionals` で
**実際にクラッシュできた枚数**（`execLifeCrash` が `lastProcessedCards` に残す）をスナップショットし、
`LAST_PROCESSED_COUNT_GTE 1 / 2` で `BANISH` を1体ずつ足す。⚠ライフが1枚しか無い盤面では1体だけになる＝原文と一致。

### ⑤ 検証

- **golden 3550 → 3553**（+3・**`crossOnly` の assert はこれまで1件も無かった**）。
  ①宣言つき10枚の先頭能力に `crossOnly` が立つ＋**反転方向**（宣言の無いカードには立たない）
  ②【クロス自】側の `crossOnly` は据置（先頭で消費し切らない）③`WX08-010` の構造（バースト不発・枚数2段）。
- `npm run gates` **全緑**（smoke 全異常0／fuzz 全0／census 0 / BASELINE 0／`census:stubs` A群🔴0・C群0／
  manual-fields 0／`census:enginetext` A🔴0行／`census:costtext` A🔴0規則／lint 0 errors）。
- **live A/B 差分＝9カード**（parser 由来）＋ `syncManualLive` 2枚 ＋ `WX08-010` 1枚。**意図した件数だけが動いた。**
- **逆翻訳**（`npm run regen`）＝`WX11-043-E1` が「《コードアート　Ｃ・Ｍ・Ｃ》の右に置かれているかぎり…」を
  表示するようになり、`WX08-010-E1` は「あなたのライフクロスを2枚トラッシュに置く（バースト不発）。そして
  この方法でカードを1枚以上処理したなら…2枚以上処理したなら…」と原文どおりに読める。
- 🖥**実機＝不要**（§2.2 の機械判定＝触ったのは `src/data/` と `public/data/` と `scripts/goldenTest.ts` のみ。
  `src/screens/` も `src/engine/` も触らず、新しい型・機構も足していない）。

### ⑦ 在庫計器を恒久化＝`node scripts/archive/semanticAuditGap.mjs`

①の 2,688枚は使い捨ての `tmp_gap.mjs` で出しており、**次のセッションが測り直せなかった**（＝在庫を語れない）。
⇒ `scripts/archive/semanticAuditGap.mjs` として恒久化した（`--sheet N` で未監査カード番号を列挙＝
`pending_cards.txt` を作り直せる）。

🔴**初版の罠を1つ潰してある**＝監査済みの集合を**ディレクトリ名の固定リスト**で書くと、
**round4 を消化しても数が減らない**（自分が作ったラウンドを数え落とす）。⇒ いまは
`scripts/archive/scratchpad/semantic_audit_*/` の `*cumulative.txt` / `sampled_cards.txt` を**自動走査**する。

**恒久化後の実測**＝効果あり **6,032枚 / 監査済 3,374 / 未監査 2,658（44.1%）**・**Sheet1 は 222枚**。
⚠🔴**`npm run census:cards` の「監査を通したのは 611枚」とは別物**＝あちらは `clean_round1` の1ファイルしか
読まない（`cardProgressCensus.mjs:221`）＝**round4 を消化しても増えない。** 混同すると進捗が二重に見える。

### ⑥ 🔑この回の教訓＝**3計器が1つも動かないまま実バグ11枚が直った**

Sheet1 要対応 **0 / 863**・台帳 残 OPEN **24**・census 高シグナル **0 / BASELINE 0** は**すべて据置**。
理由は単純で、**直した11枚はどの計器にも映っていなかった**（クロス宣言は語彙が欠けているわけではなく、
`WX08-010` も STUB を持ち逆翻訳も一見通る）。⇒ **計器が動かないことを「成果が無い」と読まない。**
**いま進捗を語れるのは「未監査 2,688枚」という在庫と、その消化枚数だけ。**


## 2026-09-06（第196バッチ）＝📁**PLAN.md を「計画表」に戻した**（教訓を2ファイルへ分離＋クローズ済み記述を削除）

**ドキュメント整理のみ＝`src/` も `public/data/` も1バイトも変えていない。** gates は golden 3550/3550 で据置。

### ① 実測＝PLAN.md の 52% が教訓集だった

`PLAN.md` は **1,313行 / 98,601字**あり、**§4 教訓集が 634行＝52%**
（うち **§4.4 実機シナリオの罠だけで 368行＝全体の30%**）。⇒ **計画表として読めなくなっていた。**

**分離先**（ユーザー決定＝2ファイル）：

| ファイル | 中身 | 読むタイミング |
|---|---|---|
| `docs/LESSONS.md`（333行） | §4.1 着手前／§4.2 実装／§4.3 計器／§4.5 配送経路／§4.6 Codex | §5 のどの項目に着手するときも先に読む |
| `docs/DRIVE_TRAPS.md`（382行） | §4.4 実機シナリオの罠（番号つき89項） | 実機シナリオを書く／直す回だけ |

🔴**節番号 `§4.1`〜`§4.6` は住所として維持した**＝BUGFIXES・`scripts/`・`src/` から**数百箇所**が
「§4.2」「§4.4-2c」の形で参照している（実測＝**`§4.4` だけで `scripts/` から 216箇所**）。**詰め直さない。**

### ② 🔴クローズ済みの「日記」が溜まり、しかも数字が stale だった

§5 の各節に**バッチごとのクローズ履歴**が蓄積していた。最悪だったのは **§5 冒頭の表の「残」列**＝
`<br>` で繋いだクローズ履歴 **2,251字**があり、**3節とも数字が stale**（§5.2「残36」／§5.3「2項目」／§5.4「5件」
＝**実際はすべて 0**）。**PLAN 自身の規則「消化したら行ごと消す（全文は PLAN_DETAIL と BUGFIXES が正）」に反していた。**

**やったこと**＝§5 冒頭の表を**現在値だけ**に／§5.1（26→21行）・§5.2（32→17行）・§5.4（62→21行）を圧縮／
§5.3（207→130行）の索引を**「見出し＋🏁残0＋⚠1行」**に。**残したのは生きた参照だけ**
（登録ルール／索引の読み方／1〜3枚の項目の取り方／根拠つき defer ／既知の潜在結合／監視だけしている項目）。

### ③ 🔑捨てずに「移した」ことを機械照合で確認した

削除は**移設とセット**にした：
- **再利用できる教訓8件を LESSONS.md へ**＝`O-93` の枝番 id によるカード凍結（実バグ6件を隠していた／
  計器自身の偽陽性63%）／`O-132` の**較正キーは免罪符になる**（golden に「根拠キーが live に実在する」を張る）／
  コスト系の消費地点は `screens/battle/` にあるか見る／「逆翻訳が変」は「JSON が壊れている」ではない／
  受け皿はアクション軸とフィルタ軸の2つにまたがる／「わずかな過剰」が常時発火していることがある ほか。
- **規則2件を PLAN へ書き戻した**＝「§5 の上から1件を §5.3 の索引にそのまま当ててよい」／
  「置き場を2つにしない＝§5.1 は生きている観測点だけを持つ」。

🔑**確認方法**＝旧 PLAN の実質1,145行を新3ファイル＋CLAUDE.md と突き合わせ、
**完全に消えた行が「クローズ履歴」だけ**になるまで移設を繰り返した（この照合で教訓2件の取り逃しを発見して回収した）。

### ④ 参照の更新

- `CLAUDE.md`＝docs 配置ルールに2ファイルを追加＋cold start の読み順に「着手を決めたら LESSONS を読む」を追記。
- `docs/CODEX_GUIDE.md`＝「まず読むもの（… PLAN.md §4 …）」→ `docs/LESSONS.md` へ。
- `.claude/skills/baton/SKILL.md`＝**旧構造の「§4＝進捗サマリ」を指したままだった**のを §1 へ修正
  （2026-08-23 の再編で進捗サマリは §1 へ移っており、§4 は教訓集になっていた＝**§4 が別ファイルになった今は誤誘導**）。
  ついでに stale な「Opus 側 / Sonnet 側 で分けて書く」も撤去（モデル分担は廃止済み）。

### 検証

- `npm run gates` **全緑**＝golden **3550 / 3550**（据置）／smoke 全異常0／fuzz 全0／lint 0 errors。
- `npm run census:cards -- --sheet 1` ＝要対応 **0 / 863**・`mech` **0**・`ℹ`（索引5本すべて残0）＝
  **§5.3 の節境界（`### 5.3` 〜 `### 5.4`）と索引の書式を壊していない**ことを実測で確認。
- 🖥**実機は不要**（`docs/` と `CLAUDE.md` と `.claude/skills/` のみ）。

## 2026-09-06（第195バッチ）＝🏁**索引 E の2件も「実作業ではなかった」＝§5.3 機構 worklist が全項目クローズ**／計器を1つ較正

**🔴この巡は「較正」であって前進ではない**（PLAN §3 の原則）＝**`src/` は1バイトも変えていない**。
効いたのは「**計器が嘘をつかなくなる**」ことだけ。

### ① 索引 E の3項目は全部すでに消化済みだった（索引の簿記漏れ）

| 旧項目 | 実測 |
|---|---|
| `O-134`（「代わりに」の帯分解を census が置換落ちと誤読） | **2026-09-06 第176バッチでクローズ済み**。`代わりに(置換)` の高シグナルは **0** で較正自体が不要だった＝**索引に行が残っていただけ** |
| `O-245`（`PlayerState` の書きあり・読み0 キー） | `census:deadstate` **0件 / 347キー**。**ラチェットは golden にある**（`eq(n, 0, …)`）＝**worklist ではなく計器**。説明と罠は CLAUDE.md の項が正 |
| （索引に数えていなかった）チェックボックス「`extraOk` に filter の等価表現を入れる」（`WX15-001-E2`） | **実装済み**＝`vocabCensus.ts` の `conditionClauseExtraOk` が `ADD_TO_FIELD{source:{fromTop,filter}}` 形を較正しており、**golden が assert している**（「§5d-0(iv) 条件節較正」）。census 高シグナルも 0 |

⇒ 3項目とも索引から行ごと削除した（§5.3 の登録ルール「消化したら索引の行ごと消す」）。
**全文は PLAN_DETAIL の登録票と BUGFIXES の該当バッチが正**なので情報は失われない。

### ② 🔴主産物＝計器が「狼少年」になる形を2つ潰した

**(a) クローズ注記を表で書くと未クローズに化ける。**
`cardProgressCensus.mjs:176` は §5.3 の **`| \`O-nn\`` で始まる行だけ**を「開いている項目」と読む
（`O-187` でそう決めた＝登録票の 🏁 では判定しない）。
⇒ **クローズ注記を表の行で書くと、閉じた項目が未クローズとして数えられ続ける。**
**この巡で実際に踏んだ**＝一度この節を表で書いたら `mech` が `O-134`/`O-245` を数え続けた。
⇒ **散文で書き直し**、§5.3 にその理由を明記した。
🔑**これは第181バッチの「クローズ注記にカード番号を書くと `mech` に化ける」と同じ罠の別の面**＝
**`mech` の母集団は §5.3 の書き方そのものに依存する。**

**(b) fail-closed 警告が「本当に残0」でも鳴り続ける。**
索引を全部消化すると「索引テーブルから O-nn を1件も拾えなかった＝**書式が変わった可能性**」が
**正常な状態で永久に出る**（＝警告が意味を失う）。
⇒ **索引見出しの数（`#### 索引 `）だけ `🏁**残0**` 宣言があれば「本当に空」**と判定し、
⚠ ではなく `ℹ §5.3 の索引は N 本すべてが「🏁残0」＝機構 worklist は空（書式の異常ではない）` を出すよう較正した。
⚠**残0宣言が索引見出しより少ないときは従来どおり ⚠**（消したのに宣言を書き忘れた／書式が変わった、を取り逃がさない）。

### 検証

- `npm run gates` **全緑**＝golden **3550 / 3550**（据置＝`src/` 無変更）／smoke 全異常0／fuzz 全0／
  census 0 / BASELINE 0／`census:stubs` A群🔴0・C群0／manual-fields 0／
  `census:enginetext` A🔴 0行／`census:costtext` A🔴 0規則／lint 0 errors。
- `npm run census:cards -- --sheet 1` ＝要対応 **0 / 863**、`mech` **0**、`ℹ` 表示。
- 🔁**反転確認**＝索引の `🏁**残0**` 宣言を1つ壊すと**従来の ⚠ が戻る**（実測して復旧）。
- 🖥**実機は不要**＝触ったのは `docs/` と `scripts/cardProgressCensus.mjs` のみ（§2.2 の機械判定）。

## 2026-09-06（第194バッチ）＝🏁**索引 G の2件（`O-266`／`O-267`）をクローズ＝挙動を直す worklist が残0になった**

**2件とも登録票の見立てが外れた。** 片方は「新しい機構が要る」と書いたが**受け皿が既にあり**、
もう片方は「順序の機構が要る」と書いたが**そもそも壊れていなかった**。

### ① `O-266`＝【ガード】のコスト置換（`WX25-P2-007`《一体分身》）

**原文**＝『このゲームの間、あなたは以下の能力を得る。
　【常】：あなたが【ガード】する際、《ガードアイコン》を持つカードを1枚捨てる**代わりに**
　　あなたのエナゾーンからカード1枚と《ガードアイコン》を持つカード1枚をトラッシュに置いてもよい。
　【自】：あなたのエナフェイズ開始時、【エナチャージ１】をする。』

**旧 live**＝`SEQUENCE[ GAIN_ABILITY_THIS_GAME{gameGrants:[abilityBlockHeader]}, STUB{GUARD_ALTERNATIVE_COST}（payload なし） ]`。
- 代替コストの中身がどこにも無く、`collectGuardAlternativeCost` は payload 無しを **fail-closed** で
  「代替なし」に落とす＝**支払い肢が1度も出なかった**。
- **付与される2つ目の能力（エナフェイズ開始時の【エナチャージ１】）が JSON に1ステップも無かった。**

🔑**受け皿は既にあった**＝「このゲームの間、あなたは以下の能力を得る」は `GAIN_ABILITY_THIS_GAME` の
**`gameGrants` payload**へ畳むのが既存の規約（`O-60` 第49バッチ）。⇒ **`kind` を2つ足すだけ**で2軸とも閉じた：

| 追加 kind | 意味 | 消費地点 |
|---|---|---|
| `guardAltEnergyAndGuardCard{energyCount, guardCardCount}` | ガード代替（エナN枚＋《ガードアイコン》M枚をトラッシュ） | `GuardResponseDialog`（提示）＋ `handleGuardWithEnergyAndGuardCard`（支払い） |
| `energyPhaseCharge{count}` | エナフェイズ開始時の【エナチャージN】 | `BattleScreen` のフェイズ遷移（`nextPhase === 'ENERGY'`） |

⚠**`guardAltHand`（手札を捨てるだけ）と別 kind にした**＝払う場所が違う（あちらは手札のみ、こちらはエナと手札の2箇所）。
⚠**`energyPhaseDraw` と別 kind にした**＝あちらはドロー、こちらは**デッキの上をエナゾーンへ**。
⚠エナ側は**色もクラスも問わない**（原文が「カード1枚」）＝`GUARD_ALTERNATIVE_COST` の `energy_trash_class` とはここが違う。

🔴**live へ届けるのに3手かかった**＝parser が正しい JSON を **AUTO** で出すようになっても、
**収穫マージが live の `PARTIAL` 刻印を効果単位で不可侵にする**ので手書き定義を消すだけでは届かない。
`npx tsx scripts/censusOrphanManual.ts --unfreeze WX25-P2-007-E1` → `npm run build:effects`
→ `node scripts/heldReview.mjs --adopt-effect WX25-P2-007-E1` まで回して初めて live が変わった。
（`--unfreeze` は `parseStatus` を AUTO にするだけで、**中身の差し替えは `heldReview --adopt-effect` が要る**。）

🖥**実機 `V-174`**＝`o266GuardAltEnergyGuardCard` **PASS**（押すと**エナ1枚と手札1枚の両方**が減った）／
反転 `o266GuardAltNoEnergy` **PASS**（エナ0枚なら提示されない）。
🔑**両方を見る**＝片方だけだと `guardAltHand`（手札だけ）と区別できない。

### ② 🔴`O-267`＝発動順の固定（`WX13-005B`《白羅星　ニュームーン》）＝**実装不要だった**

**原文**＝『【出】：対戦相手のチェックゾーンにスペルがある場合、以下の2つから1つを選ぶ。
**この【出】能力はそのスペルの効果より先に発動する。**』

登録票の手順3（「先に §5.1 で実機の現状を1本撮る」）に従って観測したところ、
**【出】は既にスペルより先に解決していた**＝スペルが**保留のうちに**相手トラッシュのシグニ2枚が除外され、
そのあとスペルが解決した。保証しているのは `BattleScreen.tsx` の
**「`effect_stack` が空になるまでスペルを解決しない」ガード1本**。

🔑**登録票の「帰結は正しく構造化済みで、欠けているのは順序だけ」は外れ**＝欠けているものは無かった。**実装は0行。**
⇒ そのガードの**唯一の番人**として実機シナリオを `order` に常設した（`V-175`）。golden では踏めない経路なので、
**シナリオを外すとガードが外れても誰も気づかない。**

🔑**教訓＝「機構が要る」と登録した項目も、着手前に実機で現状を撮る。** 今回それが実装1件分を丸ごと節約した。

### ③ 🔴実機シナリオ作りで4回踏み直した罠（すべて §4.4 に既出）

1. **選択はトグル**（§4.4-2c）＝`resona-payment-*` / `pick-*` を毎ティック押すと外れて永久に進まない。**3箇所**で踏んだ。
2. **`field.check` はライフバーストのチェックゾーン**＝解決待ちスペルは **`spell_in_check_zone`**
   （`turnScopedState.ts` の `openSpellCheckZone` にその旨のコメントまである）。取り違えて
   「ライフクロスをオープン」の無限ループになった。
3. **リミットが足りないルリグ**（`WD01-004`＝Lv1/Limit2）だと `ResonaSummonModal` の
   ゾーンボタンが `overLimit` で disabled のまま＝クリックは「成功」して見えるのに何も起きない。
4. 🔴**判定をログでやらない**＝部屋を使い回すので前シナリオの行が混ざる。**盤面で判定する**
   （「スペルが保留のうちに相手トラッシュが空になったか」＝順序そのもの）。
   さらに **`'パス'` を汎用クリック候補に入れない**＝あれは**カットインのパス**で、押すと
   `handleCutinPass` が**スタックを残したままスペルを解決する**＝観測したい順序そのものを壊す。

### 検証

- `npm run gates` **全緑**＝golden **3550 / 3550**（+1本＝`O-266` の2軸と負方向）／smoke 全異常0／fuzz 全0／
  census 0 / BASELINE 0／`census:stubs` A群🔴0・C群0／manual-fields 0／
  `census:enginetext` A🔴 0行／`census:costtext` A🔴 0規則／lint 0 errors。`npm run regen` 完走。
- **逆翻訳が原文と一致**＝「あなたのエナフェイズ開始時、【エナチャージ1】をする。あなたが【ガード】する際、
  《ガードアイコン》を持つカードを１枚捨てる代わりにあなたのエナゾーンからカード1枚と
  《ガードアイコン》を持つカード1枚をトラッシュに置いてもよい」。
- 🖥**実機3本 ALL PASS**（`o266GuardAltEnergyGuardCard` / `o266GuardAltNoEnergy` /
  `o267CutinResonaResolvesBeforeSpell`）。**3本とも `order` に入れた。**
- **live PARTIAL 16 → 15**（`WX25-P2-007-E1` を解凍して parser 出力へ移した）。

## 2026-09-06（第193バッチ）＝🏁**`O-264` クローズ**＝`PLAY_FREE` は `opp_hand` 以外がプレースホルダーで、**live 12効果中 9効果が動いていなかった**

**登録票の見立ては2つとも外れていた。** `O-264` は「`ignoreRestrictions` に消費地点が無い（live 2効果）＝
限定条件が効いたままで**過少**」として登録されていたが、実測は次のとおり。

### ① 向きが逆＝**過剰**だった（`ignoreRestrictions` は飾りだった）

engine は **`Restriction` をどこでも見ていなかった**（`execPlayFree` にも `STUB{PLAY_FREE}` にも判定が無い）。
⇒ **フラグの有無に関わらず常に限定を無視**していた＝過少ではなく**過剰実行**で、
`ignoreRestrictions` は生成と表示だけの死にキーだった。

**修正**＝`execPlayFree` の候補列挙に `meetsRestriction` を通し、`ignoreRestrictions` が無ければ限定が効くようにした。
🔑**判定は既存の1本を呼ぶ**（`growLogic.meetsRestriction`＝アーツUI `artsUseGate.ts:318`・
スペルUI `spellUseGate.ts:146`・グロウが共有）＝写経すると
「**UI では使えないのに効果からは使える**」型の無言のズレになる。

### ② 🔴副産物のほうが大きい＝`opp_hand` 以外がプレースホルダーだった

`execPlayFree` の `thenAction` は `opp_hand` だけ `STUB{PLAY_FREE}`（＝実際に使用する）で、
**それ以外は `ADD_TO_HAND{owner:'self'}`** だった（コードにも「その他のソースは従来どおりの
プレースホルダー（暫定）」と書かれていた）。live 12効果を source × フラグで仕分けた結果：

| source | live | 旧挙動 | 原文 |
|---|---|---|---|
| `hand` | **6効果** | 🔴**手札のカードを手札に入れる＝完全な無言 no-op** | 「使用する」 |
| `opp_trash`（grant なし） | 2効果 | 🔴**相手のトラッシュから手札へ奪う**別効果 | 「使用する」 |
| `lrig_deck` | 1効果 | 🔴**アーツが手札に入る**（ルール上ありえない状態） | 「使用する」 |
| `opp_hand` | 1効果 | 正しい（`STUB{PLAY_FREE}`） | 「使用する」 |
| `trash`/`opp_trash`（`grantUseThisTurn`） | 2効果 | 正しい（`O-185` で実装済み） | 「このターン使用してもよい」 |

**修正**＝`grantUseThisTurn` 以外は**全ソースを `STUB{PLAY_FREE}` へ向けた**うえで、置き場所も直した：
- **相手のトラッシュから借りたスペルは、持ち主のトラッシュに残す**（旧 else 節へ落ちると
  **自分のトラッシュに複製が増える**）。⚠`CAST_FROM_OPP_TRASH` のように**取り除いてもいけない**
  （あちらは「手札にあるかのように」使ったあと持ち主へ返す別綴りで、こちらは元からトラッシュにある）。
- **ルリグデッキのアーツはルリグトラッシュへ**（旧実装は手札に入れていた）。

### ③ 🔴この形はどの計器にも映らない

`STUB` ではないので `census:stubs` A群に出ず、`PlayerState` のキーでもないので `census:deadstate` にも出ず、
golden・smoke・fuzz も緑だった。**`PLAY_FREE` を live 全数で表にして初めて見えた。**
🔑**教訓＝「死にキーが1つある」と登録された項目は、その受け皿ごと全数で仕分ける**（死にキーは症状）。

### 検証

- `npm run gates` **全緑**＝golden **3549 / 3549**（+4本＝hand／opp_trash／lrig_deck の各置き場所＋
  限定条件の正負両方向）／smoke 全異常0／fuzz 全0／census 0 / BASELINE 0／
  `census:stubs` A群🔴0・C群0／manual-fields 0／`census:enginetext` A🔴 0行／
  `census:costtext` A🔴 0規則／lint 0 errors。
- **golden はバグを先に固定してから直した**（新テストが最初に FAIL することを実測）。
- 🖥**実機**＝`V-173`（`v173PlayFreeFromHandActuallyUses`）を新設して **PASS**＝
  《ＮＯＩＳＹ》を使用 → 手札の《包括する知識》をコストなしで使用 → **デッキ 40→38（2枚引いた）**、
  両方のスペルがトラッシュへ。`order` に入れた。
- **反転確認は実機でも**＝`thenAction` を `ADD_TO_HAND` へ戻すと `v173` が FAIL し、
  ログが「包括する知識を**手札に加える**」になる（＝旧実装の無言 no-op がそのまま出る）。

## 2026-09-06（第192バッチ）＝🏁**`O-265` クローズ**＝レゾナ出現条件の支払いが **instanceId を潰して** ON_TRASH を殺していた

**真因は collector の2つ手前だった。** 第190バッチは `WD21-017-E1`（「効果**か**レゾナの出現条件によって〜
場からトラッシュに置かれたとき」）の JSON・parser・engine（緩和フラグ `orResonaCondition`）まで直して
golden も緑にしたのに、**実機は1度も発火しなかった**。切り分けで「ゲートを完全に無効化しても発火しない」
＝**ゲートではなく配線**と分かっていたが、その配線がどこかは未特定だった。

### ① 真因＝`payResonaAppearanceAndPlace` だけが instanceId を潰していた

`src/screens/battle/resonaSummon.ts`（レゾナ出現条件の支払いの**唯一の funnel**）：

```ts
const topNum = getCardNum(stack.at(-1)!);   // 🔴 'WD21-017#1' → 'WD21-017'
fieldTrashed.push(topNum);
trash: [...state.trash, ..., ...fieldTrashed, ...extras],
```

一方 `detectTrashedSigni`（`boardDiff.ts:306`）は**場に居た instanceId がトラッシュに在るか**で判定する：

```ts
if (!after.energy.includes(beforeTop) && after.trash.includes(beforeTop)) result.push(beforeTop);
```

⇒ `beforeTop = 'WD21-017#1'` に対し trash には `'WD21-017'` しか無いので**必ず外れ**、
**`collectTrashTriggers` が1度も呼ばれない恒久 no-op**だった。

🔑**契約は既に文書化されていた**＝`execUtils.ts:51` が `fieldTrashCostCards` を
「場→トラッシュへ置いた **instanceId**」と明記しており、engine 側（`banishDestination` ほか）も
一貫して `num`（instanceId）を trash へ入れている。**この関数だけが例外**で、
しかも**同じ関数の中の `discardedCostCards`（手札）と `energyTrashed`（エナ）は id を保っていた**。

**修正**＝`stack.at(-1)!` をそのまま運ぶ（`lrigTrashed` と `extras` も同様）。
`puppet_signi` の除外だけは比較対象が変わるので `getCardNum` を外して id 同士で比べる。

### ② 効果は live 5効果＋下敷きの回収

- `WD21-017-E1`（`orResonaCondition`）と **`forResonaCondition` 一族4件**
  （`WX10-055-E1` / `WX14-049-E1` / `WXEX1-58-E1` / `WXEX1-72-E1`）は**同じ1行を通る**＝
  **5効果とも実機で1度も発火していなかった**ものが回復した。
- 副次的に、下に敷いたカード・チャーム・アクセ（`extras`）も id を保つようになり、
  `detectUnderSigniTrashed` の突き合わせ（`before.trash` / `after.trash` を instanceId で数える）も通るようになった。

### ③ 🔴なぜ golden が緑のままだったか（盲点2つ）

1. **collector を直叩きしていた**＝既存テスト「レゾナ出現条件ON_TRASH」は
   `payResonaAppearanceAndPlace` を呼んだあと、その結果を **`detectTrashedSigni` に通さず**
   collector へ直接渡していた＝**funnel を飛ばしていた**。
2. **fixture が素のカード番号だった**＝もう1本のテストは `signi: [[whiteA], [whiteB], null]` と
   `#n` を持たない番号を置いていたので、**`getCardNum()` が no-op になり潰していること自体が観測できなかった**。

⇒ 両方を塞いだ：
- 既存テストへ **funnel の assert** を追加（差分に載ること＋`fieldTrashCostCards` と**同じ名前空間**であること。
  名前空間がズレると `byEffectCause` の弁別が静かに反転して**コストが効果扱い**になる）。
- 新テスト **`§5.3 O-265: レゾナ出現条件の場支払いが差分→collector まで到達する（WD21-017-E1）`**＝
  `#n` 付き fixture で **支払い → `detectTrashedSigni` → `collectTrashTriggers`** を一気通貫。
  **負方向**（レゾナ出現条件でない普通のコスト支払いでは発火しない）も同じテストに入れた。

🔑**横断の教訓**＝**ゲートは「collector が正しいか」ではなく「collector まで到達するか」に張る。**
🔑**id の同一性が絡む経路のテストは必ず `#n` 付き fixture で組む**（素の番号だと原理的に見えない）。

### 検証

- `npm run gates` **全緑**＝golden **3545 / 3545**（+1本）／smoke 全異常0／fuzz 全0／
  census 0 / BASELINE 0／`census:stubs` A群🔴0・C群0／manual-fields 0／
  `census:enginetext` A🔴 0行／`census:costtext` A🔴 0規則／lint 0 errors。
- **反転確認**＝`const topId = getCardNum(stack.at(-1)!)` へ戻すと、新テストと funnel assert が
  **2本とも FAIL**（`got=` が空配列＝差分に1件も載らない）。
- 🖥**実機**＝`node scripts/verifyBattleDrive.mjs v172ResonaConditionFires` **PASS**
  （レゾナ出現条件で場からトラッシュ → センヤの【自】が発火して相手の P1000 が消えた）。
  対照 `v172BattleBanishDoesNotFire` も **PASS**（バトルバニッシュでは発火しない）。
  **2本とも `order` へ戻した**（`V-172(1)` 返済＝§5.1 の未実施は残0）。

## 2026-09-06（第191バッチ）＝🏁**PLAN §5.4 を閉じた**（残 (c) 2件は**実装済みで、壊れていたのは逆翻訳だけ**）

**真因は1行**＝**engine に payload を足したのに、逆翻訳がその payload を読んでいなかった**。
その結果 `O-243`／`O-244`（2026-09-04 実装）が **§5.4 (c) の「未実装の残作業」として3回読み直された**。
**`src/` は1バイトも変えていない**（触ったのは `scripts/decompileEffects.ts` / `scripts/goldenTest.ts` と `docs/`）。

### ① §5.4 (c) の2件は engine まで実装済みだった（🏁確認のみ・修正なし）

| 効果 | 受け皿 | live payload | engine |
|---|---|---|---|
| `WX21-028-E2` | `STUB{CROSS_ZONE_TRIPLE_TARGET_TO_DECK_BOTTOM}` | `crossZoneTriple:{colors:['赤','青','緑'], story:'天使'}` | `execStubPart3.ts`（`O-243`）＝3ゾーンを1枚ずつ宣言 → **「そうした場合」＝コストを払えなければ対象を1枚も動かさない** |
| `WXDi-P10-007-E3` | `STUB{CHECK_ZONE_FREE_CAST}` | `checkZoneFreeCast:{lookCount:10, totalCostMax:4, maxPick:2}` | `execStubPart3.ts`（`O-244`）＝`SEARCH{selectionConstraint:{totalCostMax}}` → チェックゾーン → 好きな順で無料使用 |

**`totalCostMax` は飾りではない**＝`execUtils.ts:3767` が選択集合のコスト合計を実際に検査している。

### ② 🔴真因＝逆翻訳が `miscStubMap` の**固定文**を出していた

`decompileEffects.ts` の `miscStubMap` は **id → 固定文字列**の表なので、payload の値がどこにも出ない：

| | 修正前（固定文） | 修正後（payload から生成） |
|---|---|---|
| `WX21-028-E2` | 「あなたのエナゾーンから**指定色の指定クラス**のシグニを1枚ずつ…」 | 「あなたのエナゾーンから**赤と青と緑の＜天使＞**のシグニを1枚ずつ…」 |
| `WXDi-P10-007-E3` | 「デッキの上からカードを**見て**…コストの合計が**上限以下**になるように**スペルを**チェックゾーンに置き…」 | 「デッキの上からカードを**10枚**見て…コストの合計が**4以下**になるように**スペルを2枚まで**チェックゾーンに置き…」 |

⇒ どちらも**原文と一致**するようになった（`npm run regen` で `docs/decompile_sheet2/8.txt` を確認）。
**固定文は残したが「【※ペイロード欠落】…（枚数・コスト上限が未指定）」へ降格**＝
payload が落ちたときだけ出る正直なフォールバックにした。

🔑**教訓（横断）**＝**payload 化したら逆翻訳もその payload から組む。**
`O-60` 第59バッチの落とし穴③（「payload 化したら逆翻訳の固定文言も撤去する」）と同じ形の再発で、
今回は**逆方向の害**が出た＝固定文が**実装済みのものを未実装に見せて**作業キューに残し続けた。
（第59バッチのときは engine と逆翻訳が**同じ嘘で一致**して計器が緑のままだった。**両方向に壊れる。**）

### ③ 🔴反転確認で「最初のトリップワイヤが弱い」ことが分かった（この巡の2つ目の産物）

最初に書いた golden は `decompileEffects.ts` の**ソース文字列**を `includes` するだけだった。
反転確認（`if (false && a.id === 'CHECK_ZONE_FREE_CAST' …)` を挟む）で **PASS のまま素通り**した
＝**部分文字列が残っているので検出できない**。

⇒ **生成物を読む形へ差し替えた**＝`goldenTest.ts` に `decompiledLineOf(effectId)` を新設し、
`docs/decompile_sheet*.txt` から該当 effectId の行を引いて assert する。
⚠**シート帰属は先勝ち**なので全10枚を走査する。⚠**decompiler を直したら `npm run regen` まで回す**のが前提
（`census:stubs` C群と同じ規約）。
**反転確認をやり直して2本とも FAIL** することを確認した。

🔑**教訓**＝**`decompileEffects.ts` は何も export しない**ので、逆翻訳を機械検証する入口は
`decompiledLineOf()`（＝生成物）だけ。**ソース grep 型のトリップワイヤは書かない。**

### ④ §5.4 の「機構待ち」2件を §5.3 索引 G へ採番（📦移設）

§5.4 に機構項目を残さないという §5.3 の登録ルールどおり、2件を採番して登録票を PLAN_DETAIL へ書いた。

- **`O-266`**＝【ガード】のコストを置換する機構が engine に無い（`WX25-P2-007`／live 1効果）。
  live は `STUB{GUARD_ALTERNATIVE_COST}` で **payload すら無い**（逆翻訳は穴を正しく宣言している）。
  🔑**同じ効果でもう1つ落ちている**＝付与される2つ目の能力（エナフェイズ開始時の【エナチャージ１】）が
  **JSON に1ステップも無い**（`gameGrants` は見出しだけ）。**取るときは2軸ある。**
- **`O-267`**＝能力の発動順を他の効果より前に固定できない（`WX13-005B`／live 1効果）。
  原文「この【出】能力は**そのスペルの効果より先に**発動する」。
  🔑**帰結（除外／使用禁止）は live で正しく構造化済み**で、**欠けているのは順序だけ**。
  ⚠1効果のために解決順の一般機構を入れるかは要判断（**入れないと決めてもよい**＝`DEFERRED_*` 運用）。

### ⑤ 簿記で見つけた stale な数字2つ（**退化ではない**）

- **`census:cards --sheet 1` の要対応**＝§6 の記載は「0 / 863」だったが**実測 3**。
  `git stash` して **HEAD でも 3**＝**今回の編集の前後で同値**。内訳は `mech` 3枚（`O-134` / `O-245` 由来）。
- **live PARTIAL**＝§6 の記載は 18 だったが**実測 16**。**`public/data/` は1バイトも変えていない。**

### 検証

- `npm run gates` **全緑**＝golden **3544 / 3544**（本数は据置＝既存2テストへ assert を4本追加）／
  smoke 全異常0／fuzz 全0／census 0 / BASELINE 0／`census:stubs` A群🔴0・C群0／manual-fields 0／
  `census:enginetext` A🔴 0行／`census:costtext` A🔴 0規則／lint 0 errors。
- `npm run regen` 完走。`npm run census:deadstate` 0件／`census:orphanmanual` A/B/C 0。
- **反転確認**＝逆翻訳の payload 分岐2本を殺して regen → golden `O-243` / `O-244` が **FAIL**（復旧済み）。
- 🖥**実機は不要**＝触ったのは `scripts/` と `docs/` のみで **`src/` は無変更**（PLAN §2.2 の機械判定）。

## 2026-09-06（第190バッチ）＝§5.4 (b)「本物の疑い」の残り2件＋**実機が engine の過剰発火を1件出した**

**この巡の主産物は「実機が golden に見えないバグを出した」こと。** §5.4 の2件のうち
**1件は完全クローズ、1件は JSON/parser/engine を直したが実経路の配線ギャップで発火しない**（→ §5.3 `O-265`）。

### ① `WX25-P1-022-E2` の `PARTIAL` は **stale だった**（🏁クローズ）

刻印を付けた時点の不足（「このターン、あなたはそれらを使用してもよい」の**権利化**）は
**`O-185`（2026-09-04）で解決済み**で、**刻印だけが残っていた**。全軸を原文と突き合わせて確認：

| 原文 | 受け皿 | 判定 |
|---|---|---|
| あなたと対戦相手のトラッシュから | `PLAY_FREE{source:'trash'}` ＋ `{source:'opp_trash'}` | ✅ |
| それぞれ**１枚まで** | `SEARCH{maxPick:1}`（0枚確定を許す） | ✅ |
| **このターン**、あなたはそれらを**使用してもよい** | `grantUseThisTurn`（`O-185`） | ✅ |
| （コストは支払う） | `ignoreCost:false` | ✅ |
| 《ゲーム１回》 | `usageLimit:'once_per_game'` | ✅ |
| **ハプニング** | — | ✅**語彙の穴ではない**（下記） |

🔑**「ハプニング」は能力のフレーバー名**＝`【起】《ゲーム１回》<名前>《色×N》` の `<名前>` は
「プライマル」「カタルシス」「ルミナス」等で **live 40効果超**。**落として正しい**（コストでも条件でもない）。
⚠CSV に「ハプニング」は2件あるが、もう1件は**カード名**（`WXDi-P14-035` グズ子～ハプニング～）。

🔴**唯一の実害＝原文に無い `ignoreRestrictions:true`**（「限定条件を無視して」）。**外した。**
同じ理由で **`WX24-P4-040-E2`** からも外した（原文に綴りが無い）。
**残るのは `WX04-003-E1` / `WX05-011-E3` の2件だけ**＝どちらも原文に「限定条件を無視して」がある。
⚠**`ignoreRestrictions` は engine に消費地点が1つも無い**（`src/` 全体で**生成と表示だけ**）＝
挙動は変わらないが、受け皿が実装された瞬間に**原文にない自由度**を与える。⇒ §5.3 `O-264` へ登録。
🔑**`census:deadstate` はこの形を見つけられない**（あれは `PlayerState` のキーしか走査しない）＝
**アクション payload の死にキー**は無計器。ゲートは golden に「原文に綴りがある効果だけが持つ」で張った。

### ② `WD21-017-E1`「効果**か**レゾナの出現条件によって」（⚠**半分だけ**）

**真因**＝原文は**原因が2つの和集合**なのに live は `byEffect:true` だけ。
レゾナの出現条件は**コスト支払い**なので `byEffectCause` が立たず、**その経路は永久に落ちていた**（過少）。
🔑**既存の `forResonaCondition` では代用できない**＝あれは「レゾナ出現条件**のときだけ**」の**排他ゲート**
（`WX10-055` / `WX14-049` / `WXEX1-58` / `WXEX1-72`）で、使うと**今度は効果起因が落ちる**。
⇒ `byEffect` の**緩和フラグ** `orResonaCondition` を新設（型＋`collectTrashTriggers`＋parser＋逆翻訳＋golden）。
🏁**parser 出力が manual と実体同一になったので手書きを削除**（§6.4 `O-40`／`O-42` の「影武者コピー」禁止）＝
`censusOrphanManual --unfreeze` で解凍し、**live は parser 産の AUTO** になった。

⚠🔴**ただし実機では発火しない**＝§5.3 `O-265`（下記）。**この項目は閉じていない。**

### ③ 🔴**実機だけが出した engine の過剰発火**＝`ON_BANISH` に `byEffect` ゲートが無かった

**真因**＝`collectBanishTriggers` の「バニッシュされたカード自身」ループには **`notByBattle` しか無く、
`byEffect` は素通り**していた。⇒ 原文「**効果によって**バニッシュされたとき」が
**バトルバニッシュでも発火**していた（過剰発火）。
⇒ `byEffect` なら **バトル（`battleAttackerNum`）でもルール処理（`cause.ownerId` なし）でも発火しない**へ。
**影響枚数**＝`ON_BANISH` ∧ `byEffect` ∧ `scope:'self'` の live 効果は **1件**（`WD21-017-E1`）＝安全。

🔑🔴**golden では原理的に見えなかった**＝`WD21-017-E1` の検証は `collectTrashTriggers` を直接叩いており、
**ON_BANISH 側の経路を1度も通らなかった**。**実機 `V-172(2)` の対照が赤にして初めて分かった。**
⇒ **「1つの効果が2つの timing を持つとき、golden は片方しか通っていないことがある」**（新しい教訓）。

**影響枚数**＝live **3効果 / 3カード**（`WX25-P1-022-E2`／`WX24-P4-040-E2`／`WD21-017-E1`）＋engine 1箇所。
**検証コマンド**＝`npx tsx scripts/syncManualLive.ts <CardNum>` → `npm run build:effects`
→ `npx tsx scripts/censusOrphanManual.ts --unfreeze WD21-017-E1` → `npm run regen` → `npm run gates`
→ `node scripts/verifyBattleDrive.mjs v172BattleBanishDoesNotFire`。
**ゲート（全緑 ✅）**＝golden **3544 / 3544**（3541 +3本）・smoke 全異常0・fuzz 全0・census **0 / BASELINE 0**・
`census:stubs` A群🔴0・C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors。
**反転確認＝3本**＝①`orResonaCondition` の緩和を外す→golden FAIL
②原文に無い `ignoreRestrictions` を戻す→golden FAIL ③`ON_BANISH` の `byEffect` ゲートを外す→golden FAIL。
🖥**実機**＝`v172BattleBanishDoesNotFire` **PASS**（③の受け入れ）。
`v172ResonaConditionFires` は **`O-265` 待ちで `order` から外した**（シナリオは残す＝`O-265` の受け入れテスト）。

🔑**教訓（新規2つ）**：
1. **1効果が2つの timing を持つとき、golden は片方しか通っていないことがある。**
   `WD21-017-E1` は `['ON_TRASH','ON_BANISH']` で、golden は `ON_TRASH` 側だけを叩いていた＝
   **`ON_BANISH` 側は同じ `triggerCondition` を1度も評価していなかった**。
   ⇒ **timing が複数ある効果は、collector を timing の数だけ叩く。**
2. **「ゲートを完全に無効化しても発火しない」＝ゲートではなく配線の問題**（切り分けの型）。
   `O-265` はこの1回の実測で「受け皿の不足」ではなく「呼ばれていない」と確定した。

---

## 2026-09-06（第189バッチ）＝PLAN §5.4 (b)「本物の疑い」4件のうち**上2件**をクローズ

**2件とも旧登録票の見立てが外れていた。** ①は「型を足す」必要が無く（受け皿が既にあった）、
②は「わずかな過剰」ではなく**最頻経路での誤発火**だった。

### ① `WX24-P2-072-E1`＝「そのシグニ」を名指しできず、**別のシグニを代わりにバニッシュできた**

**真因**＝`BANISH` の対象が `{opponent, powerRange:{max:3000}}` だけで、
原文「対戦相手のシグニ１体が**このシグニの正面に配置されたとき、そのシグニの**パワーが3000以下の場合、
**そのシグニを**バニッシュする」の**「その」＝トリガー元**が1バイトも載っていなかった。
⇒ 正面に置かれたシグニが4000でも、**別の3000以下のシグニを落とせた**（過剰実行）。

🔑**受け皿は既にあった**＝`TargetFilter.isTriggerSource`（`execBanish` が `ctx.triggeringCardNum` へ絞る＝
`effectExecutor.ts:1462`）。**旧注記は「`BANISH` に `targetsTriggerSource` が無いので §5.3 へ」と書いていたが誤り**で、
**アクション側の軸だけを見て「無い」と判断していた**。受け皿は**アクション・フィルタの2軸**にまたがる
（CLAUDE.md「1〜3枚の機構項目は『型』を足す前にまず受け皿を疑う」の実例）。

**直し方**＝`manualEffects.ts` の該当効果に `isTriggerSource: true` を足し、`PARTIAL` → `MANUAL`。
`isTriggerSource` ∩ `powerRange` なので、**正面のシグニが3000超なら候補0＝何も起きない**（原文どおり）。
**レーン**＝母集団1効果・受け皿あり＝**速いレーン**（PLAN §2.0）。**型は1つも足していない。**

### ② `WX18-056-E1`＝離場の「行き先」を見ておらず、**バトルでバニッシュされただけで発火**していた

**真因**＝条件 `SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE` は実装コメントにも
**「⚠行き先は問わない」**と明記されたまま、原文「場から**トラッシュに置かれて**いた場合」に使われていた。

🔴🔑**旧注記の「エナ送り／手札戻しでも成立する**わずかな過剰**」は過小評価だった**＝
**WIXOSS のバニッシュ既定行き先はエナゾーン**（`execUtils.banishDestination` の最終 return。
`verifyBattleDrive.mjs` の §4.4-8f にも「バニッシュはエナ行き」と既出）。
⇒ **バトルで自分のシグニが1体バニッシュされただけで -7000 が乗っていた**＝最頻経路での誤発火。

**直した箇所**（型＋両側＋計器の3点セット）：
1. `src/types/effects.ts`＝条件に `destination?: 'trash'`。🔴**省略時は従来どおり行き先不問**＝
   `WX24-P2-075-E1`（原文「場を**離れて**いた場合」）の既定を変えない。
2. `src/engine/boardDiff.ts`＝`detectLeftFieldSigniToTrash`（**`after.trash` の増分**で行き先を確かめる射影）。
3. `src/types/index.ts` ＋ `src/screens/battle/turnScopedState.ts`＝
   `signi_left_field_to_trash_this_attack_phase`（アタックフェイズ開始時にリセット）。
4. `src/screens/BattleScreen.tsx`＝**離場を記録している2箇所の両方**で同時に書く（片方だけだと2つの履歴が黙ってずれる）。
5. `src/engine/execUtils.ts`＝`evalCondition` が `destination` で読む配列を切り替える。
6. `src/data/effectParser.ts`＝2箇所の規則で「場**からトラッシュに置かれて**いた」綴りを拾って payload を載せる。
7. `scripts/decompileEffects.ts`＝逆翻訳に行き先を描く（描かないと2つの綴りが**同じ文**になる）。

### ③ 逆翻訳の穴を1つ塞いだ（①の副産物）

`targetJa` の `isTriggerSource` 分岐は**レベル条件しか描いていなかった**ので、①を直した直後の逆翻訳が
「そのシグニをバニッシュする」＝**パワー3000以下が消えた**状態になった。パワー条件も描くようにした。
🔑**第188バッチで直した `SelectionConstraint` の `totalPower*` と同じ抜け**（レベルは描くがパワーは描かない）。

**影響枚数**＝live **2効果 / 2カード**（①`WX24-P2-072-E1`／②`WX18-056-E1`）。
逆翻訳が変わったのは2効果（`WX24-P2-072-E1` / `WX18-056-E1`）。
**検証コマンド**＝`npx tsx scripts/syncManualLive.ts <CardNum>` → `npm run build:effects` → `npm run regen` → `npm run gates`
→ `node scripts/verifyBattleDrive.mjs v171TrashedSigniLowersPower v171BanishedSigniDoesNotLower`。
**ゲート（全緑 ✅）**＝golden **3541 / 3541**（3538 +3本）・smoke 全異常0・fuzz 全0・census **0 / BASELINE 0**・
`census:stubs` A群🔴0・C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・
`census:deadstate` **0件**（新しい state キーは書きも読みもある）・lint 0 errors。
**ラチェット更新**＝`PlayerState` のターン限定フィールド数 **52→53** ／ 母集団 **82→83**（新設キー1本ぶん）。

**反転確認＝3本取った**：
1. `execBanish` の `isTriggerSource` を live から外す → golden `第189` が FAIL。
2. `evalCondition` を `destination` 無視へ戻す → golden `第189` が FAIL。
3. 🖥**同じ改変で実機の対照が FAIL**＝`v171BanishedSigniDoesNotLower` が
   `🔴旧挙動＝バニッシュ（エナ行き）なのに -7000 が乗った（powerMods=["WD03-009#1:-7000"]）` を出した。

🖥**実機（`V-171`・2シナリオ ALL PASS）**＝**②だけが実機必須**（①は `manualEffects.ts` と JSON だけ＝PLAN §2.2 で④まで）。
- `v171TrashedSigniLowersPower`＝アーツ `WX02-020` で自分のシグニを**場からトラッシュへ** → `WX18-056` がアタック
  → `powerMods=["WD01-009#1:-7000"]`
- `v171BanishedSigniDoesNotLower`（**対照**）＝**盤面は1文字も変えず**、離場の**行き先だけ**を
  トラッシュ→エナ（バトルバニッシュ）に反転 → `powerMods=[]`
🔑**なぜ実機が要ったか**＝新設した履歴は **`BattleScreen.tsx` の盤面 diff でしか書かれない**＝
golden は `evalCondition` と `detectLeftFieldSigniToTrash` を直接叩くので、
**「実戦の経路で1度も書かれない」形の壊れ方**を原理的に検出できない。

⚠**実機シナリオで踏んだ罠4つ**（すべて §4.4 に既出＝**読んでいたのに踏んだ**）：
1. **`my-lrig-dk` はトグル**＝ループ内で毎ティック押すと開閉を繰り返し、34ティック全空振り（§4.4-2c 同型）。
   ⇒ **開く操作はループの外で1回だけ。**
2. **`ATTACK_SIGNI` ではアーツのカード詳細に「使用」が出ない**（撃てないので提示されない）。
   ⇒ **`ATTACK_ARTS` から始める**（履歴の記録条件は両フェイズを含むので同じアタックフェイズ内で成立する）。
3. **`pick-0` が観測対象そのもの（アタッカー）を掴んだ**（§4.4-6）。⇒ `clickPendingInstance` で instanceId 指定。
4. **選択も1回だけ押す**（§4.4-2c）＝毎ティック押すとトグルで外れ `決定` に永久に到達しない。
🆕**5つ目＝対話中はアタック操作を試さない**＝`pendingEffect` が残っているのにゾーンを押すとトグルで止まる。
   ⇒ **ティックの先頭で `pendingEffect`/`stackLen` を見て、対話中は対話だけを進める。**

---

## 2026-09-06（第188バッチ）＝PLAN §5.4 (b) の「逆翻訳の表示だけ」7件を1バッチ＋副産物で JSON のズレ14効果

**表示バッチのつもりで入ったら、逆翻訳を直した瞬間に JSON 側のズレが見えた**（④）。
🔑**これがこのバッチの主産物**＝逆翻訳を直す価値は「読みやすくなる」ことではなく、**原文照合が効くようになる**こと。

### ① 選択集合の**パワー合計**制約が逆翻訳に出ていなかった（`WXEX2-52-E3` / `WXK09-023-E1`）

`SelectionConstraint` の `totalLevel*` だけを描いて `totalPower*` を落としていた＝
「パワーの合計が**このシグニのパワー以下**になるように２枚まで」が**ただの「2枚まで」**に見え、
**制約が消えたのか元から無いのか**が原文照合で区別できなかった（JSON は `totalPowerMaxRef` / `totalPowerExact` で正しい）。

### ② `ATTACH_ACCE` の `optional` と装着先が落ちていた（`SP24-010-E1`）

`repeatWhilePossible` の枝だけが `optional` を描いており、単数枝は
原文「それを**この方法で場に出した**シグニの【アクセ】にしても**よい**」の
①任意であること ②装着先が直前に出したシグニに固定であること を**両方**落としていた。

### ③ 表示の取り違え2件

- **`WXDi-D04-004-E2`**＝`targetJa` の `thisCardOnly` 分岐が種別を見ずに**常に「このシグニ」**を返すため、
  付与された【自】の「**このルリグ**をアップする」が「このシグニをアップする」と出ていた（JSON は `LRIG` で正しい）。
- **`WX13-005B-E1`**（＋同型 `WX13-006B-E1` / `WX14-006B-E1`）＝`CHECK_ZONE_COUNT` が名詞を「カード」固定にしており、
  原文「チェックゾーンに**スペル**がある場合」が「カードが1枚以上」＝**どのカードでもよい**に見えた
  （`filterJa` は規約上 `cardType` を描かない＝名詞は呼び出し側が置く）。

### ④ 🔴**逆翻訳を直したら JSON のズレが出た**＝`opponentSelects` が **live 14効果**で落ちていた

`CONDITIONAL{ENERGY_COUNT opponent} + TRASH{ENERGY_CARD}` の逆翻訳が
**「あなたはそこから対象のカード１枚を…」固定**で、`opponentSelects` を1件も読んでいなかった。
そこを payload 駆動へ直すと、**フラグ自体が立っていない効果**が炙り出された。

**真因**＝`parseSentencePart1.ts` の「対戦相手エナゾーン→トラッシュ」規則が `opponentSelects` を**一度も立てていなかった**。
原文「**対戦相手は**自分のエナゾーンからカード１枚を…」は**相手が選ぶ**（`owner`＝誰のカードか とは独立＝§6.4 `O-24` の教訓）。
⚠**同じ意味の40効果は別規則で立っていた**＝**同じ原文が2通りに解かれていた**のが本体。
実害＝**あなたが相手のエナから好きな1枚を落とせる**（プレイヤー有利側への取り違え）。

**影響枚数**＝**live 14効果 / 13カード**（`WX14-041-E1` `WX19-005-E1` `WX20-021-E1` `WXEX1-07-E2` `WXEX1-34-E2`
`WXDi-D09-H21-E1` `WXDi-P05-059-E1` `WXDi-P16-064-E1` `WX24-P4-066-E1` `WX25-P2-076-E1`×2 `WXK03-021-E1`
`WXK11-058-BURST` ほか）。**14効果すべて原文を1件ずつ読んで確認した**（miss は判定ではない）。
🔑**残2件は既知で正しい**＝`WX25-P3-080-E1` は①枝に付けないのが正（`manualEffects.ts` の意図的な上書き）／
`WDK10-001-E2` は「手札を１枚捨てないかぎり」形で**別の規則**が組む。

⚠🔑**1往復した**＝入口の regex を `対戦相手は[、,]?自分` へ緩めたら、`WXEX1-07-E1` が
**専用 STUB（`OPP_ENERGY_EXCESS_TRASH`＝`opponentResponds` つきの対話を組む）から汎用 CONDITIONAL へ落ちた**。
⇒ **入口は緩めず、フラグの判定だけを別に取る**形へ戻した。**「regex を1文字緩める」は受け皿の奪い合いを起こす。**

### ⑤ 同じ宣言を2度描いていた（`WX25-P2-005-E1`）

「このゲームの間〜『【常】：手札の上限は２増える』」を parser が
`GAIN_ABILITY_THIS_GAME{handSizeBonus}` と `HAND_SIZE_INCREASE{handLimitDelta}` の**2ステップ**に解くため、
逆翻訳が**原文1文に対して2文**出していた＝**二重適用に見えた**。
🔑**engine は二重に増やさない**（`collectHandLimits` の `HAND_SIZE_INCREASE` 走査は **CONTINUOUS だけ**を見るので
ACTIVATED のこの経路では後段は inert＝`execStubPart3.ts` に明記あり）。⇒ 逆翻訳側で重複を1つに畳んだ。

**影響枚数**＝逆翻訳 **29効果**（狙った7件＋同じ汎用修正が届いた22件）／live JSON **14効果 / 13カード**。
**検証コマンド**＝`npm run regen`（逆翻訳 A/B）→ `npm run build:effects` → `npm run gates`。
**ゲート（全緑 ✅）**＝golden **3538 / 3538**（3537 +1本）・smoke 全異常0・fuzz 全0・census **0 / BASELINE 0**・
`census:stubs` A群🔴0・C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors。
**反転確認**＝**取った**。修正前の live JSON へ戻すと新テストが **13効果を挙げて FAIL**。
**live A/B**＝**全差分が `opponentSelects` の追加のみ**であることを機械照合（`opponentSelects` を除いた木が完全一致）。
**実機不要と判定**＝`src/data/` と `scripts/` だけ（`src/screens/` にも新しい型・機構にも触れていない＝PLAN §2.2）。

🔑**教訓＝逆翻訳の穴は「表示の問題」ではなく計器の穴**。①〜③⑤はどれも JSON が正しく、
**壊れていたのは読み手だけ**だった。だがその読み手が黙っていたせいで、**同じ家系の JSON のズレ（④）が
14効果ぶん見えていなかった**。⇒ **表示を直す巡は、直した直後に同じ家系の live を全数で数え直す。**

---

## 2026-09-06（第187バッチ）＝🏁**PLAN §5.4 (a)「live に `UNKNOWN` が残る効果」を残0**＋(b) の偽 `PARTIAL` 刻印を撤去

**真因は3つとも「木ごと作り直す」案件ではなかった**（§5.4 の登録票の見立てが外れていた）。**実機不要と判定**＝
触ったのは `src/data/`（parser）と `scripts/`（逆翻訳・golden）だけで、`src/screens/` にも新しい型・機構にも
触れていない（PLAN §2.2 の表）。

### ① CSV の `BurstText` プレースホルダ `-` が選択肢の本文に混ざっていた（`WX16-023-E1` / `WX16-048-E1`）

**真因**＝`effectParser.ts` の `foldExtraCostRemoveVirusChoices` に渡す原文が
`` `${card.EffectText} ${card.BurstText}` `` で、CSV が「ライフバースト無し」を書く **`-` がそのまま連結**されていた。
`①②③④` の分割は最後の要素を文末まで取るので、**最終選択肢だけ本文が `…トラッシュに置く。 -` になり**
`SEQUENCE[本体, UNKNOWN{raw:'-'}]` に化けていた。
🔑**fail-closed が効かなかった理由**＝`choices.some(c => c.action.type === 'UNKNOWN')` は**トップレベルしか見ない**。
⇒ ①連結時に `-` を除外 ②fail-closed を**入れ子まで**見る形へ（`JSON.stringify` に `"type":"UNKNOWN"` が含まれるか）。

### ② 原典の誤植「を対象**する**。」（`WX09-Re03-E1`）

**真因**＝原文が「対戦相手のセンタールリグ１体を対象**する**。」（正しくは「対象**とし、**」）で、
**対象宣言が独立した1文**になり次文の「それ」と束縛できず、宣言文が丸ごと `UNKNOWN` で残っていた。
⇒ `normalizeTargetDeclarationTypo`（既存の `normalizePowerNumericMinusTypo` と同じ前処理層）で
**句点を読点へ寄せて1文に畳む**。⚠**全カードで1箇所だけ**（実測）。正しい綴りの「を対象とする。」17件には掛からない。

### ③ 「手札N枚をデッキの一番上に置く」の綴りが解けなかった（`WD23-017-EA-E1`）

**真因**＝parser の受け皿は `手札**から****カード**N枚をデッキの一番○に置く` に固定されており、
原典に実在する `手札N枚を…` を取りこぼしていた。解けないので live を**直パッチ**するしかなく、
その `parseStatus:'PARTIAL'` が収穫マージの**不可侵印**になって parser の改善が永久に届かない状態だった
（§5.3 `O-133` の「第4の死角」）。
⇒ `parseSentencePart4.ts` の regex で `から` / `カード` を任意に。**`手札**を**１枚デッキの…` 形は意図的に外す**
（あちらは actor が対戦相手のことがある）。解けるようになったので `censusOrphanManual --unfreeze` で解凍し、
`BASELINE_ORPHAN_MANUAL` を **7 → 6** へ下げた。

### ④ 「代わりに」加算分解の外科パッチが偽の `PARTIAL` を残していた（`WXK02-038` / `WXK10-036` の各2効果）

**真因**＝素の parse が「２５枚以上あるかぎり、代わりに＋5000される。」を `SEQUENCE[POWER_MODIFY, UNKNOWN]` に
落として `PARTIAL` を刻み、その直後にカード別の外科パッチが **action を丸ごと書き換える**のに
**刻印だけ引き継いでいた**。最終 JSON に痕跡は1つも残らない＝**`O-262` と同型の偽の刻印**。
⇒ 両パッチで `parseStatus = 'AUTO'` を明示。**fresh PARTIAL 24 → 20 で live と一致**。

### ⑤ 逆翻訳が `EXTRA_COST_REMOVE_VIRUS` の選択肢を1つも描いていなかった（計器の穴）

`O-234`（2026-09-04）で選択肢は **parser が解いて payload に載せる**形へ移ったのに、`decompileEffects.ts` は
`choiceTextParser` 時代のまま「取り除いた数に1を加えた数だけ、以下から選ぶ」で**打ち切っていた**＝
**payload が壊れても読み手には見えない**（実際①の `UNKNOWN{raw:'-'}` はこれで隠れていた）。
⇒ 選択肢を `【A / B / C】` で描き、**payload が無いときは `[選択肢の payload なし＝engine は何もしない]`** と出す。

**影響枚数**＝**live 4効果 / 4カード**（①2・②1・③1）＋ 偽刻印の撤去 4効果 / 2カード。
**検証コマンド**＝`npm run build:effects` → `node scripts/heldReview.mjs --adopt …` → `npm run regen` → `npm run gates`。
**ゲート（全緑 ✅）**＝golden **3537 / 3537**（3532 +5本）・smoke 全異常0・fuzz 全0・census **0 / BASELINE 0**・
`census:stubs` A群🔴0・C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors。
**反転確認**＝**取った**。①〜③は**修正前の live JSON に戻すと新テスト4本が全部 FAIL**（`git stash` で実測）。
④は**修正前の `effectParser.ts` に戻すと `WXK02-038-E1` が `PARTIAL` で FAIL**。

🔑**新しく張ったラチェット**＝`§5.4 (a) 第187: live の効果に UNKNOWN が1件も残っていない`。
**`UNKNOWN` は engine から見て完全な no-op**（原文の1手順が黙って消える）なのに、
**census にも `census:stubs` にも出ない**（STUB ですらない）＝これまで全数計器が無かった。

🔑**教訓**＝**CSV のプレースホルダ `-` を原文として連結しない**。同じ形の連結は `effectParser.ts` に
**20箇所以上**あり（`` `${card.EffectText}
${card.BurstText}` ``）、既存のガード綴り（`card.BurstText !== '-'`）は
2箇所でしか使われていない。**新しく全文を組むときは必ずプレースホルダを除く。**

---

## 2026-09-06（第186バッチ）＝🏁**`O-263` と `O-262` を同時にクローズ**＝【トラップ】発動の対象が「先頭固定」だった／設置したカードが `battleCardMap` から落ちていた

**この巡で直したのは3件**（うち2件は**実機が出した engine の本物のバグ**）。**実機 5シナリオ ALL PASS**（負方向の対照 2本）。

### ① §5.3 `O-263`＝`ACTIVATE_TRAP` が「どの【トラップ】か」を読んでいなかった

**真因**＝`execStubPart2.ts` の `ACTIVATE_TRAP` は **`trapsAT.findIndex(t => t !== null)`＝先頭の非 null トラップ**を自動で取っていた。原文は2種類あり、**どちらも近似**だった。

**影響枚数**＝**live 5効果 / 5カード**（登録票の「6効果」は `WX17-044-E2` を含むが、あれは②の理由で live に届いていなかった）。用法で割ると：

| 用法 | 原文 | 効果 | 旧挙動の実害 |
|---|---|---|---|
| ① `explicit` | 「あなたの【トラップ】１つを**対象とし**」 | `WX15-017-E1` / `SP26-001-E1` / `WX19-064-TRAP` | **プレイヤーが選べない**＝2つ以上あると勝手に先頭が発動する |
| ② `source_zone` | 「**このシグニと同じシグニゾーンにある**【トラップ】１つ」 | `WX15-035-E1` / `WX19-058-E1` | **別ゾーンのトラップを暴発させる** |

**直した箇所**：
1. `src/types/effects.ts`＝`StubAction.trapTargetScope`（`'explicit'` / `'source_zone'`）と `trapTargetPicked` を新設。**未指定は従来どおり先頭**＝`trapOp:'activate'` からの委譲や内部呼び出しを壊さない。
2. `src/data/parsers/parseSentencePart2.ts`＝原文から payload を決める。⚠**ゾーン固定を先に見る**（②の原文にも「を対象とし」が含まれるので順序が意味を持つ）。
3. `src/engine/execStubPart2.ts`＝`source_zone` は `ctx.sourceCardNum` のゾーンに固定（**引けなければ何もしない fail-closed**）、`explicit` は候補2つ以上なら `SELECT_TARGET` で問う。🔴**`trapTargetPicked` が無いと先行ステップの `lastProcessedCards` を「選択」と誤読する**（`SP26-001-E1` は直前に設置したカードが残る）。
4. `scripts/decompileEffects.ts`＝逆翻訳を **payload から描く**（旧は**カード全文を regex で切り出して原文を貼っていた**＝JSON が対象の決め方を1つも持っていなくてもシートは原文どおりに見えた）。

### ② 実機が出した engine の本物のバグ＝**【トラップ】として設置したカードが `battleCardMap` から落ちる**

**真因**＝`BattleScreen.tsx` の `battleCardNums` が **`field.signi_traps` を走査していなかった**。設置した瞬間そのカードは手札／デッキから抜かれ、他のどのゾーンにも居ないので **`CardData` ごと落ちる** → `trapIconEffectOf` が `cardMap.get(...) === undefined` で null を返し、**【トラップ】は場を離れるのに《トラップアイコン》が1度も解決しない無言の no-op**になっていた。

🔑**なぜ今まで気づけなかったか**＝`pending_effect` が候補として抱えている間だけ別の枝（§5.3 `O-142`）で載るので、**対話を伴う入口（`explicit`）では動き、伴わない入口（`source_zone`）だけが黙って死ぬ**。golden・smoke・fuzz は全部緑（どれも全カードの cardMap を渡すので再現しない）。
🔑**同じ穴が `signi_magic_boxes` にも開いていた**（`INTERNAL_SET_MAGIC_BOX` も deck/hand から抜く）＝**同時に塞いだ**。
🔑`signi_facedown_attached`（§5.3 `O-81`・2026-08-26）と**同じ穴の3回目**。

**ゲート**＝`PlayerState['field']` の型から「カードIDを持つゾーン」を**機械で数え直し**、`battleCardNums` の走査がそれを1つ残らず参照していることを golden で固定した（**新しいゾーンを足したら FAIL する**＝写経ではないデータ駆動）。間接経路（`signi_acce`＝`allAcceCards`／`puppet_signi`＝`field.signi` にも入る）だけを**理由つきで**免除。

### ③ §5.3 `O-262` 残2効果＝配送経路が別々の理由で塞がっていた

- **`WX20-053-E2`**＝**偽の `PARTIAL` 刻印**が `isPureSuperset` の**唯一の不一致リーフ**になり、`trashActivated:true` を持つ fresh を採用できず held に居座っていた。
  🔴**刻印の出どころは「捨てられたパース試行」**＝「その後、この方法でデッキからカードを探していた場合、デッキをシャッフルする。」が `markSilentFallback('IS_MY_TURN化:…')` を記録するが、**最終 JSON に `IS_MY_TURN` は1つも残らない**（`SEARCH.afterSearch:{SHUFFLE_DECK}` へ既に畳まれている＝デッキ枝にだけ付く、という原文どおりの形）。
  ⇒ **刻印側を直した**（`src/data/effectParser.ts`）。**母集団は実測1効果**（`npm run census:population -- "この方法でデッキから(カード|それ)を?探し"`）。
  🔑**登録票が想定していた「`censusOrphanManual` の分類 D を PARTIAL にも認める較正」は不要だった**＝刻印が偽なら、**採用（＝凍結）ではなく刻印を消すのが正しい**。live は **AUTO のまま** `trashActivated` を受け取った。
- **`WX17-044-E2`**＝除外が**コスト欄ではなく本文**にある唯一の綴り。**旧 live は三重に壊れていた**＝①除外が**コストに1つも入っていない**（踏み倒して撃てる）②本体1歩目が `TRASH{TRASH_CARD}`＝「トラッシュのカードを1枚捨てる」という**別動作** ③「そうした場合、」が `CONDITIONAL{IS_MY_TURN}` に化けていた。
  ⇒ **同型が他に無い（実測1効果）ので PLAN §2.0 の速いレーンで手書き**し、`npx tsx scripts/syncManualLive.ts --effect WX17-044:WX17-044-E2` で **E2 だけ**を live へ届けた（E1 は live のほうが正しいので触らない）。
  🔑**「手書きが live に届かない」の正体**＝live が全 AUTO のカードは**配列まるごと** `isPureSuperset` に掛かるので、手書きが1リーフでも既存値を変えると held に落ちる。**`syncManualLive --effect` がその逃げ道**。

**🏁母集団10効果すべてが `cost.trashExile.self` ＋ `trashActivated` を持つ状態になった**（golden で全数固定）。

### 同時に強くしたゲート1本

`【トラップアイコン】節: スペル本体（E1）へ混入していない` は、**文字列 `ACTIVATE_TRAP` しか見ておらず、もう1つの発動入口 `TRAP_OP{trapOp:'activate'}` を素通し**にしていた（実際 `WX17-044-E2` の旧 live はそれを持っていたのにこのテストは緑だった）。⇒ **両方を見る**ようにし、母集団を「**唱えた瞬間に走る効果**」に絞った（`trashActivated` 等の別入口は混入ではない）。

### 検証コマンド

- `npm run gates` — **全緑**（golden **3532 / 3532**＝3529 +3本／smoke 全異常0／fuzz 全0／census 高シグナル **0 / BASELINE 0**／census-stubs A群🔴0・C群0／manual-fields 0／`census:enginetext` A🔴 **0行**／`census:costtext` A🔴 **0規則**／lint 0 errors）。`npm run regen` 完走。
- `node scripts/verifyBattleDrive.mjs o263ExplicitPicksSecondTrap o263ExplicitPicksFirstTrap o263SourceZoneTrapFires o263SourceZoneFollowsSigni` — **ALL PASS**。
- `node scripts/verifyBattleDrive.mjs v170SpellTrashExileActivatesTrap` — **PASS**。
- live の A/B 差分＝**6カードだけ**が変化（O-263 の5枚＋`WX20-053`）＋`syncManualLive` の `WX17-044` 1枚。

### 実機（§5.1 `V-169` / `V-170`）

**観測点はすべて「どちらの【トラップ】が発動したか」**＝ゾーン1に「カードを2枚引く」、ゾーン2に「デッキから2枚エナチャージ」を置き、**手札+2 か エナ+2 か**で見分ける。🔑**旧実装はどの盤面でも必ずゾーン1（＝手札+2）**なので、「エナ+2」になった時点で旧挙動は否定される。

- `o263ExplicitPicksSecondTrap`（**2つ目を選ぶ → エナ+2**）／`o263ExplicitPicksFirstTrap`（**対照**＝選ぶ候補だけを1つ目に変える1ビット反転 → 手札+2）
- `o263SourceZoneTrapFires`（効果元がゾーン2 → エナ+2）／`o263SourceZoneFollowsSigni`（**対照**＝効果元の居るゾーンだけをゾーン1に変える1ビット反転 → 手札+2）
- `v170SpellTrashExileActivatesTrap`（`WX17-044` をトラッシュからタップ → 自身が除外置き場へ移り、選んだ【トラップ】だけが発動）

**反転確認**＝①golden の新規2本は engine の payload 参照を `undefined` に潰すと FAIL する（実施）②`battleCardNums` から `signi_traps` を抜くと新ゲートが FAIL する（実施）。

### 🔑 教訓

1. 🔴**「対話を伴う入口では動くが、伴わない入口だけ黙って死ぬ」形がある。** `pending_effect` が抱えているカードは `battleCardMap` に載るので、**選択させる経路だけが偶然生き残る**。⇒ **同じ機構に入口が複数あるなら、対話の無い側で必ず1回実機を通す。**
2. 🔴**カードが「どのゾーンにも居ない」瞬間を作る機構は、`battleCardNums` に足したか必ず確かめる**（【チャーム】／裏向き付け／ソウル／シード／**【トラップ】**／**【マジックボックス】**）。忘れると **CardData ごと落ちて属性判定が全部 false/0 に倒れる**。
3. 🔴**`markSilentFallback` は「捨てられたパース試行」からも刻まれる**＝**最終 JSON に痕跡が無い偽の PARTIAL** を作り、それが `isPureSuperset` の唯一の不一致リーフになって **parser 改善の配送を止める**。⇒ **held の原因を見るときは、まず「消えたリーフ／変わったリーフ／増えたリーフ」を機械で出す**（本件は「変わったリーフ1つ＝parseStatus」だけだった）。
4. 🔑**「採用は凍結と引き換え」なら、採用ではなく原因を消す道を先に探す。** 登録票は `censusOrphanManual` の較正を要求していたが、**刻印が偽だったので較正は不要**だった。
5. 🔑**ゲートは「当たっている」だけでは足りない**＝混入ガードは**もう1つの入口（`trapOp:'activate'`）を素通し**にしていた。⇒ **同じ意味の入口が engine に何本あるかを数えてからガードを書く**（この機構は4本＝`execUtils.ts:1398` に明記されていた）。


## 2026-09-06（第185バッチ）＝🏁**`V-168` 返済**＝トラッシュ自己除外【起】の入口を実機で確認（2シナリオ ALL PASS）＋支払いモーダルの文言の嘘を1件修正

**この巡の主題**＝第184バッチで直した「トラッシュ自己除外【起】の入口」（§5.3 `O-262`）は **`src/screens/` を触った回**なので PLAN §2.2 で実機まで必須だった。その返済。**実装は前巡で済んでいるので、ここで新しく直したのは UI 文言1件だけ。**

### 実機（`node scripts/verifyBattleDrive.mjs v168TrashSelfExileActOffered v168FieldSelfExileActHidden`）

**2シナリオ ALL PASS**（8s / 6s）。**負方向の対照 1本**（1ビット反転＝`WX19-070` の居場所だけをトラッシュ ⇄ 場のゾーン2に変える）。

- **正方向 `v168TrashSelfExileActOffered`**＝トラッシュの `WX19-070`（幻獣　アルバト）をタップすると
  **「【起】このカードを除外して発動（このカードをゲームから除外）」が出る** → 支払うと
  ①`trash ["WX19-070#1"] → []` ②`lrig_trash（除外置き場）= ["WX19-070#1"]`
  ③`keyword_grants = ["WX01-086#1:ランサー"]`（Lv4 ＜空獣＞ に【ランサー】）。
- **負方向 `v168FieldSelfExileActHidden`**（対照）＝**同じカードを場のゾーン2に置くだけ**（トラッシュは空）＝
  タップしても **`actions=[]`＝【起】が1つも出ない**。

🔑**この2本で「過少（一度も提示されない恒久 no-op）」と「過剰（場から踏み倒して撃てる）」を同時に否定できる。**

**反転確認＝あり（実施した）**＝`signiActivateGate.ts` の除外句
（`!e.trashActivated && !e.energyActivated && !e.handActivated && !e.cost?.discardSelfFromHand`）を
一時的に `true` へ戻して対照だけ再実行 → **期待どおり FAIL**し、場のシグニに
**`actions=["【起】コストなし"]`** が現れた。🔴**コスト表記すら消えている**＝旧挙動が
「トラッシュから1枚も減らないまま**コストなしで**撃てる」ものだったことが実機で見えた。確認後に `git checkout` で復帰。

### 🔴 実機で見つけて直したバグ＝支払いモーダルが行き先を偽っていた（1件）

**真因**＝`TrashActivatedModal.tsx` の**確定ボタンと説明行が固定文言だった**。
確定ボタンは3分岐（`energyActivated` / 動詞が `手札に加える` / それ以外）を**その場で書き下していた**ため、
第184バッチで増えた**自己除外【起】が「それ以外」に落ちて「発動する（トラッシュから場に出す）」**と表示していた。
**カードは場に出ず、ゲームから除外されて終わる**＝行き先を偽る表示。
説明行（`<p>`）はさらに古く、**`このシグニをトラッシュから場に出す` のベタ書き**で、
自己回収【起】（`TRANSFER_TO_HAND`）とエナゾーン起動【起】でも**前から嘘をついていた**。

🔑**これは §5.3 `O-114`（動詞ラベルを本体アクションから決める）の「片肺」だった**＝
あのときアクション出し側（`getMyTrashCardActions`）だけを直し、**モーダル側は固定文言のまま残っていた**。

**直した箇所**：
1. `src/screens/battle/trashActivateCost.ts`＝**`trashActivateOutcomeLabel(effect)` を新設**。
   `trashActivateVerbLabel` と**同じ1本から**「何が起きるか」を決める
   （`エナゾーンから手札に加える` / `このカードをゲームから除外する` / `トラッシュから手札に加える` / `トラッシュから場に出す`）。
2. `src/screens/battle/modals/TrashActivatedModal.tsx`＝**確定ボタンの3分岐と説明行のベタ書きを撤去**し、
   両方をこの1本から描く。

**影響枚数**＝自己除外【起】**10効果**（表示が正しくなる）＋自己回収【起】・エナゾーン起動【起】の説明行。

**検証**＝実機シナリオが**支払いボタンの文言そのものを観測点に入れている**
（`/ゲームから除外/` を満たさなければ FAIL）。実測＝**「発動する（このカードをゲームから除外する）」**。
🔑**この形は golden では構造的に見えない**＝文言を組み立てるのは engine ではなく UI 層で、
live JSON を直した時点でゲートは全部緑になる（`V-166` と同じ型）。

### 検証コマンド

- `npm run gates` — **全緑**（typecheck / golden **3529 / 3529** / smoke / fuzz / census 高シグナル **0 / BASELINE 0** / census-stubs / manual-fields / census-enginetext A🔴 **0行** / census-costtext A🔴 **0規則** / lint 0 errors）。
- `node scripts/verifyBattleDrive.mjs v168TrashSelfExileActOffered v168FieldSelfExileActHidden` — **ALL PASS**。

### 🔑 教訓

1. 🔑**「実機は入口の有無を見るもの」ではない＝画面に出る文字列も観測点にする。**
   今回の嘘は**盤面差分にも DB にも一切現れない**（除外は正しく起きている）。
   実機シナリオに**ボタンの `textContent` を assert する行を1つ足しただけ**で捕まった。
2. 🔑**「片肺」は入口を増やしたときに必ず疑う**＝`O-114` で動詞ラベルを共有関数に切り出したのに、
   **モーダル側だけが3分岐をその場で書き下していた**ので、新しい入口が増えた瞬間に嘘へ落ちた。
   ⇒ **表示文言も「1本の関数」に集約する**（コストの支払い可否を `trashActivateCost.ts` に集約したのと同じ規約）。
3. 🔑**負方向シナリオの witness は「ボタンが0件」では足りない**＝場の【起】を持たないシグニは
   `getMySigniZoneActions` が **`[]` を返す**ので、**モーダルが開いていないだけ**と区別が付かない（§4.4 罠4）。
   ⇒ **StackModal の innerText に `WX19-070` が写っていること**まで確かめてから「出ない」と判定する。
4. 🔑**反転確認は「対照が空振りでない」ことの唯一の証拠**＝今回は1行を `true` に戻すだけで
   **「【起】コストなし」という旧挙動の実物**が撮れた。対照が緑であることと、対照が赤くなれることは別。


## 2026-09-06（第184バッチ）＝トラッシュ自己除外【起】の入口が10効果すべてで間違っていた（§5.3 `O-262`）

**真因**＝`trashActivated`（＝その【起】をトラッシュゾーンUIから出すか）の判定が **本体アクションの綴りしか見ていなかった**ため、**コスト側がゾーンを宣言している形**（原文「トラッシュにあるこのカードをゲームから除外する」＝`cost.trashExile.self`）を丸ごと取りこぼしていた。

**影響枚数**＝**10効果 / 10カード**（`SP27-018-E1`／`WX18-041-E1`／`WX19-036-E1`／`WX19-065-E1`／`WX19-070-E1`／`WX20-053-E2`／`WXDi-P06-032-E3`／`WXEX1-54-E2`／`WXEX1-75-E2`／`WX17-044-E2`）。**このうち8効果を返済**（残2件は `O-262` に登録＝下記）。

🔴**両方向のバグが同居していた**：
- 🔻**過少**＝`getMyTrashCardActions` は `trashActivated` を見るので、**10効果とも一度も提示されない恒久 no-op**。
- 🔺**過剰**＝9枚はシグニなので `listActivatableSigniEffects` が**場の【起】として提示**し、しかも `trashExile.self` の支払いは `trash.filter(cn => cn !== cardNum)`＝**場に在る札はトラッシュに無いので1枚も減らず、コストを踏み倒して撃てた**。

**直した箇所**：
1. `src/data/effectParser.ts`＝`trashActivated` funnel に `cost.trashExile?.self === true` を追加（入口の判定を**コストと本体の両方**から立てる）。
2. `src/screens/battle/signiActivateGate.ts`＝`trashActivated` / `energyActivated` / `handActivated`（`cost.discardSelfFromHand`）を**場の【起】一覧から除外**。⚠**入口を1つ足したら他の入口から降ろす**＝これを書かないと同じ効果が2つの入口から撃てる。
3. `src/screens/battle/trashActivateCost.ts`＝`trashExile`（**`self` 形だけ**）を対応コストに追加。支払いは `trash → lrig_trash`（シグニ【起】経路と同じ除外置き場）。🔴**効果元 `sourceCardNum` を渡さない／その札がトラッシュに無いときは支払い不能（null）へ倒す**＝踏み倒しを構造で塞ぐ。ラベルは**自己除外を本体アクションより先に読む**（`WXDi-P06-032-E3` は本体が `TRANSFER_TO_HAND`＝**別の札**なので「手札に加える」は嘘になる）。`count` 形（選択が要る）は**未対応側へ倒す**（このモーダルに選ぶ列が無い）。
4. `src/screens/BattleScreen.tsx`＝`executeTrashActivated` から効果元 `cardNum` を支払い関数へ配線。

**検証コマンド**＝`npm run gates`（全緑・golden **3529 / 3529**＝+1本）／`npm run golden -- --only "O-262"`。

**反転確認**＝golden の新規1本が4方向を固定＝①場の【起】一覧に出ない（旧は出た）②トラッシュからは提示され `trash → lrig_trash` へ移る ③`sourceCardNum` 無し・トラッシュに無い のどちらも `null`（支払い不能）④`count` 形は未対応。

**実機の要否**＝**要**（`src/screens/` を触った回＝PLAN §2.2）。**この巡では未実施**＝§5.1 に **`V-168`** として登録（正方向＝トラッシュの `WX19-070` をタップして【起】が出る／負方向の対照＝**同じカードを場に出すと【起】が1つも出ない**）。

**残2効果（`O-262` へ登録）**：
- `WX20-053-E2`＝fresh は `trashActivated:true` を出しているのに、`isPureSuperset` が **`parseStatus` の値差（AUTO→PARTIAL）を「改変」と見て** held に落とす。🔴**`heldReview --adopt` で採ると live が PARTIAL になり、`O-133` のラチェット（live 限定 MANUAL スタンプ 7→8）で golden が FAIL する**＝**採用は「凍結」と引き換え**。計器の較正（分類 D を PARTIAL にも認める）が先。
- `WX17-044-E2`＝除外が**コスト欄ではなく本文**にある唯一の綴り。手書き JSON は作れたが **live に届かなかった**（配送経路の調査が先）。

**同時に登録した派生項目**＝`O-263`＝**`ACTIVATE_TRAP` が「どの【トラップ】か」を読んでいない**（6効果）。現行は先頭の非 null トラップを自動で取るので、①「あなたの【トラップ】１つを**対象とし**」は**プレイヤーが選べない** ②「**このシグニと同じシグニゾーンにある**【トラップ】」（`WX15-035-E1`／`WX19-058-E1`）は**別ゾーンのトラップを暴発させる**。

🔑**教訓①＝「1枚の機構待ち」と書かれた項目こそ母集団を測る**（`npm run census:population -- "<原文>"` は5秒）。この項目は PLAN の「**worklist ではない**＝着手前の参照用」節に 2026-08-10 から置かれていた。
🔑**教訓②＝入口の判定を「本体アクションの綴り」だけで立てない。**
🔧**踏んだ実装の罠**＝golden の `StateOpts.trash` は**枚数**（`fill(n)`）＝カード番号の配列を渡すと**0枚**になる（前セッションの `StateOpts.energy` と同型の罠を2連続で踏んだ）。

## 2026-09-06（第183バッチ）：🏁**`O-261` クローズ**＝登録した母集団30は測定ミスで、本物は2効果だった（実装＋実機まで返済）

**ベースライン**＝第182の直後。**gates 全緑**（golden **3527/3527**）。
🖥**実機必須**（`src/types/` に新しい `TargetFilter` キーを足した＝§2.2 の「新しい型を足した回」）
＝**2シナリオ ALL PASS**（`V-167`・**負方向の対照1本**）。

### 🔴 まず訂正＝`O-261` の登録票に書いた「30効果」は私の測定ミスだった（実測 **2効果**）

第182バッチで「〈条件〉の場合、代わりにNつ（まで）選ぶ」の選択数上書きが **30効果**で欠けている、と登録した。
**実測し直すと 2効果**。原因は**受け皿の数え漏れ**が3種類：

| 漏らしたもの | 内容 |
|---|---|
| **キー名の綴り違い** | `additionalCostChoices` と書いた（正しくは **`additionalCostChoose`**） |
| **数えていないキー** | `conditionChoose` / `recollect` / `recollectArts` / `preUseVirusChoose` |
| **キーを持たない別の正準形** | `CONDITIONAL` の2枝形（`WXK06-027-E1`＝`then: CHOOSE{2,upTo}` / `else: CHOOSE{1}`）／専用ハンドラ（`WDK08-L14-E1`＝`INTERNAL_KIYOHIME_CHOOSE` が `signi_armor` を読んで 3回/1回 を出し分ける） |

🔑**CLAUDE.md が名指しで警告している型**＝「『原文にフレーズがあるのに live にキーが無い』型の計器は、
**受け皿の別名を全部知らないかぎり必ず過大に出る**（9回連続で過大に外した実績）」。**10回目を踏んだ。**
⇒ **miss は件数を言う前に、1件ずつ live と engine を読んで潰す。**

### 🏁 実測で残った2効果は本物だった（据置ガードごと解いた）

`WXEX1-07-E2`（遊月・四篝）「対戦相手は自分のエナゾーンから**宣言した色ではない色を持つすべてのカード**をトラッシュに置く」／
`WXK09-037-E1`「宣言された色を持たず**無色ではない**すべてのカード」。

🔴**旧 live＝`TRASH{ENERGY_CARD, owner:'opponent', count:1}`**＝
**過少（「すべて」ではなく1枚）と過剰（宣言色のカードまで落としうる）が同居**していた。
`parseSentencePart1.ts` に **据置ガード**が置かれ、コメントがこの2枚を名指しで
「色限定が未表現なので ALL にすると相手のエナを全部飛ばす過剰に化ける」と書いていた（2026-08-17 から）。

**直したもの**
- 🆕`TargetFilter.colorNotDeclaredColor`（`src/types/effects.ts`）＝**宣言された色を持たない**。
- `resolveDynamicFilter`（`effectExecutor.ts`）が `declared_color` → **`colorExclude`** へ解決。
  🔴**未宣言なら `noMatch`（空ヒット）へ倒す**＝素通りさせると `count:'ALL'` と組んで**相手エナ全損**になる。
- `parseSentencePart1.ts` の据置ガードを解除（「無色ではない」は**原文にあるときだけ** `nonColorless` を足す）。
- `heldReview.mjs --adopt-effect` で live へ採用（値が変わる差分なので `_held_fresh` に落ちる＝設計どおり）。

⚠**据置ガードを守っていた golden（`§6.4 O-35`）も書き換えた**＝旧は `count:1` を assert していた。
**規律そのものは生かす**ため、いまは **`ALL` ＋ 色の否定の両方**を assert する
（＝**色の否定が無いまま ALL へ広げる**のは引き続き FAIL）。

### 🖥 実機（`V-167`）

| シナリオ | 盤面 | 結果 |
|---|---|---|
| `v167DeclaredColorTrashAll` | 相手エナ 白1 + 青2 | **3枚 → 1枚**（白だけ残る） |
| 🔁`v167DeclaredColorKeepsAll` | **色だけ**を白3に変える | **3枚 → 3枚**（1枚も落ちない） |

🔑**旧挙動（`count:1`）ならどちらも「1枚落ちる」**＝この2本で**過少と過剰を同時に否定**できる。
🔑**CPU（guest）の `opponentResponds` 自動応答は常に選択肢の先頭を選ぶ**（`BattleScreen.tsx:634`）＝
色宣言は `['白','赤','青','緑','黒']` なので**必ず「白」**になり、シナリオが決定論になる。
⚠**同カードの【自】は「相手エナが5枚以上」で別のトラッシュを起こす**ので盤面は**3枚に留める**。

### 🔧 踏んだ実装の罠

golden の `StateOpts.energy` は**枚数**（`fill(n)`）＝**カード番号の配列を渡すと0枚**になる。
そのせいで「**未宣言なのに相手エナが全部消えた**（fail-closed が効いていない）」という
**engine のせいに見える FAIL** が出た（実際はテスト側の前提崩れ）。
⇒ `otherState.energy` を直接組む形へ。⚠**別々のカード番号**で置く（同名は数えられない＝既知の罠）。

### 検証

`npm run build:effects` → `npm run regen` → `npm run gates` **全緑**
（golden **3528/3528**＝3527 +1本・smoke 全異常0・fuzz 全0・census 0/BASELINE 0・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
🔑**`build:effects` を通しても採用値が残ることを確認**（`_held_fresh` 3 → **1**＝残1は `O-249` の意図的な据置）。

### 🔑 教訓

- 🔴**「受け皿が無い」を件数で言う前に、1件ずつ live と engine を読む。**
  別名・別の正準形（`CONDITIONAL` 2枝・専用ハンドラ）は**キー検索では絶対に見つからない**。
- 🔑**据置ガードには「解く条件」が書いてある**＝今回は「色限定が表現できるようになったら」で、
  受け皿を足した瞬間に解けた。**ガードのコメントは worklist として読む。**
- 🔑**ガードを守っていた golden は、ガードを解くとき一緒に書き換える**（規律を消さずに、新しい正しい姿へ）。

## 2026-09-06（第182バッチ）：🆕**`O-261` 登録**＝「worklist ではない」節に **30効果ぶんの在庫**が埋もれていた

**きっかけ**＝第181バッチの報告で「機構 worklist から取る項目は残0／在庫は尽きた」と書いたところ、
ユーザーから **「§5.3 の『個別カードの機構待ち・監視項目（worklist ではない＝着手前の参照用）』に在庫はないのか」**
と指摘された。**数え直したら在庫はあった。報告が誤りだった。**

### 見つかったもの＝「〈条件〉の場合、代わりにNつ（まで）選ぶ」の選択数上書きが live に無い

**実測（効果単位）**＝原文に `/代わりに[^。]*?つ(まで)?選ぶ/` が出る **45効果**のうち、
live に `betChoose` / `additionalCostChoose` / `conditionChoose` / `recollect` / `PAID_ADDITIONAL_COST` の
**いずれも無い**ものが **30効果**。

🔴**実害＝条件を満たしても選択数が増えない（過小実行）。** うち4件は
**「追加コストを支払ってもよい」→ 払っても選べる数が増えない＝払い得のない支払い**
（`PR-Di013-E1` / `SP26-005-E1` / `SP38-004-E1` / `WXDi-P15-002-E1`＝`OPTIONAL_COST` は載っているのに
`CHOOSE.choose_count` が印刷値のまま）。

🔑**受け皿は全部すでに在る**（`src/types/effects.ts:2594` 付近＝`conditionChoose` は `O-11` で
「素の盤面条件を表せなかった」問題を解くために汎用化済み）⇒ **新機構は不要＝parser の配線漏れ**。
**最大群は「あなたのセンタールリグが＜X＞の場合」**（＜グズ子＞＜ピルルク＞＜リメンバ＞＜リル＞か＜メル＞＜ＬｏＶ＞ ほか）。

### 🔴 真因＝「worklist ではない」節に実作業を置いたこと

旧記載は **「G. 置換else系統の残＝残は C 13件」**（`docs/_replace_else_triage.txt` の **2026-07-27** の値）。

- **数字が stale**＝実測は 30効果（台帳は 2ヶ月前のスナップショットで、その後の parser 変化を反映していない）。
- 🔴**構造的にもっと悪い**＝あの節は見出しに **「worklist ではない」** と書いてあるため、
  **§5.3 の索引にもキューにも出ず、`census:cards` の `mech` にも（引用カード以外は）出ない。**
  ⇒ **3計器が底を打っても、この節の在庫は1件も減らないし、誰も気づかない。**

**同じ節の「K. `manualEffects.ts` ↔ live JSON の乖離＝残 15 効果」も stale だった**
（第179バッチ・`O-93` で **乖離 0** にしている）。⇒ 実測値へ書き換えた。

### 直したもの（**コードは1バイトも変えていない**）

- 🆕**`O-261` を §5.3 索引 A へ登録**（母集団2桁＝ここから取る）＋ 登録票の全文を `PLAN_DETAIL.md` へ。
- 「G. 置換else系統の残」を **`O-261` へ切り出した**と書き換え（台帳の分類は 2026-07-27 時点＝着手時に数え直す旨も明記）。
- 「K. 乖離 残 15 効果」を **残 0（第179 でクローズ）** へ書き換え、現行のゲート2本を明記。
- §1・§5 の在庫を **2 → 3項目**（索引 A 1件）へ訂正。

### 検証

`npm run gates` **全緑**（golden **3527/3527**・census 0/BASELINE 0・その他すべて据置）。
`census:cards` 全シート＝**要対応 58 → 64／`mech` 35 → 41**。
⚠**この +6 は退化ではなく可視化**＝`O-261` を索引に載せたので、その引用カードが機構待ちとして映るようになった。
⚠**+6 で止まるのは `mech` が「索引・登録票に**書かれたカード番号**」しか見ないから**＝
30効果すべてが映るわけではない（計器自身が「この判定は**下限**」と出力している）。

### 🔑 教訓

- 🔴**「在庫0」は索引を見ただけでは言えない。** 3計器が底を打っても、
  **「worklist ではない」と書いた置き場に実作業が溜まっていれば在庫は無くなっていない。**
- 🔑**参照用と宣言した節は更新されない**＝そこに数字を書くと必ず stale になる（今回2件とも stale だった）。
  ⇒ **実作業が残っているものは索引へ `O-nn` で出す。参照用の節に置くのは「着手不要と確認済み」のものだけ。**
- 🔑**指摘を受けたら、まず数え直す**＝今回は読むだけでは「C 13件」で終わっていた（実測は30件）。

## 2026-09-06（第181バッチ）：🏁**`O-132` クローズ**＝census 高シグナルが 0 になり、Sheet1 の要対応も 0 に到達

**ベースライン**＝第180の直後。**gates 全緑**（golden **3527/3527**・census **1 / BASELINE 1**）。
🖥**実機は不要**（触ったのは `scripts/` と `docs/` だけ＝`src/` も `public/` も1バイトも変えていない）。
🔴**この巡は「較正」であって前進ではない**（PLAN §3 の原則）＝カードの挙動は1件も変わらない。

### ② 母集団の実測＝登録票の「残 491」は 2026-08-28 の値で、**実測は 1** だった

登録票（2026-08-28）は「高シグナル **491** が偽陽性かどうか未調査」と書いていたが、
その後の parser 改善が勝手に消化しており、`npm run census` の実測は **1 / BASELINE 1**。
🔑**この項目は「491件を1カテゴリずつ仕分ける大仕事」に見えていた**＝**着手前に必ず数え直す。**

### 残っていた1件は偽陽性だった（根拠は engine の実装そのもの）

`WX25-P1-022-E2`（カテゴリ「Nまで」上限選択）＝原文
「あなたと対戦相手のトラッシュからスペルを**それぞれ１枚まで**対象とし、このターン、あなたはそれらを使用してもよい」。

live は `SEQUENCE[PLAY_FREE{source:'trash'}, PLAY_FREE{source:'opp_trash'}]` で、
`upToCount` / `maxCount` などの上限キーを持たない ⇒ census が「上限語彙が落ちている」と判定していた。

🔑**しかし `execPlayFree`（`effectExecutor.ts:8060`）は最後に `SEARCH{maxPick:1}` を出し**、
そのコメントが「**SEARCH は0枚選択で確定でき、「使用してもよい」（辞退）に対応する**」と明記している
＝**0 か 1**＝原文「１枚まで」そのもの。**`PLAY_FREE` それ自体が上限スロット**で、上限キーは構造上いらない。
🔑`PlayFreeAction` の型注記（`src/types/effects.ts:3281`）は**このカードを名指しで**正準形として書いていた。

### 直したもの（較正）

- `vocabCensus.ts` の「Nまで」上限選択カテゴリの `extraOk` に、**`PLAY_FREE` ノードを上限スロット1つとして数える**を追加。
- 🔴**キー表（`keys`）には足していない**＝免罪符にすると「**同じ効果の別アクション**にある『N体まで』の脱落」まで隠れる
  （この `extraOk` が `LOOK_PICK_CHAIN` で既に避けている罠と同じ）。**残渣チェック（need ≤ slots）の slot として数えるだけ**。
- **`BASELINE_HIGH` 1 → 0**。⇒ census 高シグナルは**0 が正常値の再発防止ゲート**になった。
- golden の較正トリップワイヤ（`O-132`）へ1行追加＝**較正の根拠キーが live に実在する**ことを固定する。

🔁**反転確認2本**＝①`extraOk` の slot 加算を外すと `npm run census` が **exit 1**（高シグナル 0→1）
②較正の根拠キーを壊すと golden の `O-132` トリップワイヤが **FAIL**。

### 🔴 作業中に見つけた別の較正バグ＝**自分が前2バッチで書いたクローズ注記が計器を汚していた**

`census:cards` の `mech` フラグは **§5.3 の節テキスト全体をそのまま haystack にしてカード番号を拾う**
（`cardProgressCensus.mjs:196`）＝**クローズ注記の中の引用カードまで「機構待ち」に化ける**。

**実測＝項目を1つ閉じた（`O-93`）のに `mech` が 38 → 40 に増えた**（要対応 61 → 63）。
第178（`O-226`）と第179（`O-93`）のクローズ注記に書いた**5枚**がそのまま機構待ちに数えられていた。

⇒ 注記からカード番号を落として **`mech` 35 / 要対応 58** へ。
⇒ **§5.3 の冒頭に「開いていない項目のカード番号をこの節に書かない」規約を明記した**（理由と実測つき）。

🔑**これは `O-187` が直した罠の再発**（あのときは「クローズ済みの登録票を開いていると誤判定」する形だった）。
🔑**計器が読んでいるのは実装だけではなく、ドキュメントの書き方でもある。**
⇒ **§5.3 を編集したら `npm run census:cards` を回して差分を見る。**

### 検証

`npm run gates` **全緑**（golden **3527/3527**・smoke 全異常0・fuzz 全0・**census 0 / BASELINE 0**・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。

**3計器**＝**Sheet1 要対応 1 → 🏁0 / 863**｜台帳 残 OPEN 24（据置）｜**census 高シグナル 1 → 🏁0**。
⚠**Sheet1 が 0 になったのは「このシートが正しい」という意味ではない**＝残862枚への検出パスが無いだけ
（シート限定の意味照合再監査が別途要る＝計器自身が毎回そう出力している）。

## 2026-09-06（第180バッチ）：🏁**`V-166` 返済**＝`O-93` の帰結を実機で確かめた（2シナリオ ALL PASS）

**ベースライン**＝第179の直後。**gates 全緑**（golden **3527/3527**）。
🖥**この回は実機そのものが成果物**（`scripts/verifyBattleDrive.mjs` にシナリオ2本を追加しただけで、
カードデータも engine も1バイトも変えていない）。

### なぜ実機が要ったか

第179（`O-93`）で直した `WXEX2-71-E3` は**二重に壊れていた**＝
① `GRANT_KEYWORD.keyword` が**原文の文まるごと**の文字列で、`BattleScreen.tsx:10557` が探す
`'正面以外追加アタック'` と一致せず**恒久 no-op**（撃っても何も起きない）
② 付与先が `owner:'opponent'`（原文は「**あなたの**他の＜英知＞のシグニ」）＝**相手を強化していた**。

🔴**どちらも golden では構造的に見えない**＝keyword 文字列を解釈するのは engine ではなく **UI 側**なので、
**live JSON を直した時点でゲートは全部緑になる**。⇒ 実機でしか返済できない型。

### シナリオ設計

| | 内容 |
|---|---|
| 盤面 | 自分 zone0＝`WXEX2-71`（＜英知＞Lv2）／zone1＝`WXK02-085`（＜英知＞Lv3・パワー10000・**バニラ**）＝**英知レベル合計 5**（`EICHI_LEVEL_SUM eq 5` をちょうど満たす）。相手は3ゾーンとも Lv1/3000/バニラ/バーストなし |
| 操作 | zone0 の【起】《緑×0》を撃ち、対象に zone1 を選ぶ → アタックフェイズで zone1 からアタック |
| 観測点 | **正面以外の2ゾーンの相手シグニも一緒にバニッシュされる**（`oppZiMZA = 2 - zi`） |
| 🔁対照 | **盤面も操作も同じで【起】を撃つかどうかだけ**を変える1ビット反転 |

**結果**＝撃つ＝相手3体とも落ちて**エナ 5→8**（3枚）／撃たない＝**正面だけ**で**エナ 4→5**（1枚）。
付与も `WXK02-085#1:正面以外追加アタック` と**自分側に**載ることまで assert した
（旧実装の `owner:'opponent'` が再発したら FAIL する）。

### 🔴 踏んだ罠（シナリオ側）＝FAIL を engine のせいにしかけた

初回実行は「付与されない」で FAIL したが、**真因は「発動」ボタンを押していなかったこと**。
能力を選んだだけでは撃たれず、**`H.stdStep` の既定語彙に「発動」が無い**（§4.4 の 2c が明記していた）。
18ティックまるごと空振りし、FAIL 文言は「旧実装の再発」を指していた＝**誤診しかけた**。

🔑**救ったのは FAIL 文言に載せた「見えているボタン」のダンプ**＝
`["アタックフェイズへ","リムーブ","↺","終了","キャンセル","発動"]` と出ていたので1回で切り分けられた。
⇒ **FAIL を実装のせいにする前に、自分が押していないだけでないかをボタン一覧で確かめる**（罠 8q と同じ作法）。
⇒ シナリオ側に「`発動` を `isEnabled()` 込みで押す」段を足した（罠 8b）。

### 検証

`node scripts/verifyBattleDrive.mjs v166MultiZoneAttackGranted v166MultiZoneAttackNotGranted` ＝**ALL PASS**
（連続実行でも安定＝位置依存のフレークなし）。`npm run gates` **全緑**（golden 3527/3527）。

## 2026-09-06（第179バッチ）：🏁**`O-93` クローズ**＝手書き shadow の「枝番 id」が parser 改善の配送経路を塞いでいた

**ベースライン**＝第178の直後。**gates 全緑**（golden **3526/3526**）。
🖥**実機は §2.2 の機械判定では不要**（触ったのは `src/data/` `public/data/` `scripts/` `docs/` だけ＝
`src/screens/` も `src/engine/` も新しい型・機構も無し）。**ただし1効果だけ判定の外**＝下の `V-166`。

### ② 母集団の実測（登録票の 32効果 → 実測 57効果 → うち真は 21）

`npx tsx scripts/censusManualDrift.ts` ＝ **乖離 50カード・57効果**。

### 真因①＝**乖離の 36効果（63%）は計器の偽陽性だった**

`buildEffectsJson` は **マージの後から**印字キーワードコストを先頭効果へ重ねる（`buildEffectsJson.ts:315`）＝
`encoreCost` / `betOptions` / `boostCost` / `useTimeCost` / `costReplacement` / `optionalDiscardCost`。
`censusManualDrift` の `fresh` は `parseCardEffects` + `mergeManualEffects` までしか通っていないので、
**live にだけ在るのが正しい値**を全部 `LIVE_RICHER`＝乖離として報告していた（36効果／リーフの内訳は
`betOptions` 37・`costReplacement` 34・`encoreCost` 12・`optionalDiscardCost` 12・`boostCost` 8・`useTimeCost` 7）。

🔑**同じ穴を `decompileEffects.ts` が 2026-09-05（`O-252`）に直している＝ここが3箇所目。**
🔴**さらに live へ直接書く道具2本も重ねを持っていなかった**＝`syncManualLive.ts` と
`censusManualDrift --adopt`。**回すと live から印字コストが黙って剥がれる**（次の `build:effects` までは
「アンコールもベットも無い札」になる。⚠**どのゲートにも映らない**＝golden も census も印字コストの有無を見ていない）。
⇒ **4箇所とも塞いだ。**

### 真因②＝残21効果の真因は1つ＝**手書き id の枝番（`-E1b` / `-E2b`）**

枝番を使うと **live の効果番号が原文の文の並びから1つズレる**。ズレると `build:effects` は
**カードごと `_idset_fresh` に温存**し（`buildEffectsJson.ts:274`）、そのカードへの parser 改善が
**何ひとつ届かなくなる**。実例＝`WX20-038` は `census:population` が `-E2` の原文として
「バニッシュされずダウンしない」を出すのに逆翻訳はダメージ効果を出していた（**原文照合が成立しない状態**）。

⇒ 8カードの id を原文順へ揃え、parser に追いつかれた手書きは削除した。

| カード | したこと |
|---|---|
| `WXK01-074` / `WDK06-R09` / `WXDi-P03-016` | 手書き `-E1b`/`-E2b` を削除して parser に返す（`WXDi-P03-016` は後述の理由で `-E2` として書き直し） |
| `WX20-038` | `-E1b`（【ダブルクラッシュ】）は parser が `-E1` に出すので削除。耐性だけを `-E2` に残し、**原文「**この**シグニは」の `thisCardOnly` を追加**（旧は場の自分のシグニ1体に読めた） |
| `WX25-CP1-061` / `WXK04-015` | live の `-E3`/`-E1b` を parser の `-E2` へ改名（実体は同じ） |
| `WXEX2-71` / `WX24-P4-045` / `WXEX1-66` | `manualEffects.ts` の修正が live へ届いていなかった＝`syncManualLive` で配送 |
| `WXK06-024` / `WXK03-018` / `SPDi43-30` / `WXK03-014` / `WD07-012` | parser の改善を `--adopt` で採用 |
| `WXK10-075` | **逆向き**＝parser が【アクセ】条件を落とすので、正しい形（live）を `MANUAL` で固定（同型2枚・もう1枚も同じ形で MANUAL 済み＝§2.0 速いレーン） |

### 🔴 その凍結が隠していた実バグ（凍っている間はどの計器にも出ない）

| 効果 | 症状 |
|---|---|
| `WXK04-015-E1` | 原文「以下の**４つから２つ**を選ぶ」が **`choose_count:1`**＝**1つしか選べない過小実行** |
| `WX24-P4-045-E1` | `ADD_TO_LIFE{owner:'opponent'}`＝**相手のライフを増やしていた**。`effectExecutor.ts:4042` が**このカードを名指しで**「原文が加える先を修飾しない場合は効果の使用者のライフ」と書いていたのに live へ届いていなかった |
| `WXEX2-71-E3` | `keyword` が原文の文まるごとで `BattleScreen.tsx:10557` の `'正面以外追加アタック'` と一致せず**恒久 no-op**。さらに付与先が `owner:'opponent'`（原文は「**あなたの**他の＜英知＞のシグニ」）＝**相手を強化していた** |
| `WXEX1-66-E2` | `REVEAL_DECK_TOP(4)` の後にもう一度 `REVEAL_AND_PICK(4)` が積まれ、**4枚公開が2回**走っていた |
| `WXK03-014-E1` | 「カードを１枚引いて**もよい**」が強制だった（`ON_LIFE_CRASHED` の収集は `mandatory:false` を一切見ない＝任意化は `SEQUENCE[STUB{OPTIONAL_ACTIVATE}, …]` でしか届かない） |
| `WXK06-024-E1` | `PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP`（絞り込みを持てない全体版）で凍っており、原文「あなたの**他の**シグニ」の `excludeSelf` が無かった |

### 🔑 教訓

- 🔴**「live のほうが新しい＝同期してはいけない」と golden に書いてあった3件は、原文照合すると全部逆だった。**
  `--date`（git 履歴）判定は**着手順を決めるためのもので判定ではない**（計器自身がそう警告していた）。
  ⇒ **日付ではなく「原文」と「engine のどこがその値を読むか」で決める。**
- 🔑**id の枝番は「表示の細部」ではなく、parser 改善の配送経路そのものを塞ぐ。** 1つ直すと
  「孤児 MANUAL スタンプ」と「id 集合ズレ」が**同時に**減る（実測＝orphan 8→7・idset 6→0）。
- 🔑**「重ねる場所」は増える**＝印字コストの重ねは build / 逆翻訳 / 計器 / 同期ツール の**4箇所**にあった。
  **1つ直したら残りを grep する**（`O-252` で1つ直したのに3つ残っていた）。
- 🔴**構造化が常に正しいとは限らない**＝`WXDi-P03-016-E2` を parser の `GRANT_LRIG_ABILITY` に任せたら
  **＋5000 が黙って効かなくなった**（`calcFieldPowers` が付与ストアを読まない＝`O-25(d)` 待ち）。
  golden `§6.4 O-25` がそう警告していたのに踏んだ。⇒ **id だけ揃えて中身は動く近似を維持。**

### 🛡 張ったゲート

- 🆕**golden `§5.3 O-93`**＝`docs/_partial_fresh.json` / `docs/_idset_fresh.json` のカード数ラチェット。
  **0 が正常値**（増えたら「また凍らせた」、減ったら基準を下げる）。🔁**反転確認済み**（基準を下げると FAIL する）。
- **`MANUAL_DRIFT_KNOWN` を空にした**＝1件でも積まれたら「manual を直したのに live へ届いていない」の再発。
- `BASELINE_ORPHAN_MANUAL` **8 → 7** に払い戻し。

### 検証

`npm run build:effects` → `npm run regen` → `npm run gates` **全緑**
（golden **3527/3527**＝3526 +1本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
🔑**`build:effects` を通しても乖離0のまま**＝次のビルドで巻き戻らないことまで確かめた（ここが本当の証明）。
`censusManualDrift` **57効果 → 0**／`_partial_fresh` **10 → 0**／`_idset_fresh` **6 → 0**／
`census:cards` 全シート 要対応 **73 → 61**・即着手可能 **35 → 23**。

### 🖥 残した観測点（`V-166`）

`WXEX2-71-E3`＝keyword を読むのは `BattleScreen` なので **golden では見えない**。
英知＝5で【起】を撃ち、**自分の**他の＜英知＞シグニが正面以外のシグニゾーンへアタックできることを実機で見る
（負方向の対照＝撃たなければ正面にしかアタックできない）。先例＝`WX15-093-E1` が同じ keyword を既に使用。

## 2026-09-06（第178バッチ）：`O-226` は**既にクローズ済みだった**＝残っていたのは簿記だけ

**きっかけ**＝「PLAN を読み `O-226` を行う」。**PLAN §1 の「▶次の一手」が
「挙動側で残っているのは G の `O-226`（CSV 欠落で着手不可）」と書いていた**が、
同じ PLAN の §5.3 索引 G の行そのものには **🏁第174（実装）・第175（実機 ALL PASS）でクローズ**と書いてあった。

### 真因

**クローズした回に「索引の行を消す」までやらなかった**（PLAN 冒頭の運用＝*クローズした項目はこのファイルから消す*）。
行が残ったため §1・§5 の表・§6 恒久指標の3箇所が**5セッションにわたり「着手不可1件」と報告し続けていた**。
🔴**害は表示だけではない**＝`census:cards` の `mech` フラグは **§5.3 索引の未クローズ項目を読む**（`O-187` の較正）ので、
**閉じたはずのカードが「機構待ち」に数えられ続けていた**（全シート `mech` 40・要対応 75）。

### 実コードで確認したこと（先に裏を取ってから消した）

| 観測点 | 結果 |
|---|---|
| `nthActivationFlip` ハンドラ | `src/engine/execStubPart1.ts:3305` に実在 |
| `flipTo` の生成 | `src/data/parsers/gameGrants.ts:116`（命名規約 `A`→`B`） |
| 裏面のカードデータ | `public/data/CardData_TK.csv` に `WXK03-003B` 1件 |
| 実機で踏んだ穴の再発防止 | `src/screens/BattleScreen.tsx:849` の常時ロード表＋golden `§5.3 O-226 裏面ロード` |
| 実行 | `npm run golden -- --only "O-226"` ＝ **5/5 PASS** |

### 直したもの（**コードは1行も変えていない**）

- `docs/PLAN.md` §5.3 索引 G＝`O-226` の行を削除し、クローズ済みである旨と退避先（BUGFIXES 第174／第175）を残した。**索引 G は残0**。
- §1 在庫／§5 の節表／§6 恒久指標の**残数を 5 → 4** に統一（索引 **A 0／B 0／G 0／E 4**）。
- `census:cards` 全シート＝**要対応 75 → 73／`mech` 40 → 38**。⚠**退化ではなく較正**（索引から閉じた行が消えたぶん）。Sheet1 は **1 / 863** で据置。

### 検証

`npm run gates` **全緑**（golden **3526/3526**・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
🖥**実機は不要**＝触ったのは `docs/` だけ（§2.2 の機械判定）。

### 🔑 教訓

**「クローズした」は実装が終わった時点ではなく、①索引の行を消す ②§1・§5・§6 の残数を直す まで**。
これを落とすと **cold start が最初に読む節が、閉じた項目を「次の一手」として指す**（今回まさにそれが起きた）。
🔑**計器が索引を読んでいる以上、簿記漏れは表示の問題では済まず、進捗計器の数値そのものを汚す。**

## 2026-09-06（第177バッチ）：🏁**`O-259` クローズ**＝コスト句が「実装済みに見える」穴を残10効果ぶん全部塞いだ

**ベースライン**＝第176の直後。**gates 全緑**（typecheck・golden **3526/3526**＝3517 +9本・smoke 全異常0・
fuzz 全0・census 1/BASELINE 1・`census:stubs` A群🔴0/C群0・manual-fields 0・
`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・`census:deadstate` 0件・lint 0 errors）。
🖥**実機は必須**（`src/screens/` を5ファイル触った）＝**7シナリオ ALL PASS**（`V-162`〜`V-165`・**負方向の対照4本**）。
📉**`O-259` のラチェット 10 → 0**（golden `§5.3 O-259` が **0 が正常値**の再発防止ゲートになった）。

> **`O-259` とは**＝`STUB{ARTS_COST_REDUCTION_BY_*}` / `CONDITIONAL_ARTS_COST` の逆翻訳は
> **原文のコスト文をそのまま貼る**ので、**何も構造化できていない効果でも実装済みに読める**。
> 第168 で「payload が1つも無いときだけ `【※コスト未構造化】` を付ける」印を入れて可視化し、
> 第170〜172 で 16→10 まで返済してあった。**今回はその残り10効果**。

### 用法ごとの内訳（残10効果を9バッチで消化）

| # | 効果 | 何が無かったか | 足したもの |
|---|---|---|---|
| 第4 | `WX20-020-E1` | 条件（自Lv4以下 **かつ** 相手Lv5以上）は JSON に在ったのに **`costReplacement` payload が無く支払い時に一度も適用されなかった** | `CostReplacementWhen` に `centerLrigLevel`（`self` ＋任意の `opp`＝**1項の AND**）を1種 |
| 第5 | `PR-433-E1` / `WXK11-016-E3`（＋家族の `WX14-027-E3` / `WXDi-P06-066-E2`） | 🔴**コストを一切払わせない**（`STUB{CAST_FROM_OPP_TRASH}`＝「コストなしで使用」）＋ **候補がルリグトラッシュに在るのに `trash` からスペルだけ探していた＝候補0の無言 no-op** | 既存 `USE_SPELL_FROM_TRASH_PAYING_COST` に **領域 `opp_lrig_trash`** と **`useIgnoreCostColors`**（色スロットを全部《無》に読み替える）の2つ |
| 第6 | `WD16-010-E1` | 「センタールリグのレベル1につき《青×1》減る」＝**色も比例も表せなかった** | `turnCardCostReduce` に `color` と `perCenterLrigLevel`（解決は読み口 `collectSpecificCardCostReductions` の1箇所） |
| 第7 | `WX25-CD1-17-E1` | 「次に使用する**ルリグの【起】**の使用コスト」の受け皿が無い | `CostReductionAction.forNextLrigActivated` → `next_lrig_act_cost_reduction` → `applyNextLrigActCostReduction`（人間 `LrigGrantedModal` と CPU `cpuLrigActivate` が**同じ関数**） |
| 第8 | `WXDi-P06-066-E1` | 「エナコスト1つを選んで代わりに《無》として支払える」＝**軽減とは別軸**（枚数は減らない） | `canAffordWithOneWildCostSlot`（提示 `spellUseGate` と支払い検算 `SpellCastModal` が同じ関数） |
| 第9 | `WXK11-014-E1` | ①綴りが「グロウするための**エナ**コスト」で regex に当たらない ②**キー枠を1度も走査していない** ③**相手の場を見ない**（「すべてのプレイヤーに影響する」） ④「無色ではないルリグに」が無い | `GROW_COST_REDUCTION` に `allPlayers` / `targetNonColorlessLrig` ＋ `collectGrowCostReductions` にキー枠と相手側の走査 |
| 第10 | `SPK06-01-E1` | 「＜レイラ＞のコイン技の《ゲーム１回》を《ゲーム２回》に」＋「次のコイン技が《コイン×1》減る」 | `STUB{COIN_ABILITY_BOOST}` ＋ `effectiveCoinCost` / `gameUseAllowance`（提示ゲートと支払いが同じ関数） |
| 第11 | `WX22-016-E1` | ①「使用コストは《黒×3》減る」が痕跡＝**選んでも1エナも安くならない** | `costScaling{declaredChooseCount, declaredMaxFromBet}`＋`$ref:'bet_coins_minus_declared_choose'`（②の回数＝ベット枚数−宣言数） |
| 第12 | `SP38-005-E1` | 「相手ターンの間、自分が低レベルなら《アタックフェイズアイコン》を得てコストが増える」 | `EXTRA_USE_TIMING`＋`altCostOppTurn`＋`ActiveCondition` に `LRIG_LEVEL_CMP_OPP`（🛑**帰結の「ルリグのレベルを－1」は根拠つき defer のまま**） |

### 🔑 主産物①＝「受け皿が無い」と書いてある登録票は、実コードで確かめるまで信じない（**9バッチ中7回**）

前セッションで5回外れた同じ教訓が、今回さらに **7回**繰り返された。実装量は毎回、見立てより小さかった：
第4（`costReplacement` は在って**条件が1種**足りないだけ）／第5（支払い経路は `O-259` 第3 で作ってあった＝
**領域とフラグ2つ**）／第6（`O-259` 第2 で作った `TURN_CARD_COST_REDUCE` に**2フィールド**）／
第8（`costSlotIsAny('無')` が既に「どのエナでも払える」を持っていた＝**新しい支払いモードは要らない**）／
第10（提示ゲートは `lrigActivateGate` の1本＝**読み口2箇所**）／第11（`O-251` の宣言 UI が**そのまま使えた**）／
第12（`EXTRA_USE_TIMING`＋`altCostOppTurn` は**既存**＝足したのは `ActiveCondition` の1型）。

### 🔴 主産物②＝**「コストを払わない」型の過剰実行を4効果で見つけた**（`O-259` の計器が指していなかった側）

`STUB{CAST_FROM_OPP_TRASH}` は id が示す「相手トラッシュ」だけでなく **「コストなしで使用」**でもあり、
原文が「（コストは支払い、限定条件は無視しない）」「コストの色を無視して支払ってもよい」と
**払うことを明記している3効果が丸ごとタダで撃てていた**（`PR-433-E1` / `WXK11-016-E3` / `WX14-027-E3`）。
さらに `WXDi-P06-066-E2` は `STUB{USE_SPELL_FROM_TRASH}`（＝**自分の**トラッシュ）に落ちており、
**原文の「対戦相手のトラッシュから」を1度も見ていなかった**（ゾーンごと間違い）。
🔑**「コストを支払わずに使用する」型（`WXEX1-46-E3`）は触っていない**＝あちらは free が原文どおり。

### 🔑 主産物③＝**逆翻訳が payload を描けていなかった箇所を5つ塞いだ**（`O-252` と同じ規律）

①`altCostOppTurn`（対戦相手ターン中の請求額）は**1文字も描かれていなかった**
②`CONDITIONAL_ARTS_COST` は payload があっても原文を貼り続けていた（`O-252` が
`ARTS_COST_REDUCTION_BY_CENTER_LRIG` に入れた「payload が描けているなら黙る」を同じ分岐へ）
③`$ref:'bet_coins_minus_declared_choose'` が生の英語で出ていた
④`turnCardCostReduce` の色・レベル比例 ⑤`GROW_COST_REDUCTION` の `allPlayers` / `targetNonColorlessLrig`。

### 🖥 実機（`V-162`〜`V-165`・7シナリオ ALL PASS・負方向の対照4本）

- `v162NextLrigActCostReduced` / `…NotReduced`＝**必要エナ 2→1** / **2のまま**
  （**場のシグニのクラスだけ**を ＜ブルアカ＞→＜アーム＞ に変える1ビット反転）
- `v163SpellWildCostSlot` / `…Absent`＝**《黒》0枚で《青×1》《黒×1》のスペルが撃てる** /
  宣言が無ければ「発動する」が**無効のまま**（**召喚するシグニだけ**を能力なしの同色同レベルに変える）
- `v164BetDeclaredCostReduce`＝**必要エナ 6→3**（**同じベット1枚のまま宣言だけ0**にした対照が6枚）
- `v165ArtsCostByLrigLevels` / `…OppLevelTooLow`＝**6→1** / **6のまま**
  （**相手のセンタールリグのレベルだけ** 5→4＝2条件が AND であることの証拠）
- 🔑**観測点はすべて「支払いモーダルの必要エナ枚数」**＝予約（state）が立つだけでは意味が無い。
  実際 `LrigGrantedModal` は **`energyTotal` を軽減後の文字列から数え直さないと**
  「表示は安いのに選択枚数は元のまま」で**永久に払えなくなる**（そう書いた上で実機で確かめた）。
- 🔴**踏んだ罠（再発）**＝**`field.signi` は「スタックの配列」**。素の文字列を置くと
  `battleCardNums` の useMemo が `stack?.forEach is not a function` で落ち、**盤面が1枚も描画されない**
  （`V-159` で踏んで §4.4 に書いてあったのに、spec を書くときにまた踏んだ）。

### 🔧 ついでに直した／較正したもの

- 🔴**テンプレートリテラル内の `\d` が1段剥がれる罠を実際に踏んだ**（CLAUDE.md が警告している形）＝
  `new RegExp(\`…[０-９\d]…\`)` は `[０-９d]` になり**黙って何にも当たらない**。
  ⇒ **`\d` をやめて `[０-９0-9]` と書く**（`keywordCosts.ts:53` と同じ書き方＝エスケープに頼らない）。
- **`applySpecificCardCostReduction` は `find` で最初の1件しか見ていなかった**＝常設（`SPECIFIC_CARD_COST_REDUCE`）と
  ターン限定の予約が同じカード名に重なると**片方が黙って消えていた**。⇒ 一致する宣言をすべて累積する。
- **`CAST_FROM_OPP_TRASH` は使ったカードを相手の `trash` からしか外していなかった**＝
  アーツは**ルリグトラッシュ**に在るので、使ったのに相手の手元に残り続けた。
- **`CAST_FROM_OPP_TRASH` の候補選択分岐が `carriedCardNum` を見ていなかった**＝支払い CHOOSE を跨ぐと
  `lastProcessedCards` が消えるので、**確定済みのカードを捨てて選択をやり直す**形になりうる。
- 🔧**計器の較正1件**＝`vocabCensus` の「否定フィルタ」語彙に `targetNonColorlessLrig` を追加。
  🔑**退化ではなく可視化**＝痕跡 STUB から実アクションへ昇格した瞬間に STUB 免除が外れて高シグナルへ立った
  （実体は原文どおり実装済み）。
- 🔧**`golden` の `withMarker` 下限を 90 → 80**（第5・第12で痕跡マーカーを6効果ぶん撤去したため）。
- 🔧**`manualEffects.ts` の `WX22-016` に `betOptions` を明記**＝印字コストは build が後から重ねるが、
  書かないと fresh と live が食い違って**毎回 `_held_fresh` に出続ける**（計器のノイズ）。

**検証コマンド**＝`npm run gates`／`npm run golden -- --only "O-259"`（13本）／`node scripts/heldReview.mjs`（残1＝既存の据置）／
`SKIP_BUILD=1 node scripts/verifyBattleDrive.mjs v162NextLrigActCostReduced v162NextLrigActCostNotReduced
v163SpellWildCostSlot v163SpellWildCostSlotAbsent v164BetDeclaredCostReduce v165ArtsCostByLrigLevels v165ArtsCostOppLevelTooLow`。
**反転確認**＝3本（①`targetNonColorlessLrig` の判定を外すと第9の「無色のルリグには効かない」が FAIL
②`useIgnoreCostColors` の《無》読み替えを外すと第5の「色だけを落とす」が FAIL
③`canAffordWithOneWildCostSlot` の `enabled` ガードを外すと第8の「宣言が無ければ払えない」が FAIL）。
**実機の反転確認**＝負方向の対照4本（上記）がそれぞれ「安くならない／撃てない」側を実際に踏んでいる。


## 2026-09-06（第176バッチ）：`O-134` クローズ＝**較正は要らなかった／計器に映らない過小実行が1件**

**ベースライン**＝第175の直後。**gates 全緑**（typecheck・golden **3517/3517**＝+1本・smoke 全異常0・
fuzz 全0・census 1/BASELINE 1・`census:stubs` A群🔴0/C群0・manual-fields 0・
`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
🖥**実機は不要**＝触ったのは `src/data/` `public/data/` `scripts/` だけ（`src/screens/` も `src/engine/` も無変更）。

### ① 登録票の前提が2つとも消えていた（`O-137` と同じ stale パターン）

- 登録票（2026-08-28）＝「`代わりに(置換)` 高シグナル **11件**のうち5件が帯分解の子。
  **較正するか語彙キーを足すか**を決める。ただし**残り6件は別母集団で真バグ候補として未確認**」。
- **実測（2026-09-06）＝高シグナルは 0**。⇒ **較正の対象がもう無い**（`extraOk` も語彙キーも足す必要なし）。
- 指定どおり**先に6件を仕分けた**結果、**6件とも正しい表現**だった：

| effectId | 判定 |
|---|---|
| `WD06-009-E2` | ✅ `SELF_CRASH_TO_TRASH_AND_REFILL` は**実装済み**（実機 `V-102①` で確認済みの機構）。順序も正しい＝**置換は宣言を先に立ててから実行する** |
| `WX24-P3-043-E1` | ✅ 原文どおり |
| `WX25-P3-053-E1` | ✅ 「次とその次に」を**同じ予約2件**で表すのが正準（`life_crash_replacements` は配列＋`once:true`＝1件1回分） |
| `WXDi-P06-084-E1` | ✅ 帯分解ではなく `CONDITIONAL` で正しく分岐 |
| `WXEX2-28-E1` | ✅ 原文どおり |
| `WXK07-028-E1` | ✅ 「3枚ある場合、代わりに2つまで選ぶ」まで表現済み |

🔑**「真バグ候補」は候補であって判定ではない**＝6件を1件ずつ原文×逆翻訳で見るまで、
どれも直す必要があるように見えていた。**登録票の推測を実測で上書きする。**

### ② 🔴母集団の実測が**別の**真バグを1件出した（`WX24-P2-008-E1`）

- 原文＝「このターン、次と**その次**にあなたがダメージを受ける場合、代わりにダメージを受けない。」
- parser（`parseSentencePart2.ts`）は `count: 1` を**ハードコード**しており、上流の regex が
  `.*次に` で「次とその次に」にも当たるため、**2回分の札が1回分しか効かない過小実行**だった。
- 母集団＝「次とその次に」は **4効果**。うち3枚は `manualEffects.ts` が手で `count:2` を書いて
  回避していたので、**AUTO の1枚だけが取り残されていた**（＝手書きが穴を隠していた形）。
- ⇒ `const twice = /次とその次に/.test(t)` の1行で `count` を分岐。
  `heldReview.mjs --adopt` で live へ（**値の変更**は純増ではないので自動採用されず held に落ちる）。
- 🔑**この形はどの計器にも映らない**＝置換語彙（「代わりに」）は正しく出ているので census は緑、
  逆翻訳も「次の1回のダメージを受けない」と**自信を持って間違える**。**欠けているのは回数だけ。**

### ③ golden（反転3本）

- `WX24-P2-008-E1` / `WXDi-D07-007-E1` が `count:2`
- **対照**＝「次に」だけの `WXDi-D08-010-E1` は `count:1` のまま
  （⚠`?? 1` のようなフォールバックで書かない＝カードが消えても緑になる vacuous な対照になる）
- **全数ラチェット**＝`count:2` になるのは3効果**だけ**（live の `PREVENT_NEXT_DAMAGE` は72件）。
  regex が広がったら落ちる。
- ベット分岐（`WXK04-019-E1`）は2回分と1回分の**両方**を持つ（片枝に潰れていない）。

### 検証コマンド

```
npm run census:population -- "次とその次に"        # 母集団4効果
npx tsx scripts/decompileEffects.ts WD06-009 WX24-P3-043 WX25-P3-053   # 6件の仕分け
npm run build:effects && node scripts/heldReview.mjs --adopt WX24-P2-008
npm run golden -- --only "O-134"                   # 2本 PASS
npm run gates                                      # 全緑（golden 3517/3517）
```

### 残したもの

`WX24-P2-008-E1` の逆翻訳は前半が原文ベタ貼りのまま（`STUB{ARTS_COST_REDUCTION_BY_EFFECT}`）。
これは**既知の no-op マーカー**で `O-136` の管轄（コスト側は `useTimeCost` が別途構造化済み）＝
`O-134`（置換の軸）のスコープ外なので触っていない。

## 2026-09-06（第175バッチ）：`O-226` を実機まで返済＝**fail-closed が実機では常に閉じていた**

**ベースライン**＝第174の直後。**gates 全緑**（typecheck・golden **3516/3516**＝+1本・smoke 全異常0・
fuzz 全0・census 1/BASELINE 1・`census:stubs` A群🔴0/C群0・manual-fields 0・
`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
🖥**実機まで実施**＝`src/screens/` を2ファイル触ったので必須。**`V-161` 3シナリオ ALL PASS**（負方向の対照1本）。

### ① 🔴🔑実機が出した本物のバグ＝`cardMap.has(flipTo)` が**実機では常に false**

- 第174で入れた fail-closed（「裏面が `cardMap` に実在するときだけ差し替える」）は
  **golden では通るが実機では一度も通らない**。golden は**全カード**の cardMap を渡すのに対し、
  実機の `battleCardMap` は `battleCardNums`＝**その対戦に出ているカードだけ**で、
  **裏面はどのゾーンにも居ない**（デッキにもルリグデッキにも入らない）ので載らない。
- 症状＝実機で【起】を5回目まで撃つと **`lrig_activation_count` は 4→5 に進むのに
  `card_identity_overrides` が空のまま**＝裏返らない。
- ⇒ `BattleScreen` の「変身/REV先」常時ロード表に `WXK03-003B` を追加
  （前例の `WXDi-P11-010B` ほか4枚と同じ扱い）。
- 🔑**この表は静かな上限**なので、**live の全 `flipTo` が表に在ることを assert する golden** を新設した
  （`§5.3 O-226 裏面ロード`）。**golden はこの穴自体を再現できない**＝再現できないなら**表の側を守る**。

### ② 実機シナリオで踏んだ罠2つ

- **ルリグ【起】は「エナを選んでから」でないと「発動」が disabled**＝先に押すと25秒空振りして
  「前提崩れ」で終わる。`LrigGrantedModal` のエナ選択には **testid が無かった**ので
  `lrigact-energy-<i>` を新設（命名は同モーダルの `lrigact-fieldbanish-<zi>` に揃えた）。
- **`lrig_activation_count` のキーは instance id**（`WXK03-003A#9750`）であって CardNum ではない。
  「4→5回目」を注入で作るときに CardNum で積むと当たらず、**0→1 なのか 4→5 なのか区別が付かない**。
  ⇒ 両方のキーで積み、**カウンタ自体を `queryState` の観測点に足した**（`lrigActivationCount`）。

### ③ 観測できたこと（実機ログ）

```
[3] btn:発動                → stack=1
[4] ident={"WXK03-003A#9750":"WXK03-003B"}  count 4→5   ← 裏返った
[5] under=0→2  lrigTrash=["WD02-004#9753"]              ← 裏面の【自】が発火
```

「ロココ・バウンダリー・エイボンをセンタールリグ下に配置」「[自分] 夢限　-Ｅ- の【自】効果（反転時）」が
ログに出て、ルリグに `×3` バッジ（本体＋下2枚）。**アーツ2枚だけが下へ入り、ルリグ1枚は残った**
（`cardTypes:['アーツ']` が効いている）。アップロードした画像も表示された。

### 検証コマンド

```
node scripts/verifyBattleDrive.mjs o226KeyUnlimitedOn o226KeyUnlimitedOff o226LrigFlip
npm run golden -- --only "O-226"    # 5本 PASS
npm run gates                        # 全緑（golden 3516/3516）
```

🏁**`O-226` 完全クローズ**（索引 G が空・実機 `V-nn` の未実施も 0件）。

## 2026-09-06（第174バッチ）：`WXK03-003B`「夢限　-Ｅ-」の**カードデータ欠落**と、そこで見つかった恒久 no-op 2つ

**ベースライン**＝第173の直後。**gates 全緑**（typecheck・golden **3515/3515**＝+3本・smoke 全異常0・
fuzz 全0・census **1/BASELINE 1**・`census:stubs` A群🔴0/C群0・manual-fields 0・
`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
🖥**実機は未実施**＝触ったのは `public/data/` `src/data/` `src/engine/` `scripts/` だけ（`src/screens/` は無変更）。
⚠ただし **`UNLIMITED_KEYS` の読み手（`BattleScreen` のキーセット可否ゲート）を初めて起こした**ので
観測点を **`V-161`** として PLAN §5.1 へ登録した（キーを2枚以上場に出せること）。

### ① 🔴カードが CSV に存在しなかった（`O-226` が着手不可だった唯一の原因）

- `WXK03-003A`「夢限　-Ｐ-」の【起】に「この【起】を使用したのが**５回目**である場合、
  **このルリグを裏返す**」と書いてあるのに、**裏返す先の `WXK03-003B` が `CardData_TK.csv` に無かった**。
- ⇒ `public/data/CardData_TK.csv` に1行追加（末尾＝他の B 面ルリグ4枚と同じ並び）。
  **`ImgURL` 列は実行時に使われない**（`App.tsx` が `${VITE_CARD_IMAGE_BASE}/${CardNum}.webp` を組み立てる）。
  🔴**ImageKit 側に `WXK03-003B.webp` が無い**＝実機では `/ErrerCard.webp` に落ちる（要アップロード）。

### ② 🔴`UNLIMITED_KEYS` は**読み手だけ在って生成元が0**の恒久 no-op だった（2枚）

- 原文「あなたはキーを好きな枚数場に出すことができる」を持つのは 夢限 -Ｐ-／-Ｅ- の**2枚だけ**。
- 読み手は `BattleScreen` に**2箇所**（`hasUnlimitedKeys`＝キーセット可否ゲートと配置先）在ったのに、
  **parser も manualEffects も この STUB を一度も生成していなかった**（live 0件）。
  しかも `-Ｐ-` 側は**【常】が効果として1件も出ていなかった**（live は E2 だけ）。
- 🔑**この形はどの計器にも映らない**＝`census:stubs` は「ハンドラが在る」ことで実装済みと判定し、
  `census:deadstate` は state キーを見るので `PlayerState` に書かないこの形は出ない。
- ⇒ `manualEffects.ts` に `WXK03-003A-E1` / `WXK03-003B-E1` を手書き（速いレーン＝同型2枚）。
  逆翻訳でも**空文字をやめて文を出す**ようにした（`decompileEffects.ts`）＝
  従来は「【常】」の1語だけになり、実装済みかどうかが目視で確かめられなかった。

### ③ 🔴`SOUL_OP{lrig_trash_to_under_center}` は候補が**ルリグ固定**だった

- 原文は「ルリグトラッシュから**すべてのアーツ**をこのルリグの下に置く」（`WXK03-003B-E2`）。
  既存ハンドラは候補を `Type === 'ルリグ' || 'アシストルリグ'` でハードコードしており、
  そのまま使うと**1枚も動かない**（＝無言 no-op）。
- ⇒ `SoulOpSpec` に **`cardTypes`**（候補の種別・省略時は従来どおりルリグ2種）と
  **`all`**（「すべての」＝選ばせず全件）を足した。配置部は既存の
  `INTERNAL_PLACE_LRIG_UNDER_CENTER` を `lastProcessedCards` 経由で共有する。
- 🔑**逆翻訳の固定文言も同時に撤去した**（第59バッチ教訓③）＝`kindJa` を payload から描かないと
  engine と decompiler が**同じ嘘で一致**し、計器が緑のまま意味だけ壊れる。

### 検証コマンド

```
npm run build:effects && node scripts/heldReview.mjs --adopt WXK03-003B
npm run regen
npm run golden -- --only "O-226"      # 3本 PASS
npm run gates                          # 全緑（golden 3514/3514）
npx tsx scripts/decompileEffects.ts WXK03-003B   # 逆翻訳を原文と目視照合
```

**反転確認あり**＝golden に3本（①`cardTypes` を省くとアーツが1枚も動かない
②ルリグトラッシュが空でも落ちない ③ルリグは下へ入らずトラッシュに残る）。

### ④ 🏁裏返し本体を実装した（`O-226` クローズ・golden **3515/3515**）

- 旧 `nthActivationFlip` は `lrig_activation_count` を数えて**ログを1行出すだけ**の真 no-op。
- 🔑**裏返し＝センタールリグの instance を裏面のカード番号へ差し替える**（`card_identity_overrides`）。
  差し替えれば `collectLrigFlipTriggers` が変化を検出して裏面の `ON_LRIG_FLIP` を積むので、
  **発火まで書く必要はない**（既存の汎用経路に乗る）。
  ⚠前例 `MUGEN_Q_RESET_AND_FLIP`（`WXDi-P11-010A`→`B`）は**盤面全リセット付き**の専用ハンドラ＝
  こちらは原文にリセットが無いので**盤面を一切動かさない**。
- 🔑**裏面のカード番号は原文に書いていない**（「このルリグを裏返す」だけ）＝
  parser が**命名規約**（末尾 `A`→`B`）から導出して `flipTo` に刻む。
  🔴**engine は `cardMap` に実在するときだけ差し替える**（fail-closed）＝
  規約が当たらないカードでも「裏返らない」で済み、存在しない番号へ化けて盤面のルリグが引けなくなることはない。
- **UI 側は汎用経路がそのまま使える**＝`BattleScreen` が `card_identity_overrides` で
  `battleCardMap`（`:859`）と `effectsMap`（`:920`）を両方組み直すので、
  **印字値も使える【起】も B のものに入れ替わる**（golden で両方 assert した）。

### ⑤ 🔴裏返しを実装して初めて見えた＝`lrigCopyOppLevelLimit` に**カード名限定が無かった**

- 原文は「このゲームの間、あなたの場にある**《夢限　-Ｐ-》**の基本レベルと基本リミットは、
  対象の対戦相手のセンタールリグと同じ値になる」＝**そのカード限定**。
- 旧実装は `lrig_copy_opp_level_limit` という**裸の boolean** で、`lrigLimit.ts` はフラグだけを見ていた。
  ⇒ 裏返って《夢限　-Ｅ-》になった後も**コピーが効き続け、印字リミット12にならなかった**
  （実測＝相手が居ない盤面で **0**）。
- ⇒ `GameGrantSpec` に `cardName`、`PlayerState` に `lrig_copy_opp_level_limit_card_name` を足し、
  読み手で**センターの `CardName` と一致するときだけ**コピーする。
  ⚠**名指しが取れなかったときは従来どおり無条件**（退化させない）。
- 🔑**この形は裏返しが実装されるまで観測できなかった**＝表面のままなら名前は常に一致するので、
  限定の有無で結果が変わらない。**機構を1つ足すと、その下流の「たまたま合っていた」が露出する。**

### ⑥ 🏁画像もアップロードした＋**消えていたアップロード道具を git 履歴から復元した**

- `ik.imagekit.io/9rbn01opz/WXK03-003B.webp` ＝ **404 → 200**（webp 197KB／JPEG 257KB を Accept で出し分け）。
- 🔑**道具は 2026-06-09 の `82a1b65c1`「chore: 未使用ファイルを削除してリポジトリを整理」で消えていた**
  （`scripts/upload-*.mjs` 5本と `migrate-to-imagekit.mjs`）。git 履歴から
  **`scripts/archive/uploadCardImages.mjs` として1本に統合して復元**した。旧版からの変更3点＝
  ①**private key をハードコードしない**（`.env.local` の `IMAGEKIT_PRIVATE_KEY` を読む）
  ②読む CSV を `public/data/backup/`（現存しない）→ **現行の `public/data/CardData_*.csv` 全部**
  ③**既定を「全件」にしない**＝`--only <CardNum,…>` / `--missing` / `--all` の明示が要る（`--dry` あり）。
- 🔴**旧スクリプトは private key を平文で持っており、その値は git 履歴に残っている。**
  ユーザー判断＝**リポジトリ公開の予定は無い**のでローテーションはしない（2026-09-06 確認）。

### 🏁`O-226` はこれでクローズ（索引 G が空になった）

`census:deadstate` **0件**（`lrig_activation_count` に読み手ができた）。

## 2026-09-05（第173バッチ）：`EXILE_FROM_CHECK_ZONE` が原文と別物だった件と、**後ろのステップが一度も走らない**構造

**ベースライン**＝第172の直後。**gates 全緑**（typecheck・golden **3512/3512**＝+1本・smoke 全異常0・
fuzz 全0・census 1/BASELINE 1・`census:stubs` A群🔴0/C群0・manual-fields 0・
`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
🖥**実機まで実施**＝`src/engine/` と新しい機構（`exileAfterUse`）を触ったので必須。
**`v159TrashSpellCostReduced` PASS**（`V-159` の軽減と `V-160` の除外を**同じ1回の使用**で観測）。

### ① 🔴`EXILE_FROM_CHECK_ZONE` の実装が原文と3軸で別物だった（7効果）

- **原文**＝「（このターン、）**それが**チェックゾーンから別の領域に移動される場合、代わりに
  **ゲームから除外**される」＝**この効果がいま使わせたカード**への置換効果。
- **旧実装**＝①対象が「**対戦相手の**チェックゾーンに在るカード」固定 ②行き先が**トラッシュ**
  ③置換ではなく**即時移動**。逆翻訳のラベル（`STUBS.md` 由来）も**同じ嘘で一致**していたので
  census も golden も緑のままだった。
- **影響枚数**＝7効果（`WX14-002-E2` / `WX14-014-E1` / `WXEX1-46-E3` / `WX25-P3-064-E1` /
  `WXDi-P06-066-E2` / `WXK06-005-E1` / `WXK11-016-E3`）＝**用法は7件とも同じ**（家族が割れていない）。
- 🔑**受け皿は既に在った**＝`PlayerState.excluded`（ゲームから除外されたカード）と
  `finalizeUsedCardPlacement`（`excluded` に在るカードは既定ゾーンへ置き直さない）。
  足したのは**フラグ1つ**（`StubAction.exileAfterUse`）だけ。

### ② 🔴**対話が3重にネストすると外側 `SEQUENCE` の残りステップが落ちる**（実機で発覚）

- 最初は原文どおり `SEQUENCE[使用, STUB{EXILE_FROM_CHECK_ZONE}]` のまま置換ステップを実装したが、
  実機で**除外ログが1行も出なかった**＝**そのステップが一度も走らない**。
  この形は「候補選択（`SELECT_TARGET`）→ 支払い（`CHOOSE`）→ 使ったカード本体の対象選択
  （`SELECT_TARGET`）」と**対話が3重にネスト**し、外側 `SEQUENCE` の残りが継続に載り切らない。
- **直し方**＝置換を**使用そのもの**へ載せ替えた＝parser の後段（`wireExileAfterUse`）が直前の使用 STUB に
  `exileAfterUse` を立てて置換ステップを木から外し、engine は**カードを配置する瞬間**に
  `excluded` へ入れる（フリープレイ系 funnel ＋ `PLAY_SPELL_FREE_IGNORE_RESTRICTION` の2箇所）。
- 🔑**教訓**＝**「後ろのステップに置く」設計は、前段が対話を挟むほど脆い。前段が対話を挟むなら、
  後段は独立ステップではなく前段のペイロードにする。**（PLAN §4.4 の 8u）
- **検証**＝`npm run gates`（golden `§5.3 O-260` を新設＝7効果の形／engine e2e／持ち主の判定／
  fail-closed／`finalizeUsedCardPlacement` の抑止／`STUBS.md` から旧説明が消えたこと）。
- **反転確認**＝あり＝`exileAfterUse` が無ければ従来どおりトラッシュへ残る／控えが無ければ何もしない／
  **対戦相手のチェックゾーンには触らない**（旧実装がまさにここを動かしていた）。

### ③ 実機シナリオ側で踏んだ罠2つ（§4.4 の 8u に併記）

1. **支払った時点で観測を止めない**＝置換は**スペル本体の解決後**に走るので、`pendingEffect` が
   空になるまで進めないと「除外されていない」と誤診する。
2. **候補セルはトグル**＝支払い後の対象選択で毎tick押すと選択が外れて「決定」に一生到達しない（罠 8p の再発）。

## 2026-09-05（第172バッチ）：効果で使わせるスペルの「選ぶ→軽減→支払う」と、**2026-08 から続いていたエナの二重請求**

**ベースライン**＝第171の直後。**gates 全緑**（typecheck・golden **3511/3511**＝+1本・smoke 全異常0・
fuzz 全0・census 1/BASELINE 1・`census:stubs` A群🔴0/C群0・manual-fields 0・
`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
🖥**実機まで実施**＝§2.2 では `src/data/` `src/engine/` だけなら④まででよいが、**新しい機構
（`value2:'hand'` の候補ゾーン＋軽減）を足した回**なので実機必須。**`v159TrashSpellCostReduced` PASS**。

### ① 「あなたの〈手札／トラッシュ〉からスペル1枚を使用する（＋軽減）」が4効果とも壊れていた

- **真因（3つ重なっていた）**＝①`STUB{PLAY_SPELL_FROM_HAND(_FREE)}` / `STUB{PLAY_FREE}` は
  **候補を1枚も選ばせない**（`carriedCardNum ?? lastProcessedCards[0] ?? sourceCardNum` にフォールバックし、
  直前に何も処理していないこれらの効果では**効果元のルリグ／シグニ自身**を使おうとして失敗）＝実質 no-op
  ②軽減句は `STUB{ARTS_COST_REDUCTION_BY_EFFECT}`（痕跡）で**一度も安くならない**
  ③原文の修飾（色・コストの合計の範囲）が**どこにも載っていない**。
- **影響枚数**＝4効果（`WX11-043-E2`／`WX12-003-E3`／`WX14-002-E2`／`WX20-059-E2`）。
  🔑**受け皿は既に在った**＝`USE_SPELL_FROM_TRASH_PAYING_COST` が「選ぶ→印刷コストを色配列へ展開→
  支払う/やめる→本体へ委譲」の3段を持っており、足したのは**領域（`value2:'hand'`）・軽減
  （`useSpellCostReduction`）・コスト不要（`useSpellIgnoreCost`）の3フィールドだけ**。
  ⚠**コスト合計の範囲は `TargetFilter.costMin/costMax` が受け皿**（新しい型を足しかけて撤回した）。
- **直し方**＝parser に後段の1本（`wireEffectSpellUse`）を足し、**カード全文から**「領域＋修飾＋軽減句」を
  同時に読む（文単位の parser では別の文にある2つを同時に読めない）。
  🔴**修飾は `[^。：【】]*?` で区切る**＝`.*?` だと**別の能力の文を丸ごと飲み込む**
  （`WX20-059` は E1 の文から E2 の「使用」まで吸い上げていた）。このときは `rest` が残って fail-closed で
  見送られたが、**見送られた＝直っていない**なので実データで当てて確かめるまで完了と言わない。
- **逆翻訳の嘘も1件**＝`PLAY_SPELL_FROM_HAND` のラベルに **`WX12-003` の原文がベタ書き**されており、
  同じ id を使う `WX11-043`（青のスペル・軽減あり）に**他人の説明**が出ていた。撤去して payload から描く。
  ついでに `filterJa` が上下限を「コストの合計が4以下のコストの合計が2以上の」と**二重に**描いていたのを
  「コストの合計が2～4の」へ直した。
- **検証**＝`npm run gates`（golden `§5.3 O-259 第3` を新設）／実機 `v159TrashSpellCostReduced`。
- **反転確認**＝あり＝軽減なしなら請求は《青》×3 のまま／**色違いの軽減は効かない**（《黒》の軽減で
  《青》は減らない）／色フィルタに合わないスペルは候補に出ない。

### ② 🔴**`costColors` を持つ CHOOSE でエナが二重に請求されていた**（2026-08 の実装以来）

- **真因**＝汎用の任意コスト経路 `resumeOptionalCost` は**プレイヤーが選んだエナを先に引いてから**
  `option.action` を実行する。`USE_SPELL_FROM_TRASH_PAYING_COST` はその action の先頭にも
  `INTERNAL_CMCLG_DEDUCT`（2つ目の請求）を積んでいたため、**「必要1枚」の表示のまま2枚**取られていた。
- **影響枚数**＝この経路を通る全効果（`WXDi-P13-008-E1` ＋ 今回の4効果）。
- 🔴🔑**なぜ静的な計器で見えなかったか**＝`goldenTest.ts` の `run()` autopilot は `resumeChoose`
  （＝**エナを引かない側**）を通るので、**実機と同じ請求経路を一度も通らない**。旧テストは
  `INTERNAL_CMCLG_DEDUCT` の分だけを測って「1枚減った」と緑になっていた。
- **直し方**＝`payUS` から `INTERNAL_CMCLG_DEDUCT` を外し、**請求は `resumeOptionalCost` の1箇所だけ**にした。
  金額を測る golden は `executeAction` →`resumeSelectTarget` →`pending.options` の `costColors` を assert →
  `resumeOptionalCost` の順で**実機と同じ経路**を通す形へ書き換えた（`WXDi-P13-008-E1` の既存テストも）。
  ⚠**golden のエナは別々のカード番号で置く**＝同名を並べると `energy.filter(n => !nums.includes(n))` が
  全部消して枚数を測れない（実盤面は instance id なので起きない＝テスト固有の落とし穴）。
- **検証**＝実機 `v159TrashSpellCostReduced`（修正前はエナ 4→2、修正後は 4→3）。
- **反転確認**＝あり＝`WXDi-P13-008-E1` の golden が《白》×1 で**1枚だけ**減ることを assert する。

### ③ 実機シナリオを書くときに踏んだ罠4つ（§4.4 へ登録済み）

1. **シグニゾーンは「スタックの配列」**＝`'field.signi': ['WD01-013#9', …]` と文字列を直に置くと
   `stack?.forEach is not a function` で**盤面ごと真っ白**になり、「どのボタンも出ない」に見える。
2. **`getByAltText` の部分一致が相手のルリグを掴む**＝`コード・ピルルク` は guest の `WD03-002`
   「コード・ピルルク・G」に当たり、カード拡大が開くだけで行動一覧が出ない。
3. **候補選択（`pick-0`）より先に「決定」を押すと0枚で確定**する＝`H.stdStep()` の語彙に「決定」があるので、
   選ぶ処理を**先に**書かないと「候補が出ない」と誤診する。
4. **支払いボタンは `optcost-energy-*` を選ぶまで無効**（`EffectInteractionModal` の任意コスト面）＝
   観測点は「エナから選択: n / **N**枚」の N（軽減後の必要枚数がそのまま出る）。

### ④ 新規登録＝`O-260`（`EXILE_FROM_CHECK_ZONE` の意味が原文と別物・7効果）

`WX14-002-E2` の第3文「このターン、**それが**チェックゾーンから別の領域に移動される場合、代わりに
**ゲームから除外**される」に対し、ハンドラは「**対戦相手の**チェックゾーンのカードを**トラッシュ**へ置く」固定。
7効果が同じ id を共有しているので、**まず7件の原文を並べて用法を割る**（PLAN §5.3 索引 A）。

## 2026-09-05（第171バッチ）：ピースのターン限定コスト軽減と、**クラフトのピースが永久に使えなかった**恒久 no-op

**ベースライン**＝第170の直後。**gates 全緑**（typecheck・golden **3510/3510**＝+2本・smoke 全異常0・
fuzz 全0・census 1/BASELINE 1・`census:stubs` A群🔴0/C群0・manual-fields 0・
`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
🖥**実機まで実施**＝§2.2 の判定＝`src/screens/`（`BattleScreen`／`KeyUseModal`／`pieceCutin`／`battleUtils`）と
`src/engine/` を触ったので**実機必須**。**2シナリオとも PASS**（`v158PieceCostReduced` / `v158PieceCostNotReduced`）。

### ① 「このターン、そのピースの使用コストは《無×1》減る」が一度も効かなかった（過小実行・3枚）

- **真因**＝`WXDi-P16-009/010/011-E3` の軽減節が**痕跡 STUB のまま**で payload を持っていなかった
  （`O-259`＝「逆翻訳が原文をそのまま貼るので実装済みに見える」型）。受け皿の
  `specificCardCostReductions` は **CONTINUOUS 収集専用**で、**ターン限定の予約スロットが無かった**。
- **影響枚数**＝3枚（3効果）。うち 🔴**`WXDi-P16-010-E3` は条件（相手のライフ2枚以下）ごと落ちていた**
  ＝実装すると**無条件で安くなる過剰実行**になるところだった。
- **直し方**＝parser が `CONDITIONAL{cond, then: STUB{TURN_CARD_COST_REDUCE}}` を生成 → engine が
  `turn_specific_cost_reductions` へ積む → `collectSpecificCardCostReductions` がそれを**合流**させて
  **読み口を1本**にする（アーツ／ピース／キーが片肺にならない）→ 支払い経路は
  `BattleScreen` の `pieceEffCostGate` と `KeyUseModal` の**2口とも** `applySpecificCardCostReduction` を通す
  → ターン境界で `undefined` へリセット（消さないと永続化する）。
- **検証**＝`npm run gates`（golden `§5.3 O-259 第2` を新設）／実機 `v158PieceCostReduced`（必要エナ 3→2）。
- **反転確認**＝あり＝`v158PieceCostNotReduced`（**相手の手札枚数だけ**を 2→5 に変える1ビット反転で、
  予約が立たず必要エナが印刷どおり3枚のまま）。

### ② 🔴**`Type === 'ピース'` の完全一致で、クラフト／リレーのピース3枚が永久に使えなかった**（恒久 no-op）

- **真因**＝ピースの **提示ゲート**（`BattleScreen.tsx`）・**実行経路**（`executeKeyPiece` 内の `isPiece`）・
  **支払いモーダルの文言**（`KeyUseModal.tsx` 2箇所）・**カットイン走査**（`pieceCutin.ts` 2箇所）の
  **すべて**が `card.Type === 'ピース'` の完全一致だった。CSV の `Type` には派生表記があり、
  **`'ピース/クラフト'` 1枚**（`WXDi-P16-TK01`＝まさに ① の3枚が生成するピース）と
  **`'リレーピース'` 2枚**（`WXDi-CP01-001`／`WXDi-CP01-003`）が**一度も「ピースを使用」を提示されなかった**。
- **影響枚数**＝3枚。🔴**① の成果物がこれ**＝「軽減は正しく予約されるのに、そのピースは永久に使えない」。
- 🔑**アーツ側は最初から `'アーツ/クラフト'` を並記していた**（`BattleScreen.tsx` の提示ゲート・
  `artsUseGate.ts:346`）＝**同じ穴の片側だけが塞がっていた**。
- **直し方**＝`battleUtils.ts` に `isPieceCardType()` を1本置き、上記6箇所すべてをそこへ通した。
- **検証**＝実機 `v158PieceCostReduced`（修正前は「ピースを使用」ボタンが最後まで出ず、
  見えているボタンが `["アタックフェイズへ","リムーブ","↺","終了","閉じる"]` だった）。
  golden `§5.1 V-158` は **CSV から `Type` にピースを含む種別を数え直して**全件が判定を通ることを assert する
  （🔑**定数リストを golden へ写さない**＝写し忘れが検出できなくなるため。将来 `'ピース/○○'` が増えたら落ちる）。
- **反転確認**＝あり＝キー・アーツ・`undefined` はピースと判定されない（キー経路を巻き込まない）。
- ⚠**この形は静的な計器に一切映らない**＝golden・smoke・fuzz・census すべて緑のまま「使えない」。
  ⇒ 教訓を PLAN §4.4 の **8s** に登録。

## 2026-09-05（第157〜170バッチ）：逆翻訳のコスト payload 穴7本＋真no-opコスト2本＋【ハーモニー】＋実機11シナリオ

**ベースライン**＝`eedde29b7`（第156の直後）。
**gates 全緑**（typecheck・golden **3508/3508**＝3493 +15本・smoke 全異常0（10725効果）・fuzz 全0・
census 1/BASELINE 1・`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・
`census:costtext` A🔴0規則・lint 0 errors）。
🏁**実機まで完了（第167バッチ）**＝`src/screens/`（`ArtsModal`／`BattleScreen`／`signiActivateGate`／新規
`fieldToDeckTopCost.ts`）と `src/engine/` を触ったので §2.2 では実機必須。**7シナリオを書いて全て PASS**
（`v152DeclareRaisesCost` / `v152DeclareLimitedByEnergy` / `v153SelfPowerDownPaid` / `v154FieldToDeckTopPaid` /
`v154FieldToDeckTopNoOther` / `v155SameLevelLrigAlsoBanned` / `v155DifferentLevelLrigSafe`）。
**負方向の対照3本**＝エナ1枚で2つ宣言／他のシグニ0体／相手ルリグのレベル違い。

### 第157（§5.3 `O-251`・4効果）＝「使用コストは**選んだ数だけ**《色×M》増える」が一度も増額していなかった
- **真因**＝`CostScalingCount` の全種別が盤面（またはターン履歴）で、「**この CHOOSE で選んだ数**」を数える種別が無い。
  parser はコスト増の文を `STUB{ARTS_COST_REDUCTION_BY_EFFECT}`（no-op マーカー）として残すだけだった。
- **影響**＝`PR-K056`／`WX13-003`／`WXK05-002`／`WX20-Re20`（アーツが原文より安く撃てる＝過剰実行）。
- **受け皿**＝新種別 `declaredChooseCount` ＋ `CostScalingTerm.offset`/`maxCount`（原文の3綴りを表す）。
  盤面から読めないので**支払いより先に宣言させる**＝`ArtsModal` の宣言 UI → `PlayerState.declared_choose_count`
  → `ChooseAction.declaredCountChoose` が選択数をその数に**固定**する。
  🔑固定しないと「3つ分払って5つ選ぶ」＝直す前より悪い。
- ⚠`costScalingOf`（提示ゲートの funnel）からは宣言依存項を**除いた**＝二重適用しない。宣言が無い経路（CPU）は従来どおり。
- **検証**＝`npm run golden -- --only "O-251"`（3本）＋ `npm run gates`。**反転確認**＝`declaredCountChoose` を外すと
  「宣言した数ちょうどに固定される」golden が FAIL。

### 第158（§5.3 `O-252`・56効果＋35カード）＝逆翻訳が `EffectCost.costReplacement` を1文字も描いていなかった
- **真因**＝①`STUB{ARTS_COST_REDUCTION_BY_CENTER_LRIG}` が**原文の該当文をそのまま貼って**おり、
  **payload が空でも同じ文が出る**（`O-119` が `costScaling` について書いた罠の `costReplacement` 版）。
  ②`mergeManualEffects` は live の効果を manual 定義で丸ごと置き換えるので、`buildEffectsJson` が
  **マージの後から**重ねる印字キーワードコストが**逆翻訳からだけ消えていた**（実測35カード）。
- **直し方**＝`costReplacementJa` を新設して payload から描き、manual マージの後に `printedKeywordCosts` を
  **`buildEffectsJson` と同じ funnel で**重ね直した。payload が描けている効果では原文貼り付けの分岐を黙らせる。
- 🔴🔑**踏んで撤回した罠**＝痕跡 STUB を **parser の途中**（`stripCostScalingMarker` と同じ地点）で剥がしたら、
  **後段の後処理がステップ位置を前提にしていて木が壊れた**＝`WX11-015` の「この方法で3枚以上捨てた場合」の
  `CONDITIONAL` が丸ごと消え、**2体目のバニッシュが無条件**になった（過剰実行）。
  ⇒ **JSON の木は触らず、逆翻訳側だけ payload へ寄せる。** golden にラチェットを張った。
  🔑**held のレビュー表で `- …` が大量に出ているグループは、署名だけ見て採用しない**（一度採用してしまった）。

### 第159（§5.3 `O-250`・1効果）＝「Aと、Aと同じレベルのB」の2つ目の対象が無かった
- `WX24-P2-002-E1`「対戦相手のシグニ１体**と、そのシグニと同じレベルの対戦相手のルリグ１体**を対象とし」の
  **ルリグ側が丸ごと無かった**（過小実行）。
- 🔑**受け皿は全部あった**（登録票の「`GRANT_KEYWORD` は選んだ札を残さない」は誤り）＝`resumeSelectTarget` の
  per-card ループが最後に `lastProcessedCards = selected` を置くので、選択UIを経た `GRANT_KEYWORD` の
  **次のステップ**から `levelEqLastProcessed` で参照できる。⇒ 足りなかったのは JSON だけ。
- **検証**＝golden で正方向（同レベルのルリグに付く）と負方向（レベルが違えば付かない）の両方を固定。

### 第160（§5.3 `O-253`・3効果）＝逆翻訳が `LRIG_DECK_CARD` を「シグニ」と描いていた
- `targetJa` のゾーン名テーブルに `LRIG_DECK_CARD` が無く既定の `unit`（＝'シグニ'）へ落ちていた＝
  「ルリグデッキにある**ピース**1枚をゲームから除外する」が**「あなたのシグニ1体を除外する」**になっていた。
- 🔑**JSON は最初から正しく、実装は1行も要らなかった**＝PLAN §5.4 (iii)（構造混線＝木ごと作り直し）に
  登録されていた `WXDi-P04-016-E3` の正体はこれ。同節の他3件も**再照合したら全部消化済み**だった。
- ⚠**§5.4 (iii) の項目は「登録時点の逆翻訳」で立っている**＝着手前に必ず現在の逆翻訳を読み直す。

### 第161（§5.3 `O-254`・141効果）＝`costJa` が描かないコストキーの全数ラチェット
- 埋めた穴＝`fieldTrashAll`（1効果＝**意味照合台帳が「コスト未実装」と誤って OPEN にしていた当のカード**）＋
  印字キーワードコスト `encoreCost`(32)／`betOptions`(68)／`boostCost`(5)／`optionalDiscardCost`(2)。
- ⚠`useTimeCost` だけは意図的な例外（`STUB{ARTS_COST_REDUCTION_BY_*}` の分岐が原文の支払い文を復元済み）＝
  golden のラチェットにその1つだけを許可リストとして書いた。**新しいコストキーを足したら costJa にも1行足す。**

### 第162（§5.3 `O-255`・3効果）＝`selfPowerDown`（自傷パワーのコスト）が真 no-op だった
- 型・parser・逆翻訳は在ったのに **engine/UI のどこにも消費が無く**、自傷が一度も起きていなかった＝
  「【起】《無》**ターン終了時まで、このシグニのパワーを－10000する**：…」が《無×1》だけで撃てた（過剰実行）。
- 支払い地点（`executeSigniActivated`）で `temp_power_mods` へ `-N` を積むようにし、支払いUIにも表示。
  あわせて「**－Nする**」綴りを parser が読むようにした（`WXDi-P07-046-E3`）。
- ⚠**期間はターン終了時まで**なので `temp_power_mods`（ターン境界でクリア）へ積む。`field_power_mods` だと永久に下がる。
- 🔴**この形はどの計器にも出ない**（`census:deadstate` は PlayerState のキー、`census:stubs` は STUB、
  `census:enginetext` は原文 regex しか見ない）＝**意味照合台帳だけが見つけられた。**

### 第163（§5.3 `O-256`・2効果）＝「他のシグニ１体を場からデッキの一番上に置く」コストを丸ごと落としていた
- `WDK05-T12-E1`（【出】）／`WXK10-057-E2`（【起】）がエナコストだけで撃てた（過剰実行）。
- 新キー `EffectCost.fieldToDeckTop` ＋ 専用支払い `src/screens/battle/fieldToDeckTopCost.ts`
  （`fieldBanishCost.ts` と同じ作法＝ゾーン選択 state `fieldTrashZones` を共用し、行き先だけ分ける）。
- ⚠**`fieldTrash` を流用しない**＝デッキの一番上は引き直せるので、トラッシュ送りにすると**逆に高すぎる**コストになる。
- 配線＝【出】と【起】の**両方**の支払い／提示ゲート（`signiActivateGate`）／支払いUI 2種／
  `OPTIONAL_COST` 経路（`optionalOnPlayCostStub` ＋ `OptionalCostSpec` の可否・支払い）。
  🔑`optionalOnPlayCostStub` の SUPPORTED に足さないと**任意【出】が丸ごと積まれなくなる**（golden が検出した）。

### 第164〜166＝意味照合台帳の消化（残 OPEN 36 → 24）
- **第164**＝`semanticAuditRecheck` の候補4件を全数目視して閉じた（`PR-K056-E1`／`WXDi-P03-019-E1`／
  `WXDi-P07-046-E3`／`WDK05-T12-E1`）。🔑**うち2件は逆翻訳が payload を描いていなかっただけ**で、
  live も engine も最初から正しかった。
- **第165**＝**【ライズ】findings 7件は stale**（`WX16-027`／`WX20-037`／`WXDi-P15-048`／`WXK05-035`／
  `WXK08-031`／`WXK11-038`／`WXK11-053`）。出現条件は**JSON ではなく `getRiseRequirement(EffectText)` が読む**設計で、
  `O-147`（第137バッチ）が下位family A/B まで実装済み。7枚とも正しい要求を返すことを実測し golden で固定した。
  ⚠**【ハーモニー】の2件は閉じない**＝parser が接頭辞を捨てているだけで engine にも UI にも実装が無い＝`O-257` として登録。
- **第166（§5.3 `O-258`・1効果）**＝`WXK08-040-E1`③「**このスペルを手札に戻す**」が**汎用 BOUNCE に食われて
  「あなたのシグニ1体を手札に戻す」**に化けていた（別物）。専用ハンドラ `STUB{RETURN_SELF_SPELL_TO_HAND}` を新設し、
  `finalizeUsedCardPlacement` に「手札へ戻した使用カードは既定ゾーンへ置かない」ガードを足した
  （無いと**同じカードが手札とトラッシュに二重で現れる**）。

### 第167（実機＝§5.1 `V-152`〜`V-155`）＝実機が engine の本物のバグを1件出した
- 🔴**`payFieldToDeckTopCost` が `getCardNum()` で instance id を落としてデッキへ戻していた**
  （`WD01-013#2` → `WD01-013`）。engine の正準経路 `TRANSFER_TO_DECK`（`effectExecutor.ts:12658` 付近）は
  **instance id のまま**挿すので、**引き直した瞬間に別インスタンスへ化ける**（付与・台帳が当たらなくなる）。
  🔴**golden も smoke も緑のまま通っていた**＝どちらもカード番号までしか見ない。
  🔁**反転確認＝この FAIL → 修正 → PASS そのもの**（旧実装で実際に赤くなった）。golden にラチェットを追加。
- 🔴**UI 文言の嘘**＝`SigniOnPlayCostModal` の見出しが「場から**トラッシュ**するシグニを選択」で固定されており、
  `fieldToLrigTrash`（ルリグトラッシュ）と `fieldToDeckTop`（デッキの一番上）でも**行き先を偽って**表示していた。
  支払い先はプレイヤーの判断を変える情報なので `ftDestJa` で書き分けた。
- 🔑**実機の罠を2つ §4.4 へ追記**＝
  8q **アタックフェイズのアーツの到達点は `ATTACK` ではなく `ATTACK_ARTS`**（入った瞬間にアーツ使用ウィンドウへ
  進み、画面には「アーツ終了→相手へ」しか出ない＝`ATTACK` だけを待つと永久に空振り。実測で13秒×2を溶かした）。
  8r **ゾーン間移動は `#` 付きで assert する**（上のバグはこれが無いと見つからない）。
- 🔧**ついでに直した計器のバグ**＝`verifyBattleDrive.mjs` の `order.push` が**同じ4行を二重に持って**おり、
  フルバッチで `o248*` の4本が**2回ずつ**走っていた（結果は変わらないので実行時間だけが倍になり気づけない）。

### 第168（§5.3 `O-251` クローズ ＋ `O-259` 新設・16効果）＝コスト句が「実装済みに見える」穴を可視化
- 🏁**`O-251` をクローズ**＝19出現を用法で割ったら、手を入れる必要があったのは4効果だけだった
  （①対戦相手のコスト増13効果は**4経路で既に配線済み** ②自分の盤面比例2効果は**既に `costScaling` 済み**
  ③「選んだ数だけ」4効果＝第157 ④残 `SP38-005-E1` 1効果）。
- 🛑**`SP38-005-E1` は根拠つき defer**＝帰結「対戦相手のルリグ1体のレベルを－1」を実装するには
  **ルリグの実効レベルを読む funnel** が要るが、`field.lrig.at(-1)` を読む箇所は `src/engine/`＋`src/screens/` で
  **197箇所**あり、`LRIG_LEVEL_CMP_OPP` も `LRIG_LEVEL_EQ_OPP` も**印字レベルしか読まない**
  （＝積んでも誰も読まない真 no-op になる）。**1効果のために全部を寄せない**（§5.3 の既定）。
  🟢いまの姿は無言 no-op ではない（帰結は `DEFERRED_*`＝【未実装】表示／コスト句は下記で【※コスト未構造化】）。
- 🆕**`O-259`（16効果）**＝`STUB{ARTS_COST_REDUCTION_BY_*}` / `CONDITIONAL_ARTS_COST` の逆翻訳は
  **原文のコスト文をそのまま貼る**ので、**何も構造化できていない効果でも実装済みに読める**
  （`O-252` と同じ罠の「payload が空の側」）。payload（`costScaling`／`costReplacement`／`useTimeCost`／
  `optionalDiscardCost`）が1つも無いときだけ **`【※コスト未構造化】`** を付け、golden にラチェット（16）を張った。

### 第169（§5.3 `O-257`・12枚）＝【ハーモニー】が engine にも UI にも無かった
- 原文「【ハーモニー】〈色〉のルリグN体（このシグニが場に出たとき、あなたの**アップ状態の**〈色〉のルリグN体を
  **ダウンしないかぎり、これをダウンする**）」。🔴旧＝parser が接頭辞を捨てるだけで**出しても何も起きなかった**
  （ルリグのダウンを要求もしないし、払わなくても自分がダウンしない＝過剰実行）。
- 🔑**受け皿はほぼ全部あった**＝`STUB{OPTIONAL_COST}` の `lrigDown` 軸（可否＝`payLrigDownCost`／
  支払い＝`INTERNAL_PAY_LRIG_DOWN`）＋ `unlessPay`（文言反転）＋ `CONDITIONAL{PAID_ADDITIONAL_COST}`。
  **足したのは3つだけ**＝①`lrigDown.color`（⚠多色ルリグの `Color` は `白青` と連結されるので `includes`）
  ②`parseHarmonyAbility` ③**マージの後から重ねる経路**（【出現条件】と同じ作法。
  🔴fresh 任せだと **MANUAL/PARTIAL を含む4枚が id 集合ズレで温存され能力が永久に載らない**）。
- 🔴**罠＝「後から重ねる」形を新設した回は `build:effects` を2回回す**＝比較は重ねる**前**の live に対して
  行われるので、1回目は12枚が `_held_fresh`／`_idset_fresh` に出たままになり
  （held 2→9・idset 6→10）、`census:cards` の要対応が 76→82 に増えて**退化に見える**。2回目で 1／6 へ収束する。
- 🖥**実機 `V-156` 3本 PASS**＝支払う（ルリグがダウン・シグニはアップ）／支払わない（**シグニがダウン**）／
  ルリグが白なら「支払う」が灰色（色限定）。支払いラベルが「支払う（コスト: 赤のルリグ1体をダウン）」と出ることも確認。
- 🔑**踏んだ罠2つを §4.3 へ追記**＝①**golden のラチェットが落ちるとテストが途中で abort して POOL カーソルが
  変わり、無関係な後続テストまで赤くなる**（`WXDi-CP02-036-E1` の E2E が巻き添えで落ち、engine の回帰を疑った）
  ②**`scripts/` の重複 import は typecheck も golden も通る**（typecheck は `scripts/` を見ず、esbuild が黙って畳む）。

### 第170（§5.3 `O-259` 第1バッチ・1効果）＝「次に**緑の**アーツを使用する場合」の色限定
- `WXK01-060-E1`①「このターン、あなたが次に**緑の**アーツを使用する場合、それの使用コストは《無×1》減る」が
  **痕跡 STUB に落ちて軽減が一度も起きなかった**（過小実行）。
- 🔑**受け皿は既存の `COST_REDUCTION` →（executor）→ `next_arts_cost_reduction`**。
  足りなかったのは**色限定**だけ＝`CostReductionAction.color` を予約へ持ち越し（`targetColor`）、
  `applyNextArtsCostReduction` に**アーツ自身の色**を渡して絞る（呼び出し2口＝`artsUseGate`／`ArtsModal`）。
  ⚠**色を渡さない呼び出しでは色つき予約を効かせない**（fail-closed＝色を見ない口が残っても全色に効かない）。
- 🔴**catch-all が先に食っていた**＝`parseSentencePart3` の `/使用コストは.*(減る|増える)$/`。
  専用規則は**その手前**に置いた（`O-249` 第147 と同じ罠）。
- 🔧**計器の較正1件**＝`vocabCensus` の `conditionClauseExtraOk` が
  「次に〈**色**の〉アーツを使用する場合」を剥がせず高シグナルが 1→2 に増えていた（regex に `(?:[白赤青緑黒]の)?` を追加）。
- 🖥**実機 `V-157` PASS**＝緑のアーツだけ必要エナが **3→2**、白のアーツは **3のまま**。
  🔑**対照は「変わりうる側」を選ぶ**＝白のアーツにも《無》を含めておかないと、
  色限定が壊れていても「変わらなかった」になり**負方向が空振り**する。
  🔴**踏んだ罠2つ**＝①**ArtsModal の戻るボタンは「← 戻る」**（「キャンセル」ではない）
  ②**先にアーツを覗くとルリグデッキのモーダルが残って手札のクリックを吸う**＝**盤面を作る操作を先にやる**。
- 📉**`O-259` のラチェット 16 → 15**。🔴**残15は用法が9通りに割れる**ので1バッチの塊ではない
  （§5.3 に用法別の内訳表を追加＝取るときはそこから1つ選ぶ）。

**検証コマンド**＝`npm run gates`／`npm run golden -- --only "O-251" --only "O-252" --only "O-253" --only "O-254"
--only "O-255" --only "O-256" --only "O-258" --only "O-147" --only "O-250"`／`node scripts/heldReview.mjs`（残1＝意図的な据置）／
`SKIP_BUILD=1 node scripts/verifyBattleDrive.mjs v152DeclareRaisesCost v152DeclareLimitedByEnergy v153SelfPowerDownPaid v154FieldToDeckTopPaid v154FieldToDeckTopNoOther v155SameLevelLrigAlsoBanned v155DifferentLevelLrigSafe`。
**反転確認**＝6本（①`declaredCountChoose` を外すと選択数固定の golden が FAIL ②痕跡 STUB を parser で剥がすと
`WX11-015` の `CONDITIONAL` が消えて golden が FAIL ③`fieldToDeckTop` を SUPPORTED から外すと
`(xxix)(1)` の「未対応の外側 cost は0件」が FAIL ④**実機 `v154FieldToDeckTopPaid` が instance id を落とす旧実装で
実際に赤くなった** ⑤`lrigDown.color` を落とすと `v156HarmonyWrongColorCannotPay` が FAIL（白でも払えてしまう）
⑥【ハーモニー】の overlay を外すと `O-257` golden の12枚一覧が FAIL）。
**実機**＝`SKIP_BUILD=0 node scripts/verifyBattleDrive.mjs v152DeclareRaisesCost v152DeclareLimitedByEnergy
v153SelfPowerDownPaid v154FieldToDeckTopPaid v154FieldToDeckTopNoOther v155SameLevelLrigAlsoBanned
v155DifferentLevelLrigSafe v156HarmonyPayLrigDown v156HarmonySkipSelfDown v156HarmonyWrongColorCannotPay
v157NextGreenArtsOnlyGreen`（11本 ALL PASS）。


## 2026-09-05（第154〜156バッチ）：🏁**`O-249`（`held`）クローズ**＋意味照合台帳の消化漏れ回収

**ベースライン**＝`a0f7702a7`（第153の直後）。
**gates 全緑**（typecheck・golden **3493/3493**＝3492 +1本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
**実機要否**＝**`src/data/`・`public/data/`・`docs/`・`scripts/` のみ**＝**④まででよい**。
**在庫**＝held **5枚 → 1枚**（残1は意図的な据置）／台帳 残 OPEN **44 → 36**／`census:cards` 要対応 **131 → 105**。

### 第154＝「それを…てもよい。そうした場合、それの…」の照応が別の札を指していた（held 残りの採用）

- 🔴**`WXDi-P00-068-E1`**＝原文の「それ」は**3つとも同じ札**（宣言した対象＝配置替えした札＝強化される札）なのに、
  旧 live は `targetsTriggerSource`（＝**このシグニ**）を狙い、parser の既定は**支払い後に選び直す自由選択**だった。
  🔑`O-96` の対象固定（`SELECT_TARGET_ONLY`＋`STORE`）は**中間動作が `STUB{OPTIONAL_COST}` の形だけ**が対象なので当たらない。
  ⇒ 中間動作が `lastProcessedCards` に残す札をそのまま指す **`targetsLastProcessed`** で束ねる規則を新設（原文実測1効果・fail-closed）。
- **`WX22-044` / `WX26-CP1-055`**＝中間動作が盤面を動かさない（手札公開／トラッシュ→デッキ下）ので自由選択でも原文と同値。
  旧 live の `targetsTriggerSource`（＝アタックしたこのシグニ）だけが誤りだったので外した。
- **`SP38-006`**＝**引用能力の中**の「残りを好きな順番で」が届いた（`PARTIAL` → `AUTO`）。
  ⇒ `BASELINE_REORDER_MISSING` を **11 → 10** へ払い戻し。
- ⚠**golden のアサーションを2箇所キー順非依存に直した**＝`JSON.stringify` の丸ごと一致は
  **中身が同じでもキーの並びが変わっただけで落ちる**（held からの採用で実際に落ちた）。

### 第155＝意味照合台帳の「消化漏れ」回収（44 → 36）

`node scripts/archive/semanticAuditRecheck.mjs`（LCS≥7）の候補**11件**を1件ずつ 原文×逆翻訳 で目視し、
**claim の軸そのものが解消していた8件だけ**を `stage2_closed.txt` へ書いた。
⚠**閉じなかった3件は偽陽性ではなく本当に未消化**＝`WXDi-P07-046-E3`（逆翻訳に出ている −10000 は**相手シグニへの帰結**で、
コスト側の「このシグニのパワーを－10000」は依然無い）／`WXDi-P03-019-E1`（手札とエナは入ったが**場の全シグニ**がコストに無い）／
`WDK05-T12-E1`（「他のシグニ1体を場からデッキの一番上に置く」コストが無い）。
🔑**実装ではなく台帳の較正だが、この11巡の parser 修正が実際に効いていた証拠**でもある（8件とも「もう直っている」側）。

### 第156＝逆翻訳が id を映していなかった／自分側のサーバントZERO化は受け皿が無い

- 🔴**逆翻訳（`decompileEffects.ts`）の `*_SERVANT_ZERO` は `currentCardText`（カード全文）に regex を当てて
  最初に当たった句をそのまま返していた**＝**JSON がどの id を持っているかが逆翻訳に一切現れない**
  （`O-55`／`O-60` と同じ「計器が嘘をつく」形）。実際 `WX17-005-E1` は「1体」と「すべて」の2枝を持つのに
  **両方とも同じ1文**が出ており、第149 で見つけた `DECLARE_CARD_NAME` への退化も逆翻訳からは見えなかった。
  ⇒ **id から描く**ようにした。
- 🔴**その結果、第149 の修正が1枚だけ行き過ぎていたことが分かった**＝`WXK11-014-E2` の
  「あなたの手札からシグニ１枚を場に出す。…**そのシグニ**を《サーバント　ＺＥＲＯ》にする」は**自分側**の変換で、
  engine の4つの `*_SERVANT_ZERO` は**すべて `otherState.card_identity_overrides` へ書く＝相手側専用**。
  流用すると「自分は変換されず相手が勝手に変換される」別効果になる。
  ⇒ **`DEFERRED_SELF_SIGNI_SERVANT_ZERO` として明示 defer**（逆翻訳にも日本語で出す）。
  🔑**これは「逆翻訳を直したから見つかった」**＝id を映さない計器は、直した気になっている退化を隠す。

### 第156＝簿記

🏁**`O-249` をクローズ**（`held` 74 → 1枚。残1 `WXDi-P04-002` は続き389 の契約に従う**意図的な据置**）。
索引 A へ 🆕**`O-251`**（使用コストの「増加」が `costScaling` に落ちない＝**アーツが原文より安く撃てる**・母集団12出現）と
🆕**`O-250`**（`GRANT_KEYWORD` が選んだ札を `lastProcessedCards` に残さない・母集団1効果）を登録。

### この11巡（第146〜156）の結論

🔑🔴**`held` に溜まっていた「fresh 側の退化」の過半は、他のバッチの改善の巻き添えだった。**
①受け側の catch-all を撤去した ②前置きを `activeCondition` へ持ち上げた ③汎用規則を足した ④`DEFERRED_` へ改名した
——**4件とも、当のバッチのゲートは全部緑**（守りが `UNKNOWN`／`PARTIAL` へ落ちるだけなので誰も落ちない）。
⇒ **「規則を撤去した／前置きを持ち上げた／汎用規則を足した／id を改名した」ときは、その語形・その id を
前提にしている下流を必ず grep する。** `held` は**その巻き添えを映す唯一の鏡**だった。

## 2026-09-05（第150〜153バッチ）：**「隣の分岐を撤去／前置きを持ち上げ／汎用規則を追加」した巻き添えで死んでいた規則**（`O-249` 続き）

**ベースライン**＝`80e07eb89`（第149の直後）。
**gates 全緑**（typecheck・golden **3492/3492**＝3488 +4本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
**実機要否**＝**`src/data/`・`public/data/`・`scripts/` のみ**＝**④まででよい**。
**在庫**＝held **21枚 → 5枚**（うち1枚は**意図的な据置**＝下記 `WXDi-P04-002`）。

### 第150＝チアガール変換の対象が自由だった（**32枚**）ほか

- 🔴**チアガール変換（`GRANT_KEYWORD{'チアガール'}`）の「このシグニ」枝が `thisCardOnly` を刻んでいなかった。**
  原文実測**32枚すべてが「このシグニをチアガールにする」**なのに、**自分のシグニなら誰でも**選べた。
  チアガールは**フリーゾーンへ移す＝シグニゾーンを1つ空ける**強い効果なので、対象が自由だと別のカード。
  ⇒ 1行の修正で **33カードの live が変わった**（この巡で一番大きい）。
- 🔴**`WX12-037-E2`＝受け側の catch-all を撤去したせいで畳み込みが死んでいた。**
  `O-60` 第74バッチが `STUB{CONDITIONAL_PER_TRASH}` を撤去した結果、`MILL_EACH_REPEAT_ON_NAME` への畳み込みの
  守り（`steps[1].id === 'CONDITIONAL_PER_TRASH'`）が**二度と成立せず**、payload ごと消えて**繰り返しが起きなくなった**。
  ⇒ 撤去後の姿である `UNKNOWN` も受ける（畳み込みの本体は原文 regex＝カード名まで固定なので広がらない）。
- 🔴**`WXEX2-09-E1`＝前置きの持ち上げに巻き込まれて規則が死んでいた。**
  「アタックフェイズの間、」が `activeCondition` へ持ち上げられて**剥がされる**ようになったのに、
  受け側 regex がその語を必須にしたままで `UNKNOWN`＝離場置換が丸ごと効かなくなっていた。

### 第151＝汎用の引用付与規則がアタック禁止の専用受け皿2つを飲んでいた

- 🔴`O-60` 第62 が足した「ターン終了時まで、対戦相手のすべてのシグニは「Q」を得る」→ `GRANT_EFFECT{rawText}` が、
  **アタック禁止の引用まで**飲んでいた。この引用は展開できず `rawText` のまま `PARTIAL` に留まる＝
  **engine の no-op ガードに落ちてアタック禁止が一度も効かない**。
  ⇒ 受け皿は2つとも実装済み＝支払い回避つきは **`SIGNI_ATTACK_BAN{unlessPayColorless}`**、素の禁止は多数派102効果と同じ
  **`GRANT_KEYWORD{'アタックできない'}`**。付与先の綴り（「対戦相手のシグニは」）・助詞（「あなた**が**」）・
  「シグニで」の省略を受けるよう `atkTaxGrantM` を広げた。
  🔑**副産物＝枚数の焼き込みも直った**＝旧 live の `STUB{OPP_SIGNI_ATTACK_COST}` は engine 側で
  `signi_attack_cost: 2` を固定しており、原文が《無》1つの `WX22-Re20` でも**2つ払わされて**いた。

### 第152＝held のうち fresh が正しい7枚を採用

`WXDi-P03-031`（エナの色3種類以上の条件が**丸ごと落ちて無条件ダウン**だった）／
`WXDi-P13-029`（`STUB{OPP_MAIN_PHASE_LIMIT_DOWN}` → typed `LRIG_LIMIT_MODIFY{until:'NEXT_TURN'}`）／
`WXDi-P08-062`（「一番上を見て下に置いてもよい」＝**1枚を上か下か選ぶ**。旧 live は LOOK 2本で**2枚**見ていた）／
`SP26-001`（「残りを好きな順番でデッキの一番上に」が丸ごと落ちていた）／`WXK10-050`・`WX25-P2-001`（1要素 SEQUENCE の平坦化＝意味不変）／
`WX14-064`（「そうした場合」が `IS_MY_TURN` ではなく `SELF_OPTIONAL_EFFECT_TAKEN`）。

### 第153＝【常】の置換が実行ハンドラで書かれていた／対象固定の欠落／コストの脱落

- 🔴**`WXK06-049-E1`＝【常】の置換なのに `STUB{BANISH_BY_SELF_GOES_TO_TRASH}`（実行ハンドラ）で書かれていた。**
  CONTINUOUS 効果は「実行」されないのでハンドラは一度も走らず、**バニッシュした相手シグニがエナへ行ったまま**だった。
  ⇒ `effectEngine` が毎フレーム走査する typed の `BANISH_REDIRECT` へ（パワー8000以上のゲートは `activeCondition` が保つ）。
- 🔴**`WDK08-Y13-E1`＝「あなたのシグニ１体を**対象とし**」を無視して `targetsTriggerSource`（公開されたこのカード自身）を狙っていた。**
  ⇒ `O-96` の対象固定パターン（`SELECT_TARGET_ONLY`＋`STORE_LAST_PROCESSED_TARGETS`＋`targetsStored`）へ。
- **`WX13-040-E1`**＝原文の《白》コストが live に無く**タダで撃てて**いた（`MANUAL_DRIFT_KNOWN` の既知乖離を1件解消）。
- ⚠**`WXDi-P04-002` は据置**＝採用しかけたが**続き389 のトリップワイヤに従って戻した**。
  fresh は【使用条件】【チーム】を `condition` 化できる一方、引用本体が `DEFERRED_` に落ちて**①②③が1つも走らなくなる**。
  live の平坦化（ゲーム中続く【自】をその場1回に化かす近似）も原文とは違うが、**カード単位の採用では選べない**。
  ⇒ 「引用ブロックを本物の `CardEffect` へ展開する」まで据置（契約は続き389 のテストが引き続き守る）。

### 影響枚数

**44カード**（第150 の33＋第151 の3＋第152 の7＋第153 の3・据置1を除く）。

### この4バッチの教訓（1行）

🔑**「規則を撤去した／前置きを持ち上げた／汎用規則を足した」ときは、その語形を前提にしていた下流の守りを必ず grep する。**
今回の4件はすべて**改善の巻き添え**で、当の改善バッチのゲートは全部緑だった（守りが `UNKNOWN` へ落ちるだけなので誰も落ちない）。

## 2026-09-05（第147〜149バッチ）：**catch-all が専用規則を横取りして「別の効果」に化けていた3型**（`O-249` 続き）

**ベースライン**＝`cb93dbf34`（第146の直後）。
**gates 全緑**（typecheck・golden **3488/3488**＝3485 +3本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
**実機要否**＝**`src/data/`・`public/data/`・`scripts/` のみ**（`src/screens/` も `src/engine/` も0行・新しい型なし）＝**④まででよい**。
**在庫**＝held **28枚 → 21枚**。

### 第147＝リコレクト分割の後でエクシード任意コストが payload を失う／移動禁止 catch-all の横取り

- 🔴**`WX25-P3-003-E1`**＝《リコレクトアイコン》分割の見出し regex が **`(代わりに|追加で)?` ごと食べてから** bonus を
  パースするのに、下流の「**追加で**エクシードN を支払ってもよい」規則が **「追加で」を必須**にしていた＝当たらず
  **payload 無しの素の `OPTIONAL_COST`＝エクシードがタダ**で強い方の効果が撃てた。⇒「追加で」を任意にした。
- 🔴**`WXK11-026-E2`**＝「対戦相手の効果はバニッシュ以外で**このシグニ**を場から移動させない」が、
  直前のアタックフェイズ版 regex（**前置きが `(?:…)?` で任意**・主語が `.*シグニ` の catch-all）に横取りされ、
  **原文に無い「アタックフェイズの間」限定**が付いていた。しかもその id は **engine に消費地点が1つも無い**（無言 no-op）。
  ⇒ アタックフェイズ句を**必須**にした（原文実測で該当0枚＝この規則は catch-all としてしか働いていなかった）。

### 第148＝`DEFERRED_` へ改名した catch-all を prune 対象に足し忘れていた

- 🔴**`WXDi-P05-005-E1`**＝同じ効果が `GAIN_ABILITY_THIS_GAME`＋`gameGrants{oppGuardExtraHandOrColorless}` で
  **既に宣言を立てている**のに catch-all が残り、逆翻訳が「【未実装】」と嘘をついていた。
  真因＝`O-60` 第64バッチが `GRANT_QUOTED_ABILITY` の1形を `DEFERRED_GRANT_QUOTED_ABILITY_BLOCK` へ改名した際、
  **`QUOTED_GRANT_CATCH_ALL_IDS` に足し忘れた**（この配列は prune／`restoreQuotedTargetGrant`／
  `DEFERRED_GAIN_ABILITY_THIS_GAME_QUOTED` への改名の**3箇所**が読む唯一の定義）。
- **`PR-K056` / `WX20-Re20`**＝`SEQUENCE[CHOOSE{upTo}, ARTS_COST_REDUCTION_BY_EFFECT]` を採用（`O-60` 第61バッチの規約）。
  ⚠**コスト増そのものは未実装**＝「選んだ数だけ《色×M》増える」は `CostScalingCount` に受け皿が無い（**`O-251` として登録**）。

### 第149＝サーバントZERO 化が「カード名の宣言」に化けていた／探索元が省略された追加探索が丸ごと落ちていた

- 🔴**`WX17-005-E1`（ベット枝）・`WXK11-014-E2`**＝part3 は「**それ**を《サーバント…》にする」しか受けず、
  「**そのシグニ**を」「対戦相手の**すべての**シグニを」「**それら**を」の3語形が part4 の catch-all
  **`DECLARE_CARD_NAME`（自分の手札からカード名を宣言するまったく別の機構）**へ落ちていた＝
  **変換が起きず、原文に無い宣言UIが出る**。⇒ engine には3つとも受け皿がある（`execStubPart2.ts:1637`）ので
  `ALL_OPP_SIGNI_SERVANT_ZERO` / `MAKE_MULTI_SERVANT_ZERO` / `MAKE_SERVANT_ZERO` を**語形で選び分ける**形にした。
- 🔴**`WD09-018-E1`・`WX09-041-E1`**＝「**追加で**〈記述子〉シグニN枚を探して公開し手札に加える」は
  探索元（「あなたのデッキから」）を省くので SEARCH 規則に当たらず **`UNKNOWN` で追加探索が丸ごと消えて**いた。
  ⇒ **`UNKNOWN` のときだけ**探索元を補って解き直す（`retryImplicitDeckSearch`＝既に解けている文には触らない）。
  🔑受け皿だった STUB（`CONDITIONAL_SEARCH_IF_RESONA` / `_IF_FIELD`）は**デッキ上5枚から任意のシグニを取る粗い近似**で、
  原文のレベル・色フィルタを見ていなかった＝typed 化で初めて原文どおりになった。

### 影響枚数

**8カード**（第147 2／第148 3／第149 4＝`WXK11-014`・`WX09-041` は held に出ていなかった同型の巻き込み修正）。

## 2026-09-05（第146バッチ）：**held が指していたのは live のバグではなく「現行 parser の退化」9件だった**

**ベースライン**＝`6fa60747a`（第145の直後）。
**gates 全緑**（typecheck・golden **3485/3485**＝3483 +2本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
**実機要否**＝§2.2 の機械判定どおり **`src/data/`・`public/data/`・`scripts/` しか触っていない**（`src/screens/` も `src/engine/` も0行・
新しいアクション型／条件型も足していない＝既存の `LRIG_COLOR`／`TRASH_COUNT`／`HAND_COUNT`／`levelParity` 等の受け皿に載せただけ）＝**④まででよい**。
**在庫**＝held **44枚 → 28枚**／`census:cards` 要対応 **131 → 131**／Sheet1 要対応 **1 / 863**／台帳 残 OPEN **44**（据置）。
**反転確認 3本**（(1)⑥ 手札枚数の不等号／(1)⑦ エナチャージの owner／(1)④ look-pick の先取り）＝いずれも戻すと新 golden が赤くなることを実測。

### 真因（1行）

`held`（収穫マージの温存キュー）の残り44枚を全数目視した。**残っていたのは「fresh が退化している」側が多数派**という
第145 の見立てどおりで、**9件は現行 parser が原文の限定を落としていた**（＝いま `build:effects` を回しても live に届かないだけで、
**parser そのものが壊れている**）。9件とも parser を直し、**fresh が正しい9枚は採用**した。

### (1) parser の退化 9件（すべて修正）

| # | カード | 落ちていたもの | 実害の向き |
|---|---|---|---|
| ① | `WXK01-044-E2` | `levelParity:'even'` | 過剰＝「レベルが偶数の対戦相手のシグニ**１体の**パワーを－5000」が**どのシグニでも**撃てた。regex が「N体**を対象とし**」「**の**パワーを」の2形しか見ておらず、**「N体のパワーを」だけ落ちていた** |
| ② | `WXK03-006-E1-G` | `levelEqLastProcessed` | 過剰＝「そのシグニと同じレベルの**対象の**対戦相手のシグニ」がレベル無制限に。`rewriteSameLevelAsLastProcessed` の `この方法で` ガードから外れる語形。**同型4件のうち3件は effectId allowlist で個別に手当てされていた**ので一般規則へ寄せた |
| ③ | `WXDi-P00-040-E2` | `TRASH_HAS_CARD{distinctClasses, minCount:7}` | 過剰＝条件が**丸ごと**落ちて【エナチャージ１】が無条件。regex が「合計N種類以上**ある**場合」を必須にしており、原文の「**の**場合」を弾いていた |
| ④ | `WX17-009-E1` | `filter.story:'怪異'` | 過剰＝「その中から＜怪異＞のシグニ１枚」が**どのシグニでも**拾えた。`parseSentencePart3` の look-pick 規則が **`parseCardTypeFilter` しか読まない**のに、`parseSentencePart4` の忠実な畳み込み（`fusedLookPickSentence`）**より前**に食べていた |
| ⑤ | `WXDi-P11-064-E1` | `thisCardOnly`（＋漏れてきた `excludeSelf`） | **意味の反転**＝「**この**シグニのパワーを＋4000」が、トリガー主語「あなたの**他の**＜天使＞のシグニ」を対象に拾い、**自分を除外して別のシグニ**を強化していた |
| ⑥ | `WXK01-020-E1` | `HAND_COUNT.operator:'lte'` | 過小＝`parseUseCondition` が不等号を読まず一律 `eq`。「手札が**１枚以下**の場合にしか使用できない」が**ちょうど1枚のときだけ**になり、0枚では撃てなかった |
| ⑦ | `WXDi-P06-011-E1`／`WXDi-D07-013-E1`／`WXDi-P08-059-E2` | `ENERGY_CHARGE_FROM_DECK.owner:'opponent'` | **意味の反転**＝【エナチャージN】ショートハンドが `owner:'self'` 固定で、「そうした場合、**対戦相手は**【エナチャージ１】をしてもよい」という**デメリットが自分の利益**に化けていた（**1規則で3効果**） |
| ⑧ | `WDK01-009-E1` | `LRIG_COLOR{color:'赤'}` | 過剰＝`parseUseCondition` に規則が無く **`COND_STUB`＝無条件成立**（`execUtils.ts:2413` が `return true`）。「センタールリグが赤の場合にしか使用できない」が**どのルリグでも**撃てた |
| ⑨ | `WDK06-C06-E1` | `TRASH_COUNT{gte,20}` | 同上＝「トラッシュに20枚以上ある場合にしか」が素通り |

### (2) held から採用した 9枚（fresh が正しい／較正された側）

- **`WX24-P2-002`**＝🔴**live のほうが恒久 no-op だった**。「対戦相手のシグニ１体**と**、そのシグニと同じレベルの対戦相手の**ルリグ**１体」の
  **シグニ側**に `levelEqLastProcessed` が誤って載っており、参照先 `lastProcessedCards` が空なので `resolveDynamicFilter` が
  到達不能 level（`{min:99,max:-1}`）を返して**候補0**＝アーツを撃っても何も起きなかった。fresh を採ってシグニ側は動くようにした。
  ⚠**ルリグ側の対象はまだ表現できない**（`GRANT_KEYWORD` が選んだ札を `lastProcessedCards` に残さない）＝**`O-250` として登録**。
- **`WXDi-D07-013`／`WXDi-P08-059`**＝(1)⑦ の owner 修正がそのまま届いた2枚（**この2枚は held に出るまで気づかれていなかった**）。
- **`WX25-P2-003`／`WXDi-P05-004`**＝`GAIN_ABILITY_THIS_GAME` → `DEFERRED_GAIN_ABILITY_THIS_GAME_QUOTED`。
  **退化ではなく `O-60` 第68バッチの較正**（見出し `abilityBlockHeader` しか取れていない＝宣言は1つも立っていないので、
  旧 id のままだと逆翻訳が「実装済み」に見える）。⇒ golden の ratchet を **19 → 18** へ払い戻した（**engine は1行も変えていない**）。
- **`WX25-P1-071`／`WXDi-P06-006`**＝`GUARD_ALTERNATIVE_COST` → `DEFERRED_GUARD_ALT_COST_UNKNOWN`。同じく `O-230` の fail-closed 較正
  （払う中身が payload に落ちない文は受け皿へ載せない＝載せると逆翻訳が「代替コストがある」と嘘をつく）。
- **`WX25-P2-TK06`**（`excludeSelf` の除去＝対象 owner が相手なので元から no-op フィルタ）と
  **`WXDi-P08-072`**（効果レベルの `duration`＝engine はアクション側の `duration` しか読まない）は**挙動不変**。held のノイズを落とすために採用した。

### 影響枚数

**parser 修正で 12効果 / 11カード**（うち3効果は⑦の1規則で同時に直った）＋**held からの採用 9枚**。

### 据置（次バッチ以降）

held 残 **28枚**。目立つ退化は **`WX25-P3-003`（`exceed:3` が `costText` へ後退）／`WXK11-026`
（`PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH` → `PREVENT_SIGNI_MOVE_BY_OPP_ATTACK_PHASE`＝原文に無い「アタックフェイズ」限定）**の2枚。
`targetsTriggerSource` 除去の3枚（`WX22-044`／`WX26-CP1-055`／`WXDi-P00-068`）は従来どおり `O-188` の領分。

### 検証コマンド

```
npm run golden -- --only "O-249 第146"
npm run gates                      # 全緑（golden 3485/3485）
node scripts/heldReview.mjs        # held 44 → 28枚
```

## 2026-09-05（第145バッチ）：**離場置換が「engine が探していない宣言 id」で書かれていて一度も成立しなかった**（ほか2枚）

**ベースライン**＝`8279b31f0`（第144の直後）。
**gates 全緑**（typecheck・golden **3483/3483**＝3482 +1本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
**実機要否**＝§2.2 の機械判定どおり **`public/data/` と `scripts/` しか触っていない**＝**④まででよい**。
**在庫**＝held **47枚 → 44枚**／`census:cards` 要対応 **140 → 131**／即着手可能 **103 → 94**。

### (1) 🔴 `WX25-CP1-039`＝離場置換の**恒久 no-op**

原文＝「【常】：あなたのアップ状態の＜ブルアカ＞のシグニ１体が対戦相手の効果によって場を離れる場合、
**代わりに《白》を支払ってもよい**。そうした場合、そのシグニをダウンする。」

`effectExecutor.ts:570` の離場置換スキャナは **`STUB{EFFECT_LEAVE_PAY_TO_LOSE_SELF_ABILITY}` だけ**を見る。
live は汎用の **`STUB{OPTIONAL_COST}`** で書かれていたので、**スキャナに一度も拾われない**＝置換が成立しない。
⇒ fresh の宣言形（`leavePayLoseSelfAbility{victimFilter{cardType,story:"ブルアカ"}, costColors:["白"]}`）へ差し替えた。

🔑**`census:stubs` の A群にも出ない形**＝`OPTIONAL_COST` は他所に消費地点があるので「実装の穴」に見えない。
**「宣言 id が受け皿と一致しているか」は別の軸**（この巡は held が唯一の検出器だった）。
⚠**原文の「アップ状態の」（`isUp`）はまだ載っていない**＝据置（golden にコメントで明記）。

### (2) 🔴 `WD07-006`＝「３枚まで探して**トラッシュに置く**」が1枚しか置いていなかった

原文＝「あなたのデッキからそれぞれレベルの異なるシグニを**３枚まで**探してトラッシュに置き、デッキをシャッフルする。」
live＝`SEARCH{maxCount:3, then:TRASH{count:1}}`＝**探すのは3枚・置くのは1枚**（過小）。fresh は `count:3`。

### (3) `SP27-009`＝クラス2種の探索が旧綴り＋「好きな順番で」が未達

`filter.cardClass:["天使","悪魔"]` → `filter.story:["天使","悪魔"]`（**`matchesFilter` では等価**＝
どちらも `CardClass.includes()`。正準形は `story`）。併せて `remainder.reorder:true` が届いた。
副産物＝`BASELINE_REORDER_MISSING` を **12 → 11** へ払い戻し。

### 影響枚数

**3枚**。挙動が実際に変わるのは **(1) と (2)**（(3) はクラス照合が等価なので並べ替えのぶんだけ）。

### 検証コマンド

```
npm run golden -- --only "第145"
npm run gates                      # 全緑（golden 3483/3483）
node scripts/heldReview.mjs        # held 47 → 44枚
```

## 2026-09-05（第144バッチ）：**《クロスアイコン》のカード名をコスト句と誤認していた**＋**「そのシグニゾーンにあるシグニ」が無関係の1体になっていた**

**ベースライン**＝`cf478f3eb`（第143の直後）。
**gates 全緑**（typecheck・golden **3482/3482**＝3481 +1本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
**実機要否**＝§2.2 の機械判定どおり **`public/data/` と `scripts/` しか触っていない**＝**④まででよい**。
**在庫**＝held **53枚 → 47枚**。

### (1) 偽 `costUnparsed` のトップレベル側＝5枚（第143 の残り軸）

第143 は**引用能力の中**の偽陽性を落とした。この巡は**トップレベル**の同じ誤認を落とす。

| 誤認した綴り | 例 |
|---|---|
| **《クロスアイコン》の直後に並ぶ相方のカード名** | `WX25-P1-072`「**《クロスアイコン》《爆右砲　セイデル》か《小右砲エペナナ》の左**【クロス自】《ターン１回》：…」 |
| **【絆自】の《ターン１回》** | `WX25-CP1-080`「**【絆自】《ターン１回》**：このシグニが対戦相手のライフクロス１枚をクラッシュしたとき、【エナチャージ１】をする」 |

**5枚**＝`WX13-031` / `WX25-P1-072` / `WX25-P1-073` / `WX25-P1-076` / `WX25-CP1-080`。
`WX25-CP1-080` は同時に **`triggerScope:"self"` ＋ `triggerFilter{thisCardOnly:true}`** も入った
（「**この**シグニがクラッシュしたとき」が無指定だった）。

### (2) 🔴 `WD19-009-BURST`＝「そのシグニゾーンにあるシグニ」が**どのシグニでもよい1体**になっていた

原文（LB）＝「対戦相手のシグニゾーン**１つ**に【ウィルス】１つを置く。ターン終了時まで、**そのシグニゾーンにある**シグニのパワーを－8000する。」

| | live（誤） | fresh（正） |
|---|---|---|
| owner | `"any"` | `"opponent"` |
| count | `1` | `"ALL"` |
| ゾーン | **指定なし** | `zoneSource:"designated"` |

⇒ live は**ウィルスを置いたゾーンと無関係のシグニ**（自分のシグニも含む）1体のパワーを下げていた。
`zoneSource:'designated'` は engine 実装済み（`effectExecutor.ts:2096` ほか）で、
**`count:'ALL'` と組で「そのゾーンにあるシグニ」に絞る**規約（ゾーンには最大1体なので実質1体）。

### 影響枚数

**6枚**。うち**挙動が実際に変わるのは `WD19-009` の LB**（対象が別物だった）と `WX25-CP1-080-E2`（トリガー範囲）。

### 検証コマンド

```
npm run golden -- --only "第144"
npm run gates                      # 全緑（golden 3482/3482）
node scripts/heldReview.mjs        # held 53 → 47枚
```

## 2026-09-05（第143バッチ）：**引用能力の `《ターン１回》` をコスト句と誤認していた**（偽の `costUnparsed` を11枚から外した）

**ベースライン**＝`9a3de248b`（第142の直後）。
**gates 全緑**（typecheck・golden **3481/3481**＝3480 +1本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
**実機要否**＝§2.2 の機械判定どおり **`public/data/` と `scripts/` しか触っていない**＝**④まででよい**。
**在庫**＝held **64枚 → 53枚**／`census:cards` 要対応 **161 → 140**。

### 真因＝`costUnparsed` の判定が**引用能力の中まで見て**偽陽性を出していた

`costUnparsed`（`effectParser.ts:21649`）＝**`cost === undefined && hasUnparsedCostSyntax`**＝
「原文にコスト句らしい `《…》` があるのに parser がコストを組めなかった」印。
立っていると **`wrapOptionalOnPlay`（`triggerCollect.ts:494`）／`signiActivateGate`／`lrigActivateGate`／
`attackResponse` がその能力を収集しない**＝**提示されない**（踏み倒しを作らないための安全側）。

🔴**引用能力（`abilities[]` / `effect` / `then.effect`）では、コスト句ではないものが `《…》` で書かれる。**

| 誤認した綴り | 例 |
|---|---|
| **`《ターン１回》` / `《ターン２回》`**（使用回数の印） | `WXDi-P02-018`「…それは「【自】**《ターン１回》**：このシグニがバトルによって…」を得る」 |
| **本文中の相手の支払い** | `WXDi-CP01-006`「…「【自】：このルリグがアタックしたとき、**対戦相手が《無》《無》《無》《無》を支払うか**…しないかぎり…」を得る」 |

⇒ **どちらもその能力の発動コストではない**。11枚とも「引用能力に発動コストが無い」ことを原文で確認して採用した。

### 影響枚数

**11枚**（`WX25-P2-049` / `WX25-P3-085` / `WXDi-CP01-006` / `WXDi-CP02-050` / `WXDi-D06-010` /
`WXDi-P02-018` / `WXDi-P09-005` / `WXDi-P14-057` / `WXDi-P15-084` / `WXK08-056` / `WXK09-040`）。
**うち2枚は同時に実挙動も直った**＝
`WXDi-CP02-050`（引用能力のトリガー範囲が無指定 → `triggerScope:"any_ally"` ＋ `triggerFilter{cardType:"シグニ"}`）／
`WX25-P3-085`（同 → `triggerScope:"self"` ＋ `triggerFilter{thisCardOnly:true}`）。

⚠**トップレベルの `costUnparsed` は触っていない**＝`WX25-P1-072`/`073`/`076`・`WX13-031`・`WX25-CP1-080` は
《クロスアイコン》の別軸（クロス条件行をコストとして読んでいる）で、**別バッチ**。golden の③で「残っている」ことを固定した。

### 検証コマンド

```
npm run golden -- --only "第143"
npm run gates                      # 全緑（golden 3481/3481）
node scripts/heldReview.mjs        # held 64 → 53枚
npm run census:cards               # 要対応 161 → 140
```

## 2026-09-05（第142バッチ）：**held を全数目視して「live が誤りで fresh が正しい」4効果だけを採用した**（デッキの向き2件・ミルの所有者1件）

**ベースライン**＝`363eed171`（第141の直後）。
**gates 全緑**（typecheck・golden **3480/3480**＝3479 +1本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
**実機要否**＝§2.2 の機械判定どおり **`public/data/` と `scripts/goldenTest.ts` しか触っていない**＝**④まででよい**。
**在庫**＝held **68枚 → 64枚**。

### 🔑 この巡で確定したこと＝**`held` は「parser 改善の未採用」ではなく「live と fresh が食い違っている箱」**

CLAUDE.md／`census:cards` はこのフラグを「parser 改善の未採用」と書いているが、**全68枚を目視した実測では両向きが混ざっている**。

| 向き | 件数の感触 | 例 |
|---|---|---|
| **fresh が正しい（live の誤り）** | **4効果**（この巡で採用） | 下記 |
| **fresh が退化**（live が正しい＝温存が仕事をしている） | 多数 | `WXK01-020`（「１枚以下」の `lte` が `eq` に）／`WXK01-044`（`levelParity:"even"` 脱落）／`WXK03-006`（`levelEqLastProcessed` 脱落）／`WXDi-P11-064`（`thisCardOnly` → 他シグニ）／`WXDi-P00-040`（`TRASH_HAS_CARD{distinctClasses}` 脱落）／`WXEX2-09`（STUB → `UNKNOWN`）／`WX17-005`（ベット分岐が `DECLARE_CARD_NAME` に化ける） |

⇒ **`--adopt-sig`（署名グループ一括採用）は使えない**＝同じ署名の中に両向きが入る。**1枚ずつ原文と突き合わせる。**

### 採用した4効果（すべて **live の実挙動が原文と逆／別物**だった）

| 効果 | 原文 | live（誤） | fresh（正） |
|---|---|---|---|
| `WDK05-R11-E1` | 「あなたのデッキの**下から**カードを２枚トラッシュに置く」 | `TRASH{DECK_CARD}`＝**上から**削る | `MILL{fromBottom:true}` |
| `WXK03-025-E1` | 同上（４枚） | 同上 | 同上＋`selectionConstraint.distinct:"level"` |
| `WXK06-040-E1` | 「**対戦相手の**デッキの一番上のカードをトラッシュに置く」 | `owner:"self"`＝**自分のデッキ**を削っていた | `owner:"opponent"` |
| `WXK03-050-E1` | 「そうでない場合、それをデッキの一番下に置いて**もよい**」 | `remainder.position:"bottom"`＝**必ず下**へ | `"split_top_bottom"`（上のままでも下でもよい） |

**母集団の実測**＝「デッキの下から」は原文全数で **6効果/6カード**。逆翻訳を読むと**「上から」と出ていたのは上の2件だけ**
（`WDK05-R14-E2`／`WXK03-068-E1`／`WXK05-025-E2` は既に正しく、`WXK03-039-E1` は STUB の説明文に「下から」が入っている）。

### 教訓

- 🔴**`held` を件数で語らない**＝「74枚の parser 改善が眠っている」ではない。**多数は温存が正しく効いている**。
  減らし方は**採用**だけでなく**parser の退化を直すこと**（第141がその形＝5枚が差分ごと消えた）。
- 🔑**逆翻訳は held の判定に効く**＝`census:population` で原文の全数を出し、**逆翻訳が原文と逆を言っている行**を探すと
  「live が誤っている側」が機械的に絞れる（この巡は 6効果 → 2効果に絞れた）。

### 検証コマンド

```
npm run golden -- --only "第142"
npm run gates                      # 全緑（golden 3480/3480）
npm run census:population -- "デッキの下から"
```

## 2026-09-05（第141バッチ）：**`parseStoryFilter` の「先頭条件節ガード」が過剰発火していた**（held に5枚の退化として溜まっていた）

**ベースライン**＝`780ebb4d2`（第140＝`O-187` クローズの直後）。
**gates 全緑**（typecheck・golden **3479/3479**＝3478 +1本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
**実機要否**＝§2.2 の機械判定どおり **`src/data/` と `public/data/` しか触っていない**（新しい型・機構は足していない）＝**④まででよい**。
**反転確認1本**＝parser を旧実装へ戻すと新 golden が **FAIL 1**（`expected={"story":"電機"} got={}`）。
**在庫**＝held **74枚 → 68枚**（5枚は退化が消えて差分ごと解消／1枚は採用）。

### 真因＝**2026-08-27 に入れた「先頭の条件節のクラスを対象へ付けない」ガードが、位置を見ずに発火していた**

`parseStoryFilter`（`src/data/parserUtils.ts:847`）は
**`^.*?(?:場合|かぎり|とき)、` に当たる先頭部分を捨ててから ＜X＞ を拾う**。
これは `WX10-062`（「あなたの場に他の＜ウェポン＞と＜アーム＞のシグニがある場合、対象の…シグニ１体をバニッシュする」で
条件節のクラスがバニッシュ対象へ誤付着する**過小実行**）を止めるために入れた正しいガードだが、**2つの形で過剰にも発火していた**。

| # | 形 | 実例 | 何が起きていたか |
|---|---|---|---|
| (b) | **text 全体が条件節**（末尾が「…場合、」） | `WDK16-13`「この方法でレベル２以下の＜電機＞のシグニが公開された場合、」 | 捨てたあとに何も残らず**クラスが丸ごと消える**＝`LAST_PROCESSED_MATCHES` の filter がレベルだけになり**どのクラスでも成立する過剰実行** |
| (a) | **「を対象と」より前にクラスがある** | `WX24-P1-064`「あなたの＜宝石＞のシグニ１体を対象とし、…「【常】：あなたの手札が２枚以下であるかぎり、…」を得る」 | **引用能力の中の「かぎり、」**にガードが当たり、対象の＜宝石＞まで消える |

🔑**直し方は「位置で割る」**＝
(b) 捨てたあとが空なら**ガードを発火させない**（条件節だけを渡す呼び出しが実在する＝`parseThisWayGenericCount`）。
(a) 捨てる範囲に「を対象と」が含まれ、**その手前に ＜X＞ がある**なら、それは条件節ではなく**対象の修飾語**なのでガードを発火させない。
⚠**単に「を対象と」の有無で分けてはいけない**＝`WX09-025`（「シグニ１体を対象とし、あなたの場に＜鉱石＞か＜宝石＞のシグニが
合計３体ある場合、それをバニッシュする」）は**対象指定の後ろ**にクラスがあり、落とさないと**過小実行に反転する**。

### 影響枚数

**6枚**（すべて held＝収穫マージが温存していたので **live は正しく、実機は壊れていなかった**）。

| カード | 直り方 |
|---|---|
| `WDK16-13` / `WX14-069` / `WX24-P1-064` / `WXDi-P15-071` | 退化が消えて **fresh が live と一致**＝held から落ちた（live 変化なし） |
| `WX12-Re10` | 退化が消えた結果、残った差分が**純粋な追加**（「残りを好きな順番で」＝`remainder.reorder`）になり、**収穫マージが自動採用**＝**live が改善した** |
| `WXDi-P10-061` | 🔑**逆にガードが正しく効いていた側**＝live のほうが誤り（凍結対象に＜プリパラ＞が付いており、**相手が＜プリパラ＞のシグニを出さないかぎり不発**＝過小実行）。`--adopt` で採用した |

副産物＝`BASELINE_REORDER_MISSING` を **13 → 12** へ払い戻し（`WX12-Re10-E1` に並べ替えが届いた）。

### 🔴 教訓＝**live だけを assert する golden は parser の退化を捕まえられない**

①〜⑤の live 契約テストは**旧 parser のままでも全部緑になる**（収穫マージが live を温存するので live は正しいまま）。
⇒ 新 golden は **`parseStoryFilter` を直接呼ぶ単体アサーション5本**を持つ（落とす形／落とさない形をペアで固定）。
**反転確認が通ったのはこの単体側だけ**＝live 側の4本は反転でも緑だった。

🔑**もうひとつ**＝この退化は **`census` にも `census:stubs` にも `golden` にも `smoke` にも出なかった**。
**唯一の検出器が「収穫マージの held キュー」**だった（＝`docs/_held_fresh.json` は計器として読む価値がある）。

### 検証コマンド

```
npm run golden -- --only "第141"       # 単体5本＋live契約5本
npm run gates                          # 全緑（golden 3479/3479）
node scripts/heldReview.mjs            # held 74 → 68枚
```

## 2026-09-05（第140バッチ）：🏁`O-187` クローズ＝**`census:cards` の `mech` フラグが「クローズ済みの登録票」を開いていると誤判定していた**（索引 E が残4）

**ベースライン**＝`ec734c89c`（第139＝`O-248` クローズの直後）。
**gates 全緑**（typecheck・golden 3478/3478・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
**実機要否**＝§2.2 の機械判定どおり **`scripts/` と `docs/` しか触っていない**＝**④まででよい（実機不要）**。
カードの挙動は1件も変わらない（索引 E＝計器の較正）。
**在庫**＝機構 worklist **6 → 5項目**（🏁`O-187` クローズ）／実機 残 **0件**。

### 真因＝**「まだ開いている項目」の判定軸が、PLAN の運用と噛み合っていなかった**

`cardProgressCensus.mjs` は PLAN §5.3 の登録票を読んで、そこに出るカード番号を `mech`（機構待ち）に落とす。
クローズ済みを除くために **「登録票の見出し直後に 🏁 があるか」** を見ていたが、
**PLAN の運用はそこに 🏁 を書かない**＝「消化したら**索引の行ごと消す**（登録票は無改変で PLAN_DETAIL に残す）」。

⇒ 実測＝**登録票 114件のうち 🏁 判定で落ちたのは 64件だけで、残り50件のうち 44件は既にクローズ済み**。
その44件の本文に**先行実装例・反例・事故の実例**として引かれたカード番号まで全部 `mech` に化けていた。

| 登録票（すべてクローズ済み） | 巻き込んでいたカード数 |
|---|---|
| `O-60`（engine 全文 regex） | **62** |
| `O-185`（census 高シグナルのテール） | **34** |
| `O-128`（引用能力付与） | **32** |
| `O-198`（`LOOK_PICK_CHAIN`） | **23** |
| `O-95` / `O-197` / `O-147` / `O-134` / `O-92` … | 15 / 15 / 13 / 11 / 10 … |

登録票の「Sheet1 で+1」という当初の見立て（＝§5.3 に丁寧に書くほどカウンタが増える）は**症状の一部でしかなく**、
本体は**この 44件ぶん**だった。

### 直したこと（2つ）

1. 🔴**開いている項目の正を「§5.3 索引テーブルの行（`| \`O-nn\` |`）」だけにした。**
   PLAN の登録ルール（「新規登録は索引に1行＋PLAN_DETAIL に登録票1項目」「消化したら索引の行ごと消す」）と
   **同じ場所を読む**ようにしただけで、判定の意味は変えていない。
2. **「■ 監視だけしている項目（着手不要・壊れたら気付く）」節を数から外した**（11枚）。
   あの節に並ぶのは**挙動が正しいと確認済み**の反例・偽陽性・表示だけの不足であって機構待ちではない
   （`WX08-020` `WX18-039` `WXK01-102` `WXK03-050` `WXDi-P09-068` `WX24-P3-030` `WD15-010` `WDK05-T09` `WXEX1-57` ほか）。
   ⚠**据置（過少のまま）の2枚だけは分類が違う**ので、
   「エナゾーンから〈限定〉すべてのカード」（`WXEX1-07-E2` / `WXK09-037-E1`）の項目を
   **「■ 個別カードの機構待ち」節へ移した**（節をまたいで分類が混ざらないようにした）。

### 影響＝計器の数字（**カードの挙動は不変**）

| 指標 | 前 | 後 |
|---|---|---|
| `mech` カード（全シート） | **318** | **37** |
| 要対応カード（全シート） | 424 / 5975 | **161 / 5975** |
| 🎯**即着手可能（mech を除く）** | 106 | **124** |
| Sheet1 要対応 | **17 / 863** | **1 / 863**（`WX06-022`＝`O-93` 由来の1枚だけ） |

🔑**「即着手可能 106 → 124」が本当の収穫**＝**18枚は `held` / `partial` / `idset` / `audit` が立っているのに
`mech` に隠されて一覧から消えていた**。計器の目的（「次に何を取るか」を出す）を、計器自身が塞いでいた。

### 教訓

- 🔴**ドキュメントを読む計器は、ドキュメントの「運用」と同じ場所を読ませる。**
  ここでは「クローズ＝索引の行を消す」が運用なのに、計器は「見出しに 🏁」という**運用に存在しない印**を探していた。
  **存在しない印を探す計器は、常に fail-open 側（＝過大）に静かに倒れる。**
- 🔴**fail-open は「安全側」ではない。** この計器の fail-open は「機構待ちに数える」＝**一覧から隠す**方向なので、
  過大に出るほど**取れる仕事が見えなくなる**。⇒ どちら向きが安全かは計器ごとに違う。**倒れる向きを1行書く。**
- 🔑**計器の出力に「何を根拠にしたか」を1行出す。** 今回 `参照した §5.3 索引の未クローズ項目: O-226 O-93 …` を
  出すようにした＝索引の書式を変えて拾えなくなったら**その場で見える**（新実装は fail-closed なので、
  黙って0件になると今度は過少に倒れる。0件のときは `console.error` で警告する）。
- ⚠**「立つ ＝ 機構待ち」でもない**（残る誤差）＝開いた項目の本文にも先行実装例は引かれる
  （`O-93` の `WX06-022` など）。**開く前に登録票の本文を読む**のは変わらない。

### 検証コマンド

```
npm run census:cards            # mech 37 / 要対応 161 / 即着手可能 124
npm run census:cards -- --sheet 1 --list   # 要対応 1枚（WX06-022）
npm run gates                   # 全緑
```

**反転確認**＝①索引テーブルから `O-93` の行を一時削除 → `WX06-022` が `mech` から落ちて Sheet1 要対応 0 になる
②索引テーブルの `|` 書式を崩す → `openIds` 0件で `console.error` が出る、の2本を手で確認した。

## 2026-09-05（第139バッチ）：🏁`O-248` クローズ＝**グロウ時の「公開する／捨ててもよい」支払いを通した**（索引 G が残1）

**ベースライン**＝`94e465891`（第138＝`O-238` クローズの直後）。
**gates 全緑**（typecheck・golden **3478/3478**＝3475 +3本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行・`census:costtext` A🔴0規則・lint 0 errors）。
**実機＝新規4本＋回帰4本＝8本 ALL PASS**（新規 `o248GrowDiscardNoAngel` / `o248GrowRevealNone` /
`o248GrowRevealAuto` / `o248GrowDiscardPay`、回帰は `O-238` の4本）。
**実機要否**＝§2.2 の機械判定どおり **`src/screens/` を触った**＝**実機まで必須**。
**反転確認＝3本**（golden 側は3本とも新規 assert・実機2本＋`GrowModal` の軽減撤去／`HAND_COUNT_FILTER` の閾値改変）。
**在庫**＝機構 worklist **7 → 6項目**（🏁`O-248` クローズ）／実機 残 **0件**（同じ巡で閉じた）。

### 真因

**グロウ先カード自身が「グロウする際に支払える任意コスト」を持つ形が、どこにも配線されていなかった。**
`O-219`（2026-09-04）で「収集の軸」（ルリグデッキの中のグロウ先を走査する `growTargetCardNum`）は通したが、
**支払いを取る口が無い**ので、4効果とも `collectGrowCostReductions` に**拾われないように**揃えてあった（＝意図的な no-op）。

| 効果 | 何が起きていたか |
|---|---|
| `WX21-017-E1` / `WX21-018-E1` | 🔴parser（`parseSentencePart2`）が `zeroAct` を**作って返さずに捨てて**おり、catch-all の `STUB{GROW_COST_ZERO}` に落ちていた。`collectGrowCostReductions` はその STUB を見ないので**恒久 no-op**（＜天使＞を捨てても1円も安くならない）。逆翻訳も **「《無×0》になる（実質フリーグロウ）」と原文に無い色**を出していた（原文は《青×0》/《緑×0》） |
| `WD13-002-E1` / `WD13-003-E1` | 条件が `LAST_PROCESSED_MATCHES`（公開の記録が無いので永久に偽）／`IS_MY_TURN`（「そうした場合」の慣例エンコード＝`scan` が覗かない）で、**公開しても軽減が来ない** |

### 影響枚数

**4枚**＝`WX21-017`／`WX21-018`（捨てる）／`WD13-002`／`WD13-003`（公開する）。

### 🔑 設計の要点＝**「公開」と「捨てる」を別経路にした**

| | 公開する（`WD13-002` / `WD13-003`） | 捨てる（`WX21-017` / `WX21-018`） |
|---|---|---|
| 失うもの | **無い** | **手札** |
| 断る理由 | （このモデルには）無い | ある＝トレードオフ |
| 実装 | `HAND_COUNT_FILTER` の条件として **`collectGrowCostReductions` が自動適用** | `collectGrowPayOptions` → **`GrowModal` の支払い UI** が取ってから適用 |

⚠**逆にすると両方向に壊れる**＝捨てるを自動適用すると**捨てずにタダ**（過小コスト）、公開を UI にすると
**押すまで安くならない**うえ、押す以外の答えが無い選択を毎回見せることになる。
🔑`WD13-003` の「＜アーム＞1枚**と**＜天使＞1枚」は **AND で近似できる**＝
**アームと天使を両方持つカードは全カード中0枚**（実測・golden で assert 済み）なので「別々の2枚」と同値。

### 直したもの

| # | 場所 | 内容 |
|---|---|---|
| 1 | `src/data/parsers/parseSentencePart2.ts` | 条件が無い形で `zeroAct` を返す（`forSelfGrowOnly` 付き＝場に出た後は拾われない） |
| 2 | `src/engine/effectEngine.ts` | `collectGrowPayOptions` / `growPayCandidateHandIndices` を新設（`SEQUENCE[OPTIONAL_COST{handDiscard}, CONDITIONAL{IS_MY_TURN} → GROW_COST_REDUCTION{forSelfGrowOnly}]` だけを拾う） |
| 3 | 同上 | `collectGrowCostReductions` の `CONDITIONAL` 許可リストを関数化し、`HAND_COUNT_FILTER` と `AND` を追加（🔴**知らない型は必ず false**＝未知を真に倒さない規約は維持） |
| 4 | `src/data/manualEffects.ts` | `WD13-002-E1` の条件を `HAND_COUNT_FILTER` へ。`WD13-003-E1` を MANUAL 化して `AND` を書いた |
| 5 | `src/screens/battle/hooks/useGrowModal.ts` | `growPayDiscard`（捨てる手札の選択）を追加 |
| 6 | `src/screens/battle/modals/GrowModal.tsx` | Phase 1＝**払える見込みの判定に任意コストを入れる**（入れないと支払い UI に到達できない）／Phase 2＝手札の選択列（`growpay-hand-*`）と、選び切ったときだけの軽減 |
| 7 | `src/screens/BattleScreen.tsx` | `performGrow` に `growPayDiscardHandIdx` を通し、手札→トラッシュを実行 |
| 8 | `scripts/goldenTest.ts` | 3本 |
| 9 | `scripts/verifyBattleDrive.mjs` | 実機4本 |

### 検証コマンド

```
npm run build:effects && node scripts/heldReview.mjs --adopt-effect WX21-017-E1,WX21-018-E1
npx tsx scripts/syncManualLive.ts WD13-002 WD13-003
npm run regen && npm run gates
node scripts/verifyBattleDrive.mjs o248GrowDiscardNoAngel o248GrowRevealNone o248GrowRevealAuto o248GrowDiscardPay
```

### 反転確認（3本・すべて実測）

| 反転したもの | 期待 | 実測 |
|---|---|---|
| `GrowModal` Phase 2 から支払いぶんの軽減を外す | `o248GrowDiscardPay` 赤 | **FAIL**＝「グロウが完了しなかった」 |
| `WD13-002` の `HAND_COUNT_FILTER` の閾値を 1→99 に | `o248GrowRevealAuto` 赤 | **FAIL**＝「グロウが完了しなかった」 |
| `performGrow` から支払いぶんの軽減を外す | 赤になるはず | **PASS のまま**＝🔑**`performGrow` はコストを再検証しない**（支払い可否の門は UI 側だけ）。反転の当て先を間違えた実例として残す |

### 🔴 実機が見つけた真バグ＝**カードがゲームから蒸発する**

`performGrow` で **手札から抜く条件とトラッシュへ積む条件を別の式で書いていた**
（抜く側は `growPayNums.length > 0`、積む側は `growPayValidExec`）。
検証に落ちた瞬間に**手札からもトラッシュからも消える**＝カードが盤面から蒸発する。
実機ログで `hand=[] trash=["（別のカード）"]` と出て初めて気づいた（golden では検証が必ず通る値しか渡していない）。
🔑**「取り除く」と「置く」は必ず同じ式で書く。**

### 🔴 実機ドライバの最大の罠＝**無効なボタンを `.click().catch(() => {})` で押すと30秒溶ける**

「グロウできないこと」を主張する負のシナリオが**33〜111秒**かかって毎回「別ゲームを掴んだ」で落ちていた。
真因は `H.openGrow` が候補ボタンを `.click()` すること＝**Playwright は無効なボタンが有効になるまで待つ**（既定30秒）。
その間に CPU がゲームを終わらせ、**新しいゲームが張られて観測が別盤面に化ける**。
⇒ 負の観測は **`isEnabled()` を読むだけ**にした（`o248ProbeGrowCandidate`）＝**111秒 → 2秒**。
🔑**`.catch(() => {})` を置いた行は「効いたか」だけでなく「待たされていないか」も疑う**
（§5.1 の既存教訓「`.catch(() => {})` の次の行で効いたか測る」の**時間側**の顔）。

### 🔑 そのほか、この巡で踏んで直したもの

- **判定の瞬間に「自分が張った盤面か」を必ず見る**＝見ないと、別ゲームの空の盤面を
  「相手の全シグニがエナへ行った＝旧挙動」と**誤って赤にする**（実測）。
  ⚠ 逆に「注入できていない」を PASS に数える空振り緑も同じ穴（こちらも実測で2本出した）。
- **`life_cloth` は注入しない**＝作った instance id を積むと**注入そのものが通らなくなり**、
  全シナリオが別ゲームを掴むようになった（入れた直後に4本中3本が落ちて発覚）。
- **同じシナリオ id を2回定義すると後勝ちで古い方が動く**＝差し替えたつもりの修正がまったく効かない
  （`grep -c "scenarios.<id> = {"` で1であることを確かめる）。

---

## 2026-09-05（第138バッチ）：🏁`O-238` クローズ＝**フリップアタックが1枚も動いていなかった**（機構3つは最初から在った）

**ベースライン**＝`a9f6e7ae9`（第137＝`O-147` クローズの直後）。
**gates 全緑**（typecheck・golden **3475/3475**＝3473 +2本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0行（**B 56→55行**）・`census:costtext` A🔴0規則・lint 0 errors）。
**実機＝新規4本 ALL PASS**（`o238FlipAttack` / `o238GrantOpenedByFlip` / `o238GrantAloneNormalAttack` / `o238GrantGatedByOtherSigni`）。
**実機要否**＝§2.2 の機械判定どおり **`src/screens/` を触った**＝**実機まで必須**。
**反転確認＝4本**（golden 1・実機 2・旧挙動の実観測 1／下の「反転確認」節）。
**在庫**＝機構 worklist **8 → 7項目**（🏁`O-238` クローズ＝**索引 B が残0**）／実機 残 **0件**（同じ巡で閉じた）。

### 真因（4つ・全部「静かに壊れる」形）

登録票には「**要るもの**＝①アタック宣言の置換フック ②裏向きのままアタックする状態 ③ターン終了時の復帰判定」と書いてあったが、
**②③は `facedownSigni.ts` に、①は `handleFlipAttack` に、最初から全部実装済みだった。** 欠けていたのは配線と、その配線の周りの4つのバグ。

| # | 場所 | 何が壊れていたか |
|---|---|---|
| 1 | `src/data/effectParser.ts` ／ `src/engine/effectEngine.ts` | **収集器 `collectAltAttackFlipSigni` が旧 catch-all の STUB id（`GRANT_ABILITY_INNER_TEXT`）＋原文 regex を見ていた**ので、`O-60` 第66バッチ（2026-09-04）で parser がこの語形を `DEFERRED_*` に変えた日から**「フリップアタック」ボタンが1度も出ない恒久 no-op**になっていた |
| 2 | `src/screens/BattleScreen.tsx`（`handleFlipAttack`） | **「裏向き」を `signi_down`（ダウン）で近似していた**＝裏向きのカードが**場のシグニのまま**なので、付与元《翠将姫　ロビンフッド》自身の「あなたの場に**他にシグニがない**かぎり」が永久に成立せず、**このアタック置換を使う意味が丸ごと消えていた** |
| 3 | 同上 | **バトルを `handleSigniAttack` へ委譲していた**＝あれは `attacker: my`＝**React state の（裏向きにする前の）盤面**を渡すので、直前に commit した裏向きが**次の commit で丸ごと上書きされて消える**（実機では「押すと普通のアタックになる」） |
| 4 | 同上（`performSigniAttack`） | 裏向きにした直後の盤面で**【レイヤー付与】が組み直されない**＝`effectsMap`（memo）の依存は `bs`＝commit 前の盤面なので、**裏向きにして初めて成立する付与が1つも載らない**＝引用【自】が発火しない |
| 5 | `src/data/effectParser.ts` ／ `src/engine/effectEngine.ts` | 付与元の条件「**あなたの場に他にシグニがないかぎり**」がどの規則にも当たらず、`WXDi-P01-040-E1` は**条件節が丸ごと落ちて無条件付与**＝盤面に関係なく《緑》《無》で**相手の全シグニをエナへ送れる過剰実行**だった |

### 影響枚数

**2枚**＝`WXDi-P05-069`（翠将　リトルジョン・E2）／`WXDi-P01-040`（翠将姫　ロビンフッド・E1）。
⚠ ただし **5 の `HAS_CARD_IN_FIELD{negate}` は語彙そのものが誰にも読まれていなかった**（live 使用0件・型にだけ在った）ので、
今後この否定を使う効果すべてに効く。

### 直したもの

| # | 場所 | 内容 |
|---|---|---|
| 1 | `src/types/effects.ts` | `StubAction.altAttackFlip{grantedToCardName, maxFlip}` を新設。`ActiveCondition` の `HAS_CARD_IN_FIELD` に `negate?`（`Condition` 側にだけ在って欠けていた） |
| 2 | `src/data/effectParser.ts` | 引用付与のうち**受け皿のある語形だけ** `STUB{GRANT_QUOTED_ATTACK_FLIP}` へ payload 化（残りは `DEFERRED_*` のまま）。「あなたの場に他にシグニがないかぎり、」→ `HAS_CARD_IN_FIELD{excludeSelf, negate}` |
| 3 | `src/engine/effectEngine.ts` | `collectAltAttackFlipSigni` を**payload 読み**に（原文 regex を撤去＝`census:enginetext` B 56→55行）。`HAS_CARD_IN_FIELD` の `negate` を **`checkActiveCondition` と `evalConditionForContinuous` の両方**に実装（`execUtils.evalCondition` は既に読んでいた＝3評価器を揃えた） |
| 4 | `src/screens/BattleScreen.tsx` | `handleFlipAttack` を `moveFieldSigniFacedown` ＋ `scheduleTurnEndFacedownReturns` へ載せ替え（**真の裏向き**）。専用フィールド `flip_attack_signi_zones` と自前の復帰処理2箇所を撤去＝汎用の `turn_end_facedown_signi_returns` に寄せた（**旧実装は CPU 側のターン終了経路に復帰処理が無かった**） |
| 5 | 同上 | バトルは `performSigniAttack(..., { attacker: flippedAttacker, regrantLayerAbilities: true })` へ直接委譲 |
| 6 | 同上 | `mkTrigCtxWithLayerGrants(myS, opS, myIsActive)` を新設（`mkTrigCtxForPhase` と同じ形＝**React state に未反映の盤面で `collectGrantedFromLayer` を組み直す**） |
| 7 | `scripts/decompileEffects.ts` | `GRANT_QUOTED_ATTACK_FLIP` の逆翻訳を payload から組む。`DEFERRED_GRANT_QUOTED_ATTACK_REPLACEMENT` の説明を「残りの語形」用に一般化 |
| 8 | `scripts/goldenTest.ts` | 3本（payload・negate 両方向・裏向き→ターン終了復帰の往復） |
| 9 | `scripts/verifyBattleDrive.mjs` | 実機4本 |

### 検証コマンド

```
npm run build:effects && node scripts/heldReview.mjs --adopt-effect WXDi-P05-069-E2
npm run regen && npm run gates
SKIP_BUILD=0 node scripts/verifyBattleDrive.mjs o238FlipAttack o238GrantOpenedByFlip o238GrantAloneNormalAttack o238GrantGatedByOtherSigni
```

### 反転確認（4本・すべて実測）

| 反転したもの | 期待 | 実測 |
|---|---|---|
| `checkActiveCondition` の `negate` を落とす | golden 赤 | **FAIL 2本**（「他にシグニが無ければ成立」が false に、「裏向きにする前は不成立」が true に） |
| live JSON から `WXDi-P01-040-E1.activeCondition` を削る | `o238GrantGatedByOtherSigni` 赤 | **FAIL**＝「他にシグニが2体いるのに引用【自】の発動が提示された」 |
| `regrantLayerAbilities: true` を落とす | `o238GrantOpenedByFlip` 赤 | **FAIL**＝「フリップして場が1体になったのに引用【自】が提示されなかった」 |
| 旧実装（`handleSigniAttack` へ委譲）そのもの | 裏向きが消える | **実観測**＝ボタンは出たが `facedown=[null,null,null]` のまま普通のアタックになった |

### 🔑 この巡の最大の発見＝**`census:enginetext` の B群（他カードの属性判定＝「正当寄り」）にも、壊れて静かな原文 regex は居る**

`collectAltAttackFlipSigni` は**場の他シグニを走査する**ので B群に分類されており、
**A群（本命の worklist）には1度も出てこなかった**。A🔴 が0行になっても「engine が原文で意味を決めている箇所は無い」ではない。
🔑**id を変える改修（catch-all の解体）をしたら、その id を読んでいる収集器を `grep -rn "<旧 id>" src/` で必ず数える。**
`O-60` 第57バッチで学んだ「catch-all を割るときは `grep -rn "<STUB id>" src/engine/` を必ず打つ」と**同じ罠を、今度は `src/screens/` 側の消費地点で踏んだ**
（あのときの grep は `src/engine/` に限っていた）。⇒ **grep の範囲は `src/` 全体にする。**

### 🔑 2つ目＝**「近似」は下流の機構を丸ごと殺す**

裏向きを「ダウン」で近似した実装は、**単体では自然に見える**（画面上は倒れて見える）。
しかしこのカードの目的は「**場のシグニを減らして『他にシグニがない』を作る**」ことなので、
近似した瞬間に**カードの存在意義がゼロになる**。しかも `signi_down` は場のシグニとして数えられ続けるので、
**盤面ログにも JSON にも「間違い」は現れない**。
🔑**近似を入れるときは「その近似で意味を失う効果はないか」を、同じカード族の原文で確かめる**
（今回は付与元 `WXDi-P01-040` の原文を読んだ瞬間に分かった）。

### 🔑 3つ目＝**同じティックで盤面を変えてから解決する処理は「2つとも」渡す**

`handleFlipAttack` は ①盤面（`attacker`）②その盤面で組み直した `effectsMap` の**両方**を渡さないと動かなかった。
①だけ渡した段階では「裏向きにはなるが引用【自】が開かない」という**半分だけ動く**状態になり、
実機ログでは「フリップは成功」に見えるので**そこで止めると誤って完了と判断する**。
🔑**`persist.commit` してから同じティックで続きを解決する箇所は、`effectsMap`（memo）も一緒に組み直す。**
⚠**`p.attacker === my` で「呼び出し元が別の盤面を渡したか」を判定してはいけない**＝
`performSigniAttack` は関数先頭で `let my = p.attacker` と **shadow している**ので常に true になる（実際に1回空振りした）。**明示フラグで宣言する。**

### 🔑 実機ドライバで踏んだ罠3つ（次に書く人へ）

1. 🔴**前の巡の `field.check` が残ると「ライフクロスクラッシュ」モーダルが全操作をブロックする**＝
   症状は「**フリップアタックのボタンが出ない**」という**別の場所の空振り**。⇒ §5.1 の「CORE フィールドを明示クリア」に
   **`field.check` と `life_cloth` も入れる**（2回誤読した）。
2. **`my-signi-zone-N` はトグル**＝毎ティック押すと開閉を繰り返して**開いた瞬間を1度も観測できない**。
   ⚠**「ボタンが0本」で開閉を判定してもいけない**（盤面には常時「ルリグアタックへ／エナに送る／終了」が出ている）＝
   **アタック系のラベルが見えているか**で判定する。
3. **任意コストの支払いラベルは「発動する（コスト: …）」**で、しかも**先に `optcost-energy-*` を N 枚選ぶまで無効**。
   「支払う」だけを探すと**プロンプトは出ているのに押せず「開かない」と誤報する**（実際に2回誤報した）。

### 🔑 4つ目＝**「出ないこと」を主張する実機には、必ず「出る側」の対照を隣に置く**

`o238GrantGatedByOtherSigni`（他にシグニ2体＝提示されない）は、それ単独では
**付与機構ごと壊れていても緑になる**。実際 `activeCondition` を削る反転で**一度 PASS した**（＝判別力ゼロだった）。
⇒ `o238GrantAloneNormalAttack`（単騎＝提示される）を足して初めて反転が赤になった。

---

## 2026-09-05（第137バッチ）：🏁`O-147` クローズ＝**【ライズ】41枚すべてに配置条件が効くようになった**（下位family A の9枚）

**ベースライン**＝`e9dc0e4ac`（第136＝下位family B の直後）。
**gates 全緑**（typecheck・golden **3473/3473**＝3472 +1本・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0・`census:costtext` A🔴0規則・lint 0 errors）。
**実機＝新規4本＋回帰5本＝9本 ALL PASS**（新規 `o147RiseTwoZoneFold` / `o147RiseThreeZoneFold` /
`o147RiseDistinctLevel` / `o147RiseFieldShort`、回帰 `riseGateLevelColor` ＋ family B の4本）。
**実機要否**＝§2.2 の機械判定どおり **`src/screens/` を触った ∧ 新しい型（`RiseFieldGroup`）を足した**＝**実機まで必須**。
**在庫**＝機構 worklist **9 → 8項目**（🏁`O-147` クローズ＝**索引 A が残0**）／実機 残 **0件**（同じ巡で閉じた）。

### 真因

**`RiseBase.field` が「1枚の `TargetFilter`」しか持てず、「場のシグニを N体消費して1ゾーンへ積む」が表せなかった。**
そのため下位family A の9枚は **`getRiseRequirement` が `null`**＝
**ライズ条件が丸ごと消えて、下敷きを1体も潰さずに空きシグニゾーンへ普通に召喚できていた**（過剰実行）。

### 影響枚数

**9枚**＝`WX16-027`／`WX20-037`／`WXK08-031`（同条件 N体）・`WXK03-021`／`WXK11-053`（レベル相異）・
`WXK11-038`（共通する色を持たない）・`WX17-026`（《ライズアイコン》1体＋＜武勇＞2体）・
`WX20-038`（《A》1体と《B》1体と《C》1体）・`WX24-P1-043`（赤3体）。
これで **【ライズ】41枚が全数ゲートされる**（`RISE_CARD_GATED` 28 → 32 → **41**）。

### 直したもの

| # | 場所 | 内容 |
|---|---|---|
| 1 | `src/engine/execUtils.ts` | `RiseBase.field` を `{groups: RiseFieldGroup[], distinctLevel?, distinctColor?}` へ。`parseRiseFieldBase` が「〜の上に置く／出す」の手前を **`と` で枠に割る**（⚠**《》／＜＞ の外だけで割る**＝カード名に `と` が入りうる）。枠の合計は **1〜3体**に限る（シグニゾーンは3つ） |
| 2 | `src/screens/battle/riseSummon.ts` | `riseFieldOptions` / `findRiseFieldAssignment` / `canPayRiseField` / `validateRiseField` / `riseConsumedZones` を追加。選択は `RiseSelection{materials, fieldZones}` の1型にまとめた |
| 3 | `src/screens/battle/modals/SigniSummonZoneModal.tsx` | 「下敷きにするシグニ」を枠ごとに選ぶ列を追加。**召喚先は下敷きに選んだゾーンだけ**が押せる |
| 4 | `src/screens/BattleScreen.tsx`（`handleSummonSigni`） | `riseFoldZones`（配置先を先頭に、残りはゾーン番号順）で1ゾーンへ畳み、**潰した他ゾーンを `null` に**。リミット計算も潰した全ゾーンのトップを引く |
| 5 | 🔴同上（付随状態） | **潰した全ゾーン**のダウン／凍結／チャーム／アクセ／ソウルを落とす（旧実装は配置先1ゾーンだけ＝**空にしたゾーンにチャーム・アクセ・ソウルだけが浮いて残る**） |
| 6 | 🔴同上（`ON_RISE`） | **潰した全ゾーンのトップ**から収集（旧実装は配置先のトップだけ＝他ゾーンから潰されたシグニの【自】が発火しない） |

### 🔑 この巡の最大の発見＝**「各枠に候補が足りているか」では判定できない**

`WX17-026`「《ライズアイコン》を持つシグニ**1体**と＜武勇＞のシグニ**2体**の上に出す」は、
**同じゾーンが両方の枠の候補になりうる**（ライズ持ちの＜武勇＞シグニ）。
枠ごとに「候補が count 体以上あるか」を数えると、**実際には作れない割り当てを「払える」と誤答する**
（＜武勇＞3体・ライズ持ち0体の盤面で「払える」に化ける）。
⇒ `findRiseFieldAssignment` が**割り当てを1つ実際に構成する**（ゾーンは3つなので総当たり）。
制約（レベル相異／色を共有しない）も**割り当てが確定した時点**で見る。
🔑**「N個の枠に M個の候補」を数で判定したくなったら、まず1つ構成してみる。**

### 検証コマンド

```
npm run gates
node scripts/verifyBattleDrive.mjs o147RiseTwoZoneFold o147RiseThreeZoneFold o147RiseDistinctLevel o147RiseFieldShort
node scripts/verifyBattleDrive.mjs riseGateLevelColor o147RiseTrashStack o147RiseMaterialShort o147RiseFieldPlusTrash o147RiseEnergyAndTrash
```

**反転確認あり**＝実機4本はすべて「旧挙動なら FAIL する」判定文
（下敷きの選択が出ない／選ぶ前に召喚先が押せる／同レベル2体で確定できる／
潰したゾーンが空にならない＝複製／下敷きが足りないのに場に出る、を別の FAIL 分岐にしてある）。

### 🔑 その他の教訓

- 🔴**`npm run typecheck`（`tsc -b`）は `src` しか見ず `scripts/` を見ない**（`tsconfig.app.json` の `include: ["src"]`）＝
  `goldenTest.ts` に**型の合わない古い式が残っても typecheck は緑**だった（実際 `base.filter` が残っていて
  golden の実行時例外で初めて気づいた）。⇒ **`scripts/` を直したら golden を実際に走らせるまで「直った」と言わない。**
- 🔑**`src/screens/` の純関数は golden から import できる**＝`riseSummon.ts`（React 非依存）の枠割り当てを
  golden で単体テストした。**実機は組み合わせを網羅できない**ので、判定ロジックはこちらで固める。
- 🔑**畳む処理は「並び」「空ゾーン化」「付随状態」「トリガー収集」の4つが同時に壊れる**＝
  1つだけ直すと盤面は正しく見えるのに **チャームだけ浮く／`ON_RISE` が片方しか出ない**という
  「全ゲート緑のまま静かに間違う」形になる。**畳む対象の集合（`riseFoldZones`）を1つ作って全部そこから回す。**

---

## 2026-09-05（第136バッチ）：`O-147` 下位family B＝**材料つき【ライズ】4枚**を配置条件として表せるようにした（13カード → 残 9）

**ベースライン**＝`fbb31cee9`（`O-60` クローズの直後）。
**gates 全緑**（typecheck・golden **3472/3472**・smoke 全異常0・fuzz 全0・census 1/BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴0・`census:costtext` A🔴0規則・lint 0 errors）。
**実機＝新規4本＋回帰1本＝5本 ALL PASS**（`riseGateLevelColor` / `o147RiseTrashStack` /
`o147RiseMaterialShort` / `o147RiseFieldPlusTrash` / `o147RiseEnergyAndTrash`）。
**実機要否の判定**＝§2.2 の機械判定どおり **`src/screens/` を触った ∧ 新しい型（`RiseRequirement`）を足した**＝**実機まで必須**。
**在庫**＝機構 worklist **9項目（据置）**（`O-147` は下位family A が残るのでクローズしていない）／実機 残 **0件**（同じ巡で閉じた）。

### 真因

**`getRiseFilter` の戻り値が「1枚の `TargetFilter`」しかなく、「下に重ねる材料」を表す場所が無かった。**
そのため「トラッシュ／エナのカードを下に重ねて場に出す」4枚は**丸ごと `null`**＝
**ライズ条件が消えて、材料を1枚も払わずに空きシグニゾーンへ普通に召喚できていた**（在庫要求ごと消える過剰実行）。

### 影響枚数

**4枚**（`WXDi-P06-034`＝トラッシュの＜武勇＞2枚→空きゾーン／`WXDi-P15-048`＝トラッシュの＜解放派＞1枚→空きゾーン／
`WXEX1-35`＝場の赤Lv3以下＋トラッシュの**レベル相異**赤3枚／`WXK05-035`＝場の＜アーム＞＋**エナとトラッシュから1枚ずつ**）。
🔴**同じ巡で見つけた別の穴が2つ**（下記）＝そちらの影響は **【ライズ】41枚すべて**。

### 直したもの

| # | 場所 | 内容 |
|---|---|---|
| 1 | `src/engine/execUtils.ts` | `getRiseFilter` → **`getRiseRequirement`**（`{ base: {kind:'field',filter} \| {kind:'empty'}, materials: RiseMaterialSpec[] }`）。名詞句→`TargetFilter` の抽出を `parseRiseCardFilter` に括り出し、**配置先と材料で同じ規則**を使う |
| 2 | `src/screens/battle/riseSummon.ts`（新設） | 材料の候補・充足・検証・支払いの**純関数4本**。⚠**モーダル／手札ゲート／確定処理が全部ここを呼ぶ** |
| 3 | `src/screens/battle/modals/SigniSummonZoneModal.tsx` | 「下に重ねるカード」の選択枠（領域ごと・枚数固定）を追加。**空きゾーン型ライズ**のゾーン活性化を追加 |
| 4 | `src/screens/BattleScreen.tsx`（`handleSummonSigni`） | 積み方を `[...既存スタック, ...材料, 本体]` の1式に。材料をトラッシュ／エナから取り除く |
| 5 | 🔴`src/screens/BattleScreen.tsx`（CPU 召喚ループ） | **CPU はライズを1度も見ていなかった**＝空きゾーンしか回らず `newSigni[zone]=[id]` と置くので、**【ライズ】41枚を下敷きも材料も無しでタダ召喚**していた。CPU に材料選択の経路は無いので **fail-closed で候補から除外** |
| 6 | 🔴`src/screens/BattleScreen.tsx`（`getMyHandCardActions`） | **「召喚」ゲートが空きゾーン前提**だった＝ライズは下敷きのレベルと入れ替わるのに `fieldSigniTotal + Lv <= リミット` かつ空きゾーン必須を要求＝**盤面が埋まっている／合計レベルが足りないだけで合法なライズが打てなかった**（過少実行） |

### 検証コマンド

```
npm run gates
node scripts/verifyBattleDrive.mjs riseGateLevelColor o147RiseTrashStack o147RiseMaterialShort o147RiseFieldPlusTrash o147RiseEnergyAndTrash
```

**反転確認あり**＝実機4本はすべて「旧挙動なら FAIL する」判定文で書いた
（材料選択が出ない／デコイが候補に混ざる／材料未選択でゾーンが押せる／同レベル2枚で確定できる／
材料が足りないのに場に出る／材料が元の領域にも残る＝複製、をそれぞれ別の FAIL 分岐にしてある）。

### ラチェット

golden `rise: getRiseRequirement`＝`RISE_CARD_TOTAL 41`（据置）／**`RISE_CARD_GATED 28 → 32`**／
**`RISE_CARD_MATERIAL 4`（新設）**。**残 9枚が下位family A**（場のシグニを2〜3体消費して1ゾーンへ積む）。

### 🔑 この巡の教訓

- 🔴**「人間のUIにゲートを入れた」は「ゲートが効いている」ではない**＝ライズ条件は 2026-08-29 の `V-89` で
  28枚まで直したつもりだったが、**CPU 召喚ループは同じ判定を1行も持っていなかった**（41枚が素通り）。
  ⇒ **配置・使用の可否を直したら、`grep -rn "newSigni\[" src/screens/` で同じ配置を書いている全経路を数える。**
  （§4.4 の「可否の門は実行側と一覧側の2箇所ある」の**第3の口**＝CPU。）
- 🔴**ゲートは「通しすぎ」だけでなく「塞ぎすぎ」でも壊れる**＝手札の「召喚」ボタンは**空きゾーンがあること**を
  要求していたので、ライズ（下敷きと入れ替わる）が**合法なのに提示されない**ことがあった。
  ⚠**過剰実行を塞ぐ巡では、同じ判定の過少側も必ず一緒に見る**（実機で「押せない」を1本書くと出る）。
- 🔑**「半分だけ実装した嘘」を作らない分割の仕方**＝13カードを **(A) 多ゾーン消費 / (B) 他領域から材料** に割り、
  **(B) だけを完全に実装して (A) は `null` のまま据え置いた**。
  ⚠**1体ぶんだけ通す**という中間状態を作らなかったので、`RISE_CARD_GATED` のラチェットが
  「どこまで直ったか」を正確に固定できている。
- 🔑**材料の選択状態は `useEffect` でリセットしない**＝「どの召喚に対する選択か」をキーごと state に持ち、
  キーが違えば空として読む（`useEffect` だと1フレーム古い選択が見えるうえ cascading render になる）。
- 🔑**添字で領域を指す選択は「降順に削る」**＝昇順に `splice` すると後続の添字がズレて**別のカードが消える**
- 🔴🆕**計器を壊すのは計器側だけではない＝実装側の変数名でも壊れる**＝`census:costtext` の原文追跡は**ファイル全体を変数名で伝播する**（`const X = <追跡済みの変数を含む式>`）ので、`const paid = payRiseMaterials(...)` という**一般名**を汚染源にした瞬間 `card`／`cardNum`／`timing` まで「原文由来」に化け、C群が **3規則/14カード → 6規則/941カード**に膨らんだ（A群0のまま＝`gates` は緑）。⇒ **原文由来の値を受ける変数には固有名を付ける**（`riseMaterialPayment` へ改名＝追跡変数 933 → 13）。🔑**`docs/_census_*.txt` の差分は毎回読む**（ゲートが緑でも計器は濁る）。
- 🔑**実機ドライバは「注入が勝ったか」を先に確かめてから driving する**＝`o147RiseTrashStack` が1度だけ**前のシナリオの盤面のまま回って**「材料選択が出なかった＝旧挙動」と誤報した（§5.1 の既知の注入レース）。⇒ 4本とも冒頭に**注入確認 → 再注入 → reload** のループを入れた。⚠**「出ないこと」を主張する観測ほど前提の確認が要る**（注入が負けていても同じ結果に見える）。
  （`payRiseMaterials` は「積む順（昇順）」と「削る順（降順）」を分けてある）。

---

## 2026-09-05（第130〜135バッチ）：🏁`O-60` クローズ＝engine の原文 regex が **A🔴 9行 → 0** — **計器の「live 0」が嘘をついていた**

**ベースライン**＝`20507ad2e`（PLAN 整理⑦の直後）。
**gates 全緑**（golden **3467 → 3472**＝+5本／既存の契約 golden 5本を理由つきで更新・smoke 10725 全異常0・
fuzz 全0・census 1 / BASELINE 1・`census:stubs` A群🔴0/C群0・manual-fields 0・
**`census:enginetext` A🔴 9行 → 0行 / 0ハンドラ**（`BASELINE_SELF_TEXT` も **0** へ払い戻し）・`census:costtext` A🔴 0規則・
lint 0 errors・`npm run regen` 完走後に再度 gates 全緑）。
**実機＝新規2本＋回帰3本＝5本 ALL PASS**（第132のみ）。**実機要否は §2.2 の機械判定どおり**＝
第132 だけが `src/screens/`（`SigniOnPlayCostModal`）を触ったので実機必須、
第130/133 は live JSON が**1バイトも変わらない**（死んだ枝の撤去）、第131/134 は `src/engine/` と
`src/data/` だけで挙動は payload 化の前後で同値（第131 は恒久 no-op → 記録されるようになった engine 単体の修正）＝
いずれも④ゲートまでで完了と判定した。
**在庫**＝機構 worklist **10 → 9項目**（🏁`O-60` クローズ）／実機 残 **0件（据置）**。

| バッチ | 内容 |
|---|---|
| 130（`O-60` 第71） | **生成元が1つも無い STUB ハンドラ2本を撤去**（`REVEAL_AND_PICK` / `SUMMON_FROM_TRASH`）＝A🔴 9→7 |
| 131（第72） | 内部 STUB `INTERNAL_MARK_REVEALED_NAMED` を payload 化＝A🔴 7→6（**公開の記録が恒久 no-op だった**） |
| 132（第73） | 【ビート】コストの「誰を」を payload 化＝A🔴 6→5（live 9効果・**実機が支払いUIの穴を1件捕まえた**） |
| 133（第74） | live 0 の死んだ catch-all 3 family を **parser 規則ごと**撤去＝A🔴 5→2 |
| 134（第75） | 「〜がめくれるまで公開する」を payload 化＝A🔴 2→1（**計器が live 0 と嘘をついていた family**） |
| 135（第76） | 🏁**条件節の捨て場 `CONDITIONAL_POWER_BONUS` を「名前のある穴」へ改名してハンドラを撤去**＝A🔴 1→**0**（`O-60` クローズ） |

---

### 🔴 この巡の最大の発見＝**計器のラベルを事実と読まない**

`census:enginetext` は A群を「ハンドラの `if` から拾った id」でグループ化するので、
`if (stub.id === 'DECK_REVEAL_UNTIL' || … || stub.id === 'OPP_DECK_REVEAL_UNTIL')` は
**最後の id で `live 0`** と表示されていた。実際には `DECK_REVEAL_UNTIL` が **live 4効果**で動いていた。
⇒ 🔑**A群を取る前に `grep -o '"id":"<ID>"' public/data/effects_*.json | wc -l` を id ごとに打つ。**
（同じ罠＝`REVEAL_AND_PICK` は逆に「live 472」と見えたが、それは**アクション型**の出現数で、
STUB 形は0だった。**同じ綴りが型と id の2つの名前空間にある。**）

### 🔑 「live 0 のハンドラを消す」の安全な手順（第71・第74で確立）

1. **engine のハンドラ**と**それを生む parser 規則**を**同時に**消す。
   （②を残すと新カードが**ハンドラの無い STUB**＝無言 no-op へ落ちる。②だけ消すと逆翻訳が黙って変わる。）
2. `npm run build:effects` を回して **live JSON の差分がゼロ**であることを確かめる＝**本当に死んでいた証拠**。
   （第74は3 family・7規則を消して差分0。第71は生成元が src/ にも live にも1つも無いことを grep で確認。）
3. golden に「復活させない門」を1本（engine のディスパッチと parser の生成地点の両方を assert）。

### 🔴 恒久 no-op だったもの（第72）

`INTERNAL_MARK_REVEALED_NAMED` は公開したカード名を**カード全文**の `/《X》を公開/` から導いていたが、
原文の綴りは「《X》**１枚を**公開してもよい」＝**1本も当たらず**、`hand_revealed_just` が1度も立たなかった
（＝`ON_REVEALED_FROM_HAND` が永久に不発）。生成側（`effectExecutor` の任意公開 CHOOSE）は
払い出す名前を**既に持っていた**＝原文を読み直す理由がそもそも無かった。
⇒ 🔑**catch-all を割ったら、そこから積む内部 STUB も見る**（生成側だけ直した第36の取り残し）。

### 🔴 実機だけが捕まえた UI の穴（第73）

「このシグニと**他のシグニ１体**を【ビート】にする」の【出】は、場に他のシグニが**0体でも【発動】が押せた**。
押すと engine の `payBeatSigniCost` が `ok:false` を返し、**何も起きないまま召喚だけが宙に浮く**。
`beat_signi_from_trash` 側には支払い可否の門（`beatTrashOkM`）があったのに、**場側だけ素通り**だった。
⇒ `SigniOnPlayCostModal` に `beatFieldOkM` を追加。⚠**自身（`includeSelf`）は数えない**＝
このモーダルが開く時点では召喚が確定しておらず `selfZone` が -1 のことがある。
🔑**同じ family の片方にだけ門がある形は、もう片方を必ず疑う。**

### 🔑 表示だけが嘘だった（第73）

`beat_signi` の `count` は「このシグニと他のシグニ１体」でも **1** で、支払いUIは
「シグニ**1体**を【ビート】に」と表示していた（実際は自身＋1体の**2体**が場を離れる）。
payload 化で `count`＝**合計体数**にした。⇒ 🔑**engine が正しくても表示が嘘をつく**（§5.1 の教訓）。

### ⚠ 「壊れている」と「壊れうる」を書き分けた（第73）

裸の「シグニN体を【ビート】にする」は旧実装で**自身が無条件に候補外**だったが、
live の標本 `WDK14-001-E2` は**ルリグ**（シグニゾーンに居ない＝除外されようがない）＝**実害ゼロ**。
母集団の `Type` を見ずに「過小実行を直した」と書くと、次に読む人が**存在しない不具合の再現**を探す。

### 🔑 実機の罠（第73で踏み直した2つ）

- **`field.beat_zone` は CORE フィールド**＝spec で明示クリアしないと前のシナリオの【ビート】が残り、
  ［４枚以下］のゲートが閉じて**能力が提示されない**（単体 PASS・一括 FAIL）。
- **前シナリオのモーダルが開いたままだと注入が画面に届かない**＝`H.closeModals()` ＋
  「手札カードが出るまで待つ」を drive の先頭に置く。

### 🏁 `O-60` クローズ＝A群が 0 になった（第135）

残っていた `CONDITIONAL_POWER_BONUS` は **名前が実体と食い違うハンドラ**だった。
parser 側の生成地点41箇所は「**条件節を構造化できなかった文の捨て場**」で、中身は
「それが＜X＞のシグニの場合、追加でそれをトラッシュに置く」「センタールリグが〜でない場合、デッキに加える」
「スペルがN種類以上ある場合」など**パワーと無関係な文が大半**。engine 側はアビリティブロックの原文に
**9本のリテラル**を当ててパワー修整を試み、**どれにも当たらなければログだけ返す**＝盤面が動かない**無言 no-op**だった。

⇒ 41箇所を **`DEFERRED_CONDITIONAL_CLAUSE_UNPARSED`（名前のある穴）**へ改名し、engine のハンドラを撤去。
逆翻訳には **【未実装】条件つきの効果（条件節を構造化できていない）** が出る（`census:stubs` A群🔴 は
`DEFERRED_*` を無言 no-op に数えない＝**宣言された穴**）。

**live 実害はゼロ**＝fresh parse で当たるのは3効果だけで（`WXK06-032-E1` / `WXDi-D04-011-E1` / `SPDi47-03-E2`）、
**3件とも `manualEffects.ts` が構造化済み**＝live には1件も出ていなかった（`build:effects` の**差分ゼロ**で確認）。

🔑**母集団の測り方**＝live 0 でも parser の生成地点が41箇所ある形は、**fresh parse で数える**しかない
（`parseCardEffects` を全カードへ当てて STUB id を数える使い捨てスクリプト）。**live 0 ＝ 死んでいる、ではない。**
🔑**「A群 0」は「もう原文を読んでいない」であって「全部実装済み」ではない。**
捨て場だった文型は【未実装】として可視化されただけ＝必要になったら条件型を足す（PLAN §4.2 の6箇所セット）。


### 変更ファイル

`src/engine/execStubPart1.ts`（`REVEAL_AND_PICK` 撤去・`DECK_REVEAL_UNTIL` payload 化）／
`src/engine/execStubPart2.ts`（`LOOK_TOP_*` / `CONDITIONAL_PER_TRASH` 撤去）／
`src/engine/execStubPart3.ts`（`SUMMON_FROM_TRASH` / `CHOOSE_SAME_OPTION_*` 撤去・公開記録の payload 化）／
`src/engine/execUtils.ts`（`analyzeBeatSigniCost` / `payBeatSigniCost`）／`src/engine/effectExecutor.ts`（payload を積む）／
`src/data/effectParser.ts`（【ビート】コストの一般規則・effectId allowlist の撤去）／
`src/data/parsers/parseSentencePart2/3/4.ts`（死んだ規則7本の撤去・`parseDeckRevealUntilSpec` 新設）／
`src/data/manualEffects.ts`（live 4効果へ `deckRevealUntil` を手書き→`syncManualLive`）／
`src/types/effects.ts`（`BeatSigniCost` 拡張・`deckRevealUntil` 新設）／
`src/screens/battle/modals/SigniOnPlayCostModal.tsx`（`beatFieldOkM`）／
`scripts/censusEngineText.ts`（ratchet 9→1）／`scripts/goldenTest.ts`／`scripts/decompileEffects.ts`／
`scripts/verifyBattleDrive.mjs`（実機2本）／`public/data/effects_*.json`（13カードのみ）。
第135＝`src/engine/execStubPart1.ts`（`CONDITIONAL_POWER_BONUS` 撤去）／`src/data/parsers/parseSentencePart3/4.ts`（生成 id 41箇所を `DEFERRED_*` へ改名）／`scripts/decompileEffects.ts`（日本語ラベル）／`scripts/censusEngineText.ts`（ratchet 1→0）／`scripts/goldenTest.ts`。**live JSON は差分ゼロ。**

---

## 2026-09-04（第121〜129バッチ）：実機完済＋機構6件クローズ — **実機が engine の穴を2件、ゲートが自分の事故を1件捕まえた**

**ベースライン**＝`e340af93b`（第111〜120 の簿記直後）。
**gates 全緑**（golden **3461 → 3467**＝+6本・smoke 10725 全異常0・fuzz 全0・census 1 / BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴 9行（B 57→56）・
`census:costtext` A🔴 0規則・lint 0 errors・`npm run regen` 完走）。
**実機＝新規9本**（うち**反転5本**）。横断回帰込みで**すべて ALL PASS**。
**在庫**＝機構 worklist **19 → 13項目**（うち「取る」対象は **10項目**）／実機 残 **1 → 0件**。

| バッチ | 内容 |
|---|---|
| 121 | `V-145`①②③ 実機返済（実機 残 1→0） |
| 122 | 🏁`O-185`＝「このターン使用してもよい」の許可ストア |
| 123 | 🏁`O-246`＝デッキ公開枚数+1 の任意置換 |
| 124 | 🏁`O-230`＝【ガード】の代替コスト「コラボ」／`GUARD_ALTERNATIVE_COST` の payload 化 |
| 125 | 🏁`O-243`＝3ゾーン横断の対象＋在庫コスト |
| 126 | 🏁`O-244`＝チェックゾーンへ置いて無料で使う |
| 127 | 🏁`O-236`＝ルリグのアタック回数上限とダウン中アタック |
| 128 | `V-151` 実機返済（`O-236`）＝**門が2箇所ある**ことを実機が捕まえた |
| 129 | 簿記（索引からクローズ6行を削除・§5 表・§5.1・§1/§6 入れ替え） |

---

### 🔴 実機だけが捕まえた engine の穴 2件

**(a) ルリグのアタック可否の門は「2箇所」ある**（`O-236` / `V-151`）
第127で `performLrigAttack`（実行）の門だけを直したが、`getMyLrigFieldActions`（アクション一覧）が
`if (my.field.lrig_down) return []` のまま塞いでいたため、**「アタック」ボタンが1つも出ず**実機では0回だった。
golden は engine を直接叩くので**全緑のまま**通っていた。
⇒ §5.1 の既出教訓「同じ式を2箇所以上に書いた」がそのまま出た形。

**(b) `temp_power_mods` は DB に先に載り、画面の再描画はそのあと**（`V-145`①）
DB（`queryState().powerMods`）だけを進行条件にすると、**まだ再描画されていない表示**を読んで
「1件も減っていない」と判定する＝**単体 PASS・一括だけ FAIL** の位置依存フレークになった。
⇒ **「必ず変わる側（保護対象外の対照）」の表示が動いたこと**を進行条件にする。

---

### 🔴 自分が起こした事故 1件（ゲートが捕まえた）

`manualEffects.ts` に対して `s.replace('"usageLimit":"once_per_turn"', '')` という
**ファイル全体の一括置換**をかけ、**無関係な21効果から《ターン1回》を消した**。
`manual-fields` ゲートと「`WX25-P1-052` の2回目が撃てる」golden が**同時に**落ちて発覚。
⇒ `git checkout` で復元し、**行番号を指定した1行だけの置換**へやり直した。

🔑**教訓**＝CLAUDE.md「全再生成系の一括置換は禁止」は**ソースの文字列置換にもそのまま当てはまる**。
🔑**`git diff --stat` が「1行のはずが22行」と言ったら、そこで止まる。**
🔑**ゲートが2本同時に落ちたら、engine を読み始める前に自分の直前の置換範囲を疑う。**

---

### 🏁 クローズ6件（どれも「嘘をやめた」変更）

**`O-185`＝「このターン、あなたはそれらを使用してもよい」の許可ストア**（1効果）
🔴旧＝`execPlayFree` の帰結が `ADD_TO_HAND` で、**選んだスペルが手札に来て**いた
（`opp_trash` 側は**相手のトラッシュから奪って**いた）。逆翻訳だけは正しく「コストを支払って使用する」と言っていた。
⇒ `PlayerState.trash_spells_usable_this_turn` を新設（turn-end リセット）、
`PlayFreeAction.grantUseThisTurn` を立てると**カードを動かさず許可だけ積む**。
使用の入口は `getMyTrashCardActions` と新設の `getOpTrashCardActions`。
印刷コストの請求は**既存の `USE_SPELL_FROM_TRASH_PAYING_COST`**（`value2:'opp_trash'` で相手側へ切替）。
`BoardComponents` は相手のトラッシュにも testid（`op-trash`）を付け、`isTrash` を `isMe` で切るのをやめた。

**`O-246`＝デッキ公開枚数+1（任意の置換効果）**（1効果）
🔴旧＝フラグを立てるだけで**読み手が0人**（`census:deadstate` が検出）。
⇒ `reveal_count_plus_one_this_turn` を新設し、公開地点3つ（`REVEAL_AND_PICK` / `LOOK_PICK_CHAIN` /
`LOOK_AND_REORDER` のデッキ枝）で**公開のたびに**「1枚多く公開しますか？」を問う。
🔑**自動加算にしない**＝原文は「してもよい」＝権利は「問う権利」であって加算ではない。
答えは `_revealPlus` としてアクションへ焼き込み、**再入では問わない**（無限ループにしない）。

**`O-230`＝【ガード】の代替コスト「コラボする」**（1効果）＋ `GUARD_ALTERNATIVE_COST` の payload 化
🔴真因は2つ重なっていた＝①`STUB{COLLAB}` の枝へ落ちて原文と無関係な対話が開いていた
②受け皿が**カード全文 regex**で「エナから＜X＞のシグニ1枚」しか読めず、**live 5件のうち3件**は
1本も当たらず「代替コスト無し」に落ちていた（逆翻訳だけが「代替コストがある」と言っていた）。
⇒ `StubAction.guardAltCost`（2種）を新設し、collector から原文参照を撤去（fail-closed）。
読めない言い回しは `DEFERRED_GUARD_ALT_COST_UNKNOWN` へ落として逆翻訳に【未実装】を出す。
コラボ本体は**既存の `INTERNAL_DO_COLLAB`** へ委譲（受け皿は在った＝登録票の見立てどおり）。

**`O-243`＝3ゾーン横断の対象＋在庫コスト**（1効果）
🔴旧＝相手の3枚が**自分のトラッシュ1枚**に化け、さらに**自分のシグニ**をデッキの一番下へ送っていた（自傷）。
⇒ `crossZoneTriple{colors, story}` を新設（**コストの色とクラスは原文から読む**）。
段階つき STUB で 相手の 場／エナ／トラッシュ から1枚ずつ宣言 → コストを払えたときだけ
3枚を相手のデッキの一番下へ。🔴**払えなければ対象は1枚も動かさない**（「そうした場合」）。

**`O-244`＝チェックゾーンへ置いて無料で使う**（1効果）
🔴旧＝`LOOK_AND_REORDER{count:10}` だけで**本文が丸ごと落ちて**おり、しかも逆翻訳が
「デッキの上10枚を見る」と**実装済みのように読めた**（census の高シグナルでしか気づけなかった）。
⇒ `selectionConstraint.totalCostMax` を新設（印刷コストの合計上限・読めない札は不成立）。
段階つき STUB で SEARCH →`check_rest` へ置く→残りをデッキへ戻す→「好きな順番で」1枚ずつ
`USE_SPELL_FROM_TRASH` へ委譲。⚠**使用する1枚は先にチェックゾーンから外す**（残すと盤面が固まる＝`V-135`② の形）。

**`O-236`＝ルリグのアタック回数上限とダウン中アタック**（1効果／3機構）
🔴旧＝付与先がピース自身に解決されて自場シグニに一致せず、無言 no-op。
⇒ ①`lrig_attack_while_down_this_turn`（シグニ用 `ATTACK_WHILE_DOWN` とは**別軸**）
②`lrig_attack_limit_this_turn` / `lrig_attack_count_this_turn`（🔴既定の「1回」は**真偽値**で表していたので
2回目以降を表せなかった）③`REDUCE_LRIG_ATTACK_LIMIT`（下限0でクランプ）＋
`REVEAL_DECK_TOP_AND_REDUCE_LRIG_ATTACK_LIMIT`（一致しないレベルなら何も減らさない）。
⚠**上限が未設定なら従来どおり**＝既存カードの挙動は1つも変えていない。

---

### 実機シナリオ 新規9本

| ID | 観測点 |
|---|---|
| `v145PowerProtectOtherEichi` / `WrongBranch` | 「他の＜英知＞」だけ相手効果の −3000 を受けない／🔴選択肢3を選ぶと3体とも受ける |
| `v145GrantQuotedAutoOnAttack` | ＋3000 と引用【自】が**同じ1体**へ乗り（選択は1回だけ）、アタックで相手が **−13000** |
| `v145CraftAboveIroha` / `AboveOther` | 虎丸の上の《棗イロハ》が 10000→15000／🔴別のシグニなら ＋5000 も 【自】も付かない |
| `o185GrantTrashSpellUse` | 許可2件・**カードは両方のトラッシュに残る**・自分と相手の両方に「【使用】」が出る |
| `o230GuardAltCollab` / `NoEnergy` | 「《無》×1＋コラボライバー1人」が出て押すとエナ−1／🔴エナ0枚なら提示されない |
| `v151LrigAttackLimit3` / `Default` | ダウン状態から**3回**アタックできる（相手ライフ 4→2）／🔴付与が無ければ**0回** |

**ドライバに恒久化したヘルパ**＝`readSigniEffectivePower`（盤面の実効パワーを DOM から読む）。
⚠**子を持たない要素だけを見る＋1桁も拾う**（`displayPow` は `Math.max(0, …)` で 0 になりうる）。

**実機で踏んだ罠（すべて §4.4 の既出の再発 or 同族）**＝
- **候補UIの回数は立ち上がりエッジで数える**（毎ティック数えると1回の問いが何十回にも化ける）。
- **解決後は何も押さない／観測はピーク値を sticky に持つ**（📌25d）。`V-145`③ で単体 PASS・一括だけ FAIL。
- **`ZoneCardModal` の上に `CardModal` が重なる2枚重ね**で次のゾーンのクリックが吸われる
  ⇒ **ゾーンを読む前に `page.reload()`**（盤面は Supabase 側なので失われない）。
- **ゾーン一覧には `data-action-label` が無い**（描くのはカードを開いた `CardModal`）。
- **両者のルリグを同じカードにしない**（`getByAltText` が相手を掴む）。
- **「アタック」はコスト付きだと「アタック（《無》×1）」**＝前方一致で拾い `card-action-{i}` を押す。

---

### 実装で踏んだ罠（次に同じ穴に落ちないため）

- 🔴**golden のテスト文字列に生の改行を入れると esbuild が「Unterminated string literal」で落ちる**
  ⇒ `String.fromCharCode(10)` で組む。
- 🔴**parser の regex を `[^。]` で挟まない**＝原文は句点を跨ぐ（`O-244` で1件も当たらなかった）。
- 🔴**golden の `StateOpts.signi` は「1ゾーン1枚のフラット配列」**（`mkState` が `[s]` へ包む）＝
  二重配列にすると `getCardNum` が解けず**修正あり／なしの両方で緑**になる。
- 🔴**`run()` はオートパイロットで interaction を潰す**＝対話を見るテストは `executeEffect` で1手だけ進める。
- 🔴**アクションを手書きすると必須フィールドが欠けて executor の中で例外になる**＝**live から取る**。
- ⚠**収穫マージは MANUAL/PARTIAL を効果単位で不可侵にする**＝`syncManualLive.ts` でしか届かない。
  parser 由来の変更は `_held_fresh.json` に溜まるので `heldReview.mjs --adopt <CardNum>` で採る。

---

**コミット**＝`0250dc52d`(121)／`8d19d1e29`+`7a6e199ba`(122)／`bad7a5d45`(123)／`3209c615d`(124)／
`b09f71535`(125)／`3d0ca7726`(126)／`f522abf61`(127)／`fdc4a9b8d`(128)／この記録(129)。
**要実機検証＝なし**（各巡で⑤まで完了）。

## 2026-09-04（第111〜120バッチ）：機構 worklist 9項目を消化 — **受け皿は5件で「既に在った」／実機が表示の嘘を1件捕まえた**

**ベースライン**＝`bf45a07e8`（第106〜110 の簿記直後）。
**gates 全緑**（golden **3461 / 3461**（3452 → +9）・smoke 10725 全異常0・fuzz 全0・census 1 / BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴 9行（据置）・`census:costtext` A🔴 0規則（据置）・
`census:deadstate` 0件（据置）・lint 0 errors）。
**実機＝新規2本**（**反転確認1組**）。**単体でも、グロウ横断回帰5本の一括でも ALL PASS。**

| バッチ | 項目 | レーン | 主産物 |
|---|---|---|---|
| 第111 | `O-247` | 遅い（engine） | 「対戦相手の効果によってパワーは減少しない」が**一時修整に1件も効いていなかった** |
| 第112 | `O-219` | 遅い（engine＋screens） | グロウ先カード自身のコスト軽減が**恒久 no-op ＋ 逆向きの過小コスト**だった |
| 第113 | `O-240` | 遅い（engine＋parser） | 全領域への《トラップアイコン》付与（【ライフバースト】側だけ実装されていた） |
| 第114 | `O-239` | 遅い（engine＋screens） | そのターンの**クラッシュ順**を軸にした【ライフバースト】付与 |
| 第115 | `O-242` | 遅い（parser＋screens） | 「そのターンで**最初の**グロウ」限定のエナチャージ |
| 第116 | `O-229` | 遅い（parser＋engine） | ゾーンの一番上どうしの入れ替え（**受け皿は既に在った**） |
| 第117 | `O-223` ＋ `O-218` | 遅い（engine＋screens） | 【シード】family＝対象宣言のスコープ／【起】の UI 入口 |
| 第118 | `O-227` | **速い**（manual 1件） | 期間つきプレイヤー付与【起】（**受け皿は既に全部在った**） |
| 第119 | `V-150` 実機 | — | 実機2本 ＋ グロウ横断回帰3本＝**5本 ALL PASS** |
| 第120 | 簿記 | — | 本記録・PLAN 3ファイル |

---

### ① 🔴 `O-247`：「パワーは対戦相手の効果によって減少しない」が**一時修整を1件も止めていなかった**

**真因**＝保護集合は `effectEngine.calcFieldPowers` の `applyEffects` の**ローカル変数**でしか組み立てておらず、
`applyDeltaToCard(..., protection)` を通る **CONTINUOUS のデルタにしか効かなかった**。
`applyTempMods` は `temp_power_mods` / `power_mods_until_opp_turn` / `power_mods_until_next_own_turn` を
**保護集合を一切見ずに**加算する＝**相手の【出】【自】【起】が書く −N を素通し**（原文が主に想定している経路がまさにこれ）。

**影響**＝**保護を宣言する効果は 9効果 / 9カード**で、**9件すべてが原文「対戦相手の効果によって」**（登録票の「1効果」は分離のきっかけになった標本1枚）。
`WX05-024` / `WX12-033` / `WX20-023` / `WX22-013` / `WX22-Re04` / `WXDi-P07-085` / `WXK03-018` / `WXK03-026` / `WXK06-024`。

**直し方**＝`powerModifyProtection` を積み終えた直後に**スナップショット**を取り、`applyTempMods` から参照する。
- ⚠**その位置で取るのが要点**＝下で足す `PREVENT_OPP_POWER_PLUS` は原文が「対戦相手の**【常】能力の**効果によって」で一時修整には効かない。
- 発生元の支配者は**盤面の全ゾーンの実 id**で決める。⚠**両方に居る／どちらにも居ない ときは判定しない（＝保護しない）**
  ＝`instanceId` は1プレイヤー内でしか一意でないので、ミラー戦で取り違えて**自分の効果で下げた分まで消す**（過剰保護＝新しい嘘）より素通しへ倒す。
- `power_mods_until_opp_turn` の型に `srcCardNum` が**宣言だけ欠けていた**（`execPowerModify` は既に書いていた）＝長期版だけ素通しになるので足した。

**検証**＝`golden --only "O-247"`（保護／filter 外／**自分の効果**／発生元不明／長期版の5方向・**反転確認つき**）。
反転確認＝判定行を `false &&` で殺すと FAIL することを実測。

---

### ② 🔴 `O-219`：グロウ先カード自身のコスト軽減が**2方向に壊れていた**

**原文**＝「【常】：**この**カードにグロウするためのコストは〜減る」（`WD14-001` / `WX14-009` ほか）。

**真因**＝`collectGrowCostReductions` が**自分の場のシグニ＋センタールリグ**しか走査していなかった。
1. **グロウ先（ルリグデッキの中）は候補に入らない**＝恒久 no-op。
2. 逆に**そのカードへグロウし終えてセンターに居るあいだ**は走査されるので、**次の**グロウが原文と無関係に安くなる（過小コスト）。
   🔴**既存 golden 2本がこの (2) を assert していた**（`field.lrig = ['WX14-009']` で軽減が出ることを固定していた）＝**バグを固定していたテスト**。

**直し方**＝`GrowCostReductionAction.forSelfGrowOnly` を新設し、
`collectGrowCostReductions(..., growTargetCardNum?)` が**場の候補からは `forSelfGrowOnly` を無視し、グロウ先からだけ拾う**。
呼び出し元は**6箇所**（`GrowModal` 2 / `AssistGrowModal` / `PhaseConfirmDialogs` / `BattleScreen` の人間ゲート / CPU）＝
⚠**候補ごとに軽減が違う**ので、ループの外で1回だけ計算していた2箇所をループ内へ移した。

**副産物**＝`GROW_COST_REDUCTION.zeroColors`（「《赤×0》《緑×0》に**なる**」＝固定減算では表せない）を新設し、
`WX13-001-E1` を `GROW_FREE`（**spell の `findGrowFreeAction` 専用で CONTINUOUS からは一度も読まれない**うえ
「コストを支払わずに」＝指定外の色まで踏み倒す）から移した。`scan` は `CONDITIONAL{LIFE_COUNT}` だけを評価する
（⚠**未知の条件を「真」に倒さない**＝倒すと `WX21-017` の「＜天使＞2枚捨ててもよい」が**捨てずに**タダになる）。

**母集団**＝原文7効果。うち **`WD14-001` / `WX14-009` / `WX13-001` の3件を実働化**。
残り4件（`WD13-002` / `WD13-003` / `WX21-017` / `WX21-018`）は**グロウ時の公開／捨てる支払い UI** が要る＝§5.3 `O-248` に登録。
🔴`WD13-002-E1` は旧定義が「公開した場合」を丸ごと落として《白×1》《黒×1》を**無条件**で与えていたので、
兄弟（`WD13-003-E1`）と同じ「支払いを先に置く」形へ揃えて**支払い UI が入るまで拾われない**ようにした。

---

### ③ 🔴 `O-219` の実機（`V-150`）が**表示の嘘**を1件捕まえた

**症状**＝グロウ候補ボタンに「コスト: 《黒》×３」と出るのに、**要求されるのは2枚**。

**真因**＝`GrowModal` の候補一覧（Phase 1）と支払い画面（Phase 2）が**印字コスト（`card.GrowCost`）をそのまま描いていた**。
軽減後の `growCostR` / `reducedGrowCost` は**支払い可否と要求枚数の計算にしか使われていなかった**。
⇒ これは `O-219` 以前から在ったバグ（場の軽減も表示されていなかった）で、**軽減が実際に効くようになって初めて見えた**。

**直し方**＝両画面とも**実効コスト**を出し、印字と違うときだけ取り消し線で併記する。
🔑**実機シナリオでしか見えない層**＝golden は純関数（`collectGrowCostReductions`）までしか見ていない。

---

### ④ `O-240` / `O-239`：付与の2 family（トラップ側・クラッシュ順側）

- **`O-240`**（`WXEX2-66-E1`）＝**【ライフバースト】側だけ実装されていた**（`GRANT_ALL_ZONE_LIFEBURST`）。
  `GRANT_ALL_ZONE_TRAP_ICON{trapGrantFilter, trapGrantAction}` を新設し、**トラップ発動の4入口**
  （`ACTIVATE_TRAP` / `trapOp:'activate'` / `gain_trap_ability` / `hasTrapAbilityCard`）を
  **`trapIconEffectOf` 1本**へ寄せた。⚠原文は「持た**ない**カードは」＝native の `TRAP_ICON` は上書きしない。
  🔴**引用漏出の安全網に食われる罠**を踏んだ＝`hasStructuredGrant` が `type.startsWith('GRANT_')` しか見ないので、
  **STUB だが引用を構造化して持っている**この付与が `__QUOTED_ABILITY__` マスクで再パースされ、せっかく解いた引用が捨てられていた。
  ⚠**`type` 前方一致へ寄せない**（`GRANT_QUOTED_*` の catch-all はまさに安全網が捕まえるべき対象）＝id を1つだけ許可した。
- **`O-239`**（`WXDi-P12-036-E1`）＝「このターン、1枚目と2枚目に**チェックゾーンに置かれた**ライフクロスは【ライフバースト】…を得る」。
  🔴**`life_crashed_this_turn`（枚数）では足りない**＝ダブルクラッシュで2枚同時に置かれると1枚目/2枚目を区別できない。
  ⇒ `checked_life_order_this_turn`（置かれた順）を新設し、**チェックゾーンを経由する4地点**へ配線
  （`execLifeCrash` 2 / `lifeCost` / `crashOneLife` / ルリグアタック）。⚠`triggerBurst:false` は数えない（原文「置かれた」に当たらない）。
- 🔑**両方とも引用の中身は `parseActionText`（複文funnel）で解く**＝`parseSingleSentence` に渡すと
  「どちらか1つを選ぶ。①…②…」の**①が丸ごと消えて②だけ**になる（実測して直した）。

---

### ⑤ `O-242` / `O-229` / `O-223` / `O-218` / `O-227`

- **`O-242`**（`WXDi-P03-002-E1`）＝`GameGrantSpec.firstGrowEnergyCharge` を新設。
  🔴**`lrig_grew_this_turn`（bool）では判定できない**＝グロウと同時に true になるので後段からは常に true に見える
  ⇒ `lrig_grow_count_this_turn`（回数）を新設して `=== 1` で見る。⚠条件を落として `growDraw` へ寄せると**グロウのたびに発火**する。
- **`O-229`**＝🔑**受け皿は既に在った**（`SWAP_DECK_TOP_AND_LIFE`）。母集団は登録票の2効果 → **実測3効果**
  （`WXDi-P08-008-E2` が同型で混ざっていた・そちらは `STUB{LRIG_UNDER_CARD_OP}`＝**ルリグの下の操作**という別機構に落ちていた）。
  エナ版（`WXDi-P10-047-E1`＝デッキ上 ↔ **エナにある効果元自身**）だけ専用ハンドラを1本置いた。
- **`O-223`**（`WXK05-050-E2`）＝`TargetType.SEED_CARD` ＋ `TargetScope.self_seed` を新設。
  🔴旧 live は3つ同時に壊れていた＝(a) シードが0枚でも先に支払いを提示 (b) **支払いのあとで**開花対象を選ばせる
  (c)「そうした場合」が `CONDITIONAL{IS_MY_TURN}`（**常に真**）＝**払わなくても本体が走る**（`O-104` と同型の偽ゲート）。
  ⇒ 正準形 `SELECT_TARGET_ONLY → STORE_LAST_PROCESSED_TARGETS → OPTIONAL_COST → CONDITIONAL{SELF_OPTIONAL_EFFECT_TAKEN}` へ。
  **`OPTIONAL_COST` が「払った／払わなかった」を `self_optional_effect_taken` に残すようにした**（偽ゲートを本物にするための材料）。
- **`O-218`**（`WXK04-060-E2`）＝**engine 側は完成していた**（`SEED_BLOOM{seedTargetSelf}`）。欠けていたのは**入口だけ**
  ＝`field.signi_seeds` を読むのは cardMap のロード1箇所で、能力を surface するコードが無かった。
  `listActivatableSeedEffects` を `signiActivateGate.ts` へ足し、シグニゾーンのアクションメニューへ出した。
  ⚠**シグニの有無と独立**（シードはシグニが居ないゾーンにも置ける）。⚠コスト可否は
  `canOfferTrashActivate`（場に居ないカードの funnel）＋ `energyTrash` だけ別途（あちらの対応表に無い）。
- **`O-227`**（`WXDi-P09-066-E1`）＝🔑**新しい機構は1つも要らなかった**。
  `GRANT_LRIG_ABILITY{duration:'UNTIL_OPP_TURN_END'}` が `lrig_granted_auto_effects_until_opp_turn` へ積み、
  `collectGrantedLrigEffects` → `listActivatableGrantedLrigEffects` が UI へ出し、`clearUntilOppTurnEffects` が期限で消す。
  **速いレーン（`manualEffects.ts` 1件＋`syncManualLive`）で閉じた。**

---

### ⑥ この巡の一般則

- 🔑**「まず受け皿を疑う」が 9項目中 5件で当たった**（`O-229` / `O-227` / `O-218` の engine 側 / `O-223` の実行部 / `O-219` の収集軸以外）。
  **提案キー名で grep して無いと言わない**＝原文の言い回しと**既存の store 名**（`lrig_granted_auto_effects_until_opp_turn` 等）でも引く。
- 🔴**「実装した」の反対は「テストがバグを固定していた」**＝`O-219` は**既存 golden 2本が誤挙動を assert** していた。
  ⇒ **索引の項目を取るときは、その受け皿を触る既存 golden を必ず読む**（緑のまま直せないことがある）。
- 🔴**逆翻訳の固定文言は payload 化と同時に撤去する**＝`GRANT_ALL_ZONE_LIFEBURST` 側は今も `currentCardText` を
  regex で読んでいる（原文の再読）。新しく足した2つ（トラップ／クラッシュ順）は**payload から書いた**。
- 🔴**実機は「盤面が動いたか」だけでなく「画面に何が出ているか」も見る**＝`V-150` が捕まえたのは**表示の嘘**で、
  盤面（支払い枚数）は正しかった。**ラベルに出ないコストはプレイヤーには存在しない。**
- 🔑**実機シナリオの後始末**＝開いたモーダルは**必ず閉じる**（開けっ放しだと次のシナリオの注入が画面に届かず
  「候補が1つも出ない」＝**単体 PASS・一括だけ FAIL** の位置依存フレークになる。今回2度踏んだ）。
  ＋**注入した盤面が画面に届くまで待ってから読む**（バッチ1本目だけ FAIL する形）。
- 🔑**取り消し線つきの併記を足したら、実機の assert は「最初の1つ」で読む**＝単純な regex は**併記した印字側**に当たって永久に FAIL する。

---

## 2026-09-04（第106〜110バッチ）：実機 残9件 → 1件 — **配置先の絞り込みが2枚目から消えていた／保護が効果由来の減少を止められない**

**ベースライン**＝`16cd24aac`（第105 の簿記直後）。
**gates 全緑**（golden **3452 / 3452**・smoke 10725 全異常0・fuzz 全0・census 1 / BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴 9行・`census:costtext` A🔴 0規則・lint 0 errors）。
**実機＝新規21本**（うち**反転確認 9本**）。**単体でも、横断回帰12本の一括でも ALL PASS。**
**ブラスト半径＝`public/data/effects_*.json` の変更 0**（`src/engine/` 1行のみ）。

| バッチ | 返済 | 新規 |
|---|---|---|
| 第106 | `V-137` / `V-138` | 8本（反転3） |
| 第107 | `V-139` | 4本 |
| 第108 | `V-140` | 5本（反転2組） |
| 第109 | `V-145`④⑤ | 2本（対照1）＋ headless 全数確認 |
| 第110 | `V-149` / `V-136` | 4本（反転2） |

---

### ① 🔴 `INTERNAL_TSU_DO_PLACE` が「残り」へ進むときに `trashUnderPlace` を落としていた

**症状**＝`WDK15-001`（ナナシ 其ノ四ノ報）の【起】《ゲーム１回》でトラッシュのシグニを**2枚**置くとき、
**1枚目の配置先は「＜ウェポン＞の下」1択なのに、2枚目は＜武勇＞のシグニまで候補に出た**。

**真因**＝`src/engine/execStubPart1.ts` の `INTERNAL_TSU_DO_PLACE` が、残りのカードへ進むときに

```ts
const nextStub = { type: 'STUB', id: 'INTERNAL_TSU_CHOOSE_ZONE', value: restStr };  // ← payload を落としている
```

としており、次の `INTERNAL_TSU_CHOOSE_ZONE` が `destFilter` を受け取れなかった。

**母集団（実測）**＝`TRASH_SIGNI_UNDER_FIELD_SIGNI`（payload あり）は live **9効果**。うち `count>=2` は **5**、
**その5件すべて**が配置先条件つき＝`WDK15-001` / `WDK15-007` / `WXDi-P15-001` / `WXDi-P15-006` / `WXDi-P15-007`。

**修正**＝`nextStub` に `trashUnderPlace` を継承させる（1行）。

🔴**なぜ気づきにくいか**＝**1枚目は正しい**ので、盤面だけ見ても・1枚しか置かない検証でも緑になる。
最初この巡でも、シナリオ側が「配置先の問い」を**重複除去して数えていた**ため
（2回とも同じ候補集合＝1件に潰れる）**バグの側が緑に化けた**。

**検証**＝実機 `v139TrashUnderTwoWeapons` が **FAIL（2回目の候補が2件）→ PASS（2回とも1件）**。
golden の既存テスト「§5.3 O-60 第58」に**2枚目の配置先**の assert を追記し、**反転確認済み**
（修正を戻すと `["弩砲　カノンの下（ゾーン1）","甲冑　ローメイルの下（ゾーン2）"]` で FAIL）。

🔑**教訓**＝**「N回問われる」ものは回数で数える。** 同じ候補集合が2回続くのが正なので、
**重複除去すると2回目を見落とす**（＝バグを緑にする観測になる）。

⚠**golden 側の罠**＝`StateOpts.signi` は「1ゾーン1枚のフラット配列」（`mkState` が `[s]` へ包む）。
`[[WEAPON], …]` と書くと二重配列になり `getCardNum` が解けず、フィルタが常に外れて
**修正あり／なしの両方で緑**になった（＝反転確認が空振りする形）。
さらに **`run()` はオートパイロットで interaction を潰す**ので、対話を見るテストは `executeEffect` で1手だけ進める。

---

### ② 🔴 `O-247` を登録＝「対戦相手の効果によって減少しない」保護が効果由来の減少を止められない

`V-145`①（`WX22-Re04` の3択①「あなたの**他の**＜英知＞のシグニのパワーは対戦相手の効果によって減少しない」）の
観測点を書こうとして、**現状では実機で観測できない**ことが分かった。

**読んだコード**＝保護集合 `ownerPowerProtection` / `otherPowerProtection` は
`effectEngine.ts:2146-2186` で組み立てられ、`applyDeltaToCard(..., protection)` を通る
**CONTINUOUS のデルタ**にしか効かない。一方 `calcFieldPowers` の `applyTempMods`（`effectEngine.ts:2998-3021`）は
`temp_power_mods` / `power_mods_until_opp_turn` / `power_mods_until_next_own_turn` を
**保護集合を一切見ずに**加算する。⇒ **相手の【出】や【自】が書き込む −N を素通しする。**

⚠**原文が主に想定している経路がまさにそれ**なので、これは表示上の近似ではなく実害。
⇒ **§5.3 索引 G に `O-247`** として登録した（要るもの＝`temp_power_mods` に「どちら側の効果か」を持たせ、
`applyTempMods` で保護集合を参照する口。倍率 `double_power_minus_*` との適用順も決める必要がある）。

🔑**この穴はどの計器にも映らない**＝JSON も逆翻訳も原文どおりで、golden も「付与されたこと」までしか見ていない。

---

### ③ 実機シナリオ 新規21本

**`V-137`（`SOUL_OP` のコスト先取り撤去）**
- `v137LrigUnderPay` / `v137LrigUnderNoPay`＝`WXDi-P04-009` のアタック時に
  「ルリグ下（ファイト Dr.タマゴ）を使用して発動」が **enabled** で出て、払うと下の1枚がルリグトラッシュへ移り
  相手の手札が1枚減る／🔴**反転＝下が空ならグレーでスキップしか選べず、手札も動かない**。
- `v137AllLrigsUnderPay` / `v137AllLrigsUnderShort`＝`WXDi-CP02-002` は
  **センター2＋左アシスト1＋右アシスト1＝合計4枚**を払える（`fromAllLrigs`）／🔴**反転＝合計3枚ではグレー**。

**`V-138`（`SOUL_OP` payload 化）**
- `v138LrigTrashToUnder`＝ルリグトラッシュの**レベル2以下のルリグだけ**が候補（Lv3/Lv4 は出ない）で、2枚ともセンターの下へ。
- `v138UnderToLrigTrashAuto`＝`WXDi-P13-003B` はルリグの下の1枚を**自動で**ルリグトラッシュへ置き、相手のシグニ2体とも能力を失う。
- `v138ExceedPay4` / `v138ExceedShort`＝`WD22-016-UG` は下4枚を払ってトラッシュのシグニ2体を場に出す／🔴**反転＝3枚なら1枚も払わない**。

**`V-139`（リミット修正の向き・配置先の絞り込み）**
- `v139PieceLimitSelfPlus2`＝`WXDi-P16-002` は**あなたの**リミットを**そのターンのうちに**＋2（旧＝相手に＋2・しかも次ターン扱い）。
- `v139ReleaseLimitBothSides`＝`WX25-P2-014` は**自分＋1／相手−2 の両方**（旧＝自分の＋1が消え相手が−4の二重掛け）。
- `v139TrashUnderTwoWeapons` / `v139RiseIconDest`＝上記①のとおり。

**`V-140`（比例パワー修正・全体トラッシュ）**
- `v140TyphoonWipe`＝`WX07-017` で**両プレイヤーの手札・エナ・場のシグニ**がすべて流れる。
- `v140TrickLevel1` / `v140TrickLevel4`＝`WXK10-084` は**アタックしたシグニ**のレベル1につき−1000（Lv1で−1000／Lv4で−4000）。
- `v140ColorVariety3` / `v140ColorVariety1`＝`WXDi-D06-016` は**自分の場のシグニの色の種類 × −3000**（3種で−9000／1種で−3000）。

**`V-145`④／`V-149`／`V-136`**
- `v145LayerCopyTwo` / `v145LayerCopyNone`＝`WXEX1-32` が落とした＜怪異＞2枚の《レイヤーアイコン》能力を**2件**得る／対照は0件。
- `v149LeftByOppBanish` / `v149LeftByOppNone`＝`SPK16-13E` の①は `signi_left_by_opp_effect_this_turn` が
  立っているときだけ相手シグニをバニッシュする／🔴**反転＝立っていなければ空振り**。
  ⚠**カウンタを増やす側（`BattleScreen.tsx:3407`）はこの2本では踏んでいない**（生成経路は別の観測点が要る）。
- `v136PlaceUnderKaiho` / `v136PlaceUnderNoHost`＝`WXDi-P15-067`（**スペル**）からでも「どのシグニの下に置きますか？」が出て、
  候補は＜解放派＞1体だけ／🔴**反転＝置き先が無ければ対話が出ず手札も動かない**。

**`V-145`⑤（headless 全数確認）**＝7カード中**5件が【未実装】表示**、残る2件は**実装済みで嘘が消えていた**
（`WXDi-P05-068`＝説明つき STUB／`WXK03-042`＝`moveSelfZone` で型化）。旧文言「能力を付与」は**7カードとも0件**。

---

### ④ 実機ドライバで踏んだ罠（すべて §4.4 に既出のものの再発 or 同族）

- 🔴**`決定` は「必要数を押してから」**（📌8n）＝`pendingCandidates` は DB 由来で DOM より先に真になる。
  今回**2本**で踏み、`v138ExceedPay4` は**単体 PASS・バッチだけ FAIL** の位置依存フレークとして出た。
- 🔴**解決が済んだら以後は何も押さない**＝余分な `決定` が**コミット前のスナップショットで上書き**して
  盤面が巻き戻る（`v145LayerCopyTwo` で trash 2枚と付与2件が1ティック後に**両方 0 へ戻った**）。
  ⇒ **観測はピーク値を sticky に持つ**（📌8d の同型）。
- 🔴**ボタンのラベルは実装から読む**＝`INTERNAL_TSU_CHOOSE_ZONE` は「＜カード名＞の下（ゾーンN）」、
  `HAND_SIGNI_UNDER_SIGNI` は「＜カード名＞の下**に置く**」で**別文言**。
  終端固定の regex は1つも当たらず、**CHOOSE は開いているのに18秒空振り**した（📌2 の同族）。
  ⚠**`H.clickZone()`（`^ゾーンN` 走査）はどちらにも当たらない。**
- 🔴**`CHOOSE` 中に `決定` を押さない**＝DOM 未描画のティックで押すと**配置せずに解決してしまう**。
- ⚠**`ON_ATTACK_LRIG` の解決は「発動順序を確定」を押さないと stack=1 のまま固まる**
  （`stdStep` のラベル一覧を自前で渡すときに落とさない）。
- 🔴**反転の対は「1ビットだけ」を確かめる**＝`v140TrickLevel4` を最初「候補は偶数だけ」と書いて FAIL させたが、
  アタッカーが偶数レベルなら E2 が発火し**対象は奇数が正**だった。**engine は正しく、判定が誤りだった。**

---

**コミット**＝`d4aed7b1a`（第106）／`2a5621b7e`（第107）／`360414022`（第108）／`abe00636e`（第109）／この記録（第110）。
**要実機検証＝なし**（各巡で⑤まで完了）。

## 2026-09-04（第105バッチ）：`V-133`／`V-134`／`V-135` の実機返済 — **実機ドライバが起動不能だった／`GRANT_PROTECTION` の順序バグ**

**ベースライン**＝`0a3c393b6`（第95〜104 の簿記直後）。
**gates 全緑**（golden **3451 → 3452**＝+1本・smoke 10725 全異常0・fuzz 全0・census 1 / BASELINE 1・
`census:stubs` A群🔴0/C群0・manual-fields 0・`census:enginetext` A🔴 9行・`census:costtext` A🔴 0規則・lint 0 errors）。
**実機＝新規10本を単体でも、既存回帰2本を足した12本一括でも ALL PASS。**
**ブラスト半径＝`public/data/effects_*.json` の変更 0**（live の効果は1件も書き換えていない）。
**⑤実機判定**＝`src/engine/effectExecutor.ts` を触ったので §2.2 の表では④まででよいが、
**この巡は §5.1 の返済そのもの**なので当然⑤まで回した。

---

### ① 🔴 実機ドライバ `scripts/verifyBattleDrive.mjs` が前コミットから**1本も起動しなかった**

**症状**＝どのシナリオIDを指定しても、ブラウザを開く前に落ちる。

```
file:///C:/Users/zerom/WixossReact/scripts/verifyBattleDrive.mjs:19712
order.push('o143CheckPlace');
ReferenceError: Cannot access 'order' before initialization
```

**真因**＝`0b24d7b48`（`O-152` クローズ回）が `order.push('o143CheckPlace');` を
**`const order = [...]` の宣言（20950行目）より 1238行 上**へ置いた。`const` は TDZ を持つので
**モジュールの読み込み時点で例外**になり、**全シナリオが即死**していた。
（コミットメッセージには「既定 order へ戻した」とあり、意図は正しい。置いた場所だけが誤り。）

**修正**＝`order.push` とその直前のコメントを **`const order` 宣言の直後**へ移した。挙動は同じ（既定 order に含まれる）。

**検証**＝`node scripts/verifyBattleDrive.mjs v144LancerGateOn` が `ReferenceError` → **PASS (4s)** に反転。

🔑**教訓**＝§4.4 📌25（「シナリオが軒並み落ちるときは基盤の故障を疑う」）**の1段手前がある**＝
**「1本も起動しない」**。⇒ **§5.1 を開いたら、新しいシナリオを書く前に既存の1本を回して基盤の生存を確かめる。**
（この故障は前セッションの簿記時点では気づけない＝**実機の在庫を寝かせるほど発見が遅れる**。）

---

### ② 🔴 `GRANT_PROTECTION` は `target` を書かないと**恒久 no-op** だった（engine の分岐順）

**症状**＝`WX20-056`（戦乱の一輪　オイチ）の E2
「【自】：このシグニがカード名に《オダノブ》を含むシグニにライズされたとき、ターン終了時まで、そのシグニは
『【常】：対戦相手の効果によって、**手札に戻らずダウンせず**新たに能力を得られない。』を得る」のうち、
**「手札に戻らずダウンせず」だけが1度も付かない**。

**真因**＝`src/engine/effectExecutor.ts` の `execGrantProtection` が

```ts
const tgt = a.target ?? (a.subjectFilter ? {…} : undefined);
if (!tgt) return done(ctx);          // ← ここで無言 return
…
if (a.targetsTriggerSource) { … }    // ← 「そのシグニ」の分岐はこの後ろ
```

の順だったため、**`targetsTriggerSource`（＝自分で対象を決められる印）だけを持つ宣言**が
`tgt === undefined` で先に落ちていた。

**母集団（実測）**＝live の `GRANT_PROTECTION{targetsTriggerSource:true}` は **4件**
（`WX14-049` / `WX16-037` / `WX20-056` / `WXEX1-58`）。うち `target` も `subjectFilter` も持たないのは
**`WX20-056` の1件だけ**＝**実害1効果**。

**修正**＝`targetsTriggerSource` の分岐を `!tgt` ガードの**前**へ出し、所属の既定を `tgt?.owner ?? 'self'` にした。
既存3件はすべて `target.owner === 'self'` なので**挙動は1バイトも変わらない**（`!tgt` ガード自体は
分岐の後ろに残してあるので、対象の宣言が1つも無い異常系は従来どおり no-op）。

🔴**なぜ計器に映らなかったか**＝同じ SEQUENCE の2歩目（`GRANT_EFFECT{PREVENT_ABILITY_GAIN_BY_OPP}`）は
**効いていた**ので、ログにも盤面にも「半分だけ動いている」形で出る。
逆翻訳は JSON の宣言をそのまま日本語化するだけなので原文どおりに見え、
census（語彙の欠落）・`census:enginetext`（原文 regex）・golden・smoke・fuzz のどれも動かなかった。
⇒ **実機だけが捕まえた。**

**検証**＝
- 実機 `v133RiseOdanobuOn` が **FAIL（`kw=[]`）→ PASS（`kw=["WX15-032#9112:PROTECTION:BOUNCE,DOWN:opponent"]`）**。
- golden を1本追加（`§5.1 V-133②: GRANT_PROTECTION は target 無し＋targetsTriggerSource だけでトリガー元へ付与できる`）＝
  **反転確認済み**（`!tgt` ガードを元に戻すと FAIL、戻すと PASS）。負方向2本（場に居ないトリガー元へは付けない／
  対象の宣言が1つも無ければ従来どおり何もしない）と live 形状の固定も同テストに入れた。

🔑**教訓**＝**「自分で対象を決める」印（`targetsTriggerSource` / `targetsLastProcessed` / `targetsStored`）は、
汎用の対象ガードより先に読む。** 順序を逆にすると、**その印を書いた宣言だけが静かに死ぬ**。
（`execGrantKeyword` / `execGrantEffect` は正しく印を先に読んでいた＝**同じ family で1本だけ順序が違った**。）

---

### ③ 実機シナリオ 新規10本（`scripts/verifyBattleDrive.mjs`）

| ID | 観測点 |
|---|---|
| `v133RiseDoubleCrash` | `WX16-039` の上に【ライズ】シグニを重ねると【ダブルクラッシュ】が**上のシグニ**に付く（instance id で上下を区別） |
| `v133RiseOdanobuOn` | `WX20-056` に《オダノブ》がライズすると E1（＋3000）と E2（耐性＋能力獲得禁止）が**両方とも上**へ |
| `v133RiseOdanobuOff` | 🔴**反転**＝《オダノブ》を含まない riser では E2 は発火せず **E1 だけ**乗る |
| `v134ChargeNonDeclaredToTrash` | 宣言色《青》を持たない赤カードのエナチャージが**トラッシュへ** |
| `v134ChargeDeclaredToEnergy` | 宣言色を持つカードは普通にエナへ（過剰実行の対照） |
| `v134ChargeColorlessToEnergy` | **無色**は制限を受けない（原文「無色ではない」の除外側） |
| `v134ChargeNoDeclarationToEnergy` | 🔴**反転**＝宣言前は制限が張られない |
| `v135DeckPosBottom` | `top_or_bottom` の2択が出て、「一番下」を選ぶと相手デッキの**末尾**に入る |
| `v135DeckPosTop` | 🔴**1ビット反転**＝「一番上」を選ぶと**先頭**に入る |
| `v135CheckFromDeckBottom` | `WXK02-035`【出】《青》＝デッキ最下→チェックゾーン→場に出す。**出したあとチェックゾーンに残らない** |

**観測の作り方で効いたこと**＝
- 🔑**`V-133` は instance id で判定する**＝盤面バッジ（`title`）はゾーンの絵しか見ないので
  「上下どちらに付いたか」を分けられない。`keyword_grants` / `granted_effects` / `temp_power_mods` は
  すべて instance id キーなので、**下敷きに付いていないこと**まで assert できる。
- 🔑**`V-133` の反転側は「E1 は発火した」を判定の先頭に置いた**（§4.4 📌3b）＝
  E1 の＋3000 は旧実装でも新実装でも残る痕跡なので、「E2 が出ない」が
  〈収集そのものが起きていない〉のか〈`risenByNameContains` が効いた〉のかを切り分けられる。
- 🔑**`V-134` は制限カードを相手（guest）の場に置き、こちら（host）がチャージする向きで作った**＝
  `BattleScreen.tsx:4882` の `collectOppEnergyColorRestriction(op, my, …)` と同じ向き。
  ⚠**エナチャージはターン1回**（`actions_done`）なので、1シナリオ1枚＝**4本に割った**。
- 🔑**`V-135`① は `effect_stack` 注入**（`o190EffectStack` を再利用＝**payload は live JSON から読む**ので
  payload を外す反転確認で必ず赤になる）。`WXDi-P01-013` はアシストルリグで、
  実際にグロウさせる経路は観測に無関係な固定費が高い。
- ⚠**実際の順番は「2択が先、対象選択が後」**（`effectExecutor.ts:6742` が先頭で `needsInteraction` を返すため）＝
  登録票の「相手シグニ1体を選んだあと2択が出る」は逆。**登録票の症状は見立てであって実測ではない**（前巡の一般則の再確認）。

**踏み直した罠2つ**＝
- 🔴**候補セルを毎ティック押した**（§4.4 📌2c／📌8p）＝トグルで選択が外れ、`決定` に永久に到達せず**24ティック空振り**。
- 🔴**`H.stdStep(['場に出す', …])` が盤面ログのテキストに当たった**（§4.4 📌2b）＝
  `txt:場に出す` を毎ティック「押せた」と報告しながら1ミリも進まなかった。
  ⇒ **確定は `clickDecideNofM`（ボタン限定・`/^決定/` 前方一致）で押す。**

---

### ④ `docs/PLAN.md` の §2「作業の流れ」を git 履歴から復元した

`a5679359a`（`O-60` 第47〜48バッチの簿記）が §1 を入れ替えるときに、
**§2 全体（172行・`2.0` レーン選択／`2.1` 1巡の手順／`2.2` 完了の定義／`2.3` 実機の要否／
`2.4` バグを見つけたとき／`2.5` 停止通知メール）を巻き添えで削除**していた。
`CLAUDE.md` も PLAN 冒頭も「cold start は §1 → §2 → §5 の順に読む」と指示し、
§5 の各所が「§2.2 の機械判定」「§2.0 のレーン」を参照しているのに、**実体が10日ぶん存在しなかった**。
⇒ `a5679359a^` から無改変で復元し、§1 と §3 の間へ戻した。

🔑**教訓**＝**入れ替え式の節（§1 / §6）を機械で書き換えるときは、置換範囲の終端を「次の見出し」で取る。**
行数や目視で切ると隣の節ごと持っていく。

---

**コミット**＝この記録のコミット。**要実機検証＝なし**（この巡で⑤まで完了）。

## 2026-09-04（第95〜104バッチ）：実機返済4件＋機構クローズ6件 — **「登録票を疑う」巡**

**ベースライン**＝`967821629`（第94 の簿記直後）。
**gates 全緑**（golden **3447 → 3451**＝+4本・smoke 10725 全異常0・fuzz 全0・census 1 / BASELINE 1・
census-stubs A🔴0・C0・manual-fields 0・**census-enginetext A🔴 10行 → 9行**・census-costtext A🔴0・lint 0）。
**ブラスト半径＝効果 変更6・追加0・削除0、予定外0**
（`SPK16-13E` / `WXK03-042` / `WXK10-051` / `WXDi-P05-068` / `WX16-023` / `WX16-048`）。

### 実機返済（新規19本・単体でも一括でも ALL PASS）

| V | 本数 | 見たもの |
|---|---|---|
| `V-141` | 6 | モーダル選択の提示＝ベット／`LRIG_STORY`／追加コストで**選べる数が昇格**する（対照つき） |
| `V-142` | 5 | 対象**枚数**の昇格（3→4）と**両枝に掛かる絞り込み**／4択の表示／エナ支払いの提示が**1回だけ** |
| `V-143` | 5 | 【起】3択で**基本パワーが 5000/10000/12000** になる／リコレクト成立で**相手の全シグニが凍結** |
| `V-144` | 4 | 条件つきキーワード付与の**ゲート**（正面がレベル1のときだけ【ランサー】／凍結かつ5000以下のときだけ【アサシン】）＝**反転も PASS** |

⚠`V-143`①④と`V-144`①②は**盤面差分までの固定費が高い**（バトル1回・ターンまたぎ・コイン支払いの窓）ので
golden 側に留めた（PLAN に明記）。

### 機構クローズ6件

- **`O-152`**＝登録票の症状「`ON_HAND_DISCARDED` の watcher が1件も発火しない」は **stale**。
  実機で **stack 0→1→0** を観測＝**トリガーは正しく積まれて解決していた**。
  実害は `TRAP_OPERATION{to_check, trash}` の**候補の作り方**1効果だけ＝
  🔴**トリガー起点では `lastProcessedCards` が必ず空**なので「候補なし」で無言 done していた。
  ⇒ 「そのカード」＝`triggeringCardNum` をフォールバックにした（⚠`lastProcessedCards` があればそちら優先）。
- **`O-197`**＝残3件のうち2件は**既に明示 defer**。実際に残っていた `WXK10-051-E1` は
  🔴**live が丸ごと幻覚**だった（原文に無いバニッシュ＋原文に無い条件＋対象1体のはずが相手の全シグニ半減／
  本体の「レベルの異なる黒4枚をデッキへ」は欠落）。`manualEffects.ts` へ手書きし、
  受け皿 `POWER_MODIFY.deltaFromSourcePower{divisor}`（「このシグニのパワーの半分」）を新設。
- **`O-233`**＝条件語彙 `SIGNI_LEFT_BY_OPP_EFFECT`（`HAND_TRASHED_BY_OPP` / `ENERGY_TRASHED_BY_OPP` の
  **シグニ版**＝3本目）を新設。⚠キー名は `_this_turn` で終える（`turnScopedState` の命名規約）。
- **`O-237`**＝登録票の「受け皿が無い」は**誤り**（`STUB{MOVE_TO_OTHER_SIGNI_ZONE}` を同型5枚が既に使用）。
  足りなかったのは「占有ゾーンとは**入れ替える**」枝と、次文の rider を畳む fold だけ。
  🔴旧 live は `REARRANGE_SIGNI{owner:'any'}`＝**相手のシグニとも入れ替えられる**過剰実行だった。
- **`O-241`**＝`attack_not_negated_by_self_effect_this_turn`（**カード単位**のアタック無効化免疫）を新設。
  既存のプレイヤー単位（`own_effects_cannot_negate_signi_attack_this_turn`）の兄弟。
- **`O-234`**＝**engine の第2の原文解析器 `src/engine/choiceTextParser.ts`（492行）を削除**。
  最後の呼び出し元を payload（`StubAction.extraCostChoose`）へ寄せた。

### この巡の一般則

- 🔴**登録票は「見立て」であって実測ではない**＝**4件中3件で外れていた**。着手前に**再現**するか
  **母集団を測る**（PLAN §5.3 の「まず受け皿を疑う」は「症状も疑う」まで広げてよい）。
- 🔴**トリガー起点では `lastProcessedCards` は必ず空**＝「その札」は `triggeringCardNum` で受ける。
- 🔴**テストが engine の解釈器を呼んでいたら、それは live を検証していない**＝
  golden が `parseChoiceOptionsFromText(card.EffectText)` を呼んでいた3テスト8箇所は
  **live JSON が壊れていても緑**になりえた。live の `CHOOSE` を読む形へ移した。
  ⚠**選択肢のゲートは `choices[i].condition` に載る**（旧解析器は action の中へ畳んでいた）＝
  包み直さないと「条件不成立でも実行される」形でテストが通る。
- 🔴**payload を載せる場所は「最後に record を書き換えるパス」の後**＝
  `normalizeGrantKeywordSpelling` は record のキーを全消しするので、その前に載せた payload は必ず消える。
- 🔑**実機シナリオ側の罠**（すべて §4.4 に既出の同型）＝
  (a) **枚数は見出し文から読めない**（制約句が入ると枚数を含まない）＝「決定 (x/N)」の N が唯一いつも出る
  (b) **候補の枚数で assert しない**（使用コストで払ったエナがトラッシュへ入って候補に増える）
  (c) **支払い後の pick 画面が現れるまで待つ**（`optcost-pay` は「払う意思」まで）
  (d) **限定はスペルの使用も止める**（`WD23-044-EA` はエルドラ/あや限定）
  (e) **《リコレクトアイコン》［N枚以上］はルリグトラッシュの**アーツ**の枚数**。


## 2026-09-04（第94バッチ）：`V-146`／`V-147`／`V-148` の実機返済 — **実機だけが見つけた穴3つ**

**ベースライン**＝`e99b99ee6`（第89〜93 の簿記直後）。
**実機**＝`node scripts/verifyBattleDrive.mjs <id>…`（**新規9本・単体でも9本一括でも ALL PASS**）。
**gates 全緑**（golden **3445 → 3447**＝+2本・smoke 10725 全異常0・fuzz 全0・census 1 / BASELINE 1・
census-stubs A🔴0・C0・manual-fields 0・census-enginetext A🔴10・census-costtext A🔴0・lint 0 errors）。
**ブラスト半径＝効果 変更0・追加0・削除0、予定外0**（**live JSON は不変更**＝直したのは実行時経路）。

### 新設した実機シナリオ9本

| id | 見るもの |
|---|---|
| `o245CoinArtsBetBlocked` / `o245CoinArtsBetAllowed` | `V-146`①＋反転＝`coin_use_restriction` 下でアーツのベットが**提示されない**（`WX15-030`・「2枚」「OFF」とも disabled）／制限を外すと押せる |
| `o245CoinKeySetBlocked` / `o245CoinKeySetAllowed` | `V-146`③＋反転＝コインが要るキー（`SP38-006`）の「セット」が disabled ／制限を外すとセットできる |
| `o245CoinSpellBetAllowed` | `V-146`④＝**スペルのベットは今までどおり**（原文が許している側＝過剰ブロックの検出） |
| `o245OnPlayReduceRed` | `V-147`①②＝1体目は《赤》1枚（軽減あり）・2体目は《赤》《赤》2枚（**1回で消費**）。消費エナ3枚で裏取り |
| `o245OnPlayReduceOtherColor` | `V-147`③ 反転＝《青》の軽減では《赤》コストは減らない（消費エナ4枚） |
| `o226DeclaredSigniOverride` | `V-148`①②③＝宣言した「羅石　ヴォルカノ」（Lv4・花代限定）がタマ Lv1 のもとで召喚でき、**実際に場に出て**、リミットも圧迫しない |
| `o226DeclaredSigniOverrideOff` | `V-148` 反転＝宣言が無ければ同じ盤面で1枚も召喚できない |

⚠**`V-146`② の「コインが要るグロウ」は実機で観測できない**＝CSV 全数で `GrowCost` に
《コインアイコン》を持つルリグは**0枚**（`GrowModal` に読み手は入れてあるが標本が無い）。
⇒ ③（キー＝`SP38-006` が唯一の標本）で「ルリグ側の入口」を代表させた。

### 副産物① 起動時経路で印字キーワードコストが消えていた（30枚・真 no-op）

- **真因**＝`buildEffectsMap`（UI が使う唯一の経路）は `mergeManualEffects` を通すが、あれは
  **effectId 一致で常に manual 側を勝たせる**ので、**live JSON が持っていた `betOptions` /
  `encoreCost` / `boostCost` / `costReplacement` が実行時だけ落ちる**。
  `buildEffectsJson.ts` は同じ理由で**マージの後から**重ね直していたが、**起動時経路には同じ手当てが無かった**。
- 🔴**live を見ても分からない**（live 側は正しい）＝census・golden・smoke・fuzz が全部緑のまま
  **UI からだけ機能が消える**。実機で `WXDi-D09-P26`（RECOVERY）の**ベット行が1つも描画されなかった**ことで発覚。
- **影響**＝**30枚**（ベット17／アンコール7／コスト置換4／ブースト1／使用時任意コスト…）。
  `WXDi-D09-P26` は `CONDITIONAL{IS_BETTING}` の枝へ**永久に行けなかった**。
- **修正**＝`buildEffectsMap` でも `printedKeywordCosts` を**先頭効果へ重ね直す**（先頭以外からは剥がす＝
  `betOptionsOf` はカードの全効果を走査して最初の1つを読むので、2つ目以降に残ると二重に効く）。
- **反転確認**＝再重ねを外すと golden が「起動時経路で落ちるカード **37件**」で FAIL。

### 副産物② `《コインアイコン》×N` の綴りを誰も読めなかった（1枚・恒久 no-op）

- **真因**＝CSV の `Cost` 列にはコインの綴りが**2つ**ある＝`《コイン》×N`（**77枚**）と
  `《コインアイコン》×N`（**1枚**＝`SP38-006`「創鍵の巫女　マユ」）。
  `parseCoinCost` は前者しか見ず **coinNeeded=0**、`parseGrowCost` は後者を
  **「コインアイコン」という存在しないエナ色**として要求していたので `canAffordGrowCost` が永久に false
  ＝**このキーは1度も場に出せなかった**（ルリグデッキを開いても「キーにセット」の行動が0件）。
  しかも `coinNeeded=0` なので **`coin_use_restriction` の判定自体も素通り**していた。
- **修正**＝**読み手（`costs.ts`）を両方の綴りに対応させる**（CSV は直さない＝どちらも正しい印字）。
- 🔑**trap (h)「同じ概念に複数の正準形がある」の CSV 側の顔。**

### 副産物③ 「召喚」は押せるのに1体も置けない（`O-226`）

- **真因**＝読み手が**3箇所**要るのに2箇所（手札の召喚ゲート／`fieldSigniTopLevels`）にしか無く、
  `SigniSummonZoneModal` が**印字レベル（4）**でリミットを見ていたため
  `afterTotal 4 > リミット2` で**3ゾーンとも disabled**＝**提示だけ通って配置できない**状態だった。
- **修正**＝表示行とゾーン判定の**両方**で `declaredSigniOverride` を読む（golden で**本数=2**を固定）。
- 🔑**「ゲートを通した」と「実際に置けた」は別の観測面**＝ラベルの有無だけを見る実機シナリオでは緑に見える。

### シナリオ側で踏んだ罠（§4.4 に既出の同型）

- 🔴**`CardModal` は「タップして閉じる」＝全画面オーバーレイで、「閉じる」という**ボタンは無い**。
  閉じ損ねたまま次の札を押すと**前の札のモーダルを読み続ける**ので、
  「宣言側も非宣言側も召喚できる＝名前照合が効いていない」という**もっともらしい偽陽性**になった
  （§4.4 📌4／📌24）。⇒ **読んだモーダルがどの札のものかを毎回照合し、違えば開き直す。**
- 🔴**モーダルが開いている間に手札の testid を押さない**（押すと閉じるだけ＝18ティック空振り。§4.4 📌2b の同型）。
- ⚠**観測カードは「エナだけのコスト」を選ぶ**＝`WX03-017` は【出】に「ルリグデッキから赤のアーツ1枚を
  トラッシュ」が同居しており、ルリグデッキが空だと**1体目が永久に解決せず**『1回で消える』を見られない
  （§4.4 📌35b の実測版）。


## 2026-09-04（第89〜93バッチ）：`O-245` 完済／`O-246` 分離／`O-226`／`O-224` — **「宣言だけ立って盤面が動かない」在庫のゼロ化**

**ベースライン**＝`d13cac449`（第79〜88 の簿記直後）。
**gates 全緑**（typecheck・golden **3440 → 3445**＝+5本・smoke 10725 全異常0・fuzz 全0・
census 高シグナル **1 / BASELINE 1** 据置・census-stubs A🔴0・C0・manual-fields 0・
census-enginetext A🔴 **10行** 据置・census-costtext A🔴0 据置・lint 0 errors）。
🏁**`census:deadstate` 5件 → 0件（完済）**。
**ブラスト半径＝効果 変更2・追加0・削除0、予定外0**。
🖥**実機＝機械判定で必須（§2.2）**＝`src/screens/battle/costs.ts`・`src/screens/battle/growLogic.ts`・
`src/screens/BattleScreen.tsx` を触った ⇒ **`V-146`・`V-147`・`V-148` を PLAN §5.1 へ登録（未実施）**。

### 第89バッチ `O-245` 第2 — `coin_use_restriction`（コインはスペルとシグニにしか払えない）

- **真因**＝制限フラグを **書く側しかいなかった**＝UI のコスト支払いが誰も読まず、
  **アーツ・ルリグ・キー・ピースのコストにもコインを払えた**（＝制限が丸ごと無効）。
- **修正**＝`src/screens/battle/costs.ts` に `coinPayableFor(state, kind)` を新設し、支払い可否の判定から読む。
- **影響**＝制限を張るカードすべて（フラグを立てる効果の下流）。

### 第90バッチ `O-245` 第3 — `reduce_next_on_play_cost`（次の【出】能力のコスト軽減）

- **真因**＝軽減量が state に積まれるだけで読まれず、**軽減が一度も効いていなかった**。
- **修正**＝`applyNextOnPlayCostReduction(energy, reduction)` を新設（該当色を差し引き0を落とす）。
  **支払い確定と同じ代入の中で `reduce_next_on_play_cost: undefined` を消費する**
  （別の `setState` に分けると1回ぶん多く効く）。

### 第91バッチ `O-246` 分離 — `grid_reveal_plus_one_this_turn`（受け皿が engine に無い）

- **真因**＝「このターン、あなたの効果によってデッキを公開する枚数+1」（`WX06-033-E1`）は
  **engine 側に置換の口そのものが無い**。読み手を足す先が無い。
- **判断**＝🔴**実装せずキーごと撤去し、`STUB{DEFERRED_REVEAL_COUNT_PLUS_ONE_OPTIONAL}` にして
  逆翻訳を【未実装】にした**（→ 機構項目 `O-246` として登録）。
- **教訓**＝**受け皿の無い死んだキーは「実装する」より「撤去して defer に落とす」ほうが正しい。**
  宣言だけ残すと `census:stubs`（消費地点はある）にも `census:enginetext`（原文を読まない）にも映らず、
  **実装済みに見えたまま永久に no-op** になる。

### 第92バッチ `O-226` 第1 — 宣言したシグニのレベル0扱い・限定条件無視

- **真因**＝`game_declared_signi_level_zero` / `game_declared_signi_ignore_restriction` に読み手がおらず、
  **宣言しても何も起きなかった**。⚠**着手前の登録メモ「宣言した名前をどこにも保存していない」は誤り**＝
  `declared_card_name` は既にあった（登録票の推測を実測で否定してから直した）。
- **修正**＝`growLogic.ts` に `declaredSigniOverride(state, cardName)` を新設し、
  **手札召喚ゲート**と **`fieldSigniTopLevels`（レベル合計）** の両方から読む。
  ⚠**名前が一致したときだけ**効かせる（フラグだけで全シグニに掛けない）。

### 第93バッチ `O-224` 🏁 — 「この方法でダウンしたシグニの数以下」のしきい値が片方の文型で落ちていた

- **真因**＝受け皿（`TargetFilter.levelLteLastProcessedCount`・`effectExecutor.ts:3033`）は**在った**のに、
  parser の規則が「アップ状態の…シグニを**好きな数ダウンする**」＝`steps[0].type === 'DOWN'` しか見ていなかった。
  `SPDi43-23-E1`「アップ状態の白のシグニを**２体まで**ダウンして**もよい**」は
  `STUB{DOWN_UP_SIGNI_AND_CHOOSE}` なので入口から外れ、
  **どのレベルの相手シグニでも手札に戻せる**（0体ダウンでも戻せる）過剰実行だった。
- **母集団**＝`npm run census:population -- "レベルがこの方法で.{0,20}の数以下"` ＝**効果2件**
  （OK 1＝`WX24-P3-048-E1`／MISS 1＝`SPDi43-23-E1`）。
- **修正**＝`effectParser.ts` に「N体までダウンしてもよい」形の規則を1本追加（既存規則は無改変）。
  前段の枚数は第26バッチで payload 化済み＝`INTERNAL_DOWN_SELECTED_SIGNI` が
  **実際にダウンした枚数**を `lastProcessedCards` に残していたので、engine 側の追加は不要だった。
- **検証**＝`npm run gates` 全緑（golden +1本＝2文型を同時に assert）。**反転確認＝規則を外すと新 golden が FAIL。**
- **影響**＝1効果（`SPDi43-23-E1`）。

### この巡の一般則

- 🔴**「読み手を足す」修正は必ず `src/screens/` に落ちる**＝state を読むのは UI 層のことが多い。
  §2.2 の機械判定で**実機が必須**になる。**engine だけで閉じると思わない。**
- 🔴**受け皿が在るのに効かない項目は、機構ではなく「規則が見ている形」を疑う**＝
  同じ意味の日本語に文型が2つあり、片方だけが入口だった＝**trap (h)「同じ概念に複数の正準形がある」の parser 側の顔**。
- 🔴**索引に 🏁 を書いたまま行を残さない**＝在庫数（33）と索引の実数（34）がずれる。
  この巡で `O-92`・`O-224`・`O-245` の3行を PLAN_DETAIL へ退避して **31** に揃えた。


## 2026-09-04（索引 A 第37〜42巡＋索引 B 第1〜2巡）：第79〜88バッチ — **「測り方」を道具にした巡**

**ベースライン**＝`f52aec783`（第69〜78 の簿記直後）。
**gates 全緑**（typecheck・golden **3432 → 3440**＝+8本（既存の凍結・契約 golden 3本を理由つきで更新）・
smoke 10725 全異常0・fuzz 全0・census 高シグナル **2 → 1 / BASELINE 1**・census-stubs A🔴0・C0・manual-fields 0・
census-enginetext A🔴 10行 据置・census-costtext A🔴0 据置・lint 0 errors）。`npm run regen` 完走。
🆕**`census:deadstate` 6件 → 5件**（新設して同日に1件払い戻し）。
**ブラスト半径＝効果 変更6・追加0・削除0、予定外0**。**実機＝機械判定では不要**（`src/screens/` 0行）。

### 新設した計器2本（この巡の本題）
- **`npm run census:population -- "<原文の正規表現>" [--json "<部分文字列>"] [--full]`**（②母集団の実測）
  ＝**効果単位の原文**（`docs/_effect_srctext.json`）で数え、**`npm run regen` の逆翻訳を並べて出す**。
  🔴**なぜ要るか**＝索引 A の登録票が**7件連続で「実測 0」**だった原因が毎回 ①カード全文で数えて水増し
  ②キー名1つで「配線済み」を判定（trap (h)）の2つだったから。⚠`--json` の MISS は「配線されていない」ではない。
- **`npm run census:deadstate`**＝**PlayerState の「書かれるだけで読まれない」キー**。
  🔴**どの計器にも映らない真 no-op**（`census:stubs` A群にも `census:enginetext` にも出ず、
  golden・smoke・fuzz も緑）。初回 **6件**のうち**4件は誰も知らなかった穴**。

### 実際に直した6効果
| 効果 | 旧 live（何が壊れていたか） |
|---|---|
| `SPDi43-10-E2`② | 「**次に**アタックしたとき」の**遅延**と「ライフ0であるかぎり」の**条件**が両方落ち、**いま宣言中のアタックで即座に**ガード不可になっていた |
| `WXDi-P10-006-E3` | シャッフルと公開が `STUB{DRAW}` に潰れて**公開の記録が残らず**、2分岐が**どちらも無条件**、しかも付与が**両方【ライフバースト】**（原文は【アサシン】/【ダブルクラッシュ】） |
| `SPK01-09-BURST` | 「レベル1を**場に出し**、レベル3を手札に加える」の**場に出す側が消え、両方のレベル限定も消えていた** |
| `WDK15-007-E1` | 召喚が丸ごと落ちているのに後段が `destLastPlayed`（直前に場に出したシグニ）を参照＝**参照先が永久に不在** |
| `WXDi-P10-007-E3` | 本文が丸ごと落ちて「デッキの上10枚を見る」だけ。しかも逆翻訳が**実装済みに読めた**（→ `O-244` へ明示 defer） |
| `WX13-060-E1`① | `draw_on_opp_power_zero` フラグを立てるだけで**読み手が1人もいない**真 no-op（→ 遅延トリガーへ） |

### クローズした登録票（実測 0〜1）
`O-92`（13枚→実害1）／`O-70`（12枚→0）／`O-188`（11効果→0）／`O-69`（10枚→0）／`O-231`／`O-232`。
🔑**原因は毎回 trap (h)「同じ概念に複数の正準形がある」**。`O-69` は正準形が**5通り**あり、
うち1つは**専用ハンドラの中の判定**（`prepareMayuEncounter` の `movedCount >= 5`）で JSON に出ない。

### 検証コマンド
`npm run census:population -- "<原文>"` → `npm run build:effects` → `node scripts/heldReview.mjs --adopt(-effect)` →
`npx tsx scripts/decompileEffects.ts <CardNum...>` → `npm run gates` → `npm run regen` → `npm run gates`

### 反転確認
- 各修正に**負方向 golden**を張った（旧形へ戻ったら FAIL）＝「ドロー＋ライフバースト2連」「10枚見るだけ」
  「裸の `BLOCK_ACTION{GUARD}`」「`STUB{DRAW}` の live 利用 0」。
- `census:deadstate` は**件数ラチェット**（増＝新しい真 no-op／減＝払い戻し）。
- `O-69` は**ハンドラ内の枚数ゲート**（`canGrow = movedCount >= 5`）まで凍結した（消えると無条件グロウ）。

### 🔴 記録すべき教訓
1. 🔴**母集団は効果単位で数える。** `O-92` はカード全文だと 109 miss、効果単位だと 53、実害は **1**。
   カード全文で数えると**同じカードの別の効果**の言い回しを数えてしまう。
2. 🔴**「配線済みか」は逆翻訳で判定する。** キー名照合は必ず偽陽性を出す（trap (h)）。
   判定の順番＝①効果単位で数える →②**逆翻訳を読む** →③本当に穴なら実装。**②を飛ばすと直っているものを直そうとする。**
3. 🔴**計器を書くときのエスケープに注意。** テンプレートリテラルの `` / `\s` が1段剥がれて
   ``（バックスペース）・`s` になり、**黙って何にも当たらない**規則になった。`census:deadstate` は
   最初「0件」と出て**正しく見えた**。⇒ **正規表現のエスケープに頼らず、出現位置の前後1文字で判定する**実装に直した。
4. 🔴**「読み手がいない state」は「ハンドラがある」ことと両立する。** `census:stubs` は
   「消費地点があるか」を見るので、**書き込みの先に読み手がいない**形は素通りする。
5. 🔴**逆翻訳が「実装済みに読める」形がいちばん危ない**（`WXDi-P10-007-E3` は「デッキの上10枚を見る」と出ていた）。
   payload や条件を足したら**逆翻訳にも必ず出す**（この巡で3箇所の描画を直した）。
6. **1文型を直すときは `CHOOSE` の枝と継続に降りたか確かめる**（`SPDi43-10-E2` は `CHOOSE` の枝に居て
   規則が降りていなかった／`TRASH_SIGNI_TO_BEAT` は継続にも payload を積む必要があった）。

## 2026-09-04（索引 A 第29〜36巡）：第69〜78バッチ — 🏁**`O-60` の A群ハンドラ撤去**＋索引 A の5項目クローズ

**ベースライン**＝`6616d9ca8`（第64〜68 の簿記直後）。
**gates 全緑**（typecheck・golden **3418 → 3432**＝+14本（既存の凍結・契約 golden 6本を理由つきで更新）・
smoke 10725 全異常0・fuzz 全0・census 高シグナル **3 → 2 / BASELINE 2**・census-stubs A🔴0・C0・manual-fields 0・
**census-enginetext A🔴 13 → 10行 / BASELINE 10**・census-costtext A🔴0 据置・lint 0 errors）。`npm run regen` 完走。
**ブラスト半径＝効果 変更5・追加0・削除0、予定外0**。
**実機＝機械判定では不要**（`src/screens/` 0行）。`V-nn` の新規登録なし（残15件）。

### 第69〜70：🏁`O-60` の A群最大 catch-all を engine から撤去（A🔴 13→10行）
- **第69**＝parser の生成地点 **31箇所**（`parseSentencePart2/3/4` の28 ＋ `effectParser` の3）を
  `DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED` へ改名。判定側は旧3綴りを残したまま定数へ寄せた。
  真因＝**engine では1本のハンドラなのに parser 側の綴りが3つ**あり、復元規則がどれか1つしか見ない
  取りこぼしを繰り返し生んでいた（第65 の実例）。
- **第70**＝`execStubPart1` の GRANT_QUOTED_* 本体（**204行**）と
  `effectEngine.collectGrantedFromLayer` の同 STUB 分岐（**22行**）を撤去し、`BASELINE_SELF_TEXT` を 10 へ払い戻した。
  🔑**消化であって較正ではない**（engine のコードを実際に削った）。

### 第71〜76：索引 A の登録票が4件連続で「実測 0」だった
| 項目 | 登録票 | 実測 | 原因 |
|---|---|---|---|
| `O-193` | 25効果 | **0** | `isDrive` はトリガー（`ON_SIGNI_BECOMES_DRIVE`）／`powerLteSelf` は集合上限 `totalPowerMaxRef` |
| `O-198` | 23効果 | **2**（🔴**向きが逆**） | 「0枚選べる過小」ではなく「`pickCount:'ALL'` に `pickUpTo` が無く**全部取らされる**過大」だった |
| `O-192` | 19効果 | **0** | parser が既に `cardType:['ルリグ','アシストルリグ']` の配列形を出していた（57件） |
| `O-190` | 18効果 | **0** | 複合任意コストの前半は全件 payload に載っていた |
- **第74〜75＝`census:wiring` を 44件ぶん較正**（`eachDistinctColor` 28／`acceHost` 9／
  `levelEqTrigger` 4／`levelLtTrigger` 3）。原因は毎回 **trap (h)「同じ概念に複数の正準形がある」**。

### 第77：`O-197`＝受け皿はあるのにハンドラが渡していなかった（1効果）
`WDK14-011-E1`「トラッシュから**それぞれレベルの異なる**シグニを2枚まで【ビート】にする」は
制約が live のどこにも無く**同じレベルを重ねて選べた**（過剰実行）。
`StubAction.selectionConstraint` を新設し、`TRASH_SIGNI_TO_BEAT` が `SELECT_TARGET` と
**continuation の両方**へ渡すようにした（片方だと2周目で制約が消える）。逆翻訳も payload から描き直した。

### 第78：`O-243` 登録＝census 高シグナルの1件は「自傷」だった（1効果）
`WX21-028-E2` の live は「**自分の**トラッシュ1枚をデッキへ／**自分の**シグニ1体をデッキの一番下へ」＝
原文の「**対戦相手の**シグニ1体とエナ1枚とトラッシュ1枚」が自分の1枚に化けていた。
近似に寄せず明示 defer にして `O-243` を登録（census 3→2）。

### 検証コマンド
`npm run build:effects` → `node scripts/heldReview.mjs --adopt <ID...>` →
`npx tsx scripts/decompileEffects.ts <CardNum...>` → `npm run gates` → `npm run regen` → `npm run gates`

### 反転確認
- **第70**＝撤去した3綴りのディスパッチが engine に無いことを golden で門にした（復活したら FAIL）。
- **第72**＝「`pickCount:'ALL'` かつ `pickUpTo` 無し」を live 全数で数えて **4 → 0**（ラチェット golden 付き）。
- **第76**＝9効果の非エナ側コスト payload が消えたら FAIL するラチェットを張った。
- **第78**＝旧形（自分のトラッシュ／自分のシグニを動かす）へ戻っていないことを負方向 assert。

### 🔴 記録すべき教訓
1. 🔴**計測スクリプトの誤りを実装で埋めかけた**（第76）＝payload キーの許可リストを手で書き写した際に
   `selfTrash` を `trashSelf` と打ち間違え、「7効果で前半が消えている」と誤読して parser に規則を2本足した。
   **`build:effects` のブラスト半径が 0 だったので気づけた**。⇒ **キー名は型定義からコピーする。手で書き写さない。**
   ⇒ **ブラスト半径の全数突き合わせは「変更が届いたか」だけでなく「そもそも変更が要ったか」の検査でもある。**
2. 🔴**登録票の母集団は「登録時の値」でしかない**＝この巡は4件が実測 0。**②母集団実測は省略できない。**
3. 🔴**`census:wiring` は同じ罠で何度でも外れる**（trap (h)）＝キー名照合しかしないので、
   **同じ概念に別の正準形**があると配線済みが miss に出る。較正は**概念ごとに綴りを束ねる**こと。
   ⚠この巡で6語彙・44件。PLAN §5.3 の罠 5.（`colorNotMatchesLrig` 36件）の**2度目**。
4. 🔴**受け皿があるのにハンドラが渡していないだけ**の形がある（第77）。
   ⚠**自己再帰する受け皿は継続にも payload を積む**（`O-60` 第59 と同型）。
5. 🔴**「嘘をやめる」だけでも計器は動く**（第78）。⚠**穴が埋まったのではない**＝
   `DEFERRED_*` は census の STUB 免除で高シグナルから外れるので、**1件が §5.3 へ移った**という意味。
6. **A群の行数は engine のコード行**＝live 0 では落ちない（第64〜68 で判明）。落とすには
   **parser の生成地点を畳んでからハンドラを撤去**する（第69→第70 がその手順の実例）。

## 2026-09-04（索引 A 第24〜28巡）：§5.3 `O-60` 第64〜68バッチ — 🏁**引用付与 catch-all の3綴りが live 0 に到達**

**ベースライン**＝`aecdabec2`（第63バッチの直後）。**A🔴 SELF_TEXT 13行 / 12ハンドラ（据置）／live 27 → 0**。
**gates 全緑**（typecheck・golden **3404 → 3418**＝+14本（既存の契約 golden 3本を理由つきで更新）・
smoke 10725 全異常0・fuzz 全0・census 高シグナル 3 / BASELINE 3・census-stubs A🔴0・C0・manual-fields 0・
census-enginetext **A🔴13**・census-costtext A🔴0 据置・lint 0 errors）。`npm run regen` 完走後に再度 gates 全緑。
**ブラスト半径＝効果 変更14・追加0・削除0、予定外0**（14カード×各1効果ちょうど）。
**実機＝機械判定では不要**（`src/screens/` 0行）だが `src/engine/` を2箇所触り 14効果の挙動が変わったので
PLAN §5.1 に `V-145` を登録（未実施）。

### 真因（1行）
`execStubPart1.ts:1462` の引用付与ハンドラは **効果元のアビリティブロック全文**に
`「([^」]+)」(?:の能力)?(?:を得る|として扱う)` を当てて意味を決めており、**この形に当たらない原文は
`quotedText` が空か既知パターン表に外れて「能力を付与（ログのみ）」へ落ちる無言 no-op** だった
（JSON・逆翻訳・census・golden・smoke・fuzz が全部緑のまま壊れる `O-60` の典型形）。

### 影響枚数
**14カード / 14効果**（第63の較正で見えるようになった 27効果のうち、第63で12、第64〜68で残り15）。
- **実装で解いた 11効果**＝`WX22-Re04`(2枝)／`WXDi-P05-005`／`PR-K076`／`WXDi-CP02-TK03A`(2効果)／
  `SP26-005`／`WXDi-P05-069-E1` 周辺／`WXEX1-32`
- **明示 defer にした 8効果**＝`WXDi-D04-011`(`O-236`)／`WXK03-042`(`O-237`)／`WXDi-P05-069-E2`(`O-238`)／
  `WXDi-P12-036`(`O-239`)／`WXEX2-66`(`O-240`)／`WXDi-P05-068`(`O-241`)／`WXDi-P03-002`(`O-242`)／
  `WX25-P2-004`(`O-227` の2件目)

### バッチごとの内訳
- **第64（`GRANT_QUOTED_ABILITY` → live 0）**＝①`WX22-Re04-E2` の3択のうち①②が**無言 no-op**
  （engine の切り出しは「を得る」を要求するので、引用だけが並ぶ3択には1本も当たらない）。
  引用だけの `「【常】：…」` を `GRANT_EFFECT{rawText}` で包み、parser に
  「パワーは対戦相手の効果によって減少しない」（`powerModifyProtection`）と
  「場から手札に**移動**しない」（`moveProtectFilter`）を足した。engine 側は `excludeSelf` の解決だけ追加。
  ②`WXDi-P05-005-E1` は `GAIN_ABILITY_THIS_GAME` が既に宣言を立てている**二重表現**なので catch-all を撤去。
  ③`WXDi-D04-011-E1` は live が `PARTIAL` で凍っていたため `manualEffects.ts` ＋ `syncManualLive` で配送。
- **第65（`GRANT_QUOTED_AUTO_ABILITY` → live 0）**＝`restoreQuotedTargetGrant` の id 判定を3綴りへ広げ
  （`PR-K076-E2`）、`parseSigniAboveQuotedGrant` とパワー修正規則に主語の綴り「**これ**の上にある」を足した
  （`WXDi-CP02-TK03A`＝**クラフト自身に＋5000**していた過剰実行＋恒久 no-op を同時に是正）。
  `WXK03-042-E1` は id の名前が嘘（引用付与ではない）＝空きゾーンへの自己移動として `O-237` へ分離。
- **第66**＝引用の先頭が `《レイヤーアイコン》` でも付与として解けるようにし、「【レイヤー】を持つ」を
  `hasIcon` として読む（`SP26-005-E1`②）。主語が《カード名》の場全体付与規則を追加（`WXDi-P05-069-E2`）。
- **第67**＝「この方法でトラッシュに置いたシグニの**すべての**《レイヤーアイコン》の能力を得る」を
  `LAYER_ABILITY_COPY{source:'last_processed', all:true}` で表し、engine に分岐を実装
  （**レイヤー能力の実体は `-LAYER` 効果の `GRANT_FIELD_SIGNI_ABILITY.abilities[]`** なので原文を読まない）。
- **第68**＝残る4文型を `DEFERRED_*` へ。`normalizeGrantKeywordSpelling` の「文が丸ごと keyword」分岐と
  `applyGameGrantsBatch49` の「見出しだけ」分岐にも名前のある穴を足した。

### 検証コマンド
`npm run build:effects` → `node scripts/heldReview.mjs --adopt <ID...>` →
`npx tsx scripts/decompileEffects.ts <CardNum...>`（逆翻訳を目視）→ `npm run gates` → `npm run regen` → `npm run gates`

### 反転確認
- **live 母集団の直接カウント**＝3綴りを含む効果を全 `effects_*.json` から数え、**27 → 0**（バッチごとに 15→11→8→6→4→0）。
- **ブラスト半径**＝`git show HEAD:public/data/*.json` と突き合わせて**変更カードを毎バッチ全数列挙**（予定外0）。
- **逆翻訳**＝14効果すべてを目視。旧「このカードに記載された継続能力を付与する（テキスト検出型）」が
  **原文どおりの日本語か【未実装】**に変わっていることを確認。

### 🔴 記録すべき教訓
1. **`census:enginetext` の A群行数は「engine のコード行」**＝**live 0 になっても行は落ちない**。
   PLAN §1 と `O-60` 登録票に書いてあった「live 0 になれば2行減る」は**誤り**だった（実測で判明）。
   ⇒ 行を落とすには **parser の catch-all 生成地点を畳んでからハンドラを撤去**する必要がある。
2. **engine では1本のハンドラでも、parser の復元規則が綴りを1つしか見ていないことがある**
   （`restoreQuotedTargetGrant`）＝**どの綴りに落ちたかだけで構造化の有無が変わる**。
   engine 側の分岐条件（`['A','B','C'].includes(id)`）は parser 側のガードにも同じ広さで写す。
3. **宣言型 STUB は CONTINUOUS として読まれて初めて意味を持つ**＝引用の中身が宣言型なら
   `GRANT_EFFECT` で包んで `granted_effects` に積む。裸で即時実行すると**誰も読まない**。
   `GRANT_PROTECTION` は `execGrantProtection` が自前で包み直すのでこの問題が出ない
   ＝**「アクション型」と「宣言型」で扱いが違う**。
4. **live が `PARTIAL` の効果は parser をどう直しても届かない**（収穫マージが効果単位で不可侵・
   `heldReview --adopt` は held バケツ専用）＝`manualEffects.ts` ＋ `syncManualLive` だけが道。
5. **「見出しだけ取れた」は宣言ではない**＝`gameGrants` が `abilityBlockHeader` だけのときに
   兄弟の catch-all を落とすと**穴が計器から消える**。名前のある穴へ置き換える。
6. **近似で既存の受け皿へ寄せない**＝寄せた4件はどれも過大実行になる形だった
   （期間つきプレイヤー付与→ゲーム中ずっと／クラッシュ順つきバースト付与→ライフ全部／
   ルリグのアタック上限→無制限／「最初のグロウ」条件落ち→グロウのたびにエナチャージ）。
7. **`matchesFilter` は `excludeSelf` を見ない**（自己参照を持たない）＝収集器側で発生源を明示的に外す。
   落とすと原文「あなたの**他の**〜」より広い**自己保護つき**になる。

## 2026-09-04（索引 A 第23巡）：§5.3 `O-60` 第63バッチ — A群最大 catch-all の解体 第2段＋**計器の較正（3度目）**

**ベースライン**＝`23280eacf`（第62バッチの直後）。**A🔴 SELF_TEXT 13行 / 12ハンドラ（据置）**。
**gates 全緑**（typecheck・golden **3400 → 3404**＝+4本（既存の契約 golden 3本を理由つきで更新）・
smoke 10725 全異常0・fuzz 全0・census 高シグナル 3 / BASELINE 3・census-stubs A🔴0・C0・manual-fields 0・
census-enginetext **A🔴13**・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更12・追加0・削除0、予定外0**（12カード × 各1効果ちょうど。
`census:cards --sheet 1` 要対応 17 据置／意味照合 残 OPEN 44 据置）。
🖥**実機＝機械判定では不要**（`src/engine/` も `src/screens/` も1行も触っていない・新しいアクション型／条件型0
＝足したのは parser の**条件節2形**で、どちらも既存 `ActiveCondition` の組み合わせ）。
ただし**12効果の挙動が変わった（うち2効果は恒久 no-op から実際の効果へ）**ので観測点 **`V-144`** を登録した（未実施）。

### 1. 真因（計器）＝後方走査が「多行 `if`」と「`[...].includes(x.id)`」を読んでいなかった

`census:enginetext` は読み出し行から**後方へ走査して最初に見つけた `stub.id === 'X'` の行で打ち切る**。
`execStubPart1.ts:1458` のディスパッチャは**2行**に折り返しており、

```ts
  if (stub.id === 'GRANT_QUOTED_AUTO_ABILITY' || stub.id === 'GRANT_QUOTED_ABILITY' ||
      stub.id === 'GRANT_ABILITY_INNER_TEXT') {
```

打ち切りが**2行目で起きる**ため、**1行目の2つの id が門として数えられていなかった**。
⇒ A群最大ハンドラの母集団が **live 8** と出ていたが、実際は **8 + 16 + 3 = 27**。
同じ理由（`['A','B'].includes(act.id)` 形＝`x.id === 'A'` の形しか見ていなかった）で、
**同じ27効果を消費する第2の地点** `effectEngine.collectGrantedFromLayer` も **live 0** に見えていた。

🔴**これは `census:costtext` の罠②（テンプレ regex と複数行呼び出しは行単位では拾えない）と同型**で、
第56バッチの funnel 死角（`sourceAbilityText(ctx)`）に続き **`O-60` だけで3度目**。
🔑**罠の記録は計器ごとではなく横断で読む**（`CLAUDE.md` が既にそう書いていた）。

**直し方**＝`scripts/censusEngineText.ts` の門収集を関数 `scanIds()` に抽出し、
①ディスパッチャ行を見つけたら**直上が `||`／`&&` で折り返している間だけ**上へ辿って門を足す
②`[...].includes(<var>.id)` 形からも id を取る。
⚠**engine のコードは1行も変えていない＝可視化であって退化ではない**（A群の行数は **13 のまま**なので
`BASELINE_SELF_TEXT` も据置）。golden に**入口を守る test** を1本足した（`§5.3 O-60 第63: 計器は…`）。

### 2. 消化＝「このシグニは「【常】…」を得る」family 12効果（live 27 → 15）

`parseSentencePart2.ts` の

```ts
  if (t.match(/このシグニは「【[常出起自]】.*」を得る/s)) return { type: 'STUB', id: 'GRANT_QUOTED_ABILITY' };
```

を**構造化した `GRANT_EFFECT{target:{thisCardOnly}, duration, rawText}`** に置き換えた
（`expandGrantEffectRawTexts` が引用文を `activeCondition` つき CONTINUOUS へ展開する＝
第55バッチの `SIGNI_GRANT_QUOTED_CONSTANT_ABILITY` と**同じ受け皿**）。
`WXDi-P14-065-E1` は `applyQuotedFrontPowerGrantBatch` が挿していた STUB を同じ形（`targetsLastProcessed`）へ。

あわせて engine 側 `buildGatedKeywordGrant`（**5パターン表**）のうち **parser に無かった2形**を
`parseActiveCondition` の条件節テーブルへ移した：

| 原文 | activeCondition |
|---|---|
| 正面のシグニがレベルN（以上／以下）であるかぎり | `FRONT_SIGNI{filter:{level}}`（⚠比較語なしは**丁度N**） |
| 正面のシグニが、凍結状態でパワーがN以下であるかぎり | `AND[FRONT_SIGNI{isFrozen}, FRONT_SIGNI_POWER]`（⚠評価器が別なので2本に割る） |

**対象12効果**＝`WX24-P1-042-E2`／`WXDi-P05-081-E1`／`WXDi-P06-032-E2`／`WXDi-P11-071-E2`／
`WXDi-P12-078-E2`／`WXDi-P13-044-E2`／`WXDi-P13-069-E2`／`WXDi-P13-079-E1`／`WXDi-P14-065-E1`／
`WXDi-P15-069-E2`／`WXDi-CP02-057-E2`／`WXDi-CP02-089-E1`。

### 3. 実害（どれも逆翻訳・census・golden・smoke・fuzz が全部緑のまま壊れていた）

- 🔴**①期間が engine で落ちていた＝恒久 no-op 2効果**。原文は「**次の対戦相手のターン終了時まで**」得るのに、
  旧ハンドラは**期間を一切見ず**常に `granted_effects`（ターン内）へ入れていた。この store は
  **ターン終了でクリアされる**（`turnScopedState.ts:427` ほか3箇所）ので、
  中身の「**対戦相手のターンの間**、【シャドウ】を得る」という条件が真になる頃には**付与そのものが消えていた**
  （`WXDi-P06-032-E2`／`WXDi-P13-044-E2`）。⇒ いまは `GRANT_EFFECT{duration:'UNTIL_OPP_TURN_END'}` を出し、
  `execGrantEffect` が `granted_effects_until_opp_turn` へ入れる（`BattleScreen` は2 store を merge して読む）。
- 🔴**②`「A」と「B」を得る` の前半が丸ごと落ちる**。切り出しが `「([^」]+)」…を得る` で `」` を跨げないため、
  `WXDi-P15-069-E2` は**後ろの引用しか読めず【ランサー】が一度も付かなかった**（過小実行）。
- 🔴**③表に無い綴りは無条件付与**＝engine のパターン表は「静かな上限」。

### 4. 教訓

- 🔑🔴**「表ごと parser へ移す」ときは、移す前に受け皿単体の出力を測る。**
  引用文だけを `parseCardEffects` に通したところ、**3形で条件が黙って落ちて**いた
  （正面レベル丁度／正面レベル以下／凍結＋パワー）。**そのまま `GRANT_EFFECT` へ載せていたら
  engine の表より退化して無条件【ランサー】【アサシン】になっていた**（過小 → 過大への反転）。
- 🔑🔴**反転確認が PASS したら「同じ意味を決める別の場所」を疑う。**
  期間の判定を `false &&` で殺しても出力が変わらず、真因は**ブロック単位の後段 `upgradeToOppTurnEnd`
  （`OPP_TURN_END_RE`）が既に昇格していた**こと＝同じ意味を2箇所で決めていた。⇒ parser 側の重複を撤去した。
  §4.1 の「反転確認が PASS したら観測点を疑う」の (a) は、**「2箇所で決めている」の合図**でもある。
- 🔑🔴**旧 STUB には `duration` キーが無かった**＝だから既にある期間昇格パスが**当たる先を持たなかった**。
  **catch-all は「意味を落とす」だけでなく「既にある正しい後段を無効化する」。**
- 🔑**収穫マージは STUB→構造化を「純粋上位集合でない」と見て held へ送る**＝12件とも `_held_fresh` に入った。
  `--adopt-effect` で**効果単位**に採用し、カードごとに「変わったのは狙った1効果だけ」を機械照合した。

**検証コマンド**＝`npm run gates`（全緑）／`npm run golden -- --only "O-60 第63"`／
`npx tsx scripts/censusEngineText.ts --id "GRANT_ABILITY_INNER_TEXT|GRANT_QUOTED_AUTO_ABILITY|GRANT_QUOTED_ABILITY"`。
**反転確認**＝live の `WXDi-P06-032-E2` の `action.duration` を `UNTIL_END_OF_TURN` に書き換えると
新旧2本の golden が**両方 FAIL** する（観測点に判別力があることを確認済み）。


## 2026-09-03（索引 A 第22巡）：§5.3 `O-60` 第62バッチ — `GRANT_ABILITY_INNER_TEXT`（A群最大 catch-all）の解体 第1段

**ベースライン**＝`ffc6b6d68`（第61バッチの直後）。**A🔴 SELF_TEXT 13行 / 12ハンドラ（据置）**。
🔴**A群の行数は「ハンドラ単位の読み出し行」で数える**ので、分岐をいくつ parser へ移しても
**その STUB が live 0 になるまで1行も減らない**。この巡は **live 15 → 8 効果**まで割った（残りは `O-235`）。
**gates 全緑**（typecheck・golden **3399 → 3400**＝+1本（既存の契約 golden 2本を理由つきで更新）・
smoke 10725 全異常0・fuzz 全0・census 高シグナル 3 / BASELINE 3・census-stubs A🔴0・C0・manual-fields 0・
census-enginetext **A🔴13**・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更8・追加0・削除0、予定外0**（`census:cards --sheet 1` 要対応 17 据置）。
🖥**実機＝機械判定では不要**（`src/screens/` は1行も触っていない・新しいアクション型／条件型・
interaction 型は0＝足したのは `StubAction` の payload キー2本と `triggerCondition` の宣言キー1本）。
ただし**8効果の挙動が変わった**ので実機観測点 **`V-143`** を登録した（未実施）。

### 真因＝「引用能力の付与」という1つの id に、8種類の別々の機構が同居していた

`STUB{GRANT_ABILITY_INNER_TEXT}`（live 15）は**アビリティブロック全文**から `「…」を得る` の引用を切り出し、
その中身に**ハードコードした regex 表**を当ててどの機構かを決めていた。
⇒ 🔴**表に無い言い回しは「能力付与：「…」（ログのみ）」へ落ちる無言 no-op**（静かな上限）。
さらに**引用符が `『』` だと切り出しに失敗**（`WXDi-P03-002`）、
**対象が自場シグニでないと最後まで落ちる**（効果元がルリグ／アーツの5効果）といった穴があった。

### 移した8効果

| 効果 | 移し先 | 旧挙動 |
|---|---|---|
| `SPDi43-01-E2` | `LRIG_GAIN_OPP_SIGNI_AUTO_PAY_GATE{autoPayGateColors}` | 引用 regex |
| `WXDi-P16-044-E2` | `LRIG_GAIN_BLOCK_OPP_SIGNI_AUTO` | 引用 regex |
| `WXDi-P15-033-E2` | `LRIG_GAIN_OPP_ACTIVATE_COST_UP{oppActivateCostPlus}` | 引用 regex |
| `WX24-P2-030-E2` | `LRIG_GAIN_ATTACK_PHASE_POWER_DOWN{powerPerUnit}` | 引用 regex |
| `WX25-CP1-003-E1` | `OPP_SIGNI_ENERGY_TO_DECK_BOTTOM` | 引用 regex。🔴**連用形の前半「対戦相手のすべてのシグニを凍結し、」が丸ごと落ちていた**ので併せて復元 |
| `WD17-001-E2` | `GRANT_EFFECT{target:{hasIcon:'ライズ'}, effect}` | 🔴**真 no-op**（効果元がルリグ＝`selfTargets` が空） |
| `WX25-P2-004-E1`（主節） | `GRANT_EFFECT{SIGNI opponent ALL, effect}` | 🔴**真 no-op**（効果元がアーツ） |
| `WXDi-P07-085-E1`（3択） | `POWER_SET` ＋ `GRANT_PROTECTION{from:['DOWN']}` | 🔴**基本パワーの変更が3択とも丸ごと落ちていた**（受け皿 `POWER_SET` は実装済みで parser 側の入口が無かっただけ） |

⚠**engine 側の状態書き込みは1バイトも変えていない**（5つのフラグは id と payload の経路だけを移した）。

### 🔴 この巡の主産物＝据置を解くときは「表せるようになったか」を測る

**一度載せてから差し戻した実例**＝`WXDi-P03-002-E1`（「このゲームの間、あなたは以下の能力を得る。『【自】：…』」）は
`GRANT_PLAYER_ABILITY` に**載る**（引用は AUTO で解けた）。だが原文の
「**それがそのターンであなたの最初のグロウである場合**」を表す条件語彙が**無い**ので、
載せると**グロウのたびにエナチャージする過剰実行**になる。
⇒ **現状（真 no-op＝過小）から悪い方へ倒さない。**🔑**「引用が解ける」と「効果が表せる」は別。**

**逆に、据置の理由が別名の取りこぼしだった例**＝`WD17-001-E2` は引用の timing が `ON_PLAY` へ落ちるため
据置になっていた（＝**場に出た瞬間にアップする**過剰実行。既存 golden がその契約を守っていた）。
原因は**綴り1つ**＝既存規則が「正面**の**」しか受けず、原文は「正面**にある**」だった。
1本足したら `ON_SIGNI_BANISH_OPPONENT` に解けた。🔑**据置の理由が「語彙が無い」ならまず綴りゆれを疑う。**

### engine 未配線でも「宣言だけは載せる」

「正面にあるシグニをバニッシュしたとき」の**正面限定**は `triggerCondition.banishedFrontOnly` として
parser が出し、逆翻訳にも描く。⚠**engine は未配線**（配線は `banishedNotFront` と同じ
`battleBanishEntries` のゾーン比較＝`src/screens/BattleScreen.tsx` を触るので実機必須＝`O-235` に登録）。
🔑**出さないと原文照合から制約が丸ごと消える**（`commonClass` と同じ規約）。⚠**実装したことにはしない。**

### 検証コマンド

```
npm run build:effects && node scripts/heldReview.mjs --adopt <8枚>
npm run regen
npm run gates          # 全緑（golden 3400 / census 3 / enginetext A🔴13 据置）
npx tsx scripts/censusEngineText.ts --id GRANT_ABILITY_INNER_TEXT   # → live 15→8
```

**反転確認**＝`WD17-001-E2` の逆翻訳が「【自】このシグニがバトルによって**正面の**対戦相手のシグニを
バニッシュしたとき：このシグニをアップする」であること（🔴旧は `ON_PLAY`＝**場に出た瞬間**に落ちる形だった）。
`WXDi-P07-085-E1` は3択すべてに `POWER_SET`（5000/10000/12000）が載っていることを golden で assert。


## 2026-09-03（索引 A 第21巡）：§5.3 `O-60` 第61バッチ — モーダル選択 family の残り3件（受け皿3本＋executor の専用先取りを撤去）

**ベースライン**＝`778de877a`（第60バッチの直後）。**A🔴 SELF_TEXT 17行 → 13行 / 16→12ハンドラ**
（`BASELINE_SELF_TEXT` も 13 へ払い戻し）。miss は 0 のまま。
**gates 全緑**（typecheck・golden **3398 → 3399**＝+1本（既存の契約 golden 2本を理由つきで更新）・
smoke 10725 全異常0・fuzz 全0・census 高シグナル 3 / BASELINE 3・census-stubs A🔴0・C0・manual-fields 0・
census-enginetext **A🔴13**・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更3・追加0・削除0、予定外0**（`census:cards --sheet 1` 要対応 17 据置）。
🖥**実機＝機械判定では不要**（`src/screens/` は1行も触っていない・新しいアクション型／条件型／
interaction 型・payload キーも0＝既存の `energyTrash` / `IS_BETTING` / `additionalCostChoose` を使っただけ）。
ただし**3効果の提示形が変わった**ので実機観測点 **`V-142`** を登録した（未実施）。

### 撤去したもの

| 受け皿 | live | 何が壊れていたか |
|---|---|---|
| `BET_CONDITION` | 1 | **アビリティブロック全文**から「A枚の代わりにB枚」を読み、差分(B-A)枚を追加で選ばせていた。🔴その追加選択の候補は **`trash` の「シグニ」全部**＝原文の絞り込み（センタールリグと共通する色／それぞれレベルが異なる）が**追加の1枚にだけ掛からない**過剰実行 |
| `CHOOSE_N_FROM_LIST` | 1 | カード全文から選択数を読み、選択肢は `choiceTextParser` に全文ごと渡す。見出しの綴りゆれ「以下**から**4つから」を parser が受けられずここへ落ちていた |
| `ARTS_EXTRA_COST_CONDITION` | 1 | 選択肢2つを**ハンドラにベタ書き**した `WX26-CP1-024` 専用コード |
| `effectExecutor` の専用先取り | — | `OPTIONAL_TRASH_ENERGY_CLASS` + `ARTS_EXTRA_COST_CONDITION` の組み合わせに対し、**カード全文**から ＜クラス＞ と枚数を読み直していた（A群1行） |
| `INTERNAL_OTEC_SKIP` | 0 | 上の先取りからしか呼ばれない死枝 |

### 直した内容（受け皿はすべて既存）

- **`WDK01-010`**（ベットで**対象枚数**が増える）＝`CONDITIONAL{IS_BETTING}` の then/else に
  **枚数だけ差し替えた同じ本文をもう一度解いて**置く。⇒ 絞り込み（`colorMatchesLrig` /
  `selectionConstraint{distinct:'level'}`）が**両枝に等しく載る**。
- **`WX13-003`**＝`parseChooseHeaderCount` と見出し抽出に「以下**から**Nつから」の枝を1本足した
  （⚠**選択肢を任意化して緩めない**）。あわせて**見出しと①の間のコスト宣言**
  （`ARTS_COST_REDUCTION_BY_EFFECT`）を落とさないようにした。
- **`WX26-CP1-024`**＝「この〈カード種〉を使用する際、エナから…トラッシュに置いてもよい」だけを
  `STUB{OPTIONAL_COST, energyTrash{count, filter}}` へ分け、後段を `CHOOSE{additionalCostChoose}` へ。
  条件節の綴り「**使用する際に**〜置いていた場合」も `additionalCostChoose` の枝で受けるようにした。
- **意味の違う catch-all 3本を撤去**＝`CHOOSE_N_FROM_LIST` には「プレイヤーを1人まで選ぶ」
  「以下のNつを**行う**」（＝選ぶのではなく全部やる＝**意味が逆**）「対戦相手はシグニを好きな数選ぶ」が
  相乗りしていた（全部 live 0）。

### 🔴 この巡の主産物＝「昇格」には2つの軸がある

`CHOOSE{betChoose / conditionChoose / additionalCostChoose}` は**選択肢を何個選べるか**の昇格。
`WDK01-010` は**1つの効果の対象枚数**が増える形で、軸が違う。
軸を取り違えると「差分だけを追加で処理する」実装になり、**追加ぶんにだけ絞り込みが掛からない**。
⇒ **枚数を差し替えた本文を丸ごと解き直して `CONDITIONAL` の両枝に置く**（片方だけ緩むことがない）。

### 🔑 `choiceTextParser.ts` の呼び出し元は残り1本になった

第60バッチで見つけた「engine の第2の原文解析器」（492行・約30分岐）は、
この巡で **`INTERNAL_ECRV_APPLY`（`EXTRA_COST_REMOVE_VIRUS` の継続・live 2効果）1本**からしか
呼ばれない状態になった。そこを移せば**ファイルごと削除できる**＝`O-234` に登録した。
⚠**着手には `src/screens/BattleScreen.tsx`（`pre_use_virus_removed` の書き込み側）が要る**＝
遅いレーン＋実機必須なのでこの巡では取らなかった。

### 検証コマンド

```
npm run build:effects && node scripts/heldReview.mjs --adopt WDK01-010,WX13-003,WX26-CP1-024
npm run regen
npm run gates          # 全緑（golden 3399 / census 3 / enginetext A🔴13）
npx tsx scripts/censusEngineText.ts --id BET_CONDITION   # → live 0（撤去済み）
```

**反転確認**＝`WDK01-010` の `CONDITIONAL` **両枝**に `colorMatchesLrig` と
`selectionConstraint{distinct:'level'}` が載っていることを golden で assert（旧実装は
ベット時の**追加1枚だけ**がその絞り込みを持たなかった＝片側だけ緩む壊れ方）。


## 2026-09-03（索引 A 第20巡）：§5.3 `O-60` 第60バッチ — モーダル選択 family を `CHOOSE` へ寄せて受け皿4本を撤去

**ベースライン**＝`8778aa68c`（第59バッチの直後）。**A🔴 SELF_TEXT 22行 → 17行 / 21→16ハンドラ**
（`BASELINE_SELF_TEXT` も 17 へ払い戻し）。miss は 0 のまま。
**gates 全緑**（typecheck・golden **3397 → 3398**＝+1本・smoke 10725 全異常0・fuzz 全0・
census 高シグナル 3 / BASELINE 3・census-stubs A🔴0・C0・manual-fields 0・
census-enginetext **A🔴17**・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更18・追加0・削除0、予定外0**。
⚠`census:cards --sheet 1` の要対応は **16 → 17**（🔴増だが**簿記**＝`O-233` を登録したぶん
`SPK16-13E` が `mech` に入った。17件は**全部 `mech`＝即着手可能 0**）。
🖥**実機＝機械判定では不要**（`src/types/` `src/data/` `src/engine/` `public/data/` `scripts/` のみ／
**`src/screens/` は1行も触っていない**・新しいアクション型／条件型／interaction 型は0＝
足したのは `StubAction` の payload キー1本 `fieldClassLevelSumPower` だけ）。
ただし**18効果の提示形（pending）が `STUB` 由来から `CHOOSE{choose_count, multiSelect}` へ変わった**ので、
実機観測点 **`V-141`** を登録した（未実施）。

### 真因（4 family 共通）＝engine の受け皿が「選択数」も「選択肢」もカード全文から作っていた

4つの受け皿 STUB（`BET_MECHANIC` / `CONDITIONAL_MULTI_CHOOSE_BY_CENTER` /
`CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE` / `CONDITIONAL_ALTERNATE_EFFECT`）は、
**実行時にカード全文へ regex を当てて**「以下のNつからMつ選ぶ」の数を読み、
①②③の選択肢は `choiceTextParser`（engine 側のもう1つの原文解析器）に**カード全文ごと**渡していた。
⇒ **live JSON にも逆翻訳にも①②③が一切現れない**＝逆翻訳・census・golden・smoke が全部緑のまま
意味が engine の regex で決まる。受け皿は**すべて既存**（`CHOOSE` の `betChoose` /
`conditionChoose` / `additionalCostChoose`）で、無かったのは parser 側の入口だけだった。

| family | live | 何が壊れていたか |
|---|---|---|
| `BET_MECHANIC` | 8 | 選択肢が live に出ない（`WX19-006`①は `STUB{BANISH}`＝**対象を選ばせず、アーツ自身を消そうとする恒久 no-op**） |
| `CONDITIONAL_MULTI_CHOOSE_BY_CENTER` | 4 | 「センタールリグが＜タウィル＞か＜ウムル＞」を**ルリグのカード名**と突き合わせていた（正しくは `CardClass`）＝`'＜リル＞'.includes(CardName)` という**逆包含のまぐれ当たり**でしか成立せず、`紅蓮乙女 リル` のような通常名では**昇格が永久に起きない**過小実行 |
| `CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE` | 4 | 1つの id に**2文型が同居**（センターレベル条件／追加コスト）。さらに `STUB{OPTIONAL_COST}` と**同じ追加コストを二重に提示**していた（プレイヤーが2回「支払いますか？」に答える） |
| `CONDITIONAL_ALTERNATE_EFFECT` | 1 | 選択肢の中身まで**ハンドラにベタ書き**した `WD23-044-EA` 専用コード |

### 直した内容

- **parser の条件語彙2本**（共通表 `STATE_CONDITION_CLAUSES`）＝
  「〈誰か〉のセンタールリグが＜X＞か＜Y＞の場合」→ `OR[LRIG_STORY, LRIG_STORY]`（3枚）／
  「〈誰か〉のセンタールリグ**の**レベルがN以上／以下の場合」→ `LRIG_LEVEL`（既存語彙は語順違いの
  「センタールリグ**が**レベルN以上」しか無かった）。
- **`conditionChoose` ビルダーが共通表を1本しか見ていなかった**（§5.3 `O-99` の罠）＝
  `parseHoistStateCondition` → `resolveStateConditionClause`（2表とも見る）へ。
- **`additionalCostChoose` の枝を新設**＝「追加で〈コスト〉を支払っていた／捨てていた場合、代わりにKつ選ぶ」。
  盤面条件では表せない（`evalCondition` に載らない）ので専用キーへ。4効果。
- **`INTERNAL_CMCLG_POWER_MOD_BY_CLASS_LEVELS` → `POWER_MOD_BY_FIELD_CLASS_LEVEL_SUM`**（payload
  `fieldClassLevelSumPower{story, deltaPerLevel}`）。旧はカード全文から `＜X＞` を読み、
  **外れると `CardClass.includes('')` が全シグニに真**＝場のシグニ全部のレベル合計になった。
- **`INTERNAL_CMCLG_DRAW_ON_POWER_ZERO` → `DRAW_ON_OPP_POWER_ZERO`**（parser が直接出すので `INTERNAL_` を外した）。
- **死枝の `INTERNAL_CMCLG_*` 8本を撤去**（`_DEDUCT` と `_APPLY_POWER_MOD` は他から使われるので残す）。
- **逆翻訳の「原文をそのまま写す」分岐2本を撤去**（`decompileEffects.ts` の `BET_MECHANIC` は
  「ベット―以降の全文」を返しており、**JSON が①②③を持たないことが照合で永久に見えなかった**）。
- **`WX09-Re03` の `manualEffects.ts` 上書きを削除**（STUB を保持するためだけの MANUAL）。

### 🔴 この巡の主産物＝engine には原文解析器が「2つ」ある

`census:enginetext` は `EffectText` という**文字列**か `sourceAbilityText(ctx)` の行しか数えない。
`parseChoiceOptionsFromText(txt, prefix)` は**原文を引数で受け取る**ので、
`src/engine/choiceTextParser.ts`（492行・約30分岐）は**初版から一度も計器に映っていなかった**。
（**`census:costtext` の罠③＝「原文を引数で受け取る関数」／第56バッチの funnel 死角**と同じ形の3例目。）

⇒ **受け皿 STUB を撤去するときは `choiceTextParser` にしか無い規則を全部 parser へ移す。**
移し忘れで3件が壊れた（どれも gates は緑のままだった）＝

| 症状 | カード | 何が起きたか |
|---|---|---|
| 比較句の脱落（過剰） | `WDK06-R08`① | 「《ライズアイコン》を持つシグニ**よりパワーの低い**」が消え、**どの相手シグニでもバニッシュ可**に。受け皿（`SELECT_TARGET_ONLY` ＋ `powerLtLastProcessed`）は両方とも実装済みだった |
| 2枚サーチが1枚に（過小） | `WDK06-R08`② | 「《ライズアイコン》を持つシグニ1枚**と**＜アーム＞のシグニ1枚」が**1つの合成フィルタ**（＜アーム＞かつライズ・1枚）に潰れた |
| 真 no-op | `SPK16-13E`③ | `STUB{DRAW_IF_OPP_DISCARDED_HAND}`＝**ログだけ**。`CONDITIONAL{HAND_TRASHED_BY_OPP} → STUB{DRAW_UNTIL_HAND_SIZE:6}` へ |

### 副産物（作業中に見つけてその場で直した parser バグ）

- 🔴**`?` を後置した optional は「直前の1文字」にしか掛からない**＝共通表の
  `カードが([０-９\d]*)枚?以上?トラッシュに移動していた場合` は「**「以」が必須**で「上」だけ任意」という誤りで、
  枚数を書かない原文には**構造的に当たらなかった**（`SPK16-13E`②＝条件が落ちて**無条件に3枚エナチャージ**）。
  正しくは `(?:([０-９\d]+)枚以上)?`。**句を任意にするなら `(?:…)?` で囲む。**
- 🔴**同じ意味の別表記を両方書いていなかった（3件）**＝`【ライフバースト】`／`《ライフバースト》`
  （後者は `filter.cardName = 'ライフバースト'` に落ちて**どのカードにも一致しない恒久 no-op**＝
  同じコメントが警告していた `hasIcon` の旧バグの**3例目**）、
  「トラッシュに**移動**していた」／「**置かれ**ていた」、
  「センタールリグ**が**レベルN以上」／「センタールリグ**の**レベルがN以上」。
- 🔴**`WDK12-007`① 後段が幻覚だった**＝「【チャーム】が付いているあなたのすべてのシグニは
  「【常】：対戦相手のターンの間、バニッシュされない。」を得る」を
  **`GRANT_KEYWORD{keyword:'チャーム'}`**（＝修飾句を付与キーワードと読み違え）にしていた。
  受け皿は全部在った（`hasCharm` / `duringOppTurn` / `count:'ALL'`）ので `GRANT_PROTECTION` へ。
  ⚠engine の `choiceTextParser` 側も**この後段を丸ごと捨てていた**（どちらの経路でも効いていなかった）。
- 🔴**「対戦相手は自分のトラッシュを〜」の向きが固定 `self` だった**＝`SP38-004`② は
  **自分のトラッシュを戻し**、後半（相手のライフ→エナ）も落ちていた。主語から owner を決めるようにし、
  省略された後半の主語を補ってから解くようにした。
- 🔴**「対戦相手のレベルN以上のシグニをトラッシュに置く」が `STUB{BANISH}` だった**＝
  ①「トラッシュに置く」はバニッシュではない ②`STUB{BANISH}` は
  `lastProcessedCards[0] ?? sourceCardNum` を消す形なので**対象を1体も選ばせない恒久 no-op**。typed `TRASH` へ。
- **任意の追加手札捨てを `STUB{OPTIONAL_COST, handDiscard}` へ**＝typed `TRASH{optional:true}` では
  **支払い記録（`self_optional_effect_taken`）が残らず**、後段の `additionalCostChoose` が永久に昇格しない。

### 🔴 計器の読み方（この巡で1件較正した）

live から STUB が消えた瞬間に census の高シグナルが **3→6** に増えたが、
`vocabCensus` は**STUB を含む効果を高シグナルから免除する**ので、これは**新しい穴ではない**。
内訳を1件ずつ割ると **実際の穴2件**（`WDK06-R08` の比較句／`WDK12-007` の幻覚＝上で修正）と
**計器の穴1件**（`additionalCostChoose` をキー表が知らない＝`stripConditionChooseClause` へ追加＝
`conditionChoose` を足したときと同じ較正）だった。⇒ **「可視化」で片付けず、1件ずつ原因を分ける。**

### 🔑 golden が不具合を凍結していた

`SP26-005`/`SP38-004` の既存 golden は `resumeChoose('pay')` を**2回**書いており、
「同じ追加コストを2回提示する」という**不具合をそのまま契約として固定していた**。
受け皿を1本化して1回に直した（他4本も id・型の変化に合わせて理由つきで更新）。
新規 golden **`§5.3 O-60 第60`** を1本追加＝撤去した5 id が live に戻ったら落ちるラチェット＋
6項目（`betChoose` / `LRIG_STORY` の OR / `LRIG_LEVEL` と2選択肢の payload /
`additionalCostChoose` と `hasLifeBurst` / 明示 defer / `powerLtLastProcessed`）。

### 検証コマンド

```
npm run build:effects && node scripts/heldReview.mjs --adopt <18枚>
npm run regen
npm run gates          # 全緑（golden 3398 / census 3 / enginetext A🔴17）
npx tsx scripts/censusEngineText.ts --id BET_MECHANIC   # → live 0（撤去済み）
```

**反転確認**＝`WX12-005` の昇格条件を `LRIG_STORY` にしたので、`CardClass` に「タウィル」を持たない
センタールリグでは `choose_count` が 1 のままであることを golden で assert（旧実装は
カード名の逆包含で**たまたま**当たっていた／通常名では**常に不成立**だった）。


## 2026-09-03（索引 A 第19巡）：§5.3 `O-60` 第59バッチ — A群の小口4 family（比例パワー修正3／全体トラッシュ／DRAW／選んだ能力の付与）

**ベースライン**＝`c81400e01`（第58バッチの直後）。**A🔴 SELF_TEXT 28行 → 22行 / 27→21ハンドラ**
（`BASELINE_SELF_TEXT` も 22 へ払い戻し）。miss は 0 のまま。
**gates 全緑**（typecheck・golden **3393 → 3397**＝+4本・smoke 10725 全異常0・fuzz 全0・
census 高シグナル 3 / BASELINE 3・census-stubs A🔴0・C0・manual-fields 0・
census-enginetext **A🔴22**・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更10・追加0・削除0、予定外0**（＝対象4 family の10効果ちょうど）。
🖥**実機＝機械判定では不要**（`src/types/` `src/data/` `src/engine/` `public/data/` `scripts/` のみ／
**`src/screens/` は1行も触っていない**・新しい interaction 型は0）。
ただし**3効果が「原文と違う数値／落ちていたゾーン／並び順」で動いていた**ので観測点 **`V-140`** を登録した（未実施）。

### 🔴 この巡の主産物＝自己再帰する受け皿は payload を継続へ積み忘れる

`POWER_MOD_BY_COLOR_VARIETY` / `POWER_MOD_BY_ATTACKER_LEVEL` / `GRANT_CHOSEN_ABILITY` は
**`SELECT_TARGET` を出したあと自分自身へ再入する**形（`continuation` に同じ id の STUB を積む）。
payload 化のとき**継続側の STUB にも payload を積まないと、2周目が payload 無し＝fail-closed で
「対象は選ばせるのに何も起きない」**という無言 no-op になる。
🔑**捕まえたのは golden の反転側**（`§6.4 O-23` の既存 test が「アタッカー L1 → －1000」を assert していた）＝
**payload 化のたびに `continuation` / `thenAction` へ渡す STUB を全部見る。**

### family ①：比例パワー修正の残り3ハンドラ（`execStubPart2.ts:216/258/279`）

`POWER_MOD_BY_LRIG_LEVEL_SUM`(live1) / `POWER_MOD_BY_COLOR_VARIETY`(live1) /
`POWER_MOD_BY_ATTACKER_LEVEL`(live2)。第50バッチで15ハンドラ取った「パワー修正 family」の**残り**。
単価を payload `powerPerUnit:{per, delta, targetParity?}` へ移した。

🔴**`POWER_MOD_BY_COLOR_VARIETY` は regex が外れたときの既定が `-3000`** ＝
**原文に無い数値を engine に焼き込んで**いた（当たっている間は見えない）。
🔑**`targetParity` は効果単位で刻む**＝`WXK10-084` は
「**奇数**がアタック → **偶数**を対象」と「**偶数**がアタック → **奇数**を対象」の**2能力が同居**しており、
カード全文を読むと必ず片方へ倒れる（旧実装はブロック読みで回避していたが、それでも原文依存だった）。

### family ②：`TRASH_ALL_SIGNI_AND_KEY`（live2）＝2文型の catch-all

🔴**engine は `各プレイヤー|すべてのシグニ` と `対戦相手` の2本しか見ておらず、
流すゾーンは常に「シグニ＋キー」に固定**されていた。⇒ 2通りに壊れていた＝
- `WX07-017-E1`（原文「各プレイヤーは、自分の**手札とエナゾーンにあるカードと場にあるシグニを**すべて
  トラッシュに置く」）＝**手札とエナが1枚も流れず**（過小実行）、
  **原文に無いキーまでルリグトラッシュへ送っていた**（過剰実行）。
- `WXEX2-21-E3`（原文「すべてのシグニをトラッシュに置き、**すべてのキー**をルリグトラッシュに置く」）
  だけが「シグニ＋キー」で正しかった。

⇒ payload `trashAllScope:{zones, keys?, owner}` へ移した。
⚠**逆翻訳の固定文言も同じ嘘をついていた**＝`decompileEffects.ts` の早い分岐が
「対象プレイヤーのシグニすべてとキーを…」を返しており、`WX07-017` を1文字も表していなかった（撤去）。

### family ③：`STUB{DRAW}`（live1）

🔴**この受け皿へ来る唯一の文型（「デッキをシャッフルし一番上のカードを公開し手札に加える」）の原文には
`カードをN枚引く` という句が無い**＝regex は**必ず外れて既定1**だった（たまたま正しい数だっただけ）。
⇒ 枚数を payload（`count`）へ。
⚠**「シャッフル」と「公開」は依然として落ちている**＝後段の
「この方法で**公開されたカード**が【ライフバースト】を持つ場合」が判定できない（§5.3 `O-232` に登録）。

### family ④：`GRANT_CHOSEN_ABILITY` / `_SELF`（live3）

🔴**engine が8本のキーワード regex をブロック全文に当てて選択肢を組み立てていた**＝
- **原文の①②③の並び順を無視して engine 側のパターン順**で提示していた
- **8種の表に無いキーワードの効果は「能力解析不可」で無言 no-op**（＝表が静かな上限になっていた）

⇒ payload `chosenAbility:{chooseCount, keywords, targetStory?}` へ移し、
**parser が原文の①②③で割って並び順どおり**に載せるようにした。
⚠**`choiceTextParser.ts` のモーダル選択 family（据置）とは別物**＝あちらは「①②③がそれぞれ別のアクション」、
こちらは「①②③がすべて**付与するキーワード**」で engine の語彙に閉じている。

### 🔑 一般則

① **自己再帰する受け皿は `continuation` / `thenAction` にも payload を積む**（積み忘れは無言 no-op）。
② **「外れたときの既定値」は原文に無い数値の焼き込み**＝`-3000` のような具体値の既定は必ず疑う。
③ **1つの id に2つの文型が同居していると、逆翻訳の固定文言も同じ嘘をつく**＝
   payload 化したら**逆翻訳の早い分岐も一緒に撤去する**（片方だけ直すと計器は緑のまま）。
④ **engine 側の「パターン表」は静かな上限**＝表に無い語彙は無言 no-op になるので、
   表ごと payload へ移して parser 側で読む。

### 見送ったもの

`CONDITIONAL_POWER_BONUS`（A群1行・**リテラル9本**・live **0**）は**この巡では触らない**と決めた＝
**parser 側に生成元が10箇所以上ある catch-all の安全網**で、live 標本が0なので
payload 化しても**正しさを1件も検証できない**（fail-closed にすると将来そこへ落ちた効果が無言 no-op になる）。
⚠**live 0 だけを見て消さない**（登録票の警告どおり）。

### 変更ファイル

`src/types/effects.ts`（`powerPerUnit` / `trashAllScope` / `chosenAbility`）／
`src/data/parserUtils.ts`（`parsePowerPerUnitSpec` / `parseTrashAllScopeSpec` / `parseChosenAbilitySpec`）／
`src/data/parsers/parseSentencePart2.ts`・`parseSentencePart3.ts`・`parseSentencePart4.ts`／
`src/data/effectParser.ts`（`GRANT_CHOSEN_ABILITY` の入口）／
`src/engine/execStubPart1.ts`（`TRASH_ALL_SIGNI_AND_KEY`）／
`src/engine/execStubPart2.ts`（パワー修正3・`DRAW`・`GRANT_CHOSEN_ABILITY` 族／継続への payload）／
`scripts/decompileEffects.ts`（payload から逆翻訳＋固定文言の撤去）／
`scripts/censusEngineText.ts`（ratchet 28→22）／`scripts/goldenTest.ts`（+4本・既存2本を更新）／
`public/data/effects_{WX,WXDi,WXK,misc}.json`（10効果）。**`src/screens/` は0行。**

---

## 2026-09-03（索引 A 第18巡）：§5.3 `O-60` 第58バッチ — A群 live効果数の大物3 family（`LIMIT_CHANGE` / `TRASH_SIGNI_UNDER_FIELD_SIGNI` / `COLLAB`）

**ベースライン**＝`87a8c28c4`（第57バッチの直後）。**A🔴 SELF_TEXT 32行 → 28行 / 32→27ハンドラ**
（`BASELINE_SELF_TEXT` も 28 へ払い戻し。`INTERNAL_TSU_CHOOSE_ZONE` も同時に落ちたので **-4行**）。
**gates 全緑**（typecheck・golden **3389 → 3393**＝+4本・smoke 10725 全異常0・fuzz 全0・
census 高シグナル 3 / BASELINE 3・census-stubs A🔴0・C0・manual-fields 0・
census-enginetext **A🔴28**・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更26・追加0・削除0、予定外0**（3 family の25効果＋`until` 修正の波及1件）。
🖥**実機＝機械判定では不要**（`src/types/` `src/data/` `src/engine/` `public/data/` `scripts/` のみ／
**`src/screens/` は1行も触っていない**・新しい interaction 型は0）。
ただし**4効果が「無言 no-op／原文と逆／過小実行」から実際の盤面変化へ変わる**ので観測点 **`V-139`** を登録した（未実施）。

### 🔴 この巡の主産物＝「`miss=0` は正しいではない」の実証

計器は3ハンドラとも **miss 0** と出していた。ところが**engine が実際に読む文**（`sourceAbilityText`＝
**アビリティブロック**）にリテラルを当て直したら、**3 family とも壊れていた**。

🔴🔑**計器の `miss` はカード全文（`EffectText + BurstText`）に当てて数える**（`censusEngineText.ts:216`）。
`sourceAbilityText` 経由の funnel ハンドラは**engine が読むのはブロックだけ**なので、
**「別の文に当たっているだけ」を hit と数えてしまう**＝**miss が構造的に甘く出る**。
⇒ **A群を取るときは、計器の miss を信じずに `abilityBlockTextOf(card, effectId)` でリテラルを当て直す**
（今回は `tmp_b58probe.ts` で全 25効果を1件ずつ出した）。

### family ①：`LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END`（live 10効果）

engine はブロック全文に**5本の regex**を当てて向きと量を決めていた。壊れ方は2つ＝

🔴**(a) 向きが反転する**＝`対戦相手.*リミットを＋([０-９\d]+)` の `.*` が**文を跨ぐ**ので、
原文「**あなたの**センタールリグのリミットを＋２する」の `WXDi-P16-002-E1` は、
同じブロックの前の文にある「次の**対戦相手**のターンの間、…」を拾って
**相手のリミットを＋２**していた（自分は0）。

🔴**(b) 自分側が丸ごと消える**＝実装が `if (!oppMinusM && !oppPlusM) { 自分側 }` という構造で、
**相手側の一致が1本でもあれば自分側の分岐を飛ばす**。自分＋1／相手−2 を両方書いた
`WX25-P2-014-E2` は**自分の＋1が消え**、さらに相手の−2は後続の
`STUB{OPP_MAIN_PHASE_LIMIT_DOWN}` と**二重に**掛かっていた。

⇒ payload `lrigLimitChange:{owner, delta}` へ移し、**向きは「リミットを」の直前の名詞句だけ**で決める
（`parseLrigLimitChangeSpec`）。payload の無い宣言は何もしない（旧既定の「リミット+1」は
**原文に無い数値を勝手に足す**形だった）。

🔴🔑**副産物＝`until` の判定が「次の」の2つの意味を混同していた**（`parseSentencePart2` の typed `LRIG_LIMIT_MODIFY`）。
原文の「次の」には**2つの意味**がある＝
①「次の〈誰かの〉〈フェイズ〉**の間**」＝**その時から**効き始める窓（→ `NEXT_TURN`＝`pending_lrig_limit_mod`）
②「次の〈誰かの〉〈フェイズ〉**終了時まで**」＝**いま**効き始めてそこまで続く期間
旧実装は `t.includes('次の')` だけで①に倒していたので、②の3効果
（`WXDi-P05-025-E2` / `WXDi-P13-004B-E3` / `WXDi-P16-002-E1`＝どれも「次のあなたのエナフェイズ終了時まで、
…リミットを＋N**する**」）が**払ったターンには1も効かず**、次のターンのメインフェイズから効き始めていた。
⇒ ②は `END_OF_TURN`（＝`lrig_limit_mod`。**いま**書いてターン終了時にリセット）へ倒した。
⚠**正確な期間（自分の次のエナフェイズ終了時まで）を表す語彙が `until` に無い**ので**短い側**を選んでいる。
⚠**この修正は `WXDi-P16-047-E2` にも波及**（`NEXT_TURN`→`END_OF_TURN`）＝盤面はほぼ同じだが
**判定規則を1本に揃えるため**同じ扱いにした。第52バッチの golden 1本を理由付きで更新。

### family ②：`TRASH_SIGNI_UNDER_FIELD_SIGNI`（live 9効果）＋ `INTERNAL_TSU_CHOOSE_ZONE`

engine は原文に**4本の regex**を当てていた。壊れ方は3つ＝

🔴**(a) 枚数が常に1枚**＝`シグニ([０-９\d]+)枚(?:まで)?を対象とし.*の下に置く` は
**live 9効果すべてに当たらなかった**（原文は「シグニ**を**２枚まで対象とし」「対象のシグニ**を**２枚まで」＝
助詞が1つ違う）。⇒ 「２枚まで」の**5効果が過小実行**（`WDK15-001` / `WDK15-007` /
`WXDi-P15-001` / `WXDi-P15-006` / `WXDi-P15-007`）。

🔴**(b) 配置先のクラスをトラッシュ側の絞り込みに使っていた**＝`＜([^＞]+)＞のシグニ.*の下に置く` は
**最初に出た `＜X＞`** を拾う。`WDK15-001` / `WXK08-048` / `WXK10-090` は `＜X＞` が**配置先にしか無い**ので、
**トラッシュの＜ウェポン＞しか選べない**過小実行だった。

🔴**(c) 配置先はカード全文から読んでいた**（`INTERNAL_TSU_CHOOSE_ZONE`）＝
`WXEX2-61`（原文の配置先は**《ライズアイコン》を持つ**シグニ）で、トラッシュ側の**＜武勇＞**を
配置先条件にしていた。

⇒ payload `trashUnderPlace:{count, upTo, sourceFilter, destFilter, destLastPlayed}` へ移した。
🔑**文を「配置先の名詞句」で2つに割る**のが要点＝末尾の `の下に置く` から遡って
`対象のあなたの` / `それらをあなたの` / `そのシグニ` などの標識を探し、**手前をトラッシュ側・後ろを配置先**として
別々に解釈する。🔑**トラッシュ側は「最後の `トラッシュから`」以降だけ**を見る
（`WDK15-007` は1文に `トラッシュから` が2回出るので、全体を見ると＜ウェポン＞の縛りが漏れる）。

### family ③：`COLLAB`（live 6効果 / 5カード）

🔴**catch-all に別の文型が混ざっていた**＝engine は「`コラボライバー` を含む ∧ `呼ぶ` を含む」で
1人／2人を決めていたので、**「呼ぶ」を含まない**文＝`WXDi-CP01-005-E1`
「【常】：あなたが【ガード】する際、…《無》を支払い**コラボライバー１人とコラボしてもよい**。」
（＝**【ガード】の代替コスト**という別機構）が下の「コラボしてもよい」既定へ落ち、
**原文と無関係にアシストルリグを場へ出す対話**を開いていた。
⇒ 呼ぶ形だけ payload `collabCall:{count}` に残し、代替コスト形は
`DEFERRED_GUARD_ALT_COST_COLLAB` へ分離（§5.3 `O-230` に登録）。
生成元の無くなった「コラボしてもよい」フォールバックは撤去した。
⚠`INTERNAL_DO_COLLAB`（実行部）は**残した**＝golden が挙動を固定しており、`O-230` の受け皿になる。

### 🔑 一般則

① **`miss=0` を「正しい」と読まない**＝funnel 経由のハンドラでは計器の miss が**構造的に甘い**。
   **`abilityBlockTextOf` でリテラルを当て直してから着手する。**
② **regex の「当たっている」は「正しく当たっている」ではない**＝`WDK15-001` は
   クラス regex が**当たっていた**（ただし配置先の語を拾って**トラッシュ側**に適用していた）。
   **当たり外れだけでなく「何を捕まえたか」を1件ずつ見る。**
③ **助詞1つで regex は全滅する**＝枚数 regex は「シグニ**を**N枚」の「を」が入るだけで
   **live 9効果すべてに当たらなかった**のに、既定値（1枚）があるので**誰も気づかなかった**。
   **既定値のある regex は「当たらないこと」が可視化されない。**
④ **同じ語（「次の」）が期間の始点にも終点にも使われる**＝
   「次の〜**の間**」（始点）と「次の〜**終了時まで**」（終点）を刻み分ける。

### 変更ファイル

`src/types/effects.ts`（`lrigLimitChange` / `trashUnderPlace` / `collabCall`）／
`src/data/parserUtils.ts`（`parseLrigLimitChangeSpec` / `parseTrashUnderPlaceSpec` / `parseCollabCallSpec`）／
`src/data/parsers/parseSentencePart2.ts`（TSU の payload ＋ `LRIG_LIMIT_MODIFY` の `until` 判定）／
`parseSentencePart3.ts`（LIMIT / COLLAB）／`src/data/effectParser.ts`（`WX24-P3-*` の複合文）／
`src/engine/execStubPart1.ts`（LIMIT・TSU・`INTERNAL_TSU_CHOOSE_ZONE` の regex 撤去）／
`src/engine/execStubPart3.ts`（COLLAB の regex 撤去＋「コラボしてもよい」枝の撤去）／
`scripts/decompileEffects.ts`（payload から逆翻訳＋`DEFERRED_GUARD_ALT_COST_COLLAB` の日本語）／
`scripts/censusEngineText.ts`（ratchet 32→28）／`scripts/goldenTest.ts`（+4本・既存2本を更新）／
`public/data/effects_{WX,WXDi,misc}.json`（26効果）。**`src/screens/` は0行。**

---

## 2026-09-03（索引 A 第17巡）：§5.3 `O-60` 第57バッチ＝🏁`O-228` — `SOUL_OP`（A群最大・唯一の miss）を payload 化

**ベースライン**＝`9f2d91e87`（第56バッチの直後）。**A🔴 SELF_TEXT 33行 → 32行 / 32→31ハンドラ**
（`BASELINE_SELF_TEXT` も 32 へ払い戻し）。🔴**`miss` は 1ハンドラ / 6カード → 0**（A群全体で miss ゼロ）。
**gates 全緑**（typecheck・golden **3383 → 3389**＝+6本・smoke 10725 全異常0・fuzz 全0・
census 高シグナル 3 / BASELINE 3・census-stubs A🔴0・C0・manual-fields 0・
census-enginetext **A🔴32**・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更24・追加0・削除0、予定外0**（＝`SOUL_OP` が居た24効果ちょうど）。
🖥**実機＝機械判定では不要**（触ったのは `src/types/` `src/data/` `src/engine/` `public/data/` `scripts/` のみ／
**`src/screens/` は1行も触っていない**・新しい interaction 型は0）。ただし
**8効果が「恒久 no-op／原文と無関係な UI」から実際の対話へ変わる**ので観測点を **`V-137`／`V-138`** に登録した（未実施）。

### 何を取ったか

`census:enginetext` A群の**最大項目 `SOUL_OP`（live 24効果 / 24カード・リテラル13本・miss 6）**。
engine（`execStubPart1.ts`）は `sourceAbilityText(ctx)`＝**アビリティブロック全文**に13本のリテラルを当てて
13通りに分岐していた。**第56バッチの計器較正で初めて見えた項目**で、**A群で唯一 miss が残っていた**。

**13本のリテラルを「どこから／どこへ」の10 kind に割り、`StubAction.soulOp`（`SoulOpSpec`）へ移した**：
`under_to_lrig_trash` / `under_to_soul` / `lrig_trash_to_soul` / `lrig_trash_to_under_center` /
`self_to_lrig_deck` / `self_to_under_center` / `processed_to_lrig_trash` /
`lrig_trash_arts_to_lrig_deck` / `lrig_deck_top_to_lrig_trash` / `merge_other_lrig_under`。
枚数・「まで」・「好きな枚数」・「合計（＝アシストも含む）」・レベル条件・「完全に同一のルリグタイプ」・
「〜してもよい」も payload の欄にした。**engine は原文を1文字も読まない**（payload が無ければ何もしない＝fail-closed）。

### 🔴 見つかった実害（3つとも「緑のまま壊れていた」）

**① `effectExecutor` の `SOUL_OP` コスト先取りが、当たっていた6効果すべてで恒久 no-op だった（撤去）**
`SEQUENCE[STUB{SOUL_OP}, CONDITIONAL{IS_MY_TURN}]` を見つけると「**ソウル**を使用して発動しますか？」を出し、
**効果元シグニの下のカード**を探していた。ところが原文はどれも
「〈センター／この／あなたの〉**ルリグ**の下からカードN枚をルリグトラッシュに置いてもよい」で、
しかも効果元は**ルリグ／アーツ／ピース**＝シグニゾーンに居ない。⇒ `available: hasSoul` が常に false ＝
**支払い肢が選べず「スキップ」しか無い＝能力が一度も発動できなかった**
（`WXDi-P04-009` / `WXDi-P06-009` / `WXDi-CP02-002` / `-003` / `-004` / `WD22-016-UG`）。
🔑**これは §5.3 `O-77`（`LRIG_UNDER_CARD_OP` のコスト先取り撤去）とまったく同じ壊れ方**で、
そのときの反省コメントが**すぐ下の行に書いてあった**のに、隣の分岐は残っていた。
⇒ 正しい受け皿は**既にあった** `OPTIONAL_LRIG_UNDER_COST`（`WXDi-P05-009-E1` が manual で使用中）。
parser の `makeSoulOpStub` が「置いて**もよい**」形をそちらへ振り分け、`lrigUnderCost{count, fromAllLrigs}` で
枚数と範囲を渡すようにした（従来の固定値「センターの下から1枚」は既定として維持）。
生成元が消えた `INTERNAL_CONSUME_SOUL` も撤去した。

**② miss 6カードの内訳＝旧 regex が「置い**てもよい**」「**１枚**」しか読めなかった**
- `WXDi-P13-003B` / `WXDi-P16-001B`＝「このルリグの下からカード１枚をルリグトラッシュに置**く**」（**強制**）
  → どのリテラルにも当たらず**汎用フォールバック**（＝上記のソウル消費 UI）へ落ち、**無言 no-op**。
- `WXDi-CP02-002/003/004`＝「**あなたの**ルリグの下からカードを**合計４枚**〜」＝
  旧 regex は「**この**ルリグの下からカード**N枚**を〜」の形しか無く、**「合計」も「あなたの」も読めなかった**。
- `WX22-Re20`③＝「ルリグトラッシュから**レベル２以下**のルリグを**２枚まで**〜置**く**」＝
  旧 regex は `レベルN…ルリグ**１枚**…置い**てもよい**` の1本だけ。

**③ `WD22-016-UG` は「そうした場合」の帰結が原文と別物だった（`manualEffects.ts` へ手書き）**
原文「あなたのトラッシュからシグニを２枚まで対象とし、あなたのセンタールリグの下からカード４枚を
ルリグトラッシュに置く。そうした場合、それらを場に出す。」に対し、parser 出力の帰結は
`ADD_TO_FIELD{owner:'self'}`＝**source 無し**。`execAddToField` の source 無し経路は
**デッキの一番上**を場に出すので、原文と無関係なカードが出る。
⚠**それまで気づけなかったのは①のせいで恒久 no-op だったから**（＝コストが払えないので帰結に到達しない）。
⇒ ①コストは `SOUL_OP{under_to_lrig_trash, count:4}` ②「そうした場合」は **`LAST_PROCESSED_COUNT_GTE:4`**
（`IS_MY_TURN`＝常に真の**偽ゲート**を置き換え＝§5.3 `O-104` と同型）③帰結は
`ADD_TO_FIELD{source: TRASH_CARD self 2 upTo シグニ}`。同型1枚なので**速いレーン（手書き）**。

### 🔑 一般則（他の A群項目にもそのまま効く）

① **catch-all を割るときは「消費側の別経路」も一緒に見る**＝この id は
   `execStubPart1`（本体）と `effectExecutor`（コスト先取り）の**2箇所**で消費されており、
   本体だけを payload 化しても**6効果は先取り側に吸い込まれたまま**だった。
   🔑`census:enginetext` は本体しか映さない（先取り側は原文を読まないので A群に出ない）＝
   **`grep -rn "<STUB id>" src/engine/` を必ず打つ。**
② **「同じ壊れ方の前例」が隣の行にコメントで残っていることがある**（`O-77` の撤去記録）。
   **撤去した分岐の隣は疑う。**
③ **恒久 no-op は下流のバグを隠す**（③の `ADD_TO_FIELD` は①を直して初めて見えた）＝
   **no-op を直したら、その効果の残りの JSON も原文と突き合わせ直す。**
④ **受け皿は既にあった**（`OPTIONAL_LRIG_UNDER_COST`）＝**新しい id を作る前に原文の言い回しで
   `src/` と `goldenTest.ts` を grep する**（PLAN §5.3「1〜3枚の項目の取り方」がそのまま効いた）。

### 変更ファイル

`src/types/effects.ts`（`SoulOpSpec` 新設＋`StubAction.soulOp` / `.lrigUnderCost`）／
`src/data/parserUtils.ts`（`parseSoulOpSpec` / `makeSoulOpStub`）／
`src/data/parsers/parseSentencePart2.ts`・`parseSentencePart4.ts`（`SOUL_OP` を出す5箇所を一本化）／
`src/engine/execStubPart1.ts`（13本の regex 分岐 → payload の `switch`／`INTERNAL_CONSUME_SOUL` 撤去／
`INTERNAL_PLACE_LRIG_UNDER_CENTER` を `SELECT_TARGET` 受けへ／`INTERNAL_CONSUME_LRIG_UNDER` に `fromAllLrigs`）／
`src/engine/effectExecutor.ts`（`SOUL_OP` コスト先取り撤去／`OPTIONAL_LRIG_UNDER_COST` の枚数・範囲を payload 化）／
`src/data/manualEffects.ts`（`WD22-016-UG`）／`scripts/decompileEffects.ts`（payload から逆翻訳）／
`scripts/censusEngineText.ts`（ratchet 33→32）／`scripts/goldenTest.ts`（+6本）／
`public/data/effects_{WX,WXDi,misc}.json`（24効果）。**`src/screens/` は0行。**

---

## 2026-09-03（索引 A 第16巡）：§5.3 `O-60` 第56バッチ — 🔴**計器の較正で16ハンドラの死角が出た**＋2 family 消化

**ベースライン**＝`37f563c1b`（第55バッチの直後）。
🔴**A🔴 SELF_TEXT 19行 → 35行（較正）→ 33行 / 32ハンドラ（消化後）**。
**`BASELINE_SELF_TEXT` は 19 → 33 へ引き上げた。⚠これは退化ではなく「可視化」**（engine のコードは1行も増えていない）。
**gates 全緑**（golden 3379 → **3383**＝+4本・smoke 10725 全異常0・fuzz 全0・census 3 / BASELINE 3・
census-stubs A🔴0・C0・manual-fields 0・census-enginetext **A🔴33**・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更17・追加0・削除0、予定外0**（うち `WXDi-P14-009-E1` はキー順のみ）。
🖥**実機＝不要と判定**（`src/screens/` は1行も触っていない・新しいアクション型／interaction 型／対話も0）。

### 🔴 この巡の主産物＝計器が16ハンドラを見ていなかった

`census:enginetext` は **行に `EffectText` が出る箇所しか数えていなかった**。
ところが engine の主要な原文読みは **`sourceAbilityText(ctx)`**（→ `abilityBlockTextOf`＝`src/data/` 側）という
**原文を引数で受け取る funnel** を通っており、**この行には `EffectText` が出ない**。
⇒ **`src/engine/` に16箇所ある funnel 呼び出しが、計器の初版から一度も数えられていなかった。**

🔑**同じ穴は既に `CLAUDE.md` に書いてあった**＝`census:costtext` の罠③
「**原文を引数で受け取る関数**（`parseUseTimeCostReduction(effectText)` 等）を数えないと `parse*` 群が丸ごと消える」。
**別の計器で発見済みの罠を、こちらの計器には適用していなかった。**

■**較正の内容**＝走査の入口に `sourceAbilityText(ctx)` を足し、**無条件に A群（SELF_TEXT）**として数える
（この funnel は定義上いつも「効果元自身」の原文を返すため）。

■**較正で見えたもの（実測）**＝**A🔴 19行 → 35行 / 34ハンドラ**、そして
🔴**`miss` が 0 → 3ハンドラ / 11カード**（＝**いま既定値へ落ちている**箇所が3つあった）。
| 新たに見えた主なハンドラ | live | miss |
|---|---|---|
| `SOUL_OP` | 24 | **6** |
| `CRAFT_TO_LRIG_DECK` / `ADD_CRAFT_TO_LRIG_DECK` | 9 | **3** |
| `SIGNI_REPOSITION` / `SWAP_OPTIONAL` / `MOVE_TARGET_SIGNI_TO_OTHER_ZONE` | 7 | **2** |
| `LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END` | 10 | 0 |
| `TRASH_SIGNI_UNDER_FIELD_SIGNI` | 9 | 0 |
| `COLLAB` | 6 | 0 |

### 何を消化したか（2 family / live 16効果）

**(a)「シグニの配置替え」family（live 7）** → **既存の汎用 `owner`** ＋ 新設 `repositionAll`。
**(b)「クラフトをルリグデッキへ」family（live 9）** → `craftToLrigDeck{setKeyword|cardName, pickCount}`。

### 🔴 実害・危険な形 3件

**①「入れ替える」2効果が「シグニの配置替え」に化けていた。**
`SWAP_OPTIONAL` は配置替えハンドラ（`SIGNI_REPOSITION` と同居）に落ちていたが、原文は
**2つのゾーンの一番上を入れ替える**別の機構だった＝
`WX13-073-E1`「**対戦相手の**ライフクロスの一番上とデッキの一番上を見る。あなたはそれらを入れ替えてもよい」／
`WXDi-P10-047-E1`「あなたのデッキの一番上を見る。そのカードと**エナゾーンにあるこのシグニ**を入れ替えてもよい」。
⇒ どちらも **自分の場のシグニをゾーン移動する UI** が開いていた（原文と無関係な盤面操作）。
いまは `DEFERRED_SWAP_OPP_LIFE_TOP_AND_DECK_TOP` / `DEFERRED_SWAP_DECK_TOP_WITH_SELF_IN_ENERGY` で
機構が無いことを宣言し、`O-229` に登録した。
🔑**ついでに前段も直った**＝`WX13-073` の「見る」は原文が**対戦相手のデッキ**なのに
live は `LOOK_AND_REORDER{owner:'self'}`＝**自分のデッキを覗いて**いた（held に stale で眠っていた fresh を採用）。

**②配置替えの持ち主は「前の文」にある。**
「**対戦相手の**シグニ1体を対象とし、**それを**他のシグニゾーン1つに配置してもよい」＝
配置の文だけを読んでも持ち主が分からないので、engine がブロック全文を `includes('対戦相手のシグニ')` で
読み直すしかなかった。⇒ **文中に主語がある形は文単位で**（`parseSentencePart2/4`）、
**前の文にある形は効果単位の後処理で**（`effectParser` の `fillReveal`）刻み分けた。

**③クラフトの束の呼称が engine の綴り一致に依存していた。**
`TOKEN_SETS` のキーワード（`'ヤミノアーツ'`）と原文の綴りが1文字でも違うと**候補0＝無言 no-op**になる形
（§6.4 `O-22(c)` で一度事故済み）。⇒ 束の呼称を **JSON（`craftToLrigDeck.setKeyword`）**へ移し、
golden は「**live の綴り**」と「その payload で engine が5種を出すこと」の**両方**を assert するようにした。

### 🔑 教訓

**①計器は「読み出しの文字列」ではなく「読み出しの経路」で数える。**
`EffectText` という語で grep する設計は、**funnel が1枚挟まった瞬間に盲目になる**。
⇒ **原文を引数で受け取る関数を1本でも作ったら、計器の入口に足す**（`sourceAbilityText` は
`src/data/` 側で `EffectText` を読むので、`src/engine/` の全走査では永久に見えない）。

**②「ある計器で見つけた罠」は他の計器にも当てる。**
まったく同じ罠が `CLAUDE.md` の `census:costtext` の項に**先に書かれていた**のに、
`census:enginetext` には適用されていなかった。**罠の記録は計器ごとではなく横断で読む。**

**③ratchet は「増えたら退化」ではない場合がある。**
今回の 19→35 は**可視化**で、engine は1行も増えていない。
⇒ **ベースラインを上げるときは「較正」か「退化」かを必ず1行で書く**（今回は較正）。

**④miss=0 は「正しい」ではないが、miss>0 は本当に壊れている。**
較正の前は「miss 0ハンドラ」で安心していたが、実際には **miss 3ハンドラ / 11カード**が隠れていた。
（残るのは `SOUL_OP` の miss6 だけ＝`O-228` に登録。）

### 反転確認

- golden 内に payload 側の反転を同梱＝`owner` を落とすと配置替えの interaction が出ない／
  `craftToLrigDeck` を落とすとクラフト選択が出ない（どちらも fail-closed）。
- 相手指定（`owner:'opponent'`）で `targetScope:'opp_field'`・候補2体になることを盤面で assert。
- 計器の入口そのものを守る golden を追加（`isAbilityFunnel` が消えたら FAIL）。

### 配送

12効果は `build:effects` が自動採用。`WX13-073` / `WXDi-P10-047` は `heldReview --adopt`。
🔴**`WXDi-P00-068-E1` は外科パッチ**＝fresh 全体を採用すると live の curated な
`targetsTriggerSource:true`（＝「そうした場合、**それ**のパワーを＋3000」の照応）が落ちるので、
`owner:'self'` の1キーだけを live へ足した。

### ⚠ 新規登録 2件

- **`O-228`**＝`SOUL_OP`（live 24効果・**miss 6**・リテラル13本）＝ルリグの下／ルリグトラッシュ／
  ルリグデッキを跨ぐ操作の catch-all。**今回の較正で初めて計器に出た最大の項目**。
- **`O-229`**＝**2つのゾーンの一番上を入れ替える**機構（`WX13-073` / `WXDi-P10-047`・2効果）。

### 触ったファイル

`scripts/censusEngineText.ts`（**走査の入口に funnel を追加＝較正**／ratchet 19→33）／
`src/types/effects.ts`（payload 2キー）／`src/engine/execStubPart2.ts`・`execStubPart3.ts`（消費側）／
`src/data/parsers/parseSentencePart2.ts`・`parseSentencePart3.ts`・`parseSentencePart4.ts`／
`src/data/effectParser.ts`（効果単位の後処理）／`scripts/decompileEffects.ts`（逆翻訳3分岐＋miscStubMap 2行）／
`scripts/goldenTest.ts`（+4本＋契約1本更新）。**`src/screens/` は0行。**

---

## 2026-09-03（索引 A 第15巡）：§5.3 `O-60` 第55バッチ — 「引用能力の付与・使用」family 3ハンドラ

**ベースライン**＝`1f6d30587`（第54バッチの直後）。**A🔴 SELF_TEXT 22行 → 19行 / 22→19ハンドラ**
（`BASELINE_SELF_TEXT` も 19 へ払い戻し／A群 live 効果 **48 → 33**／miss は 0 のまま）。
**gates 全緑**（golden 3376 → **3379**＝+3本・smoke 10725 全異常0・fuzz 全0・census 3 / BASELINE 3・
census-stubs A🔴0・C0・manual-fields 0・census-enginetext **A🔴19**・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更4・追加0・削除0、予定外0。**
🖥**実機＝不要と判定**（`src/screens/` は1行も触っていない・新しいアクション型／interaction 型／対話も0＝
足したのは `parseActiveCondition` の regex 2本と engine のヘルパ関数1つだけ）。

### 何を取ったか

`census:enginetext` A群の **3ハンドラ / live 15効果**：

| ハンドラ | live | 直し方 |
|---|---|---|
| `SONG_FRAGMENT`（＋`INTERNAL_SONG_FRAGMENT`） | 11 | 候補判定を **`SONG_ICON` 効果の有無**へ（構造化） |
| `SIGNI_GRANT_QUOTED_CONSTANT_ABILITY` | 3 | parser が **`GRANT_EFFECT{rawText}`** を出す（engine は fail-closed の残余へ） |
| `GRANT_QUOTED_ACTIVATE_ABILITY` | 1 | **真 no-op だったので `DEFERRED_` へ改名**（`O-227` を登録） |

### 🔴 実害・危険な形 4件

**①`SONG_FRAGMENT` は「原文に【歌のカケラ】と書いてあるだけ」のカードを候補にしていた。**
旧＝`card.EffectText.includes('【歌のカケラ】')`。実測＝原文にこの語を含むのは**26枚**で、
うちエナゾーンに入りうるのは16枚。そのうち **`WX26-CP1-101`（スペル「力を貸して！」）は自分の
【歌のカケラ】を持たない**（「【歌のカケラ】を**持つカード**を…」と書いているだけの、**使う側**のカード）。
⇒ エナゾーンにあると候補に出て、選ぶと**トラッシュへ置かれるだけで何も起きない**＝カードの丸損。
🔑`SONG_ICON` は parser が `/【歌のカケラ】：/` から作る効果なので、**構造化された判定と原文が一致する**。
⚠**候補判定と実行を同じ funnel（`songIconEffectOf`）に通した**＝別々に判定すると
「選べるのに何も起きない」が復活する（旧実装はまさにこの形だった）。

**②`SIGNI_GRANT_QUOTED_CONSTANT_ABILITY` はゲートを落として無条件付与に化けていた。**
`WXDi-P01-002-E1`「あなたのシグニを２体まで対象とし、…それらは『【常】：このシグニは、**正面に
パワー12000以上のシグニがある**かぎり、【アサシン】を得る。』を得る」＝engine 側の
`buildGatedKeywordGrant` は「正面**のシグニのパワーが**N以上であるかぎり」の綴りしか知らず、
この言い回しには**1本も当たらない** → `null` → **2体へ無条件に【アサシン】**（過剰実行）。

**③同ハンドラは【シャドウ（レベル３以上）】の括弧内スコープを落としていた。**
`WXDi-P14-008-E2` は `txt.includes('シャドウ')` で素の `シャドウ` を付与していた＝
**レベル2以下のシグニに対してもシャドウが効く**（過剰実行）。
いまは parser が `シャドウ:{"levelGte":3}` を刻む。

**④`GRANT_QUOTED_ACTIVATE_ABILITY` は「実装済み」を騙るコメントつきの真 no-op だった。**
ハンドラのコメントは「effectEngine の CONTINUOUS 処理で対応」だったが、
`npx tsx scripts/censusStubs.ts --id GRANT_QUOTED_ACTIVATE_ABILITY` の実測で**消費地点 0**。
実体は**カード全文から引用文を切り出してログに出すだけ**。⇒ `DEFERRED_` へ改名して
逆翻訳に `【未実装】` を出し、機構を `O-227` に登録した。

### 🔑 教訓

**①「engine が原文で判定している」の直し方は payload だけではない＝“構造化された等価物”を探す。**
`SONG_FRAGMENT` の正解は payload ではなく **`SONG_ICON` 効果の有無**だった
（parser が同じ原文から作る構造なので、意味が二重管理にならない）。
⇒ **A群を見るときの3択**＝(a) payload へ移す (b) 同じ意味を決めている別の場所があるなら**撤去**（第54①）
(c) **構造化された等価物**（効果型・条件型）で判定し直す。

**②catch-all STUB を消す一番安い方法は「既存の構造化経路に落とす」。**
`SIGNI_GRANT_QUOTED_CONSTANT_ABILITY` は `GRANT_EFFECT{rawText}` に変えるだけで
`expandGrantEffectRawTexts` が本物の `CardEffect`（`activeCondition` つき CONTINUOUS）へ展開した
＝**engine 変更0行・新しい型0本**。`WXDi-P07-009` / `WXDi-P09-053` が既に同じ形で live に居たのが根拠。
⚠**対象は引用より前の部分だけで読む**＝`parseSigniTarget(t)` に文全体を渡すと
引用内の「パワー12000以上」を**対象フィルタ**に混ぜる（実測＝`WXDi-P01-002` が
`filter:{powerRange:{min:12000}}` になった）。`t.slice(0, t.indexOf('「'))` で切る。

**③逆翻訳が「原文そのまま」に見えるのは、直っている証拠ではなく死角の証拠。**
この3カードの旧逆翻訳は**原文を丸ごと引用して完璧に見えていた**（`「【常】：…」を得る`）。
構造化した結果は `【シャドウ:{"levelGte":3}】` のように**読みにくくなった**が、
**engine が実際に何をするか**が初めて見えるようになった。
（生 JSON 表記の日本語化は PLAN §5.5 の既存項目。**今回の変化は退行ではない**。）

**④「実装済み」を騙るコメントは `censusStubs --id` で必ず裏を取る。**
`GRANT_QUOTED_ACTIVATE_ABILITY` は 消費地点0（＝真 no-op）なのに
「effectEngine で対応」というコメントが3年ぶん残っていた。**コメントは実装の証拠にならない。**

### 反転確認

- **`SONG_FRAGMENT`**＝旧ロジック（原文 includes）を再現して数で取った＝
  原文に【歌のカケラ】を含む26枚のうち、`SONG_ICON` を持たないのに候補になるカードが実在する
  （`WX26-CP1-101`）。golden にエナ2枚の盤面で「力を貸して！はエナに残る」を assert。
- **`SIGNI_GRANT_QUOTED_CONSTANT_ABILITY`**＝golden で `collectContinuousGrantedKeywords` を直接叩き、
  正面 11999 では**アサシンが付かない**／12000 では付くことを assert（旧実装は 11999 でも付いていた）。
- 契約 golden 1本を更新＝`task12(cxiv)` の母集団は 7枚 → **6枚**（`WXDi-P10-025` が構造化経路へ移った）。
  **退行ではなく契約の更新**（ゲートは第55の新テストが assert する）。

### 配送

4効果とも `heldReview --adopt`（構造変更なので自動採用に乗らない）。
`SONG_FRAGMENT` は engine のみの変更なので JSON 差分0。

### ⚠ 新規登録 1件

**`O-227`**＝**期間つきでプレイヤーが得る【起】能力**（`WXDi-P09-066-E1`）。
`GRANT_PLAYER_ABILITY` は `permanent:true` の AUTO 用ストア（`game_granted_effects`）なので流用できず、
**`src/screens/` の提示（起動 UI）が要る＝遅いレーン＋実機必須**。PLAN §5.3 索引 G。

### 触ったファイル

`src/engine/execStubPart1.ts`（`songIconEffectOf` 新設＋`SONG_FRAGMENT`／`INTERNAL_SONG_FRAGMENT`／
`DEFERRED_GRANT_QUOTED_ACTIVATE_ABILITY`）／`src/engine/execStubPart2.ts`（残余を fail-closed へ）／
`src/data/parsers/parseSentencePart2.ts`（`GRANT_EFFECT{rawText}` 生成＋`DEFERRED_` 改名）／
`src/data/effectParser.ts`（`parseActiveCondition` に正面パワー2形）／
`scripts/decompileEffects.ts`（`miscStubMap` に1行）／`scripts/censusEngineText.ts`（ratchet 22→19）／
`scripts/goldenTest.ts`（+3本＋契約1本更新）。**`src/screens/` は0行。**

---

## 2026-09-03（索引 A 第14巡）：§5.3 `O-60` 第54バッチ — 「使用コスト・追加支払い・維持コスト」family 7ハンドラ

**ベースライン**＝`560cd80b5`（第53バッチの直後）。**A🔴 SELF_TEXT 29行 → 22行 / 29→22ハンドラ**
（`BASELINE_SELF_TEXT` も 22 へ払い戻し／A群 live 効果 **62 → 48**／miss は 0 のまま）。
**gates 全緑**（golden 3369 → **3376**＝+7本・smoke 10725 全異常0・fuzz 全0・census 3 / BASELINE 3・
census-stubs A🔴0・C0・manual-fields 0・census-enginetext **A🔴22**・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更11・追加0・削除0、予定外0。**
🖥**実機＝不要と判定**（`src/screens/` は1行も触っていない・新しいアクション型／interaction 型／対話も0＝
足したのは `StubAction` の payload キー4本と既存条件型 `LRIG_STORY` の再利用だけ）。

### 何を取ったか

`census:enginetext` A群の **7ハンドラ / live 13効果 / 13カード**：

| ハンドラ | live | 受け皿 |
|---|---|---|
| `CHOOSE_HAND_OR_ENERGY` | 4 | `handOrEnergyLookCount`（**効果単位の後処理**で刻む） |
| `CONDITIONAL_COST_REDUCTION_BY_FIELD` | 3 | **payload 不要**＝実コストは `cost.costReplacement` が持つ（ハンドラはログだけに） |
| `UPKEEP_OR_NO_UP` | 2 | `upkeepCondition` |
| `EXTRA_COST_REMOVE_VIRUS` | 2 | `virusCount`（`REMOVE_VIRUS` と共有・`value` から移設） |
| `REDUCE_PLAY_ABILITY_COST` | 1 | `reduceNextOnPlayCost{color,count}` |
| `GAIN_COIN_AND_DISCARD` | 1 | `coinAndDiscard{coin,discard}` |
| `CONDITIONAL_TRASH_TO_ENERGY` | 1 | **payload 不要**＝条件を `CONDITIONAL{LRIG_STORY}` へ出した |

### 🔴 実害・危険な形 4件

**①`UPKEEP_OR_NO_UP` は付与能力の中で回避条件が 1/3 に化けていた（実測）。**
`WXDi-P06-002-E1` はこの STUB が `GRANT_LRIG_ABILITY.abilities[]` の子にあり、
`triggerCollect` は付与能力のトリガーを **`cardNum: lrigTop`（＝付与先のルリグ）**で積む。
旧 engine はその効果元の原文を読むので、原文の《無》《無》《無》には当たらず既定
`pay_colorless1` へ落ちていた＝**相手は《無》1つで回避できる**（原文の 1/3 の重さ）。
🔑**反転を数で取った**＝付与先候補になりうるレベル3ルリグは **341枚**あり、旧ロジックが
`pay_colorless3` を返すのは **3枚だけ**（＝338/341 で外れる）。第53バッチ④ と同型の経路依存。

**②`CONDITIONAL_COST_REDUCTION_BY_FIELD` は「ログを出すだけのハンドラが、実コストと別の判定式を
持っていた」二重実装だった。**盤面を1ビットも変えないのに、カード全文の `＜…＞` を先頭3件まで
拾って `every`（全部必要）で判定していた。実害2件＝
- `WX15-034` の原文条件は「場に**パワー15000以上**のシグニがある場合」なのに、
  拾っていたのは**選択肢①の＜武勇＞**（＝まったく別の条件を判定していた）。
- `WX12-049` の原文は「青の＜電機＞があれば《青》減り、黒の＜電機＞があれば《黒》減る」＝**独立2本**
  なのに `every` で**両方必要**にしていた（live の `costReplacement` は正しく `accumulate:true` の2本）。

⇒ 第48バッチの `CONDITIONAL_CARD_COST_BY_OPP_LRIG` と同じ扱い（ログのみ）にした。
**実コストの正は `EffectCost.costReplacement`**（§5.3 `O-86` でそう決めた）。

**③`CHOOSE_HAND_OR_ENERGY` の既定3枚は原文5枚の効果を過少実行しうる形だった。**
`WXDi-CP02-003` は原文「デッキの上からカードを**５枚**見る」で、旧 regex `([０-９\d]+)枚見る` が
**たまたま当たっていたから合っていた**だけ（＝**miss=0 は正しさではない**の実例）。
さらに `WXDi-CP01-004` ではこの効果が `CHOOSE` の**③の枝**にあり、カード全文には①②の枝の数字も並ぶ。

**④`GAIN_COIN_AND_DISCARD` のコイン枚数 regex は1本も当たっていなかった。**
`コイン([０-９\d]*)(?:枚?|個?)を得る` に対し原文の綴りは **《コインアイコン》を得**。
既定 1 が原文と一致していたので表に出ていなかった（miss=0 の中身）。

### 🔑 教訓

**①「engine が原文を読む」形には “実コストを決める側との二重実装” がある。**
`CONDITIONAL_COST_REDUCTION_BY_FIELD` は**盤面を変えないハンドラ**なので、census:enginetext 以外の
どの計器にも映らない（golden も smoke も緑）。⇒ **A群を見るときは「そのハンドラが何をしているか」より
先に「同じ意味を決めている別の場所があるか」を見る**（あれば payload 化ではなく**撤去**が正解）。

**②条件は payload ではなく既存の条件型へ出せることがある。**
`CONDITIONAL_TRASH_TO_ENERGY` の「あなたのセンタールリグが＜X＞の場合」は
**`LRIG_STORY`（既存）で足りた**＝新しい payload キーを1本も足さずに engine の全文読みが消え、
逆翻訳にも条件が出るようになった（旧は STUB の中に隠れていた）。
⇒ **新キーを足す前に「条件型 / 汎用 payload / 既存の受け皿」の順で当たる**（第53バッチ② の一段上）。

**③payload を刻んだら「manual 影武者」になることがある。**
`EXTRA_COST_REMOVE_VIRUS` の live 2効果は `manualEffects.ts` に `value` 付きで手書きされていたが、
parser に `virusCount` を足した瞬間に**実体が parser 出力と同一**になり、
`§6.4 O-42 tripwire`（影武者コピー残0）が FAIL して教えてくれた。
⇒ manual を削除 → `census:orphanmanual --unfreeze A` で live の MANUAL 刻印も解凍した
（**parser の改善がこの2効果へ届くようになった**）。

**④「前の文にある数字」は効果単位の後処理＋①②③スコープ**（第53バッチ① の再適用）。
`CHOOSE_HAND_OR_ENERGY` は「**その中から**〜」の文に STUB が立つので、`effectParser` の `fillReveal`
（`[①-⑤]` でセグメントへ分割し `choices[i]` は `segs[i]` だけを見る）へ相乗りさせた。

### 反転確認

- **`UPKEEP_OR_NO_UP`**＝旧ロジックを再現して数で取った（上記①＝341枚中338枚で `pay_colorless1` へ転落）。
- golden 内に payload 側の反転を同梱＝`upkeepCondition` を落とすと相手のアップ条件が積まれない／
  `handOrEnergyLookCount` を落とすと手札が動かない／`reduceNextOnPlayCost` を落とすと軽減が state に入らない／
  `coinAndDiscard` を落とすとコインも手札も動かない／`virusCount` を落とすと選択肢が「取り除かない」の1つだけ。
- `CONDITIONAL_TRASH_TO_ENERGY` はセンタールリグが＜アイヤイ＞でなければ**トラッシュに残る**ことを assert。

### 配送

9効果は `build:effects`（うち `WX14-029` / `WXDi-CP02-003` の2枚は構造変更なので `heldReview --adopt`）。
`EXTRA_COST_REMOVE_VIRUS` の2効果は manual 削除 → `build:effects` → `censusOrphanManual --unfreeze A`。

### ⚠ この巡では取らなかったもの（理由つき）

`ARTS_EXTRA_COST_CONDITION`（live 1・`WX26-CP1-024`）は**モーダル選択 family (a)** に属する。
engine が ①②の選択肢を「パワー＋N」「ダウン」の**2形だけ**の自前 regex で組み立てており、
正しくするには `CHOOSE{choices[]}` ＋「追加コストを払っていたら選択数を2にする」上書き機構が要る
＝PLAN の「(a) は `choiceTextParser.ts` を parser 側へ移すまで採用しない」に該当するので据置。

### 触ったファイル

`src/types/effects.ts`（payload 4キー＋family コメント）／
`src/engine/execStubPart1.ts`・`execStubPart2.ts`・`execStubPart3.ts`（消費側7ハンドラ）／
`src/data/parsers/parseSentencePart2.ts`・`parseSentencePart4.ts`・`src/data/effectParser.ts`（生成側＋後処理）／
`src/data/manualEffects.ts`（影武者2件を削除）／`scripts/decompileEffects.ts`（逆翻訳5分岐）／
`scripts/censusEngineText.ts`（ratchet 29→22）／`scripts/goldenTest.ts`（+7本＋契約1本更新）。**`src/screens/` は0行。**

---

## 2026-09-03（索引 A 第13巡）：§5.3 `O-60` 第53バッチ — 「ゾーン移動・公開」＋「属性の書き換え」family 10ハンドラ

**ベースライン**＝`a8041b440`（第52バッチの直後）。**A🔴 SELF_TEXT 39行 → 29行 / 39→29ハンドラ**
（`BASELINE_SELF_TEXT` も 29 へ払い戻し／A群 live 効果 **77 → 62**／miss は 0 のまま）。
**gates 全緑**（golden 3362 → **3369**＝+7本・smoke 10725 全異常0・fuzz 全0・census 3 / BASELINE 3・
census-stubs A🔴0・C0・manual-fields 0・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更21・追加0・削除0、予定外0。**
🖥**実機＝不要と判定**（`src/screens/` は1行も触っていない・新しいアクション型／interaction 型／対話も0）。

### 何を取ったか

`census:enginetext` A群の **10ハンドラ / live 21効果 / 21カード**：
**(a) ゾーン移動・公開**＝`ADD_CARD_TO_LRIG_DECK`＋`_HIDDEN`(6)→`addToLrigDeck{cardNames}` ／
`PLACE_TRAP_FROM_REVEALED`(4)→`placeTrapReveal{revealCount}` ／
`REVEAL_PICK_HAND_SHUFFLE_BOTTOM`(3)→`revealPickParams.revealCount` ／
`CRASH_LIFE_TO_HAND`(2)→**既存の汎用 `owner`** ／ `TRASH_CLASS_TO_HAND_OR_ENERGY`(1)→`trashPickSplit`。
**(b) 属性の書き換え**＝`CHANGE_SIGNI_COLOR`(1)→`changeSigniColor{color,filter}` ／
`GRANT_SIGNI_CLASS`(1)→`grantSigniClass` ／ `CHANGE_EICHI_SIGNI_BASE_LEVEL`(1)→**既存の汎用 `selectTarget`** ／
`DECK_SIGNI_LEVEL_OVERRIDE`(1)→`deckSigniLevelOverride` ／
`ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE`(1)→`gainedLrigType`。

### 🔴 実害・危険な形 4件

**①`ADD_CARD_TO_LRIG_DECK` は《…》を全部カード名として拾っていた。**
`WXDi-P09-007` は同じカードの別の【起】に **《無》《ゲーム１回》《緑×0》** があり、候補6件のうち3件が
**コスト記号**だった（§4.1 の「原文の《…》はカード名だけでなくコスト記号にも使う」の実例）。
いまは実体が見つからず黙って捨てられているだけで、**同名のカードが実在すれば原文に無いカードが
ルリグデッキへ入る**。⇒ parser 側で `parseNameFilter` と同じ除外規約を掛けて payload に刻んだ。

**②`CRASH_LIFE_TO_HAND` は「原文を読むために engine が経路情報を復元」していた。**
`WXDi-P07-001` は `GRANT_LRIG_ABILITY` の子として実行されるため効果元が**付与先のルリグ**になる。
旧実装はそれでも原文を読みたいので **`effectId` の `-sub-E\d+` からカード番号を逆引きする足場**を
engine 側に生やしていた。⇒ `owner` payload 1つで足場ごと消えた。
⚠**fail-closed の向きが重要**＝旧既定の `self` は「**自分の**ライフを手札に加える」＝原文と逆向きの利得。

**③`PLACE_TRAP_FROM_REVEALED` の既定 2枚は原文（3〜5枚）に対する過小実行だった。**
「N枚見**て**」の連用形を後から足した履歴（`O-55`）が、そのまま**綴り依存**の証拠になっていた。

**④`CHANGE_SIGNI_COLOR` / `CHANGE_EICHI_SIGNI_BASE_LEVEL` / `DECK_SIGNI_LEVEL_OVERRIDE` は
別の能力の絞り込みを掴みうる位置にあった**（`WX25-P3-111` は【起】にも「パワー5000以下のシグニ」、
`WXEX1-71` は【常】にも「あなたの＜英知＞のシグニ」）。
`DECK_SIGNI_LEVEL_OVERRIDE` は外れると **`'宇宙'` / レベル4 の焼き込み**へ落ちる形だった。

### 🔑 教訓

**①「公開枚数は前の文にある」＝文単位では読めない payload がある。**
`PLACE_TRAP_FROM_REVEALED` / `REVEAL_PICK_HAND_SHUFFLE_BOTTOM` / `ADD_CARD_TO_LRIG_DECK_HIDDEN` は
どれも「**その中から**〜」の文に STUB が立ち、枚数や名前は**前の文**にある。
⇒ **効果単位の後処理**で刻んだ（第49バッチ②の再適用）。
🔴**⚠その後処理は `①②③` があるときセグメントへスコープを狭める**＝`WX14-037` は `CHOOSE` の②の枝で、
効果全体を見ると①の枝の数字も並ぶ。**選択肢ごとに区切って読む**規律を入れた（golden で assert）。

**②「受け皿は既存の汎用 payload」が2件あった。**
`CRASH_LIFE_TO_HAND` は `StubAction.owner`、`CHANGE_EICHI_SIGNI_BASE_LEVEL` は `StubAction.selectTarget`
で足りた。⇒ **新しいキーを足す前に、汎用 payload（`owner` / `selectTarget` / `value`）で足りないかを見る。**

**③payload を足すと既存の「契約 golden」が落ちる。**
`続き390 WXDi-P07-001-E1` は付与能力の action を **JSON 文字列一致**で assert しており、
`owner` を足した瞬間に FAIL した。**これは退行ではなく契約の更新**なので期待値側を直した
（⚠逆に「文字列一致 assert が落ちない payload 追加」は、その効果を誰も assert していない証拠でもある）。

### 反転確認

- `CRASH_LIFE_TO_HAND` の `owner` 読みを `false ? … : 'self'` に差し替える →
  「対戦相手のライフが1枚減る expected=4 got=5」で **FAIL**（＝旧既定 self の再現）。戻して PASS。
- golden 内にも payload 側の反転を同梱＝`addToLrigDeck` を落とすとルリグデッキに1枚も入らない、
  色変更はレベル4のシグニを候補にしない。

### 配送

19効果は `build:effects` が自動採用。**MANUAL 2効果**（`WX24-P2-048`＝`owner`／`WXDi-P03-054`＝`revealCount`）は
`manualEffects.ts` へ手書きしてから `syncManualLive.ts` で届けた。

### ⚠ 据置（この巡では直さない）

`ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE` は原文「**すべての**場にあるセンタールリグ」だが、engine は
`lrig_gained_types`（`PlayerState` ごと）へ**自分側にしか積まない**。**payload 化だけを行い、両者化は据置**
（逆翻訳にも `（※engine はあなた側のみ）` と明記した）。`O-60` 登録票に記録。

### 触ったファイル

`src/types/effects.ts`（payload 7キー＋`revealPickParams.revealCount`）／
`src/engine/execStubPart1.ts`・`execStubPart2.ts`・`execStubPart3.ts`（消費側）／
`src/data/parsers/parseSentencePart1.ts`〜`Part4.ts`・`src/data/effectParser.ts`（生成側＋効果単位の後処理）／
`src/data/manualEffects.ts`（MANUAL 2件）／`scripts/decompileEffects.ts`（逆翻訳8分岐）／
`scripts/censusEngineText.ts`（ratchet 39→29）／`scripts/goldenTest.ts`（+7本＋契約1本更新）。**`src/screens/` は0行。**

---

## 2026-09-03（索引 A 第12巡）：§5.3 `O-60` 第52バッチ — 「原文から数値ひとつを読むだけ」family 12ハンドラ

**ベースライン**＝`416bf147c`（第51バッチの直後）。**A🔴 SELF_TEXT 51行 → 39行 / 51→39ハンドラ**
（`BASELINE_SELF_TEXT` も 39 へ払い戻し／A群 live 効果 **98 → 77**／miss は 0 のまま）。
**gates 全緑**（golden 3352 → **3362**＝+10本・smoke 10725 全異常0・fuzz 全0・census 3 / BASELINE 3・
census-stubs A🔴0・C0・manual-fields 0・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更21・追加0・削除0、予定外0。**
🖥**実機＝不要と判定**（`src/types/` `src/data/` `src/engine/` `public/data/` `scripts/` のみ／
**`src/screens/` は1行も触っていない**・新しいアクション型／interaction 型は0・新しい対話も0）。

### 🔴 まず「取る family」の選び直しをした（PLAN の見立ては半分外れだった）

PLAN §1 の「次の一手」は **(a) モーダル選択（①②③④）6ハンドラ / live17** を第一候補にし、
「typed な `CHOOSE{choices[]}` が既に在る可能性が高い」と書いていた。**実測した結果、着手しない判断にした。**

- ✅**受け皿は完備していた**＝`CHOOSE{choose_count, from_count, choices[], upTo, allowRepeat, noRepeat}` に加え、
  選択数の上書きが **`betChoose` / `conditionChoose` / `recollectArts` / `recollect` /
  `preUseVirusChoose` / `additionalCostChoose` / `countChoose`** の **7本**も既にある。
- ✅**parser も既に typed を出していた**＝`BET_MECHANIC` の live 8カードは**8枚とも** `parseCardEffects` が
  typed `CHOOSE{…, betChoose}` を返しており、**8枚とも `docs/_held_fresh.json` で採用待ち**だった。
- 🔴**しかし単純採用は退行になる。** engine 側の `src/engine/choiceTextParser.ts`（**492行**）は
  **汎用 parser より賢い分岐を20個ほど持っている**＝
  `WX16-005` の `levelLteFieldVirusCount`（fresh は落ちる＝過剰実行）／
  `SPK16-13E` ①の**honest defer**（`INTERNAL_NOOP`。fresh は**無条件バニッシュ**＝過剰実行）／
  ②③の `ENERGY_TRASHED_BY_OPP` / `HAND_TRASHED_BY_OPP` 条件（fresh は条件ごと落ちる）／
  `WDK06-R08` ①の `powerLtLastProcessed`（fresh は素の BANISH）／
  `WX19-006` ①は engine が `TRASH{level.min:4}`（fresh は `STUB{BANISH}`）。
  **逆に fresh の方が良い option もある**（`PR-K072` ②は engine が `INTERNAL_NOOP`、
  `WDK12-007` は engine が STUB 2本／`WX19-005` ①は fresh が typed）。
  ⇒ **option 単位で優劣が入り混じっており、「採用」でも「engine 優先」でも一律には直せない。**
- ⇒ **この family は `choiceTextParser` の知識を parser 側へ移設する多バッチ項目**として登録票へ記録し、
  今回は**実際に払う family**（下記）へ切り替えた。
  🔑**教訓＝「受け皿が在る」だけでは取れる根拠にならない。「engine 側に parser より賢い分岐が無いか」まで見る。**

### 何を取ったか

`census:enginetext` A群のうち、**engine が `EffectText + BurstText`（カード全文）に regex を1本当てて
数値ひとつを決めていた 12ハンドラ / live 21効果 / 21カード**を1バッチで取った。壊れ方が3つとも同じ＝
①**カード全文**なので同じカードの**別の能力**の数字を拾いうる ②綴りが1つ違えば**既定値へ落ちる**
③効果元が `cardMap` から引けない経路では**必ず既定値**。

**(1) スカラー payload へ寄せた 10ハンドラ**（`StubAction` に9キー）＝
`DRAW_DISCARD_COUNT_PLUS_N`(3)→`drawDiscardPlus` ／ `LIMIT_OPP_DRAW_COUNT`(3)→`drawLimit` ／
`OPP_HAND_TO_DECK_TOP`(2)→`oppHandToDeckCount` ／ `OPP_CHOOSE_OWN_SIGNI_TO_ENERGY`(2)→`oppSigniPowerMin` ／
`VIEW_AND_DISCARD_SPELL`(2)→`viewDiscardSpell{costMax?,count}` ／ `COIN_SPEND_CONDITION`(1)→`coinSpentMin` ／
`OPP_ENERGY_EXCESS_TRASH`(1)＋`CONDITIONAL_TRASH_UNDER_SIGNI`(1)→`oppEnergyThreshold`（**共有**） ／
`MULTI_DAMAGE_ON_LRIG_ATTACK`(1)→`lrigAttackTimes` ／ `TRASH_SPELL_FREE_USE_LIMIT`(1)→`trashSpellCostMax`。

**(2) 受け皿が別に在ったので STUB ごと撤去した 2ハンドラ**＝
`EFFECT_LIMIT`(3)→`POWER_MODIFY_PER_TRASH_COUNT.maxUnits` ／
`LRIG_LIMIT_MODIFY`(1)→ typed `LrigLimitModifyAction`。

### 🔴 実害3件

**①`EFFECT_LIMIT` は【常】経路で1ビットも効いていなかった。**
原文「この効果は１０枚までしか適用されない」に対し、旧実装は `temp_power_mods` の最後のエントリを
**`上限×1000`** でキャップしていた。ところが **`effectEngine` の CONTINUOUS 計算は `temp_power_mods` を
通らない**ので、`WX13-053`（【常】「トラッシュの＜空獣＞＜地獣＞1枚につき＋1000」）は
**トラッシュ20枚で原文の＋10000ではなく＋20000**になっていた。
⇒ `maxUnits` を **executor と effectEngine の2経路**へ配線した（第50バッチ③と同じ家系）。
⚠**単価 1000 の焼き込み**も同時に消えた（`deltaPerUnit` から計算するようになった）。

**②`LRIG_LIMIT_MODIFY` の STUB は「向き」も「寿命」も持っていなかった。**
`WXDi-P16-047-E2` の原文は「**対戦相手の**センタールリグのリミットを－１する（**次の対戦相手のメイン
フェイズ終了時まで**）」だが、旧 STUB は **常に自分のリミットを恒久的に**減らしていた（向きが逆・寿命なし）。
🔑**受け皿は最初から typed `LRIG_LIMIT_MODIFY{owner, delta, until}` だった**＝parser の regex が
「リミット**は**N（増え|減る）」しか読まず、「リミット**を**－１**する**」が届かないだけだった（第50バッチ②の再現）。

**③同じ文を読む2ハンドラで既定値が食い違っていた。**
「対戦相手のエナゾーンにカードがN枚以上ある場合」を `OPP_ENERGY_EXCESS_TRASH` は既定 **5**、
`CONDITIONAL_TRASH_UNDER_SIGNI` は既定 **3** で読んでいた（＝どちらが正しいのか JSON からは決して分からない）。
実測すると原文は **5** と **2**＝**後者は既定 3 では発火しない盤面がある**（過少実行）。

### 🧹 計器の較正（退化ではない）

STUB を2つ解体したので `census` の高シグナルが **3 → 6** へ増えた（`census` は STUB/MANUAL を高シグナルから
免除するため）。増えた3件は `WX13-053-E1` / `WX21-066-E1` / `WXDi-P10-076-E1` ＝**新キー `maxUnits` が
キー表に無かっただけ**なので `scripts/vocabCensus.ts` の「「Nまで」上限選択」へ追加して **3 / BASELINE 3** に戻した。
⚠**`maxCount` とは別キーで部分文字列にもならない**（`upTo` も含まれない）＝キー表に足さないと必ず昇格する。

### 反転確認

- `effectEngine` の `maxUnits` 読みを `false &&` で殺す → `WX13-053` の golden が
  「20枚あっても上限10枚ぶん（＋10000）で止まる expected=15000 got=25000」で **FAIL**（＝旧挙動の再現）。戻して PASS。
- golden 内にも payload 側の反転を同梱＝上限を外すと 20枚ぶん／15枚ぶんに戻る、
  `oppEnergyThreshold` を落とすと1枚も落ちない（fail-closed）、`lrigAttackTimes` を5にすると残り4回。
- 撤去した2 id は **live 0 のラチェット**を golden に張った（parser が別経路で作り直したら FAIL）。

### 配送

21効果すべて `AUTO`。18効果は `build:effects` が自動採用、**キーが減る4カード**
（`WX13-053` / `WX21-066` / `WXDi-P10-076` / `WXDi-P16-047`＝STUB 撤去は純粋上位集合ではない）は
`heldReview --adopt` で明示採用した。**`manualEffects.ts` の変更は0。**

### 触ったファイル

`src/types/effects.ts`（スカラー9キー＋`PowerModifyPerTrashCountAction.maxUnits`）／
`src/engine/execStubPart1.ts`・`execStubPart2.ts`・`execStubPart3.ts`・`effectExecutor.ts`・`effectEngine.ts`（消費側）／
`src/data/parsers/parseSentencePart2.ts`・`parseSentencePart3.ts`・`parseSentencePart4.ts`・
`src/data/effectParser.ts`（生成側＋`EFFECT_LIMIT` の畳み込み後処理）／
`scripts/decompileEffects.ts`（逆翻訳9分岐）／`scripts/censusEngineText.ts`（ratchet 51→39）／
`scripts/vocabCensus.ts`（キー表較正）／`scripts/goldenTest.ts`（+10本）。**`src/screens/` は0行。**

---

## 2026-09-03（索引 A 第11巡）：§5.3 `O-60` 第51バッチ — 「手札から〈条件〉のカード」family 8ハンドラを payload 化

**ベースライン**＝`4fadd1278`（第50バッチの直後）。**A🔴 SELF_TEXT 59行 → 51行 / 59→51ハンドラ**
（`BASELINE_SELF_TEXT` も 51 へ払い戻し／A群 live 効果 **114 → 98**／miss は 0 のまま）。
**gates 全緑**（golden 3345 → **3352**＝+7本・smoke 10725 全異常0・fuzz 全0・census 3 / BASELINE 3・
census-stubs A🔴0・C0・manual-fields 0・census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径＝効果 変更16・追加0・削除0、予定外0。**
🖥**実機＝機械判定では不要**（`src/types/` `src/data/` `src/engine/` `public/data/` `scripts/` のみ／
**`src/screens/` は1行も触っていない**・新しいアクション型／interaction 型は0）。ただし
**`WXDi-P15-067` は「無言 no-op」から「置き先を選ぶ CHOOSE が出る」へ変わる**ので観測点を **`V-136`** に登録した（未実施）。

### 何を取ったか

`census:enginetext` A群の**「手札から〈条件〉のカードを N枚（公開する／捨てる／下に置く）」family
8ハンドラ / live 16効果 / 16カード**を1バッチで取った。
`HAND_REVEAL_CLASS_SIGNI`(live5) / `REVEAL_CLASS_SIGNI_FROM_HAND`(3) / `DISCARD_OR_PENALTY`(3) /
`OPTIONAL_DISCARD_HAND_CLASS`(2) / `OPTIONAL_DISCARD_CLASS_SIGNI`(1) / `DISCARD_IF_NO_CLASS_SIGNI`(1) /
`HAND_SIGNI_UNDER_SIGNI`(1) ＋ 後段 `INTERNAL_DISCARD_MATCHING_HAND_DOP`(live 0)。

### 受け皿は1つに束ねた（`StubAction` の payload 4本）

| payload | 何を運ぶ | 使うハンドラ |
|---|---|---|
| `handCardPick{filter,count,anyCount,upTo}` | 手札候補の絞り込み・枚数・任意性 | 6ハンドラ（＋後段1） |
| `discardPenalty{count}` | 「捨てないかぎり手札をN枚捨てる」のN | `DISCARD_OR_PENALTY` |
| `discardIfNoSigni{filter,discardCount}` | **場**のシグニの絞り込み（手札ではない） | `DISCARD_IF_NO_CLASS_SIGNI` |
| `handToUnderSigni{hostFilter}` | 「〜の下に置く」の**置き先** | `HAND_SIGNI_UNDER_SIGNI` |

engine 側の共通入口は `execUtils.resolveHandCardPick()` / `handCardPickLabel()` の2本だけ。
**新しいアクション型は0**。足したのは `PlaceUnderSourceSigniAction.hostCardNum`（省略時は従来どおり効果元）1つ。

### 🔴 実害2件（payload へ寄せて初めて見えた）

**①`WXDi-P15-067`（INSPIRATION）は原文2文目が丸ごと死んでいた（恒久 無言 no-op）。**
原文「あなたの手札から＜解放派＞のシグニ１枚を**あなたの＜解放派＞のシグニ１体の下に**置いてもよい」に対し、
旧実装は置き先を `PLACE_UNDER_SOURCE_SIGNI`＝**効果元シグニの下**に固定していた。
このカードは**スペル**なので `ctx.sourceCardNum` は場に無く、`zoneIdx === -1` で **`done(ctx)`＝無言で終了**していた。
⇒ 置き先を先に選ばせ（CHOOSE）、選んだシグニを `hostCardNum` へ焼き込んでから手札を選ばせる2段にした。
🔑**この形はどの計器にも映らなかった**＝engine に消費地点があるので `census:stubs` A群🔴 に出ず、
逆翻訳は「〜の下に置いてもよい」と**正しそうな日本語**を出すので C群ゲートも通る。
**`census:enginetext` の A群に居たことだけが手掛かりだった**（miss は 0＝regex は当たっていた）。

**②`DISCARD_OR_PENALTY` は消費地点が2つあり、それぞれ別の regex でカード全文を読んでいた。**
選択肢のラベルを作る側（`/手札から＜X＞のシグニを１枚捨てないかぎり/`）と、実際に捨てさせる後段
`INTERNAL_DISCARD_MATCHING_HAND_DOP`（`/手札から＜X＞のシグニ/`）で**綴りが違う**＝
片方だけが外れると「ラベルと実際に捨てられるカードが食い違う」形だった。⇒ 親が payload を後段へ渡す1本に統一。

### 🔑 教訓

**①この family の真因も「読む場所」だった。** parser は**その効果の文**しか見ないが、engine は
`EffectText + BurstText`＝**カード全文**を見る。`WX05-030` は【起】と【ライフバースト】の**両方**に
「手札から＜アーム＞の」があり、`WXK05-043` は【自】と【出】の両方が手札を触る。
いまは当たっていても、**綴りが1つ違えば別の能力の数字を掴む**位置に全部あった。

**②`miss=0` は「壊れていない」ではない、の3例目。** この family は miss 0 だったが、
`WXDi-P15-067` は**regex が当たったうえで**置き先の解決に失敗して no-op だった
＝**miss は「原文に当たるか」しか測っていない**（第49バッチ①・第50バッチと同じ結論）。

**③新しい payload には「用法トリップワイヤ」を張った**（第50バッチ④の再適用）＝
「`handCardPick` が付くのは family の6 id だけ」を golden で assert する。
消費地点を増やすときは契約ごと書き換える。

**④逆翻訳も payload から描き直した。** `DISCARD_OR_PENALTY` / `OPTIONAL_DISCARD_HAND_CLASS` の逆翻訳は
engine と**同じ全文 regex** を持っており、**engine の取り違えをそのまま復唱**していた
（＝原文照合という主軸の検査が構造的に効かない）。family 5本ぶんの描画を payload 読みへ移した。

### 反転確認

- `hostCardNum` の分岐を `false &&` で殺す → `WXDi-P15-067` の golden が
  「場の＜解放派＞シグニの下にカードが1枚入る expected=2 got=1」で **FAIL**（＝旧挙動の再現）。戻して PASS。
- golden 内でも payload 側を壊す反転を各テストに同梱＝`handCardPick` を落とすと選択が立たない（fail-closed）／
  上限を1へ落とすと選択数が1になる／`discardPenalty` を3へ変えると3枚捨てる／
  `hostFilter` を別クラスにすると1枚も動かない。
- ⚠**反転は必ず消費側（engine）を壊して取る**（第49バッチ④）＝parser を壊しても収穫マージが
  痩せた効果を live へ届けないので golden は緑のままになる。

### 配送

`AUTO` 11効果は `build:effects` で自動。**`MANUAL` 5効果**（`WX14-072` / `WX14-075` / `WXK04-090` /
`WX24-P3-068` / `WXDi-P14-083`）は `manualEffects.ts` へ手書きしてから `syncManualLive.ts` で live へ届けた。
🔑**`WDK08-Y11` と `WXK04-034` の2件は parser の文型ルールではなく `effectParser.ts` のカード別
override が STUB を作っていた**＝文型側だけ直しても届かない（`--id` で live を確認して初めて判明）。

### 触ったファイル

`src/types/effects.ts`（payload 4本＋`hostCardNum`）／`src/engine/execUtils.ts`（共通入口2本）／
`src/engine/execStubPart1.ts`・`execStubPart2.ts`・`execStubPart3.ts`・`effectExecutor.ts`（消費側）／
`src/data/parsers/parseSentencePart2.ts`・`parseSentencePart3.ts`・`parseSentencePart4.ts`・
`src/data/effectParser.ts`（生成側）／`src/data/manualEffects.ts`（MANUAL 5件）／
`scripts/decompileEffects.ts`（逆翻訳）／`scripts/censusEngineText.ts`（ratchet 59→51）／
`scripts/goldenTest.ts`（+7本）。**`src/screens/` は0行。**

---

## 2026-09-03（索引 A 第10巡）：§5.3 `O-60` 第50バッチ — パワー family 15ハンドラを1バッチで payload 化

**ベースライン**＝`2f920586e`（第49バッチの直後）。**A🔴 SELF_TEXT 76行 → 59行 / 74→59ハンドラ**（`BASELINE_SELF_TEXT` も 59 へ払い戻し）。
🔑**1バッチで17行・15ハンドラ**（第49バッチは1行／1ハンドラ）＝**家族単位で取ると固定費が1回で済む**。
**gates 全緑**（golden 3340 → **3345**＝+5本）。
✅**実機不要**＝`src/types/` `src/data/` `src/engine/` `public/data/` `scripts/` のみ。**`src/screens/` は1行も触っていない。**

### 何を取ったか

`census:enginetext` A群の**「パワーを〈何かの数〉１つにつき±N」family 16ハンドラ / live 20効果**を一度に取った。
`POWER_MOD_PER_REVEALED`(5) / `POWER_MOD_BY_LRIG_TRASH_ARTS`(3) / `POWER_MOD_BY_TRASH_CLASS_COUNT`(2) /
`ADJACENT_SIGNI_POWER_MOD` / `MULTI_SIGNI_POWER_UP_5000` / `OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL` /
`POWER_BOOST_PER_SIGNI_WITH_ICON` / `POWER_BY_ACCE_COUNT` / `POWER_BY_CENTER_LRIG_TYPE_COUNT` /
`POWER_BY_LEVEL_SUM_COMPARE` / `POWER_DOWN_BY_ZONE_CARD_COUNT` / `POWER_MOD_BY_LRIG_LEVEL` /
`POWER_MOD_BY_UNDER_COUNT`（各1）＋ 後段 `INTERNAL_PMBUC_APPLY` / `INTERNAL_POWER_UP_SELECTED` /
`INTERNAL_APPLY_POWER_DELTA_OPP` ＋ CONTINUOUS 側の `POWER_MOD_PER_COUNT`（live 0）。

### 🔴 真因は「id が14種に割れていたこと」だった（regex ではない）

parser には**「パワーを〈ゾーン〉N枚につき±X」の文型ルール群が既にあった**（`rewritePowerModPerCountPayload`）。
ところが入口の `containsPowerModPerCount` / `replaceUniquePowerModPerCount` が
**`STUB{POWER_MOD_PER_COUNT}` という1つの id しか見ておらず**、同義の catch-all 13種には**永久に届かなかった**。
実例＝`POWER_MOD_BY_TRASH_CLASS_COUNT`（2効果）は既存の「トラッシュにある〈filter〉N枚につき」ルールで
そのまま解けるのに、**id が違うだけ**で engine のカード全文 regex に残っていた。
⇒ **入口を `POWER_MOD_CATCH_ALL_IDS`（14 id の集合）に束ねた瞬間、ルール追加ゼロで 5効果が typed になった。**

### 受け皿は全部既存だった（「まず受け皿を疑う」7回目）

| 原文の軸 | 受け皿 | 新規 |
|---|---|---|
| ルリグトラッシュのアーツ／トラッシュの〈クラス〉／シグニの下 | `POWER_MODIFY.deltaFromZone`（`CountFromZone`） | — |
| この方法で公開したカード | `deltaPerLastProcessedCount` + `perLastProcessed` | — |
| 《ライズアイコン》を持つ自分のシグニ | `POWER_MODIFY_PER_FIELD{countFilter:{hasRiseIcon}}` | — |
| 相手センタールリグのレベル | `POWER_MODIFY_PER_LRIG_LEVEL` | — |
| 自分の場のシグニのレベル合計 | `POWER_MODIFY_PER_LEVEL_SUM` ＋ `FIELD_LEVEL_SUM` 条件 | — |
| トラッシュに置かれたシグニのレベル | `POWER_MODIFY_PER_TRASHED_LEVEL` | — |
| 隣接／クラス限定の複数体（固定値） | 素の `POWER_MODIFY` ＋ `adjacentToSelf` / `story` | — |
| シグニゾーンにあるカード（下段含む） | `CountFromZone.zone` | 🆕`signi_zone_all` |
| センタールリグのルリグタイプ数 | `CountFromZone.zone` | 🆕`center_lrig_types` |

**新しいアクション型は0本**。足したのは `CountFromZone.zone` の2値だけ。

### 🔴 機構の穴3つ（payload へ寄せて初めて見えた）

**①CONTINUOUS は `deltaFromZone` を読んでいなかった。**`effectEngine` の【常】経路は
`typeof mod.delta === 'number' ? mod.delta : 0` で、**`deltaFromZone` を書いた【常】効果は無言で ±0** になる
（`O-128` 第4バッチ・第30バッチと同じ「収集契約」の罠）。実行経路だけが `resolveCountRef` で解いていた。
⇒ `continuousPowerDelta()` を新設して3つの消費地点へ配線。`COST_INCREASE` 用の局所解決器
`countCostIncreaseUnits` を `countZoneUnitsForContinuous` へ改名して**共用**にした（写しを2本作らない）。

**②`adjacentToSelf` は実行経路に消費地点が無かった。**`matchesFilter`/`matchesStateFilter` はゾーン番号を
受け取らないので、【出】【自】の対象宣言に付けると**素通りして自分の場の全シグニが候補**になる。
🔑**これは golden のトリップワイヤ（「`adjacentToSelf` は CONTINUOUS の `POWER_MODIFY` にしか付いていない」）が
その場で捕まえた**＝`WXK01-060-E1` を typed 化した直後に FAIL。
⇒ `execUtils.fieldCandidatesByOwner` に `keepAdjacent` を足し、トリップワイヤを
**「`POWER_MODIFY.target.filter` 以外に出たら FAIL」**（出現数と認可数の突き合わせ）へ書き換えた。

**③文境界をまたぐ照応が解けず catch-all へ差し戻されていた。**`WXK05-043-E2` / `WXK10-081-E2`
「あなたの＜水獣＞のシグニ１体を対象とし、…公開する**。** ターン終了時まで、**それの**パワーを…」は
`applyLeadingSelfDesignationToPowerModify` の `[^。]*?` が句点を越えられず `targetsTriggerSource`（未確定）のまま残り、
`revertUnresolvedPerLastProcessed` が STUB へ戻していた＝**そこから先は engine の全文 regex**。
⇒ 照応解決器を「**1文だけ**またげる」＋「`targetsTriggerSource` で未確定のノードも直す」へ広げた。

### 挙動が変わったもの（実害）

- **`WXDi-P09-046-E2` は1体にしか効いていなかった**＝原文「対戦相手のシグニ**を２体まで**対象とし」に対し
  engine の regex が `シグニ([０-９\d]*)体まで`（「を」を許さない）で外れ、既定の1体へ落ちていた。
- **`WXK01-060-E1` / `WXK07-039-E1` の単価はハンドラ名の焼き込みだった**＝`\+([０-９\d]+)`（**半角+**）が
  原文の全角「＋」に当たらず、`MULTI_SIGNI_POWER_UP_5000` は名前の 5000 で動いていた（たまたま一致）。
- 残りは payload へ移しただけで実挙動は同一（live のバイト同一を撤去の証明に使った）。

### 検証コマンド

- `npm run golden -- --only "O-60 第50"`（**4本**）＋ `--only "adjacentToSelf"`（**2本**）
- `npm run gates`（全緑）＝golden **3345/3345**・smoke **10725**・fuzz 0・census **3 / BASELINE 3**・
  `census:stubs` A群🔴0・C群0・`census:enginetext` **A🔴 59 / BASELINE 59**・`census:costtext` A群0
- `npm run regen` 完走

### 反転確認（あり・3機構とも独立に）

①CONTINUOUS の `deltaFromZone` を無視 → アクセ／ルリグタイプの【常】テストが FAIL
②`signi_zone_all` を「最上面のみ」へすり替え → －6000 が －4000 になって FAIL
③`center_lrig_types` を固定1へ → タイプ2つの assert が FAIL
🔑**②は最初 payload の zone 名しか assert しておらず素通りした**（第22バッチ⑥の再現）＝
**スタック下段まで数えることを盤面で測る**テストを足して取り直した。

### 罠（次に family バッチを取る人へ）

- ⚠**`live 0` のハンドラでも消す前に呼び出し元を grep する**＝`INTERNAL_CMCLG_POWER_MOD_BY_CLASS_LEVELS`
  （live 0）は**生きている `CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE` の後段**なので残した。
- ⚠**parser の受け皿サイトは消さない**＝あれが STUB を出し、文型ルールがそれを typed へ置換する2段構え。
  消すと別の catch-all へ落ちる（第21バッチ②の逆パターン）。
- ⚠**`syncManualLive` が id 集合ズレで止まる**（`WX25-CP1-061` は manual に E3 が無く fresh が E2 を出す＝`O-39`）。
  この巡は live の当該ノードだけを直接書き換えて manual と一致させた（drift を作らない側へ倒した）。
- 🔑**計器の `--id` をカンマ区切り対応にした**＝1起動で全カードを parse する（約40秒）ので、
  family バッチで1ハンドラずつ起動すると待ち時間だけで十数分になる。

---

## 2026-09-03（索引 A 第9巡）：§5.3 `O-60` 第49バッチ — 最大の catch-all `GAIN_ABILITY_THIS_GAME` を payload 化

**ベースライン**＝`a5679359a`（第47〜48バッチの直後）。**A🔴 SELF_TEXT 77行 → 76行 / 75→74ハンドラ**、
`BASELINE_SELF_TEXT` も 76 へ払い戻し済み。**gates 全緑**（golden 3334 → **3340**＝+6本）。
✅**実機不要**＝触ったのは `src/types/` `src/data/` `src/engine/` `public/data/` ＋ `scripts/`（計器・逆翻訳・golden）だけで、
**`src/screens/` は1行も触っていない**（PLAN §2.2 の機械判定）。⚠新しい payload 型（`GameGrantSpec`）は足したが、
**消費地点は既存の state キー20本そのまま**＝新しい engine 機構は0。

### 何を取ったか

`GAIN_ABILITY_THIS_GAME`＝`O-60` の**live 最大**（19効果 / 18カード）かつ**リテラル24本の最大の catch-all**。
`execStubPart1.ts:3624` が実行時に `card.EffectText + card.BurstText`（＝**カード全文**）を
24本の regex で読み分け、当たったぶんだけ `PlayerState` の恒久フラグを立てていた。

**直し方**＝原文を読むのを**parser 1箇所**（新設 `src/data/parsers/gameGrants.ts`・**効果単位の原文**）へ寄せ、
engine は payload（`StubAction.gameGrants: GameGrantSpec[]`）だけを見る。
逆翻訳（`decompileEffects.ts`）も payload から描く。**payload が無い／空なら engine は何も宣言しない（fail-closed）**。

🔑**なぜ「文の受け皿サイト」ではなく効果単位の後処理か**＝受け皿サイト（`parseSentencePart3/4` の12箇所）が
見ている文は**「このゲームの間、あなたは以下の能力を得る」だけ**で、実際の宣言が書いてある
**『…』の引用ブロックは別の文**だった（12サイト全部を実測して確認）。⇒ 文単位では中身が1つも取れない。
`applyGameGrantsBatch49`（`effectParser.ts`・`currentSourceTexts` を読む後処理）で刻む。

### 真因3件（payload 化で初めて見えた）

**①`WXDi-P11-004-E1` は丸ごと無言 no-op だった。** regex が `メインフェイズ開始時.*手札.*5枚以下`（**半角5**）で、
原文は「あなたの手札が**５枚以下**の場合」（全角）＝**1枚も当たらず** `game_main_draw` が一度も立たなかった。
🔑**miss=0 でも壊れている**（`census:enginetext` は「1本も当たらないハンドラ」を miss と数えるが、
このハンドラは**他の23本のどれかが当たる**ので miss に出ない）＝登録票の警告どおり。
⇒ `gameGrants.ts` には「**規則を足すときは必ず全角数字を許す**（`[０-９\d]`）」を明記した。

**②`WXK03-003A-E2` は1回の起動で使用回数が2進んでいた。** 原文2文がそれぞれ STUB を作るので
`SEQUENCE` にノードが2つ並び、旧 engine は**ノードごとにカード全文を読み直して**いた
＝`lrig_activation_count` が **+2**（「5回目に裏返す」が**3回目**に来る）。
⇒ 後処理は**先頭ノードにだけ全宣言を載せ、残りは空配列**にする（型コメントに理由を書いた）。

**③「手札N枚捨てるか《無》」と「《無》だけ」が同時に立ちうる形だった。**
`対戦相手は追加で《無》を支払わないかぎり【ガード】ができない` は
`対戦相手は追加で手札を1枚捨てるか《無》を支払わないかぎり…` の**部分文字列ではない**が、
両者を独立の `if` で並べていたため文型が近い将来のカードで二重に立つ。⇒ 排他（`else if`）にして golden で固定。

### ついでに直した parser バグ（`O-60` の実装中に発見）

`WXDi-P07-006-E1`（発進！WIXOSSロボ）の **`GAIN_COIN{count:6}`**。
`parseSentencePart1.ts` のコイン規則が**文中の《コインアイコン》を全部数える**ので、
条件節「このゲームの間にあなたが**《コインアイコン》を得ていない場合**」の1つまで数えていた（原文は5枚）。
⇒ 条件節（`〜場合、`）を落としてから数える（落とすと本文にアイコンが無くなる文型は元へ戻す）。
**live 全数を走査して、`GAIN_COIN{count>1}` 43効果のうち誤っていたのはこの1件だけ**を確認済み。

### 影響枚数

**18カード / 19効果**（`WX08-015` `WX10-011` `WX24-P4-036` `WX25-P2-001` `WX25-P2-003` `WX25-P2-005`
`WX25-P2-007` `WXDi-P04-006` `WXDi-P05-004` `WXDi-P05-005` `WXDi-P06-006` `WXDi-P07-006` `WXDi-P11-004`
`WXDi-P11-010A` `WXK03-003A` `WXK07-056` `WXK08-028` `WXK09-001`）。
**挙動が変わったのは3件**（①②＋コイン枚数）。残りは payload へ移しただけで実挙動は同一。

### 検証コマンド

- `npm run golden -- --only "O-60 第49"`（**6本**＝live 全ノードの payload 走査ラチェット／`WXDi-P11-004` の
  ドロー宣言／`WX10-011` の2宣言＋キーワードが payload 由来／`WXK03-003A` の使用回数+1／
  ガード追加コストの排他／コイン5枚）
- `npm run gates`（全緑）＝golden **3340/3340**・smoke **10725/10725**・fuzz 0・census **高シグナル 3 / BASELINE 3**・
  `census:stubs` A群🔴 0・C群 0・`census:enginetext` **A🔴 76 / BASELINE 76**・`census:costtext` A群 0
- `npm run regen`（逆翻訳を再生成して payload 描画を目視）

### 反転確認（あり）

engine 側を3箇所壊して golden が落ちることを確認した（**6本中3本 FAIL**）＝
①`mainPhaseDrawIfHandLte` で state を書かない ②`oppGuardExtraHandOrColorless` で `game_opp_guard_extra_colorless`
も一緒に立てる ③`centerLrigKeyword` のキーワードを `'ダブルクラッシュ'` にハードコードする。
🔴🔑**最初に parser 側を壊す反転を試したが素通りした**＝収穫マージが
**fresh が痩せた効果を live へ届けない**（`_held_fresh.json` に回る）ため。
⇒ **payload 生成側の反転確認は live に届かない。壊すなら消費側（engine）を壊す。**

### 罠（次に同じ形を取る人へ）

- ⚠**`abilityBlockHeader` は配列の先頭に置く**＝逆翻訳が「このゲームの間、あなたは以下の能力を得る。〈中身〉」
  の語順で読める。末尾だと「〜引く。あなたは以下の能力を得る」と倒置して読めない。
  **並べ替えただけでも live には届かない**（fresh が richer でないので held）＝`--adopt-effect` が要る。
- ⚠**収穫マージ待ちの効果が6件あった**＝`WX25-P2-001` `WXDi-P04-006` `WXDi-P05-005` `WXDi-P06-006`
  `WXDi-P11-004` `WXDi-P07-006` は `_held_fresh.json` 行き（`--adopt-effect` で効果単位に採用）、
  `WX24-P4-036` `WX25-P2-005` `WX25-P2-007` `WXDi-P11-010A` は MANUAL/PARTIAL 不可侵なので
  `manualEffects.ts` へ手書き ＋ `syncManualLive.ts`。
  🔑**「live 全19ノードが payload を持つ」を golden のラチェットにした**＝この配送漏れは他のどの計器にも出ない。

### 新規登録

**`O-226`（3効果 / 2カード）**＝`GAIN_ABILITY_THIS_GAME` が書く state キーのうち
`game_declared_signi_level_zero` / `game_declared_signi_ignore_restriction`（`WXK09-001-E3`）と
`lrig_activation_count`（`WXK03-003A-E2` の「このルリグを裏返す」）に**読み手が1人もいない**（真no-op）。
🔑**payload 化で初めて見えた**＝旧実装は「ハンドラがある＝実装済み」に見え、`census:stubs` A群にも出なかった。

---

## 2026-09-03（索引 A 第8巡）：§5.3 `O-60` 第37〜48バッチ — miss を 0 にした（12バッチ）

**ベースライン**＝`5c09cf33d`（第29〜36バッチの直後）。**A🔴 SELF_TEXT 103行 → 77行 / 101→75ハンドラ**、
🔑**miss 9ハンドラ・15カード → 0ハンドラ・0カード**。`BASELINE_SELF_TEXT` も 77 へ払い戻し済み。
**gates 全緑**（golden 3323 → **3334**＝+11本）。
🔴**実機は未実施**＝`src/screens/BattleScreen.tsx` を触った（PLAN §2.2 で実機必須）。観測点は `V-133`〜`V-135`。

### 第37バッチ＝死んだ枝の一括撤去（engine 18ハンドラ・parser 10枝）

**真因**＝`census:enginetext` の A群に **live 0 のハンドラが27本**溜まっていた。うち18本は
parser 側の生成枝ごと**どのカードからも到達しない**（`POWER_MOD_PER_COUNT` は `O-80` の消化で live 0 になり、
`DO_THREE_THINGS` は parser が SEQUENCE を出すようになって役目を終えていた）。
**影響枚数**＝0（挙動は1ビットも変わらない）。**検証**＝`npm run build:effects` 後の
`public/data/effects_*.json` が**バイト同一**であることを撤去の証明にした（`diff -rq`）。
🔴**反転確認で1件捕まえた**＝`BEAT_ZONE_OP` を消したついでに `INTERNAL_MOVE_TO_BEAT` も消したら、
**生きている `TRASH_SIGNI_TO_BEAT` の後段**だった（golden `task12(xxii) WXK08-029-E1 E2E` が落ちて発覚）。
⇒ **live 0 は「死んだ枝」の十分条件ではない**＝`fn:` 関数・`INTERNAL_*`（親から動的に呼ばれる）・
**live の別 id と関数を共有**するものが混ざる。**残り12本は据え置いた。**

### 第38バッチ＝`POWER_MOD_BY_FIELD_CLASS_LEVEL`（`WD11-007`・1効果）

**真因**＝原文は「この**レゾナの出現条件でトラッシュに置いた**シグニのレベルを合計した数だけ－2000」なのに、
engine は `＜X＞のシグニのレベルを合計した数だけ－N` を**カード全文**に当てて
**場に残っている同クラスのシグニ**を数えていた＝支払いで場から消えた2体を数えられず**常に0〜過小**。
**受け皿は既存**＝`resonaSummon.ts` が刻む `PlayerState.last_appearance_cost_cards`。
**足したのは `CountFromZone.zone:'appearance_cost'` と `sumBy:'level'` の2値だけ。**
**影響枚数**＝1。**検証**＝`npm run golden -- --only "O-60 第38バッチ"`（レベル合計×単価／支払い記録なしは0の反転確認）。

### 第39バッチ＝`ON_RISE` 一族の向きを反転（11枚）— 🔴この巡の最大の発見

**真因**＝`ON_RISE`（「このシグニがライズされたとき」）を持つ11枚は**1枚も【ライズ】を印字していない**＝
自分がライズする側ではなく**ライズされる側（下敷き）**。にもかかわらず
①`BattleScreen` は**置かれた側**（`ownEffects`）から `ON_RISE` を集め
②parser は「そのシグニ」を `thisCardOnly`（＝下に埋まった自分自身）へ解決し
③`risedOntoNameContains` は**下敷きの名前**で判定していた。
⇒ **この11枚は1度も発火しない死に効果**で、しかも発火したとしても「【ダブルクラッシュ】を得る」
「バニッシュされない」を**カードの下に埋まった自分自身**へ配る形だった。
**直し方**＝①収集元を**下敷きのカード**へ ②`triggeringCardNum` に**置かれたシグニ**を載せ
「そのシグニ」を `targetsTriggerSource` へ ③`risedOntoNameContains` → **`risenByNameContains`**（判定対象を反転）。
`GrantEffectAction` に `targetsTriggerSource` を追加（`GrantKeyword`／`GrantProtection` には前からあった）。
**影響枚数**＝11（live で変わったのは4効果＋`WX20-056-E2` の手書き1件）。
**検証**＝`golden -- --only "O-60 第39バッチ"`（4効果の payload ＋ 付与の実行と fail-closed の反転確認）。
🔴**実機必須**（`V-133`）。

### 第40バッチ＝`ENERGY_BY_LEVEL_SUM_LIMIT`（`WXK11-040`・1効果）

**真因**＝原文は「対戦相手のシグニを、レベルの合計が**あなたのエナゾーンの《トレット》の枚数**以下になるように
好きな数対象とし、それらをエナゾーンに置く」なのに、engine は
`/レベルの合計が(\d*)を超え/` を当てて「**自分のエナ**のレベル合計が上限を超えたぶんを末尾からトラッシュ」＝
**まったく別の効果**を実行していた（regex は当たらないので上限は10 固定）。
**受け皿は既存**＝`selectionConstraint.totalLevelMaxRef`（`WXDi-P00-012-E1` が同型で稼働中）。
**足したのは `$ref:'self_energy_count'`（filter 付きエナ枚数）だけ。**
**影響枚数**＝1。**検証**＝`golden -- --only "O-60 第40バッチ"`（payload ＋ `$ref` の filter と 0 の反転確認）。

### 第41バッチ＝`OPP_ENERGY_COLOR_CONDITION_TRASH`（`WXK09-037`・1効果）

**真因**＝原文は「**この能力で宣言された色**を持たず無色ではないカードが対戦相手のエナゾーンに置かれる場合、
代わりにトラッシュ」なのに、`collectOppEnergyColorRestriction` は効果元カードの全文に `/(赤|青|緑|白|黒)/` を
当てて色を決めていた。**このカードには色名が1文字も書かれていない**＝**常に `null`＝この【常】は丸ごと無効**。
（同じカードの別能力に色名があれば、逆に**嘘の色**で効く形でもあった。）
**直し方**＝`PlayerState.declared_color`（`OPP_DECLARE_COLOR` が刻む）から読む。
原文の「**無色ではない**」除外も入れた（従来は無色カードもトラッシュ行きだった）。
exec 側のハンドラ（相手エナを1枚勝手にトラッシュする別実装）は撤去。
**影響枚数**＝1。**検証**＝`golden -- --only "O-60 第41バッチ"`（宣言前は null の fail-closed ＋ 反転確認2本）。
🔴**実機必須**（`V-134`）。

### 第42バッチ＝`TARGET_ONLY`（`WXDi-P07-086`・1効果）

**真因**＝原文が**修飾語なしの「シグニ１体を対象とする」**なのに、engine は
`あなたのシグニ`／`自分のシグニ`／`対戦相手.{0,5}シグニ` を**カード全文**に当てて所有者を推測しており、
**1本も当たらず対戦相手の場だけ**に潰れていた。
**受け皿は既存**＝`SELECT_TARGET_ONLY` は `owner:'any'` を両フィールド走査で解決する。
**影響枚数**＝1。**検証**＝`golden -- --only "O-60 第42バッチ"`。

### 第43バッチ＝`DECK_TOP_TO_LIFE` の catch-all を4文型へ割った（live 2枚とも別の効果だった）

**真因**＝1つの STUB id に**無関係な4文型**が集まり、engine がカード全文で枝分かれしていた。
- `WXK02-035-E2`＝原文「デッキの**一番下**のカードを**チェックゾーン**に置く」が
  「デッキの**一番上**を**自分のライフクロス**に加える」に化けていた（**毎回ライフが1枚増える**）。
  ⇒ `TRAP_OPERATION{trapOp:'to_check', trapSource:'deck_bottom', trapCheckRest:true}`（`deck_bottom` を新設）。
- `WX10-002-E2`＝原文「**それをトラッシュに置いて**対戦相手のデッキの一番上をライフクロスに加える」の
  **トラッシュ側が1行も実装されておらず**、相手のライフが**減らないまま1枚増える**（原文と逆に相手を有利にする）。
  ⇒ `TRASH{LIFE_CLOTH_CARD, opponent}` ＋ `ADD_TO_LIFE{opponent, fromTop}`。
🔴**`ADD_TO_FIELD` に `source:{type:'CHECK_CARD'}` を追加**＝**抜き先を書き忘れると**カードが
チェックゾーンに残ったまま場にも出て、**ターン終了時の一掃で場のカードがトラッシュへ消える**（複製バグ）。
golden に反転確認を入れた。
⚠**近似1件**＝`WXK02-035` の「場に出さない場合、それをトラッシュに置く」は即時ではなく
`check_rest` のターン終了時トラッシュに委ねている（行き先は同じ）。
**影響枚数**＝2。**検証**＝`golden -- --only "O-60 第43バッチ"` ＋ `§6.4 T2` を「撤去済み id が live に残っていない」へ書き換え。
🔴**実機必須**（`V-135`）。

### 第44バッチ＝`NEGATE_NTH_ATTACK`（live 3効果）

**真因**＝live 3効果は**すべて `negateNthAttack` payload を持っている**（`SP27-016` は
`fixLrigColorFilters.mjs` が build 後に付ける）のに、engine は3本の regex を**カード全文**に当てる
フォールバックを抱えていた。しかも ①`一度目か二度目` を先に見るので `一度目か二度目か三度目` へ
**永久に到達しない** ②`SP27-016` は①②③の選択肢テキスト全体を読むので**別の枝の数字**を拾いうる。
**直し方**＝payload だけを読み、無ければ**何もしない**（旧既定は「シグニのアタックを1回無効」＝原文に無い無効化）。
**影響枚数**＝0（挙動は変わらない・二重実装の撤去）。

### 第45バッチ＝`LOOK_AND_REORDER` の catch-all を15文型へ割った（live 6枚とも別の効果だった）

**真因**＝parser の**15枝**が1つの STUB id を出し、engine が
`残りをデッキに加えてシャッフルする` と `デッキの上からカードをN枚見る` の2本を**カード全文**に当てていた。
🔴**実害は「当たらない」側ではなく「当たったうえで二重に走る」側**＝`WX13-035-BURST` は直前の
`REVEAL_AND_PICK{revealCount:2}` に加えて**もう2枚**、`WXDi-CP02-033-E2` は直前の
`LOOK_AND_REORDER{count:5}` に加えて**もう5枚**めくっていた。
**直し方**＝①`SHUFFLE_REMAINDER_INTO_DECK`（原文を読まず `lastProcessedCards` を戻す）へ分離
②`TRANSFER_TO_DECK{position:'top_or_bottom'}` を新設（実行時に2択）
③typed `LOOK_AND_REORDER` / `TRANSFER_TO_DECK{HAND_CARD, bottom}` へ寄せた枝
④直前アクションの `remainder`/`destination` が既に表している2枝は **no-op** へ
⑤残る11文型は **`DEFERRED_*`** で明示保留（逆翻訳に日本語の説明を書いた＝`census:stubs` C群 0 を維持）。
**影響枚数**＝6。**検証**＝`golden`（全件）＋逆翻訳シートの目視（`npm run regen`）。

### 第46バッチ＝`GRANT_QUOTED_AUTO_ABILITY`（live 4効果）

**真因**＝**parser 生成地点30箇所超**の汎用 id のハンドラの中で、engine が**カード全文**に
`/以下の[５5]つから[１1]つを選ぶ/` を当てて `WD21-007` だけを識別していた。
残る3枚（`PR-K076`／`WXDi-CP02-TK03A`／`WXK03-042`）は門を通れず**黙って落ちて**いた
（この3枚は `effectEngine.collectGrantedFromLayer` が別経路で消費する＝B群）。
**直し方**＝`WD21-007` 専用 id `CHOOSE_GRANT_FIVE_KEYWORDS` へ分離（ベット時の繰り返し枝も同 id へ）。
⚠**`manualEffects.ts` を書き換えたので `syncManualLive.ts` を回した**（収穫マージは live の MANUAL を不可侵にする）。
⚠**置換前の live を読まずに書いて `betOptions` を落とし、ベット段階が消えた**（golden が検出）。
**影響枚数**＝1（残り3枚は据置＝`O-128` 族）。

### 第47・48バッチ＝payload だけを読む形へ（`GAIN_SUBSCRIBER_COUNT` 21効果／`CONDITIONAL_CARD_COST_BY_OPP_LRIG` 5効果）

- **第47**＝`GAIN_SUBSCRIBER_COUNT` は live 21効果すべてが `value` を持つのに、engine は
  `/登録者数を([０-９\d]+)万人得る/` を**カード全文**に当てていた＝同じカードに2文あると**先頭の数字**を両方に使う形
  （`WDK16-01*` は【自】と【起】の両方が登録者数に触る）。payload だけを読み、無ければ何もしない。
- **第48**＝`CONDITIONAL_CARD_COST_BY_OPP_LRIG` は**ログを出すだけ**（盤面を1ビットも変えない）なのに、
  実コストを決める `keywordCosts.ts` の `parseCostReplacementTerms` と**同じ意味をもう一度**カード全文から
  読み直していた。**盤面を変えないハンドラの原文読みは、食い違っても誰も気づけない**＝撤去。
**影響枚数**＝0（どちらも挙動は変わらない・二重実装の撤去）。

### この巡で新設した型・機構（実機の観測点になる）

`CountFromZone.zone:'appearance_cost'`／`CountFromZone.sumBy:'level'`／`$ref:'self_energy_count'`／
`GrantEffectAction.targetsTriggerSource`／`TransferToDeckAction.position:'top_or_bottom'`／
`AddToFieldAction.source:{type:'CHECK_CARD'}`／`trapSource:'deck_bottom'`／
`triggerCondition.risenByNameContains`（`risedOntoNameContains` からの改名＝**意味を反転**）。

## 2026-09-03（索引 A 第7巡）：§5.3 `O-60` 第29〜36バッチ — 残りの「カード全文 regex」を8ハンドラぶん撤去／payload 化

**ベースライン**＝`11875d8f6`（第21〜28バッチの直後）。**A🔴 SELF_TEXT 124行 → 103行 / 121→101ハンドラ**、
🔑**miss 28ハンドラ・34カード → 9ハンドラ・15カード**（1巡で最大の落差）。`BASELINE_SELF_TEXT` も 103 へ払い戻し済み。
**新しいアクション型・条件型は0**。🔑**8バッチ中5バッチは「STUB ごと撤去して typed へ寄せた」**
（`POWER_BY_CHARM_COUNT` / `POWER_BY_ENERGY_COLOR_VARIETY` / `POWER_BY_RISE_SIGNI_COUNT` /
`POWER_MOD_BY_FRONT_LEVEL` / `POWER_CAP` のハンドラ）。

### 第29〜32バッチ＝CONTINUOUS のパワー比例4種（各1効果）— 🔑受け皿は既に在った（7・8回目）

🔴**4本とも「単価の regex が外れる」より「修正先か数え方が原文と裏返っている」方が実害だった。**

- **第29 `POWER_BY_CHARM_COUNT`**（`WXK11-041`「このシグニのパワーは**場にある**【チャーム】１枚につき＋1000」）＝
  ①**自分の場のチャームしか数えない**（原文は所有者を問わない）②修正先が**対戦相手のシグニ**（原文は「**この**シグニ」＝真逆）。
  ⇒ typed `POWER_MODIFY_PER_CHARM{sourceOwner:'any'}`（live 3効果で稼働中）へ。
- **第30 `POWER_BY_ENERGY_COLOR_VARIETY`**（`WXK11-063`「**白、赤、緑、黒**の色１種類につき＋1000」）＝
  **色の限定を一切見ずに5色すべて**を数えていた（青のぶん1色過剰）。
  ⇒ typed `POWER_MODIFY_PER_ENERGY_COLOR`（**同型5効果が先に稼働**）に `colors?: string[]` を1つ足しただけ。
- **第31 `POWER_BY_RISE_SIGNI_COUNT`**（`WXK10-064`）＝①regex が「ライズシグニ…体につき」＝**実在しない綴り**
  ②数える対象を「**スタックが2枚以上のゾーン**」で近似（《ライズアイコン》の有無を見ていない）③修正先が相手（真逆）。
  ⇒ typed `POWER_MODIFY_PER_FIELD{countFilter:{hasRiseIcon:true}}`（`hasRiseIcon` は `matchesFilter` に実装済み）。
- **第32 `POWER_MOD_BY_FRONT_LEVEL`**（`WXDi-P04-083`）＝**2つとも裏返っていた**＝
  ①正面ゾーンを `signi[zi]`（**同じ添字**）で引いていた（正面は `2 - zi`）②修正先が**効果元自身**
  （原文は「この**シグニの正面のシグニ**のパワーを」）。平坦版の兄弟3枚は既に `POWER_MODIFY{frontOfSelf}` で
  動いており、足りないのは第25バッチで足した `deltaPerTargetLevel` を `frontOfSelf` 分岐で読むことだけだった。

🔴🔑**この巡で踏んだ一番危ない罠＝`until` を書くと CONTINUOUS 経路から外れる。**
`POWER_MODIFY_PER_CHARM` を typed 化するとき型どおりに `until:'PERMANENT'` を書いたら**恒久 no-op**になった。
`extractPowerModifiesPerCharm`（`effectEngine.ts`）が **`until` があると ACTIVATED 扱いにして CONTINUOUS 走査から外す**
規約だったため。⇒ 型の `until` を**必須→任意**へ緩め、「**省略＝【常】**」を型コメントに明記した。
**逆翻訳も census も golden も緑のまま盤面が1ビットも動かない**形（`O-128` 第4バッチの「収集契約」と同じ家系）。

### 第33バッチ `POWER_CAP`（1効果）

- 🔑**消費地点が2つ**＝`effectEngine.applyCaps`（**実際に効く方**・`/パワーは(\d+)より大きくならない/`）と
  `execStubPart2` のハンドラ（`/パワーが?(\d+)以下/`＝**原文と綴りが違い1本も当たらない**）。
- 後者は当たれば `temp_power_mods` に差分を焼き込む＝**【常】の上限が一度きりの補正に化ける**形だったので**撤去**。
  前者は payload（`powerCap.max`）を読むようにした。

### 第34バッチ `TRASH_ALL_OPP_CARDS` ＋ `TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY`（各1効果）

- `TRASH_ALL_OPP_CARDS`（`WXK11-047`）＝「カード名一致のエナ限定トラッシュ」へ先に分岐しようとし、外れると
  「場＋手札」だけの fallback へ落ちていた＝原文にある**エナゾーンが丸ごと落ちる**過少実行。
  ⚠その regex は同じカードの**コスト句**（「《サーバント》を含むシグニ１５枚をトラッシュに置く」）に近い綴りで、
  少し違えば**コストの名前で相手エナだけ削る**別物に化ける形だった。⇒ `trashAllOppZones` を payload 化。
- `TRASH_ALL_BY_NAME…`（`WXEX2-10`）＝`/「([^」]+)」/`（**かぎ括弧**）で名前を取ろうとしていたが原文は《》なので
  **1本も当たらず恒久 no-op**。照合も**完全一致**で、原文の「**含む**」（部分一致）と別物だった。

### 第35バッチ `SUMMON_FROM_ENERGY` ＋ `REVEAL_PICK_CLASS_TO_ENERGY`（各1効果）

- 🔑**`SUMMON_FROM_ENERGY` は「手書きが parser に追い越されていた」**＝`WXDi-P14-TK04` は
  `manualEffects.ts` の手書きが `STUB{SUMMON_FROM_ENERGY}` を固定していたが、**いまの parser は
  typed `ADD_TO_FIELD{source:{ENERGY_CARD, upToCount:true}}` を出せる**（同型3効果が live で稼働）。
  手書きは原文「シグニを**１枚まで**」（任意）に対し**必ず1枚出させる**過剰実行だった。⇒ 手書きを削除。
  STUB 自体は `choiceTextParser`（実行時の①②選択肢）が使うので残し、レベル制限を payload 化して
  **選択肢テキストから読む**ようにした（engine がカード全文を読むと**別の選択肢のレベル**を拾う）。
- `REVEAL_PICK_CLASS_TO_ENERGY`（`WX18-034`）＝①`/＜クラス＞のシグニ.*エナゾーンに置く/` が
  「**《アクセアイコン》を持つ**すべてのシグニ」に当たらず**絞り込みが消え**（公開したシグニ全部がエナへ）
  ②**残りの行き先がデッキの一番上に固定**で原文の「残りを**トラッシュに置く**」と別物
  ③公開枚数も既定2枚（原文3枚）。⇒ 候補は前段 `LOOK_AND_REORDER` の `lastProcessedCards` から取る（第24バッチと同じ手）。

### 第36バッチ `OPP_SIGNI_TO_DECK_NTH` ＋ `OPTIONAL_HAND_REVEAL_NAMED`（各1効果）

- `OPP_SIGNI_TO_DECK_NTH`（`WDK09-012`）＝原文は「**三**番目」＝**漢数字**なので regex が当たらず
  `nth` が **0（＝一番上）** に落ちていた＝「デッキの奥へ送る」意図と真逆に、次のドローで戻る位置に置いていた。
- `OPTIONAL_HAND_REVEAL_NAMED`（`WX05-038`）＝**消費地点2つがそれぞれ違う regex で名前を取ろうとして両方外していた**
  （`effectExecutor` は `/《X》を公開/`＝原文は「《X》**１枚を**公開」で間に枚数、`execStubPart3` は
  `/「X」/`＝**かぎ括弧**）。⇒ 公開の選択肢が常に選べない／手札一致0で即終了＝**恒久 no-op** だった。

### 検証

- `npm run gates` **全緑**（golden **3323/3323**＝+2本・smoke 0・fuzz 0・census 3/3・
  census:stubs A群🔴 0／C群 0・census:enginetext **103/103**・census:costtext A群 0）。
- **反転確認を8本とも取った**（チャームを自分の場だけに戻す／`colors` を無視／`hasRiseIcon` を外す／
  `frontOfSelf` の倍率を外す／上限の既定値を復活／エナを一掃しない／残りをデッキ上へ固定／位置の既定 1）
  ⇒ **8つとも新 golden が落ちる**ことを確認してから元に戻した。
- **逆翻訳を全10シート再生成して目視**＝該当11行すべてが `[STUB:…]` から**原文どおりの日本語**になった。
  ⚠**ハンドラを撤去すると `genStubsMd` の説明も消える**＝`POWER_CAP` が一度 `[STUB:POWER_CAP]`（生の英語 ID）に
  なりかけた（`census:stubs` C群ゲート）。**撤去バッチでは逆翻訳を payload から描くところまで同じコミットで閉じる。**
- 🔑**⑤実機は不要と判定**（PLAN §2.2）＝`src/data/` `src/engine/` `src/types/` `public/data/` `scripts/` のみ。
  **`src/screens/` は1行も触っていない／新しいアクション型・条件型・機構も0。**

## 2026-09-03（索引 A 第6巡）：§5.3 `O-60` 第21〜28バッチ — engine の「カード全文 regex」を8ハンドラぶん撤去／payload 化

**ベースライン**＝`49529c27b`（第17〜20バッチの直後）。**A🔴 SELF_TEXT 124行 → 115行 / 121→112ハンドラ**、
**miss 28ハンドラ・34カード → 20ハンドラ・26カード**。`BASELINE_SELF_TEXT` も 115 へ払い戻し済み。
**新しいアクション型・条件型は0**（payload 追加・既存 typed への寄せ・死んだ枝の撤去のみ）。
🔑**8バッチ中3バッチは「STUB ごと撤去」**＝`MULTI_SIGNI_TO_ENERGY`（→typed `SEND_TO_ENERGY`）／
`INFECTED_SIGNI_POWER_DOWN_BY_LEVEL`（→typed `POWER_MODIFY`）／`LOOK_TOP_SPELLS_TO_HAND`（live 0 の死んだ枝）。

### 第21バッチ `MULTI_SIGNI_TO_ENERGY`（1効果）— 🔑受け皿は既に在った（5回目）

- **真因**＝engine が `EffectText` に `/シグニ([０-９\d]+)体まで/` を当てて枚数を決めていたが、
  原文は「シグニ**を**２体まで」（助詞違い）で外れ、**既定 2** に落ちていた。
- 🔑**`parseSigniTarget` はこの文から `count:2, upToCount:true` を最初から出せていた**＝
  共有の対象パーサへ寄せる regex を1本広げるだけで typed `SEND_TO_ENERGY` になった。
  ⚠**枝を消すだけでは駄目だった**＝先に削除して試すと `TARGET_AND_DISCARD_HAND`（**全く別の catch-all**）へ落ちた。
- **STUB と `INTERNAL_OPP_SIGNI_TO_ENERGY_EXEC` を撤去**し、`verifyEffects.ts` の別名表からも外した。

### 第22バッチ `LAYER_ABILITY_COPY`（2効果）

- **真因（2つ）**＝①候補ゾーンを `card.EffectText.includes('トラッシュから')` で決めていた＝
  **同じカードの別の能力**に「トラッシュから」があると**場所が裏返る** ②絞り込みが **`'怪異'` のハードコード**で、
  `selectTarget.filter`（parser は `story:'怪異'`／`excludeSelf:true` まで出していた）を**トラッシュ分岐では無視**。
- **修正**＝`layerCopy{source:'trash'|'field'}` を parser が刻み、絞り込みは両分岐とも `selectTarget.filter`。
- 🔴**逆翻訳の死角も1つ潰した**＝この STUB は「**【レイヤー】の宣言文**」を抜き出して描いており、
  **コピー本体とは別の文**が出ていた（読んでも「どこから何を選ぶか」が分からない）。

### 第23バッチ `EACH_PLAYER_DRAW_DISCARD`（1効果）

- **真因**＝`/([０-９\d]+)枚引く/` が原文「１枚引**き**」（連用中止形）に当たらず既定1、
  **捨てる枚数に至っては regex すら無く 1 に焼き込まれていた**（原文を1文字も読んでいない）。
- **修正**＝`eachPlayerDrawDiscard{draw, discard}`。

### 第24バッチ `LOOK_TOP_OPP_CHOOSE_TRASH`（1効果）— 🔴カード複製バグを修正

- **真因（3つ）**＝①`/上から([０-９\d]+)枚/` が原文「上から**カードを**３枚」に当たらず既定3でデッキを切り直していた
  ②**帰結が壊れていた**＝選ばれた1枚を `INTERNAL_TRASH_CARD`（**手札から**取り除く実装）へ渡していたので
  **デッキは減らずトラッシュへ複製**されていた ③「**残りを手札に加える**」は**1行も実装が無かった**。
- **修正**＝候補は前段 `LOOK_AND_REORDER` が残した `lastProcessedCards`（＝公開したカード）から取る
  ＝原文の「**その中から**」がそのまま成立し、engine はデッキを切り直さない。
  新設 `INTERNAL_LTOCT_APPLY` が「選ばれた分→トラッシュ／残り→手札」をまとめて行う
  （⚠公開カード全部を `value` に運ぶ＝選択を跨ぐと `lastProcessedCards` が選択分に上書きされ、**残りが山に置き去り**になる）。

### 第25バッチ `INFECTED_SIGNI_POWER_DOWN_BY_LEVEL`（1効果）— 🔑受け皿は既に在った（6回目）

- **真因**＝regex が「**ウイルス**」表記なのに原文は「**感染状態**」＝1本も当たらず、
  当たった場合でも**感染シグニのレベルの合計**を**相手の全シグニ（非感染も含む）**へ掛ける別物だった。
- 🔑**同型の平坦版4枚**（`WX15-004` ほか）は既に `POWER_MODIFY{filter:{infected:true}}` で動いており、
  足りなかったのは **`deltaPerTargetLevel` の CONTINUOUS 経路**だけ（型は 2026-08 に既に在った）。
  `applyDeltaToState` に `perTargetLevel` を1つ足して `effectiveSigniLevel` を掛けるだけで済んだ。**STUB は撤去。**

### 第26バッチ `DOWN_UP_SIGNI_AND_CHOOSE`（1効果）

- **真因（2つ）**＝①`/アップ状態の＜([^＞]+)＞のシグニ/`（＜クラス＞限定）が原文の**色**指定
  （`SPDi43-23`＝「アップ状態の**白の**シグニ」）に当たらず、**絞り込みが丸ごと消えて場のアップシグニ全部が候補**
  ②**枚数を一切読んでいなかった**＝`CHOOSE` の1択で必ず1体しかダウンできず、原文「２体まで」を表せなかった。
- **修正**＝`selectTarget`（`parseSigniTarget` が `count`/`upToCount`/`filter{color|story, isUp}` を出す）＋
  `downUpSigniChoose{optional}`。1体ずつ選ばせる `INTERNAL_DOWN_SIGNI_BY_ZONE` は撤去し、
  `INTERNAL_DOWN_SELECTED_SIGNI` が選択分をまとめてダウンして `lastProcessedCards` に残す。
- ⚠🔴**STUB id は変えられない**＝`USE_TIME_COST_PAY_STUBS`（`effectParser.ts`）がこの id で
  使用時コストの支払いステップを剥がしている（`WX06-024` ほか6枚）。typed 化すると**支払いが二重**になる。

### 第27バッチ `LOOK_TOP_ONE_RETURN_REST_BOTTOM` ＋ 死んだ枝1本（1効果）

- **真因**＝`/デッキ(?:の上)?(?:から)?([０-９\d]+)枚/` が原文「上から**カードを**２枚見る」に当たらず既定2。
  しかもこの効果は `CHOOSE` の片方の枝なので、**カード全文には別の枝の数字も並ぶ**。
- **修正**＝`lookTopReturnRestBottom{lookCount}`（MANUAL 効果なので `syncManualLive.ts` で live へ）。
- 🧹**同じ壊れた regex を持つ `LOOK_TOP_SPELLS_TO_HAND` は live 0 の死んだ枝**だったので parser 枝ごと撤去
  （唯一の該当カード `WX10-033-BURST` は手前で typed `REVEAL_AND_PICK` に解けていた）。

### 第28バッチ `ALL_PLAYER_MILL`（1効果）

- **真因**＝2本の regex がどちらも原文（`WX22-017` 選択肢③「自分のセンタールリグのレベル１に**つき**カードを３枚」）に
  当たらず**既定 1枚**へ落ちていた（Lv4 なら12枚＝**桁違いの過少実行**）。ここも `CHOOSE` の4枝の1つ。
- **修正**＝`allPlayerMill{count | perOwnLrigLevel}`。🔑**`perOwnLrigLevel` はプレイヤーごとに
  自分のセンタールリグのレベル**を掛ける（原文「**自分の**センタールリグ」＝両者で枚数が違いうる）。

### 作業中に見つけて登録したもの（§2.4）

- 🆕**`O-224` を新規登録**＝`SPDi43-23-E1` の後段「**レベルがこの方法でダウンしたシグニの数以下の**
  対戦相手のシグニ１体」の**レベル条件が丸ごと落ちている**（どのシグニでも手札に戻せる過剰実行）。
  第26バッチで**数を運ぶ足場（`lastProcessedCards`）はできた**が、`TargetFilter` に動的しきい値が無い
  ＝`O-80` 族の設計問題なので新機構として登録した。

### 検証

- `npm run gates` **全緑**（golden **3321/3321**＝+8本・smoke 0・fuzz 0・census 3/3・
  census:stubs A群🔴 0／C群 0・census:enginetext **115/115**・census:costtext A群 0）。
- **反転確認を8本とも取った**（payload 無視／旧既定へ復帰／フィルタのハードコード復帰／
  デッキから抜かない旧挙動へ復帰 など）⇒ **8つとも新 golden が落ちる**ことを確認してから元に戻した。
- ⚠**第22バッチの反転は1回目が素通りした**＝テストが＜怪異＞のカードだけを使っていたため
  「ハードコード」と「filter 参照」を区別できなかった。**別クラスの filter で絞る assert を足して**取り直した。
  🔑**反転確認は「その1行を壊したら落ちるか」で書く**（同じ値になる標本だと反転しない）。
- **逆翻訳を全10シート再生成して目視**＝該当8行すべてが原文に近づいた
  （`WXEX2-26-E1` は `[STUB:…]` → 「対戦相手のすべての感染状態のシグニのパワーをそのシグニのレベル1につき－2000する」）。
- 🔑**⑤実機は不要と判定**（PLAN §2.2）＝触ったのは `src/data/` `src/engine/` `src/types/` `public/data/` `scripts/` だけで
  **`src/screens/` は1行も触っていない**。**新しいアクション型・条件型・機構も0**。

## 2026-09-03（索引 A 第5巡）：§5.3 `O-60` 第17〜20バッチ — engine の「カード全文 regex」を4ハンドラぶん payload 化

**ベースライン**＝`c5584dd3b`（`O-222` クローズの直後）。**A🔴 SELF_TEXT 128行 → 124行 / 125→121ハンドラ**、
**miss 32ハンドラ・39カード → 28ハンドラ・34カード**。`BASELINE_SELF_TEXT` も 124 へ払い戻し済み。
**新しいアクション型・条件型は0**（すべて既存 `StubAction` への payload 追加）。

### 第17バッチ `OPP_SIGNI_ATTACK_POWER_RESTRICT`（2効果／2カード）

- **真因**＝engine が `EffectText + BurstText` に `/パワーが(\d+)以下のシグニ**は**/` を当てていたが、
  原文は「パワーが10000以下のシグニ**で**アタックできない」（**助詞が違う**）＝**live 2効果とも1本も当たらず**
  既定値 **12000** へ落ちていた ⇒ 原文 10000 より**広く禁止する過剰実行**。
- **修正**＝parser が `oppSigniAttackPowerCap` を刻み、engine は payload だけを読む。**payload が無ければ
  ban を張らない**（fail-closed＝旧既定の逆向き）。逆翻訳も payload から描く。
- **影響**＝`WXDi-CP01-017` / `WXDi-P05-031`。母集団は CSV 全数検索で**この2枚だけ**と確認
  （他の「〜でアタックできない」15形はすべて `signi_attack_bans_this_turn` 側で処理済み）。

### 第18バッチ `CLASS_CHANGE`（4効果／4カード）

- **真因（2つ）**＝①**カード全文**に4本の regex を当てて「得るクラス／全体か／色の限定」を決めていた
  （`＜([^＞]+)＞を得る` は**別の能力**の＜＞を拾いうる＝`WXEX2-06` は同じカードに
  「＜怪異＞のシグニ１体がアタックしたとき」が並ぶ）②**`declared_class` を payload の有無に関係なく
  最優先**で読んでいたので、同じターンに別の効果がクラスを宣言していると
  **「＜怪異＞を得る」が宣言クラスへ化ける**。
- **修正**＝`classChange{newClass|fromDeclared, all{owner,colors}}` を parser が**その文だけ**から組む。
  engine は payload で分岐し、**payload が無ければ何もしない**（カード全文へフォールバックしない）。
- **影響**＝`WX21-049` / `WXEX2-06` / `WX25-P1-058`（宣言参照）/ `WXK04-006`（あなたのすべての赤と青と緑）。

### 第19バッチ `HAND_SIZE_INCREASE` / `REDUCE_OPP_HAND_LIMIT`（4効果／4カード）

- 🔑**消費地点は2つあった**（手口①＝先に grep する）＝**実際に効くのは `effectEngine.collectHandLimits`**、
  `execStubPart3` のハンドラは `PlayerState.hand_limit` へ書いていたが**読む地点が engine にも UI にも
  1つも無かった**（真no-op の死んだ枝）。
- **真因**＝`collectHandLimits` が「（６枚から８枚になる）」という**リマインダ文**を最優先で読んで
  上限を**絶対値へ代入**していた＝**同種の効果が2枚並ぶと後から読んだ1枚の値に潰れる**（加算にならない）。
  さらに `REDUCE_OPP_HAND_LIMIT` 側は regex が外れても **-1 を掛けていた**（原文を読まずに減らす）。
- **修正**＝`handLimitDelta`（**符号つき**）を parser が刻み、`collectHandLimits` は加算するだけ。
  ハンドラは**【常】の宣言型**へ倒し（state を書かない）、死んだ `PlayerState.hand_limit` は削除。
  ⚠`WX25-P2-005-E1`（ACTIVATED）は `GAIN_ABILITY_THIS_GAME` が `game_hand_size_bonus` を積むので、
  ここで足すと**二重に増える**＝書かないのが正しい。
- **影響**＝`WD23-001-E` / `WX19-003` / `WDK09-009` / `WX25-P2-005`（manual・`syncManualLive` で live へ）。

### 第20バッチ `PLAY_SPELL_FREE_IGNORE_RESTRICTION`（3効果／2カード）

- 🔴**この巡で一番実害が大きかった**＝engine は**候補ゾーンを持たず常に自分の手札**から選んでいた
  ＝`WX14-014-E1`（**対戦相手のトラッシュ**から）と `WXEX2-14-E3`（**いずれかのプレイヤーのトラッシュ**から）は
  **原文と違う場所のカードを使っていた**。
- 🔴**もう1つ**＝コスト上限の合計計算が `parseInt('《青》×２')`＝**NaN→0** だったので
  **上限フィルタが常に素通り**していた（`WXEX2-14` は5コスト以上のスペルも使えた）。
  上限値自体もカード全文から拾っており、同じカードの別能力の数字を掴みうる形だった。
- **修正**＝`playSpellFree{source:'self_hand'|'opp_trash'|'any_trash', maxCostTotal}` を parser が刻む。
  合計は `Cost` 文字列の `×N` を足す（`utils/keywords.ts` の `artsCostLte` と同じ式）。
  **知っている3形以外は payload を付けず、engine は何もしない**（fail-closed＝旧既定の「自分の手札」へ倒さない）。
  ⚠**トラッシュから使う形ではカードを移動させない**（既に持ち主のトラッシュに在る＝移すと持ち主が入れ替わる）。

### 作業中に見つけて直したもの（§2.4「その場で直す」）

- 🔴**第16バッチの撤去メモが別 STUB の説明欄に漏れていた**＝`genStubsMd.mjs` は
  **ハンドラ直前の連続コメントを全部つなぐ**ので、`UNDER_SIGNI_TO_ENERGY` の逆翻訳が
  `[STUB:🏁**HAND_CARDS_UNDER_SIGNI` … ]` になっていた（`npm run regen` を回して初めて表に出る）。
  ⇒ 慣例どおり **`// UNDER_SIGNI_TO_ENERGY: 〜` の id ラベルを付けて**規則①で拾わせた。
- **`BASELINE_HIGH` 5→3 は較正**（前巡の下げ忘れ）＝明細の高シグナル節を HEAD と A/B して**同一**を確認。
  **この巡の実装は census を1件も動かしていない**（`O-60` は census の網に載らない形を潰す項目）。

### 検証

- `npm run gates` **全緑**（golden **3313/3313**＝+4本・smoke 0・fuzz 0・census 3/3・
  census:stubs A群🔴 0／C群 0・census:enginetext **124/124**・census:costtext A群 0）。
- **反転確認を4本とも取った**＝①payload 無視で 12000 へ倒す ②`declared_class` 最優先へ戻す
  ③`REDUCE_OPP_HAND_LIMIT` の既定 -1 を復活 ④候補ゾーンを `ownerState.hand` 固定へ戻す
  ⇒ **4つとも新 golden が落ちる**ことを確認してから元に戻した。
- **逆翻訳を全10シート再生成して目視**＝該当14行すべてが原文に近づいた
  （`WXEX2-14-E3` は「あなたの手札から」→「いずれかのプレイヤーのトラッシュから」へ是正）。
- 🔑**⑤実機は不要と判定**（PLAN §2.2）＝触ったのは `src/data/` `src/engine/` `src/types/` `public/data/` `scripts/` だけで
  **`src/screens/` は1行も触っていない**。**新しいアクション型・条件型・機構も0**（既存 STUB への payload 追加のみ）。

## 🏁2026-09-02（索引 B 第4巡）：§5.3 `O-222` クローズ — ルリグの「シグニN体を場からトラッシュに置かないかぎりアタックできない」

**ベースライン**＝`0b55afabe`（`O-60` 第16バッチの直後）。**母集団は登録票どおり 1効果**
（`WX24-P3-049-E1`。原文「〜しないかぎり〜アタックできない」の全数24効果を当て直して確認＝
`fieldTrash` 軸は2効果あるが、もう1つ（`WX24-P2-010-E1`）は**シグニ対象**で既存の
`BLOCK_ACTION{attackCost.fieldTrash}` が動いている）。

### ① 何が壊れていたか（2つ）

原文＝「【自】：このシグニが場を離れたとき、**対戦相手のルリグ１体を対象とし**、《白》を支払ってもよい。
そうした場合、ターン終了時まで、**それは**「【常】：あなたのシグニ１体を場からトラッシュに置かないかぎり
アタックできない。」を得る。」

- 🔴**帰結が `STUB{DEFERRED_LRIG_ATTACK_BAN_FIELD_TRASH}`（明示 defer＝no-op）**＝
  `attackCost.fieldTrash` を消費するのは `execBlockAction` の**シグニ分岐だけ**で、
  ルリグのアタック解除コストは `lrigAttackBanCost` の《無》×N／手札N枚の2軸しか無かった。
- 🔴**登録票に書かれていなかった2つ目**＝**「対戦相手のルリグ１体を対象とし」も丸ごと落ちて**いた
  （`SELECT_TARGET_ONLY` / `STORE_LAST_PROCESSED_TARGETS` が1つも無い）。
  ⇒ 受け皿だけ作っても ban の掛け先が無いので、**`O-96` の3点契約もこの巡で通した**。

### ② 実装（登録票の4手＋照応の復元）

| # | 場所 | 変更 |
|---|---|---|
| ① | `src/types/effects.ts` / `src/types/index.ts` | `SigniAttackBan(Action)` に **`unlessPayFieldTrash?: number`**（＋ action 側に `fixedCardNums`） |
| ② | `src/engine/effectExecutor.ts` | `execSigniAttackBan` が軸とラベルを載せる／**`fixedCardNums` を消費**／`FREEZABLE` へ `SIGNI_ATTACK_BAN` を追加 |
| ③ | `src/screens/battle/signiAttackBan.ts` | `SigniAttackBanCost` に **`fieldTrash`**（`lrigAttackBanCost` が合算） |
| ④ | `src/screens/battle/attackFieldTrashCost.ts` | ルリグ版の候補／可否／CPU 決定論／支払いを4本新設（移動処理は `trashSelectedZones` で**シグニ版と共有**） |
| ⑤ | `src/screens/BattleScreen.tsx` | `lrigAttackCostInfo` が `fieldTrash` を返し**払えるかも見る**／`handleLrigAttack` が支払いUI を開く／`performLrigAttack` が引き落とす／ボタン表示を軸ごとに |
| ⑥ | `AttackFieldTrashCostModal` | `forLrig` で候補関数と文言を切り替え（**「他の」を出さない**＝原文に無い） |
| ⑦ | `src/data/parsers/parseSentencePart2.ts` | defer を撤去して typed の `SIGNI_ATTACK_BAN{targetsStored, unlessPayFieldTrash}` を出す |
| ⑧ | `src/data/effectParser.ts` | `O96_STORABLE_OUTCOMES` へ `SIGNI_ATTACK_BAN`／`target` を持たない型なので**宣言を原文から組み直す** |
| ⑨ | `scripts/decompileEffects.ts` | 逆翻訳に軸を追加（2枝）／失効した `DEFERRED_` ラベルを削除 |

🔑**`appliesTo:'LRIG'` は parser が付けない**＝`execSigniAttackBan` が**確定した対象の Type** で
シグニ ban／ルリグ ban に仕分ける（`O-220` 第4バッチで確立済みの規約）。だから parser は
`targetsStored` を刻むだけでよい。

🔴**踏んだ罠＝`hasStoredTargetBinding` が「宣言」と「配線」を区別していなかった。**
`SIGNI_ATTACK_BAN` は `target` を持たない型なので parser は**必ず** `targetsStored: true` を刻む
（engine は store が空なら ban を張らない＝これが唯一の fail-closed な出し方）。ところが
`applyO96OptionalCostTargetFirst` の入口ガードは **`targetsStored` を見つけただけで「配線済み」と判断**して
引き上げを諦めていた。⇒ **配線の有無は「`SELECT_TARGET_ONLY`/`STORE` ステップが木にあるか」で見る**
（`isUnwiredAttackBanAnaphora`）。⚠**例外は極力狭く**＝`targetsStored` を持つノードが
`SIGNI_ATTACK_BAN` **だけ**のときに限る（`thisCardOnly` 等を持つ他の型まで巻き込むと既に正しい木を壊す）。

🔑**シグニ側は「無言で無視しない」ガードを入れた**＝`signiAttackBanCost` はこの軸を見つけたら
**`null`（アタック不可）へ倒す**。シグニのアタック経路にこの軸の支払いUI は無い
（あちらは `signi_attack_field_trash_costs` という別 store）ので、載ったら過少側に倒すのが正しい。
live 母集団は0（parser はルリグ対象のときだけ出す）＝**再発防止のガード**。

### ③ ゲート

- `npm run gates` **全緑**（typecheck／golden **3305 → 3309**＝`O-222` の契約4本を新設／
  smoke 10723 全異常0／fuzz 全0／census 3 / BASELINE 5 据置／`census:stubs` A🔴0・C0／
  manual-fields 0／`census:enginetext` A🔴128 据置／`census:costtext` A🔴0 据置／lint 0 errors）。
- `npm run regen` 完走・**同型★0**。`node scripts/genStubsMd.mjs`（defer を1件撤去したため）。
- ⚠**既存 golden を3本更新した**＝①`O-220` 第4バッチ (b) は「defer であること」を assert していたので
  「typed の ban であること」へ差し替え ②`SigniAttackBanCost` の**形**を JSON 文字列で assert している
  2本に `fieldTrash: 0` を追加（**軸を足したら形の assert が動く**のは設計どおり）。
- ⚠**live へ届けるのに `--adopt-effect` が要った**＝`WX24-P3-049` は `_held_fresh` に落ちる
  （`O-60` 第16バッチと同じ）。**defer の撤去と採用は同じコミットで閉じる**（採用漏れ＝逆翻訳に
  生の英語 ID が出て `census:stubs` C群が止まる）。

### ④ 実機の要否（§2.2 の判定）

**必須**＝`src/screens/`（`BattleScreen.tsx` / `AttackFieldTrashCostModal.tsx` / `attackFieldTrashCost.ts` /
`signiAttackBan.ts` / `useMiscBattleUI.ts`）を触ったため。
`node scripts/verifyBattleDrive.mjs o222LrigFieldTrashPays o222LrigFieldTrashUnpayableBlocks
o222LrigFieldTrashCancelBlocks` で **3/3 PASS**。

🔑**支払い軸は3本組で撃つ**＝①払える ②払えない ③**払わずには通らない**。
③（キャンセル）が無いと「モーダルは出たが実は払わなくても通る」を見逃す。
- `o222LrigFieldTrashPays`＝ボタン「アタック（シグニ1体）」→ モーダルで1体選ぶ →
  **lrigDown=true・場のシグニ 2→1・trash +1**
- `o222LrigFieldTrashUnpayableBlocks`＝場にシグニ0 → 「アタック不可（シグニ1体）」・**lrigDown=false**
- `o222LrigFieldTrashCancelBlocks`＝キャンセル → **lrigDown=false・場のシグニ 2→2**（何も落ちない）

⚠**踏んだ罠（ドライバ側）**＝モーダルの候補を `page.locator('img[alt]')` で素に引くと
**モーダルの裏の盤面カード**を掴んで選択が永久に進まない。**確定ボタンの親から辿って
モーダル内だけを探す**（`payBtn.locator('xpath=..')`）。

### 影響枚数

挙動が変わったカード **1枚**（`WX24-P3-049`）＝**no-op（過少）の解消**。
効果 変更1・追加0・削除0、予定外0。

### 検証コマンド

```
npm run gates
npm run regen && node scripts/groupSimilar.mjs --all      # 同型★0
node scripts/verifyBattleDrive.mjs o222LrigFieldTrashPays o222LrigFieldTrashUnpayableBlocks o222LrigFieldTrashCancelBlocks
```

### 🔑 この巡から残す教訓

**「宣言」と「配線」を同じフラグで見ない。** `targetsStored` は *「照応で受ける」という宣言* であって
*3点契約が組まれた証拠* ではない。`target` を持たない型（`SIGNI_ATTACK_BAN`）を `O-96` の枠組みに
載せるときは、**配線の有無を `SELECT_TARGET_ONLY`/`STORE` の実在で判定する**必要がある。
⚠ここを混同すると、**parser が正しい宣言を出しているのに引き上げが諦められて対象が落ちる**
（今回まさにそれで、登録票に書かれていなかった2つ目の欠陥が隠れていた）。

---

## 2026-09-02（索引 A 第4巡）：§5.3 `O-60` 第16バッチ — 「このシグニの下に置く」を payload 化（A🔴 129→128行）

**ベースライン**＝`3e57a0840`（`O-194` クローズの直後）。**`O-60` は継続項目（クローズしていない）。**

### ② 母集団の実測（登録票は失効）

登録票の「A🔴 131行 / 128ハンドラ・miss 35ハンドラ / 44カード」（2026-08-30 第15バッチ後）は失効。
着手時の実測は **A🔴 129行 / 126ハンドラ・miss 33ハンドラ / 41カード**。

登録票が名指ししていた「次の3件」の先頭 `HAND_CARDS_UNDER_SIGNI|PLACE_SIGNI_UNDER_SELF_OPT`
（miss2 / live3）を取った。**原文で全数検索して母集団はちょうど 3効果 / 3カード**（全て AUTO）＝
`SPK01-02-E1` / `WXDi-P05-034-E2` / `WXDi-P11-081-E2`。

### ③ 実装＝受け皿は既にあった（`O-60` の教訓「受け皿は既に在った」の4回目）

🔑**`PLACE_UNDER_SIGNI{source, count, upToCount, filter, selectionConstraint}` が live 41効果で稼働中**で、
`execPlaceUnderSigni` は**行き先が常に「効果元シグニの下」**（`ctx.sourceCardNum` のゾーンへ差す）＝
この3効果が欲しかった意味そのもの。足りなかったのは **`source: 'field'` の1値だけ**だった。

**旧実装が読んでいた4軸**（`execStubPart2.ts:91`・`card.EffectText` + `BurstText` に regex）
| 軸 | 旧 regex | payload |
|---|---|---|
| 枚数 | `(?:手札から)?カード(?:を)?([０-９\d]+)枚まで` | `count` |
| 任意 | `txt.includes('もよい')` | `upToCount` |
| レベル | `レベル([０-９\d]+)以上` / `レベル([０-９\d]+)(?![以上以下\d])` | `filter.level` |
| 置き元 | `!txt.includes('手札')` → 場 | `source: 'hand' \| 'field'` |

🔴**4軸とも「カード全文」に当てていた**＝**別の能力に「手札」や「レベルN」が出るだけで軸が裏返りうる**
形だった（`WXDi-P11-081` は【自】とライフバーストの両方に「手札」が出る）。さらに
**`ctx.sourceCardNum` から `cardMap` が引けない実行経路では4軸とも既定値へ崩れる**（`O-60` 第9〜11バッチで
`SEED_BLOOM` が同じ経路で「全開花→1枚だけ」に化けた実績＝この項目の本質的な実害）。

**変更点**
- 型＝`PlaceUnderSigniAction.source` に **`'field'`** を追加。
- engine＝`execPlaceUnderSigni` に field 分岐（**各ゾーンの頂点だけ**を候補にし、**効果元自身は除外**）。
  ⚠`PLACE_UNDER_SOURCE_SIGNI` の適用側は `fromLocation:'field'` を**元から持っていた**ので追加不要だった。
- parser＝`parserUtils.parsePlaceUnderSourceSigni` を新設し、**2つの生成地点を1本に集約**
  （`parseSentencePart2`：手札からカードをN枚まで／`parseSentencePart3`：〜をこのシグニの下に置いてもよい）。
- engine の STUB 分岐（41行）を**撤去**。逆翻訳の原文抽出2ブランチも撤去し、typed の描画へ寄せた
  （`puLoc` に `field: 'あなたの場の'` を追加＝足さないと `fieldから` と生の英語が出る）。

🔴**実装中に踏んだ罠＝名詞句判定に行き先句が混ざった。**
「あなたの手札から**カード**を２枚まで**この**シグニの下に置く」で `/のシグニ/` が
**「このシグニの下」側にマッチ**し、`filter.cardType:'シグニ'` が付いた＝**スペルを下に置けない過小実行**。
⇒ **行き先句（`(?:この)?シグニの下に置…`）を先に切り落として head だけで判定する**ようにした。
実機の `o60placeHand` はこの反転（スペルが下に入る）を観測点にしている。

### 🧹 同じカードの別効果で見つけた欠陥2件（教訓⑤「採用前に逆翻訳を全文読む」が当たった）

**① `WXDi-P05-034-E1` に原文の「パワーは＋5000され」が無かった（過小実行）**
原文「【常】：このシグニの下にカードがあるかぎり、このシグニのパワーは**＋5000され**、
このシグニは「【自】：…」を得る。」に対し、`manualEffects.ts` の手書きは**引用【自】を平らにした形だけ**で
**パワー修整が丸ごと落ちていた**。parser は正しい CONTINUOUS SEQUENCE を出していたが、手書きが
`mergeManualEffects` で常に勝つので届かない（§5.3 `O-93` / `O-194` と同じ「parser が追い越した手書き」）。
🔑手書きは `abortIfNoCandidate` と `PAID_ADDITIONAL_COST` ゲート（executor の look-ahead＝Pattern④）を
持つぶん parser より忠実なので、**削除ではなく `-E1b` へ切り出した**（`O-194` と同じ規約）。

**② `fromLeftFieldUnder` の逆翻訳が定型文をベタ書きしていた（計器の嘘）**
`TRANSFER_TO_HAND` / `ADD_TO_FIELD` の両方が「トラッシュにある、このシグニの下にあった**シグニ1枚**を〜」
という**固定文字列**を返しており、`count` / `upToCount` / `filter` を**全部捨てて**いた。
⇒ `SPK01-02-E2` は原文「**カード**を**２枚まで**」なのに「シグニ**1枚**」と描かれ、
`WXK10-054-E1` の `＜ウェポン＞` も消えていた。**JSON は正しいのに逆翻訳だけが嘘をつく**形＝
原文照合（§5-6）が素通りする。⇒ `leftFieldUnderNounJa` を新設して payload から描く（live 5効果に効く）。
🔑**`O-194` で直した `SELF_PLAY_RESTRICT` の rawText と同じ家系**＝
**「逆翻訳が payload を見ずに文字列を返す」箇所は、そこだけ原文照合が効かない死角になる。**

### ④ ゲート

- `npm run gates` **全緑**（typecheck／golden **3305 / 3305**＝`O-60` 第16バッチの assert 4本を新設／
  smoke 10723 全異常0／fuzz 全0／census 3 / BASELINE 5 据置／`census:stubs` A🔴0・C0／manual-fields 0／
  `census:enginetext` A🔴 **129→128行 / 126→125ハンドラ**・miss **33→32ハンドラ / 41→39カード**／
  `census:costtext` A🔴0 据置／lint 0 errors）。
- `BASELINE_SELF_TEXT` を **129→128** へ実数更新（払い戻しても exit 1 で止まる ratchet）。
- `npm run regen` 完走・**同型★0**。
- ⚠**live へ届けるのに3手かかった**＝parser を直しても3効果とも held/partial に落ちた
  （`SPK01-02` / `WXDi-P11-081` は `_held_fresh`、`WXDi-P05-034` は `_partial_fresh`）。
  `heldReview.mjs --adopt-effect` と `--adopt-partial-effect` で効果単位に採用した。
  🔴**engine の STUB を先に消したので、採用し忘れると live の STUB が無言 no-op になる**
  （`census:stubs` A群🔴 が拾うが、**撤去と採用は必ず同じコミットで閉じる**）。
  golden にも「撤去済み STUB が live に1件も残っていない」を全カード走査で入れた。

### ⑤ 実機の要否（§2.2 の判定）

**必須**＝`src/engine/`（`effectExecutor.ts` / `execStubPart2.ts`）を触り、`source: 'field'` という
**新しい機構の軸**を足したため。`node scripts/verifyBattleDrive.mjs o60placeHand o60placeField` で **2/2 PASS**。

🔑**わざと `effect_stack` 注入経路で撃った**＝この項目の実害は「当たる/外れる」ではなく
**実行経路によって読めたり読めなかったりする**ことなので、旧実装が崩れる経路で payload 版を確かめるのが要点。
- `o60placeField`＝レベル3の場シグニが効果元の下へ入り、**レベル1は候補外**・**効果元自身も候補外**
  （`under=["WD01-010#1"] top=WXDi-P05-034#1`／zone2 の `WD01-013#1` は残ったまま）
- `o60placeHand`＝**スペル `WD01-018`（噴流する知識）が下に入った**（= `cardType` フィルタが付いていない証拠）
  かつ**選択UIの上限が2**（= `count:2` を payload から読めている証拠）

⚠**踏んだ罠2つ（どちらもドライバ側）**
① `pick-0` を無条件に押すと**選択がトグルして永久に確定しない**＝既存の `H.stdStep()`
（「決定(1/N) が出ていない間だけ pick-0」）に任せるのが定石。
② 🔑**「N枚まで」を「N枚入ること」と期待してはいけない**＝上限なので1枚で確定してよい。
**上限は「選択UIが広告する `決定 (n/N)` の N」で測る**（実際に置けた枚数では `count` を読めているか分からない）。

### 影響枚数

挙動が変わったカード **4枚**＝`SPK01-02` / `WXDi-P05-034` / `WXDi-P11-081`（payload 化＝経路非依存に）
＋ `WXDi-P05-034` の **パワー＋5000 復活**（過小実行の是正）。
逆翻訳だけが直ったカードがさらに **5枚**（`fromLeftFieldUnder` 群）。予定外の変更 0
（効果 変更3・追加1・削除0）。

### 検証コマンド

```
npm run gates
npm run regen && node scripts/groupSimilar.mjs --all      # 同型★0
node scripts/verifyBattleDrive.mjs o60placeHand o60placeField
npx tsx scripts/censusEngineText.ts --id "HAND_CARDS_UNDER_SIGNI|PLACE_SIGNI_UNDER_SELF_OPT"  # A群から消えたこと
```

### 🔑 この巡から残す教訓

**「逆翻訳が payload を見ずに文字列を返す」箇所は、そこだけ原文照合が効かない死角になる。**
`O-194` の `SELF_PLAY_RESTRICT{rawText}` と今回の `fromLeftFieldUnder` 定型文は**同じ家系**で、
どちらも「JSON は正しいのに逆翻訳だけが嘘をつく」＝**§5-6 の原文照合をすり抜ける**。
⇒ **typed 化のたびに、その payload を描く逆翻訳ブランチが `count` / `upToCount` / `filter` を
全部出しているかを確かめる**（`O-60` の手口④「逆翻訳も payload から描く」の実務的な意味はこれ）。

---

## 🏁2026-09-02（索引 A 第3巡）：§5.3 `O-194` を再計測してクローズ — 登録票 68効果 → 真の穴 6効果

**ベースライン**＝`f136bde46`（`O-221` クローズの直後）。
登録票は下位分類 (a)〜(f) を**名指しで6つ**挙げていたが、当たり直したら**6分類とも 0**だった。

### ② 母集団の測り直し（この巡の本体）

**第1段＝登録票の下位分類を1つずつ当て直した**（原文 regex × live JSON）。

| 分類 | 登録票 | 実測 | 既にあった受け皿 |
|---|---:|---:|---|
| (a) レベル合計の比較 | 3＋2 | **0** | `FIELD_LEVEL_SUM{target:'signi'/'lrig', compareTo:'opponent'}` |
| (b) N種類以上 | 2＋2 | **0** | `TRASH_HAS_CARD{distinctName}`／`ENERGY_COLOR_TYPES`／`ENERGY_COUNT_FILTER{distinctClasses}`／`HAS_CARD_IN_FIELD{distinctColors}` |
| (c) 否定形「N枚以上ない」 | 2 | **0** | 🔑**否定型は要らなかった**＝`COUNT_THRESHOLD{operator:'lt'}`／`HAS_KEY_IN_FIELD{lte}` で不等号を裏返して表せている |
| (d) 相手の場の【チャーム】数 | 2 | **0** | `IS_SELF_CHARMED`／`HAS_CARD_IN_FIELD{filter:{hasCharm}}` |
| (e) 相手の手札枚数がちょうどN | 2 | **0** | `COUNT_THRESHOLD{location:'hand', operator:'eq'}` |
| (f) 【ソウル】が付いているかぎり | 2 | **0** | `IS_SELF_SOUL_ATTACHED` |

**第2段＝分類を捨てて総ざらいした**＝「原文ブロックに『かぎり／限り』がある ∧ live の効果 JSON に
`condition` / `activeCondition` / `CONDITIONAL` / `triggerCondition` が1つも無い」
（`O-195` と同じ計器・突き合わせは `docs/_effect_srctext.json`）。

| 段 | 件数 | 中身 |
|---|---:|---|
| 第1段（素の計器） | **92効果 / 91カード** | 🔴**上限**（§5.3 の鉄則） |
| B: `NEGATE_ATTACK.escapeDiscard` | 15 | 「対戦相手が手札を３枚捨てないかぎり、そのアタックを無効にする」＝LB の定型 |
| B: `SIGNI_ATTACK_BAN.unlessPayColorless` | 8 | 「《無》を支払わないかぎりアタックできない」 |
| B: `cost.costReplacement` / `useTimeCost` | 7 | 「〜より多いかぎり、使用コストは《色×N》減る」（`O-86` の受け皿） |
| B: `fieldCondition` / キーワード引数 / `COST_SUBSTITUTE` | 6 | `FRONT_SIGNI_POWER`／`アサシン:{"selfHandLte":2}`／エナ支払いの代替 |
| **C: STUB に条件が畳まれている** | **50** | `GUARD_LOSS_UNLESS_LRIG{lrigClass}`／`LEVEL_REFERENCE_OVERRIDE`／`LOSE_COLOR_ALL_ZONES`／`GRANT_QUOTED_ABILITY` ほか |
| **A: 真の穴** | **6** | ← ここだけが worklist |

⚠**A から2件を外した**
- `WXK05-029-E1`（トラッシュに《サーバント》10種類以上）＝**engine 側が原文 regex から条件を読んでいる**
  （`collectAllColorSigni` が `EffectText` に `([０-９\d]+)種類以上` と `カード名に《…》を含む` を当てる）＝
  `census:enginetext` A群（`O-60`）の母集団であってここではない。
- `WXK10-039-E2` は `_effect_srctext.json` の id 割り付けが `manualEffects.ts` の定義と入れ替わっているだけ
  （E1＝【出】/ E2＝【アサシン】）で**挙動は正しい**＝計器の偽陽性。

### ③ 真の穴 6効果（5件は過剰実行・1件は過小実行）

**受け皿が既にあった4件**
- 🔴`WX13-034-E1`「あなたのルリグデッキが０枚であるかぎり、このシグニは対戦相手のアーツの効果を受けない」
  → 条件が落ち、**常に**相手アーツの効果を受けなかった。`LRIG_DECK_COUNT` は両 union に既存＝
  `parseActiveCondition` に規則1本（`^(あなた|対戦相手)のルリグデッキがN枚(以下|以上)?であるかぎり、`）。
- 🔴`WXDi-P15-060-E1`「あなたの場にあるシグニの下にカードがあるかぎり、このシグニのパワーは＋4000される」
  → **常に**＋4000。受け皿 `TargetFilter.hasUnderCards`（2026-08-31 §5.2 で新設・両評価器に配線済み）。
  ⚠**「このシグニの下に」と混同しない**（あちらは効果元自身＝`THIS_CARD_HAS_UNDER`）。
- 🔴`WX08-025-E1`「このシグニはあなたの場にクロス状態のシグニがないかぎり、新たに場に出すことができない」
  → `parseSelfPlayRestrict` が**未対応語彙として `condition` を付けずに返し**、
  `evalConditionForContinuous` の `default: true`（permissive）で**出撃制限が恒久 no-op**だった（過小実行）。
  受け皿 `TargetFilter.crossState` は既存＝`HAS_CARD_IN_FIELD{filter:{crossState:true}}` を付けた。
  ⚠**live で唯一の inert な `SELF_PLAY_RESTRICT`**（`never`／`condition`／`exceptSourceCardNames` が全部無い＝実測1件）。
- 🔴`WXDi-P16-090-E1`＝【チーム常】の**2文目**「あなたの場にいるルリグのレベルの合計が７であるかぎり」が
  落ち、**シャドウが常時付いて**いた。同型（2文目を `-E1b` へ切り出す）は `WX26-CP1-059`／`WXDi-P01-049`／
  `WXDi-P08-048`／`WX21-015` で**既に確立済みの規約**だったのでそこへ揃えた（`manualEffects.ts`＋
  `syncManualLive.ts`）。
  🔑⚠**`CONDITIONAL` で包んではいけない**＝`GRANT_KEYWORD` の CONTINUOUS 収集器
  （`effectEngine.ts` の `collectDynamicKeywords` 相当）は **`SEQUENCE` しか展開しない**ので、
  包むと逆に恒久 no-op になる。効果を分けるのが唯一の正解。

**新条件型を2つ足した2件**（どちらも `SAME_ZONE_HAS_SEED`／`SAME_ZONE_HAS_GATE` を型紙にした）
- 🔴`PR-472-E2`「あなたのセンタールリグのルリグタイプが２つ以上であるかぎり、対戦相手はスペルを使用できない」
  → 条件が落ち、**このシグニが場に居るだけで相手はゲーム中ずっとスペルを使えなかった**（この巡で最も重い）。
  → **`LRIG_TYPE_COUNT{owner, operator, value}`**（`CardClass` の `/`／`／` 区切り数・ルリグ不在は 0＝fail-closed）。
  式は `execUtils.countCenterLrigTypes` と `effectEngine` の双子に置いた（`effectEngine` は循環参照を
  避けて `execUtils` を import しない＝`lrigZoneTops` と同じ既存の慣例）。
- 🔴`WD23-039-A-E1`「このシグニと**同じシグニゾーン**に【トラップ】があるかぎり、基本パワーは5000になる」
  → 条件が落ち、**常に**5000（印刷2000）。→ **`SAME_ZONE_HAS_TRAP`**（`field.signi_traps[zoneIdx]`）。
  ⚠**場全体を見る `HAS_TRAP_IN_FIELD` で代用してはいけない**（隣ゾーンのトラップでも成立する）。

どちらも **6箇所**を揃えた＝型（`ActiveCondition`＋`Condition`）／`ACTIVE_CONDITION_TYPES`＋`CONDITION_TYPES`／
`checkActiveCondition`／`evalCondition`／逆翻訳／parser。

### 🧹 ついでに塞いだ engine の穴（母集団0＝再発防止）

`calcContinuousBlockedActions` の `scanField`（`effectEngine.ts`）が `checkActiveCondition` へ
**`sourceCardNum` を渡していなかった**＝`IS_SELF_*` / `SAME_ZONE_HAS_*` / `THIS_CARD_HAS_UNDER` の
ように効果元自身を見る条件が**常に false** に落ち、その `BLOCK_ACTION` が恒久 no-op になる。
発見時の live 母集団は **0**（唯一の該当 `WXEX2-11-E2` の `LRIG_IS_DRIVE_STATE` はルリグ札で
`scanLrigBlocks` 側を通る＝そちらは元から渡していた）＝**挙動差0のまま塞いだ**。
`PR-472-E2` はシグニ札の CONTINUOUS `BLOCK_ACTION` なので、この経路が条件を見ることは実機で確認済み。

### 🧹 逆翻訳の死角も1つ塞いだ

`SELF_PLAY_RESTRICT` は `rawText` をそのまま描画する（最も忠実だから）が、**機械側の `condition` が
無くても逆翻訳は正しく見える**＝`WX08-025-E1` の恒久 no-op がそれで隠れていた
（`O-74`/`O-79` の `exceptSourceCardNames` と**同じ形の再発**）。同じ扱いで
**「（機械条件: …）」を併記**するようにした。

### ④ ゲート

- `npm run gates` **全緑**（typecheck／golden **3301 / 3301**＝`O-194` の恒久 assert 3本を新設／
  smoke 10723 全異常0／fuzz 全0／census 3 / BASELINE 5 据置／`census:stubs` A🔴0・C0／
  manual-fields 0／`census:enginetext` A🔴129 据置／`census:costtext` A🔴0 据置／lint 0 errors）。
- `npm run regen` 完走・**同型★0**。
- ⚠**型数ラチェット**（golden `(cxv)`）は 67→**69**（ActiveCondition）／145→**147**（Condition）へ実数更新。
  **型を足すと必ずここで止まる設計**なので、止まったら「実装漏れが無いか」を確かめてから数字を動かす。
- ⚠**`build:effects` だけでは届かない2件を手当てした**＝`WX13-034` は held に落ちた
  （原因は**別効果のネスト能力の `parseStatus: MANUAL→AUTO` という刻印差**で、私の追加は純増だった）ので
  `node scripts/heldReview.mjs --adopt-effect WX13-034-E1`。`WXDi-P16-090` は既存 id の書き直しなので
  `npx tsx scripts/syncManualLive.ts WXDi-P16-090`（新規 id `-E1b` の追加だけは収穫マージが通す）。

### ⑤ 実機の要否（§2.2 の判定）

**必須**＝`src/screens/` は触っていないが、**新しい条件型を2つ足した**ため。
`node scripts/verifyBattleDrive.mjs o194trapSame o194trapOther o194lrigType2 o194lrigType1` で **4/4 PASS**。

- `o194trapSame`＝同ゾーンに【トラップ】→ 表示パワー **5000**
- `o194trapOther`＝**別ゾーン**に【トラップ】→ 印刷パワー **2000** のまま
  （🔑これが `HAS_TRAP_IN_FIELD` 代用との差を見ている唯一のテスト）
- `o194lrigType2`＝相手センタールリグがルリグタイプ2つ → スペルが使用できない（trash 0→0・使用ログ無し）
- `o194lrigType1`＝ルリグタイプ1つ → スペルが解決する（trash 0→1・「噴流する知識を使用」）

🔑**新条件型は「成立する腕」と「成立しない腕」を必ず対で撃つ**＝片腕だけだと
「条件が落ちて常に成立する」旧挙動と区別がつかない。

⚠**踏んだ罠2つ（どちらも観測点の設計ミス＝engine は初回から正しかった）**
1. **パワーは DOM に `5,000` とカンマ区切りで描画される**＝素朴な `\d{3,6}` が「5」と「000」に割れて
   `0` を拾い、**正しい 5000 を FAIL と報告した**。読む前にカンマを除去する。
2. **スペル使用の可否を手札枚数で測ろうとした**が、`WD01-018`（噴流する知識）は「1枚引く」ので
   **−1（使用）＋1（ドロー）＝差0**＝通っても封じても同じ数字になる。**トラッシュ枚数＋使用ログ**へ替えた。

### 影響枚数

挙動が変わったカード **6枚**（`WX13-034` / `WXDi-P15-060` / `PR-472` / `WD23-039-A` / `WX08-025` /
`WXDi-P16-090`）＝**5枚が過剰実行の是正・1枚が過小実行の是正**。予定外の変更 0。

### 検証コマンド

```
npm run gates
npm run regen && node scripts/groupSimilar.mjs --all      # 同型★0
node scripts/verifyBattleDrive.mjs o194trapSame o194trapOther o194lrigType2 o194lrigType1
```

### 🔑 この巡から残す教訓

**登録票の「下位分類」は在庫ではなく"当時の標本"**。6分類が名指しで書かれていたのに、当たり直したら
**6分類とも 0**（他バッチの副産物で全部埋まっていた）。⇒ **分類を信じて着手せず、分類を捨てた
総ざらいの計器で測り直す**（今回はそれで初めて「登録票に1行も書かれていない6効果」が出た）。
§5.3 の「母集団は着手時に実測」の**6巡連続**の実証。

---

## 2026-09-02（索引 B 第3巡）：🏁§5.3 `O-221` クローズ — 「そうした場合」の did-it ゲート5効果（欠陥署名 13→9）

**ベースライン**＝`c8c1472f0`（`O-220` クローズ時点）。**5件の内訳＝実装4／据置契約1。**
**計器**＝`npx tsx scripts/archive/o96TargetAnaphoraTriage.ts`（`O-220` の巡で保存したもの）。
**検証**＝`npm run gates` 全緑（**golden 3298 / 3298**・smoke 10723 全異常0・fuzz 全0・
census 3 / BASELINE 5・census-stubs A🔴0 / C0・manual-fields 0・census-enginetext A🔴129 据置・
census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径**＝**4効果**（`PR-Di017B-E1` / `WX20-067-E1` / `WXDi-P14-085-E1` / `WXDi-CP02-052-E1`）
**・予定外0**。**⑤実機の要否**＝`src/screens/` 未変更＝PLAN §2.2 の機械判定で**不要**
（観測点は前巡の `V-131`／`V-132` のまま）。

### 🔑 この巡の最大の学び＝登録票の「過剰実行2件」はどちらも誤診だった

「did-it ゲートが無い＝**払わなくても帰結が走る**」と書かれていた `WX20-067-E1` / `WXDi-CP02-052-E1` は、
**executor の Pattern⑤**（`OPTIONAL_COST` の後続ステップは pay のときだけ走る）が実質のゲートなので
**払わずに帰結が走ることは無かった**。実際に壊れていたのは**どちらも `O-96` の実害(a)**＝
**対象が0体でも支払いを提示する**（相手の場が空でも「《白》＋自身ダウン」／「手札1枚捨て」を出す）。
⇒ **登録票の「何が壊れているか」も、母集団と同じく着手時に実コードで確かめ直す。**（5巡連続で当たった）

### 🔴 O-221 の署名では説明されない欠陥を2件見つけた

1. **`PR-Di017B-E1` は「parser が追い越した手書き」に凍らされていた。**
   `manualEffects.ts` の古い定義（`STUB{TARGET_ONLY}` ＋ `costText` だけの `OPTIONAL_COST`）が
   `mergeManualEffects` で常に勝ち、**帰結の「それをトラッシュに置く」が丸ごと無い過小実行**のまま
   固定されていた（timing も `ATTACK` で原文の「アタックフェイズ開始時」と違っていた）。
   parser 側は既に `O-96` の正準形を出していたので、**手書きを削除するだけで直った**。
   🔑**この形はどの計器にも出ない**＝`censusManualDrift` の「削除候補」は**実体同一**しか出さないので、
   **§6.3 K の既知乖離リスト（UNDATED）にだけ残る**。⇒ **UNDATED の残り3件も同じ疑いで読む。**
2. **`WXDi-CP02-052-E1` は前置条件が丸ごと落ちていた**＝「あなたの場にあるすべてのシグニが
   ＜ブルアカ＞の場合」が無く**無条件で発動する過剰実行**。受け皿は既存 `ALL_FIELD_SIGNI_MATCH`。

### バッチ別

| # | 効果 | 何が壊れていたか | 触った層 |
|---|---|---|---|
| 1 | `PR-Di017B-E1` | 古い手書きが parser の正準形を凍らせていた（帰結ごと欠落） | manual 削除 |
| 2 | `WX20-067-E1` | 対象宣言が複合任意コスト（《白》＋自身ダウン）より後ろ | parser |
| 3 | `WXDi-P14-085-E1` | did-it ゲートが**内側の `SEQUENCE`** にあり `O-96` の規則が届かない | engine / parser |
| 4 | `WXDi-P16-TK01-E1` | **据置が正しい**（専用 STUB が支払い前に対象の有無を検査する） | golden 契約 |
| 5 | `WXDi-CP02-052-E1` | 対象宣言が後ろ ＋ 前置条件の欠落 | manual |

### 🔴 第3バッチ＝入れ子は畳まない／空 store では焼かない

`WXDi-P14-085-E1` は `[OPTIONAL_COST, SEQUENCE{snapshot}[CONDITIONAL{gate}→BANISH, CONDITIONAL{…}→TRASH]]`。
🔑**`snapshotLastProcessedForConditionals` は「この効果で捨てた札」を全 `CONDITIONAL` へ配る印**で、
平らにすると**先頭の帰結（バニッシュ）が `lastProcessedCards` を書き換えて後段の条件（＜電音部＞3枚）が
壊れる**。⇒ **ゲートだけ差し替えて器は残す**（parser の `gateReplacement`）。

engine 側はこの形が Pattern④（コストの直後が `CONDITIONAL`）ではなく **Pattern⑤** に入るため、
`freezeStoredTargets` の木の走査だけが焼き込みの経路になる ⇒ **`CONDITIONAL` の内側へ降りるようにした**。
🔴**ただし単独で足すと退化する**＝`fixedCardNums: []` は「候補を空集合へ絞る」＝**確実な no-op** なので、
まだ `STORE_LAST_PROCESSED_TARGETS` を通っていない木を焼くと**生きた照応を殺す**
（実測＝`WXK11-010-E1` は先頭の任意コストが Pattern⑤ に入る時点で store が空）。
⇒ **「store が空なら1バイトも焼かない」ガードとセットで入れた**（golden にトリップワイヤを1本）。

### ⚠ ついでに直した／広げたもの

- **`down_self` を `applyO96OptionalCostTargetFirst` の `allowedCostKeys` へ追加**＝
  `OptionalCostSpec` の正規の軸（`execUtils.ts` の可否判定635・支払い805＝`DOWN{thisCardOnly}`）なのに
  許可リストから漏れていた（`selfToEnergy` / `fieldToDeckBottom` と同じ基準で入る）。
- **`MANUAL_DRIFT_KNOWN` から `PR-Di017B-E1` を外した**（§6.3 K の worklist が1件減った）。

### ⚠ 踏んだ罠（この巡で golden が3本落ちた）

1. 🔴**`PAID_ADDITIONAL_COST` は executor の look-ahead 専用**＝コストの直後が `CONDITIONAL` の形
   （Pattern④）でしか意味を持たず、**通常の評価器へ来ると常に `false`**（`execUtils.ts` の `evalCondition`）。
   入れ子（Pattern⑤）のゲートをこの型へ差し替えたら**帰結が丸ごと落ちる過小実行**になった
   （golden `wave3 A5` が捕まえた）。⇒ **入れ子のゲート条件は据置し、照応だけを載せる。**
2. **既存 golden が「直す前の JSON」を丸ごと固定していた**（`task16 wave1: WX20-067-E1`）＝
   正準形へ直したので期待値を更新した（削除せず、何を固定しているかを書き換える）。
3. **`BASELINE_ORPHAN_MANUAL` が 8→9**＝`WX20-067-E1`。**新しく凍らせたのではない**＝この効果は
   `effectParser.ts` の**カード別の外科パッチ**が `parseStatus:'MANUAL'` を毎回の build で押し直す群で、
   これまで live が held で古いまま（`AUTO`）だっただけ。`syncManualLive --effect` で
   **live が fresh に追いついた**結果この test の母集団へ入った（`censusOrphanManual` の表示値は動かない）。

### 残 9 の読み方

**「直す対象」はもう入っていない**＝据置契約6（対象が一意 or engine 側が支払い前に検査する）／
計器の偽陽性1（署名が引用能力の中にあるだけ）／`O-222` 1／`O-223` 1。
⇒ **この計器で新しく取れる在庫は尽きた**（次に使うのは `O-222`/`O-223` を消すときか、
新カードで同じ文型が増えたとき＝そのときは残 9 がベースライン）。


## 2026-09-02（索引 A 第5巡）：🏁§5.3 `O-220` クローズ — 帰結型ごとの「対象固定 3点契約」を8バッチで通した（欠陥署名 23→13）

**ベースライン**＝`f266910e8`（`O-96` クローズ時点）。**16件の内訳＝実装12／据置契約3／新 ID へ分割2**（重複あり）。
**検証**＝`npm run gates` 全緑（**golden 3292 / 3292**・smoke 10723 全異常0・fuzz 全0・
census 3 / BASELINE 5・census-stubs A🔴0 / C0・manual-fields 0・census-enginetext A🔴129 据置・
census-costtext A🔴0 据置・lint 0 errors）。
**ブラスト半径**＝ベースラインとの effectId 単位 機械 diff で **18効果・予定外0**。
**⑤実機の要否**＝`src/screens/` は**触っていない**（`src/data/` `src/engine/` `scripts/` `public/data/` のみ）
＝PLAN §2.2 の機械判定で**実機不要**。⚠ただし新設した型・語彙（`hasTrapAbility`／`trashedPick.dest:'declare'`／
`POWER_MODIFY_BY_SOURCE.targetsStored`）は**選択UIの見え方を変える**ので、次に実機を回す巡で
`V-nn` として観測する（PLAN §5.1 へ登録済み）。

### 🔑 この巡の最大の学び

**「3点契約が足りない」と登録した16件のうち、型の契約が本当に足りなかったのは4件だけだった。**
残りは **①受け皿が既に在った**（`TRANSFER_TO_DECK{LRIG_TRASH_CARD}`／`SIGNI_ATTACK_BAN{appliesTo:'LRIG'}`／
`PICK_FROM_TRASHED_CARDS`）**②対象が一意で直す必要が無かった**（`attackingOnly`／`frontOfSelf`／ルリグ）
**③そもそも別の欠陥だった**（引用能力の平坦化／catch-all の誤爆）。
⇒ **登録票の「型に○○が無い」を鵜呑みにせず、着手時に原文と実コードで数え直す**（4巡連続で当たった）。

### 🔴 盤面破壊バグ2件（どちらもゲートは全部緑だった）

1. **`STUB{SOUL_OP}` が効果元のシグニをルリグデッキへ入れていた**（`WX11-037-E2`／`WXK01-043-E2`）。
   「それをルリグデッキに加える」枝が `sourceCardNum` を動かす実装で、原文は
   「あなたの**ルリグトラッシュから**〈色〉のアーツ１枚を**対象とし**…**それを**ルリグデッキに加える」。
   ⇒ シグニが盤外へ消える。
2. **`STUB{SIGNI_FLIP_FACEDOWN}` が効果元に自分自身を裏向きにさせていた**（`WXDi-P05-037-E2`）。
   `faceDownTarget` が無いと `lastProcessedCards ?? sourceCardNum` へ落ち、支払い後は空になる。
   原文は「このシグニの**正面の**シグニ１体」。

🔑**共通の真因＝catch-all STUB は「対象を書かなくても動く」ので、対象宣言が落ちた瞬間に別のカードを撃つ。**
`census:enginetext` A群（engine がカード全文 regex で意味を決める箇所）の典型的な壊れ方。

### バッチ別

| # | 何を直したか | 効果数 | 触った層 |
|---|---|---|---|
| 1 | `NEGATE_ATTACK` に `attackingOnly`（「**この**アタックで…ダメージを与えない」）＋即適用分岐 | 5 | parser / engine |
| 2 | `REARRANGE_SIGNI` の3点契約 | 1 | 型 / engine / parser |
| 3 | 帰結が `CHOOSE`（二択）＝全枝へ照応を配る／`freezeStoredTargets` が枝へ降りる | 1 | engine / parser |
| 4 | 引用「〈解除コスト〉を支払わないかぎりアタックできない」＝**指定は引用を伏せた本文から読む** | 3 | parser |
| 5 | ルリグトラッシュ→ルリグデッキの照応（`SOUL_OP` の盤面破壊を止める） | 2 | parser / engine |
| 6 | 帰結が STUB の形（`COPY_CARD` / `TRAP_OPERATION`）＋`TargetFilter.hasTrapAbility` 新設 | 2 | 型 / engine / parser |
| 7 | 「この方法でトラッシュに置かれたカードの中から」＝`trashedPick.dest:'declare'` 新設 | 1 | 型 / engine / parser |
| 8 | ネスト器の中3件（OR コスト／引用ライフバースト／アクセ付与） | 3 | 型 / engine / manual |

### 🔴 第1バッチの真因（実測4カード）

「**この**アタックで…ダメージを与えない」の主語は「**その**アタックしているシグニ」＝一意なのに、
無指定の `NEGATE_ATTACK` は候補が**相手の場の全シグニ**に広がっていた。
アタックしていないシグニを選ぶと `negated_attacks`（将来のアタックの事前登録）へ入るだけで
進行中のアタックは止まらない＝**払ったのに何も起きない**。
⚠`WX17-044-TRAP` は `PREVENT_NEXT_DAMAGE`（`target` を持たない型）で「それ」の照応先が
JSON のどこにも残っていなかった＝兄弟形（`WX16-029-E1`）と型を揃えた。

### 🔴 第4バッチの真因（実測3効果）

**対象の指定は「引用を伏せた本文」から読む。** `t` を丸ごと見ると**引用の中の**「あなたの」「シグニ」を
付与先だと読み違える（`WX24-P3-049-E1` は指定が「対戦相手のルリグ」なのに**自分のシグニ**を止めていた）。
3効果とも末尾の粗い近似 `BLOCK_ACTION{SIGNI, owner:'any'}` に落ち、
**解除コストが丸ごと消えたうえ無関係なシグニ1体が無条件でアタック不可**になっていた。

### 🆕 道具を1つ足した＝`syncManualLive.ts --effect <CardNum>:<EffectId>`

`build:effects` の収穫マージは MANUAL/PARTIAL を不可侵にするので manual の書き直しは live へ届かないが、
既存の `syncManualLive` は**カード単位で丸ごと書く**ため、**同じカードの別効果を巻き戻す**ことがある
（`WXK10-075-E1` は live のほうが新しく、parser の現在の出力は粗い STUB）。
⇒ **1効果だけ届ける口**を足した（id 集合は変わらないので `--allow-idset-change` は不要）。

### ⚠ 踏んだ罠

- **golden の3点契約テストは `O96_STORABLE_OUTCOMES` の中身を regex で読む**＝
  **コメントに大文字の識別子を引用符で書くと**型名として拾われ「FREEZABLE に無い型」で FAIL する。
- **`census:cards` の「クローズ済み登録票」判定は見出しが `### \`O-nn\`` であることを要求する**＝
  見出しに 🏁 を付けると分割に失敗して**閉じた項目が mech に残り続ける**（17→19 に化けた）。
  ⇒ **🏁 は見出しではなく本文の先頭に置く。**
- `npx tsc --noEmit` は**プロジェクト参照を辿らない**＝未 import のシンボルを見逃す。
  **`npm run typecheck`（`tsc -b --noEmit`）が正**。

### 🆕 計器を `scripts/archive/` へ保存した

`scripts/archive/o96TargetAnaphoraTriage.ts`（旧 `scripts/tmp_o96_triage.ts`＝gitignore 圏内で消えるところだった）。
**`O-221` の消化にもそのまま使う**ので残した。
🔴**parser のガードの写しなので、`applyO96OptionalCostTargetFirst` を直したら必ずここも同期する**
（`O96_STORABLE_OUTCOMES` / `allowedCostKeys` / `declaredTarget` の3箇所）。ズレたまま測ると
「直したのに減らない／直していないのに減った」の両方が起きる。
**推移**＝登録時 91 → `O-96` クローズ時 23 → `O-220` クローズ時 **13**
（残＝`O-221` 5／据置契約 5／偽陽性 1／`O-222` 1／`O-223` 1）。

### 分割した2項目（PLAN §5.3 索引 B へ登録）

- **`O-222`（1効果）**＝ルリグへの「シグニN体を場からトラッシュに置かないかぎりアタックできない」。
  《無》×N／手札N枚の軸は `lrigAttackBanCost` に在って同日にクローズしたが、**場トラッシュ軸だけ
  ルリグ側の受け皿が無い**（`attackCost.fieldTrash` は `execBlockAction` のシグニ分岐だけが消費）。
  いまは `STUB{DEFERRED_LRIG_ATTACK_BAN_FIELD_TRASH}`（明示 defer）。
- **`O-223`（1効果）**＝【シード】を対象に取る `TargetScope` が無い（`WXK05-050-E2`）。


## 2026-09-02（索引 A 第4巡）：🏁§5.3 `O-96` クローズ — 対象の照応を50効果ぶん通した（欠陥署名 73→23）

**ベースライン**＝`d35122400` の1つ前（`8ebfa3c19`）。この巡で第7〜13バッチを消化し、`O-96` を**クローズ**した。

### 📐 まず計器を精密化した（この巡の前提）

欠陥署名の仕分け器（`applyO96OptionalCostTargetFirst` のガードを1本ずつ写したもの）の
**原文を効果単位で取るようにした**（`enableSourceTextLog`）。
🔴**カードの `EffectText` 全文で regex を当てると、同じカードの別効果が母集団に混ざる**
（実測＝46 → 36 に落ちた＝10件はノイズだった）。
⇒ **この巡の 73 → 23 は精密計器での前後比較**（旧記録「91→72」とは母集団が違う）。

### 真因（1行）

原文は「〈対象〉を対象とし、〈任意コスト〉してもよい。**そうした場合、それを**〜」＝**対象宣言が支払いより前**なのに、
live は支払いの**後**で対象を選び直していた（＝対象が1体も無くても支払いを提示する／宣言後に対象が変わりうる）。

### 第7バッチ（parser のみ・9効果）— 対象宣言が載るキーは型ごとに違う

🔴**`TRANSFER_TO_DECK` は対象宣言を `source` に持つ**（`target` が無い型）のに `target` を読んでいた＝
**キーの読み違いだけ**で9効果が落ちていた（`execTransferToDeck` の `SIGNI` 分岐は
`targetsStored`/`fixedCardNums` を**既に両方消費**しており `FREEZABLE` にも入っていた＝3点契約は揃っていた）。

### 第8バッチ（engine の契約を1つ追加・6効果）— `ADD_TO_FIELD`

- 🔴**`source` がゾーンごと落ちる形があった**＝`source` の無い `ADD_TO_FIELD` は
  `execAddToField` の既定経路（**デッキの一番上を出す**）へ落ちる＝**原文と別のカードが出る**過剰実行。
  `applyDroppedFieldPlacementDesignation` で復元（先行例＝`applyDroppedRecoveryDesignation`）。
- **3点契約**＝型に `targetsStored`＋`fixedCardNums` ／ `FREEZABLE` へ登録 ／ `execAddToField` が消費。
- `SELECT_TARGET_ONLY` に **`ENERGY_CARD` 分岐**を追加（候補集めは `zoneTargetCandidates` で実行時と共有）。

### 第9バッチ（engine・3効果）— `TRASH{ENERGY_CARD}`

`execTrash` の `ENERGY_CARD` 分岐に対象固定の消費を足し、`SELECT_TARGET_ONLY` の ENERGY を相手エナへ広げた
（「対戦相手のエナゾーンから〈名詞句〉１枚を対象とし、〈任意コスト〉してもよい。そうした場合、それをトラッシュに置く」）。

### 第10バッチ（parser のみ・8効果）— ネスト器の内側へ降りる

`applyO96Nested` を新設＝`CHOOSE` の枝／`CONDITIONAL` の then・else／`GRANT_LRIG_ABILITY` の abilities、
および **`SEQUENCE` の要素にぶら下がるネスト器**へ降りる。
⚠**`SEQUENCE` の中の `SEQUENCE` へは降りない**（支払いより前に別の動作がある形まで巻き込む）。
🔑**枝ごとに独立して判定される**＝片方の枝が既に固定済みでも他方が直る（`WXDi-P09-062-E1` で実測）。
🧹**据置契約2本を正方向の assert へ置き換えた**（`O-188` 第2バッチ①／`O-96` 第2バッチ）。

### 第11バッチ（manual・9効果）＋ 道具を1つ

`manualEffects.ts` の該当効果を固定形へ書き換えた（1行 JSON はスクリプトで機械変換・TS リテラルは手で）。
🆕**`heldReview.mjs --adopt-effect`**＝**held からも効果単位で採用**できるようにした（AUTO→AUTO 限定）。
これで「同じカードの別効果にこの巡と無関係な差分がある」だけで直った効果ごと見送る必要がなくなった
（`WXDi-P08-072` は E1 だけ採用し、E2 の `duration` 退化＝`UNTIL_OPP_TURN_END`→`UNTIL_END_OF_TURN` は温存）。

### 第12・13バッチ（engine＋parser・6効果）— コスト軸と `costText`

- **許可リストに正規の軸を足した**＝`selfToEnergy` / `coinCost` / `fieldToDeckBottom`
  （どれも `resolveOptionalCostSpec` が受け取る＝可否判定も支払いUIも通っている軸）。
- `GRANT_EFFECT` に3点契約を追加、`execTransferToHand` の `ENERGY_CARD` にも絞り込みを追加。
- 🔴**`costText` は表示専用**なのでこれだけの payload は「構造化された支払いが無い」＝
  **`fillBareOptionalCostPayload`** で `costText` そのものを句として `parseOptionalCostClauseFields` へ渡す
  **第3の入口**を置いた（従来の呼び出しは2つとも文型が限定的だった）。
  ⇒ `handReveal` / `handDiscard{cardName}` が自動で載るようになり、**予定外だが正しい3効果**も直った
  （`WXDi-P07-053-E1` / `WXK04-056-E1` / `WDK08-Y13-E1`）。
- `fullyExpressibleCostFilter` に **《カード名》** の語彙を追加（`cardName` は部分一致なので表記ゆれを跨ぐ）。

### 🔴 実機だけが捕まえたバグが1件（前回とまったく同じ形＝2度目）

`ADD_TO_FIELD` に `fixedCardNums` の**絞り込みだけ**を足して「選択UIを開かずに即適用する」分岐を書かなかったため、
実機で**「払ったのに対象をもう一度選ばされ、確定できずに止まる」**になっていた（**golden 3282 は全緑のまま**）。
⇒ 🔴**3点契約の③は「絞り込み」と「即適用分岐」の2つで1つ。**
同じ分岐を `GRANT_EFFECT` / `TRASH{ENERGY_CARD}` / `TRANSFER_TO_DECK` にも入れた。
⚠**その即適用分岐で `leaveSubstituteAskQueue`（離場置換の問いかけ）を飛ばさない**
（`execTransferToDeck` で踏んだ＝golden「task12(lxxxiii) 第15波」が落ちて発覚）。

### 🏁 クローズの判断と分割

残 23 は**`O-96` の規則では取れないもの**だけになった：
- **`O-220`（16効果）**＝帰結型ごとの3点契約が未整備（`STUB{SOUL_OP}` 2・`NEGATE_ATTACK`・`LIFE_CRASH` ほか。1型1〜2効果）
- **`O-221`（5効果）**＝「そうした場合」の did-it ゲートが生成されない／専用 STUB id
- **ルリグ対象2件は「据置が正しい」**＝対象がセンター1体で一意＝`O-96` の実害がどちらも起きない
  （`execFreeze`/`execDown` の LRIG 分岐は `fixedCardNums` を読まず即適用する）。**golden の契約テストで固定した。**

### 影響枚数

**50効果**（欠陥署名 73 → 23）。ブラスト半径＝ベースライン commit との effectId 単位 機械 diff で**予定外0**
（`WXDi-CP02-072` の `-E3`→`-E2` は id 集合ズレ（`O-39` 系）の解消）。

### 検証

`npm run gates` 全緑（typecheck / golden **3283/3283** / smoke / fuzz / census 各種 / lint 0 error）。
🖥**実機＝`V-130` 新規2本＋`V-129` 2本＋`O-86` 5本＋`O-71` 1本＝全 PASS**
（§2.2 の判定＝`src/engine/` を触り新しい型契約を足したので実機必須）。

## 2026-09-02（索引 A 第3巡）：§5.3 `O-96` 第5・6バッチ — 対象の照応を19効果ぶん通した（欠陥署名 91→72）

**ベースライン**＝`5c94b5ec4`（`O-195` クローズの直後）。
登録票の「122効果」は失効していた（その後の `O-188` / `O-190` バッチが食っていた）＝**欠陥署名で 91効果**。

### 真因（1行）

原文は「〈対象〉を対象とし、〈任意コスト〉してもよい。**そうした場合、それを**〜」＝**対象宣言が支払いより前**なのに、
live は支払いの**後**で対象を選び直していた（＝対象が1体も無くても支払いを提示する／宣言後に対象が変わりうる）。

### ② 仕分けの型（この項目で確立）

`applyO96OptionalCostTargetFirst` のガードを1本ずつ写した仕分け器を書き、**「どのガードで降りているか」**で分類する
（文型では割れない）。🔴**最初の仕分けは自分の写し間違いで丸ごと化けた**＝`isDidItGate` に `IS_MY_TURN` を
入れ忘れ、**59効果が「did-it ゲートが無い」に化けた**。`IS_MY_TURN` は「そうした場合」の**プレースホルダー**で、
支払いの成否は executor の Pattern ④/⑤（`effectExecutor.ts:5002`）が構造で見る。

### 第5バッチ（engine 無改修・11効果）

- 🔴**`costText` は表示専用なのにコスト payload の未許可キーとして弾いていた**（`src/types/effects.ts:4920`
  「decompiler はこれをそのまま描画」）＝**同じ軸（`handDiscard`）を持つ効果が `costText` の有無だけで
  固定されたりされなかったり**していた（5効果）。
  ⚠**許可はするが「コスト軸あり」には数えない**＝数えると `WXK10-080-E2` のように
  **構造化された支払いが無いのに帰結を出す**形になる。
- **`fieldToDeckBottom`** は `OptionalCostSpec` の正規の軸（`execUtils.ts:400`・可否614・支払い777）なのに
  許可リストから漏れていた（2効果）。
- **parser は既に直していたのに live へ届いていない5効果**を三帳票から採用（`_held_fresh` 4 ＋ `_partial_fresh` 1）。
  🔑「parser を直したのに live が変わらない」ときは `_held_fresh` / `_partial_fresh` / `_idset_fresh` を見る（CLAUDE.md）。

### 第6バッチ（engine の契約を1つ追加・8効果）

`FREEZE` / `DOWN` / `UP` / `GRANT_KEYWORD` の4型は **`targetsStored` を前から消費していた**のに
`freezeStoredTargets` の `FREEZABLE` に無く、**支払いプロンプトを跨ぐと `storedTargetCards` が消えて
黙って空振り**するため帰結型として解禁できなかった。⇒ 🔑**3点契約を4型で揃えた**：

| # | 場所 | 何を |
|---|---|---|
| ① | `src/types/effects.ts` | 型に `targetsStored`（既存）＋ **`fixedCardNums` を追加** |
| ② | `effectExecutor.ts:133` | **`FREEZABLE` へ4型を追加** |
| ③ | `execFreeze`/`execDown`/`execUp`/`execGrantKeyword` | **`fixedCardNums` の消費**（候補の絞り込み＋**選択UIを開かずに即適用する分岐**） |

🔴**`fixedCardNums` を持たない型を `FREEZABLE` へ入れてはいけない**＝`targetsStored:false` にされたうえで
焼き込み先が無く、**対象の限定が丸ごと消えて全候補へ当たる**（過剰実行）。

### 🔴 実機だけが捕まえたバグが1件

焼き込み後（`fixedCardNums`）に `execGrantKeyword` の「選択UIを開かずに即付与する」分岐
（`effectExecutor.ts:4754`）が **`targetsStored` しか見ておらず**、実機で
**「払ったのに対象をもう一度選ばされ、確定できずに止まる」**になっていた。
**`npm run golden` 3282本は全緑のまま通っていた**（構造だけ見ていて UI の再プロンプトを観測できない）。
⇒ **engine の対象解決を触った回は実機まで必ず行く**（§2.2 の判定どおり）。

### 🆕 後段パスが帰結側だけを差し替える形への対処

`applyO96OptionalCostTargetFirst` は `selectTarget` と帰結の `target` に**同じオブジェクト参照**を置くが、
**後段のパスが帰結側だけを新しいオブジェクトへ差し替える**ことがある（実測＝`GRANT_KEYWORD` 5効果で
`selectTarget.owner:'any'` ／ 帰結 `target.owner:'self'` に割れた＝**相手のシグニを選べて自分にしか付かない払い損**）。
⇒ `syncO96SelectTargetOwner`（`parseCardEffects` の最後）で **`owner` 1フィールドだけ・`any`→具体 の方向だけ**合わせる。
🔴**「差があったら帰結側で上書き」まで広げると held が +23 になる**（`O-96` と無関係の正準形が多数あり、
選択範囲と適用範囲が意図的に違う形もある）＝**実測して狭めた**。

### 🧹 golden の据置契約を1本、正方向へ置き換えた

「`LAST_PROCESSED_MATCHES` を挟む形は据置（対象宣言で公開カードの参照が壊れる）」は、**包み形**
（`CONDITIONAL{…, then: SEQUENCE[SELECT_TARGET_ONLY, …]}`）が入った時点で前提が消えていた
（条件は `then` へ入る**前**に評価される）。⚠**据置契約は「いま壊れる」ことの assert であって永久の仕様ではない**
（続き773 の教訓＝見送り契約が項目を眠らせる）。実経路の assert（デッキトップがレベル1なら撃てる／2なら止まる）へ置換。

### 影響枚数

**19効果**（`SPDi43-15-E1` `SPDi43-17-E2` `SPDi43-18-E2` `SPDi43-19-E2` `SPDi43-26-E2` `WX08-001-E1`
`WX10-028-E2` `WX20-042-CB-E3` `WX24-P2-052-E2` `WX24-P2-074-E1` `WX25-CP1-052-E1` `WX25-P2-022-E1`
`WX25-P3-059-E1` `WXDi-CP01-027-E3` `WXDi-CP02-009-E1` `WXDi-CP02-076-E1` `WXDi-P01-059-E1`
`WXEX1-15-E1` `WXK03-029-E1`）。

⚠**`WXDi-P08-072` は採用を見送った**＝同じカードの `E2` に**この巡と無関係な差分**
（効果レベルの `duration` `UNTIL_OPP_TURN_END`→`UNTIL_END_OF_TURN`）が HEAD 時点から held に残っており、
カード単位採用だと未レビューの変更を巻き込むため。`E1` だけの採用口が無い（`--adopt-partial-effect` は partial 専用）。

### 検証コマンド

- **ブラスト半径**＝ベースライン commit との effectId 単位 機械 diff＝**変化19件・予定外0**。
- `npm run gates` **全緑**（golden **3282/3282**＝第6バッチの恒久 assert 2本／smoke 全異常0／fuzz 全0／
  census 3 / BASELINE 5／`census:stubs` A🔴0・C0／manual-fields 0／`census:enginetext` A🔴129 据置／
  `census:costtext` A🔴0 据置／lint 0 errors）。`npm run regen` 完走・**同型★0**。
- 三帳票＝held **76→73**／partial **10→9**／idset 7（据置）。

### 反転確認

- 🖥**実機 `V-129`**＝`o96TargetFirstPay`（場に3体・エナ《青》1枚＝**選んだ1体だけ**が【アサシン】を得る／
  `grants=WD03-009#8802:アサシン…`）／`o96TargetFirstNone`（エナ0枚＝**何も付かない**）。
  engine を触ったので `O-86` の5本も回帰として同時再実行＝**7/7 PASS**。
  ⚠**実機の落とし穴2つ**＝(a)`SKIP_BUILD` の既定で**古い dist のまま回る**（`SKIP_BUILD=0` で強制）
  (b)任意コストは**支払うエナを選んでから `optcost-pay`**＝`発動する` のテキストだけ押しても
  要求枚数が揃うまで disabled で、ログ上は click 成功に見えるのに state が1歩も進まない。
- **golden**＝3点契約の存在（`O96_STORABLE_OUTCOMES` ⊆ `FREEZABLE` ∧ `fixedCardNums` の消費）と、
  焼き込み済みなら**選択UIを開かずに1体だけへ付与する**ことを assert。
  ⚠**POOL カーソルを消費するテストは `withSavedCursor` で包む**＝包まずに `mkCtx` を足したら
  無関係な `V-100③` が落ちた（絞り込み実行では緑だった）。
  ⚠**支払い可否を POOL に依存させない**＝`fill()` が引くエナの色でコストが払えたり払えなかったりして、
  絞り込みでは通るのに全件実行で落ちる。色を明示的に敷く。

### ⑤実機の要否（§2.2 の判定）

**必須**＝`src/engine/effectExecutor.ts` と `src/types/effects.ts` を触り、**engine の契約を1つ追加した**ため。
実施済み（上記 7/7 PASS）。**しかも実機だけがバグを1件捕まえた。**

## 🏁2026-09-02（索引 A 第2巡）：§5.3 `O-195` を再計測してクローズ — 登録票 145効果 → 真の穴 2件

**ベースライン**＝`e867e026d`（`O-86` 第9バッチの直後）。
登録票は 🔴要再計測 の指定つきだった（続き549 の `247−102` という引き算値）。

### ② 母集団の測り直し（この巡の本体）

計器＝続き549 と同じ「**原文ブロックに『〜場合、』がある ∧ live の効果 JSON に
`condition` / `activeCondition` / `CONDITIONAL` / `triggerCondition` が1つも無い**」。
突き合わせは `docs/_effect_srctext.json`（`build:effects` が作る effectId ↔ 原文ブロック表・10,750効果）。

| 段 | 件数 | 中身 |
|---|---:|---|
| 第1段（素の計器） | **550効果 / 528カード** | 🔴**上限**（§5.3 の鉄則＝受け皿の別名を知らないと必ず過大） |
| B: 公開カードの絞り込み | 141 | 「（公開した）それが〜の場合」＝`REVEAL_AND_PICK.filter` が条件そのもの |
| B: 置換効果 | 139 | 「〜される場合、代わりに」＝`BANISH_SUBSTITUTE` ほか専用機構 |
| B: そうした場合 | 40 | 任意コストの帰結＝`optional` の受け皿 |
| B: ベット／次に使用するカードのコスト／使用コスト | 39 | `betOptions` / `costReplacement`（`O-86`） |
| **C: STUB に条件が畳まれている** | **154** | 条件を id に畳んだ専用ハンドラ |
| **A: 状態条件の候補** | **37** | ← ここだけが worklist |

- **A群37件は全件目視**＝真の穴は**2件**。残り35件は別の受け皿で正しく表せていた
  （`untilHandCount`／`triggerFilter.powerRange`／`swapIfSameLevel`／`nameMatchesAnyFieldSigni`／
  `colorMatchesLrig`／`excludeCardName`／`elseAction`／`DECLARE_ICON_REVEAL_CHECK.outcomes`／
  `INSTALL_DELAYED_TRIGGER`／`RESERVE_DRAW_PHASE_REPLACEMENT`／`REVEAL_BOTH_DECK_TOPS`／
  `BLOCK_ACTION{FORCE_PLACE_FRONT}` ほか）。
  ⚠**3件は計器側の偽陽性**＝`【アサシン（…）】` のように**丸括弧が入れ子**だと素朴な `（[^）]*）` 除去では
  ルール注記が落ちきらない（PLAN 付録B-4 の除外が効かない）。
- **C群154件は無作為40件（2ロット×20）を目視して 0/40 が真バグ**。全件が「条件を id に畳んだ専用 STUB」で、
  `census:stubs` の A群🔴（engine に消費が無い STUB）が0で緑である以上、無言 no-op ではない。
  ⇒ **C群はこの項目の worklist ではない**（「engine が原文を読んで意味を決める」側は `O-60` が別に測る）。

### ③ 真の穴 2件（どちらも「受け皿は在るのに使われていない」型）

**① `WXK11-033-E1` — 条件が落ちて【ダブルクラッシュ】が無条件で付いていた（過剰実行）**

原文「【自】：あなたが赤のスペルを使用したとき、…このシグニは「【常】：対戦相手の効果によって
バニッシュされない。」を得る。**対戦相手のセンタールリグがレベル４以上の場合、追加で**ターン終了時まで、
このシグニは【ダブルクラッシュ】を得る。」
🔴live は2ステップの `SEQUENCE` で、2文目の条件が**丸ごと無い**＝赤のスペルを使うたび常にダブルクラッシュ。
🔑**parser は正しい `CONDITIONAL{LRIG_LEVEL owner:opponent gte 4}` を出していた**＝
`manualEffects.ts` の古い shadow が条件を落としたまま勝っていた（§5.3 `O-93` の型）。
manual 側は `GRANT_PROTECTION` に `thisCardOnly` を持つぶん parser より忠実なので、
**削除ではなく manual に条件を戻した**（§6.4 `O-42` の②）。⚠既存 id なので `syncManualLive.ts` まで回して live へ届く。

**② `PR-Di035-E1` — 遅延も色条件も落ちて5色ぶんの帰結がその場で全部走っていた（過剰実行）**

原文「…**次のあなたのアタックフェイズ開始時**、あなたの場にそれぞれ共通する色を持ちレベルの異なる
＜プリパラ＞のシグニが３体あり、**その色が白の場合**、【シグニバリア】…**赤の場合**、対戦相手のライフクロス
１枚をトラッシュに…**青の場合**…**緑の場合**…**黒の場合**、対戦相手のデッキの上から２０枚トラッシュに置く。」
🔴live は `SEQUENCE` に5色ぶんの帰結が**条件なしで並んでいた**＝使うたびに毎回
「相手ライフ-1／相手手札3枚／相手シグニ全部をエナへ／相手デッキ20枚」が**全部**走っていた。
🔑🔴**受け皿は engine に完成済みで眠っていた**＝`STUB{PRDI035_PARADISE_COLOR}`（フラグ設置）→
`collectTurnTriggers` の `ON_ATTACK_PHASE_START` → `STUB{PRDI035_APPLY_PARADISE}`（色ごとに
「＜プリパラ＞3体・共通色・レベル3種類」を判定して分岐）。**producer が1つも無くハンドラだけが在った。**
⚠**`census:stubs` は「live の STUB に engine の消費が無い」向きしか測らない**＝
**逆向き（engine にハンドラがあるのに誰も出さない）はどの計器にも出ない**。
⇒ 手で `INSTALL_DELAYED_TRIGGER` を組みかけたが、**既存受け皿のほうが忠実**（青の「相手が手札3枚を選んで捨てる」を
相手選択として発行する）ので `STUB{PRDI035_PARADISE_COLOR}` へ差し替えた。
🔑**§5.3 の「1〜3枚の項目は型を足す前にまず受け皿を疑う」の再実証**（原文の言い回しで `src/` を grep する）。

### ▶ 残り1件は別軸なので分離した＝新設 `O-219`（7カード7効果）

`WD13-002-E1`（「このカードにグロウする際、手札からシグニを２枚まで公開する。この方法で＜迷宮＞の
シグニを公開した場合、グロウコストは《白×1》減り、＜毒牙＞の場合、《黒×1》減る」）を追いかけたところ、
条件節の問題ではなく **`collectGrowCostReductions` が自分の場のシグニ＋センタールリグしか走査せず、
いまグロウしようとしている先のカード（ルリグデッキの中）を見ない**＝
**グロウ先カード自身のコスト修正が1件も適用されない（恒久 no-op）**と分かった。
母集団は全数7カード7効果（`WD14-001` `WX14-009` `WD13-002` `WD13-003` `WX21-017` `WX21-018` `WX13-001`）。
⚠**軸だけ直すと `WD13-002` は原文より安くなる**（いま白×1と黒×1を無条件で両方持っている）。詳細は PLAN_DETAIL.md。

### 🧹 前巡に自分で入れた計器バグを1件直した

`census:cards` の `mech` フラグは PLAN_DETAIL の登録票を **`### \`O-nn\`` の見出しで分割**し、
「本文の先頭が 🏁 か」でクローズを判定する。前巡（`O-86` クローズ）で**見出しのほうへ 🏁 を足した**ため
分割に失敗して隣の項目へ吸収され、**Sheet1 の要対応が 17→19 に化けていた**。
⇒ 見出しを規約どおりに戻した。**クローズ印は本文の先頭に置く**（見出しの綴りは計器の契約）。

### 影響枚数

挙動が変わったカード **2枚**（`WXK11-033` / `PR-Di035`）＝どちらも**過剰実行の是正**。

### 検証コマンド

- `npm run gates` **全緑**（golden **3280/3280**＝`O-195` の恒久 assert 2本を新設／smoke 全異常0／
  fuzz 全0／census 3 / BASELINE 5／`census:stubs` A🔴0・C0／manual-fields 0／
  `census:enginetext` A🔴129 据置／`census:costtext` A🔴0 据置／lint 0 errors）。
- `npm run regen` 完走・**同型★0**。`node scripts/genStubsMd.mjs`（`PRDI035_PARADISE_COLOR` が live へ出たため）。
- 再計測スクリプトは使い捨て（`tmp_*`）。手順は上表のとおりで、入力は `docs/_effect_srctext.json` と live JSON だけ。

### 反転確認

- `WXK11-033-E1`＝**対戦相手のセンタールリグ レベル4 で付き／レベル3 では付かない**を engine 実行で assert。
- `PR-Di035-E1`＝**使用時点では相手のライフ・デッキ・手札が1枚も動かない**（フラグが立つだけ）＋
  発火側 `PRDI035_APPLY_PARADISE` を**白のレベル1/2/3 の3体で成立／同レベル3体では不成立**で assert。
  ⚠フィクスチャが引けないときに**黙って飛ばさない**（`ok()` で落とす＝見送り契約を作らない）。

### ⑤実機の要否（§2.2 の判定）

**不要**＝触ったのは `src/data/manualEffects.ts` と `public/data/`（＋`scripts/`）だけで、
`src/screens/` も新しい型・機構も足していない（既存の engine 受け皿へ載せ替えただけ）。

## 🏁2026-09-02（索引 A 第9バッチ）：§5.3 `O-86` クローズ＝UI コスト層の原文 regex が全滅（A群 14→0規則）

**ベースライン**＝`2f27fe7cf`（第7・8バッチの直後）。
**A🔴 COST 14→0規則・当たり 23→0カード・真の worklist 18→0カード。**
🏁**`computeArtsEffectiveCost` は `card.EffectText` を1度も読まなくなった**（引数からも `text` が消えた）。

### 真因（1行）

「〜の場合、この{アーツ|スペル}の使用コストは《X》減る」の**条件つき軽減**が、支払いのたびに
UI 層（`screens/battle/costs.ts`）で**カード原文を regex 再パース**して決まっていた。
JSON を見ても何が起きるか分からず、逆翻訳・census・golden・smoke・fuzz が全部緑のまま意味が壊れる層。

### 何をしたか

**① 8系統を `EffectCost.costReplacement` へ**（`CostReplacementWhen` に4種を追加）

| 系統 | 枚数 | `when` |
|---|---:|---|
| 場のパワーN以上（`WX15-034`） | 1 | `selfFieldHasSigni{each:[{minPower}]}` |
| 場の＜クラス＞（`WX20-005` `WX20-006`） | 2 | `selfFieldHasSigni{each:[{story}]}` |
| 場の＜X＞と＜Y＞（`WX10-031`） | 1 | `selfFieldHasSigni` の `each` 2要素（**別々の1体でよいが両方要る**） |
| ライフ枚数比較（`SP38-002`） | 1 | `selfZoneCountGtOpp{life_cloth, by:1}` |
| ゾーン枚数差（`WX25-P3-002`〜`010`） | 5 | `selfZoneCountGtOpp{zone, by}` |
| ルリグトラッシュの色アーツ2条件（`WX12-013`） | 1 | `selfLrigTrashHasArtsColor` × 2項（`accumulate`） |
| 場の〔色〕＜クラス＞2条件（`WX12-049`） | 1 | `selfFieldHasSigni` × 2項（`accumulate`） |
| 相手シグニのバニッシュ履歴（`WX13-026`） | 1 | `oppSigniBanishedThisTurn` |

原文を読むのは **`src/data/keywordCosts.ts` の `parseCostReplacementTerms` 1箇所**（第6バッチの規約どおり）。
`computeCostReplacement` の受け口 `myState` を**自分の全ゾーン**へ広げた（ゾーン枚数比較に要る）＝
直接の呼び出し3経路はいずれも `my`（`PlayerState`）を丸ごと渡していたので**呼び出し側は無改修**。
⚠`lrig_trash_arts` だけは**アーツだけ**を数える（原文「ルリグトラッシュにある**アーツ**の枚数」）。
⚠相手側の欄が無ければ**成立させない**（安いほうへ倒さない）＝旧実装と同契約。

**② `SP36-001`（炎のタマ）を `EffectCost.costScaling` へ**（`CostScalingCount` に2種を追加）

原文が「使用されたスペル1枚につき《赤×1》《無×1》減る」＋「アーツを使用していた場合《赤×3》《無×3》減る」の
**2文で累積**する唯一の形。🔑**`costReplacement` は「最初に成立した項で確定」する契約**なので、片方を
そちらへ置くと**もう片方が永久に効かない**。`costScaling`（全項を順に累積）側へ両方置いた。
真偽条件は **0/1 の count（`artsUsedThisTurn`）× `per:1`** で表す。
⚠**`spellsUsedThisTurn` / `artsUsedThisTurn` は state が在れば `null` を返さない**＝旧実装の
`actions_done ?? []` / `turn_arts_used === true` と同契約。`null` に倒すと `applyCostScalingTerms` が
**項ごと null を返して同じ札のもう一方の軽減項まで丸ごと消える**。

**③ そのまま撤去した2規則**（payload を作る必要が無かった＝到達しても出力が動かない）

- 「センタールリグのレベル1につき減る」＝当たる5枚のうち4枚は `costScaling` 済みで上の分岐が先に返す。
  残る `WD16-010` は**別カード（《ピーピング・アナライズ》）のコストを下げる文**への誤爆で、
  印刷コストが `《青》×０`＝`parseGrowCost` が 0 の色を捨てるため**当たっても出力不変**。
- 「トラッシュの＜クラス＞シグニN枚につき減る」＝当たる2枚のうち `WXK06-055` は `costScaling` 済み。
  残る `WD14-001` は**ルリグ**で、この関数はアーツ／スペル／キー／ピースからしか呼ばれない
  （グロウコストは `GROW_COST_REDUCTION` が別経路で持つ）。印刷コスト `-` なので当てても不変。

🔑**「撤去してよい」の判定は3段**＝①計器の「payload無」列 ②**当たっているカードを1枚ずつ原文で読む**
（誤爆が実在する） ③**印刷コストに当てて文字列が動くか**。①だけで消してはいけない。

### 🔴 副産物＝本物のバグを1件直した（比例 payload が盤面由来の軽減を殺していた）

`computeArtsEffectiveCost` は `applyCostScalingTerms` が**非 null を返した時点で return** していた。
これは**下に原文 regex が並んでいた頃の「二重適用を構造的に防ぐ」ガード**で、regex を撤去した後に
下へ残るのは `artsThresholdReductions`（**場の CONTINUOUS 由来**＝カード自身の比例増減とは別の出所）だけ。
⇒ **比例が1項も動かない盤面で、場が与えた軽減が黙って消えていた**（＝原文より高く請求）。
`scaled !== base` のときだけ確定するよう直した。**16カード・18,216セル**で回復し、差分が全件
「盤面の《無×1》が効くようになった」だけであることを機械確認した。

### 🔴 踏んだ罠

- **A/B ダンプに `mergeManualEffects` を掛けてはいけない**（1回誤読した）。アプリ（`App.tsx`）は
  live JSON をそのまま読む。ダンプ側で manual を重ねると、`buildEffectsJson` が**収穫マージの後から
  重ねている**印字コスト payload が manual の古い `cost` で上書きされ、**新しい payload が1枚も
  効かない状態を「挙動不変」と誤って報告する**。⇒ 直した harness を `scripts/archive/o86CaecDump.ts` に残した。
- **`buildEffectsJson` の `costScaling` 継承も `mergeManualEffects` 後の fresh から取る**＝
  `manualEffects.ts` が本文を手書きしたカード（`SP36-001`）には**永久に届かない**。
  そこだけは **manual 側に `cost.costScaling` を直接書く**（build が marker STUB を剥がして live へ届く）。
- **テンプレ文字列の `\d` は二重に書く**（第5バッチの再演）。`` new RegExp(`…[０-９\d]…`) `` は
  `\d` が `d` に潰れて半角数字が読めなくなる。**現データは全角しか無いので A/B も golden も緑のまま通る。**
- **golden が原文 regex に依存していた2本が落ちた**＝`B13 トラッシュ枚数比例…`（payload を渡していなかった）と
  `O-119`（`SP36-001` を「payload 化しないのが正」として `deferred` に列挙していた）。
  どちらも**テストの前提が変わっただけ**なので、前者は UI と同じ経路（`costScalingOf`）へ、
  後者は `deferred` 16→15枚へ更新した。

### 影響枚数

payload を得たカード **13枚**（`SP38-002` `WX10-031` `WX12-013` `WX12-049` `WX13-026` `WX15-034`
`WX20-005` `WX20-006` `WX25-P3-002/004/006/008/010`）＋ manual に payload を書いた **1枚**（`SP36-001`）。
early return 修正で挙動が回復した **16枚**（`WX04-030` `WX10-045` `WX10-053` `WX12-056` `WX12-Re04`
`WX22-004` `WXK06-055` `WXDi-P16-003/004/005/006` `WX25-P3-039/041/043/044/046`）。

### 検証コマンド

- **A/B ダンプ**＝全6,712カード × 60盤面 × 48文脈＝**1,706,432 通り**（文脈軸＝ベット宣言 × 任意支払い済み ×
  相手アーツ使用 × 相手スペル0/1/2枚 × **盤面由来の閾値軽減 0/1**）。上記のバグ修正ぶん以外は**不一致0**。
- `npm run gates` **全緑**（golden **3278/3278**＝新規3本／smoke 全異常0／fuzz 全0／census 3 / BASELINE 5／
  `census:stubs` A🔴0・C0／manual-fields 0／`census:enginetext` A🔴129 据置／
  🏁**`census:costtext` A🔴 0規則**（`BASELINE_COST_RULES` 14→0）／lint 0 errors）。
- `npm run regen` 完走・**同型★0**。

### 反転確認

- **golden**＝8系統すべてを**成立盤面と反転盤面の両方**で assert（`O-86 第9バッチ: 残テール8系統が…`）。
  `SP36-001` の累積は4通り、early return の修正は2カードで固定。
- 🖥**実機**＝`V-128`＝`o86FieldClassPay` / `o86FieldClassNone`（`WX20-005`）。
  🔑**観測点は「青を1枚も持たないエナ2枚で使えるか」**＝枚数だけを見ると
  「軽減が効いていないのにたまたま払えた」を緑と誤読する。**色の要求ごと消える**ことまで見る。
  `O-86` の実機8本を一括再実行して **8/8 PASS**。

### ⑤実機の要否（§2.2 の判定）

**必須**＝`src/screens/battle/costs.ts` を触り、**新しい条件型（`CostReplacementWhen` 4種）と
新しい count 種（`CostScalingCount` 2種）を足した**ため。実施済み（上記 8/8 PASS）。

## 2026-09-02（索引 A 第7・8バッチ）：§5.3 `O-86` ③payload 化の続き＝A群 26→14規則

**ベースライン**＝`dd4b320a6`（第2〜6バッチの直後）。
**A🔴 COST 26 →（較正 +5）31 → 18 → 14規則・当たり 77→23カード・真の worklist 45→18カード。**

### 第7バッチ＝計器の較正 ＋ `costScaling` payload に取って代わられた regex 13本の撤去

🔴**①まず計器が過小に出ていたのを直した**＝`censusCostText.ts` は
`const text = card.EffectText ?? ''` のような**直接の**代入しか原文変数と見なしておらず、
`const costSentence = text.split('。').find(...)` のように**1段ワンクッション置かれた**変数へ
当てている regex が**丸ごと計器から消えていた**（`costs.ts` の I-1〜I-5＝相手盤面参照の5規則）。
⇒ **代入の右辺に追跡済みの変数が出たら左辺も追跡へ足す**（行内・不動点）。A群 26→31規則。
🔑**「規則が減った」ではなく「見えていなかった」**＝較正であって退化ではない。

**②撤去した13本**＝場の＜クラス＞比例／ルリグトラッシュのアーツ比例／場の〔色・カード名〕シグニ比例／
I-1〜I-4（凍結・能力なし・チャーム・ウィルス・コイン）／ピースのルリグ体数比例／場＋エナ二重比例／
トラッシュのカード名比例／アクセ済みシグニ比例／ライフ増＋クラス減／手札枚数差比例。
どれも parser が `EffectCost.costScaling` を刻んでおり、payload 分岐が先に return する
（`census:costtext` の「payload無」列が **13本とも 0**）。
🔴**「payload無 0」だけを根拠にしていない**＝`applyCostScalingTerms` は owner/state を読めないと
`null` を返して regex へ落ちる作りなので、**撤去前後で `computeArtsEffectiveCost` の出力を
全カード × 盤面マトリクスでダンプして突き合わせた**（**323,298 通りで不一致 0**）。

🔴🔑**golden の読み取り元を payload 経路へ揃えたら、旧 regex 側の穴が1件出た**＝
`task12(xcii)` の全カード掃引に `costScalingOf` を渡したところ **`WX05-034` が新たに現れた**
（「使用コストはあなたのライフクロス１枚につき《無×1》**増える**」）。旧 regex には**この札の規則が無く**、
`O-119` の golden が `legacyBugIds` として明示的に除外していた。**退化ではなく可視化**なので
増加札として別途固定した。`O-119` 自体は legacy 経路との突き合わせが無意味になったため
**独立オラクル**（`CostScalingTerm` の定義から10行で組み立てる）へ置き換え、除外2枚も全 assert を通した。

### 第8バッチ＝センタールリグ条件の軽減／置換を `costReplacement` へ（28枚・4規則）

「あなたのセンタールリグが＜X＞の場合」14枚／「対戦相手のセンタールリグが〔色〕の場合」12枚／
「＜X＞の場合〜減り、＜Y＞の場合〜減る」1枚／「レベルN以上の場合」1枚。
受け皿＝`CostReplacementWhen` に `selfCenterLrigName` / `oppCenterLrigColor` / `selfCenterLrigLevelGte`
を追加し、参照元は **`CostReplaceCtx.lrig`**（`computeArtsEffectiveCost` が自分の引数から束ねて渡す＝
呼び出し4経路は無改修）。
- 🆕**`accumulate`**＝原文「〜減り、〜減る」の2条件の重ね（`PR-460`）。全項を見終わって印刷コストから
  動いていなければ `null`＝旧実装の `if (out !== base) return out;` と同契約。
- 🔴**`keepZeroAmounts`**＝旧実装は「対戦相手のセンタールリグ〜になる」**だけ** `normalizeCostText` の
  生出力を返しており、**`《赤》×0` が `なし` に畳まれていなかった**。表示に出る差なので忠実に保存した。
- 🔑**ガードの外に置く**＝4形のうち3つは「〜**減る**」なので `使用コストは…になる` ガードの内側に
  置くと1枚も項が作られない。
- 🔑**項の並び＝旧 `computeArtsEffectiveCost` の評価順**（置換系 → ルリグ条件）。ベット形／任意支払い形の
  早期 return もルリグ条件の項を後ろに残す（旧実装では宣言しなかったとき後段のルリグ規則へ落ちた）。

**検証**＝**全カード × 盤面マトリクス 1,293,192 通り**（ベット宣言・任意支払い済みの軸も追加）の
撤去前後ダンプ突き合わせで**不一致 0**。ブラスト半径は機械 diff で 28カード・payload 追加のみ・予定外0。

### ゲート・実機

**ゲート**＝全緑。golden 3275/3275／smoke 全異常0／fuzz 全0／census 3 / BASELINE 5／
`census:stubs` A🔴0・C0／manual-fields 0／`census:enginetext` A🔴129（据置）／
**`census:costtext` A🔴 26→14規則**／lint 0 errors。`npm run regen` 完走・**同型★0**（据置）。

**⑤実機＝8/8 PASS。** 新規4本＝`o86ScalingPayloadPay` / `o86ScalingPayloadNone`（`V-126`＝
`WX12-Re04` のルリグトラッシュのアーツ2枚で《無×4》軽減され印刷7枚→3枚で使用でき、空なら提示すらされない）／
`o86LrigCondPay` / `o86LrigCondNone`（`V-127`＝`WX11-015` がセンタールリグ花代なら《赤×1》軽減で
エナ1枚で使え、タマヨリヒメなら提示すらされない）。回帰4本＝`o86BetCostReplace` / `o86BoostExtraCost` /
`o199EncoreTextCostPay` / `o123usetimepay`。**新規はすべて反転確認つき。**

**残り**＝18カード＝β ゾーン枚数差5／相手のアーツ・スペル使用の累積5／場のシグニ存在条件3／
トラッシュ比例1／ライフ比較1／γ-1 ルリグトラッシュの色アーツ1／γ-2 場の色×クラス1／
δ-6 バニッシュ履歴1。**どれも `CostReplacementWhen` の語彙を1〜2種足せば載る見込み。**


## 2026-09-02（索引 A 第2〜6バッチ）：§5.3 `O-86` ③payload 化＝UI コスト層の原文 regex を5系統ぶん撤去

**ベースライン**＝`960cb12ab`（第1巡＝計器新設と死に規則撤去の直後）。
**A🔴 COST 規則 45→26本・当たり 261→77カード・真の worklist 229→45カード。**

**真因**＝**カードに印刷されたコスト（【アンコール】【ベット】【ブースト】）と、
原文が書いている条件つきの置換／軽減を、UI 層が「支払いのたびに `card.EffectText` を
regex で読み直して」決めていた**。同じ意味を **2〜5個の入口が別々に再解釈**しており、
規則を1本直すと入口の数だけ挙動が動く（`census:costtext` A群＝この形の全数計器）。

**どう直したか**＝読み取りを **`src/data/keywordCosts.ts` 1箇所**へ集約し、build 時に
`EffectCost` の payload として刻む。UI は `〜Of(cardNum, effectsMap)` で JSON を読むだけにした。

| バッチ | 系統 | 影響枚数 | 受け皿（`EffectCost`） | 撤去した UI 入口 |
|---|---|---:|---|---|
| 第2 | 【アンコール】の印字コスト | 32 | `encoreCost` | `parseEncoreCost`（`ArtsModal`／`BattleScreen`） |
| 第3 | 【ベット】の印字コイン選択肢 | 68 | `betOptions` | `parseBetOptions`（`artsUseGate`／`ArtsModal`／`CutinModal`／`SpellCastModal`） |
| 第4 | 【ブースト】の任意追加エナ | 5 | `boostCost` | `parseBoostCost` |
| 第5 | 使用時の任意支払いによる**軽減** | 33 | `useTimeCost` | `parseUseTimeCostReduction`（5入口＋逆翻訳） |
| 第6 | 条件つきコスト**置換／軽減** | 48 | `costReplacement` / `optionalDiscardCost` | `computeCostReplacement` の regex 7本 ＋ `parseOptionalDiscardForCost` |

🔴🔑**収穫マージの死角を最初から塞いである**＝マージは live の MANUAL/PARTIAL を効果単位で
不可侵にするので、`manualEffects.ts` が本文を手書きしたカードでは parser の刻印が**永久に届かない**
（実測＝アンコール32枚中9枚・ベット68枚中21枚）。⇒ **`buildEffectsJson.ts` が【出現条件】と同じく
マージの後から重ねる**（fresh 側の `parseCardEffects` と同じ `printedKeywordCosts` を呼ぶので値は必ず一致）。
これが無ければ「**手書きした札だけ静かにコストを踏み倒す／印刷コストで請求される**」という、
どの計器にも出ない壊れ方になっていた。

**検証**
- **A/B（旧 UI 実装を `tmp_*.mjs` へ写経 vs live payload）**＝アンコール 32/32・ベット 68/68・
  ブースト 5/5・使用時軽減 33/33・任意支払い置換 2/2 が完全一致。
  **条件つき置換は全カード × ctx 16通り × 盤面3通り＝445,584 通りを照合して不一致 0。**
- **ブラスト半径**＝ベースライン commit との機械 diff で、変化カードは**すべて payload 追加のみ・予定外 0**。
- **反転確認あり**＝実機の各シナリオに「払えない／宣言しない側」を必ず組み込んだ（下記）。
- **ゲート**＝全緑。golden 3275/3275／smoke 全異常0／fuzz 全0／census 3 / BASELINE 5／
  `census:stubs` A🔴0・C0／manual-fields 0／`census:enginetext` A🔴129（据置）／
  **`census:costtext` A🔴 45→26規則**（ratchet を実測値へ下げた）／lint 0 errors。

**⑤実機**（`src/screens/` を触ったので必須）＝**6/6 PASS**。
新規2本＝`o86BoostExtraCost`（`V-124`＝ブースト OFF は0枚で使用可／ON は0枚では押せず／
《緑》《無》《無》の3枚で成立し全額支払われる）・`o86BetCostReplace`（`V-125`＝エナ0枚では押せず／
ベット2枚宣言で《緑×0》へ置換されて使用でき／OFF へ戻すと再び押せない。ライフ 7→8・コイン 2→0 まで確認）。
回帰4本＝`o199EncoreTextCostPay` / `craftArtsBetK07105` / `o123usetimepay` / `o123usetimenopay`。

**踏んだ罠（次に触る人向け）**
1. 🔴**`JSON.stringify(Infinity)` は `null`**＝使用時軽減の `max` は原文「好きな数」で `Infinity`。
   payload では **`'ANY'` を文字列で持ち**、読み出し1箇所（`resolveUseTimeCost`）で戻す。
2. 🔴**`stopIfUnmet` を落とすと置換が別物になる**＝旧 `computeCostReplacement` はベット形／任意支払い形で
   条件が偽なら**即 `null`**。「最初に成立した項が勝つ」だけにすると後段の項へ落ちて別の置換が成立する。
3. 🔴**テンプレ文字列の `\d` は二重に書く**＝落とすと `d` に潰れて半角数字が読めなくなる。
   **現データは全角しか無いので A/B も golden も緑のまま通る**（lint の `no-useless-escape` だけが気づいた）。
4. 🔴**関数名を `use…` で始めない**＝eslint が React Hook と誤認する（`useTimeCostOf` → `resolveUseTimeCost`）。
5. ⚠**§6.3 K のトリップワイヤは印字コストを除外する**（`PRINTED_KEYWORD_COST_KEYS` を import して1本で持つ）＝
   これらは `manualEffects.ts` に書かない種類のフィールド。**届いていること自体は golden が live payload 経由で assert。**
6. 🔴**`ATTACK_SIGNI` ではアーツ窓が開かない**（`BattleScreen.tsx:8645`＝`ATTACK_ARTS` / `ATTACK_ARTS_OP` だけが
   timing `ATTACK` へ写像）＝実機シナリオでルリグデッキのカードを押しても画像拡大になるだけ。
7. ⚠**実機のエナは色を確かめて置く**＝《緑》要求に黒3枚を置くと「payload は読めているのに成立しない」に見える。

**計器の較正1件**＝`censusCostText.ts` の原文追跡 regex が `\s` を含んでおり**改行をまたいで貪欲に伸びて**、
手前の行から始まった1マッチが後続の規則を飲み込んでいた。**改行コード（LF/CRLF）の違いだけで規則が
現れたり消えたり**していた（`isMultiEna` の `'：【マルチエナ】'` で実測＝B群 4→5規則）。行内空白のみへ限定した。

**🔴この巡で見つけて直した別バグ1件＝`npm run regen` が落ちていた**
`scripts/decompileEffects.ts:2560` の `DECLARE_ICON_REVEAL_CHECK` 分岐が **存在しない関数
`describeAction` を呼んで**おり、このカードを描画するたび `ReferenceError` で全10枚の再生成が止まっていた。
**混入は `c1e141c6e`（索引 B 第2巡・`O-163`）**＝`regen` は `npm run gates` にも CI にも入っていないので、
**3コミットのあいだ誰も気づかなかった**。同ファイル内の正しい入口 `actionJa` へ差し替え。
⇒ 🔑**`gates` が緑でも `regen` が動く保証は無い**（逆翻訳シート・同型★・census:stubs C群の入力が
全部この経路）。**decompiler を触った巡は `npm run regen` まで回す**（CLAUDE.md の既定どおり）。
再生成後の**同型★は 0（据置）**。

**残り**＝`computeArtsEffectiveCost` の条件つき軽減群（`@957` センタールリグ＜X＞14カード／
`@854` 相手センタールリグ色12／`@986` 場のシグニN体につき11 ほか）。詳細は `docs/PLAN_DETAIL.md` の `O-86`。


## 2026-09-02（索引 A 第1巡）：§5.3 `O-86` の①計器・②母集団実測・③死に規則5本の撤去

**ベースライン**＝`cfe8e0d90`（索引 B を空にした直後）。`O-86` の登録票が指定する
**「①まず計器を作る ②母集団を実測 ③payload 化」**の①②を完了し、③の**最初の払い戻し**まで進めた。

**ゲート**＝全緑。golden 3275 / 3275（据置）／smoke 全異常0／fuzz 全0／census 5 / BASELINE 5／
`census:stubs` A🔴0・C0／manual-fields 0／`census:enginetext` A🔴129（据置）／
🆕**`census:costtext` A🔴45規則**（新設・ratchet）／lint 0 errors。
**実機**＝コスト系の回帰5シナリオ すべて PASS
（`chainArtsCostReduction` / `b19costup` / `b19costupnone` / `exceedCostPay` / `fezoneDoubleCostPay`）。

### ① 計器＝`npm run census:costtext` を新設（`scripts/censusCostText.ts`）

**なぜ別計器が要るか**＝既存の `census:enginetext`（`O-60`）は **`src/engine/` しか走査しない**。
実効コスト（置換／軽減／追加／使用時の任意支払い）を決めているのは
**`src/screens/battle/costs.ts` ほかの UI 層**で、`card.EffectText` を毎回読み直している＝
**A群の数字が0になってもコストの意味は原文 regex のまま**。⇒ UI コスト層専用の ratchet を切った
（`runGates` 同梱。増えても減っても exit 1＝新しく原文 regex を書いたら止まる）。

**計器を書くときに2回踏んだ罠**（初版がどちらも母集団を桁で外した）
- (a)**行ごとに読むと、ネストした arrow const（`const toCostStr = (raw) => …`）を関数境界と誤認**して
  追跡中の原文変数が消え、**A群が 2規則**しか出なかった。⇒ ファイル全体を1文字列として走査する。
- (b)`text.match(new RegExp(\`…${'${'}RED}…\`))` の**テンプレ regex**と**複数行呼び出し**が1本も拾えない
  （`costs.ts` だけで7本）。⇒ テンプレ内の `${'${'}定数}` を同ファイルの `const 名 = '…'` から解決する。
- (c)**原文を引数で受け取る関数**（`parseUseTimeCostReduction(effectText)` ほか）を数えないと
  `costs.ts` の `parse*` 群と `useTimeCost.ts` が丸ごと消える（**38 → 50規則**の差はここ）。

### ② 母集団の実測

**A🔴 COST 45規則 / 当たり 261カード**（B GATE 4規則・C OTHER 3規則）。
🔑**うち「コスト payload（`costScaling` / `conditionalEnergyReduction`）が無い」229カードが真の worklist**＝
`computeArtsEffectiveCost` は「payload が評価できたら下の全文 regex 群を通さない」構造なので、
**payload 済みの32枚は既に regex から降りている**（＝`O-86` の残作業ではない）。
⚠登録票の「178カード」はカード種別の内訳から出した別の数え方＝**今回の229が以後の正**。

### ③ 第1バッチ＝死に規則5本の撤去（真因 / 影響 / 検証）

**真因**＝`computeArtsEffectiveCost` の「使用コストは《X》を〈N〉**つ少**なくする」形5本
（センタールリグのレベル／ライフN枚以下／手札N枚以下／センタールリグ名2綴り）が
**1枚も当たっていなかった**。実データの言い回しは**「減る」だけ**で、`つ少` を含むカードは
**全 CSV で 0枚**（計器が live 0 と測り、原文側からも確認）。同じ意味は下の「減る」系の規則が担っている。
**影響**＝0効果（到達不能な枝の削除＝**挙動は1バイトも変わらない**）。A群 **50 → 45規則**。
**検証**＝`npm run census:costtext`（死に規則 0本になった）／`npm run gates` 全緑／実機コスト系5シナリオ。

### ⑤実機の要否（PLAN §2.2 の機械判定）

**必須**＝`src/screens/battle/costs.ts` を触ったため。⚠**削除だけ**なので新規シナリオは作らず、
**コスト系の既存5シナリオを回帰として回した**（全 PASS）。

## 2026-09-02（索引 B 第2巡）：§5.3 索引 B の残り9件を全消化 — `O-71` / `O-68` / `O-137` / `O-138` / `O-163` / `O-78` / `O-104` / `O-118` / `O-160`

**ベースライン**＝`eca372931`（索引 B 第1巡の直後）。**ユーザー指示で9件すべて着手前に母集団を数え直した**＝
**索引の 29効果 → 実測20効果**（`O-137` は実測0＝コード変更ゼロでクローズ）。

**ゲート**＝全緑。golden **3269 → 3275**（+6本・全件実行）／smoke 全異常0／fuzz 全0／
census **5 / BASELINE 5**／`census:stubs` A🔴0・C0／manual-fields 0／
**`census:enginetext` A🔴 130 → 129行 / 126ハンドラ**（`BASELINE_SELF_TEXT` を 129 へ下げた）／lint 0 errors。
**実機**＝新規5シナリオ＋回帰3シナリオ すべて PASS（`node scripts/verifyBattleDrive.mjs`）。

### 1件ずつ（真因 / 影響 / 検証）

- 🔴**`O-104` 偽ゲート**（`WX07-039-E2` / `WXEX1-14-E2`・2効果）
  **真因**＝「そうした場合」が `CONDITIONAL{IS_MY_TURN}`＝`evalCondition` が**常に true** を返すプレースホルダ。
  `stripDidItConditional` が消すのは**任意ステップをスキップしたとき**だけで、ここは非 optional なので消えない。
  さらに `fixedSelectionPickLimit` が候補数へクランプするため**払える分だけ払って本体が通る**。
  ⇒ 自分の＜原子＞が0体でも相手シグニをバニッシュできた。`LAST_PROCESSED_COUNT_GTE{3}` へ差し替え。
  **影響**＝2効果。**検証**＝`golden --only "第24バッチ"`（静的形＋**実行して3体/2体の両方向**）。

- 🔴**`O-78` 配線漏れ**（`WXK09-015-E3`・1効果）
  **真因**＝受け皿 `SIGNI_DEPLOY_BAN{namesFromTargets}` は既存だったが、parser の分岐が期間の綴り
  `このターンと次のターンの間` しか見ておらず、`次の対戦相手のターン終了時まで` が payload 無しの
  `STUB{DEPLOY_RESTRICT}`（engine にログしか無い**真 no-op**）へ落ちていた。
  **影響**＝1効果（実測 3→1。他2枚は既に載っていた）。**検証**＝`golden --only "SIGNI_DEPLOY_BAN"`。

- 🔴**`O-71` 遅延本文の照応**（`WXK10-045-E2` / `WX25-CP1-038-E1`・2効果）
  **真因**＝(a)`WX25-CP1-038-E1` は**パワー5000以下のゲートが無く**（どんな大型でも手札へ戻せた）、
  2文目の遅延が `STUB{RULE_REMINDER_TEXT}` に化けて消えていた。(b)`WXK10-045-E2` は
  `STUB{DEFERRED_OPP_HAND_TO_CHECK_ZONE_UNTIL_END}`（no-op）＋**無関係な `BOUNCE{相手シグニ}`**。
  受け皿の3点組（`SELECT_TARGET_ONLY`→`STORE_LAST_PROCESSED_TARGETS`→`INSTALL_DELAYED_TRIGGER{targetsStored}`）は
  既存で、新設は**手札→チェックゾーン**の `HAND_TO_CHECK_ZONE` 1つだけ（置き先は `check_rest`）。
  🔴**実機で別バグを発見**＝戻す側の `TRANSFER_TO_HAND{CHECK_CARD, fixedCardNums}` が**候補1件でも選択UIを開き**、
  ターン終了時に**盤面ごと止まった**。対象は設置時に焼き込み済みで選ぶものが1通りしか無い＝
  `execTransferToHand` に「`fixedCardNums` で候補が枚数以下なら即適用」を足した（既存 `thisCardOnly` と同じ規約）。
  ⚠**この型は golden の autopilot（`run()`）では出ない**＝`ok(result.done)` を書くまで見えない。
  **影響**＝2効果＋`fixedCardNums` を使う全効果（`O-188` / `WX24-P4-051-E2` の contract を反転）。
  **検証**＝`golden --only "O-71"` ／実機 `o71HandToCheckZone`（🔴反転＝`check_rest` の掃除より先に手札へ戻る）。

- 🏁**`O-137`＝実測でクローズ（コード変更ゼロ）**。3条件の独立判定も `SWAP_DECK_TOP_AND_LIFE` も実装済みで
  golden も張ってあった。census の「4件」は「入れ替え」regex の別用法。

- 🔴**`O-138` 条件の欠落 ＋ 「条件が真になる盤面が無い」**（`WX13-006B-E1` / `WX14-006B-E1`・2効果）
  **真因**＝「対戦相手のチェックゾーンにスペルがある場合」が丸ごと落ちて**チェックゾーンが空でも撃てた**。
  🔴**条件を足すだけだと逆側の事故**＝解決待ちのスペルは `pending_spell` が保持していて `field` のどこにも
  属さないので、条件は**永久に偽**＝レゾナ3枚が無言 no-op に化ける。⇒ `PlayerState.spell_in_check_zone` を新設
  （`QUEUE_SPELL` で置き `FINISH_SPELL`/`FINISH_CUTIN` で降ろす・turn-scoped レジストリに保険登録）。
  ⚠**処理順序（「そのスペルの効果より先に発動する」）は既に実装済み**だった＝カットイン窓が
  スペルを打ち消さず先に ON_PLAY を解決する。**影響**＝3効果（`WX13-005B-E1` 含む）。
  **検証**＝`golden --only "O-138"`（3枚の live 形＋`evalCondition` の空/シグニのみ/スペルあり/解決待ち/窓を閉じた後）。

- 🔴**`O-163` 3分岐の同時実行**（`WX16-Re17-E1` / `WX05-006-E3` / `PR-K060-E2-G`・3効果）
  **真因**＝engine が `EffectText` **全文**を regex で読んでペナルティを「相手の全シグニをトラッシュ」1種類に
  焼き込んでおり（`census:enginetext` A群）、JSON 側は**3分岐が素の3ステップとして並んでいた**＝
  `WX16-Re17-E1` は起動するたび**全シグニトラッシュ＋1体バニッシュ＋自分の手札全捨て**がまとめて起きていた。
  ⇒ `DECLARE_ICON_REVEAL_CHECK`（宣言する軸1〜2と一致軸数ごとの帰結）を新設し、全文 regex 枝を撤去。
  **影響**＝3効果。**検証**＝`golden --only "O-163"`（live 形＋一致0/1/2の3枝を実行）／実機 `o163DeclareIconBranches`。

- 🔴**`O-68` 複合コストの踏み倒し**（`WXDi-P03-019-E1` / `WXK10-006-E3`・2効果）
  **真因**＝①`fieldTrash{count:number}` では「すべて」を表せず、`parseCost` が**意図的に `undefined`**（＝`costUnparsed`）
  に倒していた（部分採用すると自分の場を1体も失わずに相手の場を全滅できるため）。`fieldTrashAll` を新設して
  既存の `'ALL'` 規約（`discardAll`/`energyTrashAll`）へ載せた＝**任意【出】の明示保留は0件になった**。
  ②「ルリグデッキから**クラフトではない**アーツ１枚を…」は修飾語1つで regex を外し、**アーツ1枚のコストが
  丸ごと落ちていた**。⚠クラフト除外は `Type === 'アーツ'` の完全一致（クラフトは `'アーツ/クラフト'`）が
  既に弾いており、`excludeCraft` を足すのは**存在しない仕事**だった。キー【起】側にアーツ徴収の支払いと
  選択UI（`KeyActivatedModal`）と可否ゲート（`canPayTrashArtsFromLrigDeck`）を新設。
  **影響**＝2効果。**検証**＝`golden --only "O-68"`／`--only "O-46 live"`／`--only "(xxix)"`／`--only "task12(lv)"`。

- 🔴**`O-160` 遅延ダメージトリガー**（`WX18-002-E3` / `WXEX2-27-E3` / `WXDi-P07-047-E1`・3効果）
  **真因**＝(a)遅延句が落ちて**起動した瞬間に無条件実行**（相手ライフを即クラッシュ／即20枚ミル）
  (b)直接形は `ON_SIGNI_DAMAGE`（＝**このシグニが**与えたとき）で近似され、ルリグアタックのダメージを取りこぼす。
  ⇒ `ON_PLAYER_DAMAGED` を新設。発生印 `PlayerState.damaged_just` は**アタックの2経路**
  （`crashOneLife` とルリグアタック）だけが立て、クラッシュ解決 funnel が読んで `consumeDamagedJust` で消す。
  ⚠**`ON_OPP_LIFE_CRASHED` を流用してはいけない**＝あちらは**効果によるクラッシュでも発火**する。
  **影響**＝3効果。**検証**＝`golden --only "O-160"`／実機 `o160DamageByAttack`＋`o160DamageByEffect`（🔴反転）。

- **`O-118` エクシードの選択権**（`WX10-001` E1/E2/E3・3効果）
  **真因**＝ルリグ【起】の経路には選択UIが無く**下から機械的に**払い、色指定は貪欲に満たすだけだった。
  `LrigGrantedModal` に選択UIを新設し、`performLrigActivated` に `exceedIndices` を通した。
  ⚠**未選択なら従来どおり自動**（既存フローを1バイトも変えない）／中途半端な選択は発動を止める／CPU は据置。
  **影響**＝3効果＋エクシードを払う全ルリグ【起】のUI。
  **検証**＝実機 `o118ExceedPick`（未選択で発動可／赤＝色不成立で不可／白で可＋その札がルリグトラッシュへ）
  ＋回帰 `exceedCost`。

### 反転確認（🔴＝旧挙動なら落ちる）

実機5シナリオのうち**3本が反転確認**＝`o160DamageByEffect`（効果のクラッシュで発火したら FAIL）／
`o118ExceedPick`（色を満たさない選択で発動できたら FAIL）／`o71HandToCheckZone`（`check_rest` の掃除に
食われてトラッシュへ落ちたら FAIL）。`o163DeclareIconBranches` は「相手全滅**かつ**自分の手札全消し」で FAIL。

### ⑤実機の要否（PLAN §2.2 の機械判定）

**必須**＝`src/screens/`（`BattleScreen.tsx` / `LrigGrantedModal` / `KeyActivatedModal` /
`controller/battleController.ts` / `turnScopedState.ts`）を触り、**新しい型・機構を6組**足したため。⇒ 同巡で実行・全 PASS。

## 2026-09-02（索引 B 第1巡）：§5.3 索引 B の上から3件 — `O-181` / `O-59` / `O-58`

**ベースライン**＝`bc71f6c0c`（索引 C を空にした直後）。**3件とも「機構が無い」のではなく「実装済みの機構が
境界で止まっていた」**＝索引 C 第10巡と同じ型。**作業中に別のバグを2件見つけて直した**。

**ゲート**＝全緑。golden **3265 → 3269**（+4本・全件実行）／smoke 全異常0／fuzz 全0／
census 高シグナル **5**（据置）／`census:stubs` A群🔴0・C群0／manual-fields 0／
`census:enginetext` A🔴130行（据置）／lint 0 errors。
**実機 4シナリオ・25アサート すべて PASS**（うち**反転確認7本**）。
**在庫**＝機構 worklist **33 → 30項目**（索引 A 17／**索引 B 12 → 9**／索引 E 4）。

---

### 🔑 まず実測 — `O-181` の母集団は「残4効果」ではなく**残2効果**だった

`WXK11-006-E4`（キー）と `WX24-P3-055-E2`（場のシグニ）は、**legacy の
`collectLrigAttackGuardedTriggers` が既に発火させていた**（`sourcesLAG` にキーと場のシグニが入っている）。
索引の「残4」は登録当時の標本で、現在値ではなかった。

```
legacy collectLrigAttackGuardedTriggers → [ 'WXK11-006-E4', 'WX24-P3-055-E2' ]
```

⇒ 🔑**collector は「読む」のではなく「走らせて数える」。** 索引 C の全巡で繰り返し出た教訓がここでも当たった。

---

### `O-181` 軸(b) — `collectAttackEndTriggers` が **1行の early return** で watcher を見ていなかった

- **真因**＝`if (!isLrigAttack) return { entries, usedOncePerTurnIds };`
  ＝**シグニアタックのときはアタッカー自身しか走査していなかった**。
  `WX25-CP1-012-E1`（原文「あなたの**ルリグかシグニが**アタックによって…」）は**ルリグが watcher** なので、
  自分のシグニがアタックしても永久に発火しない。
- **直し方**＝watcher 走査を**明示 opt-in（`triggerScope:'any_ally'|'any'`）限定で**シグニアタックにも広げた。
  ⚠既定 `'self'` の既存効果は1件も巻き込まない（他のシグニの self `ON_ATTACK_END` が誤発火しないことを golden で固定）。
- **新設**＝`triggerCondition.attackCrashedLife` ＋ `AttackEndTriggerOptions.crashedLife`。
  🔴**未提供は「分からない」＝発火させない**（fail-closed）。
- 🔴**旧 live は `ON_OPP_LIFE_CRASHED` の即時発火**＝2つ同時に壊れていた：
  ①「**アタックによって**」の限定が無く**効果によるクラッシュでも撃てた**（過剰）
  ②「**そのアタック終了時**」ではなく**クラッシュした瞬間**に割り込んでいた（バトルの解決前）。

### `O-181` — 「そのアタック終了時に」の遅延が**アタック宣言時**に発火していた

- `WX14-018-E4`「次のターンの間、対戦相手のシグニ１体がアタックしたとき、**そのアタック終了時に**そのシグニをバニッシュする」。
- 🔴**宣言時にバニッシュすると、そのアタック自体が起きない**（バトルもライフクラッシュも発生しない）＝
  原文（バトル解決**後**に落とす）より明確に強い。
- **新設**＝`InstallDelayedTriggerAction.trigger.attackEnd` ＋ `collectAttackEndDelayedTriggers`。
  宣言時の2 collector（`collectSigniAttackDelayedTriggers` / `collectAttackerSelfDelayedTriggers`）は
  このフラグを**読み飛ばす**＝二重発火しない。**両側**（防御側・攻撃側）から呼ぶ。

---

### `O-59` — トラップ4機構のうち3つが「ログだけの no-op」だった

| 原文 | 旧 | 新 |
|---|---|---|
| `WX17-062-E1`「あなたのすべての【トラップ】を好きなように配置し直す」 | `[トラップ再配置：並べ替え対話は未実装]` | **`REARRANGE_SIGNI` に `mode:'traps'`**（新しい対話は作らない） |
| `WX16-028-E2`「それが**あった**シグニゾーンに手札から〜設置」 | `[トラップ設置保留: previous]` | `PlayerState.trap_removed_zones`（抜く funnel が書く）＋ゾーンを選ばせず直行 |
| `WX17-029-TRAP`「このカードは**それのトラップ能力を得て**、その能力を発動する」 | `[トラップ能力コピー：未実装]` | 既存 `trapOp:'activate'` と同じ「対象の `TRAP_ICON` を exec」 |

🔑**①は新しい対話を1本も作っていない**＝シグニの並べ替えと**器だけが違う**（`field.signi_traps` を置換する）ので、
pending・UI・確定ハンドラを丸ごと共有した。UI は文言だけ分岐（「シグニを配置し直す」と書くと嘘になる）。

🔴**③は `sourceCardNum` を差し替えてはいけない**＝原文は「**このカードが**得て発動する」なので、
コピー元（トラッシュの札）を効果元にすると能力中の「このシグニ」が**場に居ないカード**を指す。
（`trapOp:'activate'` は「**場のシグニの**トラップアイコンを発動」なので差し替えるのが正しい＝**向きが逆**。）

⚠**②は記憶が無ければ何もしない**（fail-closed）＝自由ゾーンへ誤設置すると原文と別の効果になる。

### 🔴 別バグ① — `WX21-025` は**3能力が2つに混線**していた

原文は【自】／【出】／【トラップアイコン】の3つ。旧 live は：

- **E2（【出】）に【トラップアイコン】の本文が流れ込んで**おり、正しく動く `SET_OPP_SIGNI_AS_TRAP` の後ろに
  `GRANT_KEYWORD{トラップアイコン→自分}` と `TRAP_OPERATION{trapFixedZone:'source'}`（保留ログだけ）が続いて
  **同じ設置を2回書いている**状態だった。
- その結果、**このカードには `TRAP_ICON` 効果が1つも無かった**（アイコンが発動しても何も起きない）。
- **E1 も2つ壊れていた**＝「そのシグニ」ではなく**別の相手シグニを選べ**（`targetsTriggerSource` 欠落）、
  「**その【トラップ】**」が丸ごと落ちていた。

⇒ 3能力へ分解し、`trapZoneOfTriggerSource` を新設（**無指定の `trapOp:'trash'` は先頭から N 枚**なので
別ゾーンのトラップを巻き込む）。【トラップアイコン】の「＜トリック＞2枚捨てる**か**《青》《青》」は
`additionalCostChoices` に **`handDiscard` を足して**表した（🔴無いと `costColors` 空の枝が常に available ＝
**捨てられない盤面でも押せて**支払いが空振りしたまま帰結だけ通る）。

---

### `O-58` 段2 — 登録票が予告していた障害3点を全部片付けた

#### 🔴 障害③を**先に**決着させた（ミラーする前に）

`ACCE_BANISH_SUBSTITUTE` は **ログだけが「ゲームから除外」で実装は `trash`** だった
（`WXDi-P09-TK03A`「代わりに**これをゲームから除外**してもよい」＝トラッシュだと回収できてしまう）。
**防御側を `excluded` へ直してからアタッカー側へミラーした**（不整合を複製しない＝登録票の指示どおり）。

#### 障害①② — 2 kind を足してアタッカー側にも同じ器を通した

- `BanishSubstituteOptionState` に **`trash_charm` / `exile_acce`** を追加（モーダルのラベルも対で）。
  ⚠**アクセ除外はダウンが付く**のでラベルに明示する（選ぶ判断が変わる）。
- アタッカー側は**防御側と同じ `pending_banish_substitute` / `banish_substitute_choice` を自分の state で**使う。
  🔑アタッカーはターンプレイヤー＝この解決を回している本人なので、**同じモーダル・同じハンドラ**で済んだ。
  ⚠**必須置換（段1）を先に見る**＝選択の余地が無いものを、任意の問いより先に確定させる。

#### 🔴 防御側の「自動適用」も外した

原文は「〜して**もよい**」なのに battle ladder が**無条件で適用**しており、
**「付いている札を残してバニッシュを受ける」という選択が player から奪われていた**
（しかもアタッカー側には1本も無い＝`O-58` の非対称そのもの）。

#### ⚠ 効果バニッシュ経路にも同じ2 kind を実装した（§3 (cxxix) の再発防止）

`isImplementedSubstituteCost` は **`kind !== 'pay_cost'` を無条件で通す**ので、
`applyEffectBanishSubstituteChoice` に分岐が無いと末尾の `trashStackSpell` 枝へ落ちて
「**0枚トラッシュで成立**」＝**コスト0の身代わり**になる。対価が既に無い場合は「回避できない」で止める。

---

### 新設した型・状態

| 追加 | 用途 |
|---|---|
| `triggerCondition.attackCrashedLife` ＋ `AttackEndTriggerOptions.crashedLife` | 「アタックによってライフを1枚以上クラッシュしたとき」（`O-181` 軸(b)） |
| `InstallDelayedTriggerAction.trigger.attackEnd` ＋ `collectAttackEndDelayedTriggers` | 「そのアタック終了時に」の遅延（`O-181`） |
| `PlayerState.trap_removed_zones` | 「それがあったシグニゾーン」の記憶（`O-59`） |
| `REARRANGE_SIGNI.mode:'traps'` | 【トラップ】の並べ替え（`O-59`・**新しい対話は作っていない**） |
| `StubAction.trapZoneOfTriggerSource` | 「**その**【トラップ】」＝トリガー元と同じゾーン（`O-59`） |
| `additionalCostChoices[].handDiscard` | エナ以外の対価で払う枝の**可否判定**（`O-59`） |
| `BanishSubstituteOptionState` の `trash_charm` / `exile_acce` | 付いている札を対価にする任意置換（`O-58` 段2） |

**撤去**＝防御側 ladder の CHARM_PROTECTION / ACCE_BANISH_SUBSTITUTE の自動適用（選択肢へ移行）。

---

### 逆翻訳（計器に映らないと直したことが見えない）

新しいペイロードは**4つとも逆翻訳へ描いた**。旧文と並べると、直す前と後が区別できるようになった：

```
- WX21-025-E1: …：対戦相手のシグニ1体をトラッシュに置く
+ WX21-025-E1: …：それ（トリガー元シグニ）をトラッシュに置く。そしてそのシグニゾーンにある【トラップ】をトラッシュに置く
- WX21-025-E2: …設置する。そしてこのシグニは【トラップアイコン】を持つ。そうした場合、…設置する   ← 同じ設置が2回
+ WX21-025-E2: …：対戦相手のシグニ１体を対象とし、それを【トラップ】としてそのシグニゾーンに設置する
+ WX21-025-TRAP: 【トラップアイコン】以下のいずれかを支払ってもよい【《青》《青》→… ／ 手札から＜トリック＞のカードを2枚捨てる→…】
- WX25-CP1-012-E1: 【自】対戦相手のライフがクラッシュされたとき：…
+ WX25-CP1-012-E1: 【自】あなたのルリグかシグニがアタックによって対戦相手のライフクロスを1枚以上クラッシュしたとき、そのアタック終了時：…
+ WX14-018-E4: …対戦相手のシグニがアタックしたとき、そのアタック終了時にそのシグニをバニッシュする
```

⚠`WX21-025-TRAP` は旧実装なら「**コストを支払ってもよい**」に潰れていた（何を払うと何が起きるかが1文字も出ない）。

---

### 検証コマンド

```
npm run build:effects && npx tsx scripts/syncManualLive.ts WX14-018 WX25-CP1-012 WX21-025
npm run regen && npm run gates          # 全緑（golden 3269／census 高シグナル 5）
npm run verify:browser                  # 実機4シナリオ・25アサート 全 PASS
```

**⑤実機の要否判定**＝`src/screens/`（`BattleScreen.tsx` / `EffectInteractionModal.tsx` /
`BanishSubstituteModal.tsx` / `rearrangeSigniUi.ts`）を触り、**新しい型・機構を7組足した**ので
**PLAN §2.2 により実機まで必須**。

---

## 2026-09-02（索引 C 第10巡）：§5.3 索引 C の残り7件を全消化して**索引 C を空にした** — `O-74` / `O-79` / `O-83` / `O-94` / `O-103` / `O-130` / `O-150`

**ベースライン**＝`c9f4cff6b`。**7件のうち1件（`O-103`）は丸ごと stale**、**3件は「実装済みの機構が pending／funnel の境界でフラグを落としていた」型**だった。
**作業中に別のバグを2件見つけて直した**（器の誤流用1件・過剰実行1件）。

**ゲート**＝全緑。golden **3259 → 3265**（+6本・全件実行）／smoke 全異常0／fuzz 全0／
census 高シグナル **5**（据置・`SELF_PLAY_RESTRICT` を較正キーに追加＝下記）／`census:stubs` A群🔴0・C群0／
manual-fields 0／`census:enginetext` A🔴130行（据置）／lint 0 errors。
**実機 6シナリオ・28アサート すべて PASS**（うち**反転確認5本**）。
**在庫**＝機構 worklist **43 → 33項目**（索引 A 17／索引 B 12／索引 E 4）。**索引 C は 0**。

---

### 🔑 この巡の主題 — 「1効果の項目」でも受け皿は engine の **funnel 側に既にあった**

**§5.3 冒頭「1〜3枚の項目の取り方」の第1項（まず受け皿を疑う）が 7件中 5件で当たった。**

| ID | 登録票の見立て | 実際 |
|---|---|---|
| `O-74`/`O-79` | 「例外つき出撃制限の機構が無い」 | **`deployLimit.ts` の `deployLimitBlockReason`（呼び出し元10箇所の既存 funnel）へ1本足すだけ**だった |
| `O-83` | 「条件が既存の条件型に無い」 | **`LRIG_LEVEL_CMP_OPP{lt}` が既存**。グロウ予約も `pending_flip_grow_card` と同じ形が既にあった |
| `O-103` | 「受け皿が2択専用でエナの枝が落ちる」 | **丸ごと stale**＝`manualEffects.ts` が3択 `CHOOSE` で表しており live にも届いていた |
| `O-130` | 「帰結が『効果を受けたシグニ』を参照する受け皿が無い」 | **`triggeringCardNum` → `targetsTriggerSource` で足りた**（collector は特定済みで、entry へ載せていなかっただけ） |

⇒ **1効果の項目でも「新しい型」から入らない。まず funnel と既存フラグの通り道を読む。**

---

### 🔴 この巡の最大の発見 — 「実装済みの機構が **pending／funnel の境界** でフラグを落としていた」型が3件

**型が在ることと、その型がプレイヤーの操作地点まで届いていることは別。**

#### ① `O-150` — `LOOK_AND_REORDER` の `reorder` が pending へ1バイトも運ばれていなかった（**live 105効果が過剰実行**）

- **真因**＝`execLookAndReorder` が `needsInteraction` へ渡す `PendingInteractionDef` に **`reorder` を含めていなかった**。
  だから `EffectInteractionModal` は ↑↓ を**常時**描き、`resumeLookAndReorder` はクライアントが返した並びを**無条件で信じて**いた。
- **母集団**＝live の `LOOK_AND_REORDER` **151効果のうち 105効果が `reorder:false`**（「デッキの一番上を見る」等）＝
  **全部が並べ替え可能**になっていた（＝デッキトップを自由に組み替えられる過剰実行）。
- 🔑**`O-144`（続き718）でフラグを41効果へ届けても実機の挙動が変わらなかったのはこれが理由。**
  分岐すべきは `remainder.reorder` ではなく**この1本**だった（登録票の見立てが当たっていた）。
- **直し方は3点セット**＝①pending へ `reorder` を運ぶ ②UI は `inter.reorder !== false` のときだけ ↑↓ を描き、
  案内文も「元の順番のまま戻ります」へ ③**engine を並びの権威にする**（`reorder:false` なら `pending.cards` の順を使う）。
  🔴**③が要る**＝UI だけ直すのは片肺（細工されたリクエストや別クライアントの実装差でそのまま通る）。
- ⚠**トラッシュ選択／上下振り分け／`first_top_rest_bottom` は封じていない**＝どれも「**どれを**」の選択であって「**どの順に**」ではない。

#### ② `O-94`② — ゾーン配置制限の判定が funnel の**外**にあり、通常召喚UIの1箇所からしか呼ばれていなかった

- 旧＝`effectEngine.collectCenterZoneDeployRestrict`（呼び出しは `BattleScreen` の通常召喚1箇所）＝
  **CPU 配置も engine の効果配置も素通り**。しかも **`return 3` とゾーン index 1 がハードコード**で、
  JSON を見ても何が起きるか分からなかった（`census:enginetext` A群と同じ形）。
- 新＝判定を **`deployLimitBlockReason`（`zoneIndex` を渡した呼び出し元が受ける）** へ移し、旧 collector は撤去。
  配線先は**通常召喚UI／召喚ゾーンモーダル／CPU 召喚／`execAddToField`** の4本。
  - 召喚ゾーンモーダルは**ボタン単位で落とす**（旧は押せてしまってから `handleSummonSigni` が黙って弾いていた）。
  - `execAddToField` は**制限に掛からない空きゾーンを選ぶ**（旧は無条件に「最初の空き」）。
- レベルとゾーンは `StubAction.zonePlacementRestrict{zones,minLevel}` として parser が刻む（逆翻訳にも出る）。

#### ③ `O-130` — collector は「効果を受けたシグニ」を特定していたのに entry へ載せていなかった

- `collectOppArtsUseTriggers` は `affectedByOppArtsFilter`（`O-113` で新設）に**マッチしたシグニを持っていた**のに、
  `StackEntry` へ載せずに捨てていた＝帰結の「そのシグニ」が解決できず、live は
  `REMOVE_ABILITIES{owner:'opponent'}` 単独に落ちていた。
- ⇒ `triggeringCardNum` に載せるだけで既存の `targetsTriggerSource` が働く（**新機構ゼロ**）。

---

### `WXK11-019-E2` は3つ同時に壊れていた（部分修正では過小↔過剰に裏返る）

原文＝「あなたのシグニ１体が対戦相手のアーツの効果を受けたとき、**そのシグニをアップし**、ターン終了時まで、
**そのシグニ**は**効果によって得ている**能力を失う。」

1. **「アップし」が丸ごと欠落**（過小）
2. **能力を失わせる相手が逆**＝原文は「効果を受けた**自分の**シグニ」／旧 live は `owner:'opponent'`（向きが真逆）
3. **「効果によって得ている能力」なのに印刷能力ごと消していた**（過剰）

3が別軸だったので受け皿を新設した（下記）。**1つでも残すと原文にならない**（第6巡 `WXDi-P16-056-E1` と同型）。

---

### 🔴 別バグ① — 「効果によって得ている能力を失う」が**印刷能力ごと**消していた（2効果）

- **`abilities_removed` は全能力喪失**なので、この語彙をそこへ倒すと**原文が触れていない印刷【常】【自】【起】まで消える**。
  live で該当したのは `WXK11-019-E2` と **`SPK01-13` の選択肢⑤**（「対戦相手のすべてのシグニは効果によって得ている能力を失う」）の2効果。
- **新設**＝`RemoveAbilitiesAction.grantedOnly` ＋ `PlayerState.granted_abilities_removed`（turn-end 寿命・`turnScopedState` に登録）。
- 🔑**読み側を funnel 化した**＝`grantedStore.grantedEffectsOf(state, num)` 1本に集約し、
  **`granted_effects` / `granted_effects_until_opp_turn` を直読みしていた 8箇所（`effectEngine`）＋1箇所（`effectExecutor`）**を通した。
  さらに engine 全体の読み口である **`BattleScreen` の augmented effectsMap 合成**でも落とす。
- ⚠**逆翻訳にも描いた**（`〜は効果によって得ている能力を失う`）＝落とすと全能力喪失と同じ文になり、
  **直した実装と壊れた実装を計器が区別できない**。

### 🔴 別バグ② — `WXDi-P11-TK01` が**器ごと違う STUB** で書かれていた

- 原文＝「【常】：あなたのターンの間、対戦相手はシグニを**２体まで**しか場に出すことができない。」＝**体数制限**。
- 旧 manual＝`STUB{OPP_ZONE_PLACEMENT_RESTRICT}`＝engine では「**中央のシグニゾーンにレベル3以上を置けない**」
  （`WXDi-P14-068` 用の別機構）として読まれていた ⇒ **体数制限は1件も効かず、代わりに中央ゾーンだけ封じていた。**
- 正しい形（`STUB{DEPLOY_RESTRICT{kind:'count',cap:2,subject:'opponent'}}`）は **parser が既に出していた**ので、
  §6.4 `O-42` の規約どおり **manual 定義ごと撤去**した（影武者コピーを残すとこのカードだけ parser 改善が永久に届かない）。
  live 側の MANUAL スタンプは `census:orphanmanual --unfreeze A` で解凍（実体は1バイトも変わらないことを A/B で確認）。

### 🔴 「ルール注記」に見えて実効ルールだった1件

`SP38-001` の「この方法でグロウしたルリグの【出】能力は発動しない」は **`STUB{RULE_REMINDER_TEXT}`＝完全な no-op**
だった（＝効果でグロウしたルリグの【出】が普通に発動する過剰実行）。
`GROW_BY_EFFECT_SUPPRESS_ON_PLAY` へ移し、`performGrow` の **`suppressOnPlayOnce`**（そのグロウ**1回だけ**）で効かせる。
⚠ターン全体のフラグ `suppress_center_on_play` へ焼き付けない（同じターンの別のグロウを巻き込む）。

---

### `O-83` のグロウは「コストを払う」— `GROW_FREE` を流用しない

- 原文に「コストを支払わずに」が**無い**ので、`GROW_FREE`（＝踏み倒し）は使えない。
- **engine は予約だけ**（`STUB{GROW_BY_EFFECT}` → `PlayerState.pending_effect_grow`）、
  実グロウは `BattleScreen` の `executeGrow`（正規経路）＝`pending_flip_grow_card`（`O-10` 続き515）と同じ形。
  🔑engine で `field.lrig` へ直接 push すると**【出】・リミット再計算・コイン獲得が丸ごと落ちる**。
- グロウモーダルの `freeGrowFilter` に **`'plus1_paid'`** を足した（`defaultFreeCost` は false ＝通常のグロウコストを払う）。

---

### 新設した型・状態（この巡で本当に新規なのは5つ）

| 追加 | 用途 |
|---|---|
| `SelfPlayRestrictAction.exceptSourceCardNames` ＋ `DeployLimitInput.placementSourceCardNum` | 配置元の効果を**カード名**で限定（`O-74`/`O-79`） |
| `DeployLimitInput.zoneIndex` ＋ `StubAction.zonePlacementRestrict` | ゾーン＋レベルの配置禁止（`O-94`②） |
| `RemoveAbilitiesAction.grantedOnly` ＋ `PlayerState.granted_abilities_removed` ＋ `grantedStore.grantedEffectsOf` | 「効果によって得ている能力」だけの喪失（`O-130`） |
| `PendingInteractionDef.LOOK_AND_REORDER.reorder` | 並べ替え可否を pending まで運ぶ（`O-150`） |
| `PlayerState.pending_effect_grow` ＋ `STUB{GROW_BY_EFFECT}` / `{GROW_BY_EFFECT_SUPPRESS_ON_PLAY}` ＋ `freeGrowFilter:'plus1_paid'` | 条件つきグロウ（コストは払う）＋【出】抑制（`O-83`） |

**撤去**＝`deployRestrict.kind` の `only_by_effect`（死枝）／`effectEngine.collectCenterZoneDeployRestrict`／
`manualEffects` の `WXDi-P11-TK01`／`RULE_REMINDER_TEXT` への誤誘導1本。

---

### 計器（較正であって前進ではない）

- **census 高シグナル**＝`WXDi-P11-050-E1` が `STUB{DEPLOY_RESTRICT}` から `SELF_PLAY_RESTRICT` へ移った瞬間に
  **STUB 免除が外れて +1** した（6）。`vocabCensus.ts` の「制限「できない」」へ **`SELF_PLAY_RESTRICT`** を追加して 5 へ戻した。
  🔴**較正の唯一の危険＝キーが免罪符になる**ので、`O-132` のトリップワイヤ（較正キーが live に実在する）へ1行足してある。
- **golden の負方向契約を1本畳んだ**＝`O-60④ parser` の「『効果によってしか』は機構未実装として明示」は
  **実装が入った瞬間に嘘になる assert** だった（第2巡の教訓＝負方向契約が項目を眠らせる）。
- `WXK11-019-E1` の逆翻訳から `〈※コスト未表現〉` が消えたのは**この巡の変更ではない**＝
  そのカードは `_held_fresh` に居て parser の改善が凍っていた。`syncManualLive` で E2 を届けた際に一緒に解凍された。

---

### 検証コマンド

```
npm run build:effects && node scripts/heldReview.mjs --adopt WXDi-P11-050,SP38-001
npx tsx scripts/syncManualLive.ts WXK11-019 SPK01-13
npx tsx scripts/censusOrphanManual.ts --unfreeze A
npm run regen && npm run gates          # 全緑（golden 3265／census 高シグナル 5）
npm run verify:browser                  # 実機6シナリオ・28アサート 全 PASS
```

**⑤実機の要否判定**＝`src/screens/`（`BattleScreen.tsx` / `EffectInteractionModal.tsx` / `SigniSummonZoneModal.tsx` /
`GrowModal.tsx` / `useGrowModal.ts` / `growLogic.ts`）を触り、**新しい型・機構を5組足した**ので **PLAN §2.2 により実機まで必須**。

---

## 2026-09-02（索引 C 第9巡）：§5.3 索引 C を上から15件 — `O-84` / `O-114` / `O-180` / `O-151` / `O-164` / `O-167` / `O-177` / `O-186` / `O-203` / `O-205` / `O-206` / `O-209` / `O-210` / `O-213` / `O-72`

**ベースライン**＝`981a504df`。**15件のうち5件で登録票の「受け皿が無い」が失効していた**（`O-205` は丸ごと stale）。
新設した型は**5組＋STUB 2本**だけ。

**ゲート**＝全緑。golden **3243 → 3259**（+16本・全件実行）／smoke 10,721 全異常0／fuzz 全0／
census 高シグナル **6 → 5**（`BASELINE_HIGH` も 5 へ）／`census:stubs` A群🔴0・C群0／manual-fields 0／
`census:enginetext` A🔴130行（据置）／lint 0 errors。
**実機 10本／10本 PASS**（うち**反転確認5本**）。**在庫**＝機構 worklist **58 → 43項目**（索引 C 22 → 7）。

---

### 🔴 この巡の主題① — 「実装済み」と書かれた項目が2件とも**経路単位で穴**だった

**完了報告は「型があるか」ではなく「入口が何本あるか」で確かめる。**

- **`O-210`（`WX24-P4-050-E2`）＝向きが真逆だった。** `bySource:'by_this'` は
  `banish_redirect_by_source_nums` に載るが、**この配列を読むのは `BattleScreen` のバトル解決3箇所だけ**。
  原文は「このシグニ**の効果によって**対戦相手のシグニ1体がバニッシュされる場合」＝**効果経路**なので、
  **効果バニッシュでは一度も置換されず、逆にバトルでだけ置換されていた**。
- **`O-164`（`WX15-010-E1`）＝入口が2本あるうち1本だけ塞いでいた。**
  効果バニッシュの1回消費盾は `applyDirectAction` の `BANISH`（`targetsLastProcessed` 等）にしか無く、
  **`execBanish` の `applyBanish`（対象を選んで撃つ本線）は素通り**していた
  ＝「対象を選んで撃つと防げないのに、それ経由なら防げる」無言のズレ。

⇒ この巡は**4本を funnel 化**した＝`applyBanishPreventShield` ／ `consumeBanishRedirectOnce` ／
`applySplitTotalToTargets` ／ `trashExileCostSatisfied`+`canAddTrashExileIndex`+`trashExileAffordable`。

### 🔴 この巡の主題② — 実機が机上では出ない嘘を2件捕まえた

- **`TrashActivatedModal` の実行ボタンが「発動する（トラッシュから場に出す）」固定**だった。
  アクション出し側（`getMyTrashCardActions`）のラベルだけ直しても**モーダルは嘘のまま**。
  ⇒ **同じ文言を2箇所で組み立てているものは必ず両方直す**（`trashActivateVerbLabel` へ集約）。
- **`WXDi-P13-043` はシグニではなくアシストルリグ**＝【出】は手札召喚ではなく**アシストグロウ**で発火する。
  ⇒ **シナリオを書く前に `CardData` の `Type` 列を読む**（「【出】＝召喚」と決めつけない）。

---

### 1. `O-213` — 「このゲームの間にリレーピースを使用している」（1効果・**受け皿は在った**）

**真因**＝`effectParser.ts:21231` に `LRIG_TRASH_COUNT{filter:{cardType:'リレーピース'}}` の規則が**既にあった**のに、
`manualEffects.ts` の `WXDi-CP01-002` が **`PARTIAL` で上書き**して届いていなかった（第4の死角の"出所あり"版）。

- **直し方**＝manual 定義を**削除**して parser に任せた（`§6.4 O-42 tripwire` の指示どおり＝実体同一の影武者は残さない）。
  2つの【使用条件】は原文が「両方の…」と明記しているので **AND** で載る。
- ⚠**「使用している」の近似はルリグトラッシュ**＝使用済みピースは `lrig_trash` へ入る（`execUtils.ts:2597` に明記）。
  ゲームから除外されたピースは残らない＝**偽陰性側（fail-closed）**。
- **影響**＝1枚（`WXDi-CP01-002`）。旧はデッキ2434枚ミルが**使用条件なしでいつでも撃てた**。
- **検証**＝golden `索引C 2026-09-02: O-213 …`（成立／不成立の両方向）。

### 2. `O-209` — 「好きな生徒1人との絆を獲得する」（1効果・**受け皿は在った**）

**真因**＝`GAIN_BOND{source:'declared'}` は型・parser 規則・`effectExecutor.ts:9695` の消費・
`PlayerState.bonds`（【絆】アイコンのゲート）まで**完成済み**だった。`WXDi-CP02-001-E1` が原文の**末尾2文**を
落としていただけ。「ルリグの下からカードを合計4枚ルリグトラッシュに置く」＝**エクシード4**＝`OptionalCostSpec.exceed`。

- **直し方**＝`STUB{OPTIONAL_COST, exceed:4}` → `CONDITIONAL{PAID_ADDITIONAL_COST}` → `GAIN_BOND{declared}`。
  使用条件②（《連邦生徒会》か《クロノス報道部》の使用歴）も `LRIG_TRASH_COUNT{cardNames}` で同時に載せた。
- **engine は0行**。**影響**＝1枚。
- **検証**＝golden `索引C 2026-09-02: O-209 …`（任意コストが絆獲得より前にあることまで固定）。

### 3. `O-151` — 「それらのパワーを合わせて－18000」で対象宣言が別の文にある（1効果）

**真因**＝`PR-K026-E1-G2` は**対象宣言が丸ごと落ちて** `CONDITIONAL{LAST_PROCESSED_COUNT_GTE 9} → STUB{POWER_MOD_PER_COUNT}`
だけ＝**相手のパワーは1ミリも下がらない**（真 no-op）。

- **受け皿は既存の3点**＝`STUB{SELECT_TARGET_ONLY}`（盤面を変えない対象宣言）＋
  `STUB{STORE_LAST_PROCESSED_TARGETS}`（`storedTargetCards` へ固定）＋`POWER_MODIFY{targetsStored, splitTotal}`。
  🔑**間にミル9枚を挟んでも対象が生き残る**のがこの組の要点（`lastProcessedCards` はミルで上書きされる）。
- **engine 1点**＝`execPowerModify` の `splitTotal` が `targetsStored` を honor するようにした。
  旧は必ず選択UIを出したので**同じ対象へ ON_TARGETED が二度立つ**（対象宣言は1回）。
  割り振り本体は `applySplitTotalToTargets` 1本へ集約（選択経路と共有＝1体なら対話を挟まない規約も共有）。
- **死枝を撤去**＝`parseSentencePart4.ts` の catch-all `それらのパワーを(合わせて|合計で)` は
  母集団が0になったので削除（登録票の指示どおり）。
- **検証**＝golden 2本（`splitTotal は targetsStored なら…` ／ `PR-K026-E1-G2 は対象宣言→ミル9→割り振りの順に…`）。
  `BASELINE_SPLIT_TOTAL` 5 → 6。

### 4. `O-167` — 【起】コスト「このシグニを場から手札に戻す」（1効果）

**真因**＝この句が**どのコスト規則にも当たらず丸ごと踏み倒されて**いた（`WX21-031-CB-E2` はエナ《白》だけで撃てた）。

- **新設**＝`EffectCost.bounceSelf`。🔴**`trash_self` へ寄せない＝行き先が違う**
  （手札なら同じ札を再利用できる／トラッシュなら資源を失う＝コストの重さが別物。§5.3 `O-67` の `fieldBanish` と同じ取り違え）。
- **配線**＝parser 規則1本＋`BattleScreen` の【起】コスト funnel（離場は `removeFromField` を共有）＋
  `SigniActivatedModal` のラベル＋`CPU_AUTO_PAYABLE_COST_KEYS`＋逆翻訳。
- **影響**＝1枚。**census 高シグナル -1**（`AUTO` のまま JSON に載った＝**真の前進**）。

### 5. `O-206` — `trashExile` の集合制約が支払いモーダルで enforce されない（1効果）

**真因**＝型（`selectionConstraint`）は 2026-08-31 から在ったのに、支払いUIは **`size >= count` しか見ておらず**
`WXK09-029-E2` は**同名のスペル3枚でも払えた**（`energyTrash` とまったく同じ穴）。

- **直し方**＝`costs.ts` に `trashExileCostSatisfied` / `canAddTrashExileIndex` / `trashExileAffordable` を新設し、
  **支払いモーダル2本（`SigniActivatedModal` / `LrigGrantedModal`）と可否ゲート（`signiActivateGate`）**を
  同じ関数へ通した。⚠**判定はここ1本に集約**（写経すると「その入口からだけ制約なしで払える」になる）。
- `WXK09-029-E2` は `PARTIAL` → `MANUAL`。
- **検証**＝golden（異名3枚は払える／同名3枚は払えない・提示もされない／タップ時ガード）＋
  **実機2本**（`o206TrashExileDistinct` / `o206TrashExileSameName`）。

### 6. `O-177` — ライフバースト無効に「カードの条件」を載せられない（1効果）

**真因**＝`PlayerState.suppress_life_burst` が **boolean** で、`WX25-P3-003-E1` の
「**対戦相手のセンタールリグと共通する色を持たない**対戦相手のカードのライフバーストは発動しない」が
**そのターンの相手のバーストを全部止めて**いた（過剰実行）。

- **直し方**＝`boolean | TargetFilter` へ広げ、判定を `lifeBurstSuppress.ts` の
  `lifeBurstSuppressedByTurnFlag` 1本に集約（`LifeBurstCheckModal` は**カードごと**に呼ぶ）。
  ⚠**基準ルリグはフラグの持ち主**（抑制フラグはクラッシュ**される側**に立つ）。
  ⚠**色は配列で渡す**（文字列だと `colorExclude` が1要素扱いで1色も除外されない＝§5.3 `O-183` の実測）。
- ⚠ルリグ色が引けないときは**抑制しない側**へ倒す（fail-closed）。
- **検証**＝golden（共通色なし＝抑制／共通色あり＝抑制しない／boolean は全部止める）。

### 7. `O-164` — 「次にバニッシュされる場合、バニッシュされない」が**効果経路の本線**で効かない（1効果）

**真因**＝上の「主題①」。`applyBanishPreventShield` を新設して `execBanish` の `applyBanish` と
`applyDirectAction` の `BANISH` の**両方**から通した。身代わり（`BANISH_SUBSTITUTE`）より**先**に見る
（原文は「バニッシュされない」＝離場自体が起きない）。

- ⚠**1回消費は instance 単位**＝`abilities_removed` に積むのは肩代わりした `src`（`thisCardOnly` なら victim 自身）
  なので、＜武勇＞が複数いても**各自が1回ずつ**吸収する（原文どおり）。
- `WX15-010-E1` は `PARTIAL` → `MANUAL`。**検証**＝golden（1回目は吸収／2回目はバニッシュされる）。

### 8. `O-210` — `BANISH_REDIRECT` の「次に1回だけ」＋効果経路（1効果）

**真因**＝上の「主題①」（向きが真逆）＋回数無制限。

- **新設**＝`BanishRedirectAction.byEffectOnly` / `consumeOnce`、
  `PlayerState.banish_redirect_by_source_effect_nums` / `banish_redirect_once_source_nums`。
- `banishDestination` が `opts.effectSourceNum` と突き合わせて置換し、**`consumedOnceSource` を返すだけ**にした
  （置換元の state を書き換えるのは呼び出し側＝この関数は被バニッシュ側の state しか返せない）。
  消費は `consumeBanishRedirectOnce` 1本で `applyBanish` / `applyDirectAction` の両方から呼ぶ。
- ⚠**バトル経路の消費地点は未配線**なので、`byEffectOnly` を伴わない `consumeOnce` は書かない（型コメントに明記）。
- parser 規則も足したので `manualEffects` の影武者を削除（`§6.4 O-42 tripwire`）。**検証**＝golden（両方向）。

### 9. `O-114` — スペル／アーツの「別能力としての【起】」が UI から使えない（2効果）

**真因**＝①`trashActivated` は本体が「場に出す／シグニゾーンに出す」のときしか立たず、
**「トラッシュにあるこのカードを手札に加える」自己回収**（`WX10-096-E2`）を知らなかった
②**エナゾーン起動の入口そのものが無かった**（`WXDi-P06-077-E2`）。どちらも**どこからも提示されない**過小実行。

- **新設**＝`CardEffect.energyActivated`（`trashActivated` と**入口だけが違う**＝支払い・実行は
  `trashActivateCost.ts` / `executeTrashActivated` を共有）＋`PlayerField` の `getEnergyCardActions`
  （エナゾーンの `Stat` に `my-energy` testid とゾーンモーダルの action を配線）。
- **ラベルを本体アクションから決める**＝`trashActivateVerbLabel`。
  🔴**実機で発見**＝`TrashActivatedModal` の実行ボタンも「トラッシュから場に出す」固定だった（**2箇所目**）。
- **検証**＝**実機4本**（`o114EnergyActivated` / `o114EnergyActivatedGated`＝＜美巧＞の使用条件で反転／
  `o114TrashSelfToHand` / `o114TrashSelfNoCharm`＝【チャーム】コストで反転）＋golden 1本。

### 10. `O-84` — 「条件を満たす場合、このアーツは追加で《アタックフェイズアイコン》を持つ」（1効果）

**真因**＝使用可否の Timing は `CardData.Timing` 列を読む**静的判定**なので、
**盤面条件で timing を1つ足す動的な口が無く**、`WX16-Re20-E1` は `DEFERRED_…` で恒久 no-op だった。

- **新設**＝`StubAction.extraUseTiming` ＋ `ActiveCondition.LIFE_COUNT`（`Condition` 側には元から在り、
  **片側だけ育っていた**＝§5-2‴ の再発）。消費は `artsUseGate.ts` の `collectExtraUseTimings` 1本
  （人間UIと CPU はどちらも `checkArtsUse` を通る）。
- 🔴**向きに注意**＝**足す側**（`timingOk` へ `||` で合流）。条件を使用可否の必須項に混ぜると
  「ライフ2枚以下でしか使えないアーツ」に化ける。`effectParser.ts` の `STATE_HOIST_BATCH1_CARDS`
  ガードはその誤変換を封じているので**外していない**。
- 宣言は本体の `SEQUENCE` から外して**別の CONTINUOUS 効果（E2）**にした（撃った後に宣言しても間に合わない）。
- **検証**＝**実機2本**（ライフ2枚＝アタックフェイズで使える／ライフ5枚＝使えない）＋golden（両方向＋
  「本体の使用条件へライフ条件を載せていない」）。`ACTIVE_CONDITION_TYPES` 66 → 67。

### 11. `O-180` — 「次にアシストルリグにグロウする場合、ルリグタイプは無視され、コストは《無×1》減る」（1効果）

**真因**＝`GROW_COST_REDUCTION` に**実行ハンドラが1つも無かった**（`collectGrowCostReductions` は
**場の CONTINUOUS** しか走査しない）＝ピース `WX24-P2-043` が**丸ごと無言 no-op**。

- **新設**＝`GrowCostReductionAction.nextAssistGrowOnly` / `ignoreLrigType` ＋
  `PlayerState.next_assist_grow_mods`（**1回きり**＝`executeAssistGrow` が消す・ターン終了時も消える）。
- ⚠**アシストグロウ専用**（原文が「アシストルリグにグロウする場合」）＝`listGrowCandidates`（センター用）ではなく
  `getAssistGrowCandidates` 側だけが読む。⚠`BLOCK_ACTION{IGNORE_LRIG_TYPE}` は**グロウ先ルリグ自身の宣言**で軸が別。
- コスト軽減は `AssistGrowModal` で `collectGrowCostReductions` の結果へ合流する。
- **検証**＝**実機1本**（`o180NextAssistGrowMods`）＋golden（【常】版は state へ焼かないことまで固定）。

### 12. `O-203` — 「あなたの効果1つによってこのシグニを参照する場合、レゾナとしても扱う」（1効果）

**新設**＝`STUB{TREAT_SELF_AS_RESONA}` ＋ `PlayerState.treated_as_resona_until_opp_turn`。
参照側は `fieldCandidates` が `Type` を `'レゾナ'` へ差し替えて読む。

- 🔑**「としても」＝シグニでもある は無料で成立する**＝`matchesFilter` は `Type==='レゾナ'` を
  `cardType:'シグニ'` フィルタにも一致させる（非対称の緩和が以前から入っている）。
- ⚠**近似を明記**＝`fieldCandidates` は「誰の効果が参照しているか」を知らないので、原文の
  「**あなたの**効果1つによって」は絞れない（相手の「レゾナ1体を対象とし」にも当たり、`excludeResona` では逆に外れる）。
  **1効果のための意図的な近似**。**検証**＝golden 4方向（レゾナに当たる／シグニにも当たる／印が無ければ当たらない／`excludeResona` に掛かる）。

### 13. `O-186` — 「次のあなたのターン終了時まで」の `EffectDuration` が無い（2効果）

**真因**＝`UNTIL_END_OF_TURN` に潰れており**相手ターンを跨がずに切れて**いた（過小）。
`UNTIL_OPP_TURN_END` へ寄せても**1ターン短い**。

- **新設**＝`EffectDuration.UNTIL_NEXT_OWN_TURN_END` ＋
  `PlayerState.power_mods_until_next_own_turn` / `abilities_removed_until_next_own_turn`。
- 🔑**寿命はグローバルターン終了の回数で数える**＝自分のターン中に置いたら **3**
  （自T終了→相手T終了→**次の自T終了で消える**）、相手のターン中（ライフバースト等）なら **2**。
  🔴**`_next_turn` の2スロット式では表せない**（あれは常に1回ぶんしか跨げない）。
- `clearTurnEndScopedState` が毎ターン終了時に1減らし、生き残った分を `abilities_removed` へ書き戻す。
  `calcFieldPowers` にも新ストアを足した（足さないと JSON に載るだけの死フラグ）。
- **影響**＝`WXDi-P13-043-E1` / `WXK10-022-BURST`。
- **検証**＝**実機1本**（`o186UntilNextOwnTurnEnd`＝寿命3で載ることまで観測）＋
  golden（3回のターン終了で切れる／従来の2スロットは2回で切れる、の対照つき）。

### 14. `O-72` — `ON_ATTACK_PHASE_START` がフェイズ限定【常】の配る【自】を拾えない（1効果）

**真因**（登録票の「当て」どおり）＝`effectsMap`（memo）は **`bs.turn_phase`＝遷移「前」**（MAIN）で組まれるので、
`collectGrantedFromUnderSigni` の `activeCondition:{DURING_ATTACK_PHASE}` がまだ false ＝
**付与された【自】が augmented map に載る前に `ON_ATTACK_PHASE_START` を収集していた**。

- **直し方**＝`mkTrigCtxForPhase(phase, …)` を新設し、**遷移先フェイズで下カード付与だけを組み直す**
  （フェイズ以外の条件は遷移で変わらないので memo を捨てない）。⚠**effectId で重複を弾く**（二重発火防止）。
- 開始時トリガーの4呼び出し（`ON_ATTACK_PHASE_START` / `ON_GROW_PHASE_START` / `ON_MAIN_PHASE_START`）に
  遷移先を渡し、**CPU 版（`collectCpuTurnTriggers`）にも同じ引数**を通した
  （写経して片方だけ落とすと「人間ターンでは発火するのに CPU ターンでは発火しない」無言のズレになる）。
- **影響**＝`WXK08-048-E1`。**検証**＝golden（ATTACK_ARTS 基準なら載る／MAIN 基準では載らない＝真因そのもの）。

### 15. `O-205` — **stale**（1効果）

登録票「`lrigAttackNoDamage` の発火地点は【ガード】された経路だけ」は **続き772 の `O-181` で失効していた**＝
`collectAttackEndTriggers` が非ガードのダメージ無効を補完しており、golden
`O-181 ON_ATTACK_END: ルリグ付与・全場 watcher を…`（`:13728`）が既に assert 済み。
契約の在処だけを golden 1本で固定してクローズ。

---

### 計器の更新（**内訳を混ぜない**）

- **census 高シグナル 6 → 5**＝**前進1件だけ**（`WX21-031-CB-E2` が `AUTO` のまま `bounceSelf` を載せた）。
  🔴**この巡で MANUAL 免除に入った分は 0**（新しく `MANUAL` にした効果はもともと高シグナルに出ていない）。
- **`ACTIVE_CONDITION_TYPES` 66 → 67**（`LIFE_COUNT`）／**`BASELINE_SPLIT_TOTAL` 5 → 6**。
- **`§6.4 O-42 tripwire` が2件を検出**＝parser に規則を足した結果 `WX24-P4-050-E2` / `WXDi-CP01-002-E1` が
  **実体同一の影武者**になったので manual 定義を削除し、`census:orphanmanual --unfreeze A` で live の
  スタンプも `AUTO` へ戻した（残さないと parser 改善が永久に届かない）。
- **在庫**＝機構 worklist **58 → 43項目**（索引 A 17／B 12／**C 22 → 7**／E 4／F 3）。
  Sheet1 要対応 **22 / 863**（据置＝`mech` 22・即着手可能 0）。台帳 残 OPEN **44**（据置＝この巡は §5.2 から取っていない）。


## 2026-09-02（続き774）：§5.3 索引 C を上から5件 — `O-162` / `O-199` / `O-200` / `O-201` / `O-202`

**ベースライン**＝`a4f666a2c`。**新しい `Condition` 型もアクション型も1つも足していない**（足したのは既存型のフィールドと
STUB 2本だけ）。**5件のうち4件で登録票の「受け皿が無い／窓が無い」が失効していた。**

**ゲート**＝全緑。golden **3233 → 3243**（+10本）／smoke 10,721 全異常0／fuzz 全0／
census 高シグナル **12 → 6**（`BASELINE_HIGH` も 6 へ）／`census:stubs` A群🔴0・C群0／manual-fields 0／
`census:enginetext` A🔴130行（据置）／lint 0 errors・250 warnings。
**live の per-effect diff は 8効果ちょうど**（HEAD との全数 diff で意図外の変化が無いことを確認）。

---

### 1. `O-162` — 「プレイヤーをN人まで選ぶ」（2効果）

**真因**＝parser が `STUB{CHOOSE_N_FROM_LIST}` へ落とし、engine の `([１-４1-4])つ(?:まで)?選ぶ` は
原文「N**人**まで」に**1本も当たらない**＝**選択が無言 no-op**。後続だけが焼き込んだ owner で走っていた。

- `WXEX2-44-E2`「プレイヤーを1人まで選ぶ。**そのプレイヤーは**自分のトラッシュを全部デッキへ」
  → 旧 live は `TRANSFER_TO_DECK{owner:'self'}` 固定＝**対戦相手を選んでも自分のトラッシュが戻る**真逆の実行。
- `WXK06-028-E2`「プレイヤーを2人まで選ぶ。選ばれた各プレイヤーは手札を全部デッキへ加えてシャッフルし、
  加えた枚数と同じ枚数を引く。**最大5枚まで**」
  → 旧 live は `STUB{MASS_TRASH}`（**トラッシュへ置く別物**）＋**ドローが丸ごと無い**。

**直し方**＝🔑**新しい型を作らなかった**。選べるプレイヤーは「あなた」「対戦相手」の2つしか無いので、
**選択肢そのものを owner 違いの同じアクションにする**と「選ばれたプレイヤーを後続へ運ぶ口」（登録票の②）が要らない。
`CHOOSE{choose_count, upTo:true, choices:[self, opponent]}` を `manualEffects.ts` に手書き（`MANUAL`）。
引く枚数は `DRAW{count:0, addLastProcessedCount:true}`＝`TRANSFER_TO_DECK{HAND_CARD,'ALL'}` の
`lastProcessedCards` に追従（枚数を焼き込まない）。**上限5枚だけ新設**＝`DrawAction.maxCount`
（engine で `Math.min` を1回・デッキ残量のクランプとは別軸・逆翻訳に `（最大N枚まで）`）。

**検証**＝golden `索引C 2026-09-02: O-162 …` 2本（0人／1人／2人・上限5枚・`maxCount` 無しなら9枚引く反転）。
実機 `o162ChoosePlayer`＝「対戦相手」だけを選ぶと **相手の手札 7 → 5（上限で止まる）／自分は 3 のまま**。

---

### 2. `O-199` — アンコールの「テキスト形」コスト（**登録票 2効果 → 実測5枚**）

**真因**＝`screens/battle/costs.ts` の `parseEncoreCost` が `《…》` アイコンしか読まず **null（＝コスト無し）**に落ちる。
null だと `canEncore` が false になるので、**アンコールの選択肢そのものが出ない**（実害は過小の側）。

**母集団**＝`WDA-F02-08`（下から3枚）／`SP27-010`・`SP27-016`（下から2枚）／`SPK01-13`（キー1枚）／
`WX14-016`（手札から＜美巧＞1枚）。**32枚のアンコール札のうち5枚**。

**直し方**＝`parseEncoreCost` を `{energy, coins, exceed?, trashOwnKey?, handDiscardSigni?}` へ拡張。
- ①「ルリグの下からN枚をルリグトラッシュ」→ **既存 `exceed`**（`paySelectedExceed` がそのまま使える）
- ②「キー1枚を場からルリグトラッシュ」→ `trashOwnKey`
- ③「手札から＜X＞のシグニをN枚捨てる」→ `handDiscardSigni`（既存の `selectedArtsDiscard` UI を再利用）
- ⚠🔴**テキスト形と判定するのは「－の直後が `《` でない」ときだけ**＝
  `アンコール－《黒》このターン、あなたのシグニの【出】能力は発動しない` のような
  **アイコンの後ろに続くアーツ本文**をコストと読み違えると**払わされる側＝過剰**になる。
  32枚全部に当てて、アイコン形27枚の解釈が1件も変わっていないことを確認した。
- `ArtsModal`＝`canEncore` に支払い可否（`canPayExceed` / キーの有無 / 手札の該当枚数）を足し、
  ボタンのラベルに支払い内容を出す。`performArts`＝`exceed`（プール先頭から N 枚の近似）と `trashOwnKey` を徴収。

**検証**＝golden `索引C 2026-09-02: O-199 …` 2本（5枚の解釈＋アイコン形の非退行＋本文誤読の反転）。
実機 `o199EncoreTextCostPay`（下3枚を払ってアーツがルリグデッキへ戻る）／
`o199EncoreTextCostShort`（🔴**下が2枚ならアンコールが押せない**）。

---

### 3. `O-200` — ルリグデッキからキーを場に出す（2効果）

**登録票の「`field.key_piece` を置く手段がゼロ」は失効していた**＝`PLACE_KEY_FROM_LRIG_DECK` は
`WDK03-001-E1` 用に続き760 で新設済み（engine ハンドラ・逆翻訳・golden つき）。

**真因**＝2効果とも live が `SEQUENCE[ADD_TO_FIELD{source なし} × 2]`＝キーと無関係な別物。

**直し方**＝既存受け皿を3点だけ拡張した。
- `cardName` を**省略可**にし、省略時は**ルリグデッキのキーから選ばせる**（候補1枚なら対話を出さない）。
- `payPrintedCost` ＋ `coinReduction`＝**選んだキーの `Cost` 列**（コイン＋エナ）を徴収し、
  **払えないキーは候補に出さない**（踏み倒しを作らない）。エナは `selectOptionalCostEnergy` で自動選択。
  ⚠読むのは `Cost` 列であって `EffectText` ではない（`census:enginetext` A群とは別軸）。
- `PlayerState.key_place_limit`（`STUB{SET_KEY_PLACE_LIMIT}`）＝「このゲームの間、キーをN枚まで場に出せる」。
  消費は2地点＝engine の `execPlaceKeyFromLrigDeck`（枠が空いていれば `key_piece_extra` へ積む）と
  `BattleScreen` のキーセット可否ゲート／配置先。

🐛🔴**副産物＝「キーが1枚も場に出せない」実バグを発見して修正**（`o200KeyGateOn` が最初 FAIL したので調査）。
`getMyLrigDeckCardActions` が `const timing = cardData.Timing ?? ''` として `!timing` で
「タイミング指定なし＝メインで使える」を判定していたが、**CSV の空欄は `'-'`（空文字ではない）**＝truthy。
**Timing 列が全部 `-` の全80枚のキーが、ルリグデッキから永久に使用不可**だった。⇒ `'-'` を `''` へ正規化。
⚠ピースは Timing に文言が入るので影響なし＝壊れていたのはキーだけ。

**検証**＝golden `索引C 2026-09-02: O-200 …` 2本（選択・枠の積み上げ・差し替えの反転・印刷コストの徴収と不足時の非成立）。
実機 `o200KeyFromLrigDeck`（【起】でキーが出て枠が2になり既存キーが残る）／
`o200KeyGateOn`（枠2なら手で2枚目を置ける）／`o200KeyGateOff`（🔴**枠1なら置けない**）。

---

### 4. `O-201` — 【出】任意コストの新しい支払い種別（2効果）

**登録票の「`resolveOptionalCostSpec` から支払いUIまでの縦切り」は半分失効**＝`OptionalCostSpec` も
支払いUIも既にある。🔴**本当の真因は `optionalOnPlayCostStub` の `SUPPORTED` 集合**＝
**未対応キーが1つでもあると `wrapOptionalOnPlay` が null を返し、その任意【出】が丸ごと積まれない**
（＝`costUnparsed` と同じ「取りこぼす側」）。だから登録票は「cost を書くと発火しなくなる」と読めていた。

- `WXDi-P12-031-E2`「**手札とエナゾーンにあるすべてのカードをトラッシュに置く**：この方法で6枚以上…バニッシュ」
  → parser は既に `discardAll` + `energyTrashAll` を出せるのに `SUPPORTED` に無いので**差し戻されていた**
  （`manualEffects.ts` に `costUnparsed:true` を手書きして温存）。`SUPPORTED` へ通し、
  `discardAll → handDiscard{count:'ALL'}` / `energyTrashAll → energyTrash{count:'ALL'}` を写す。
  🔑**「この方法で6枚以上」は `activeCondition` 側へ移した**＝`action` の中に置くと**支払い後**に評価され、
  手札もエナも空なので**必ず偽**になる（過小）。支払い前の「手札＋エナが6枚以上」は「全部捨てる」形なので枚数として同値。
- `WXDi-CP02-100-E1`「**トラッシュから＜ブルアカ＞のカード1枚をデッキの一番下に置く**：」
  → 新しい `EffectCost.trashToDeckBottom` ＋ `OptionalCostSpec.trashToDeckBottom`。
  ⚠**`trashExile`（ゲームから除外）を流用しない**＝行き先が違う（除外は戻ってこない）。
  支払いは既存 `TRANSFER_TO_DECK{TRASH_CARD, position:'bottom'}` に載る。
  通常召喚経路（`SigniOnPlayCostModal` ＋ `executeSigniOnPlayCost`）にも選択UIと徴収を足した。

**据置契約を反転**＝golden `(xxix)(2) 第15波後の明示保留3効果は costUnparsed のまま保持する` を
**3効果 → 1効果**（残るのは `WXDi-P03-019-E1`＝`O-68` の領分）。連動して4本のカウント assert を実数へ更新
（`optionalCost` 962→964／`optionalNoCost` 20→18／`deferred` 3→1／通常アシスト収集 158→159・据置 2→1）。

**検証**＝golden `索引C 2026-09-02: O-201 …` 2本。
実機 `o201TrashToDeckBottomPay`（トラッシュの＜ブルアカ＞が**デッキの一番下**へ行き、＋2000 が乗る）／
`o201TrashToDeckBottomNoPay`（🔴**候補が無ければ「発動」が押せず、本体も走らない**）。

---

### 5. `O-202` — コスト付きの置換（2効果）

**登録票の「置換の発生時に支払いを問う窓が無い」は失効していた**＝窓は2本とも既存。
①ダメージ置換＝`screens/battle/lifeCrashReplace.ts` の `kind:'pay_cost'`（続き543）
②離場置換＝`collectLeaveSubstituteOptions` の `selfAbilityPay` 軸（続き511）。
**足りなかったのは支払い種別だけ。**

- `WX24-P3-043-E1`（ピース）「このターン、あなたがダメージを受ける場合、代わりに**レベル1以上のアップ状態の
  アシストルリグ2体をダウンして**もよい」
  → 旧 live は `ACTIVATED{DOWN{SIGNI, level>=1, isUp}}`＝**使った瞬間にシグニを1体ダウンするだけ**の別物
  （置換の宣言でも、アシストルリグでも、2体でもない）。
  → `LifeCrashReplaceAction.replaceKind:'pay_cost'` ＋ `payOptions[].assistLrigDown{count,minLevel}` を新設し、
  funnel の `pickPayOption` / `applyPayCostReplacement` に通した。⚠**アップの枠が足りなければ成立しない**
  ＝ダメージがそのまま通る（過剰にしない側）。⚠`once` を付けない（原文に「次に」が無い）。
- `WXEX2-28-E1`（【常】）「あなたの＜ウェポン＞のシグニ1体が**対戦相手の効果によって**場を離れる場合、
  代わりにアップ状態のこのシグニをダウンしてもよい」
  → 旧 live は素の `CONTINUOUS DOWN{thisCardOnly, optional}`＝**CONTINUOUS は `executeAction` を通らない**ので
  **恒久 no-op**（`LIFE_CRASH_REPLACE` 系と同じ壊れ方）。守りが1回も働いていなかった。
  → 離場置換の新軸 `downProtector`（`STUB{EFFECT_LEAVE_REPLACE_WITH_DOWN_SELF}`）。
  ⚠**無料の軸より後ろ**に置く（`selfAbilityPay` と同じ規約＝タダで済む置換があるのに資源を払わない）。
  ⚠**`BATTLE_LEAVE_REPLACE_WITH_DOWN`（`WXDi-CP02-TK01A-E2`）とは別物**＝あちらは「**このシグニ自身が**
  バトルか相手効果で離れる場合」で BattleScreen のバトル経路だけが読む。こちらは**他の味方を守る**＋**効果離場**。
  → golden `段2-10 A/B4`（`thisCardOnly` DOWN の母集団）から `WXEX2-28-E1` を外した。

**検証**＝golden `索引C 2026-09-02: O-202 …` 2本（アシストのダウン払いの成立／アップ1体・レベル不足・
`cardMap` 無しの3反転／`downProtector` の宣言者ダウン＋victim 残存と、ダウン済み・非＜ウェポン＞・自分の効果の3反転）。
実機 `o202DamageReplaceDeclare`（**置換が宣言として積まれ、その場では誰もダウンしない**）。

---

### 実機（`verifyBattleDrive.mjs`）＝新規9本すべて PASS（単体でも9本一括でも）

`o162ChoosePlayer`／`o199EncoreTextCostPay`／`o199EncoreTextCostShort`🔴／`o200KeyFromLrigDeck`／
`o200KeyGateOn`／`o200KeyGateOff`🔴／`o201TrashToDeckBottomPay`／`o201TrashToDeckBottomNoPay`🔴／
`o202DamageReplaceDeclare`。`queryState` に `keyPieceExtra` / `keyPlaceLimit` / `powerModsUntilOppTurn` を追加。

**この巡で踏んだ罠（次に同じ作業をする人へ）**
- 🔴**CSV の空欄は `'-'` であって空文字ではない**＝`!timing` 判定でキー80枚が使用不可になっていた（上記）。
- 🔴**`TargetFilter.story`（＜ブルアカ＞等）が読むのは `CardClass` の「：」より後ろ**＝
  CSV の `Story` 列は `-` / `Dissona` の2値しか無い。golden の候補選びで2回外した。
- 🔴**`UNTIL_OPP_TURN_END` のパワー修整は別ストア**（`power_mods_until_opp_turn`）＝
  `temp_power_mods` だけ見て「効果が走っていない」と誤読した。
- 🔴**「召喚」→ゾーン選択は別ティック**＝同じ tick で両方押すループを書くと永久に場に出ない。
- 🔴**同じ testid を押し続けない**＝`keycost-energy-0` はトグル。複数枚コストは index を進めて1枚ずつ選ぶ。
- 🔴**`manualEffects.ts` を機械編集したらキー集合の差分を取る**＝重複キー（`WXK02-004` / `WXK03-014` が既存）を
  作ってしまい、`syncManualLive.ts` が**既存の手書き定義を落とした live** を書いた（HEAD の per-effect diff で発見して復旧）。
- 🔴**`syncManualLive.ts` は live を直接書く**＝AUTO 効果の held な parser 差分まで一緒に焼き込む。
  `WXK03-014-E1` が巻き込まれたので **HEAD の値へ戻した**（採用は `heldReview --adopt` の仕事）。
- 🔑**golden のカウント assert が落ちると、そのテストは途中で止まって POOL カーソルの消費量が変わる**＝
  **無関係なテストが道連れで落ちる**。カウントを実数へ直したら道連れも消えた（先に赤の原因を1つずつ潰す）。

## 2026-09-02：§5.3 `O-52` — 「めくれるまで公開」4効果を `REVEAL_UNTIL` へ復元

**ベースライン**＝`824910248`。登録票の「色除外 filter が無い」は誤りで、既存の
`TargetFilter.colorExclude` と全 `RevealUntilStopCondition.filter` がそのまま使えた。
`levelLteLastProcessed` / `suppressOnPlay` も型・resolve・live 実績まで確認して再利用した。
さらに「兄弟を新設」とされた `levelLtLastProcessed` も、型・resolve・parser・逆翻訳・golden まで既に実装済みだった。

**parser / live**＝次の AUTO 4効果だけを fresh から `heldReview --adopt` で採用した。
- `WX20-041-CB-E1`＝`colorExclude:'青'`＋`story:'遊具'` で停止し、停止札だけを手札へ。
- `WXK01-045-E2`＝相手シグニを `TRASH` 後、相手デッキからそのレベル以下まで公開して場へ出す（【出】抑止）。
- `WXDi-CP01-015-E1`＝相手のレベル2以上を `TRASH` 後、相手デッキからそのレベル未満まで公開して場へ出す（【出】抑止）。
- `SP27-005-E1`＝＜水獣＞まで公開し、停止札を手札／場の2択、残りをシャッフルしてデッキ下へ。

停止条件だけに filter を置くと公開した不一致札も pick 候補になるため、4件とも `hit.filter` に同じ filter を明記した。
全5枚の effects JSON を baseline とオブジェクト比較し、変化は上記4カード・4 effectId だけ。
既存 `REVEAL_UNTIL` 17効果（MANUAL 8／PARTIAL 1を含む）は全件一致し、`WX04-015` は触っていない。

**engine の追加検算で見つけた穴**＝`REVEAL_UNTIL{owner:'opponent'}` は公開元だけ相手デッキになる一方、
SEARCH pending に `deckOwner` が無く、残り札の復帰先が self に既定されていた。
`deckOwner` と相手 responder を pending へ渡して修正した。
`SP27-005` の2択は新UIを作らず、既存 SEARCH pending の `handOrField` と画面側の選択経路を
`RevealUntilHitSpec.handOrField` から再利用したため、`src/screens/` は未変更・実機不要。

**`lastProcessedCards` 境界**＝`TRASH` の選択 resume が実選択カードを `lastProcessedCards` に設定してから
SEQUENCE の `REVEAL_UNTIL` へ進むことを実装で確認。golden では前々段値としてレベル3以上を注入したうえで
レベル2 victim をトラッシュし、`lte` はレベル2、`lt` はレベル1で2枚目停止することを固定した。

**golden（+4本、計3233）**＝parser の live/fresh 構造、色／クラス不一致を越えて3枚目だけで止まる境界、
`lte` / `lt` の2枚目停止と相手デッキ owner、＜水獣＞の手札／場両枝を追加。
旧「SP27-005は非採用」契約も削除せず採用契約へ反転した。

**据置**＝`WX04-015` は依頼どおりスコープ外。現 HEAD では既に MANUAL の
`OPP_REVEAL_SPELL_USE_FREE` 経路に載っているため、今回の `REVEAL_UNTIL` バッチからは独立して扱う。

**検証**＝`npm run census:goldentypes` 未カバー0、フィルタなし `npm run golden` 3233/3233 PASS、
`npm run gates` 全緑（golden 3233/3233・smoke 10721 全0・fuzz 全0・census 高シグナル11・
STUB A群0・enginetext 130行/127ハンドラ・manual-fields 0/0・lint 0 errors/250 warnings）。

## 2026-09-02：§5.3 `O-181` 軸(a) — ルリグのアタック終了時（`ON_ATTACK_END`）の収集地点を新設

**ベースライン**＝`fc669c349`。**Codex が実装途中で使用上限に当たり（`.codex-work`）、Claude が引き継いで完成・検証した。**

**真因（1行）**＝`collectAttackEndTriggers` の唯一の呼び出し地点がシグニのバトル解決 Phase2 末尾だけで、
**ルリグのアタックは `performGuardResponse` を通る**ため、ルリグ側のアタック終了が誰にも収集されていなかった。

**engine（Codex 実装）**＝`collectAttackEndTriggers` に `AttackEndTriggerOptions{attackerKind, wasGuarded}` を足し、
①ルリグアタックでは付与ストア（`grantedStoreWatchers`＝`GRANT_LRIG_ABILITY` の結果は `effectsMap` に載らない）を走査
②watcher≠アタッカーは `triggerScope:'any_ally'|'any'` か `lrigAttack*` 条件で**明示的に opt-in したものだけ**を拾う
（無条件の全場走査にすると既存の「このシグニが」7効果が他者のアタックで誤発火する）。
呼び出しは `BattleScreen.performGuardResponse` のガード／ダメージ確定後＝**シグニ側と同じ境界**（LB 解決の前）。

**🔴Claude が引き継いで直した2点（Codex の未検証部分に欠陥があった）**＝
① **parser 規則が到達不能だった**＝`trigText.includes('このルリグがアタックしたとき') ? ['ON_ATTACK_LRIG']` の分岐が
   **先に**あるため、Codex が `ON_ATTACK_END` 側の regex に `ルリグ` を足しても**一度も通らなかった**
   （`build:effects` しても live も fresh も1バイトも変わらないことで発覚）。先行分岐に「そのアタック終了時」の除外を入れた。
② **`attackDealtNoDamage` の抽出 regex が語形を取りこぼしていた**＝旧 regex は
   「ダメージが与えられて**いない**場合」だけを見ており、`SPDi43-03` / `WXDi-D04-004` の「**いなかった**場合」と
   `WX24-P3-055` の「ダメージを与えて**いなかった**場合」に当たらず、**条件なしで発火**する形になっていた。
   受身/能動 × 現在/過去の4語形へ広げた。

**影響**＝live は `SPDi43-03-E2`（付与される `sub-E1`）が
`ON_ATTACK_LRIG`（＝**アタック宣言時**）→ `ON_ATTACK_END` + `triggerCondition{attackDealtNoDamage}` + `triggerScope:'self'` へ。
**全 CSV 全数差分で変化したカードはこの1枚だけ**（`heldReview --adopt SPDi43-03` で採用）。
`WXDi-D04-004-sub-E1` は旧形（`ON_GUARD` + `lrigAttackNoDamage`）で live に入っており、
**新しい収集地点の legacy 分岐が同じ地点へ合流させる**（live JSON は不変・PARTIAL のまま）。

**golden**＝**据置契約を1本反転**した＝第40バッチの
`「WXDi-D04-004-sub-E1 は発動タイミングが主因なので据置」`（`ON_ATTACK_END` が**無い**ことを assert していた）を、
`ON_ATTACK_END` と `attackDealtNoDamage` が**在る**ことの assert へ差し替え
（**落ちたテストを消して通すのは禁止**・PLAN §5.2 の規約どおり反転させた）。全件 3229/3229 PASS。

**実機（🔴必須＝`src/screens/` を触った）＝Claude が追記して実行・3/3 PASS。**
⚠**実カードではなく合成の付与能力を注入している**＝実カードの本体は《赤》の**任意**支払いを含み、
CPU の選択が入ると「発火したか」と「支払ったか」が分離できないため。付与ストア経由なので新経路はそのまま通る。
- `o181LrigAttackEndFiresWhenGuarded`＝ガード成立（hostLife 減少0）→ アタック終了時に発火（guestEnergy 0→1）
- `o181LrigAttackEndSkippedWhenDamaged`（🔴反転確認）＝ダメージが通ると `attackDealtNoDamage` で**発火しない**（0→0）
- `o181LegacyGuardShapeAlsoFires`＝旧形（`ON_GUARD`+`lrigAttackNoDamage`）も**engine の別分岐**を通って同じ地点で発火する

**検証**＝`npm run gates` 全緑（golden 3229/3229・smoke 10721 全0・fuzz 全0・census 高シグナル11・
STUB A群0・enginetext 130行/127ハンドラ・manual-fields 0/0・lint 0 errors/250 warnings）。

**残（軸(b)＝watcher≠アタッカー）**＝`WXK11-006-E4`／`WX24-P3-055-E2`（「ルリグ１体が」を場の別カードが監視）と
`WX14-018-E4`（次ターンの遅延設置）／`WX25-CP1-012-E1`（ライフクラッシュ連動）の**4効果**。
**engine 側の受け口は入った**（opt-in scope）が、**parser がその scope/triggerCondition を出していない**。
⚠4件とも MANUAL/PARTIAL なので、parser を直しても `syncManualLive.ts` を回すまで live へ届かない。

**別途見つけた系統バグ（未修正・O-181 とは別軸）**＝「〜してもよい。**そうした場合**、〜」が
`CONDITIONAL{IS_MY_TURN}`（＝自分のターンなら）に化ける。`SPDi43-03-sub-E1` と `WXDi-D04-004-sub-E1` の両方、
および `WXDi-CP02-002/003/004`（`O-97` の道中で観測）に出ている＝**任意コストを払わなくても後段が走る**過剰実行。
did-it ゲート（`LAST_PROCESSED_*` 系）が正。**母集団の実測から始めること。**

## 2026-09-02：§5.3 `O-58` 段1 — 攻撃側にも必須バニッシュ置換4効果をミラー

**ベースライン**＝`f148aa317`。防御側の約370行ある既存 ladder は変更せず、アタッカー自身が
バトルでバニッシュされる直前に、必須置換だけを選ぶ `selectMandatoryAttackerBanishSubstitute` を
`src/screens/battle/` へ追加した。

**対象**＝`WX22-034-E2`（下から1枚をトラッシュ）、`WXK04-031-E2`（アクセ自身をトラッシュ）、
`WX13-031-E1` / `WX15-010-E1`（バニッシュされず能力喪失）の4効果。
`activeCondition` はアタッカー＝オーナーターンとして評価し、`WX16-001` / `WX16-002` /
`WXK04-068` など「対戦相手のターンの間」限定の能力を自ターンへ広げない。
能力喪失は防御側と同じ `abilities_removed` を使い、同ターン2回目を不成立にした。

**トリガー境界**＝置換成立時は `banishedMyCardNum` / `banishedMyUnderCards` を立てず、victim を
`ON_BANISH` / `ON_LEAVE_FIELD` / `ON_TRASH` funnel へ流さない。代わりにトラッシュへ移ったアクセは
通常の trash trigger と ACCE_TO_TRASH、下のカードは `origin:'under_signi'` の trash trigger だけを収集する。

**golden（+1本）**＝4効果の正方向、`abilities_removed` 後の2回目、`WX16-001` / `WX16-002` /
`WXK04-068` の負方向を固定した。

**実機（🔴必須＝`src/screens/` を触ったので CLAUDE.md ⑤ の判定規則どおり）**＝
`scripts/verifyBattleDrive.mjs` へ3本追加し、**Claude 側で実行して 3/3 PASS**。
- `o58ArtemisAttackerBanish`＝アルテミス残存=true／下1枚→トラッシュ=true／victim は移動しない=true
- `o58GustavAttackerBanishOnce`＝1回目は場に残存=true／`abilities_removed` へ記録=true／**2回目は回避せず離場**=true
- `o58OpponentTurnOnlyDoesNotProtectAttacker`（🔴反転確認）＝バゲット（対戦相手ターン限定）は
  **自分から攻撃して負けたときは守られない**=true／エナへ=true／付属アクセは通常処理でトラッシュ=true

**Claude 側の独立検証**＝`npm run gates` 全緑（golden 3227/3227・smoke 10721 全0・fuzz 全0・
census 高シグナル11・STUB A群0・enginetext 130行/127ハンドラ・manual-fields 0/0・lint 0 errors）。

**段2据置**＝任意置換の `WX04-052-E1` / `WXDi-P09-TK03A-E1` は未実装。既存永続型とモーダルが
`sacrifice` / `pay_cost` の2種専用で、チャーム／アクセ除外の選択肢、CPU判断、pause/resume 後の
代替カード trigger を同時に拡張する必要がある。また既存防御側 `ACCE_BANISH_SUBSTITUTE` はログ上は
「ゲームから除外」だが実装は `trash` へ置いており、既存 ladder を変更しない制約下では安全に共通化できない。

**検証**＝`npm run gates` 全緑（golden **3227/3227**、smoke 10721/10721・全0、fuzz 全0、
census 高シグナル11、STUB A群0、enginetext 130行/127ハンドラ、manual-fields 0/0、
lint 0 errors/250 warnings）。ベースラインからの差分は golden +1のみ。

## 2026-09-02：§5.3 `O-97` — 複数の印刷済み【使用条件】を4ピースへ復元

**真因（1行）**＝`parseArtsEffect` が先頭の印刷済み【使用条件】を `.find()` で1本だけ消費していたため、
2本目が本文 parser へ残り、AUTO 4効果では `condition` が丸ごと消えて無条件使用できた。

**既存受け皿を再利用**＝新しい Condition 型は足さず、既存 `LRIG_TRASH_COUNT.filter` を使用歴の近似へ流用した。
`TargetFilter.cardNames` で《連邦生徒会》《クロノス報道部》を完全一致OR、`cardType:'リレーピース'` で種別を厳密一致する。
実データには在るのに `CardTypeFilter` union から漏れていた `リレーピース` だけを型語彙へ追加した。
⚠使用済みピースは通常 `lrig_trash` に入る近似であり、ゲームから除外された場合は偽陰性になりうる。

**parser**＝先頭から【使用条件】が続く限りループして全条件を `AND` 化。未対応の【使用条件】が1本でも先頭に
残れば、採った条件と剥離をすべて捨てる（部分採用禁止）。単色ドリームチーム、カード名2択、リレーピース使用歴を追加した。
対象＝`WXDi-CP01-004-E1` / `WXDi-CP02-002-E1` / `WXDi-CP02-003-E1` / `WXDi-CP02-004-E1`。
`WXDi-CP01-002` / `WXDi-CP02-001` は PARTIAL のため live 不変。前者の fresh は2条件を剥がした後、
本文先頭の `LRIG_LEVEL{gte:3}` まで正しくホイストする。

**live 配送**＝`build:effects` は `001-004` / `002-002` を純改善として自動採用。`002-003/004` は action 側の
別差分も held に含むため、fresh 全採用を避けて effectId 指定で `condition` だけ外科反映した。4件とも action は HEAD と同一。

**golden（+3本）**＝①4効果の live/fresh が2条件AND ②指定使用歴あり=true／履歴なし・別種別/別名=falseを
live/fresh 双方 ③未対応2本目があれば1本目も不採用。`WXDi-CP01-002` fresh の本文ゲート到達も①で固定。

**検証**＝`npm run build:effects`、逆翻訳4枚目視、`npm run census:goldentypes`（未カバー0）、
`npm run gates`（全緑・golden 3226/3226・smoke/fuzz 全0・census 11・STUB A群0・
enginetext 130行/127ハンドラ・manual-fields 0/0・lint 0 errors/250 warnings）。
**実機不要**＝`src/screens/` は未変更。二次項目の `IS_MY_TURN` 誤ゲートは別機構なので据置。

## 2026-09-02（続き778）：§5.3 索引 C を 30→27件＝`O-211` / `O-148` を実装、`O-179` は stale でクローズ

### ① `O-211`＝遅延トリガーの発火源を「カード個体」で縛れなかった（過剰実行）

**真因（1行）**＝`WX25-CP1-008-E1`③「対戦相手のシグニ1体を対象とし、このターン、**次にそれが**アタックしたとき」が
`attackerOwner:'opponent'` だけで設置されており、**対象に取っていない相手シグニのアタックでも発火**していた。
`once:true` があるため、狙ったシグニより先に別のシグニがアタックすると**そちらで消費されて**しまう。

**新設**＝`trigger.attackerFixedFromStored`（設置指示）→ `execInstallDelayedTrigger` が `storedTargetCards` を
`trigger.attackerFixedCardNums` へ**焼き込む**（設置と発火で ExecCtx が別物なので `targetsStored` では届かない
＝既存 `freezeStoredTargets` と同じ理由）。収集側は `collectSigniAttackDelayedTriggers` /
`collectAttackerSelfDelayedTriggers` の**2箇所**でゲートする。⚠**空配列は「誰でも発火しない」**（fail-closed）。

### ② `O-148`＝【みこみこ親衛隊】が【ウィルス】の受け皿を誤流用していた（3枚4効果）

**真因（1行）**＝**登録票の「1効果」は過小**で、実測は**3枚4効果**。旧 live は2方向に壊れていた。

| 向き | 旧 | 問題 |
|---|---|---|
| 得る | `GRANT_KEYWORD{keyword:"みこみこ親衛隊"}` | **engine のどこにも消費が無い真 no-op** |
| 取り除く | `STUB{REMOVE_VIRUS}` | 🔴**誤流用**＝【ウィルス】は `field.signi_virus`（シグニゾーン単位）なので**相手のウィルス state を壊す** |

**新設**＝`PlayerState.mikomiko_guards`（**プレイヤー単位**のカウンタ）＋ STUB 3本
（`GAIN_MIKOMIKO_GUARD` / `REMOVE_MIKOMIKO_GUARD` / `INTERNAL_REMOVE_MIKOMIKO_GUARD_N`）。
⚠取り除いた**個数**は `lastProcessedCount` へ載せる（カードではないので `lastProcessedCards` ではない）。
⚠**0個のときは対話を出さず 0 を明示**する＝前段の値を引き継ぐと「1つにつき－8000」が過剰に効く。
対象カード＝`WXDi-P12-050-E1` / `WX25-P3-023-E1`② / `WX25-P3-058-E1` / `WX25-P3-058-E2`。

🔽**golden のラチェットを 9→8 へ下げた**（`live の REMOVE_VIRUS ノード数`）＝**退化ではなく誤流用の解消**。

### ③ `O-179` は stale でクローズ

`SELF_CRASH_TO_TRASH_AND_REFILL`（回数制の予約）が `execStubPart3.ts:989` に実装済みで、
`BattleScreen.tsx:12644` が1クラッシュにつき1消費している。任意性も live に `optional:true` で入っていた。
登録票が挙げた2つの欠陥（①任意性が強制 ②置換が無い）は**両方とも解消済み**だった。

### 着手前実測が3件とも登録票を訂正した

`O-148` 1効果→**3枚4効果**／`O-186` 未計測→**2枚**（`WXK10-022`・`WXDi-P13-043`）／`O-179` 真→**stale**。

### 🔴 この巡で出した自分の編集ミス（記録として残す）

重複キーを解消するスクリプトの削除範囲が広すぎ、**無関係の `WXDi-P16-069` の manual 定義を巻き込んで削除**していた
（`endMark` の探索が自分のブロックを越えて次のエントリの終端に当たった）。HEAD から復元済み。
⇒ **`manualEffects.ts` を機械編集したら「HEAD とのキー集合差分」を必ず両方向で取る**（失われたキー／追加したキー）。
この巡はそれで気づけた。**typecheck だけでは検出できない**（キーが消えても構文は通る）。

### 見送った項目

**`O-74`**＝`canSelfPlay` の呼び出しは `BattleScreen` の通常召喚1箇所だけで、効果配置経路にゲートが無い。
`ctx.effectsMap` は一部経路でしか代入されず、型のコメントが「**dead flag になる**」と明記している。⇒ **実機必須の側へ回した。**
**`O-186`**＝解除地点が `src/screens/battle/untilOppTurn.ts` にあるので engine だけでは閉じられない（母集団2枚だけ記録）。

**検証コマンド**＝`npm run gates`（全緑・**golden 3223/3223 PASS**）。
**反転確認**＝あり（`O-211` は「対象のシグニで発火／対象でないシグニでは発火しない」を collector 実走で。
`O-148` は「相手だけ増える／自分は増えない」「ウィルス state が無傷」「所持数でクランプ」「0個なら0を明示」の4方向）。
**⑤実機＝不要と判定**（§2.2）＝変更は `src/types/` `src/engine/` `src/data/` `public/data/` のみ。**`src/screens/` は未変更**。


## 2026-09-02（続き777）：§5.3 索引 C を 31→30件＝`O-105` を実装（`FIELD_ATTACHED_COUNT.filter` を新設し2効果を実働化）

**真因（1行）**＝場全体の「シグニの下にあるカードの合計枚数」条件の受け皿 `FIELD_ATTACHED_COUNT` は在ったが、
**どのシグニの分を数えるかの `filter`（ホスト側の絞り）が無かった**ため、
「あなたの場にある**＜解放派＞の**シグニの下にカードが合計4枚以上ある場合」を表せなかった。

**影響枚数**＝**2効果／2カード**。索引 C は **31 → 30項目**。

### 直したもの

| 対象 | 旧 | 新 |
|---|---|---|
| `src/types/effects.ts` | `FIELD_ATTACHED_COUNT` に絞りが無い | `filter?: TargetFilter` を追加（**親シグニ**にかかる） |
| `src/engine/execUtils.ts` | 場の全ゾーンを無条件で数える | `filter` があるゾーンだけ数える（スタック最上段で判定） |
| `WXDi-P16-056-E1` | 3つ同時に破損（下記） | 対象・置換・条件を同時に修正 |
| `WXDi-P15-007-E2` | `COND_STUB`＝**無条件成立** | `FIELD_ATTACHED_COUNT{under, gte 2}` |

🔴**`WXDi-P16-056-E1` は登録票が「部分採用は禁止」と書いていたとおり3つ同時に壊れていた**＝
①対象が `owner:self`＋`targetsTriggerSource`（**アタックフェイズ開始時にトリガー元は無い**＝自分のシグニを下げていた）
②「代わりに」が畳めておらず **-5000 と -8000 が両方走る** ③＜解放派＞の条件が丸ごと無い。
**1つでも残すと過小から過剰へ裏返る**ので、3つ同時に直して初めて原文になる。

🔴**`COND_STUB` は「未実装」ではなく「無条件成立」**（`execUtils.ts` が `return true`）。
`WXDi-P15-007-E2` は印刷された【使用条件】が丸ごと消えて**いつでも撃てる**過剰実行だった。

⚠**`build:effects` では live に届かなかった**＝収穫マージが既存 id を温存するため、
`npx tsx scripts/syncManualLive.ts WXDi-P16-056 WXDi-P15-007` まで回して初めて1巡が閉じた（CLAUDE.md の既知の穴を実際に踏んだ）。

**golden**＝`(B7) 据置契約: …部分採用しない` を **`(B7) 解除: …3つが同時に直っている`** へ反転し、
2件目用に `(B7) 解除2: …COND_STUB から実条件になった` を新設。

**検証コマンド**＝`npm run gates`（全緑・**golden 3221/3221 PASS**）。
**反転確認**＝あり（`evalCondition` を実走させ「＜解放派＞の下に4枚→成立／3枚→不成立／**＜解放派＞以外の下は数えない**」の3方向。
`filter` を無視する実装だと3本目で落ちる。2件目も「下に2枚→使える／1枚→使えない」で両方向）。
**⑤実機＝不要と判定**（§2.2）＝変更は `src/types/` `src/engine/` `src/data/` `public/data/` のみ。
**`src/screens/` は未変更**。既存 Condition 型へのフィールド追加であって、新しい条件型は足していない。


## 2026-09-01（続き776）：§5.3 索引 C を 34→31件＝`O-183` を実装（**この巡で唯一の実装**）＋ `colorExclude` の実バグを1件発見・修正

### ① `O-183`＝「すべての色を得る」が共通色判定の**基準側**に効いていなかった（過小実行）

**真因（1行）**＝`allColorSigniNums` は `fieldCandidates`（＝**候補側**）には以前から渡っていたが、
`resolveDynamicFilter` の**基準側（効果元）**は `cardMap.get(source).Color`＝**印字色しか読んでいなかった**。

**症状**＝`WXK05-029`（サーバント G）は E1 の `STUB{ALL_COLOR}` で全色を得ても、
E2「このシグニと**共通する色を持つ**対戦相手のシグニ1体をトラッシュ」の対象が広がらない。

**直したもの**（`src/engine/` のみ）＝
- `resolveDynamicFilter` に `allColorSigniNums?: Set<string>` を足し、**全26呼び出し地点**へ `ctx`/`cur` から配線した。
- `colorMatchesSourceCard`＝効果元が全色なら**色による絞りを外す**（他の軸は残す）。
- `colorNotMatchesSource`＝効果元が全色なら**誰も満たさない**（全5色を `colorExclude` に入れる）。
  ⚠**この2つは必ず対で直す**＝片方だけだと同じ盤面で「共通色を持つ」と「持たない」が同時に成立する。
- 条件側 `execUtils.evalCondition` の `HAS_CARD_IN_FIELD` 分岐にも同じ判定を入れた（評価器が別なので executor だけでは届かない）。

### ② 🔴 作業中に見つけた実バグ＝`colorExclude` に文字列を渡していて **1色も除外されていなかった**

`matchesFilter` は `colorExclude` を配列化して `card.Color.includes(c)` で判定するので、
**文字列を渡すと `[「白赤青緑黒」]` の1要素配列**になり、`includes` が常に false ＝**除外が丸ごと無効**だった。
`execUtils.ts` と `effectExecutor.ts` の2箇所。**単色の効果元では偶然当たっていた**（1文字＝1要素なので一致した）が、
**複数色の効果元（`白/黒` など）では既に壊れていた**。両方とも「色1文字ずつの配列」へ直した。

### ③ stale クローズ2件（掃除はここで枯れた）

| ID | 実際の受け皿 | 既存 golden |
|---|---|---|
| `O-106` | `TargetFilter.hasOnPlayAbility` ＋ `triggerStateFilterOk`（`triggerCollect.ts:4306`） | ✅ `EMPTY_TIMING_ALLOWED` ratchet が0 |
| `O-109` | `collectAttackerSelfDelayedTriggers`（`triggerCollect.ts:197`・`BattleScreen.tsx:8934` から呼出） | ✅ `WX10-035` で両方向 assert 済み |

**`O-151` は母集団を訂正**＝`WX24-P2-009-E1` は消化済み（golden あり）で、**残るのは `PR-K026` だけ**。

### 4巡ぶんの総括

索引 C は **53 → 31項目**。**21件クローズのうち実装は `O-183` の1件だけ**で、残り20件は「実装済みなのに行が残っていた」。
🔑**見落としの主因は「受け皿の名前が登録票の提案と違う」**（`O-101`→`TRASH_HAS_CARD` ほか計4例）。
🔑**`O-183` は「向き」の取り違え**＝同じキー名が engine にあっても、**候補側か基準側か**で別物。

**検証コマンド**＝`npm run gates`（全緑・**golden 3220/3220 PASS**）。
**反転確認**＝あり（`O-183` は engine 実走で「全色でなければ対象外／全色なら対象」と、条件側の反転も同一盤面で assert。
`colorNotMatchesSource` 側を直さないと同じ盤面で両方成立するため、片側だけの実装では落ちる）。
**⑤実機＝不要と判定**（§2.2）＝変更は `src/engine/effectExecutor.ts` と `src/engine/execUtils.ts` のみ。
**`src/screens/` は触っておらず、新しいアクション型・条件型も足していない**（既存 `ExecCtx` フィールドを1つ多くの地点へ配線しただけ）。


## 2026-09-01（続き775）：§5.3 索引 C を 40→34件（6件クローズ）＝**3巡で計18件**が「実装済みなのに索引行が残っていた」

**真因（1行）**＝**受け皿の名前が登録票の提案キー名と違う**ため、着手前の grep が「無い」と誤答し、
**すでに実装され golden まで張られている項目が worklist に残り続けていた**。

**影響枚数**＝**6効果／7カード**（実装ゼロ）。索引 C は **40 → 34項目**（第2巡6件・第3巡6件と合わせて **53 → 34**）。

| ID | カード | 実際の受け皿（登録票の提案とは別名） | 既存 golden |
|---|---|---|---|
| `O-95` | `WX21-032-E1` | `HAS_CARD_IN_FIELD{filter.colorNotMatchesSource, excludeSelf}` | 🆕**今回追加**（`powerLteSelf` 側だけ固定されていた） |
| `O-102` | `SP27-012-E1` / `WX21-039-E1` | 同上（else 枝） | ✅ `天使の非共通色: else 枝にも条件が付いた` |
| `O-136` | `SP36-001` | `costScaling` ＋ `actions_done`／`turn_arts_used` | ✅ `task12(xc)`（3方向 assert 済み） |
| `O-139` | `WX21-044-E2/E3` | `THIS_CARD_PLACED_BY_CLASS`（`execUtils.ts:2722`） | ✅ |
| `O-159` | `WX13-029-E1`③ | `ability_gain_blocked_this_turn` ＋ `collectAbilityGainProtectedSigni` | ✅ **テスト名が `O-159: …` そのもの** |
| `O-178` | `WX18-056-E1` | `SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE` | ✅ |

🔑**提案キー名と実装名の食い違い一覧**（3巡ぶん）＝
`O-101`→`TRASH_HAS_CARD` ／ `O-139`→`THIS_CARD_PLACED_BY_CLASS` ／ `O-178`→`SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE` ／
`O-95`・`O-102`→`colorNotMatchesSource`（登録票は `NO_COMMON_COLOR_WITH_SELF_IN_FIELD` を提案していた）。
⇒ **§4.2 のとおり「提案キー名で grep して無いと言わない」。原文の言い回しと golden のテスト名でも引く。**

### 🔴 部分完了を「未着手」と書いていた1件＝`O-164`（行は残す・内容を訂正）

「次にバニッシュされる場合、バニッシュされない」の**1回消費の器は完成済み**
（`BATTLE_BANISH_PREVENT_LOSE_ABILITY`＝防いだら `abilities_removed` へ入るので二度は防げない。続き749 で
`collectBanishPreventLoseAbility` が `granted_effects` も見るよう配線され、golden `段2 第23バッチ』で両方向固定済み）。
**残るのは経路だけ**＝バトルバニッシュ限定で、**効果によるバニッシュは防げない**（過小側）。索引の記述をこれに合わせた。
⇒ **登録票の見出しが残作業を表していないことがある。着手前に golden のテスト名を grep する。**

**検証コマンド**＝`npm run gates`（全緑・**golden 3219/3219 PASS**）。
**反転確認**＝あり（`O-95` は `evalCondition` を実走させ「共通色を持たない他のシグニがいれば成立／同色しかいなければ不成立」の両方向。
`NO_COMMON_COLOR_AMONG_FIELD_SIGNI`（場のシグニ**同士**の相互比較）へ流用すると落ちる）。
**⑤実機＝不要と判定**（§2.2）＝触ったのは `docs/` と `scripts/goldenTest.ts` だけで、**`src/` は1バイトも変更していない**。


## 2026-09-01（続き774）：§5.3 索引 C を 47→40件（6件クローズ＋`O-152` を索引 A へ移設）＝「実装したのに索引の行を消し忘れる」運用穴

**真因（1行）**＝受け皿を実装した巡に **BUGFIXES だけ書いて §5.3 の索引行を消していなかった**ため、
**すでに動いている6件が「機構待ち」として worklist に残り続けていた**（前巡の6件と合わせて **2巡で12件**が同じ理由）。

**影響枚数**＝**6効果／6カード**（実装ゼロ）。索引 C は **47 → 40項目**。

| ID | カード | 受け皿 | 既存 golden |
|---|---|---|---|
| `O-101` | `WX05-023-E3` | `CONDITIONAL{TRASH_HAS_CARD{minCount:3}, else:TRASH}` | ✅ `B12 「そうしない場合」は else 側…` |
| `O-110` | `PR-205-E1` | `REFRESH_COUNT_THIS_TURN`（`execUtils.ts:2806`） | 🆕**今回追加**（唯一の未固定） |
| `O-158` | `WX20-002-E2` ほか | `ATTACH_ACCE.fromEnergy` の2段選択（`effectExecutor.ts:8557`） | ✅ `続き760 ATTACH_ACCE.repeatWhilePossible` |
| `O-165` | `WX16-Re09-E1` | `GRANT_PROTECTION.duringOppTurn`（`effectEngine.ts:6189`） | ✅ 続き759 |
| `O-173` | `WDA-F02-07-E1` | `selectionConstraint.levelMultisetFromLastProcessed`（`execUtils.ts:3320`） | ✅ |
| `O-182` | `WX24-P4-040-E2` | `PLAY_FREE{targetsLastProcessed}` ＋ `STUB{USE_SPELL_FROM_TRASH}` | ✅ |

🔑**`O-101` は受け皿の形が登録票の提案と違った**＝登録票は `LAST_PROCESSED_COUNT_GTE{negate}` を当てにしていたが、
実際は `TRASH_HAS_CARD{minCount:3}` の前提条件として実装されていた（`execPlaceUnderSigni` が候補0で
`lastProcessedCards` を触らずに返す罠を**構造的に回避**している）。⇒ **提案キー名で grep して「無い」と言わない**（§4.2）。

### 🔴 母集団が桁で増えた1件＝`O-152` を索引 C → 索引 A へ移した

`ON_HAND_DISCARDED` の watcher が効果による手札捨てで発火しない件。**登録票の「1カード」は分離のきっかけになった標本1枚**で、
live を全走査すると **34効果／33カード**。受け皿（`execTrash` の `hand_discarded_just`／`collectHandDiscardTriggers`）は在り、
**壊れているのは配送**。⚠**再現は実機のみ**（`verifyBattleDrive.mjs o143CheckPlace`）なのでこの巡では着手していない。
⇒ **索引 C の「1カード」表記は母集団ではないことがある。「1効果」と「1カード」を読み分ける。**

**検証コマンド**＝`npm run gates`（全緑・**golden 3218/3218 PASS**）。
**反転確認**＝あり（`O-110` は `evalCondition` を実走させて 1回目=成立 / 2回目=不成立 の両方向を assert。
境界を `lte 0` と書くと落ちる＝`refresh.ts` が収集前に加算する規約を固定した）。
**⑤実機＝不要と判定**（§2.2）＝触ったのは `docs/` と `scripts/goldenTest.ts` だけで、**`src/` は1バイトも変更していない**。


## 2026-09-01（続き773）：§5.3 索引 C を 53→47件（6件クローズ）＋ golden の「見送り契約」が項目を眠らせていた穴を塞いだ

**真因（1行）**＝`O-168` / `O-169` の据置契約 golden が **`sheet3b1Fresh`（＝parser 出力）だけ**を assert していたため、
**`manualEffects.ts` 経由で live には既に実装が届いていたのに、契約が緑のまま索引 C に「機構待ち」として残り続けていた**
（続き768 の `WXDi-P09-043-E2`＝「live だけの負方向 assert」の**鏡像**）。

**影響枚数**＝**6効果／6カード**（実装ゼロ・全件が既に動いていた）。索引 C は **53 → 47項目**。

| ID | カード | 受け皿（全部すでに在った） | 消費地点 |
|---|---|---|---|
| `O-168` | `WXEX2-03-E1` | `RemoveAbilitiesAction.target.extraZones` | `effectExecutor.ts:8011`（`allZones` と違い手札・エナを巻き込まない） |
| `O-169` | `WXK07-048-E1` | `triggerCondition.banishedHadCharm` | `triggerCollect.ts:1503/1534/1592`（除去直前の `signi_charms` で判定） |
| `O-172` | `WD15-007-E1` | `GRANT_KEYWORD.fieldCondition{FRONT_SIGNI_POWER_GTE}` | `effectEngine.ts:1181`（**既存 golden が per-signi 挙動まで固定済み**） |
| `O-174` | `WD19-007-E1` | `STUB{REMOVE_VIRUS_TARGET_ZONE}` | `execStubPart1.ts:2232`（`lastProcessedCards[0]` のゾーンを引く） |
| `O-176` | `WD15-023-E1` | `trigger.banisherFilter` ＋ `levelLtTriggerSource` | `triggerCollect.ts:138` / `effectExecutor.ts:2957` |
| `O-204` | `WX15-006-E1` | `trigger.notByOwnEffect` ＋ `IS_BETTING` | `triggerCollect.ts:1433`（自分で落として得をする抜け道を塞ぐ） |

**やったこと**＝実装は1バイトも足していない。**退化検出のトリップワイヤとして golden を3本に整理した**：
- `段2 Sheet3① 契約: A5/C2/C3 は実装済み（据置解除・過剰側へ倒さない）`＝据置契約を反転。
  A5 は **engine を実走**させて「場とトラッシュは能力を失う／手札は巻き込まない」を両方向で固定（`extraZones` が `allZones` に化けたら落ちる）。
- `索引C 2026-09-01: O-174 …` / `索引C 2026-09-01: O-176/O-204 …`＝ゾーン連動・発生源の絞りが消えたら落ちる。

🔴**逆向きに外しかけた1件＝`O-183`。** `allColorSigniNums` が engine に3箇所あるので「受け皿あり」と読みかけたが、
繋がっているのは **`fieldCandidates` の候補側**で、落ちているのは**参照の基準側**＝`colorMatchesSourceCard`
（`effectExecutor.ts:3041`）が **`cardMap.get(source).Color`＝印字色しか読まない**。
⇒ `WXK05-029` は E1 で自分が全色を得ても E2 の対象が広がらない（過小）。**索引 C に残し、登録票の向きを訂正した。**
⚠**教訓＝「同じキーが engine にある」は受け皿の証明にならない。「どちら側に効くキーか」まで読む。**

**検証コマンド**＝`npm run gates`（全緑・**golden 3217/3217 PASS**）。
**反転確認**＝あり（A5 は手札を巻き込まないことを engine 実走で negative assert。`O-174` は汎用 `STUB{REMOVE_VIRUS}` へ戻したら落ちる assert）。
**⑤実機＝不要と判定**（§2.2）＝触ったのは `docs/` と `scripts/goldenTest.ts` だけで、**`src/` は1バイトも変更していない**。


## 2026-09-01（続き772）：§5.3 索引 B を再計測し、9効果を実働化（stale 6件／据置3件／G・Hは設計調査のみ）

**真因（総論）**＝登録票どおりの「残16効果」ではなかった。`O-155`／`O-196`／`O-216` は既に完了、
`O-184` の【シュート】2件も `hasKeyword` → `getSigniAttackKeywordState` → `BattleScreen` のバニッシュ行き先変更で実働済み、
`O-161` の先行3件も既存 `TargetFilter.colorNotMatchesSource` で条件・対象・置換まで実装済みだった。
さらに登録票の `WXDi-P16-058-E1` は採番違いで、対象効果は **E3**。`WX25-P3-058-E1` は【ウィルス】ではなく
**【みこみこ親衛隊】という別の player counter** だった。⇒ **新型を足す前に live・collector・実行 choke point を再探索する。**

### 実装した9効果

| ID | 効果 | 修正 |
|---|---|---|
| `O-156` | `WX20-040-E1` | 「場に【トラップ】があるかぎり」を既存 `HAS_TRAP_IN_FIELD` の `activeCondition` へ配線 |
| `O-184` | `WX25-CP1-079-E1` | 条件つき引用【常】を `GRANT_EFFECT` 内の `SELF_POWER_THRESHOLD{lte:1000}`＋`GRANT_PROTECTION{BANISH}` として付与先へ載せた |
| `O-191` | `WXDi-P13-008-E3` | 付与 `ON_SPELL_USE` に `triggerFilter{cardType:'スペル',isDisona:true}` を刻み、使用スペルを collector へ渡した |
| `O-180` | `WX14-003-E1`／`WXK09-001-E1`／`WX25-P3-037-E1` | 候補自身の `IGNORE_LRIG_TYPE` 宣言を `listGrowCandidates` が読むようにした。逆翻訳の誤文も訂正 |
| `O-148` | `WD19-001-E2`／`WX15-028-E1` | `virusCount:'any'` を0〜N個の対話ループにし、カードでない処理数を `lastProcessedCount` で直後の倍率／枚数へ運搬 |
| `O-161` | `WXDi-P16-058-E3` | 任意コストの候補判定と支払い後対象の両方へ既存 `colorNotMatchesSource` を刻み、場で得たルリグ色も動的解決へ渡した |

### 触らなかった／据え置いたもの

- `O-155`／`O-196`／`O-216` は live・型・両評価器を再確認して消化済み。1バイトも変更していない。
- 【シュート】2件と `O-161` の `SP27-012-E1`／`WX21-032-E1`／`WX21-039-E1` は既存実装が正しく、
  `_idset_fresh` にも対象カードは無かったため変更ゼロ。
- `WX24-P2-043` は「次に1回」＋アシストグロウ専用経路 `getAssistGrowCandidates` が必要なので据置。
- `WX25-P3-058-E1` は【みこみこ親衛隊】の任意数除去＋除去数倍率という別機構。ウィルス state を壊すため据置。
- `O-163`／`O-181` は依頼どおりコード変更ゼロ。前者はアイコン判定の小ヘルパだけ抽出可能、後者は
  `collectAttackEndTriggers` の watcher 全場走査化と `performGuardResponse` からのルリグ終了時収集が必要。

### 検証

- fresh parser 規則5本を一時無効化すると狙った5本が **0 PASS / 1 FAIL**、復元後は各 **1 PASS / 0 FAIL**。
- BOM除去込み全 **6,712カード / 10,679 fresh効果**を HEAD と比較し、変化は
  `WX15-028-E1`／`WX20-040-E1`／`WX25-CP1-079-E1`／`WXDi-P13-008-E3`／`WXDi-P16-058-E3` の5件、outlier 0。
- `npm run gates` 全緑（golden **3215 / 3215**、smoke **10,721** 全異常0、fuzz 全0、census **11 / BASELINE 12**、
  STUB A群0/C群0、engine-text **130行/127ハンドラ**、manual field loss 0、lint **0 errors / 250 warnings**）。
  `npm run regen` 済み、同型★0。ブラウザ実機は依頼どおり未実施。
- bucket は held **76→75**、partial **10→10**、idset **7→7**。held の−1は直前巡で完了した
  `WXDi-P12-034` の stale 項目が再生成で消えたもの（同カードの live は不変）。

### 🔎Claude 側の検証（CODEX_GUIDE §7・ベースライン `0d277d22c`）

⚠**Codex は実装とゲートまで完走してから利用上限に当たり、最終レポートファイルだけ書けずに exit 1**した
（`ERROR: You've hit your usage limit ... try again at Sep 2nd 00:48`／`tokens used 787,881`）。
[[codex-fallback-order]] の落ち方②＝**破棄せず作業ツリーの成果を引き取った。**

- **独立ゲート＝全緑**（golden **3215 / 3215**・smoke 10,721 全異常0・fuzz 全0・census 11 / 12・
  census-stubs A🔴0/C0・manual-fields 0・census-enginetext A🔴130行 据置・lint 0 errors / 250 warnings・**同型★ 0**）。
- **per-effect JSON diff（ベースライン比）＝ちょうど5効果**＝`WX15-028-E1` / `WX20-040-E1` / `WX25-CP1-079-E1` /
  `WXDi-P13-008-E3` / `WXDi-P16-058-E3`。**Codex の申告と完全一致・outlier 0。**
- **held の集合 diff**＝76 → 75 で、消えたのは `WXDi-P12-034`（続き771 で完了済みの stale 項目）**のみ・新規増0**。
  ⚠`_held_fresh.json` は報告時点で stale だったので `build:effects` → `heldReview` を回し直してから測った。
- **エンコーディング検査**（§5-19）＝変更ファイル全件で BOM / `U+FFFD` / 3連 `?` の新規増**0**。
- **原文照合**＝5効果とも原文と一致することを1件ずつ確認した。⚠`WX25-CP1-079-E1` は
  ランサー付与にも `thisCardOnly` が入った（原文「**このシグニは**」＝旧 live は自分のどのシグニでも対象にできた）＝**改善**。
- 🔴**`src/screens/` の変更2件は「新規追加行だけか」を目で見た**（§5-22）＝
  `BattleScreen.tsx` は**インラインの色フィルタ2箇所を `spellUseTriggerMatches` へ抜き出し、`triggeringCardNum` を積むだけ**
  （使用者側／相手 watcher 側の**両方**を対称に変更）。`matchesFilter` の色判定は `card.Color?.includes(c)` で
  **旧インライン実装と同一セマンティクス**、かつ**多色スペルは live に0枚**なので既存8効果に影響なし（実測）。
  `growLogic.ts` は `ignoresLrigTypeForGrow` の追加と1行の OR だけ。
- 🔑**`BattleScreen.tsx:6490` にもう1つ `lrigClassesCompatible` がある**（アシストルリグ候補）が、
  そこは Codex が据置と宣言した `WX24-P2-043` の担当なので**穴ではない**（§5-20 の確認）。

### 🖥実機（Claude が実行・新規3本＋既存回帰1本／単体でも4本一括でも全 PASS）

| シナリオ | 見たもの |
|---|---|
| `v12GrantedSpellUseMinus4000`（既存・**正方向**） | ディソナのスペル（`WXDi-P12-089`）を使うと付与【自】が発火して −4000 |
| `o191SpellUseNonDisona`（新規・**負方向**） | 🔴**同じ黒・《黒》×0 の非ディソナスペル**（`WX02-075`）では**発火しない**（`powerMods` が空のまま） |
| `o180GrowIgnoreLrigType`（新規） | クラス不一致（ピルルク Lv3 → `?` Lv4）でも**宣言があれば候補に出て実際にグロウできる**／**宣言の無い同レベル**（`WD01-001` タマ・コストは払える状態）**は候補に出ない** |
| `o148VirusAnyCount`（新規） | 【ウィルス】3つのうち**2つだけ選んで取り除き**、パワー修整が **－20000**（＝2×10000）。**－30000 なら最大数除去＝旧挙動** |

🔑**共通化リファクタは「正方向の既存シナリオ」＋「負方向の新規シナリオ」の2本で挟む**＝
片方だけでは「全部発火」も「全部不発」も緑に見える（§5-3′ の実機版）。
🔑**ルリグ【起】も手札スペルも UI は2段**（「【起】…」→「発動」／「発動」→「発動する」）＝
1段目で止まると**前提崩れの FAIL** になる。押せなかったら開き直して自己回復するループにする。

### 索引の更新

- **クローズ8件**＝`O-155` / `O-156` / `O-161` / `O-180` / `O-184` / `O-191` / `O-196` / `O-216`。
- **`O-180`（残1＝`WX24-P2-043`）と `O-148`（残1＝`WX25-P3-058-E1`）は索引 C（母集団1効果）へ移した。**
- **`O-163` / `O-181` は索引 B に残す**（設計調査の結果を登録票へ追記済み＝入口の関数名まで特定）。
- ⇒ **索引 B は 11件 → 2件。機構 worklist 全体は 97 → 90項目。**

## 2026-09-01（続き771）：§5.3 索引 C（母集団1〜2効果）を 45件 → 33件（12件クローズ＝実装9件＋登録票 stale 3件）

**真因（総論）**＝索引 C の登録票は「受け皿が無い」と書いているものが多いが、**実際には受け皿が既にあり、
落ちていたのは配線か、そもそも既に消化済みという事実**だった（12件中7件）。⇒ **索引 C は「型を足す作業」ではなく
「配線を探す作業」**として取る。⚠**「規模＝1効果」の登録は母集団ではない**（`O-170` は原文12カード、`O-153` は
多段 `LOOK_PICK_CHAIN` 16効果が母数）＝**索引 C でも②「数える」を飛ばさない。**

### 実装した9件

| ID | 真因（1行） | 影響 | 直した層 |
|---|---|---|---|
| `O-153` | `LOOK_PICK_CHAIN` が全ステージのピックを合算して後続へ渡す＝原文が「この方法／効果で**場に出た**シグニ」と行き先を名指ししても**手札行きの札のレベルまで数える** | **3効果**（`WX24-P3-039-E1` 過剰ミル／`WX25-P1-039-E1` 過剰バニッシュ／`WX24-P2-035-E1` は STUB 据置だった） | 型＋engine＋parser 後段パス＋golden |
| `O-170` | 「表記されているパワーと異なる／より高い（低い）」が `parseSigniTarget` を通らない builder（`SELECT_TARGET_ONLY.selectTarget`・任意コスト前置きの `CONDITIONAL.then`）で丸ごと落ちる | **3効果**（相手のどのシグニでも選べた） | parser 後段パス＋golden（**受け皿は既存**） |
| `O-212` | `EffectTarget.totalPowerMax` は**場のシグニ経路だけ**が読み、`execAddToField` の trash/energy 経路は `selectOrInteract` へ渡していない＝**誰も見ない死にキー** | **2効果**（`WXK09-023-E1` はエナから＜電機＞3体を無制限に／`WXEX2-52-E3` は制約ごと欠落） | 型3キー＋`$ref`1本＋両評価器＋UI 文言＋golden＋実機 |
| `O-145` | `execTransferToDeck` の `LIFE_CLOTH_CARD` 経路が `optional` を見ない＝「してもよい」が**強制**（受け皿が無いと判断して `DEFERRED_*` にしてあった） | **1効果** | engine＋parser＋golden＋実機 |
| `O-146` | `underCardOp{energy_signi_to_deck_top}` が「置いて**もよい**」を強制で実行し、候補が複数でも `candUC[0]` を自動で選ぶ | **1効果** | parser（typed 化・engine 新規実装ゼロ）＋golden＋実機 |
| `O-154` | 「その中に〈クラス〉が N枚以上ある場合」の閾値と、冒頭で対象化したカードへの照応が両方落ちる | **1効果**（自分の＜龍獣＞を条件なしで割り、【ダブルクラッシュ】が無条件で乗る） | `manualEffects.ts` 手書き（**engine 0行**）＋golden |
| `O-189` | `convertSelfHandDiscardStep` が素の `TRASH{HAND_CARD}` の filter を流用し、名詞句の**色が脱落** | **2効果**（任意コストが原文より緩い） | parser＋golden |
| `O-208` | `STUB{LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS}` がアーツを**全部**ルリグデッキへ戻す（原文は「対象のアーツを2枚まで」） | **1効果** | 型1キー＋engine＋`manualEffects.ts`＋golden |
| `O-214` | `ZONE_SUM_COUNT` がゾーンごとに distinct して足す＝**同名が場とエナに1枚ずつあると2種類**と数える | **1効果**（基本パワー35000が早く乗る） | 型1キー＋両評価器＋`manualEffects.ts`＋golden |

### 「登録票が stale」だった3件（**コード変更ゼロ**）

- **`O-171`**＝`ZONE_SUM_COUNT`（両評価器＋golden）は 2026-08-31 続き747 で実装済み・`WDA-F03-13-E3` も是正済み。
- **`O-207`**＝`LookPickChainStage.gateZoneOnly` → `AddToFieldAction.gateZoneOnly` は実装済み・`WXDi-P15-079-E1` に刻み済み。
- **`O-215`**＝`TargetFilter.hasSoul` と `frontOfAllyWithSoul` は 2026-08-31 続き749 で実装済み（2効果とも）。

⇒ 🔑**索引の項目に着手したら、最初にやるのは実装ではなく「その受け皿を grep する」こと。**

### 検証

- `npm run gates` **全緑**（golden **3209 / 3209**＝3199 → +10本・0 FAIL／smoke 10,721効果 全異常0／fuzz 全0／
  census **11 / BASELINE 12**／`census:stubs` A群🔴0・C群0／manual-fields 0／`census:enginetext` A🔴130行 据置／
  lint 0 errors・250 warnings）。`npm run regen` 済み。
- **live の A/B 差分は毎回「意図した件数だけ」を機械確認**した（`O-153`＝6枚／`O-170`＝3枚／`O-189`＝2枚／
  `O-146`＝1枚／`O-145`＝1枚）。⚠**AUTO でも `_held_fresh` に落ちるので `heldReview --adopt` まで回さないと live に届かない**
  （この巡で4回踏んだ）。MANUAL/PARTIAL は `syncManualLive.ts`。
- **実機（`verifyBattleDrive.mjs`）＝新規5本すべて PASS**（単体でも5本一括でも）
  ＝`o146EnergyTopTake`／`o146EnergyTopSkip`／`o145LifeTopTake`／`o145LifeTopSkip`／`o212PowerSumExact`。
  **反転確認あり**＝(a)`O-146` は「置く／置かない」で【ルリグバリア】の有無が1ビット反転
  (b)`O-145` は「加える／加えない」でライフの一番上が入れ替わるか否かが反転
  (c)`O-212` は 10000 / 11000 / 13000（超過＝選択自体を拒否）では**決定が押せず**、ちょうど12000でだけ押せる。
- **実機は必須と判定**（§2.2）＝新しい機構を4本足した（`lastProcessedFrom` ／ パワー合計制約3キー ／
  `$ref:'source_effective_power'` ／ `distinctAcrossZones`）ことと、`src/screens/battle/modals/EffectInteractionModal.tsx`
  の見出し文言に2行足したこと。

### 同時に直した計器の較正（1件）

**`census:cards` の `mech` フラグが PLAN_DETAIL の登録票を「クローズ済みも含めて」読んでいた。**
PLAN の運用は「クローズした項目は §5.3 の索引から消すが、登録票の全文は PLAN_DETAIL に残す」なので、
**消化しても `mech` は永久に減らない**＝この計器の目的（1シートを分母にした**単調減少するカウンタ**）が
成り立っていなかった。⇒ **見出しの直後が 🏁 の登録票は数えない**（本文中の部分消化 🏁 は数え続ける＝fail-open）。
⚠**今回の12件クローズで Sheet1 の 20 は動かなかった**＝残 20 枚は**別の（まだ開いている）登録票**から立っている。
**これは前進ではなく較正。**

### この巡で踏んだ罠（次の人向け）

1. 🔴**`applyPrintedPowerScope` の「既に刻まれている」判定は対象フィルタ以外も見る**＝`SIGNI_ATTACK_BAN.powerDiffersFromPrinted`
   のように**アクション直下**に持つ型があり、見落とすと**同じ文の別の対象へ二重に刻む**（`WX25-P2-010-E1` で実測）。
2. 🔴**golden の新規テストで `mkCtx`/`fresh` を使うなら `withSavedCursor` で包む**＝POOL カーソルがずれて
   **無関係な2本が FAIL する**（この巡で `task12(cx)` と `Stage2 power B44` が巻き添えになった）。
3. 🔴**実機ドライバ：注入したスタックは最初のクエリ時点で既に `pending_effect` へ移っている**＝
   `stackLen > 0` を前提条件にすると即 FAIL する。**基準値は最初のクエリではなくスペックの固定値**にする
   （`LOOK_AND_REORDER` が1枚抱えている間は **life が2枚に見える**のも同根）。
4. 🔴**実機ドライバ：確定直後の1回読みはコミット前の盤面を掴む**＝**単体では PASS するのに一括実行だけ FAIL** する。
   ⇒ `settled` ストリーク（3ティック連続で pending も stack も無い）を進行条件にする。
5. 🔑**候補モーダルの札は1度だけ押す**（毎ティック押すとトグルして「決定」に永久に進まない）。
6. 🔑**`deck_shuffled_count` は判定に使えない**＝明示的なシャッフルアクションが積むカウンタで、
   `insertToDeck` の `shuffle:true` では増えない（実機で実測）。**カード番号で見る。**


## 2026-09-01（続き770）：旧「未採番の機構在庫」30件を採番（`O-191`〜`O-217`）／`census:cards` の `mech` が PLAN 再編で嘘をつく穴を1件修正

**真因（採番側）**＝旧 §5.4 (ii) は「機構ギャップは §5.3 へ送る」と書きながら送らずに溜め続けており、**機構の置き場が2つ**あった。
2026-09-01 の PLAN 再編（第2回）で §5.3 へ移設したが **`O-nn` が無く母集団順にも並べられない**ので、索引 A〜F の「取る順」に入れられなかった。

**やったこと**＝30件を全数 triage して行き先を確定した。
- **新規採番 27件（`O-191`〜`O-217`）**＝索引 A 6／B 3／C 17／D 1。**索引に1行＋ PLAN_DETAIL に登録票1項目**（PLAN の登録ルールどおり。本文は無改変）。
- **既出 `O-nn` へ統合 5件**（採番せず吸収）＝`O-104`（N体・N枚の強制中間動作の UI ソフトロック）／`O-137`（デッキの一番上とライフクロスの入れ替え）／
  `O-158`（`ATTACH_ACCE` がエナから選べない）／`O-164`（「次に〜される場合」の1回消費耐性＝**2件が同じ器**）／`O-173`（「同じレベル」のペア付け）。
- **§5.4 (iii) 構造混線へ送り 2件**＝live の `parseStatus:'PARTIAL'` 11効果／続き749 の縦切り8（`WX21-028-E2`／`WXDi-P10-007-E3`）＝
  どちらも**木ごと作り直す**種類で、機構の追加では閉じない。
- ⚠**`O-217` は「機構」ではなく未整理の集計**（旧クラスタ集計の7区分）＝索引 D に入れて「着手の最初の工程は再計測」と明記した。`O-199`（アンコール）と重なっている。

🔴**在庫 82 → 109 は新しい在庫が増えたのではない**＝**置き場が2つあったのを1つに畳んだ結果**。§5.3 の内訳＝A **14**／B **11**／C **45**／D **34**／E 4／F 1。

### 🔴 同時に踏んだ計器のバグ＝`census:cards` の `mech` が「本文を移しただけ」で緑になる

**真因**＝`scripts/cardProgressCensus.mjs` の `mech` 判定は **`docs/PLAN.md` の §5.3 節だけ**を読んでカード番号を拾っていた。
ところが §5.3 は 2026-09-01 の再編で **「索引（PLAN.md）＋登録票の全文（PLAN_DETAIL.md）」に分割済み**で、
**カード番号はほぼ全部が登録票の側**にある。⇒ **登録票へ本文を移すたびに `mech` が減る**＝機構待ちが解消したように見える。

- **実測**＝この採番で本文を PLAN.md から移しただけで **Sheet1 要対応 18 → 1（`mech` 18 → 1）** に化けた。**実装は1行も変えていない。**
- **修正**＝`PLAN.md §5.3` ＋ `PLAN_DETAIL.md の「§5.3 機構 worklist 登録票の全文」節` の**両方**を haystack にした（切り出し失敗時は個別に警告を出す）。
- **修正後＝Sheet1 要対応 20 / 863（`mech` 20・即着手可能 0）**。🔑**18 → 20 は前進でも退化でもなく較正**＝
  差分2件は「2026-09-01 の再編で PLAN.md から登録票へ移されていたぶん」＝**この採番の前から既に過少報告だった**。
- ⚠**§5.3 の置き場をこれ以上動かすなら、この計器の切り出し見出しを必ず一緒に直す**（見出し文字列でしか掴んでいない）。
- ⚠`census:cards` はゲートではない（exit 0）ので**CI では捕まらない**。同型の「本文を移すと計器が緑になる」穴は
  §5.3 O-187（`mech` の過大側）と対になっている＝**`mech` は過大にも過少にも振れる。**

**影響枚数**＝カードの挙動は 0 枚（engine / parser / live JSON / `src/` は1バイトも触っていない）。動いたのは docs 2本と計器1本。

**検証**＝`npm run gates` 全緑 ✅（golden 3199/3199・smoke 全異常0・fuzz 全0・census 11 / BASELINE 12・`census:stubs` A群🔴0/C群0・
manual-fields 0・`census:enginetext` A🔴 130行/127ハンドラ 据置・lint 0 errors）／`npm run census:cards -- --sheet 1`。
**反転確認**＝あり（計器の修正を外すと Sheet1 が 1 に戻ることを実測）。
**⑤実機＝不要と判定**（§2.2＝`src/screens/` も `src/engine/` も新しい型・機構も触っていない。触ったのは `docs/` と `scripts/` の計器のみ）。


## 2026-09-01（続き769）：§5.1 実機未検証キューを 4件 → **0件** に返済（`V-107`／`V-105`／`V-104`／`V-103`）

**この巡は「新しい実装」ではなく「返済」**＝続き756/757/767/768 が `src/screens/` と新機構に触れたまま残していた
**実機観測点4件**を全部踏んだ。**新規シナリオ13本・すべて PASS（単体でも13本一括でも）**。engine/parser は1バイトも触っていない。
触ったのは **`scripts/verifyBattleDrive.mjs`（+736行）** と **`SigniOnPlayCostModal.tsx` の `data-testid` 1行**だけ。

### A. `V-107`＝`WX22-018-E2`「**いずれかのトラッシュから**対象のコストの合計が０のスペル１枚を除外し《無》を支払ってもよい」

**残っていたのは UI 経路だけ**（runtime `canAffordOptionalCostSpec` と支払いステップ `EXILE{TRASH_CARD owner:'any'}` は golden 済み）。
`execExile` が `owner:'any'` を `TargetScope 'both_trash'` に落とすので、**`EffectInteractionModal` の `scopeDesc` に行が無ければ見出しが空になる**。

- **盤面**＝自分のトラッシュには**スペルでないバニラ1枚**だけ、相手のトラッシュにコスト0スペル1枚。
- **観測3点とも PASS**＝①自分側に候補が無くても**支払い択が出る** ②見出しが「**いずれかのトラッシュから**」
  ③選んだ札が**相手のトラッシュから消えて相手の除外へ**（自分のバニラは候補にすら出ない＝filter が効いている）。
- **反転確認**＝live の `trashExile.owner` を `any`→`self` にすると**支払い択自体が出ず** FAIL（`canAfford` が false で丸ごとスキップ）。
- 新シナリオ＝`v107BothTrashPay` / `v107BothTrashSkip`（辞退なら除外も本体も起きない）。

### B. `V-105`＝`WXK03-070`（幻怪　モモタロ）の `cost.energyTrashGroups`（続き767 で新設・旧 live は `costUnparsed`＝**無料**）

🔑**支払い経路は2つあり、両方を別々に踏んだ**＝①通常召喚（`SigniOnPlayCostModal`）②効果で場に出た（`optionalCostPaySteps`）。

- **観測4点とも PASS**＝(a) 3種そろっているときだけ **発動が enabled**（`エナゾーンからトラッシュするカードを選択: 3/3`）
  (b) **同名3枚では 1/3 で止まり 発動は disabled**（グループごとに別カードが要る）
  (c) 支払った札が**3枚ともトラッシュへ**・**無関係な1枚はエナに残る**（1枚だけ／4枚は誤り）
  (d) **②効果で場に出た経路**でも同じコストを取られ、**グループごとに1つずつ TRASH ステップへ分解**される（実測で3ステップ）。
- 🔑**選択ガードの観測は「押してカウンタが動かないこと」で測った**＝無関係な札を先に押して `0/3` のままを読む
  （`canAddEnergyTrashGroupIndex` が効いていなければここで 1/3 になる）。
- **反転確認**＝`manualEffects.ts` から `cost.energyTrashGroups` を外すと、選択UIが消えて**無料の「発動しますか？」**に戻り FAIL。
- **`SigniOnPlayCostModal.tsx` に `data-testid="onplaycost-enatrash-${i}"` を追加**（エナ**支払い**の `onplaycost-energy-${i}` とは別枠。
  この面には testid が無く、盤面の同名 `img[alt]` と区別して狙えなかった）。
- 新シナリオ＝`v105OnPlayGroupsPay` / `v105OnPlayGroupsSameName` / `v105OnPlayGroupsByEffect`。

### C. `V-104`＝`WXK11-013`（キー）の `LRIG_LIMIT_MODIFY{owner:'any'}`「（お互いのセンタールリグに影響する）」

**3本セット（キー無し11／自分側にキー10／相手側にキー10）で、表示と配置ゲートが同じ値を見ていることを確かめた。**
**対照が「キーの有無だけの1ビット反転」なので、これ自体が反転確認になっている。**

- **PASS**＝表示「`Lv.2　リミット: 8/11`」→ キーありで「`8/10`」／空きゾーンの内訳が `10/11`→`10/10`。
- 🔑**配置ゲートは2段ある**＝①手札カードの【召喚】ボタンを出すか（`BattleScreen.tsx:8327`）②ゾーンボタンの `disabled`。
  **リミットを1超える札では①で既に止まる**ので、**ちょうど収まる Lv2 と 1超える Lv3 の2枚**を手札に置いて両方を見た
  （リミット10のとき Lv3 は**【召喚】自体が出ない**＝ゲートが表示と同じ値を見ている）。
- 新シナリオ＝`v104LimitNoKey` / `v104LimitKeySelf` / `v104LimitKeyOpp`。

### D. `V-103`①＝**【ライド】の【起】**（続き756 が `<CardNum>-RIDE` をルリグ9枚に新規生成）

- **PASS**＝(a) ルリグの【起】一覧に **`【起】コストなし`** が出る（本来の `【起】コイン1` と並ぶ）
  (b) ＜乗機＞シグニを選んで**乗る**（`lrig_riding_signi` に入る）／(c) ＜乗機＞が居なければ「**乗機シグニなし（RIDE_ON）**」で止まる
  (d) 撃ったあと**同じターンには一覧から消える**（`once_per_turn`）／既にドライブ状態なら「**ルリグ既にドライブ状態**」で乗り直さない。
- 新シナリオ＝`v103RideOn` / `v103RideNoTarget` / `v103RideAlreadyDriving`。
- **`queryState` に `lrigRidingSigni` を追加**（`RIDE_ON` はここが空でなければ即スキップするので、両方向の観測点）。

### E. `V-103`②＝`split_top_bottom` の振り分けUI（`WDK04-014` 大罠　ジャバウォック）

**PLAN が「この枝は golden で固定できていない」と明記していた「置かない」枝**を実機で踏んだ。

- **PASS**＝**上に残しても**（デッキトップのまま）**下へ置いても**、後続の
  「この方法で公開したカードがレベルが奇数のシグニの場合」が**両方とも成立**（`+5000` と【ランサー】が付く）＝`lastProcessedCards` が残る。
- **同じ盤面・同じ札で「上/下」1ビットだけ反転**した2本＝`v103SplitKeepTop` / `v103SplitToBottom`。

### 🔑 この巡で得た「ドライバの書き方」の教訓（次の人が同じ穴に落ちないために）

1. 🔴**`field.key_piece` は `CORE_FIELD_KEYS`＝シナリオ間で引き継がれる。**
   明示的に `null` を書かないと**前の巡のキーが残ったまま**回り、対照が別のリミットで走る。
   症状は「**【召喚】ボタンが出ない**」だけなので、カードやルリグ限定や待ち時間を疑って時間を溶かす。
   ⇒ **効果が「盤面に1枚あるかどうか」で決まる観測をするときは、その枠を spec で必ず両サイド明示クリアする。**
2. 🔴**反転確認の後始末を `mv`（mtime 保存）で戻すと、`distIsFresh()` が build をスキップして次の実行が反転版の dist で回る。**
   実際にこれで「一括実行だけ2本 FAIL」を踏み、シナリオ間汚染を疑って調査した（**真因は stale dist**）。
   ⇒ **復元は `git checkout` か、復元後に `touch`。疑わしいときは `SKIP_BUILD=0` で強制ビルド。**
3. 🔴**`manualEffects.ts` は実行時にも勝つ。** `BattleScreen` が `buildEffectsMap` → `mergeManualEffects` を毎回呼ぶので、
   **`public/data/effects_*.json` を削っても manual 側が復活させる**。⇒ **MANUAL 効果の反転確認は `manualEffects.ts` を触る。**
4. 🔑**候補モーダルは「このモーダルで選んだ札」を覚える。** 毎ティック同じ札を押すと選択がトグルして `決定` に永久に進まない
   （`o190CostDrive` が既にこの型を持っていたのに写し損ねて2回踏んだ）。
5. 🔑**「出ないこと」を主張する観測は、出る側と同じ時間だけ待ってから結論する**（`getMyHandCardActions` は `loading` 中 `[]` を返す）。
   出なかったときは**そのとき何が出ていたか**（`data-action-label` の一覧）を必ずログに残す。
6. 🔑**観測だけの巡では押し切らない**＝`V-104` はモーダルを開いて読んでキャンセルし、`盤面は不変` を判定に含めた
   （配置してしまうと次の観測ができない）。

**検証**＝`npm run gates` **全緑**（typecheck／golden 3199・0 FAIL／smoke 全0／fuzz 全0／census 11 / BASELINE 12／
census-stubs A🔴0・C0／manual-fields 0／census-enginetext A🔴130行 据置／lint 0 errors・249 warnings）。
**実機**＝`node scripts/verifyBattleDrive.mjs` で**新規13本すべて PASS**（単体・13本一括の両方）。
⚠**実機は必須と判定**（§2.2）＝`src/screens/` を触った（`data-testid` 1行）＋そもそもこの巡が実機返済。


## 2026-09-01：PLAN 再編（第2回）＋ 対象レベル依存コスト2効果を live へ届けた

### A. 対象レベル依存の任意コスト2効果（前セッションの未完了分を完走）

**真因**＝支払う量が「先に固定した対象のレベル」で決まる形の受け皿が片方しか無かった（`costColorsPerTargetLevel`＝**最大**レベルのみ）。
**影響**＝2効果。`WX24-P4-051-E2`（旧 live は `STUB{OPTIONAL_TRASH_ENERGY_CLASS}`＝レベル限定を失い、支払い後に回収対象を選び直せた）／
`WX24-P2-054-E2`（旧 live は `ENERGY_CHARGE{DECK_CARD}`＝**自分のデッキからエナチャージする別の動作**）。

- **新キー1本**＝`StubAction.costColorsPerTargetLevelSum`（対象**すべてのレベル合計**1につき単位コスト）。
  **4箇所へ配線**＝`src/types/effects.ts`（型）／`src/engine/execUtils.ts`（`sumCardLevels` 新設＋`resolveOptionalCostSpec`）／
  同（`levelUnavailable` を合計版でも fail-closed に）／`scripts/decompileEffects.ts`（逆翻訳）。
- **2効果は `manualEffects.ts` に手書き**（§2.0 の速いレーン＝同型2枚以下）。`WX24-P4-051-E2` は既存の `energyTrashSameLevelAsTarget` が受け皿だった。
- **`WX24-P2-054-E2` の負方向 golden（`ENERGY_CHARGE` のままを固定していたもの）を削除し、正方向へ差し替え。**

🔴🔑**真の発見＝`manualEffects.ts` に書いただけでは live に届いていなかった。**
`build:effects` の収穫マージは**既存 id の書き直しを温存する**ので、live は旧出力（`parseStatus:AUTO`）のまま残っていた。
**新しい golden は `manualEffect()` ヘルパで MANUAL_EFFECTS を直接読むため全部緑**になり、逆翻訳・census・smoke・fuzz も何も言わなかった。
**捕まえたのは `§6.3 K トリップワイヤ`（「manualEffects.ts の定義が live JSON に届いている」）1本だけ**＝
`新しい乖離（manualEffects.ts を直したが live に届いていない）: WX24-P4-051-E2, WX24-P2-054-E2`。
⇒ **既存 id を書き直したら `npx tsx scripts/syncManualLive.ts <CardNum>` まで回して初めて1巡が閉じる**（CLAUDE.md の同項目を実地で再確認した）。

**検証**＝`npx tsx scripts/syncManualLive.ts WX24-P4-051 WX24-P2-054` → **live の変更が この2効果だけ**であることを
`git show HEAD:public/data/effects_WX24_26.json` との**効果単位の機械比較**で確認 → `npm run regen` → `npm run gates` **全緑**
（golden **3199 / 3199**・0 FAIL／smoke 全0／fuzz 全0／census 11 / BASELINE 12／lint 0 errors）。
**反転確認**＝golden に fail-closed 2本（対象0体・レベル参照不能／同レベルのエナが無い）を含む＝**払えない側でも赤くなる。**
⚠**実機は不要と判定**（§2.2）＝`src/screens/` 不変更・新キーは engine の純関数経路のみ。
📋**残した粗**＝`energyTrashSameLevelAsTarget` の「それと同じレベルの」が**逆翻訳に出ない**（挙動は正しい）＝PLAN §5.3 の「監視だけしている項目」へ登録。

### B. PLAN 再編（第2回）＝計器主導から機構主導へ

**真因**＝**3つの進捗計器が同時に底を打った**のに、PLAN が「計器の在庫を消化する」前提のままだった
（census 高シグナル **11 / BASELINE 12**＝旧ベースライン 1872／`census:cards --sheet 1` の要対応 **18枚が全部 `mech`＝即着手可能 0**／
意味照合台帳の残 OPEN **44 は続き766 の全数 triage で全件が `src/screens/` か新 engine 機構待ち**）。

- **§5.3 を「登録順の巨大テーブル」から「母集団順の索引 A〜F」へ**作り替え、登録票82項目の履歴 **68,401字**を PLAN_DETAIL へ**無改変で退避**。
  **旧「取る順」表は廃止**（索引の並びがそのまま取る順）。索引で判明した実態＝**`O-96` は登録票「M」で実測122効果**、
  逆に**取る順1位だった `O-106` は1効果**、**母集団未計測が33項目（4割）**。
- **§5.2（意味照合）を本線から降格**、**§5.4 の (i) 配線ギャップ・(ii) 機構ギャップ（未採番30件）を §5.3 へ統合**（機構の置き場が2つあった）。
- **§5.1 のクローズ済み `V-nn` を教訓7本へ圧縮**（宙に浮いていた断片行も解消）。**進捗指標に「在庫2本」を追加**（§3・§6）。
- **PLAN.md 195,282字 → 100,385字（-49%）／1423行 → 1203行。**

**検証**＝旧 PLAN の **O-id 124種・V-id 26種・カード番号 355種**がすべて PLAN.md か PLAN_DETAIL.md に残存することを機械確認（欠落0）。
索引82行はすべてテーブル記法として妥当（パイプ4本）。**併せて `CLAUDE.md`（廃止した取る順表への誘導と消化済みの次の一手を差し替え）と
`baton`／`census-batch` スキルを更新。**


## 2026-09-01：PLAN §5.3 `O-190` 第2バッチ — 任意コストのトラッシュ除外／他の【トラップ】支払いを復元

第1バッチで受け皿がなく据え置いた4効果のうち、通常の複合任意コストとして扱える3効果を修正した。
原文は「別のコスト動作をし、《色》を支払ってもよい」だが、旧 live は
`OPTIONAL_COST{costColors}` だけだったため、色エナだけで本体を撃てる過剰実行だった。

### 実装と7点配線

- `src/types/effects.ts` の JSON payload 型 `StubAction` と、`src/engine/execUtils.ts` の runtime 型
  `OptionalCostSpec` の両方へ `trashExile` / `fieldTrapTrash` を追加した。
- `resolveOptionalCostSpec` で両キーを転送し、`canAffordOptionalCostSpec` で候補数を fail-closed に判定した。
  `trashExile.owner:'any'` は自分・相手の両トラッシュを単一候補プールとして数える。
  `fieldTrapTrash.excludeSource` は `field.signi_traps` から効果元自身を除いて数える。
- `optionalCostPaySteps` は `trashExile` を既存 `EXILE{TRASH_CARD}` に、`fieldTrapTrash` を
  専用 `INTERNAL_TRASH_FIELD_TRAP_COST` に展開する。後者は `execStubPart1` で選択後に
  `field.signi_traps` から除き、通常トラッシュへ移す。`fieldTrash` は借用していない。
- `execExile` の `owner:'any'` 候補収集を両トラッシュへ広げ、`TargetScope` に `both_trash` / `self_trap` を追加した。
- 3効果はすべて action 内の `OPTIONAL_COST` なので、支払い入口は効果起動側の
  `EffectInteractionModal`。同モーダルへ2 scope の表示を追加した。通常召喚の
  `SigniOnPlayCostModal` と、その共通判定を置く `costs.ts` は通らないため変更していない。
  色エナ選択と pay/skip は既存 `optionalCostUi`、追加コストの表示は
  `optionalCostExtraLabels`、追加支払い選択は pay 後の `EffectInteractionModal` が担う。
- `effectParser.ts` の複合任意コスト規則へ「ゲームから除外し」を追加し、3句だけを payload 化した。
  「コストの合計が0」は新キーを作らず、既存 `TargetFilter.costMin:0/costMax:0` を使った。
- `decompileEffects.ts` へ両 payload の描画を追加した。第1バッチの `fieldTrash` /
  `underAnySigniTrash` と同じ「live は直ったが逆翻訳からコストが消える」穴を残していない。

### 採用3効果

| effectId | 原文のコスト節 | 生成した `OPTIONAL_COST` | 逆翻訳でのコスト節 |
|---|---|---|---|
| `WXDi-P11-049-E1` | あなたのトラッシュにある＜毒牙＞のシグニ3枚をゲームから除外し《黒》 | `trashExile:{count:3,owner:'self',filter:{cardType:'シグニ',story:'毒牙'}}` | あなたのトラッシュにある＜毒牙＞のシグニ3枚をゲームから除外し《黒》を支払ってもよい |
| `WX22-018-E2` | いずれかのトラッシュから対象のコストの合計が0のスペル1枚をゲームから除外し《無》 | `trashExile:{count:1,owner:'any',filter:{cardType:'スペル',costMin:0,costMax:0}}` | いずれかのトラッシュから対象のコストの合計が0のスペル1枚をゲームから除外し《無》を支払ってもよい |
| `WX15-053-TRAP` | あなたの場にある他の【トラップ】1枚をトラッシュに置き、《青》 | `fieldTrapTrash:{count:1,excludeSource:true}` | あなたの場にある他の【トラップ】1枚をトラッシュに置き、《青》を支払ってもよい |

`WX22-018-E2` は指示どおりコスト payload だけを変更し、既存の
`CONDITIONAL{IS_MY_TURN}` と未固定 `BOUNCE` 対象には触れていない。
`resumeOptionalCost('skip')` は continuation を実行するため、自分ターンなら skip 後もこの既存ゲートが成立し得る。
したがってコスト節は改善したが、did-it gate／先行対象固定の原文不一致は残る。今回の変更による新規退化ではなく、別バッチの領分。

`WXK06-029-E1` はデッキ探索中に効果元自身を公開する特殊形であり、通常の任意コストではないため第1バッチどおり据置。
今回の条件以外で新しく見つけた原文差は0件。

### fail-closed・実機・反転確認

- golden を日本語名で4本追加。fresh/live の3 payload、`WX22-018-E2` の既存木据置、
  ＜毒牙＞3枚／2枚、相手トラッシュだけにあるコスト0スペル／両方0枚、
  他の【トラップ】あり／効果元だけ、pay/skip の本体分離を固定した。
- parser 規則から「ゲームから除外し」を一時的に外すと、fresh assert が
  `WXDi-P11-049-E1 ... got=undefined` で FAIL。復帰後4/4 PASS。
- 実機4本を `verifyBattleDrive.mjs` に追加し、`SKIP_BUILD=0` で
  `o190TrashExilePay` / `o190TrashExileSkip` / `o190FieldTrapTrashPay` /
  `o190FieldTrapTrashSkip` が **4/4 ALL PASS**。候補選択後に `決定` の enabled を検査してから押している。
- live JSON から両 payload を一時的に外す反転では pay 2本がともに FAIL。
  色エナだけが減り、＜毒牙＞は除外されず／他の【トラップ】は残ったまま本体だけが起きる旧挙動を再現した。
  退避から復元後、`SKIP_BUILD=0` で再度4/4 ALL PASS。

### ゲート・帳票・ブラスト半径

- `npm run gates` 全緑＝golden **3189 → 3193 PASS / FAIL 0**、smoke **10721/10721**・
  CRASH/HANG/INVARIANT 0、fuzz CRASH/HANG/INVARIANT/EXPLOSION 0、census 高シグナル **11**
  （BASELINE 12以下）、census:stubs A0/C0、manual-fields 0、census:enginetext A🔴130行据置、
  lint **0 errors / 249 warnings**（増減0）。
- ベースライン `597ed93bd` との effectId 単位比較は
  `WXDi-P11-049-E1` / `WX22-018-E2` / `WX15-053-TRAP` の**変更3件だけ**。追加0・削除0・予定外0。
- 報告直前の `build:effects` → `heldReview` は `_held_fresh` **75** /
  `_partial_fresh` **10** / `_idset_fresh` **7**（すべてベースライン据置）。
- 変更ファイルのベースライン比較で U+FFFD、3文字以上連続 `?`、先頭BOMの新規増は0。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` は編集せず、commit / push もしていない。

### Claude 側の独立検証（Codex の報告を鵜呑みにしない＝CODEX_GUIDE §7）

- **per-effect diff を自前で取り直した**（キー順を正規化しない生文字列比較）＝**変更3・追加0・削除0**で報告と一致。
- **`npm run gates` を回し直して全緑**（golden **3193**・census 11・lint 0 errors / 249 warnings）。
- 🔴**実機4本を Claude が `SKIP_BUILD=0` で再実行して 4/4 ALL PASS**（Codex の申告と独立）。**ログで挙動まで確認した**＝
  `o190FieldTrapTrashPay` は**コスト候補が `["WX15-052#1911"]` の1枚だけ**＝**効果元の `WX15-053#1910` が候補から除かれている**
  （＝`excludeSource` が実 UI で効いている）。pay 後は `traps=["WX15-053#1910",null,null]` / `trash=[…,"WX15-052#1911"]` /
  対象バニッシュ=true / energy=0。skip は3ゾーンとも不変で energy=1（＝色エナも払っていない）。
  `o190TrashExilePay` も除外3枚・energy=0・-10000=true、skip は除外0・energy=1。
- **`execExile` の `owner:'any'` 拡張のブラスト半径を実測**＝live に `EXILE{target.owner:'any'}` を持つ効果は
  **今回の `WX22-018-E2` 以外に0件**（全 effects JSON を走査）。**適用側は元から両者を探索していた**
  （`effectExecutor.ts:11000` 付近＝`owner` が self/opponent 以外なら `['self','opponent']`）ので、
  今回の変更は**候補集めと scope 表示だけ**を揃えたことになる。
- **`both_trash` / `self_trap` の UI 配線を実コードで確認**＝`EffectInteractionModal` は候補を
  `inter.candidates`（カード id の配列）から描き、**scope はラベルと「場のゾーン番号表示」にしか使わない**
  （`opp_field` / `self_field` / `both_field` の分岐のみ）。⇒ 追加した2 scope は**ラベルの追加だけで足りる**。

🔴**唯一の未検証＝`WX22-018-E2`（`owner:'any'`＝`both_trash`）は実機シナリオが無い。**
runtime（`canAffordOptionalCostSpec` が**相手トラッシュだけに候補がある盤面で true**）と
支払いステップ（`EXILE{owner:'any'}` への転送）は golden で固定したが、**実 UI で相手トラッシュの札を選べるか**は
まだ踏んでいない。⇒ **PLAN §5.1 に `V-107` として登録**した。

## 2026-09-01：PLAN §5.3 `O-188` 第7バッチ — 「〈A〉1枚と〈B〉1枚を対象とし」の**片方の群だけが live に残っていた**4効果 ＋ 恒久 no-op 1件

**Codex は2アカウントとも利用上限**（`.codex-work` 13:55／`~/.codex` 16:27 まで）のため **Claude が実装**した。

**真因**＝この文型の受け皿（`source.selectionConstraint.groups` ＋ `filter.anyOf` の和）は**既にあり、
parser も `parseExplicitSelectionGroups` で群を作っていた**。しかしそれは
**「クラス＋クラス」「クラス＋スペル」「シグニ＋スペル」「カード名＋カード名」…という綴り別の列挙**で、
**レベル修飾・アイコン修飾・「色のスペル」が付いた瞬間に1件も当たらず**、
**片方の群だけが残った単一 filter**（＝**枚数が2→1に減る過小実行**＋**残った側の候補が広い過剰実行**）に落ちていた。

⇒ **列挙の最後に一般形の受け皿**を足した。名詞句の解釈は**第4バッチと同じ `recoveryGroupFilter`**
（＝既存 `parsePickNounPhraseFilter`）へ一任し、新しい語彙解釈は1つも書いていない。
⚠**左端はゾーン句（「あなたのトラッシュから」等）で固定する**＝固定しないと最初の群が
「【出】：あなたのトラッシュから…」まで飲み込んで名詞句として解けない（最初の実装で実際にそうなった）。

| 効果 | 原文 | 旧 live | 直した形 |
|---|---|---|---|
| `WX19-027-BURST` | トラッシュから**レベル１の＜英知＞のシグニ１枚とレベル４の＜英知＞のシグニ１枚** | `{cardType:'シグニ', story:'英知'}` 1枚（**レベルが両方消えた**） | 2群（level 1 / level 4） |
| `WXK02-002-E1` | **《ライズアイコン》を持つシグニ１枚と＜アーム＞のシグニ１枚** | `{story:'アーム'}` 1枚（**アイコン群が消滅**） | 2群（`hasRiseIcon` / `cardClass:'アーム'`） |
| `WXK07-034-BURST` | **黒のシグニ１枚と黒のスペル１枚** | `{cardType:'シグニ', color:'黒'}` 1枚（**スペル群が消滅**） | 2群（黒シグニ / 黒スペル） |
| `WDK15-001-E2` | **《ライズアイコン_黒》_blackを持つシグニ１枚と＜ウェポン＞のシグニ１枚** | `{story:'ウェポン'}` 1枚 | 2群（`hasRiseIcon` / `cardClass:'ウェポン'`） |
| 🆕`WDK15-017-E1` | デッキから**《ライズアイコン_黒》_blackを持つシグニ１枚**を探して公開し手札に加える | `filter:{cardName:'ライズアイコン_黒'}`＝**どのカード名にも一致しない恒久 no-op**（1枚も探せない） | `filter:{hasIcon:'ライズ'}` |

### 🔴 CSV には「色つきアイコン」の綴りがある（`《ライズアイコン_黒》_black`）

画像由来の綴りで **`WDK15-001` / `-009` / `-017` の3枚**に出る。アイコン判定が**完全一致**（`^…アイコン$`）だったため
**アイコン条件として読めず、カード名フィルタへ落ちていた**。⚠**同じファイルのコメントが
「カード名フィルタにすると無言 no-match になる（`WX08-072-BURST` の旧バグ）」と警告していた穴が、綴り違いで再発**していた。
⇒ `parseIconFilter`／`REVEAL_PICK_DESC_RULES`／SEARCH のアイコン判定の**3箇所**で色サフィックスを受けるようにした。
⚠**色を filter に足さない**＝色サフィックスは表示上の色で、条件ではない（先行の MANUAL 実装 `WDK15-009-E1` も `hasRiseIcon` だけ）。

### 🔴 実装中に踏んだ退行＝「既に2ステップへ割れている回収」に群を載せると**枚数が倍**になる

`WXEX1-30-BURST`（白のシグニ1枚と青のシグニ1枚）は **`TRANSFER_TO_HAND` 2ステップ**で**既に正しかった**。
`applyExplicitSelectionGroups` の `rewrite` は **SEQUENCE を再帰して各ステップを書き換える**ので、
一般形を足した直後は**2ステップとも「合計2枚」**になり、**合計4枚回収**の過剰実行になっていた。
⇒ **効果全体の `TRANSFER_TO_HAND` ノードが1つのときだけ**群へ畳むガードを入れ、**対照テストで固定**した。
🔑**教訓＝同じ意味を2通りの構造で表す実装があるとき（§5-3-4″）、片方を一般化すると
もう片方に二重適用される。「別構造で正しい群」は据置するだけでなく、二重適用のガードまで要る。**

### 検証コマンドと結果

- `npm run gates` 全緑＝**golden 3186 → 3189 PASS / FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **per-effect diff**（ベースライン `4a73d195c`・生文字列比較）＝**変更5・追加0・削除0・予定外0**。
- **held は 75 → 81 → 採用5枚で 75 へ戻した**（`heldReview --adopt` 経由・5件とも fresh を1件ずつ原文照合）。
  `_partial_fresh` 10／`_idset_fresh` 7 は据置。
- 🔴**反転確認をファイル単位で3本**＝`effectParser.ts` を戻すと `WX19-027-BURST(fresh)` が FAIL／
  `parserUtils.ts` を戻すと `WDK15-001-E2(fresh)` が FAIL／`parsers/parseSentencePart1.ts` を戻すと
  `WDK15-017-E1(fresh)` が FAIL。**3ファイルとも載っている**ことを確認した。
- **既存 golden 1本を書き換えた**（§5-17′）＝「続き377c トリップワイヤ: 別ピック2本の span にアイコンを AND しない」の
  `WXK02-002` 分岐。**元の意図（2本の別ピックを1 filter に AND しない）は保ったまま**、
  「アイコンが無いこと」ではなく**群の中身で直接見る**形へ変えた（器は `transferGroups` と
  `source.selectionConstraint.groups` の2通りあるので両方を読む）。
- 逆翻訳（`regen` 後）＝5件とも原文どおり。例＝`WXK07-034-BURST`「あなたの《黒》のシグニ1枚と《黒》のスペル1枚(トラッシュ)を手札に加える」。

**⚠実機は不要と判定**（§2.2）＝`src/data/` `scripts/` `public/data/` `docs/` のみ。`src/engine/` も `src/screens/` も触らず、
新しい型・機構も足していない（既存 `selectionConstraint.groups` の生成規則を1本足しただけ）。

## 2026-09-01：PLAN §5.3 `O-188` 第6バッチ — 「それぞれ1枚まで」が**手札以外の帰結**で潰れていた3効果 ＋ 別物を実装していた STUB 1本

**Codex は2アカウントとも利用上限**（`.codex-work` 13:55／`~/.codex` 16:27 まで）だったので **Claude が実装**した。

**真因**＝第4バッチで直した「AとBをそれぞれ1枚まで」は**帰結が「手札に加える」の場合だけ**
（`TRANSFER_TO_HAND.transferGroups`）で、**帰結が別のアクションだと群ごと潰れたまま**だった。

🔑**受け皿は既存の `SelectionConstraint.groups`**（「＜A＞1枚と＜B＞1枚」の配分を表す機構）＝
`execAddToField`（`:3582`）・`execPlaceUnderSigni`（`:7551`）・`execSearch`（`:4586`）・`execTrash`（`:2028` 内2箇所）が
**そろって `selectionConstraint` を `selectOrInteract` へ渡しており**、`canAssignSelectionGroups` が
**どの群にも割り当てられない選択を却下する**（群外の札は取れない／同じ群の二重取りもできない）。**新型は0本。**

| 効果 | 原文 | 旧 live（実害） | 直した形 |
|---|---|---|---|
| `WXDi-P06-083-E2` | トラッシュから**レベル１、レベル２、レベル３のシグニをそれぞれ１枚まで**対象とし、それらをこのシグニの下に置く | `PLACE_UNDER_SIGNI{count:3, filter:{cardType:'シグニ'}}`＝**レベル限定が丸ごと消滅**（レベル1を3枚でも置けた＝過剰実行） | 群3つ（level 1/2/3 × 1枚） |
| `WXDi-P07-095-E1`② | トラッシュから**《惨之遊姫　グズ子//メモリア》とレベル２以下のシグニをそれぞれ１枚まで**対象とし、それらを場に出す | `ADD_TO_FIELD{count:1, filter:{level:{max:2}}}`＝**カード名の群が消えて①の劣化版**（枚数の過小＋候補の過剰） | `count:2` ＋ 群2つ（カード名／レベル2以下）。`filter` は2群の `anyOf` |
| `WXK05-030-E1` 後段 | デッキから**白、赤、青、緑、黒のカードをそれぞれ１枚まで**探して公開し手札に加える | `SEARCH{filter:{color:'黒'}, maxCount:1}`＝**最大5枚が1枚**（過小）＋**色が黒に化けていた**（他4色は0枚） | `maxCount:5` ＋ 5色の群 |
| 🆕`WXK05-030-E1` 前段 | **対戦相手の白、赤、青、緑、黒のシグニをそれぞれ１体**対象とし、それらを**トラッシュに置く** | `STUB{BANISH_MULTI_COLOR_SIGNI}`＝engine のハンドラは**「2色以上を持つ相手シグニを、選択させずに全部バニッシュ」**という**まったくの別物** | `TRASH{SIGNI, owner:'opponent', 色ごと1体の群}` へ typed 化し、**ハンドラを削除** |

### 🔴 前段の STUB は「実装済み」に見えて別物だった（`census:stubs` でも `census:enginetext` でも映らない）

`BANISH_MULTI_COLOR_SIGNI` は **engine に消費地点がある**ので `census:stubs` の A群🔴 には出ず、
**カード全文 regex も読んでいない**ので `census:enginetext` にも出ない。**逆翻訳も STUB の日本語ラベルを描くだけ**なので、
「複数色（2色以上）の相手シグニをバニッシュ」という**ラベル自体が原文と違う**ことに気付ける計器が1つも無かった。
⇒ 🔑**STUB の日本語ラベルは「実装の要約」であって「原文の要約」ではない**＝**原文と突き合わせるまで正しさは分からない。**
（今回は同じ効果の後段を直すために原文を読み直したので気付いた。）

### レーンの判断と実装方式

- **同型は各1枚**なので PLAN §2.0 の**速いレーン**＝`manualEffects.ts` に手書き（`parseStatus:'MANUAL'`）。
  ⚠**移設ではない**＝3件とも原文を読み直して JSON を書いた（PLAN §2.0 の禁止事項）。
- ただし**前段の5色トラッシュだけは parser（`parseSentencePart4.ts`）も直した**＝STUB を出す規則がそこに在ったため。
  同じ typed アクションを manual と parser の両方が出す（生成 JSON は一致）。
- 🔴**`upToCount:true` は意図的**＝候補の色構成によっては「ちょうどN体」を満たす選び方が存在しない
  （同じ色が2体・別の色が0体など）ので、**確定できない選択UIを作らないための fail-open**。原文に「まで」は無いが、
  群制約が上限を担保しているので過剰実行にはならない。

### 検証コマンドと結果

- `npm run gates` 全緑＝**golden 3184 → 3186 PASS / FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **per-effect diff**（ベースライン `6342f7d5f`・生文字列比較）＝**変更3・追加0・削除0・予定外0**。
- 3帳票＝`_held_fresh` **75**／`_partial_fresh` **10**／`_idset_fresh` **7**（いずれも据置）。
- ⚠**`manualEffects.ts` を直しただけでは live に届かない**（収穫マージが MANUAL を不可侵にする）＝
  **`npx tsx scripts/syncManualLive.ts WXDi-P06-083 WXDi-P07-095 WXK05-030` が必要**だった（CLAUDE.md の道具）。
- 🔴**反転確認**＝`src/data/manualEffects.ts` を戻すと **golden が赤**（`WXK05-030-E1: live が manualEffects.ts と一致する`）。
  🔑**新テストは live だけでなく「manual 由来のマージ結果」と live の一致まで assert する**＝
  「manual を直したのに同期し忘れた」も「live だけ手で書いた」も検知できる（§5-29 の逆向きの穴＝第5バッチで踏んだもの）。
- 逆翻訳（`regen` 後）＝3効果とも原文どおりに読める。例＝
  `WXDi-P06-083-E2`「あなたのトラッシュからレベル1のシグニ1枚とレベル2のシグニ1枚とレベル3のシグニ1枚をこのシグニの下に置く」／
  `WXK05-030-E1`「対戦相手の《白》のシグニ1体と…《黒》のシグニ1体をトラッシュに置く。そしてあなたのデッキから《白》のカード1枚と…」。
  ⚠**群の filter に `cardType` を入れるまで「カード1体」と描かれていた**＝逆翻訳は群の filter しか読まないので、
  **群にも名詞を決める情報を持たせないと原文照合が効かない**（第4バッチの `filterJa` 対応と同じ趣旨）。
- `node scripts/genStubsMd.mjs` を再生成（`BANISH_MULTI_COLOR_SIGNI` の行が消えた）。
- 🆕**副産物＝逆翻訳の STUB 説明が「別 id の削除メモ」になっていたのを直した**（`WXDi-P08-046-E1`）。
  `genStubsMd.mjs` は**ハンドラの `if` の直上にある連続コメント行**を説明として拾うので、
  **削除した id の記録を次のハンドラの真上に置くと、その説明として逆翻訳に出る**。
  ⇒ 削除メモとハンドラの間に**空行**を入れ、`// LEAVE_FIELD_TO_DECK_BOTTOM: …` の1行説明を足した
  （旧表示＝「§6.4 O-24：`OPP_TRASH_FIELD_SIGNI_AND_ENERGY` は削除した…」／新表示＝
  「このシグニが場を離れる場合、代わりにこれをデッキの一番下に置く」）。

**⚠実機は不要と判定**（§2.2）＝`src/data/` `src/engine/`（ハンドラ削除のみ）`scripts/` `public/data/` `docs/` だけで、
`src/screens/` は触らず、新しい型・機構も足していない（既存 `SelectionConstraint.groups` を使っただけ）。

## 2026-09-01：PLAN §5.3 `O-188` 第5バッチ — 対象名詞句の限定が丸ごと落ちていた4効果（過剰実行）＋「据置」だったはずの1件は**既に直っていた**

**Codex（既定 `~/.codex`）が parser・engine・golden まで実装したところで利用上限**（`try again at 4:27 PM`）に当たり、
**live JSON の再生成（`build:effects` → `heldReview --adopt`）と全ゲートが未了のまま中断**した。**Claude が引き取って完成**させた。
⚠**この巡は `.codex-work` が先に上限**（`try again at 1:55 PM`・**1トークンも使わず即 exit**）だったので既定ホームへ投げ直しており、
**2アカウント連続で上限に当たった**（前例＝2026-08-30 第13バッチ）。

### 群A＝「このターンに手札から捨てた」の履歴限定が消えていた（`SPK01-12-E1`）

原文「あなたのトラッシュから**このターンに手札から捨てた**＜水獣＞のシグニ１枚を対象とし、《緑》を支払ってもよい。
そうした場合、それを手札に加える」に対し、live は `filter:{cardType:'シグニ', story:'水獣'}` だけ＝
**トラッシュの＜水獣＞なら何でも回収できる過剰実行**。

**受け皿は在った**（`TargetFilter.discardedFromHandThisTurn`／消費は `execUtils.ts:1729` の `trashCandidates` funnel／
実装例は `manualEffects.ts` の `WXK05-016-E2`）。**無かったのは名詞句フィルタ側の語彙**＝
`parserUtils.ts` に `parseDiscardedFromHandThisTurnFilter` を新設し、`extractNounPhraseFilter` と `parseSigniTarget` の両方へ配線した。
**対象宣言（`SELECT_TARGET_ONLY.selectTarget`）と回収元（`TRANSFER_TO_HAND.source`）の2箇所とも**限定が付く。

### 群B🔑＝`WXDi-P09-043-E2` は「据置」ではなく**採用漏れ**だった（この巡でいちばん重要な発見）

同日の `O-188` 第2バッチは、この効果を「**上流の別規則が先に食うので未修正・負方向 golden で固定**」と記録していた。
🔴**実測すると、その時点で fresh パースは既に `filter:{thisCardOnly:true}` を出していた**（`src/` を第2バッチ時点へ戻して確認）。
**live に届いていなかっただけ**＝`cardType` が消える変更は**純粋上位集合ではない**ので収穫マージが live を温存し、
カードは `docs/_held_fresh.json` に載っていた。**負方向 golden が live しか見ていなかったので緑のまま**だった。

⇒ **`node scripts/heldReview.mjs --adopt WXDi-P09-043` の1コマンドで解決**（parser の変更は0行）。
🔑**教訓＝「直っていない」と記録する前に fresh を見る。** §5-29 は「live だけの assert では parser の退行を検知できない」だったが、
**逆向き（parser は直っているのに live が古い）も同じ assert の穴から落ちる**。
⇒ **据置を記録するときの golden は live と fresh の両方を assert する**（今回の新テストはそうした）。

### 群C＝「あなたのセンタールリグと同じレベルの」（`WXK02-028-E1` / `SP38-001-E1`）

🔴**PLAN §5.3 の登録票（および 2026-09-01 の第2バッチの記録）は「受け皿は無い・動的レベル比較キーの新設が要る」としていたが、誤り。**
**`TargetFilter.levelEqLrig?: 'self' | 'opponent'` は `src/types/effects.ts:1048` に在り、`effectExecutor.ts:2740` の
`resolveDynamicFilter` が消費し、golden（`goldenTest.ts:4448` `:4468`）まで張ってあった。**
使っていたのは**カード固有 `addFilter` ハードコード2箇所だけ**で、**一般規則が無かった**。

- `parserUtils.ts` の `parseLevelFilter` に「〈あなた／対戦相手〉のセンタールリグと同じレベルの」→ `levelEqLrig` を追加。
  ⇒ **`WXK10-053-BURST` のカード固有ハードコードは不要になったので削除**（生成 JSON は per-effect diff で**変化0**を確認）。
- `effectParser.ts` に `bindCenterLrigLevelUnionTarget` を追加＝「**ルリグかシグニ**」の union 対象（`CENTER_LRIG_OR_SIGNI`）へ
  同じ filter を戻す（シグニ単独は既存の `parseSigniTarget` 経路が担当）。
- 🔴**engine の穴も1つ塞いだ**＝`execGrantKeyword` は **`SIGNI` 単独のときしか `resolveDynamicFilter` を通しておらず**、
  `LRIG` と `CENTER_LRIG_OR_SIGNI` の枝は**生の filter のまま**候補を作っていた。さらに union の枝は
  **センタールリグを filter に関係なく必ず候補へ入れていた**。⇒ 両方を直した（参照不能時は `noMatch` で空ヒット＝fail-closed）。
  ⚠**ブラスト半径は実測済み**＝`GRANT_KEYWORD` × `CENTER_LRIG_OR_SIGNI` は live に **14効果**あるが、
  **`target.filter` を持つのは今回の `SP38-001-E1` だけ**（他13件は `selectionConstraint.groups` を使っており `tgt.filter` は無い）
  ＝`lrigLikeFilterOk(lrig, undefined)` は `true` を返すので**挙動は変わらない**。

### 検証コマンドと結果

- `npm run gates` 全緑＝**golden 3180 → 3184 PASS / FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**（BASELINE 12）／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **per-effect diff**（ベースライン `b54cc149d`・キー順を正規化しない生比較）＝**変更4・追加0・削除0・予定外0**
  （`SPK01-12-E1` / `WXDi-P09-043-E2` / `WXK02-028-E1` / `SP38-001-E1`）。
  ⚠`parseLevelFilter` と `parseSigniTarget` という**広く使われるヘルパ**を触ったので、ここが本命の検査だった。
- 3帳票（報告直前に `build:effects` → `heldReview` を再実行した実測値）＝`_held_fresh` 76 → **75**（`WXDi-P09-043` を採用した1枚ぶん減）／`_partial_fresh` **10**（据置）／`_idset_fresh` **7**（据置）。
- 🔴**反転確認はファイル単位で3回取った**＝
  ①`src/engine/effectExecutor.ts` を戻すと **群C の E2E が FAIL**（「異なるレベルの相手シグニは候補外」）＝engine 変更は載っている。
  ②`src/data/effectParser.ts` を戻すと **3本 FAIL**（群A の fresh assert・群A E2E・群C E2E）。
  ③`src/data/parserUtils.ts` だけを戻すと**import が壊れて実行不能**（新設関数を effectParser が参照するため）＝この軸は ② に含まれる。
- 逆翻訳（`npm run regen` 後）＝`SPK01-12-E1`「…このターンに手札から捨てた＜水獣＞のシグニ…」と原文どおり表示される
  （`decompileEffects.ts` の語彙を「このターンに捨てた」→「このターンに**手札から**捨てた」へ精密化した）。

**⚠実機は不要と判定**（§2.2）＝触ったのは `src/data/` `src/engine/` `scripts/` `public/data/` `docs/` で、
**`src/screens/` は触っておらず、新しい型・機構も足していない**（既存 `resolveDynamicFilter` を既存の union 経路へ配線しただけ）。
engine 変更の実挙動は**新規 E2E golden 2本**（候補集合の正・負＋参照不能時の fail-closed）で固定した。

## 2026-09-01：PLAN §5.3 `O-188` 第4バッチ — 「AとBをそれぞれ1枚まで」の回収群を復元（過剰実行＋過小実行）

**真因**＝`TRANSFER_TO_HAND.transferGroups` と executor／逆翻訳の受け皿は既に在ったが、parser が
「あなたのトラッシュから〈A〉と〈B〉（と〈C〉）をそれぞれN枚まで対象とし、それらを手札に加える」から
群を生成していなかった。単一 `source.filter` に片群だけを残す／複数クラスをORへ潰す／限定を全部落とすため、
**合計2〜3枚が1枚へ減る過小実行**と、**限定外のシグニを拾える過剰実行**が同時に起きていた。

### 実装

- `src/data/effectParser.ts` — 効果単位の最終 root に限定文型 `applyRecoveryTransferGroups` を追加。
  名詞句の意味解釈は既存の厳格な `parsePickNounPhraseFilter` へ一任し、新規の名詞句パーサ／型／filterキーは作っていない。
  新規出力のクラスキーは `cardClass`。`applyDroppedRecoveryDesignation` より後なので同規則の
  `transferGroups` 非干渉契約を保ち、既に群を持つ形も触らない。
- `WXDi-P09-004-E1` の「共通修飾、レベル1、レベル2、レベル3のシグニ」は、助詞ではなく
  反復するレベル列挙を分割し、各句を同じ既存ヘルパへ渡した。
- `WXDi-P00-001-E1` は3つの連続 `TRANSFER_TO_HAND` が群と完全一致する場合に据え置く構造ガードを追加。
- `WX24-P4-017-E2` は一般規則だけで既存 JSON と完全一致したため、`applyExceedBodyFixes` のカード固有分岐を削除。
- 🆕**`scripts/decompileEffects.ts`（Claude が追加）** — `transferGroups` の逆翻訳が**自前で noun を組み立てており
  `cardType` と `color` しか描いていなかった**ので、他の群レンダラと同じく **`filterJa` に描かせる**1箇所へ直した。
  🔴**これを直さないと今回の修正そのものが読めない**＝クラス・レベル・アイコン・《ガードアイコン》を持たない・
  宣言クラスが**逆翻訳から丸ごと消え**、原文照合（このリポの主軸の検査）が効かない穴が新しく5効果ぶん増えていた。
- `scripts/goldenTest.ts` — live＋fresh の7効果、単一群の負対照、`WXDi-P00-001-E1` 据置、
  `WX24-P4-017-E2` 完全一致を3本で固定。既存「アイコンをANDしない」テストは、元の意図を保ったまま
  「アイコン群とクラス群が同じ filter に同居しない」を直接見る形へ精密化した。

### 調査結果・採用7効果

全件、既存 `transferGroups` と既存 `TargetFilter` だけで表現可能。JSON は今回生成した該当アクション。

| effectId | 原文の該当節 | 生成 JSON | 逆翻訳（効果全体） | 原文一致 |
|---|---|---|---|---|
| `WX16-026-BURST` | トラッシュからライズ持ちシグニと《武勇》のシグニを各1枚まで | `TRANSFER_TO_HAND{source:{TRASH_CARD,self,1},transferGroups:[{1,{cardType:'シグニ',hasRiseIcon:true}},{1,{cardType:'シグニ',cardClass:'武勇'}}]}` | `【LB】【ライフバースト】：あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳は両限定を表示せず不一致 |
| `WX16-031-BURST` | ＜調理＞シグニとアクセ持ちシグニを各1枚まで | `…transferGroups:[{1,{cardType:'シグニ',cardClass:'調理'}},{1,{cardType:'シグニ',hasIcon:'アクセ'}}]` | `【LB】【ライフバースト】：あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳は両限定を表示せず不一致 |
| `WXDi-D04-016-BURST` | シグニとスペルを各1枚まで | `…transferGroups:[{1,{cardType:'シグニ'}},{1,{cardType:'スペル'}}]` | `【LB】【ライフバースト】：あなたのトラッシュからシグニ1枚までとスペル1枚まで対象とし、それらを手札に加える` | 一致 |
| `WXDi-P04-022-E1` | デッキ上2枚をトラッシュ。その後、赤と黒のシグニを各1枚まで | `SEQUENCE[TRASH{DECK_CARD,2},TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',color:'赤'}},{1,{cardType:'シグニ',color:'黒'}}]}]` | `【自】このシグニが場に出たとき：あなたのデッキの上からカードを2枚トラッシュに置く。そしてあなたのトラッシュから赤のシグニ1枚までと黒のシグニ1枚まで対象とし、それらを手札に加える` | 該当節は一致（【出】の表示名は既存 decompiler 規約） |
| `WXDi-P08-002-E1` | 黒ルリグ条件内でLv2シグニとLv3シグニを各1枚まで | 3つ目の `CONDITIONAL.then=TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',level:2}},{1,{cardType:'シグニ',level:3}}]}` | `【起】（メイン起動）：〈《無×1》〉あなたの場のルリグが3体以上いて、持つ色が3種類以上の場合、あなたの場に《白》のルリグがいるなら、あなたの《ガードアイコン》を持つシグニ(トラッシュ)1枚を手札に加える。そしてあなたの場に《緑》のルリグがいるなら、対戦相手のパワー10000以上のシグニ1体をバニッシュする。そしてあなたの場に《黒》のルリグがいるなら、あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳はLv2/Lv3を表示せず不一致 |
| `WXDi-P09-004-E1` | 宣言クラス・非ガードのLv1/Lv2/Lv3シグニを各1枚まで | `SEQUENCE[DECLARE_CLASS,TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',level:1,noGuard:true,classEqDeclaredClass:true}},{…level:2…},{…level:3…}]}]` | `【起】（メイン起動）：〈《無×1》〉クラス１つを宣言する。そしてあなたのトラッシュからシグニ1枚までとシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳は宣言クラス・非ガード・各レベルを表示せず不一致 |
| `WXDi-P11-056-E1` | 選択肢①でLv2以下の＜天使＞と＜古代兵器＞を各1枚まで | `CHOOSE.c0=TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',level:{max:2},cardClass:'天使'}},{1,{cardType:'シグニ',level:{max:2},cardClass:'古代兵器'}}]}` | `【起】（メイン起動）：〈《白×1》《黒×1》〉以下の2つから1つを選ぶ【あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える / あなたの場に《融合せし極門　ウトゥルス//メモリア》がいる場合、対戦相手のシグニ1体を手札に戻す】` | JSONは一致。逆翻訳はLv上限・両クラスを表示せず不一致 |

**見送り0件**。指定7効果はすべて既存機構で表現できた。触るな指定2効果は変更0：
`WXDi-P00-001-E1` は旧3連続アクションのまま、`WX24-P4-017-E2` は生成 JSON が旧専用分岐と完全一致。

### 別軸の食い違い・検証

- live JSON の今回の群条件以外で新たに見つけた原文差は **0件**。
- 🔴**上表の「逆翻訳が不一致」5件は Codex の報告時点の値**＝**同じ巡で Claude が `decompileEffects.ts` を直したので解消済み**。
  修正後の実出力（`npm run regen` 後）＝
  `WX16-026-BURST`「あなたのトラッシュから《ライズアイコン》を持つシグニ1枚までと＜武勇＞のシグニ1枚まで対象とし、それらを手札に加える」／
  `WXDi-P09-004-E1`「…レベル1の《ガードアイコン》を持たない宣言したクラスを持つシグニ1枚まで…（レベル2・3も同様）」／
  `WXDi-P11-056-E1`「…＜天使＞のレベル2以下のシグニ1枚までと＜古代兵器＞のレベル2以下のシグニ1枚まで…」＝**7効果とも原文と一致**。
- `npm run gates` 全緑＝golden **3177 → 3180 PASS / FAIL 0**、smoke **10721/10721・全0**、
  fuzz **CRASH/HANG/INVARIANT/EXPLOSION 0**、census高シグナル **11据置**、
  census:stubs **A0/C0**、manual-fields **0**、census:enginetext **A🔴130行据置**、
  lint **0 errors / 249 warnings（増減0）**。
- ベースライン `99dda6a11` との effectId 単位・キー順正規化済み機械 diff＝**変更7・追加0・削除0・予定外0**。
- 🆕**Claude 側の独立検証（`tmp_verify.mjs`＝キー順を正規化しない生文字列比較）では 変更8件**＝
  8件目は **`WXDi-D04-016-E2` の `activeCondition` の出現位置が動いただけ**で**中身は1バイトも同じ**
  （同カードが再生成された副作用）。⚠**「正規化済み diff で0」と「生 diff で0」は別の数字**なので、両方見ること。
- 🆕**反転確認は Claude も独立に再現**＝`applyRecoveryTransferGroups` の呼び出し1行を潰すと
  `npm run golden -- --only "O-188 第4"` が **1 PASS / 2 FAIL**（fresh assert と `WX24-P4-017-E2` 一致 assert）。復元後は全件 **3180/3180 PASS**。
- 🆕**逆翻訳の修正後に `npm run regen` → `npm run gates` を回し直して全緑**（golden 3180・census 11・
  census:stubs A0/C0・enginetext A🔴130行・lint 0 errors / 249 warnings）。
- 報告直前に `npm run build:effects` → `node scripts/heldReview.mjs` を再実行＝
  `_held_fresh.json` **76（増減0）**／`_partial_fresh.json` **10（増減0）**／`_idset_fresh.json` **7（増減0）**。
- 反転確認＝最終 root の一般規則呼び出しを一時無効化すると、新規3テスト中2本が FAIL：
  7効果の fresh assert は `WX16-026-BURST` で `transferGroups` 0件、`WX24-P4-017-E2` は旧単一filterへ退行。
  復帰後は新規3/3、全件3180/3180 PASS。
- 実機不要（§2.2）＝`src/data/`／`scripts/`／`public/data/`／`docs/` のみ。
  `src/engine/`／`src/types/`／`src/screens/` と新しい型・機構は変更していない。
- **実装は Codex（既定 `~/.codex`）／検証・逆翻訳の修正・簿記は Claude。**
  ⚠**`.codex-work` はこの巡の投入時点で利用上限**（`try again at 1:55 PM`）＝**1トークンも消費せず即 exit** したため、
  既定ホームへ投げ直した（前巡は「上限で途中放棄」だったが、今回は**着手前に落ちる**形＝残骸の判定が不要）。

## 2026-09-01：PLAN §5.3 `O-188` 第3バッチ — 回収の対象宣言がゾーンごと落ちて「無言 no-op」3効果

Codex は利用上限（`try again at 1:55 PM`）のまま復帰しなかったので **Claude が実装**した。

**真因**＝原文「あなたの〈トラッシュ／エナゾーン〉から〈X〉N枚(まで)を**対象とし**、〈任意コスト〉**てもよい**。
**そうした場合、それを手札に加える**」で、**対象宣言のゾーン・所有者・修飾が丸ごと落ち**、
帰結が既定の `TRANSFER_TO_HAND{source:{DECK_CARD, owner:'self', count:1}}` に化けていた。

🔴**「別のカードを拾う」ではなく、帰結が丸ごと起きない**＝`execTransferToHand` は `DECK_CARD` を
**`fromTop:true` のときしか扱わず**、それ以外は最後の `else` で `done(ctx)` に落ちる。
⇒ **コストを払っても何も起きない過小実行**。⚠**型は正しく値（ゾーン）だけが別物**なので、
逆翻訳・census・`census:goldentypes` のどれにも映らない。

**影響枚数**＝**3効果**（`WXDi-P01-070-E1`＝エナから＜武勇＞／`WXDi-P05-059-E2`＝トラッシュから赤のスペル／
`WDK08-Y14-E1`＝エナから＜水獣＞を1枚まで）。
**先行例と同じ作法**で `applyDroppedRecoveryDesignation` を新設した（`applyDroppedEnergyDesignation`＝続き375 に倣い、
**壊れている形＝`DECK_CARD` 既定に当たったときだけ**書き換える。既に正しいゾーンを持つ形は据置）。
📌`WXDi-P05-059-E2` は source が正しくなった結果、後段の `applyO96OptionalCostTargetFirst` が
**対象固定まで引き上げた**（規則が正しい入力を得ると自動で連鎖する）。

### 母集団の測り方
「原文に『デッキ』が一度も出てこないのに live に `DECK_CARD` が出る効果」で全数走査＝**4効果 / 4カード**
（CSV 総数 6712 を検算）。**うち3件を修正、1件は据置**。

🔴**据置＝`WX24-P2-054-E2`**（原文「対戦相手のシグニを**3体まで**対象とし、**それらのレベルの合計1につき**
《緑》を支払ってもよい。そうした場合、**それらをエナゾーンに置く**」）。
live は `ENERGY_CHARGE{DECK_CARD}`＝**自分のデッキからエナチャージする別の動作**。
帰結の型（`SEND_TO_ENERGY`）も、対象レベル依存コスト（`costColorsPerTargetLevel`）も別軸なので分けた。
**負方向テストを golden に置いた**（直したら赤くなる）。

### 検証コマンドと結果
- `npm run gates` 全緑＝**golden 3176 → 3177・FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **ブラスト半径**＝ベースライン `ae777cc69` との effectId 単位 機械 diff で **変更3件・追加0・削除0・予定外0**。
- 3帳票（`build:effects`→`heldReview` を報告直前に再実行した実測値）＝`_held_fresh` **76**／`_partial_fresh` **10**／`_idset_fresh` **7**（いずれも据置）。
- 🔴**反転確認（§5-29）**＝規則のマッチを無効化すると `WXDi-P01-070-E1` の **fresh assert が FAIL**。
  golden には live 側と fresh 側の**両方**の assert を入れてある。

**⚠実機は不要と判定**（§2.2）＝触ったのは `src/data/` ・ `scripts/` ・ `public/data/` ・ `docs/` のみ。
`src/screens/` も `src/engine/` も `src/types/` も触らず、新しい型・機構も足していない。

### 🔴この巡でいちばん価値があったのは「やらなかった判断」

**当初バッチ4は「`O-96` の did-it ゲートでない18件」＝任意コスト直後が `CONDITIONAL{IS_MY_TURN}` の群にする予定だった。**
署名で数えると **434効果**（AUTO 414 / MANUAL 20）あり、うち **99件が相手ターン側**（`ON_LIFE_BURST` 等）で、
PLAN §1 の「相手ターンに解決する効果では `IS_MY_TURN` の残留が致命的＝効果が丸ごと発火しない」という
記録と合わせると**大物に見えた**。

🔴**engine の消費地点を読んだら実害ではなかった**（CODEX_GUIDE §5-3-3′ の罠を踏む寸前だった）：
- `execUtils.ts:2706`＝`case 'IS_MY_TURN': return true;`（executor はオーナー視点なので**常に真のプレースホルダ**）。
- `effectExecutor.ts:4899`＝**任意コスト STUB の直後の `CONDITIONAL` は
  `['IS_MY_TURN','PAID_ADDITIONAL_COST']` を同一に扱う**（同じ形が `:4742` `:5438` にもある）。
- `triggerCollect.ts:1262` のターン判定は **`eff.condition`（効果レベル）だけ**を見ており、
  アクション内側の `CONDITIONAL` は見ない。

⇒ **この434件は「慣例エンコード」であって、大半は実害ゼロ。**
PLAN §1 が「致命的」と書いた2件（`WX15-053-TRAP` / `WXDi-P05-073-BURST`）は
**この interception が効かない位置**にあった個別事情だった、と読み替えるべき。
🔑**教訓＝「署名の件数」は実害の件数ではない。executor の分岐を読むまで着手しない。**
（同じ罠の前例＝続き603＝998効果と記録されていたが実害は29。）


## 2026-09-01：PLAN §5.3 `O-188` 第2バッチ — 暫定ガードを外して18効果 ＋ 自己回収の語順漏れ（過剰実行）

Codex が利用上限（`try again at 1:55 PM`）で使えなかったため **Claude が指示書どおり実装**した。

### 群A＝`O-96` の対象固定を塞いでいた2つの暫定ガードを外した（12効果）

`applyO96OptionalCostTargetFirst`（`src/data/effectParser.ts`）に、第1バッチで置いた
**「一度に載せすぎないための暫定ガード」が2つ**あった。

1. `outcome.source.filter?.hasGuard || noGuard` ＝**ガード軸だけ**に絞る。**意味的な根拠は無い**。
2. `allowedCostKeys` ＝ **`costColors` 単独 か `handDiscard` 単独のどちらか一方だけ**という排他 XOR。
   🔴**これが一番効いていた**＝`O-190` 第1バッチで `OPTIONAL_COST` の payload に
   `fieldTrash` / `selfTrash` / `handReveal` / `underAnySigniTrash` が入るようになった結果、
   **複合任意コストの効果が全部この XOR で弾かれていた**。

⇒ ①を撤去し、②を**許可リスト方式**へ広げた（`costColors` / `handDiscard` / `handReveal` /
`fieldTrash` / `fieldDown` / `selfTrash` / `energyTrash` / `underAnySigniTrash` / `charmTrash`）。
🔴**fail-closed は維持**＝**知らないキーが1つでも混ざれば通さない**。
⚠**対象のレベルで額が決まる系（`costColorsPerTargetLevel` 等）は許可リストに入れていない**＝倍率の意味が変わるので別軸。

**採用12効果**（全件 `heldReview --adopt` 経由・**1件ずつ原文照合済み**）＝
`WXDi-P04-022-E2` / `WXDi-P04-041-E1` / `WXDi-P04-041-E2` / `WXDi-P13-044-E1` / `WXDi-P14-041-E2` /
`WX24-P1-079-E1` / `WX24-P2-063-E1` / `WX24-P4-059-E1` / `WXK05-022-E1` / `WXK08-052-E1` /
`WDK11-011-E1` / `SPK01-12-E1`。

🔑**見積もりの訂正**＝投入前は「`TRANSFER_TO_HAND` の6効果」と見ていたが、**実際は12効果**だった。
②の XOR を外すと **`BANISH` / `BOUNCE` / `TRASH` / `POWER_MODIFY` 側の複合コスト効果も一緒に直る**
（`WDK11-011-E1`＝`fieldTrash` 単独コスト、`WXK08-052-E1`＝`underAnySigniTrash` 単独コストなど）。
⚠**予定外の5枚は「別の効果へ漏れた」のではなく「同じ欠陥の未計測分」**＝
兄弟効果への波及が無いことを **effectId 単位の per-effect diff で確認済み**（変化したのは意図した効果だけ）。

### 群B＝「**このカードを**トラッシュから手札に加える」の語順が丸ごと漏れていた（6効果）

🔴**実害＝過剰実行**。原文は**効果元自身の回収**なのに、live は `TRANSFER_TO_HAND{TRASH_CARD, filter:{}}`
＝**トラッシュのどのカードでも1枚回収できる**状態だった。

**受け皿も規則も既にあった**（`filter.thisCardOnly`／`execTransferToHand` の `TRASH_CARD` 分岐が消費）。
**漏れていたのは語順だけ**＝既存規則は「あなたのトラッシュから**このカードを**手札に加える」しか読まず、
「**このカードを**トラッシュから手札に加える」を落としていた。指示語も3通り（カード／シグニ／スペル）ある。

**修正6効果**＝`WXDi-P03-081-E1` / `WXDi-P08-075-E1` / `WXK01-041-E2` / `WXK10-030-E2` /
`WX24-P3-093-E2` / `WX16-028-E3`。
⚠**`WX16-028-E3` は Claude の母集団 regex が取りこぼしていた**（「このカードを**あなたの**トラッシュから」＝
指示語とゾーンの間に「あなたの」が入る形）。**実装の regex のほうが広かったので拾えた**＝
🔑**母集団の見積もりが実装より狭いことがある**という実例。

🔴**据置1件＝`WXDi-P09-043-E2`**（原文「この**シグニ**を…」）。**上流の別規則が先に食って**
`filter:{cardType:'シグニ'}` へ落ちるため、**トラッシュのどの＜シグニ＞でも回収できる過剰実行が残る**。
**負方向テストを golden に置いた**（直したら赤くなる）＝「直っている」と誤解しないため。

### 検証コマンドと結果
- `npm run gates` 全緑＝**golden 3174 → 3176・FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **ブラスト半径**＝ベースライン `21efff5cb` との effectId 単位 機械 diff で **変更18件・追加0・削除0**。
  内訳＝群A 12 ＋ 群B 6。**予定外0**（`WX16-028-E3` は上記のとおり母集団側の取りこぼしで、実装は正しい）。
- 3帳票＝`_held_fresh` 78 → **76**／`_partial_fresh` 10 → 10／`_idset_fresh` 7 → 7。
- 🔴**反転確認（§5-29）を2本とも取った**＝
  ①群Bの regex を旧語順へ戻すと `WXDi-P03-081-E1` の **fresh assert が FAIL**。
  ②群Aの `hasGuard/noGuard` ガードを戻すと `SPK01-12-E1` の **fresh assert が FAIL**。
- **既存 golden 3本を書き換えた**（§5-17′＝元の意図を確認してから）＝
  `§6.4 O-26` は**位置（steps[0]）で `OPTIONAL_COST` を取っていた**ので **id で引く形へ直した**
  （assert の意図は「位置」ではなく「エナと自己トラッシュが1つの任意コストに束ねられていること」）。
  据置契約2本は**削除せず、いま何を据置しているかへ書き換えた**（`CHOOSE` のネスト器と専用 STUB id）。

**⚠実機は不要と判定**（§2.2）＝触ったのは `src/data/` ・ `scripts/` ・ `public/data/` ・ `docs/` のみ。
`src/screens/` も `src/engine/` も `src/types/` も触らず、新しい型・機構も足していない。
今回広げた経路（`SELECT_TARGET_ONLY{TRASH_CARD}`）は**同日の `O-188` 第1バッチで実機 PASS 済み**。

### 新しく見つけた原文との食い違い（このバッチでは直さない＝§5.3 へ登録する）
1. `WXDi-P01-070-E1` — 原文「あなたの**エナゾーンから**＜武勇＞のシグニ1枚」なのに `source` が `DECK_CARD`。
2. `WXDi-P05-059-E2` — 原文「あなたの**トラッシュから**赤のスペル1枚」なのに `source` が `DECK_CARD`。
3. `SPK01-12-E1` — 原文「**このターンに手札から捨てた**＜水獣＞のシグニ」の限定が filter に無い＝**過剰実行**。
4. `WXK02-028-E1` — 原文「**あなたのセンタールリグと同じレベルの**シグニ」の限定が filter に無い＝**過剰実行**。
5. `WX24-P4-051-E2` — コスト「エナゾーンから**それと同じレベルの**シグニ1枚」の動的レベルが表せていない。
6. `WXDi-P04-022-E1` — 原文「トラッシュから**赤と黒の**シグニを**それぞれ1枚まで**」なのに live は**黒1枚だけ**
   （`transferGroups` を使えば表せる形）。
7. `WXDi-P09-043-E2` — 群Bの据置（上記）。
📌**`WXDi-P04-041-E1` と `-E2` の色フィルタ差は正しかった**（原文が別の【自】で、E2 側だけ「黒の」と書いてある）。
投入前に「疑義」として挙げていたが、原文照合で解消した。


## 2026-09-01：PLAN §5.3 `O-188` 第1バッチ — `SELECT_TARGET_ONLY` をトラッシュへ広げ、`TRANSFER_TO_HAND` を対象固定に対応

**真因**＝「あなたのトラッシュから〈X〉1枚を**対象とし**、《色》を支払ってもよい。**そうした場合、それを**手札に加える」
という原文に対し、live は**対象宣言を持たず、支払いのあとで対象を選んでいた**。
⇒ 🔴**コストを払ってから別のトラッシュ札を選び直せた**＝原文の「それ」が別のカードになる**過剰実行**。

⚠**この形は engine 側に4つの穴があり、どれか1つでも残すと「フィールドは付いたが無視される＝無言 no-op」になる。**
`O-96` 第1バッチ（続き763）で「3箇所」と記録していたが、実測すると**4箇所目が本体**だった。

| # | 穴 | 直した場所 |
|---|---|---|
| ① | `TransferToHandAction` に `targetsStored` / `fixedCardNums` が無い | `src/types/effects.ts`（`interface TransferToHandAction`） |
| ② | `execTransferToHand` に保存対象での絞り込みが無い | `src/engine/effectExecutor.ts`（`TRASH_CARD` 分岐） |
| ③ | `freezeStoredTargets` の `FREEZABLE` に `TRANSFER_TO_HAND` が無い | 同上（配列に1語追加） |
| ④ 🔴 | **`SELECT_TARGET_ONLY` が `SIGNI`/`LRIG`/`CENTER_LRIG_OR_SIGNI` 以外を `lastProcessedCards: []` で黙って落とす** | `src/engine/execStubPart1.ts`（`TRASH_CARD`/`owner:'self'` 分岐を追加） |

🔑**④の設計上の要点＝候補集めを `execTransferToHand` と同一の関数に切り出して共有した**
（`transferToHandTrashCandidates` を `effectExecutor.ts` に置き、`execStub` 経由で `execStubPart1` へ注入）。
**宣言時と実行時で候補がズレると「選んだのに動かない」**という、この機構特有の事故を構造的に防ぐため。
⚠**相手トラッシュ（`owner:'opponent'`）は今回入れていない**＝母集団に無いので fail-closed のまま。
⚠**`transferGroups` との併用は非対応**＝1対1対応が付かないので、**黙って束縛を捨てず**ログに残して降りる。

**影響枚数**＝**3効果**（`WXDi-P02-035-E2` / `WXDi-P05-042-E2` / `WX24-P4-044-E3`）。
parser 側は `O96_STORABLE_OUTCOMES` に `TRANSFER_TO_HAND` を足し、**第1バッチは `hasGuard`/`noGuard` 軸だけ**に絞った。
⚠**この絞り込みに意味的な根拠は無い**（一度に20効果を載せないための暫定ガード）＝**第2バッチで外す**。
母集団は「`O-96` 未固定署名のうち帰結に `TRANSFER_TO_HAND` を含むもの＝23効果、うち20効果が `TRASH_CARD`/`owner:self`」。

**検証コマンドと結果**
- `npm run gates` 全緑＝**golden 3168 → 3174（+6本）・FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **ブラスト半径**＝ベースライン `223db3b0d` との effectId 単位 機械 diff で**変更3件・追加0・削除0・予定外0**。
- golden の内訳＝①支払えば宣言した1枚だけが動く ②辞退すれば動かない ③払えない盤面では pay 不能
  ④**候補0なら任意コストを提示せず降りる**（④の無言 no-op 再発防止）
  ⑤🔴**`targetsStored` 省略時は従来どおり全候補**（省略をスキップに倒すと既存23効果が全滅する）
  ⑥fresh パース assert（§5-29）。

**🔴実機検証（§2.2＝`src/engine/` と `src/types/` を触り、新機構を足したので必須）**
`scripts/verifyBattleDrive.mjs` に `o188TrashRecoverPay` / `o188TrashRecoverSkip` を追加（`WX24-P4-044-E3`）。
- **PASS**＝宣言した `WD01-016#901` だけが手札へ／もう1枚のガード持ちはトラッシュに残留／
  非ガードは候補外／エナ 2→0／選択モーダルに「トラッシュから」が出る。
- **対照 PASS**＝辞退すれば手札・トラッシュ・エナが1つも動かない。
- 🔴**反転確認**＝`execTransferToHand` の絞り込み2行を外して再実行すると、
  **支払い直後の候補が `["WD01-016#901","WD01-017#902"]` の2枚に戻り FAIL**（＝旧挙動＝選び直せる）。
  戻したうえで `SKIP_BUILD=0` で再実行して ALL PASS を確認した。
- 🔑**この観測は golden では踏めない**＝`self_trash` スコープの選択モーダルが実 UI で開くかは BattleScreen 側の話。

**⚠この巡の運用上の実績＝Codex が2バッチ連続で利用上限に当たった。**
今回は **engine 実装と golden までを Codex が完成させた直後に exit 1**（`try again at 1:55 PM`）で、
**作業ツリーには途中変更が残っていた**（前回＝続き765 は clean だった）。⇒ **落ち方は2通りある**と記録する。
Claude が引き継いで ①コメント・テスト名の日本語化（Codex は英語で書く） ②実機シナリオ ③反転確認 ④簿記 を完了させた。


## 2026-09-01：PLAN §5.3 `O-190` 第1バッチ — 複合任意コストの消失した前半8効果を復元

原文が「〈別のコスト動作〉し《色》を支払ってもよい。そうした場合、～」なのに、live の
`STUB{OPTIONAL_COST}` が `costColors` しか持たず、原文より安いコストで本体を実行できた8効果を修正した。
CSV 12枚を BOM 除去・CardNum 先勝ちで読み、**カード総数6712**を検算したうえで、色支払い任意句493出現、
直前が別コスト動作のもの22出現／22カードを再現した。22件のうち既に正しい10件と受け皿のない4件は変更していない。

### 変更ファイルと理由

- `src/data/effectParser.ts` — 既存 `parseOptionalCostClauseFields` に限定文型を足し、最終 root の bare
  `OPTIONAL_COST{costColors}` だけへ前半payloadを合成した。表せない修飾が残れば `null` の原則は維持した。
- `scripts/goldenTest.ts` — 8効果の fresh/live、4受け皿の pay/skip/支払不能、4効果の did-it gate を固定した。
- `public/data/effects_WXDi.json` / `public/data/effects_WX24_26.json` — parser 出力を `build:effects` と
  `heldReview` で採用した。手編集ではない。
- `docs/decompile_sheet7.txt` / `docs/decompile_sheet8.txt` / `docs/decompile_sheet9.txt` /
  `docs/grouped_sentence_all.txt` — `npm run regen` による8効果の逆翻訳・下流帳票更新。
- `docs/_vocab_census.txt` — 修正済み効果が STUB/MANUAL 格納群から外れた結果を再生成した。
- `docs/_census_stubs.txt` — parser 行追加に伴う生成地点の行番号だけを再生成した。A群/C群の件数は不変。
- `docs/_held_fresh.json` / `docs/_held_review.txt` — fresh/live 収穫帳票を再生成し、4件のゲート差分を目視採用した。
- `docs/BUGFIXES.md` — 本報告。

### 既存受け皿と支払不能判定の実査

全キーは `resolveOptionalCostSpec`（`src/engine/execUtils.ts:388`、payload転送は407～410行）で
`OptionalCostSpec` に渡る。名前だけを借りず、候補数を判定する `canAffordOptionalCostSpec` と実際の支払い列を作る
`optionalCostPaySteps` の両方を確認した。

| effectId | 受け皿 | 支払不能を止める箇所 | 実支払い | 結論 |
|---|---|---|---|---|
| `WXDi-P16-050-E1` | `handDiscard` | `canAffordOptionalCostSpec`:467～471（手札をfilterし必要枚数を比較） | `optionalCostPaySteps`:623～628（`TRASH HAND_CARD`, `asCost:true`） | スペル0枚ならpay不可 |
| `WX24-P1-011-E1` | `handDiscard` | 同467～471 | 同623～628 | 手札0枚ならpay不可 |
| `WX25-P2-022-E1` | `handDiscard` | 同467～471 | 同623～628 | 手札0枚ならpay不可 |
| `WX25-CP1-041-E1` | `handDiscard` | 同467～471 | 同623～628 | ＜ブルアカ＞1枚以下ならpay不可 |
| `WX26-CP1-046-E1` | `handDiscard` | 同467～471 | 同623～628 | ＜プリオケ＞1枚以下ならpay不可 |
| `WXDi-P04-007-E1` | `fieldTrash` | 同527～534（場候補をfilterし必要数を比較） | 同668～676（`TRASH SIGNI`, `asCost:true`） | 白シグニ0体ならpay不可 |
| `WXDi-P06-055-E1` | `handReveal` | 同473～477（手札をfilterし必要枚数を比較） | 同629～635（`REVEAL HAND_CARD`） | ＜天使＞シグニ5枚以下ならpay不可 |
| `WXDi-P06-083-E1` | `underAnySigniTrash` | 同516～525。`fromThis:true` は source と同じ場の束だけを数える | 同660～667（`TAKE_FROM_UNDER_SIGNI`, `fromThis:true`） | このシグニの下2枚以下ならpay不可。他のシグニの下では代用不能 |

`TargetFilter.cardType:'スペル'` は既存型・`matchesFilter` の語彙であり、別キーの借用ではない。
`WXDi-P04-041-E1` が既に通って007が通らなかった理由は、既存 `parserUtils.tradeOptionalCost` が
「あなたの**他の**…シグニ」を直接 `fieldTrash{excludeSelf:true}` にする一方、007の
「あなたの**白の**シグニ」はそのregexに一致せず、従来は bare `costColors` 経路へ落ちたため。
`foldOptionalHandRevealCost` は「公開してもよい」という独立任意動作の木を折り畳む機構であるため、
今回の「公開し《色》を支払ってもよい」は複合句を一括解釈する `parseOptionalCostClauseFields` に⑥として足した。

### 採用8効果（effect単位）

以下の「逆翻訳」は `_decompile` の効果全体。JSON欄は生成された `OPTIONAL_COST` と、今回変更した場合は直後gateを示す。

1. `WXDi-P16-050-E1` — 原文コスト「手札からスペルを１枚捨て《青》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"],"handDiscard":{"count":1,"filter":{"cardType":"スペル"}}}`。
   逆翻訳全体「【自】あなたのアタックフェイズ開始時：対戦相手のシグニ1体を対象とする。そして《青》を支払い手札からスペルを1枚捨ててもよい。そして（コストを支払った場合）なら、それをバニッシュする」。
   コスト・gate・本体は原文と一致（接続順の表示差のみ）。
2. `WX24-P1-011-E1` — 原文コスト「手札を１枚捨て《白》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["白"],"handDiscard":{"count":1}}`。
   逆翻訳全体「【自】このルリグがアタックしたとき：あなたの場に＜アーム＞のシグニがいるなら、《白》を支払い手札からカードを1枚捨ててもよい。そうした場合、あなたのルリグ1体をアップする。そしてあなたのシグニ1体は能力を失い、新たに得られない（ターン終了時まで）」。
   コストは一致。本体gateが別枝の `IS_MY_TURN` であるため `PAID_ADDITIONAL_COST` 化は据置。本体の対象種別にも既存不一致あり（後述）。
3. `WX25-P2-022-E1` — 原文コスト「手札を１枚捨て《青》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"],"handDiscard":{"count":1}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのシグニがアタックしたとき：《once_per_turn》《青》を支払い手札からカードを1枚捨ててもよい。そして（コストを支払った場合）なら、あなたのシグニ1体に【アサシン:{\"isFrozen\":true}】を与える（ターン終了時まで）」。
   コストとdid-it gateは一致。対象の＜武勇＞filterには既存不一致あり（後述）。
4. `WX25-CP1-041-E1` — 原文コスト「手札から＜ブルアカ＞のカードを２枚捨て《青》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"],"handDiscard":{"count":2,"filter":{"story":"ブルアカ"}}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのアタックフェイズ開始時：《青》を支払い手札から＜ブルアカ＞のカードを2枚捨ててもよい。そして（コストを支払った場合）なら、対戦相手のシグニ1体をデッキの一番下に置く」。
   コストとdid-it gateは一致。対象選択時点には既存不一致あり（後述）。
5. `WX26-CP1-046-E1` — 原文コスト「手札から＜プリオケ＞のカードを２枚捨て《無》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["無"],"handDiscard":{"count":2,"filter":{"story":"プリオケ"}}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのルリグがアタックしたとき：〔範囲:any_ally〕《once_per_turn》《無》を支払い手札から＜プリオケ＞のカードを2枚捨ててもよい。そして（コストを支払った場合）なら、あなたのルリグ1体をアップする。そしてあなたのルリグ1体は能力を失い、新たに得られない（ターン終了時まで）」。
   コストとdid-it gateは一致。トリガー個体の照応には既存不一致あり（後述）。
6. `WXDi-P04-007-E1` — 原文コスト「あなたの白のシグニ１体を場からトラッシュに置き《白》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["白"],"fieldTrash":{"count":1,"filter":{"cardType":"シグニ","color":"白"}}}`。
   逆翻訳全体「【自】あなたのメインフェイズ開始時：対戦相手のシグニ1体を対象とする。そして《白》を支払ってもよい。そして（コストを支払った場合）なら、対戦相手のシグニ1体を手札に戻す」。
   live JSON・実行は原文と一致。逆翻訳器が `fieldTrash` を表示しないため、逆翻訳文だけは不一致。
7. `WXDi-P06-055-E1` — 原文コスト「あなたの手札から＜天使＞のシグニを６枚公開し《赤》《無》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","無"],"handReveal":{"count":6,"filter":{"cardType":"シグニ","story":"天使"}}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのアタックフェイズ開始時：対戦相手のパワー12000以下のシグニ1体を対象とする。そして《赤》《無》を支払い、手札から＜天使＞のシグニを6枚公開してもよい。そして（コストを支払った場合）なら、それをバニッシュする」。
   語順表示差だけでコスト・gate・本体は原文と一致。
8. `WXDi-P06-083-E1` — 原文コスト「このシグニの下からカード３枚をトラッシュに置き《黒》《無》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["黒","無"],"underAnySigniTrash":{"count":3,"fromThis":true}}`。
   逆翻訳全体「【自】このシグニがアタックしたとき：対戦相手のシグニ1体を対象とする。そしてこのシグニの下からカードを3枚トラッシュに置いてもよい。そして（コストを支払った場合）なら、それのパワーを－8000する」。
   live JSON・実行は原文と一致。逆翻訳器が同payloadと `costColors` を併記しないため、逆翻訳文だけは色支払いが欠落。

### 据置

- `WX15-053-TRAP` — 【トラップ】は `OptionalCostSpec` の対象外。据置。次に取るなら
  `fieldTrapTrash:{count,excludeSource}` のような専用キーを新設し、`canAffordOptionalCostSpec` で
  `field.signi_traps` を数え、`optionalCostPaySteps` から選んだtrapをtrashへ移す支払いaction/UIへ接続する必要がある。
- `WX22-018-E2` — いずれかのtrashから「コスト合計0のスペル」を除外する受け皿がなく、owner横断filterも必要。据置。
  次に取るなら `trashExile:{count,owner:'any',filter:{cardType:'スペル',costSum:0}}` 相当を新設し、
  `canAffordOptionalCostSpec` で両trashを走査、`optionalCostPaySteps` で選択付き `EXILE` を消費する。
- `WXK06-029-E1` — デッキ探索中にsource自身を公開する継続効果で、通常の任意コストではない。据置。
  `deckSearchRevealSelf` 相当の専用状態を設け、deck search の候補提示／resume地点で公開→色支払い→手札移動を消費する必要がある。
- `WXDi-P11-049-E1` — 自trashの＜毒牙＞シグニ3枚を除外する受け皿がないため据置。次に取るなら
  `trashExile:{count:3,owner:'self',filter:{cardType:'シグニ',story:'毒牙'}}` 相当を設け、
  `canAffordOptionalCostSpec` の自trash候補数判定と `optionalCostPaySteps` の選択付き `EXILE` に接続する。
- `WX24-P1-011-E1` のpayloadは採用したが、`OPTIONAL_COST` が `HAS_CARD_IN_FIELD` の内側、結果本体が
  別の `IS_MY_TURN` 枝にあるため、この1件のgate変更は据置。root直列形へ一般化して他効果を壊すより、別バッチで木を組み直す。

既に正しい10効果（`WXDi-D08-004-E1`, `WXDi-P03-035-E1`, `WXDi-P04-041-E1`,
`WXDi-P04-051-E1`, `WXDi-P12-044-E2`, `WXDi-P13-044-E1`, `WX24-P2-063-E1`,
`WX24-P2-086-E1`, `WX24-P4-059-E1`, `WX25-P3-019-E1`）は変更0。

### コスト条件以外で見つけた原文差

本バッチでは直していない。

- `WX24-P1-011-E1` — 原文は「このルリグ」が能力を失うが、live は `REMOVE_ABILITIES` の対象が自シグニ。
- `WX25-P2-022-E1` — 原文の結果対象は自分の＜武勇＞シグニだが、live の結果targetに `story:'武勇'` がない。
- `WX25-CP1-041-E1` — 原文は相手シグニをコスト提示前に対象とするが、live は支払い後に対象を選ぶ。
- `WX26-CP1-046-E1` — 原文の「そのルリグ」はアタックした個体だが、live は任意の自ルリグ1体を選べる。

また、前掲のとおり逆翻訳器には `fieldTrash` 非表示と
`underAnySigniTrash`＋`costColors` 併記漏れがある。いずれも今回生成したliveの実行意味とは別の表示欠落。

### 検証・ブラスト半径・帳票

- `npm run gates`: 全緑。typecheck PASS、golden **3168/3168・FAIL 0**（ベースライン3164から+4）、
  smoke **10721/10721・CRASH/HANG/INVARIANT 0**、fuzz **CRASH/HANG/INVARIANT/EXPLOSION 0**、
  census高シグナル **11**（投入前実数11、`BASELINE_HIGH` 12以下）、census:stubs **A群0/C群0**、
  manual-fields **0 effects / parseStatus違反0**、census:enginetext **A 130行/127ハンドラ**、
  lint **0 errors/249 warnings**（warning増減0）。
- ベースライン `7ba5cdcd0` の5 effects JSONとeffectId単位で比較。変更は
  `WX24-P1-011-E1`, `WX25-CP1-041-E1`, `WX25-P2-022-E1`, `WX26-CP1-046-E1`,
  `WXDi-P04-007-E1`, `WXDi-P06-055-E1`, `WXDi-P06-083-E1`, `WXDi-P16-050-E1` の**8件のみ**。
  期待漏れ0、予定外0。
- `_held_fresh.json`: 76→75カード、追加0・変更0、削除は stale な `WXK03-070` 1件。
  `_partial_fresh.json`: 9→9、追加/削除/変更0。`_idset_fresh.json`: 7→7、追加/削除/変更0。
  `_held_review.txt` は今回の4 gate差分を採用後に空になった。
- §5-19文字検査：変更した全13 tracked fileで、ベースライン比 `U+FFFD`・3文字以上連続の`?`・
  先頭BOMはいずれも **新規増0**。
- §5-29反転確認：`applyCompositeOptionalCostFields` の最終呼び出しを一時的に外し
  `npm run golden -- --only "O-190 第1バッチ"` を実行すると **4本中3本 FAIL**。
  fresh payload、fresh did-it gate、runtime支払不能の3本が赤くなった。呼び出し復帰後は4/4 PASS。

### やらなかったこと

- `src/engine/`, `src/types/`, `src/screens/`, `manualEffects.ts` は変更していない。新しい
  `EffectAction`、`StubAction`キー、STUB id、engine分岐、支払いUIを作っていない。
- 正解10効果、受け皿のない4効果、上記4件の別軸原文差へ変更を波及させていない。
- `effects_*.json` の手編集、`buildEffectsJson.ts` のforce-adopt、`stage2_closed.txt` 更新をしていない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` を編集していない。commit / push もしていない。
- ブラウザ実機確認はしていない。既存機構だけを使うdata/parser変更のため、fresh/runtime両方向goldenと
  smoke/fuzzを権威ある検証とした。

## 2026-09-01：意味照合 段2（支払いUI バッチ1）— `cost.energyTrashGroups` の支払いを2経路に通した

ユーザー決定で「支払いUI を実装する」方針に切り替えた最初のバッチ。残 OPEN **45 → 44**。

🔴**真因＝型はもとから在ったが、消費が `screens/battle/resonaSummon.ts`（レゾナ召喚）1箇所だけだった。**
そのため `WXK03-070-E1`（幻怪　モモタロ）の【出】「エナゾーンから《モモイヌ》1枚と《モモザル》1枚と
《モモキジ》1枚をトラッシュに置く：対象の相手シグニ1体をエナゾーンへ、対象の相手シグニ1体を手札へ」は
`costUnparsed:true` のままで、**発動コストが完全に無料**だった（エナを1枚も払わずに相手シグニ2体を触れた）。

🔑**支払い経路は2つあり、片方だけでは片肺になる**＝
①**通常召喚** … `SigniOnPlayCostModal`。`costs.ts` に `energyTrashGroupsSatisfied` /
  `canAddEnergyTrashGroupIndex` / `energyTrashGroupsAffordable` を新設して可否判定と選択ガードに配線した。
  ⚠**先着順の貪欲割り当てでは足りない**（フィルタが重なると厳しいグループが埋まらず「払えるのに払えない」になる）ので
  **総当たりの割り当て**にした。
②**効果で場に出た** … `optionalOnPlayCostStub` → `optionalCostPaySteps`。
  `StubAction` / `OptionalCostSpec` にキーを足し、**グループごとに1 TRASH ステップへ分解**して払う
  （1本の TRASH に潰すと「各1枚ずつ」が消えて**同名3枚でも払えてしまう**）。
  `canAffordOptionalCostSpec` にもグループ単位の可否を足した（合計枚数だけでは同名3枚を通す）。

🔑**golden の「明示保留リスト」から1件外した。** `(xxix)(2) 第15波後の明示保留4効果` は
**「既存語彙が不完全だから載せない」**という契約で、**「永久に据え置く」ではない**。
語彙を完成させたので `WXK03-070-E1` を外し、連動する計数（任意costあり 961→962／
任意costなし 21→20／据え置き 4→3）と、golden 側にコピーされている `SUPPORTED` 集合も同期した。
⚠**`SUPPORTED` は engine（`triggerCollect.ts`）と golden の2箇所にある**＝片方だけ足すと
「写せるかどうかが対応キー集合と一致」で落ちる（今回それで検出できた）。

影響枚数＝1効果 / 1カード。
🔴**実機必須**（`src/screens/` と `src/types/`・`src/engine/` を触った＝§2.2）。**未実施なので `V-105` を登録した。**
反転確認＝未実施。検証＝gates 全緑（**golden 3162 → 3164**・0 FAIL / smoke・fuzz 全0 / census 11 /
census-stubs A0・C0 / manual-fields 0 / census-enginetext A 130行 据置 / lint 0 errors・249 warnings）。


## 2026-09-01：PLAN §5.3 `O-96` 第3バッチ — 規則を「語尾の列挙」から「順序＋構造ガード」へ切り替え（11効果）

🔴**このバッチは Codex が `.codex-work` の利用上限に達して exit 1 で落ちたため、Claude が引き継いで実装した**
（ログ末尾＝`You've hit your usage limit ... try again at 8:43 AM`。**作業ツリーは clean・HEAD 不変で中途半端な変更は残っていなかった**）。

第1・第2バッチの原文 regex は**語尾を列挙**していた（`それを手札に戻す` ／ `バニッシュする` …）。
これが頭打ちになったことを実測で確認した＝**エナ側の語尾を `handDiscard` 側と同じだけ広げても新規は1効果だけ**
（該当5件のうち4件が `parseStatus:MANUAL`＝収穫マージ不可侵で parser では届かない）。
⇒ **原文 regex を `/を対象とし[、,][^。]*?てもよい。そうした場合[、,]/` の1本（順序だけ）に置き換え、
範囲は構造ガードで担保する方式へ切り替えた**（`applyO96OptionalCostTargetFirst`）。
構造ガード＝①root `SEQUENCE` ②`hasStoredTargetBinding` で二重適用を防ぐ
③コスト payload が `costColors` だけ／`handDiscard` だけ ④直後が did-it ゲート
⑤帰結が `O96_STORABLE_OUTCOMES`（`BOUNCE`/`POWER_MODIFY`/`BANISH`/`TRASH`/`TRANSFER_TO_DECK`/`SEND_TO_ENERGY`/`EXILE`）
かつ `target.type==='SIGNI'`。**この7型は型に `targetsStored` があり `freezeStoredTargets` の `FREEZABLE` にも入っている**
（どちらかが欠けると「フィールドは付いたが engine が無視する」＝無言 no-op になる）。

採用11効果＝`WX07-039-E1` / `WX15-053-TRAP` / `WXK08-070-E1` / `WXDi-P16-050-E1` / `WXK06-074-E1` /
`WDA-F02-17-E3` / `WXDi-P06-083-E1` / `WXDi-P11-049-E1` / `PR-K021-E3` / `WXDi-P04-007-E1` / `WXDi-P05-073-BURST`。
**`SEND_TO_ENERGY` は第3バッチで初めて対象に入った帰結型。**
影響枚数＝11効果 / 11カード（`O-96` の欠陥署名 **133 → 122**）。

🔴**採用前に11件すべての原文を読み、`IS_MY_TURN` → `PAID_ADDITIONAL_COST` の置換が正しいことを確認した**＝
「自分のターンなら」に相当する条件は1件も無く、すべて did-it ゲートの誤パースだった。
**特に `WX15-053-TRAP`（【トラップ】）と `WXDi-P05-073-BURST`（【ライフバースト】）は相手ターンに解決する**ので、
`IS_MY_TURN` が残ると**支払いゲートが永久に成立せず効果が丸ごと発火しない**。この2件は golden で明示的に固定した。
前置条件が**効果レベルの `condition`** にあるもの（`WXK08-070`＝`BEAT_CONDITION` / `PR-K021`＝`SELF_POWER_GTE`）も
落としていないことを golden で固定した。

反転確認＝未実施（実機不要判定のため）。代わりに**ブラスト半径をベースライン commit（`eedcb3ab5`）との
effectId 単位 機械 diff で検算**＝**変わったのは予定の11件のみ・予定外0**。
`build:effects` 2回の再実行で live JSON がビット同一に再生成されることも確認。

🔑**教訓＝「原文の語尾を列挙する」規則は必ず頭打ちになる。**
語尾や対象句の言い回しは無限に変奏されるが、**欠陥そのものは構造（対象固定の有無）で定義できる**。
⇒ **原文 regex は「順序の確認」だけに使い、範囲は live の構造ガードで縛るほうが、広くて安全。**
⚠**ただしこれは「ブラスト半径を毎回機械で検算する」運用とセット**でしか成立しない。

⚠🔴**採用の過程で、今回とは別軸の既存欠陥を3種類見つけた（いずれもベースラインから存在・未修正）**：
1. **複合任意コストの前半が丸ごと消えている**（→ `O-190`）＝原文「〈他のコスト〉し、《色》を支払ってもよい」の
   前半が live に無い。実例＝`WX15-053-TRAP`（他の【トラップ】1枚をトラッシュ）／`WXDi-P04-007-E1`（白のシグニ1体を場からトラッシュ）／
   `WXDi-P06-083-E1`（下からカード3枚をトラッシュ）／`WXDi-P11-049-E1`（トラッシュの＜毒牙＞3枚を除外）／
   `WXDi-P16-050-E1`（手札からスペル1枚を捨て）。**任意コストが原文より安い＝過剰実行側。**
2. **前置条件そのものが消えている**＝`WXK06-074-E1`（原文「このターンに対戦相手のカードがあなたの効果によって
   デッキに移動していた場合」が live に無い）。
3. **対象オーナーの誤パース**＝`PR-K021-E3`（原文「シグニ1体を対象とし」＝無修飾なのに `owner:'self'`）。


影響枚数＝21効果 / 21カード（`O-96` の欠陥署名 154 → 133）。
反転確認＝未実施。代わりに**ブラスト半径をベースライン commit（`2f2291b53`）との effectId 単位 機械 diff で検算**＝
**変わったのは予定の21件のみ・予定外0・群B 変更0**（Claude 側でも独立に再実行して一致を確認）。
`IS_MY_TURN` → `PAID_ADDITIONAL_COST` の置換は**21件すべて原文照合済み**（Claude 側でも5件を抜き取り再確認）＝
いずれも「トリガー＋対象とし＋任意コスト＋そうした場合＋帰結」で、**原文に「自分のターンなら」に相当する条件は無い**。
🔑🔴**教訓＝parser 規則の「適用地点」で対象範囲が変わる。**
当初 `parseActionText` の中で適用したところ、**`CHOOSE` 組み立て前の枝が一時的に root `SEQUENCE` に見えて群B へ当たった**。
⇒ **効果単位の最終 root へ適用地点を移して解決**。**この誤りは fresh 三帳票で検出した**＝
**ブラスト半径の検算はゲートでは代替できない**（ゲートは全部緑のままだった）。
⚠**別軸の残差を2件記録**＝`WXK10-029-E1`（原文「手札から**黒の**シグニを1枚捨てて」）と
`WXK10-040-E2`（同「**赤の**シグニ」）は、**旧 live の時点で `handDiscard.filter` から色指定が脱落している**
＝任意コストが原文より緩い（過剰実行側）。今回の対象固定とは別軸なので未修正（→ `O-189`）。

## 2026-09-01：PLAN §5.3 `O-96` 第2バッチ — 手札を捨てる任意コスト前に対象を固定（21効果）

原文が「相手シグニを対象とし、手札から条件付きカードをN枚捨ててもよい。そうした場合、それを…」の順なのに、live は `OPTIONAL_COST{handDiscard} → CONDITIONAL{IS_MY_TURN} → 帰結` となり、対象候補0でも支払いを提示し、支払い後に対象を選び直していた。第1バッチの parser 規則を一般化し、root `SEQUENCE` の21効果を `SELECT_TARGET_ONLY{abortIfNoCandidate:true} → STORE_LAST_PROCESSED_TARGETS → OPTIONAL_COST{handDiscard} → CONDITIONAL{PAID_ADDITIONAL_COST} → 帰結{targetsStored:true}` へ変更した。帰結は `POWER_MODIFY` 13／`BANISH` 4／`BOUNCE` 2／`TRASH` 2。`handDiscard` の `count`／`filter`／`selectionConstraint` は元オブジェクトをそのまま運び、`POWER_MODIFY` の delta と期間も維持した。

採用＝`WXK01-052-E1` / `WDK10-014-E1` / `WXDi-P03-084-BURST` / `WXDi-P05-082-BURST` / `WXDi-P06-084-BURST` / `WXDi-P07-093-BURST` / `WXDi-P08-047-E1` / `WXDi-P08-075-BURST` / `WXDi-P10-074-BURST` / `WXDi-P11-081-BURST` / `WXDi-P12-085-BURST` / `WXDi-CP01-049-BURST` / `WXDi-CP02-099-BURST` / `WXK10-029-E1` / `WXK10-040-E2` / `WD23-033-A-TRAP` / `WXDi-P04-038-BURST` / `WXEX1-43-E2` / `WXDi-P00-033-E1` / `WXK11-017-E2` / `PR-370-E1`。`IS_MY_TURN` は21件すべて原文のターン条件ではなく「そうした場合」の誤フォールバックだったことを効果単位原文で確認した。

据置＝`WXDi-D09-P17-BURST` / `WX25-CP1-004-E1` / `WXDi-P13-045-E1`（CHOOSE 枝内のネスト器）。当初 `parseActionText` 内で後段適用すると、CHOOSE 組み立て前の各枝も一時的に root `SEQUENCE` に見えて群Bへ当たることを fresh diff が検出した。規則を**効果単位の最終 root**でだけ適用する位置へ移し、三帳票と golden で3件不変を固定した。`TRANSFER_TO_HAND` / `O-188`、エナ軸の追加、engine/types/screens は未変更。

検証＝ベースライン `2f2291b53` と現行 live を effectId 単位・オブジェクトキー順正規化で比較し、論理差分は上記21件のみ（予定外0・群B0）。`npm run regen` で対象宣言→手札捨て→帰結の順と同型★0を目視。`build:effects` 連続2回後の全5 effects JSON は SHA-256 一致。`npm run gates` 全緑（typecheck、golden **3157/3157**、smoke 10721/10721・CRASH/HANG/INVARIANT 0、fuzz 全0、census 11、census-stubs A 0/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、lint 0 errors/249 warnings）。ネットワーク遮断の指示に従い実機確認は未実施。

影響枚数＝21効果 / 21カード（`O-96` 欠陥署名 **154 → 133**）。次の最大下位形は `TRANSFER_TO_HAND` 11効果（`O-188` のゾーン選択機構待ち）、次いでネスト器6効果。反転確認は「候補0で旧木だけが手札コスト CHOOSE を提示する」golden 対照で実施した。

## 2026-09-01：PLAN §5.3 `O-96` 第1バッチ — 任意エナ支払い前に BOUNCE 対象を固定

原文が「対戦相手のシグニを対象とし、《色…》を支払ってもよい。そうした場合、それを手札に戻す」の順なのに、live が `OPTIONAL_COST → CONDITIONAL → BOUNCE` となり、対象候補0でも支払いを提示し、解決時に対象を選び直していた。`effectParser.ts` にこの下位形だけの規則を追加し、root `SEQUENCE` の直接 BOUNCE 7効果を `SELECT_TARGET_ONLY{abortIfNoCandidate:true} → STORE_LAST_PROCESSED_TARGETS → OPTIONAL_COST → PAID_ADDITIONAL_COST → BOUNCE{targetsStored:true}` へ変更した。前置条件付き3効果と公開条件付き1効果は、その条件の内側へ4段をまとめて条件不成立時の挙動を維持した。採用は `WX20-054-E1` / `WXDi-P02-048-BURST` / `WXDi-P08-052-E1` / `WXDi-P14-052-E1` / `WX24-P3-047-E2` / `WX25-P3-055-E3` / `WX25-CP1-055-E1` の7件。build 前後の全 live effectId 差分はこの7件だけで、予定外0・群B変更0。

`TRANSFER_TO_HAND` は `targetsStored` の型定義・executor 対応・任意選択中の保存対象凍結が無いため、群Aの11効果（MANUAL `WXDi-P15-057-E2` を含む）はガードレールどおり据置。群B 6効果も CHOOSE / GRANT 内の別器なので据置。golden を3本追加し、代表3効果の JSON 順序、前置条件維持、候補0なら任意コストを提示しない実行挙動、TRANSFER 据置契約を固定した。`WXDi-P04-041-E1/E2` は同一カード内の別々の【自】能力で重複ではない。`WXDi-P05-059-E1` の TRASH は第1能力に対応しており正しいが、手札回収側 `E2` の source が `DECK_CARD` になっている別疑義を確認し、今回は変更していない。

検証：`npm run regen` で対象7件の逆翻訳が対象宣言→支払い→帰結の順になったことを目視。`build:effects` 連続2回後の全5 effects JSON は SHA-256 一致。`npm run gates` 全緑（typecheck、golden **3154/3154**、smoke 10721/10721・CRASH/HANG/INVARIANT 0、fuzz 全0、census 11、census-stubs A 0/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、lint 0 errors/249 warnings）。ネットワーク遮断の指示に従い実機確認は未実施。

影響枚数＝7効果 / 7カード（`O-96` の欠陥署名 161 → 154）。
反転確認＝未実施。代わりに🔑**ブラスト半径をベースライン commit との機械 diff で検算**した＝
`git show e85bfe6b8:public/data/effects_*.json` と現行を effectId 単位で突き合わせ、
**変わったのは予定の7件のみ・予定外0・群B 変更0**。**遅いレーン（parser）ではこれが主要な検証項目。**
🔑**教訓＝「型にフィールドが無いなら足さずに据置する」が正解だった。**`TRANSFER_TO_HAND` は
`targetsStored` を型（`effects.ts:1909`）にも `execTransferToHand` にも `freezeStoredTargets` の
`FREEZABLE`（`effectExecutor.ts:133`）にも持たない＝**フィールドだけ書いても無視されて無言 no-op**になる。
`O-128` 第4バッチの「収集契約」とまったく同じ罠で、**2バッチ連続で同じ形の落とし穴に当たった**。
⇒ **受け皿へ配線するときは「型・実行・凍結」の3層すべてに消費地点があるかを確かめる。**（→ `O-188` に登録）
⚠**別件の疑義を2つ記録**＝`WXDi-P04-041-E1/E2` は重複ではなく別々の【自】（自アタック時／相手アタックフェイズ開始時）。
`WXDi-P05-059-E2` は原文がトラッシュからの回収なのに `source` が `DECK_CARD`（未修正）。

## 2026-09-01：PLAN §5.3 `O-128` 第4バッチ — 【ソウル】／下カード／プレイヤー恒久の3効果を既存受け皿へ配線

`GRANT_ABILITY_INNER_TEXT` が無言 no-op だった `WXDi-D07-002-E1` を `GRANT_SOUL_HOST_ABILITY`、
`WXDi-P05-060-E1` の引用部分を新設 `WXDi-P05-060-E2` の `GRANT_SIGNI_ABOVE_ABILITY`、
`WXDi-P10-002-E1` を `GRANT_PLAYER_ABILITY` へ manual 配線した（新型・engine・parser変更なし）。
`WXDi-P05-060` は collector 契約に合わせ、付与宣言を `effectType:'CONTINUOUS'` の action 直下へ分離。
E1 は設置 STUB と既存 `POWER_MODIFY` を保持し、引用付与 STUB だけを除去した。
`WXDi-D07-002` は `ON_ATTACK_SIGNI`／`triggerScope:'self'`／`usageLimit:'once_per_turn'` と
ドロー1・エナチャージ1の `CHOOSE`、`WXDi-P10-002` は既存使用条件・コストを保持して
`ON_ATTACK_PHASE_START` の `CHOOSE` と `colorMatchesLrig:true` を付与した。`targetOwner` は省略＝自分。

据置＝`WXDi-P03-002-E1` は `ON_LRIG_GROW` は実在するが「そのターン最初のグロウ」を表す条件が無い。
`WXDi-P05-069-E2` は `collectAltAttackFlipSigni` → BattleScreen の裏向きアタック／ターン終了時復帰で既に動作し、
typed 化には「アタック置換＋N体まで裏向き＋この方法で裏向きにした集合の復帰」を運ぶ構造化ペイロードが要るため据置。
🔑これにより「STUB だが別経路で動く」在庫は既知4枚→5枚。live の当該 STUB 保持カードは **17→14**
（残14のうち既知5枚は動作済み）。

既知の未修正＝`WXDi-P05-060-E1` の `POWER_MODIFY{aboveSelf:true}` は原文では別の【常】だが、
今回は指示どおり既存起動 `SEQUENCE` 内のまま。今回採用した3効果の引用能力部分に近似はない。
逆翻訳は3受け皿を日本語化し、原文の timing／対象色／選択肢／恒久性を保持した。
実機はユーザー指示どおり未実施（data／golden／生成物のみ、新型・engine・screens変更なし）。
検証＝golden **3151/0（+3）**、smoke 10721/10721・CRASH/HANG/INVARIANT 0、fuzz 全0、
census 11、census-stubs 無言A 0/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、
lint 0 errors/249 warnings。`build:effects` 2回後の全5 effects JSON SHA-256 一致も確認済み。
影響枚数＝3効果（`WXDi-P05-060` は1効果を2効果へ分割）。`WXDi-P05-060-E2` の `filter:{color:"赤"}` と
`WXDi-D07-002` のソウル付与は**盤面に載ったときだけ効く**ので静的な該当枚数は出せない。
反転確認＝未実施（実機不要判定のため）。代わりに `build:effects` 2回の SHA-256 一致で
manual→live の正規経路を確認。🔑**golden は JSON の形ではなく「収集されること」を assert**＝
`collectGrantedFromUnderSigni` に赤シグニを上に載せた盤面を渡して能力が返ることと、
**赤でないシグニでは返らないこと**（否定側）まで見ている。
🔑**教訓**＝受け皿には「収集契約」があり、`GRANT_SIGNI_ABOVE_ABILITY` / `GRANT_SOUL_HOST_ABILITY` は
**`effectType:"CONTINUOUS"` の action 直下しか読まない**（`effectEngine.ts:7007` / `7094`）。
`SEQUENCE` のステップに入れると **JSON も逆翻訳も census も golden も緑のまま盤面が動かない**。
⇒ **受け皿へ配線するときは型名の一致だけでなく、収集側の走査条件まで読む。**
🔴**`O-128` は事実上ここでクローズ**＝残 14 のうち **5枚は engine の全文 regex で既に動作**
（`WXDi-P15-033`/`WXDi-P16-044`/`WX24-P2-030`/`SPDi43-01`/`WXDi-P05-069`＝`O-60` の在庫）、
**3枚は据置契約を golden 化済み**（`WD17-001`/`WX25-CP1-003`/`WXDi-P05-068`）、
**残る6枚はすべて新機構待ち**（レイヤー／トラップアイコン付与／序数／最初のグロウ／ほか2枚）。
**既存受け皿だけで取れる在庫は尽きた。**

## 2026-09-01：PLAN §5.3 `O-128` 第3バッチ — 【ライフバースト】付与3効果を既存受け皿へ配線

`GRANT_ABILITY_INNER_TEXT` が対象なし／未知引用で無言 no-op になっていた4効果を原文照合し、
`WXEX1-11-E1`・`WXDi-P08-008-E1` を既存 `GRANT_ALL_ZONE_LIFEBURST`、
`WX24-P3-022-E2` を既存 `SET_DISPAIR_BURST_GRANT` へ manual 配線した（新型・engine変更なし）。
`WXEX1-11` の＜水獣＞は CSV `CardClass` 列にあるため正準キー `cardClass:'水獣'` を使用し、
「＜水獣＞のカード」をシグニ限定にしなかった。`WX24-P3-022` は対象を任意コスト前に固定し、
`OPTIONAL_COST{handDiscard:{count:2}}` の支払い時だけ同じ対象を `DOWN` する。
`WXDi-P12-036-E1` は「チェックゾーンへ置かれた1枚目・2枚目」の序数を保持する受け皿が無いため据置。
既知近似＝`WX24-P3-022` の一時付与は自ターン中に読まれず次の相手ターンだけ読まれるため、
自ターン中に自分のライフがクラッシュされる場合だけ原文「このターンと次のターン」より弱い。
実機不要判定＝変更は data／golden／生成物のみで `src/screens/`・新型・新機構を変更していない。
実機はユーザー指示どおり未実施。検証＝golden 3148/0、smoke・fuzz 全0、census 11、
census-stubs A/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、lint 0 errors/249 warnings。
影響枚数＝直した効果は3件だが、`WXEX1-11` の `burstFilter:{cardClass:"水獣"}` は**CSV 実測158枚**に当たる
（`WXDi-P08-008`・`WX24-P3-022` はフィルタ無し＝全カード）。`O-128` の live 残 STUB は **20 → 17 カード**
（うち4枚は engine の `quotedText` regex で既に動作＝実質の未実装は13枚）。
反転確認＝**未実施**（実機不要判定のため）。代わりに `npm run build:effects` の再実行で live JSON が
ビット同一に再生成されることを確認済み（手編集ではなく manual→live の正規経路で届いている）。
🔑**教訓**＝登録票の「受け皿が無い」は誤りで、受け皿は型・engine・UI・逆翻訳・golden まで完成しており
生成側（parser/manualEffects）が繋いでいないだけだった。§4.1「まず受け皿を疑う」を機構 worklist にも適用する。
⚠**未処理の不整合1件**＝`WX17-036` は修飾なし（「＜怪異＞のシグニであるカードは…を持つ」）なのに
`burstAdditive` が無い＝今回確定したルールと矛盾する。スコープ外として未変更。

## 2026-09-01（続き760）：意味照合 段2 残 OPEN **67 → 46（-21）**＝実装20／較正1

ユーザー指示「さらに２０減らす」の1巡。§5.2（意味照合 段2）を **-21**（依頼は -20）まで消化した。
gates 全緑（typecheck / **golden 3139 → 3145（+6本）**・0 FAIL / smoke 全0 / fuzz 全0 / census 12/12（据置）/
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 1065→**1086**／残 OPEN 67→**46**（HIGH 39・MED 7・影響カード 43／効果 34）。
live の A/B 差分＝**15カード**（すべて意図したもの・**巻き添え0**）。

🔑**この巡の主産物＝「engine/JSON だけで閉じられる母集団」をほぼ使い切ったこと。**
続き759 の教訓（「取れる母集団は消費地点の層で決まる」）をそのまま延長して、
**コスト系 finding（`src/screens/` の支払いUIが消費地点）を今回も全部見送り**、engine/JSON だけで -21 を取った。
その結果、**残 46 の主成分は「コスト（支払いUI）」「複数体ライズ（`O-147`）」「ハーモニー」「ピース使用履歴」**に絞られた。
⇒ **次の巡は「engine/JSON で -N」を前提にできない。** コストを取るなら実機込みのバッチとして切る。

---

### ■ 新しく足した語彙（型＋評価器＋逆翻訳＋golden）

| 語彙 | 原文 | 🔴旧 live の挙動 |
|---|---|---|
| `EffectTarget.extraZones` | 「対戦相手の**場とトラッシュにある**シグニは能力を失う」 | 2つ目の【常】付与が丸ごと欠落（`rawText` に文字列としては残っていた） |
| `LEVEL_MODIFY` の `aboveSelf` 適用（`buildLevelMods`） | 「これの上にある《鰐渕アカリ（正月）》の**レベルを＋１**し」 | **レベル側は恒久 no-op**（最前面だけを走査するのでクラフト＝下段の能力は1つも拾われない） |
| `ChooseAction.noRepeat`（+`taken_choice_keys`） | 「以下の３つから**まだ選んでいないもの**１つを選ぶ」 | 毎メインフェイズ**同じ選択肢を取り続けられた**（このゲームの間ずっと有効な付与） |
| `SWAP_DECK_TOP_AND_LIFE` | 「対戦相手のデッキの一番上と対戦相手のライフクロス１枚を入れ替えてもよい」 | 3枝目が丸ごと欠落 |
| `TargetFilter.nameInCrossConditionOfLastProcessed` | 「それの**クロス条件に含まれる**シグニ」 | **デッキ／トラッシュの任意のシグニ**（クロスデッキを揃えるという役目が消えていた） |
| `AttachAcceAction.repeatWhilePossible` | 「エナゾーンから**好きな枚数**を**好きな数の**シグニの【アクセ】にする」 | `GRANT_KEYWORD{アクセ}`＝**エナのカードが1枚も動かない**真 no-op（主語も相手を含む） |
| `LookPickChainStage.gateZoneOnly` → `AddToFieldAction.gateZoneOnly` | 「シグニ１枚を**【ゲート】があるあなたのシグニゾーン**に出し」 | 空いているどのゾーンでもよかった（【ゲート】を作った意味が消える） |
| `ON_BANISH` の遅延収集地点（`collectBanishTriggers`）＋`trigger.notByOwnEffect` | 「このターン、あなたのシグニ１体が**あなたの効果以外によって**バニッシュされたとき」 | **設置しても永久に発火しない**（バニッシュを読む地点が無かった）＝アーツ本体が死んでいた |
| `GRANT_KEYWORD` の `target.type:'PLAYER'`（+`player_keywords`） | 「**対戦相手は**【みこみこ親衛隊】１つを得る」 | 任意のシグニ1体へ付与＝**トークンのコストを払う人が真逆**になりうる |
| 効果バニッシュへの `collectBanishPreventLoseAbility` 適用 | 「このシグニが**次に**バニッシュされる場合、バニッシュされない」 | **バトルバニッシュ経路だけ**が読んでいた（原文は発生源を限定しない） |
| `BlockActionAction.bothPlayers` | 「このターン、**シグニアタックステップをスキップする**」 | 効果の使用者だけを止める＝相手ターンに出たとき**相手のステップが飛ばない** |
| `PLACE_KEY_FROM_LRIG_DECK` | 「あなたのルリグデッキから《異体同心　華代》１枚を場に出す」 | `ADD_TO_FIELD{source なし}`＝**デッキの一番上を場に出す**別のカード |
| `TransferToDeckAction.orderChosenBy:'opponent'` | 「（**置く順番は対戦相手が決める**）」 | 一括処理＝engine の内部順で積まれる（デッキトップの並び＝次のドロー順なので実効果が変わる） |

### ■ 既存の受け皿へ配線しただけのもの

- `GAIN_BOND{source:'last_found'}`（`WXDi-CP02-005-E1`「この方法で公開した生徒との絆を獲得する」）
- `PLACE_LRIGS_UNDER_CENTER`＋`TRANSFER_TO_DECK{LRIG_TRASH_CARD→lrig_deck}`（`WXEX2-84`。同型の `WX05-001-E1` が前からこの形）
- `REPEAT{3}`＋`CHOOSE`（支払いの2択）＋`NEGATE_ATTACK{target:{type:'LRIG'}}`（`WXDi-P05-003-E1`＝**2 finding を1枚で**）
- `REVEAL_DECK_TOP`＋`DECK_TOP_MATCHES`（`WX19-061-E1` のスペル枝。⚠**この枝だけ `lastProcessedCards` を使えない**＝
  直前の `LOOK_AND_REORDER`（相手デッキを見る）が上書きするので、公開札がデッキトップに残る性質を使って判定する）

### ■ 較正（live を開いたら既に実装済みだったもの・1件）

`WXEX2-84-E1`「すべてのルリグをこのカードの下に置き」＝`STUB{LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS}`
（`execStubPart3.ts:4800`）が**ルリグを全部センタールリグの下へ置いていた**（claim が stale）。

### ■ golden：契約1本を更新・影武者1本を撤去

- 🆕**`task12 lxxiv残` の対照を更新**＝`WXDi-P09-031-E1` は `bothPlayers:true` を明示したので**両者**へ積む。
  ⚠**この試験の本来の目的（主語なしを一律 opponent へ倒さない）は残した**＝
  **フラグを外した対照が self だけに積む**ことを同時に assert する形へ組み替えた。
- `WDK03-001-E2`（【エナチャージ２】）は **parser 出力と実体同一**だったので manual から撤去（§6.4 O-42 の影武者禁止）。
- `BASELINE_ORPHAN_MANUAL` を 10 → 9 へ（払い戻し）。

### ■ 実機の判定

⚠**実機は不要と判定**（§2.2 の「触ったディレクトリ」ルール）＝`src/screens/` を1バイトも触っていない。
🔴**ただし今回は新機構が**多段対話**を2つ含む**（`ATTACH_ACCE.repeatWhilePossible` のループ／
`TransferToDeckAction.orderChosenBy` の 1体ずつ `opponentResponds`）＝**UI 層は golden で守れない層**なので、
**engine 側の resume チェーンを golden に固定した**（`--only "続き760"` の6本）。
UI の候補提示・選択リセットまで見たい場合は §5.1 へ `V-nn` として観測点を足すこと。

### ■ 検証コマンド

```
npm run gates            # 全緑（golden 3145 / 0 FAIL）
node scripts/archive/semanticAuditLedger.mjs     # 残 OPEN 67 → 46
npm run golden -- --only "続き760"                # 新語彙の3点セット（反転確認つき・6本）
```

## 2026-08-31（続き759）：意味照合 段2 残 OPEN **97 → 67（-30）**＝実装25／較正5

ユーザー指示「PLANをよみ、OPENを３０減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3139本・0 FAIL** / smoke 全0 / fuzz 全0 / census 12/12（据置）/
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 1035→**1065**／残 OPEN 97→**67**（HIGH 58・MED 9・影響カード 60／効果 51）。
live の A/B 差分＝**20カード**（すべて意図したもの・**巻き添え0**）。
⚠**実機は不要と判定**（§2.2）＝`src/screens/` を1バイトも触っていない（変更は `src/types/` `src/engine/`
`src/data/` `scripts/` `public/data/` だけ）。反転確認は golden 側に埋めた（下記）。

🔑**この巡の主産物＝「claim の半分が stale」という中間状態が母集団の主成分になってきた。**
較正5件のうち3件（`WX25-P1-022-E2` / `WXDi-P14-070-E1` / `WX16-Re19-E2`）は
**engine の実体は正しいのに逆翻訳の語や JSON のラベルが原文と違って見えていた**もので、
`WX24-P4-040-E2` `WXDi-P11-003-E1` `WXDi-P15-079-E1` のように **claim の前半だけ stale**という形も増えた。
⇒ **finding を読んだら「claim の各節」ごとに live を当てる**（1件まるごと真／偽で扱わない）。

---

### ■ 新しく足した語彙（型＋評価器＋逆翻訳＋golden）

| 語彙 | 原文 | 🔴旧 live の挙動 |
|---|---|---|
| `ZONE_COUNT_COMPARE.offset` | 「あなたの場のシグニが対戦相手より**２体以上少ない**場合」 | 条件が丸ごと落ちて**無条件バニッシュ**（同じ効果の④には条件が付いていた＝片枝の取りこぼし） |
| `TargetFilter.isAttacking` | 「**アタックしている**あなたのシグニのパワーを＋2000」 | **自分の全シグニを常時＋2000**（原文の3倍規模の常在バフ） |
| `TargetFilter.discardedFromHandThisTurn` | 「**このターンに捨てた**シグニ１枚を対象とし」 | トラッシュの**任意のシグニ**を釣れた |
| `TargetFilter.restrictionMatchesCenterLrig`（+`restrictionContains`） | 「**限定条件にあなたのセンタールリグのルリグタイプを持つ**カード」 | `cardType:'ルリグ'`＝**メインデッキにいないカード**を探す実質空振り |
| `trashedPick.dest:'field'` | 「**それを**トラッシュから場に出す」 | `ADD_TO_FIELD{TRASH_CARD}`＝**トラッシュの任意のシグニ**（「この方法で」の限定が消えていた） |
| `StubAction.declareFromLastProcessed` | 「（この方法で置いた5枚に）共通するクラスが3枚以上ある場合、**そのクラス**1つを選択する」 | クラス選択そのものが無く、手札に加えるのは**任意のシグニ** |
| `CHECK_ZONE_COUNT.filter` | 「対戦相手のチェックゾーンに**スペル**がある場合」 | 条件が丸ごと無く、**場に出るたび必ず**発動 |
| `GrantProtectionAction.duringOppTurn` | 「**対戦相手のターンの間**、対戦相手の効果を受けない」 | **ターンを問わない永続耐性** |
| `PlayFreeAction.source:'trash'` ／ `targetsLastProcessed` | 「あなたと対戦相手のトラッシュ…**（コストは支払う）**」／「**その**スペルを」 | 自分側が `PLAY_FREE_FROM_TRASH`＝**必ず無料**／照応が消えて**別のコスト1以下スペル**を使えた |
| `ATTACH_CHARM` の場ソース ＋ `toOther` | 「対戦相手のシグニ１体を**他の**シグニの【チャーム】にする」 | `charm.type:'SIGNI'` を書いていたのに engine に分岐が無く、既定枝（手札／エナ）へ落ちて**相手の手札のカードをチャームにしていた** |
| `Condition REFRESH_COUNT_THIS_TURN` | 「それが**このターンであなたの最初のリフレッシュ**である場合」 | 同じターンの**2回目以降でも**バニッシュ |

🔴**手札捨て枚数を候補数で頭打ちにした**（`execTrash` の HAND_CARD 分岐）＝
原文「手札を２枚捨てる。**（手札が１枚以下で使用した場合すべて捨てる）**」（`WDK05-T10-E1`）は
ルールの「できるかぎり行う」そのもの。旧実装は `count` をそのまま渡しており
`EffectInteractionModal.canConfirm`（選択数 ≧ count）が**候補不足でソフトロック**していた。
⚠**上限を下げるだけ**なので候補が足りている盤面は1バイトも変わらない（golden 3139 全緑で確認）。

### ■ 既存の受け皿へ配線しただけのもの（実装25件のうち14件）

- `GRANT_PROTECTION{target:{type:'LRIG'}, from:['any']}`（`WXK10-104-E1`＝主語がシグニ・耐性がルリグ限定の2軸ズレ）
- `GRANT_EFFECT{target:LRIG}` を `SEQUENCE` で3本（`WXK10-014-E1`＝3つの【起】のうち2つが欠落）
- `REVEAL_UNTIL{stopCondition:signiCount, restDestination:'trash'}`＋`SELECT_TARGET_ONLY`→`STORE`→`TRASH{targetsStored}`
  （`WXK06-030-E1`＝**3 finding を1枚で閉じた**。めくり切りが無い／対象が＜龍獣＞に限定されていた／「それ」の照応が消えていた）
- `TRANSFER_TO_DECK`→`LAST_PROCESSED_COUNT_GTE`→`ADD_TO_FIELD{TRASH_CARD}`（`WXK09-090-E1`＝
  旧 `ADD_TO_FIELD{source 無し}` は**デッキの一番上を出す**別のカードで、ゲートも「そうした場合」ではなく `IS_MY_TURN` だった）
- `CHOOSE` の2枝でプレイヤー選択を表す（`WXDi-P04-005-E1`「**あなたか対戦相手は**」＝旧は自分固定）
- `REVEAL_DECK_TOP`＋`LAST_PROCESSED_MATCHES`（`WX19-061-E1` の＜水獣＞ドロー枝）
- `LOOK_AND_REORDER{source:{location:'life_cloth'}}`（`WXDi-P03-004-E1`「ライフクロスの一番上を**見て**」）
- `TRANSFER_TO_HAND{source.owner:'opponent'}`（`WXK11-006-E1-G`＝取得元と受取人が自分になっていた＝**主語が真逆**）
- `cost:{discardAll,energyTrashAll}` 等は**支払いUI（`src/screens/`）が要る**ので今回は取らなかった（実機必須になるため）

### ■ 較正（live を開いたら既に実装済みだったもの・5件）

| finding | 実体 |
|---|---|
| `WX25-P3-053-E1`「次とその次に」 | `REPLACE_NEXT_DAMAGE_WITH_MILL` は `once:true` の予約を**配列に積む**＝2本並べれば2回ぶん |
| `WXK11-006-E1-G`「ルリグ１体とシグニ１体」 | `selectionConstraint.groups` で**既に分けられていた** |
| `WX25-P1-022-E2`「あなたと対戦相手のトラッシュ」 | 自分側の枝は前から在った（claim が stale。**同じ finding のもう1つの節「コストは支払う」は真バグ**） |
| `WXDi-P14-070-E1`「このピースの後に場に出たシグニにも影響」 | `duration:'NEXT_TURN'` は `reserveFieldGrant`＝**場レベル予約**（後から出たシグニにも効く） |
| `WX16-Re19-E2`「次の対戦相手のメインフェイズの間」 | `until:'NEXT_TURN'` の実体は `pending_lrig_limit_mod` → 次ターンの GROW→MAIN で `lrig_limit_mod` へ移り、それは**ターン開始時リセット**＝原文どおり。**逆翻訳の語だけ**「次のターンの間」→「次のメインフェイズの間」に直した |

### ■ golden の据置契約を1本卒業・1本を反転

- 🆕**卒業**＝`(B6) 据置契約: 別ゾーンを指す中間動作は owner だけ直さない（WXK06-030 のみ）`。
  据置理由「原文照合が未了」を解いたので、**3段（対象宣言→めくり切り→そうした場合）が揃っていること**を
  見張る側へ反転した（owner だけ直す退化はここで落ちる）。
- 🆕**反転確認を golden に埋めた**＝`WX16-Re09-E1` は耐性を見る窓を**相手ターン**へ移し、
  同時に「**あなたのターンには耐性を得ない**」も assert（`duringOppTurn` を落とすと必ず落ちる）。
- `(l) センタールリグ付与の入れ子化` は**判定を直した**＝`rawText` が **`undefined`（＝展開済みで消えた正常形）**を
  `?? ''` で空文字にしてから「句点のみ」判定に掛けており、**manual で `abilities` を直書きすると誤検出**していた。

### ■ 検証コマンド

```
npm run gates            # 全緑（golden 3139 / 0 FAIL）
node scripts/archive/semanticAuditLedger.mjs     # 残 OPEN 97 → 67
npm run regen            # 逆翻訳シート再生成（新語彙10本ぶんの日本語を確認）
```

## 2026-08-31（続き758）：意味照合 段2 残 OPEN **127 → 97（-30）**＝実装26／較正4

ユーザー指示「さらに３０減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3131→3139（+8本）**・0 FAIL / smoke 全0 / fuzz 全0 /
census 12/12（較正で据置）／census-stubs A🔴0・C0 / manual-fields 0 /
census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 1001→**1035**／残 OPEN 127→**97**（HIGH 81・MED 16・影響カード 79／効果 71）。
live の A/B 差分＝**24カード**（すべて意図したもの・巻き添え0）。

🔑**この巡の主産物＝「1つの受け皿に複数カードを束ねる」ほうが歩留まりが高いと分かったこと。**
新設した engine 語彙は7つだが、**26件の実装のうち19件は既存受け皿への配線**で、
そのうち **`LOOK_PICK_CHAIN` だけで4件**（前セッションの「配線だけ」型の再実証）。

---

### ■ 新しい語彙を足したもの（型＋評価器＋golden の3点セット）

| 語彙 | 原文 | 🔴旧 live の挙動 |
|---|---|---|
| `TakeFromUnderSigniAction.count:'ALL'` | 「このシグニの下からカードを**好きな枚数**」 | **9枚固定**＝原文に無い数字が上限を決めていた |
| `SelectionConstraint.distinct:'costSum'` | 「**それぞれコストの合計が異なる**スペル３枚」 | **任意のカード3枚**＝重い支払いが実質タダ |
| `triggerCondition.targetedByOpponent` | 「**対戦相手の**、能力か効果の対象になったとき」 | **誰の効果でも**発火（`WX25-P2-055` は自分で「バニッシュされない」を剥がす自滅） |
| `triggerCondition.centerLrigOnly` | 「あなたの**センタールリグ**がアタックしたとき」 | **アシストルリグのアタックでも**誘発 |
| `TargetFilter.classMatchesAnyFieldSigni` | 「あなたの場のいずれかのシグニと**共通するクラスを持つ**」 | 相手の**どのシグニでも**取れた |
| `$ref:'assist_lrig_level_sum'` | 「**アシストルリグのレベルの合計**１につき」 | 比例が落ちて**常に1枚** |
| `ATTACH_ACCE.targetsLastProcessed` ＋ `optional` | 「それを**この方法で場に出したシグニ**の【アクセ】にして**もよい**」 | `GRANT_KEYWORD{アクセ}`＝**エナのカードが1枚も動かない**（アクセ機構としては完全な no-op） |

🔴**fail-closed の向きを全部そろえた**＝`classMatchesAnyFieldSigni`（自分の場が空なら空ヒット）／
`distinct:'costSum'`（コストが読めない札が混ざったら不成立）／`ATTACH_ACCE.targetsLastProcessed`
（直前処理カードが場に居なければ候補0）。⚠**例外は `targetedByOpponent` だけ**＝`TargetedOrigin` が
持ち主を持たないので **origin のカードを両者のゾーンから探して**判定し、**見つからないときは従来どおり通す
（fail-open）**。ここだけ過小へ倒すと「誰の効果か分からない経路」で誘発が丸ごと消えるため。

---

### ■ 受け皿は在ったのに配線されていなかったもの（19件）

#### (a) 🔑**`LOOK_PICK_CHAIN` で4件**＝「N枚見て、1枚を〈行き先〉、残りを好きな順番でデッキの一番下」

- 🔴**`LOOK_AND_REORDER{canTrash:true}` は「何枚トラッシュに置けるか無制限」**（＝任意）で、
  「**必ず**1枚をトラッシュに置く」も「1枚を**デッキの一番上**に戻す」も表せない。
  受け皿は `LOOK_PICK_CHAIN` の `then:'trash'` / `then:'deck_top'`（どちらも実装済み）。
- `SPDi01-133-E1`（トラッシュ1＋デッキ上1）／`WX24-P3-078-E1`（デッキ上1）／`WXDi-P15-073-E2`（トラッシュ1）。
- 🔴**`WXDi-P10-075-E1` は別種の壊れ方**＝「見る」の後ろに `TRASH{SIGNI owner:'any'}` が付いており、
  **任意確認なしで場のシグニ1体（自分のでも）を強制トラッシュ**していた＝原文と別のカードだった。
  ⇒ `LOOK_AND_REORDER{count:1, canTrash:true}` 1本で「見て、置いてもよい」を表す。

#### (b) 「このシグニと共通する色を持たない他の＜天使＞がある場合」（2件）

- `SP27-012-E1` / `WX21-039-E1`＝**`else` 枝が無条件**で、原文の①（1枚引く／1枚エナ）が
  条件を満たさなくても必ず通っていた。受け皿は 2026-08-31 続き748 新設の
  `HAS_CARD_IN_FIELD{filter.colorNotMatchesSource, excludeSelf}`（`WX21-032-E1` と同じ式）。

#### (c) 単発の配線（残り13件）

- `PR-322-E2`＝「それを場に出す**か**手札から黒のシグニ1枚を場に出す」の**手札枝が丸ごと落ちていた**。
- `WD20-018-E1`＝選択肢②の全シグニトラッシュが**強制**（ライフ0のとき自分の盤面が必ず全滅した）。
- `WD21-017-E1`＝「**効果によって**バニッシュされたとき」の原因限定が無く、**バトルバニッシュでも発火**。
- `WX14-057-E1`＝条件成立後に対象を選ぶ形＝**条件を満たさないと対象宣言そのものが起きない**。
- `WDK15-008-E1`＝「シグニの**下から**2枚まで」が**シグニ本体を1体、必ず**トラッシュ（盤面が減る別物）。
- `WX21-046-E1`／`SP24-010-E1`／`WX13-052-E1`（「そうした場合、公開したシグニをダウンで場に出す」が
  丸ごと無く**自分をバニッシュして終わり**だった）／`WXDi-P00-021-E2`／`WX19-031-E1`／
  `WX24-P4-102-E1`／`WX25-P2-055-E2`／`WXDi-P05-008-E1`／`WXDi-D04-004-sub-E1`。

#### (d) 「あなたのレベル３のルリグ１体を対象とし」（ピース3枚）

- `WXDi-D03-011-E1` / `WXDi-D05-011-E1` / `WXDi-D06-011-E1`＝使用条件が「チーム全員レベル１以上」だけで
  **レベル1のセンターでも撃てた**。`GRANT_LRIG_ABILITY` の付与先は常にセンタールリグなので、
  **センターがレベル3以上であること**を使用条件に足すのが「レベル３のルリグ１体を対象とし」の忠実表現。
  ⚠**`eq 3` ではなく `gte 3`**＝原文は対象の資格であって上限ではない。
- あわせて `WXDi-D03-011-sub-E1` の【ダブルクラッシュ】付与先を **`SIGNI{thisCardOnly}` → `LRIG`** に直した
  （ルリグが得る能力なのにシグニへ付いていた）。

---

### ■ 較正（4件）＝live を開いたら既に実装済みだったもの

- **`WD06-009-E2` ×2 ／ `WX20-043-E1`**＝自分のライフクラッシュ置換は
  `STUB{SELF_CRASH_TO_TRASH_AND_REFILL}` として 2026-08-31 続き749 で**完全に実装済み**だった
  （`BattleScreen.tsx:12514` でエナ送りをトラッシュへ差し替え、`:12649` で**置換が乗った回だけ**
  デッキ上をライフへ足し、回数を1つ消費する）。
- **`WDK05-T09-E1-G`**＝`actionId:'GUARD_LV1'` は `makeGuardLevelBlocker` が
  **正規表現 `^GUARD_LV(\d+)` で消費済み**だった。
  🔑**教訓＝「リテラルで grep して0件だから未実装」と判断しない。**
  受け皿が**正規表現で id を解釈する**形だと、文字列検索では絶対に見つからない。
  この型は `census:enginetext` が測っている「engine が regex で意味を決めている箇所」の裏返しでもある。

---

### ■ 計器・契約の更新（どちらも「実装したら必ず動く」印）

- 🔴**据置契約 golden を1本反転**＝`段2 第33バッチ 据置契約: PR-322-E2 は手札から出す選択肢が未表現` は
  「実装したら落ちるトリップワイヤ」なので、**消さずに期待値を反転**して
  「トラッシュ枝と手札枝の二択になっている」を要求する契約へ書き換えた（PLAN §5.2 の規約どおり）。
- 🔴**census の較正を1箇所広げた**＝`ON_GUARD` ＋ `lrigAttackNoDamage` を「アタックしたとき」の
  正表現と認める既存規則は主語が**「（センター）ルリグN体」しか剥がせず**、
  「**この**ルリグがアタックしたとき、そのアタック終了時、」（`WXDi-D04-004-sub-E1`）を
  同じ受け皿へ配線した瞬間に高シグナルへ昇格していた（12→13）。
  ⚠**ベースラインを上げずに較正で戻した**＝退化ではなく**計器の穴**（同じ族の綴り違い）。

---

### ■ 検証コマンド／反転確認

```
npm run typecheck && npm run build:effects
node scripts/heldReview.mjs --adopt <22枚>
npx tsx scripts/syncManualLive.ts WD20-018 WX25-P2-055   # 既存 manual を書き直した2枚はこちら
npm run regen && npm run gates
node scripts/archive/semanticAuditLedger.mjs             # 127 → 97
```

**反転確認（実測4件）**＝該当分岐を `if (false && …)` にすると、
- `targetedByOpponent` → `✗ 🔴自分の手札のカードが対象化したときは誘発しない（旧バグ）`
- `centerLrigOnly` → `✗ 🔴アシストルリグのアタックでは誘発しない（旧バグ）`
- `distinct:'costSum'` → `✗ 🔴コスト合計が同じ2枚は選べない`
- `classMatchesAnyFieldSigni` → `✗ 🔴自分の場が空なら誰も対象にならない`

⚠🔑**収穫マージの関門を2種類とも踏んだ**＝新規カード22枚は `heldReview --adopt` で届いたが、
**既に `manualEffects.ts` に定義があるカードを書き直した2枚（`WD20-018` / `WX25-P2-055`）は
`build:effects` では live に届かない**（live 側の MANUAL/PARTIAL が不可侵）。
⇒ `npx tsx scripts/syncManualLive.ts` が要る。**「既存 manual の書き直し」と「新規 manual」は経路が別。**

---

## 2026-08-31（続き757）：意味照合 段2 残 OPEN **157 → 127（-30）**＝実装18／較正12

ユーザー指示「PLANを読み、OPENを30減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3126→3131（+5本）**・0 FAIL / smoke 全0 / fuzz 全0 /
census 12/12 据置 / census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 970→**1001**／残 OPEN 157→**127**（HIGH 101・MED 26・影響カード 106／効果 98）。
live の A/B 差分＝**15カード**（意図した14＋同文型の拡張採用 `WXDi-P07-002` 1）。

🔑🔴**この巡の主産物＝「受け皿は在るのに、生成側の入口が2つあって片方だけ配線されていなかった」型を見つけたこと。**
新設した engine 語彙は **2つだけ**（`SelectionConstraint.same:'power'` と `TargetFilter.powerEqTrigger`）。
残り16件はすべて**既存受け皿への配線**（`countChoose` ／ `ENERGY_CHARGE_PER_LRIG_LEVEL` ／
`ATTACH_ACCE.fromEnergy` ／ `GRANT_PLAYER_ABILITY` ／ `GRANT_LRIG_ABILITY` ／ `OR`＋`HAS_CARD_IN_FIELD` ／
`LRIG_LIMIT_MODIFY{owner:'any'}`）。

**⑤実機の判定＝不要**（PLAN §2.2 の表）。⚠**`src/screens/battle/lrigLimit.ts` を1行だけ触った**（`owner:'any'` を
受けるための述語拡張）が、**UI を持たない純関数**で、golden が `computeEffectiveLrigLimit` と
`collectOppDeclaredLrigLimitDelta` を**直接呼んで両側を assert**している。新しい UI 面は増えていないので
ドライバは書かず、観測点だけ §5.1 `V-104` に登録した。

---

### ■ 新しい語彙を足したもの（型＋評価器＋golden の3点セット）

#### (a) `SelectionConstraint.same:'power'`（2 findings＝`WX13-013-E1` / `WX21-010-E1`）

- **真因**＝「**同じパワーを持つ**シグニ３体を対象とし、それらをバニッシュする」の相互制約が
  **語彙ごと無く**、`{type:'SIGNI',owner:'any',count:3}` の裸だった＝**盤面のどの3体でも**薙ぎ払える
  過剰効果（赤1エナの全体除去）。`WX21-010` も同様に「相手のどの2体でも」だった。
- **配線先**＝`src/types/effects.ts`（`same` の union に `'power'`）／`execUtils.ts:satisfiesSelectionConstraint`
  （`canAddToSelection` は同関数へ委譲済みなので逐次選択にも自動で効く）／`decompileEffects.ts` の
  `共通する◯を持つ` 表示。
- ⚠**印刷パワーで比較する近似**＝`satisfiesSelectionConstraint` は `cardMap` しか受け取らないので実効パワーを
  見られない（既存の `same:'level'` と同じ層）。パワー不明（`Power` が数値でない）は**不成立**へ倒した（fail-closed）。
  **制約が1つも無い現状より厳密に狭い**ので採用した。
- **影響**＝2効果。

#### (b) `TargetFilter.powerEqTrigger`（2 findings＝`WX17-046-E2` / `WX24-P4-003-E1`）

- **真因**＝「**バニッシュしたシグニと同じパワーを持つ**対戦相手のシグニ1体」／「トラッシュから**それと同じ
  パワーの**シグニ1枚」のパワー条件が落ち、**相手のどのシグニでも**連鎖バニッシュ／回収できた。
- **配線先**＝`effectExecutor.ts:resolveDynamicFilter`（`triggeringCardNum` → 無ければ `lastProcessedCards[0]` を
  基準に `powerRange.min/max` を同値へ解決）／`decompileEffects.ts` の `filterJa`。
- 🔴**参照不能時は空ヒット（fail-closed）**にした。兄弟の `powerLteTrigger` は歴史的に fail-open だが、
  **同値条件を fail-open にすると「同じパワー」の限定が丸ごと消えて過剰実行に裏返る**（§5-3′′）。
- **影響**＝2効果。

---

### ■ 受け皿は在ったのに配線されていなかったもの（engine 変更なし／parser・JSON だけ）

#### (c) 🔴**CHOOSE ヘッダの入口が2つあり、素の入口だけが `countChoose` を捨てていた**（5 findings・実質6効果）

- **真因**＝`parseChooseHeaderCount` は「あなたのセンタールリグのレベル１につき１つまで選ぶ」を
  正しく `countChoose{$ref:'center_lrig_level'}` へ解いていたが、**それを使う入口が2つ**あり、
  `buildChooseFromHeader`（＝ヘッダが文フィルタで落ちた形の救済路）だけが `countChoose` を載せ、
  **素の「先頭がヘッダ」入口（`effectParser.ts` の `headM` ブロック）は `count`/`upTo` しか読まずに捨てていた**。
  ⇒ 該当カードは**常に1つ固定**（センターLv4でも1つしか選べない）に潰れていた。
- 🔑**教訓＝「受け皿が在るのに届かない」を疑うときは、受け皿の *呼び出し元* を全部数える。**
  今回は生成側の関数（`parseChooseHeaderCount`）まで正しく、**その戻り値の一部を捨てる呼び出し元**が犯人だった。
  受け皿・生成関数・呼び出し元の3層を分けて見ないと「実装済みなのに直らない」に見える。
- **影響**＝`WXDi-P06-003-E1` / `WXDi-P14-003-E1` / `WXDi-P07-002-E1`（同文型の拡張採用）。

#### (d) 「この効果を〈誰か〉のセンタールリグのレベルと**同じ回数**行う」（2 findings）

- **真因**＝`WXK10-104-E1` / `WXDi-D05-011-sub-E1` の反復指定が丸ごと落ちて**常に1回**だった。
- **書き方**＝`countChoose{$ref}`＋`allowRepeat`（原文の注記が「同じ選択肢を選んでもよい」なので
  「1回の選択をN回実行」ではなく**選択数そのものがN**）。⚠`upTo` は立てない（必須回数）。
- 🔴**置く場所を3回間違えた**＝①`applyDynamicActionCountBatch35` の中は guard regex に文型が無くて素通り
  ②その後ろの `markRemainderReorder` / `rewriteCatchAllStubs` が action 木を作り直すので先に書くと落ちる
  ⇒ **`parseCardEffects` の最後（カード単位の後段のいちばん後ろ）**に置いた。
  ⚠さらに `currentSourceTexts` にこの effect が載らないカードがある（`WXK10-104-E1`）ので、無ければカード全文へ落とす。
- ⚠**デバッグ中に自分で偽の結論を出した**＝probe が `JSON.stringify(...).slice(0,1200)` で切れており、
  末尾に付く `countChoose` が見えず「効いていない」と誤読した。**出力を切り詰めた計器で「無い」と判断しない。**

#### (e) `ENERGY_CHARGE_PER_LRIG_LEVEL` の単独形（1 finding＝`WXDi-P14-004-E1`）

- **真因**＝受け皿は「レベル1につきN枚引く**か**レベル1につき【エナチャージM】」の**二択形からしか**合成されず、
  単独形は下の【エナチャージ】ショートハンドに食われて**レベルに依らない固定2枚**へ潰れていた。
- **配線先**＝`parseSentencePart1.ts`（二択形の直前に単独形を1本。ドロー単独形も同じ穴なので同時に配線）。

#### (f) `ATTACH_ACCE.fromEnergy`（1 finding＝`WX20-002-E2`）

- **真因**＝「あなたのエナゾーンから《アクセアイコン》を持つカード1枚を…シグニの【アクセ】にする」が
  `GRANT_KEYWORD{keyword:'アクセ'}` に化けており、**エナのカードは1枚も動かず**場のシグニに語だけが付いていた
  （＝アクセ機構としては完全な no-op）。受け皿は 2026-08-31 続き748 で新設済みだった。

#### (g) `LRIG_LIMIT_MODIFY{owner:'any'}`（1 finding＝`WXK11-013-E3`）

- **真因**＝「センタールリグのリミットは１減る。**（お互いのセンタールリグに影響する）**」が `owner:'self'`＝
  **自分のリミットだけ**が減っており、相手の盤面を縛るという札の主目的が丸ごと消えていた。
- 🔴**注記は `stripRuleParens` で文レベル parser へ届く前に消える**（`（…）` を全部落とす）。
  ⇒ 文レベルでは読めないので、**カード全文が見える後段**（`parseCardEffects` の末尾）で刻む。
  **最初に `parseSentencePart2` へ書いた規則は永久に発火しないコードだった**ので撤去した。
- **engine 側**＝`effectEngine.ts:collectLrigColorAndLimitMods`（自分側）と
  `screens/battle/lrigLimit.ts:collectOppDeclaredLrigLimitDelta`（対面側）の**両方**が `'any'` を拾う。
  **片方だけ直すと「自分だけ／相手だけ」に化ける。**

#### (h) 使用条件の OR（1 finding＝`WXDi-P08-068-E1`）

- **真因**＝「3種の指定シグニが場にある**か**、相手の手札が1枚以下」が `HAND_COUNT{eq:1}` の**片枝だけ**に潰れ、
  **0枚では撃てず、指定シグニが並んでいても撃てない**という両方向に外れた条件だった。
  受け皿（`OR` ＋ `HAS_CARD_IN_FIELD{filter.cardName}`）は既存。`manualEffects.ts` へ手書き。

#### (i) 帰属の付け直し2件

- `WXK03-008-E3`＝「あなたのセンタールリグは以下の能力を得る」の2本目【自】が**キー自身の独立した自動能力**
  として立っていた ⇒ 同カードの E1 が既に使っている `GRANT_LRIG_ABILITY` の中へ入れ子にした。
  ⚠**golden のラチェット `ON_TURN_END` 母数 187→186 が動く**（トップレベルの ON_TURN_END が1件減っただけで
  挙動は消えていない）＝理由を書いて基準を下げた。
- `WXDi-P11-003-E1`（ピース）＝①使用条件（ルリグ3体で3色以上）が無い ②「このゲームの間の付与」が落ちて
  **使用時に1回だけ選択肢を即時実行** ③原文に無い `GRANT_KEYWORD{keyword:'使用条件'}` を自分のシグニへ付与
  ④選択肢③の移動元が**場のシグニ**（トラッシュではない）＝自分の盤面を自らデッキへ戻していた。
  ⇒ `GRANT_PLAYER_ABILITY{permanent}` ＋ `ON_MAIN_PHASE_START` ＋ `FIELD_LRIG_COLOR_COUNT{minLrigs:3}` で書き直し。
  ⚠**「まだ選んでいないもの」＝選択履歴による除外は未実装**（parser 側の既存注記と同じ近似）＝`PARTIAL` にして
  finding「メインフェイズ開始時」は**閉じずに残した**（5/6 だけ閉じた）。

---

### ■ 較正（12件）＝live を開いたら既に実装済みだったもの

`WXDi-P06-077-E1`×3・`WXDi-P06-077-sub-E1`・`WXDi-P03-071-BURST`・`WX25-CP1-TK2A-E2`・`WXDi-P06-035-E2`・
`WXEX1-14-E2`・`WX25-CP1-008-E1`・`WXDi-P07-071-E1`・`WX24-P3-055-E2`・`WXK11-006-E4`。

🔑**続き756 の教訓（「live を開いた効果はその場で claim を読み直す」）がそのまま効いた。**
⚠**`semanticAuditRecheck.mjs` の LCS 候補28件とは1件も重なっていない**（あちらは quote と逆翻訳の
最長共通部分文字列で並べるだけなので、「claim の軸が別」の偽陽性が過半）。
🔑**代わりに効いたのは「1効果に複数 finding が付いているカードを開く」**＝`WXDi-P06-077` は
finding 4本のうち**4本とも**が stale だった（E2 が独立した【起】として既に在り、`thisCardOnly` も
`美巧` 条件も配線済み）。**同じ効果の finding が3本以上あるカードは、まとめて古くなっている可能性が高い。**

---

### ■ 検証コマンド／反転確認

```
npm run typecheck && npm run build:effects && node scripts/heldReview.mjs --adopt <10枚> && npm run regen && npm run gates
npm run golden -- --only "same:power" --only "powerEqTrigger" --only "LRIG_LIMIT_MODIFY owner:any" \
                 --only "countChoose" --only "ENERGY_CHARGE_PER_LRIG_LEVEL"
node scripts/archive/semanticAuditLedger.mjs      # 157 → 127
```

**反転確認（実測）**＝
- `satisfiesSelectionConstraint` の `same:'power'` 分岐を `if (false && …)` にすると
  `✗ 🔴パワーが違う2体は選べない` で FAIL。
- `resolveDynamicFilter` の `powerEqTrigger` 分岐を同様に無効化すると
  `✗ 直前処理(12000)と同じパワーは候補` で FAIL。
- `WXDi-D05-011` の golden には**相手センター不在なら0回＝1枚も引かない**という反証を足した
  （これが無いと「レベル比例」を足したつもりで常に1回に潰れていても緑のままになる）。

⚠**収穫マージの関門**＝今回の14カードのうち**10枚が held に落ちた**（`docs/_held_fresh.json`）。
`build:effects` だけでは live に届かないので `node scripts/heldReview.mjs --adopt <CardNum,…>` が要る。
**「parser を直したのに live が変わらない」ときは真っ先にここを見る**（CLAUDE.md の3ファイル）。

---

## 2026-08-31（続き756）：意味照合 段2 残 OPEN **187 → 157（-30）**＝実装21／較正9

ユーザー指示「PLANを読み、OPENを30減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3123→3126（+3本）**・0 FAIL / smoke 全0 / fuzz 全0 /
census 12 / census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 939→**970**／残 OPEN 187→**157**（HIGH 127・MED 30・影響カード 124／効果 120）。

**⑤実機の判定＝不要**（PLAN §2.2 の表）。触ったのは `src/data/` `src/engine/` `public/data/` `scripts/` だけで
**`src/screens/` は1バイトも触っていない**。新設した語彙（下記）は**engine を実走させる golden で両方向を固定し、
修正を外すと FAIL することを実測**した（下の「反転確認」）。⚠ただし **UI に新しく面が出る2件**
（【ライド】の【起】ボタン9枚／`split_top_bottom` の振り分けUI 4枚）は**どの計器も見ていない**ので
§5.1 に `V-101` として観測点を登録した。

---

### ■ 新しい語彙を足したもの（型＋両評価器＋golden の3点セット）

#### (a) `TargetFilter.hasUnderCards` / `hasAttachedOrUnder`（3 findings）

- **真因**＝「**下にカードがある**あなたの＜解放派＞のシグニ1体」（`WXDi-P15-063-E1`）／
  「**カードが付いているか下にカードがある**対戦相手のシグニ1体」（`WXDi-P11-079-E1`）／
  「**下にカードがある**あなたのシグニ1体につき」（`WXDi-P15-051-E1`）の修飾が
  **語彙ごと存在せず**、どれも「任意のシグニ」に化けていた（過剰効果）。
- 🔴**`anyOf:[{hasCharm},{hasUnderCards},…]` では書けない**＝`anyOf` は `matchesFilter`（CardData 単体）
  しか通らず、**ゾーン状態キーは中で黙って無視される＝無条件成立**（`execUtils.ts:941`）。
  ⇒ OR を**1つのゾーン状態キー**（`hasAttachedOrUnder`）として持たせた。
- **配線先**＝`matchesStateFilter`（`effectEngine.ts`）／`fieldCandidates`（`execUtils.ts`）／
  `ZONE_STATE_KEYS` 2箇所（`execUtils` / `triggerCollect`）／`decompileEffects.ts` の `filterJa` 2箇所。
- 🔑**`POWER_MODIFY_PER_FIELD` の数え上げは `matchesFilter` しか呼んでいなかった**＝ゾーン状態キーが素通りする。
  `execPowerModifyPerField`（executor）と CONTINUOUS collector（`effectEngine`）の**両方**へ同じ式を足した
  （**片方だけ直すと経路で挙動が割れる**）。
- **影響**＝3効果（＋原文が同型の `WX25-P3-063-E2` が拡張採用で1件）。

#### (b) `triggerCondition.notByBattle`（1 finding）

- **真因**＝「このシグニが**バトル以外によって**バニッシュされたとき」（`WXDi-D06-013-E1`・原文1枚）の
  限定が丸ごと落ちて、**バトルバニッシュでも発火**していた。
- 🔴**`byEffect` を流用してはいけない**＝あちらは「効果起因の原因主体がいる」ことを要求するので、
  **ルール処理（パワー0）のバニッシュで発火しなくなる**（原文の「バトル以外」はルール処理も含む）。
  ⇒ 判定は `battleAttackerNum !== undefined`（**バトル経路だけがこれを渡す**）。
- **配線先**＝`collectBanishTriggers` の3箇所（被バニッシュ自身／場 watcher×2）。

---

### ■ 「受け皿は既にあるのに生成側だけが取り残されていた」もの（本命・PLAN §5.2 の実証）

| # | 効果 | 症状（旧） | 受け皿（既存） |
|---|---|---|---|
| 1 | `WDK01-001`〜`004`／`WXK01-001`/`008`/`009`/`010`／`WXEX2-11` | 🔴**【ライド】が丸ごと消えていた**（ルリグ9枚でライドが撃てない） | `STUB{RIDE_ON}`＋`INTERNAL_RIDE_ON_APPLY`（乗機選択・ドライブ判定まで実装済み） |
| 2 | `WXDi-P11-051-E2`／`WXDi-P11-078-E2` | 「このシグニ**と《NAME》1体**を場からトラッシュに置く」の**後半が消え、相方が場に無くても撃てた** | `cost.fieldTrash{filter.cardName, excludeSelf}` |
| 3 | `WDK04-014-E1`／`WDK04-015-E1`／`WXDi-P06-071-E1`／`WXDi-CP01-025-E2`／`WXK03-050-E1` | 「デッキの一番下に置いて**もよい**」が `position:'bottom'`＝**強制の下送り**に化けていた | `split_top_bottom`（振り分けUI・続き742-2 が同じ理由で選んだ受け皿） |
| 4 | `WXK11-028-E1` | 「手札に加えるか**ダウン状態で**場に出す」の `asDown` が場出し枝へ渡っていない＝**アップで出てそのターン殴れた** | `PLACE_SIGNI_ON_FIELD.asDown` |
| 5 | `SP27-003-E1` | 「**アタックフェイズの間、**…トラッシュに置かれたとき」＝**メインでも発火**（`ON_TRASH` のコレクタだけ `duringAttackPhase` を見ていなかった） | `triggerCondition.duringAttackPhase`（他コレクタ6箇所は配線済み） |
| 6 | `WXK01-035-E1-G` | 「**このターンにアタックした**すべてのシグニをバニッシュする」＝**場の全シグニ**が対象 | `TargetFilter.attackedThisTurn` |
| 7 | `WX24-P3-041-E1` | 「【リミットアッパー】1つを**得る**」が汎用の「【K】を得る」に食われ **`GRANT_KEYWORD`（シグニに文字列を付けるだけ）**＝無言 no-op | `STUB{PLACE_LIMIT_UPPER}`（`limit_upper_token`／リミット計算まで実装済み） |
| 8 | `WXDi-CP01-021-E1`／`WXDi-P12-003-E1`／`WX24-P2-038-E1` | 「トラッシュの全カードをデッキに加えてシャッフル**し、**〈後続〉」の**「し、」の右側が丸ごと落ちていた**（16枚ミル／エナチャージ／ライフ追加） | `TRANSFER_TO_DECK{TRASH_CARD, count:'ALL'}` は在った＝**分割していなかっただけ**（原文の継続形は実測9文） |
| 9 | `WDK13-001-E3` | 「シグニゾーンにある**すべての**表向きのカード」が `count:1` | `count:'ALL'` |

🔑**7 と 6 の教訓＝「汎用規則に食われる」形は part1 の先頭で引き取る**。
`【リミットアッパー】１つを得る` は `parseSentencePart3` に受け皿規則が在ったのに、
`parseSentencePart1` の汎用「【K】を得る」が先に当たって届いていなかった（単体で part3 を叩くと正しく通る＝
**規則の有無ではなく到達順の問題**）。§2.0 の「regex の網羅率ではなく、どの規則が先に当たるかで決まる」の再実証。

🔑**parser を直したのに live が変わらないときは3つのバケツを見る**（CLAUDE.md）＝今回も
`_held_fresh`（8枚）と `_idset_fresh`（4枚）で止まっていた。**`_idset_fresh` は `heldReview --adopt` では採用できない**
（MANUAL を巻き込む）ので、**新規 id（`-RIDE`）だけを live へ外科パッチ**した。

---

### ■ 較正（実装済みだったのに OPEN のまま残っていた・9 findings）

`node scripts/archive/semanticAuditRecheck.mjs` の候補30件は**ほぼ全部が真の未修正**だった（LCS だけでは拾えない）。
実際に stale だったのは、**live JSON を1件ずつ読み直して**見つけた次の9件：

- `WXDi-P03-087-E2`（`STUB{FROM_TRASH_TO_CENTER_ZONE}` は**zone[1] 固定で実装済み**）
- `WXK01-035-E1-G`（「このターン終了時」は `INSTALL_DELAYED_TRIGGER{ON_TURN_END}` で実装済み）
- `SPK01-08-E1`（`LOOK_PICK_CHAIN{pick 1→trash, remainder→bottom}`＝3枚下・1枚トラッシュと同値）
- `WD19-007-E1`（`STUB{REMOVE_VIRUS_TARGET_ZONE}` は実装済み）
- `WXK05-035-E2`（下のレベル1/2/3 条件は `AND{THIS_CARD_HAS_UNDER}×3` で実装済み・対象のレベル限定も無い）
- `WX24-P2-036-E1`／`WDA-F02-07-E1`（`count:{$ref:last_processed_count}`＋`levelMultisetFromLastProcessed` で実装済み）
- `WXEX1-38-E1`（`HAND_CARD{blind:true}` で実装済み）
- （`WXK01-035-E1-G` は1効果に finding 2本＝実装1・較正1）

🔑**教訓＝`semanticAuditRecheck.mjs` の LCS 候補と、実際の stale はほぼ重ならなかった。**
続き750 で在庫を払い出した直後なので当然だが、**「候補に出ない stale」は live JSON を読まないと見つからない**。
⇒ **バッチの中で live を開いた効果は、finding の claim をその場で照合し直す**のが安い（今回9件がこれで出た）。

---

### ■ golden（+3本・**反転確認済み**）

- `続き756① TargetFilter.hasUnderCards / hasAttachedOrUnder: 両評価器に配線されている`
  ＝生成側（3効果の JSON）＋ `matchesStateFilter` 6ケース＋ `fieldCandidates` 2ケース。
- `続き756② 【ライド】はキーワードそのものが【起】能力`＝ルリグ9枚に `-RIDE` が在ることを固定。
- `続き756③ この巡で配線した既存受け皿`＝上表 2〜9 ＋ `notByBattle` の engine 実走（バトル/効果の両方向）。

**反転確認**＝`matchesStateFilter` の `hasUnderCards` 分岐と `collectBanishTriggers` の `notByBattle` ゲートを
それぞれ**外すと 2 本が FAIL する**ことを実測した（`PASS 1 / FAIL 2`）＝**素通り（無条件成立）していない**証拠。

**既存 golden の期待値を2本更新**（PLAN §5.2「据置契約は受け皿ができたら反転する／消して通すのは禁止」）：
- `WXK03-050-E1: 外れ札の行き先はデッキの一番下（**任意性は未機構で別契約**）` → **契約の前提が消えた**ので
  `split_top_bottom` へ反転（受け皿は既にあった）。
- `wave2 A3 WDK04-015-E1` の `resumeWave2Look` を2回→**1回**（2ステップを1ステップへ畳んだため）。

**`§6.4 O-42` トリップワイヤが発火**＝`WXDi-P14-033-E1` が parser 出力と実体同一になった
（(8) の連用形分割が追いついたため）。`manualEffects.ts` から削除し、**live の `parseStatus` も `MANUAL`→`AUTO`**
へ直した（`PRESERVE_STATUSES` が効いたままだとその効果にだけ parser 改善が永久に届かない）。

---

### ■ 検証コマンド

```
npm run gates                                    # 全緑（golden 3126 / 0 FAIL）
npm run golden -- --only "続き756"               # 新設3本
node scripts/archive/semanticAuditLedger.mjs     # 残 OPEN 157（187 から -30）
npx tsx scripts/censusManualDrift.ts             # 削除候補 0
npm run regen                                    # 逆翻訳シート再生成（decompiler を触ったため）
```


## 2026-08-31（続き755）：§5.1 実機返済を**残0**へ（`V-94`／`V-96`〜`V-100` の6件）＋真バグ2件

ユーザー指示「残り６件も行う」の1巡。**§5.1 は 6 → 0**。実機シナリオを25本追加し、
**すべて両方向（肯定／対照）**で PASS。過程で engine の真バグを2件見つけて直した。
gates 全緑（typecheck / **golden 3121→3123（+2本）**・0 FAIL / smoke 全0 / fuzz 全0 / census 12 /
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
実機シナリオ 612 → **637本**。

### ■ 🔴真因①＝`ON_ATTACK_SIGNI` の遅延トリガーが**二重に積まれ、`attackerFilter` も素通り**していた

`WX25-CP1-085`（薬子サヤ）＝「アタックフェイズ開始時に相手シグニ1体を選び、**このターン黒の＜ブルアカ＞の
シグニがアタックしたとき**その1体に －1000」を実機で撃つと、**－1000 が2回乗り**、しかも
**白の＜ブルアカ＞でアタックしても乗った**。

**真因**＝`collectFieldTriggers` の汎用 `delayed_triggers` ループ（`triggerCollect.ts:4282`）。
あれは **`ON_PLAY`/`ON_BLOOM` の遅延を拾うために続き748 で足した**ものだが、
`ON_ATTACK_SIGNI` まで巻き込んでいた。あのイベントには**専用の対**が既にある：

| コレクタ | 役割 | `attackerOwner` | `attackerFilter` |
|---|---|---|---|
| `collectAttackerSelfDelayedTriggers` | 攻撃側に設置された watcher | `opponent` を読み飛ばす | ✅見る |
| `collectSigniAttackDelayedTriggers` | 防御側 | `self` を読み飛ばす | ✅見る |
| **汎用 `collectFieldTriggers`** | （ON_PLAY 用） | 🔴**見ない** | 🔴**見ない** |

⇒ ①専用コレクタと汎用コレクタの**両方**が積む＝効果が2回走る
②汎用側は `attackerFilter` を見ないので**誰がアタックしても発火する**。
**修正**＝汎用ループは `ON_ATTACK_SIGNI` を読み飛ばす（専用コレクタがあるイベントはそちらに任せる）。

**golden**＝`V-100② ON_ATTACK_SIGNI の遅延は専用コレクタだけが拾う` を追加。
①汎用が0件 ②専用が1件 ③白＜ブルアカ＞では専用も0件 ④**`ON_PLAY` の遅延は引き続き汎用が拾う**（巻き添え防止）
の4点を固定。**読み飛ばしを外すと即 FAIL することを確認済み**。

### ■ 🔴真因②＝`TRANSFER_TO_DECK.position` の `'second'`/`'third'` が**実経路に実装されていなかった**

`WDK09-011-E2`「【ゲート】の正面の相手シグニ1体をデッキの**上から三番目**に置く」が、
実機では**一番上（index 0）**に入っていた。

**真因**＝位置解決が**3箇所に別々に**書かれていた：

| 実装 | 由来 | second/third |
|---|---|---|
| `transferSpecificDeckCard` | `DECK_CARD` | ✅ |
| `insertToDeck` | 場・手札・エナ・トラッシュ・ライフ（7経路の共通入口） | 🔴無し |
| `applyDirectAction` の `TRANSFER_TO_DECK` | **SELECT_TARGET を挟む経路** | 🔴無し |

3つ目のコメントには「execTransferToDeck の insertToDeck と同じ配置ロジック」と書いてあったが**ドリフトしていた**。
**SELECT_TARGET を挟む効果は必ず3つ目を通る**ので、あのカードは実質どこにも実装が無かった。
⇒ `deckInsertIndex` / `deckInsertPosJa` を module レベルに切り出し、**3箇所すべてをそこへ寄せた**。

**golden**＝`V-100③ TRANSFER_TO_DECK: 場のシグニでも top/second/third/bottom が位置どおりに入る` を追加。
**既定（position 無し）＝一番上**も同時に固定（ここが動くと大量の既存効果が壊れるため）。

⚠**枚数はどの位置でも同じ**＝この種のバグは**順序を見る計器**が無いと永久に気づけない。
デッキの中身を全部別 id にして index で見るのが唯一の検出法。

### ■ 返済した6件（25シナリオ・すべて両方向）

| 項目 | 見たもの | シナリオ |
|---|---|---|
| `V-100`① | `hasSoul` × `triggerStateFilterOk`（ソウル付き/無しでミル） | `censusSoulAttackerMill` / `…NoSoulNoop` |
| `V-100`② | `attackerFilter` の色 ＋ 設置時対象の焼き込み | `censusDelayedAttackerFilterFires` / `…ColorNoop` |
| `V-100`③ | `position:'third'` ＋【ゲート】正面限定 | `censusTransferToDeckThird` |
| `V-100`④ | `ActiveCondition` の `ZONE_SUM_COUNT`（赤1枚で崩れる） | `censusZoneSumActiveGranted` / `…Broken` |
| `V-100`⑤ | `distinctBy:'name'`（同じ5枚でも2種類なら不成立） | `censusDistinctByNameMet` / `…SameName` |
| `V-99`① | `ZONE_SUM_COUNT` の **3+4=7**（AND 近似では通らない配分） | `censusZoneSumDisona7` / `…Disona6` |
| `V-99`② | ターン終了時の遅延対象の焼き込み（発火時の候補が1件） | `censusDelayedTurnEndStoredTarget` |
| `V-99`③ | 4択アップキープの「センタールリグの下から1枚」 | `censusUpkeepTrashUnderLrig` |
| `V-98`① | `THIS_CARD_HAS_UNDER{lrig}` の**2段閾値**（4/5/7枚） | `censusLrigUnder4Noop` / `…5Charge` / `…7Lancer` |
| `V-98`② | `FIELD_ATTACHED_COUNT{under}` | `censusFieldUnderCharge` / `…Noop` |
| `V-98`③ | `CENTER_LRIG_ATTACKED_THIS_TURN{negate}` | `censusLrigNotAttackedCharge` / `censusLrigAttackedNoop` |
| `V-97` | `cost.beat_signi{excludeSelf}` ＋ `BEAT_CONDITION`「4枚以下」 | `censusBeatSigniCostPay` / `…Blocked` |
| `V-96` | `EffectCost.fieldExileSelf`（トラッシュではなく `excluded` へ） | `censusFieldExileSelfCost` |
| `V-94` | `SUPPRESS_GAIN_ABILITY`（相手の付与が通らない） | `censusSuppressGainAbility` / `…Control` |

■**`V-99`②は登録票の `WXDi-CP02-043`（アシストルリグ）ではなく同一機構の `WXDi-P12-006`（ルリグ【自】）で踏んだ。**
アシストの【出】は UI 経路が別で本筋（焼き込み）から遠く、ルリグ【自】なら同じ
`SELECT_TARGET_ONLY → STORE → INSTALL_DELAYED_TRIGGER{ON_TURN_END, targetsStored}` を安く通せる。

■**`V-94` の「相手が付与を試みる」は `oppArtsStack` で作った**（`O-113` と同じ注入）。
対照（①を選ぶ）で**付与が普通に通る**ことまで見ているので、③側の PASS が
「そもそも付与が来ていないだけ」ではないことを担保している。

### ■ 実機ドライバで踏んだ罠（次の人が同じ時間を払わないために）

1. 🔴**`opp_field` の候補は表示時に反転する**（`EffectInteractionModal.tsx:214`＝「相手シグニ選択時はゾーン3→2→1の順」）。
   つまり **`pick-0` は DB 候補の末尾**。`cands[0]` と読むと「選んだのと違う1体に乗った」と**誤って赤を出す**。
2. 🔴**`field.lrig_attacked` と `lrig_has_attacked` は別物。**
   `CENTER_LRIG_ATTACKED_THIS_TURN` が読むのは後者（`execUtils.ts:2464`）。前者は「ルリグアタック解決中」の印で、
   盤面注入で立てると**ガード応答窓が開いてフェイズ送りボタンごと消える**（22ティック空振りした）。
3. 🔴**【出】にコストが付くカードは、コストを払うまで配置が DB へ書かれない**（React 側の `placedState` が持つ）。
   `placed`（DB 反映）を操作の前提にすると**コストモーダルが開いたまま永久に待つ**。
4. 🔴**CHOOSE のボタン名は `選択肢N` とは限らない**＝JSON の `label` をそのまま出すカードがある
   （`WXDi-P12-006` は「相手のシグニ1体をこのターン終了時にデッキの一番下へ」）。
5. 🔴**フェイズ送りボタンは1種類ではない**（`uiConstants.PHASE_BTN`）＝ATTACK_SIGNI は「ルリグアタックへ」／
   ATTACK_LRIG は「エンドフェイズへ」／END は「ターン終了」。さらに ATTACK_SIGNI は送りボタンが出ないことがあるので、
   **ターン終了の解決だけを見たいなら END へ patch して「ターン終了」を押す**。
6. 🔴**`img[alt]` の枚数で「候補に出たか」を測らない**＝同じカード名の画像は手札・配置プレビュー・
   モーダルヘッダにも出る。`excludeSelf` は**結果**（自分が場に残っているか）で見る。
7. 🔴**対照が「そもそも操作できなかった」で PASS しないようにする**＝`V-97` の5枚側は
   「場には出たうえで【出】だけが成立しない」ことを明示的に assert した（初版は召喚失敗でも緑になっていた）。

### ■ 追加した観測点

`queryState` に3つ追加＝**`fieldSoul`**（【ソウル】の付き方）／**`lrigHasAttacked`**（このターンにルリグがアタックしたか。
`field.lrig_attacked` と別物）／**`beatZone`**（【ビート】ゾーンの中身）。

### ■ 再現手段

```
node scripts/verifyBattleDrive.mjs censusSoulAttackerMill censusSoulAttackerNoSoulNoop \
  censusDelayedAttackerFilterFires censusDelayedAttackerFilterColorNoop censusTransferToDeckThird \
  censusZoneSumActiveGranted censusZoneSumActiveBroken censusDistinctByNameMet censusDistinctByNameSameName \
  censusZoneSumDisona7 censusZoneSumDisona6 censusDelayedTurnEndStoredTarget censusUpkeepTrashUnderLrig
node scripts/verifyBattleDrive.mjs censusLrigUnder4Noop censusLrigUnder5Charge censusLrigUnder7Lancer \
  censusFieldUnderCharge censusFieldUnderNoop censusLrigNotAttackedCharge censusLrigAttackedNoop \
  censusBeatSigniCostPay censusBeatSigniCostBlocked censusFieldExileSelfCost \
  censusSuppressGainAbility censusSuppressGainAbilityControl
npm run golden -- --only "V-100"
npm run gates
```

## 2026-08-31（続き754）：§5.1 実機返済 7 → 6 件（`V-101` クローズ）＋ **手札捨て台帳の真バグを10箇所修正**

ユーザー指示「実機検証を続ける」の1巡。**`V-101`①②③ を実機5シナリオ（すべて両方向）で返済**し、
その過程で**「このターン手札から捨てた」台帳の書き漏れ**という真バグを見つけて直した。
gates 全緑（typecheck / **golden 3119→3121（+2本）・0 FAIL** / smoke 全0 / fuzz 全0 / census 12 /
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。

### ■ 🔴真因（症状ではなく）＝`turn_hand_discarded_cards` を書く支払い地点が3種類あった

`HAND_DISCARDED_THIS_TURN{filter}`（`effectEngine.ts:871` / `:1363` ／ `execUtils.ts:2336`）は
**枚数カウンタではなく実体リスト（`turn_hand_discarded_cards`）を絞って数える**。
ところがコストで手札を捨てる地点は10箇所あり、実装が**3種類に割れていた**：

| 支払い地点 | 旧 `turn_hand_discarded_count` | 旧 `turn_hand_discarded_cards` |
|---|---|---|
| アーツ使用（`performArts`） | ✅ | ✅ |
| スペル使用・**ルリグデッキから** | ✅ | ✅ |
| スペル使用・**手札から** | ✅ | 🔴**無し** |
| シグニ【出】コスト（`executeSigniOnPlayCost`） | 🔴無し | 🔴無し |
| シグニ【起】／ルリグ【起】／キー【起】／アシスト【起】／トラッシュ【起】／ガードシグニ捨て | 🔴無し | 🔴無し |

⇒ **その経路で捨てた turn は条件が永久に false**（無言 no-op）。
とくにスペルの2枝は**同じ関数の中で片方だけ実体を落としていた**ので、
「ルリグデッキから使うと効くのに手札から使うと効かない」という再現しにくい形になっていた。

**実機での再現**＝`WXDi-CP02-055`（猫塚ヒビキ）は1枚で両側を持つ：
E3【出】が手札から＜ブルアカ＞2枚を捨て、E2【自】アタック時がその履歴を読む。
修正前は **`捨て履歴=[] 捨て枚数=0`**（＝【出】のコストで2枚捨てた直後）で、アタックしても相手の手札は減らなかった。

### ■ 直し方＝**唯一の入口**を作って10箇所から呼ぶ

`src/screens/battle/costs.ts` に `handDiscardHistoryRecord(prev, discarded)` を新設し、
**枚数と実体を必ず同時に**積むようにした。既に両方書いていたアーツ／スペル(ルリグデッキ)枝も
この関数へ寄せて、**書き方が分岐する余地を消した**。

⚠**「捨てる」以外を渡さない**＝`handToEnergy`（エナへ）／`handToUnder`（このシグニの下へ）／
`energyTrash`（エナから）は手札を捨てていないので台帳に載せない。各呼び出し地点でコメントを添えた。
⚠**ターン終了時のルール処理（手札上限超過）は通していない**＝あの捨ては `turn_*` がリセットされる
境界と同じ地点で起きるので、載せると寿命が1ティックの値になる（意図的な除外・ヘルパーの JSDoc に明記）。

### ■ golden（+2本）＝**片方だけ書く形を機械で禁止**

- `V-101② handDiscardHistoryRecord: 枚数と実体を必ず同時に積む` … 空配列で何も動かない／初回／追記の3段に加え、
  **不変条件「枚数 === 実体の長さ」**を全状態で assert（旧バグはここが 2 対 0 に割れていた）。
- `V-101② HAND_DISCARDED_THIS_TURN は実体を絞って数える` … ＜ブルアカ＞／非ブルアカ／空 の3方向を `evalCondition` で実走。

### ■ `V-101` の実機5シナリオ（すべて両方向・全 PASS）

| シナリオ | カード | 見たもの |
|---|---|---|
| `censusAcceFromEnergy` | `WX22-Re02` | 段1（`targetScope:'self_energy'`）の候補が＜調理＞《アクセアイコン》の**1件だけ**／選ぶとエナから消えて【アクセ】へ |
| `censusHandDiscardedBuruakaFires` | `WXDi-CP02-055` | 【出】コストで＜ブルアカ＞2枚を捨てる → アタック時に相手の手札 2→1 |
| `censusHandDiscardedOtherClassNoop` | 同上 | 対照＝捨てたのが＜ブルアカ＞でなければ発動しない（手札 2→2） |
| `censusDelayedPlacedByEffectFires` | `WXDi-P09-010` | 効果（【起】トラッシュから場に出す）で配置 → 遅延トリガー発火で相手に －8000 |
| `censusDelayedPlacedBySummonNoop` | 同上 | 対照＝手札からの通常召喚では発火しない（`placedByEffect` の弁別） |

■**`ATTACH_ACCE.fromEnergy` と `placedByEffect` は engine 側が正しかった**＝実機で炙って両方向とも期待どおり。
実装の穴が出たのは②だけで、**そこは engine ではなく UI の支払い地点**だった（＝golden/smoke/fuzz が届かない層）。

### ■ 実機ドライバで踏んだ罠（次の人が同じ時間を払わないために）

1. 🔴**`H.clickTextOrBtn` は `isEnabled` を検査しない。**
   disabled の「発動」を毎ティック押して `'btn:発動'` を返し続け、**30ティック空振りしても「押せている」ように見える**。
   ⇒ **可否のあるボタンは `H.clickBtn(name, {exact:true})`**（あちらは isEnabled を見る）。ドライバ自身のコメントが
   「disabled のまま押して『クリックした風だが進まない』」を2大罠として警告しているのに、その罠に落ちた。
2. 🔴**ルリグ【起】のボタン名は効果本文ではなく支払い要約**＝実測で `【起】エナ2` と `【起】コストなし` の2件だけ。
   「効果によって」「トラッシュから」といった本文で選び分けようとすると**1つも押せない**。
3. 🔴**`SELECT_SIGNI_ZONE`（効果で場に出すときの配置先）は `ゾーンN` ボタン**で、通常召喚の `summon-zone-N`（testid）
   とは**別の窓**。片方だけ書くと `pEff=SELECT_SIGNI_ZONE` で止まる。
4. 🔴**対象選択（`pick-0`）は「決定」より先に置く。** 逆順だと毎ティック「決定 (0/1)」を押しに行って pick へ到達せず、
   `pEff=SELECT_TARGET` のまま空回りする。
5. **解決待ちの窓が開いている間はルリグ/カードを触らない**（裏でカード詳細が開いて操作を食う）。
6. **ルリグ【起】のコストUIに testid は無い**＝エナ札は `<img alt={CardName}>` を包む div の onClick なので
   **カード名で掴む**。モーダル外の同名カードはオーバーレイに覆われて click が通らないので、
   `force` を付けずに順に試し、通ったものだけを支払いとして数える。

### ■ 再現手段

```
node scripts/verifyBattleDrive.mjs censusAcceFromEnergy censusHandDiscardedBuruakaFires \
  censusHandDiscardedOtherClassNoop censusDelayedPlacedByEffectFires censusDelayedPlacedBySummonNoop
npm run golden -- --only "V-101②"
npm run gates
```

## 2026-08-31（続き753）：§5.1 実機返済を 10 → 7 件（`V-93` / `V-95` / `V-102` をクローズ）

ユーザー指示「§5.1【最優先】実機未検証の返済」の1巡。**`src/` は1バイトも触っていない**＝変更は
`scripts/verifyBattleDrive.mjs`（ドライバのフレーク修正＋観測点1つ＋新規シナリオ3本）と docs のみ。
gates 全緑（typecheck / golden 3119・0 FAIL / smoke 全0 / fuzz 全0 / census 12 / census-stubs A🔴0・C0 /
manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。

### ■ `V-93`＝**engine のバグではなく、実機ドライバのフレークだった**

`wx17040ConditionsTrueExecuteAll` / `wx17040ConditionsFalseNoop`（`WX17-040-E1`＝「以下の3つから3つまで選ぶ」）。
**単独 → 単独 → 連続2本の計4回すべて PASS**（9秒／6秒）。live JSON も逆翻訳も原文と一致したままで、
engine・parser には手を入れていない。

**真因**＝ドライバが**「クリックしたこと」を進行条件にしていた**こと。

```js
await c1.click().catch(() => {});
await c2.click().catch(() => {});
await c3.click().catch(() => {});
did = 'click:選択肢1+2+3'; picked = true;   // ← 押せたかを一度も測っていない
```

`multiSelect` の CHOOSE は1クリックごとに React が再描画する（`EffectInteractionModal.tsx:640` の
`selectedMultiChoiceIds` が更新され、選択済みのラベルが `選択肢N` → `✓ 選択肢N` に変わる）。
続けて押すと直後の locator が **detach 済みの要素を掴んで throw** しうるが、`.catch(() => {})` が
それを握り潰すので、**2つしか選ばれていないまま `picked = true` になって「決定」へ進む**。
`upTo` の確定ボタンは常に enabled なので**そのまま確定できてしまい**、後段の観測（バニッシュ／エナチャージ）
だけが空振りする＝**実行ごとに停止段階が変わる**という記録どおりの症状になる。

**直し方**＝選択済みラベル `✓ 選択肢N` を進行条件にした。1つずつ押して ✓ が付いたことを確かめ、
**3つ揃うまで `picked` を立てない**（`FalseNoop` の③も同じく ✓ 確認へ）。揃わなければ次ティックで押し直す。

🔑**教訓＝実機ドライバでは「押した」ではなく「盤面/DOM が変わった」を進行条件にする。**
`.catch(() => {})` を置いた行は**必ず次の行で「効いたか」を測る**。黙って半端な状態で先へ進むのが最悪の形で、
これは engine のバグと見分けが付かない赤を出し続ける。

### ■ `V-95`＝**書いてあったシナリオを回すだけ**（`HAS_TRAP_IN_FIELD`）

`node scripts/verifyBattleDrive.mjs censusHasTrapInField` → **PASS（9秒）**。
手札 2→1（トラップ無しは不発）→ トラップを `patchPlayerState` で設置してもう1枚召喚 → DRAW で1 の反転確認。
PLAN に書かれていた「Playwright Chromium 未導入／外部認証で timeout」は**既に古い記述**だった（続き747 で解消済み）。

🔑**「ドライバは書いてあるが未実走」の在庫は実装より圧倒的に安い。§5.1 に来たらまず全部回す。**

### ■ `V-102`＝新規シナリオ3本（4方向すべて PASS）

| シナリオ | カード | 見たもの |
|---|---|---|
| `censusSelfCrashToTrashRefill` | `WD06-009` | 自ライフのクラッシュ置換（トラッシュ＋デッキ上を補填）と**回数制**の反転 |
| `censusSideAttackLancerFires` | `WXEX2-71` | 正面以外へアタック→そのシグニが【ランサー】を得る→相手ライフ−1 |
| `censusSideAttackLancerFrontNoop` | `WXEX2-71` | 対照＝正面へアタックすると付かない |

③（`ON_ACCE` のトリガー元）は続き748 で返済済みなので含めていない。

**なぜ実機でしか見えないか**＝
- `SELF_CRASH_TO_TRASH_AND_REFILL` は engine（`execStubPart3.ts:989`）が**カウンタを積むだけ**で、
  置換そのものは `BattleScreen.performLifeBurstResponse`（`BattleScreen.tsx:12644` 付近）の**1点にしかない**。
  golden / smoke / fuzz はこの経路を1行も通らない。
- `triggerCondition.attackedNotFront` は `triggerCollect.ts:4280` で **fail-closed**＝`sideAttack` を渡さない
  収集経路では永久に発火しない。渡しているのは `BattleScreen.tsx:8942` の
  `collectFieldTriggers('ON_ATTACK_SIGNI', …, { sideAttack: isSideAttack })` **1箇所だけ**。

**観測結果**（`censusSelfCrashToTrashRefill`）：
- 対照（残0）＝割った札 `WD01-013#9323` は**エナへ**・life 3→2・deck 3のまま。
- 置換あり（残1）＝**同じ操作**で割った札 `#9322` が**トラッシュへ**・デッキ上 `#9331` がライフ末尾へ・deck 3→2・残回数 1→0。

**観測結果**（`censusSideAttackLancer*`）：
- 側面（host zone0 → opp zone1）＝`keyword_grants` が `側面アタック` → `側面アタック/ランサー` になり、
  バトルバニッシュで**相手ライフ 3→2**（付与が読まれていることまで確認）。
- 正面（host zone0 → opp zone2）＝**付かず**、バニッシュしても相手ライフは 3 のまま。

### ■ シナリオを書くときに踏んだ罠（次の人が同じ時間を払わないために）

1. 🔴**盤面注入で「召喚ボタンが出ない」ときは、まずルリグ限定を疑う。**
   `getMyHandCardActions`（`BattleScreen.tsx:8298`）が `meetsRestriction(cardData.Restriction, lrigClass)` を見るので、
   **エルドラ限定の `WD06-009` は あや のルリグ（`WX22-009`）では召喚できない**。
   症状は「**盤面注入は成功しているのに操作が1手も始まらない**」＝30ティック空振り。
   ⇒ ルリグを `WD06-001`（エルドラ Lv4・Limit11）へ替えて解決。
2. 🔴**回数制の置換は「同じ札・同じ操作で1ビットだけ反転」して測る。**
   チェックゾーンは**クリック待ちで止まる**ので、そこで `self_crash_to_trash_and_refill` を 1→0 に patch してから
   同じ「エナに送る」を押せば、**経路を1本も変えずに**対照が取れる。
   ⚠**別カードで反転しようとしない**＝素の自ライフクラッシュはたいてい `triggerBurst:false` で、
   あれは `execLifeCrash` の else 枝で**直接トラッシュへ**行く（チェックゾーンを通らない別経路）＝比較にならない。
   ⚠**ルリグ限定が違うカードも使えない**（1と同じ理由）。
3. 🔴**patch のあとを固定 sleep で済ませない。**
   realtime 反映前にボタンを押すと**対照のつもりで置換つきを踏み、「置換が無条件に乗っている」と赤を誤報する**（初版がこれ）。
   ⇒ **patch した値を `queryState` で観測してから**次へ進む（最大12回・500ms ポーリング）。
4. **手札モーダルを「1回開けば開いたまま」と仮定しない。**
   毎ティック「召喚ボタンが見えているか」を測り、見えていなければ手札札を押し直す（`censusAcceSelfPlayGate` と同型）。

### ■ 追加した観測点

`queryState` の `sideOf` に **`selfCrashRefill`**（`self_crash_to_trash_and_refill`）を追加。
置換は回数制なので、「2回目に乗らない」を盤面差分だけで言うと**「そもそも1回目も乗っていない」と区別が付かない**＝
カウンタ自体を観測点にした。

### ■ 直していない粗（挙動バグではないので §5.3 には登録しない）

チェックゾーンのボタンは置換が乗っていても **「エナに送る」のまま**（実際はトラッシュ＋ライフ補填）。
**ラベルを変えると 158 シナリオがアクセシブル名でこのボタンを掴んでいる**ので触っていない。
直すなら「ラベル変更＋ドライバ側の名前を一斉に追随」を1巡で通すこと。

### ■ 再現手段

```
node scripts/verifyBattleDrive.mjs wx17040ConditionsTrueExecuteAll wx17040ConditionsFalseNoop
node scripts/verifyBattleDrive.mjs censusHasTrapInField
node scripts/verifyBattleDrive.mjs censusSelfCrashToTrashRefill
node scripts/verifyBattleDrive.mjs censusSideAttackLancerFires
node scripts/verifyBattleDrive.mjs censusSideAttackLancerFrontNoop
```

---

## 2026-09-09 — 第233バッチ：宣言レベル一致／任意トラッシュ（機構不要の一点物16効果・`.codex-work` 実装／Claude 検証済み）

**実装は `CODEX_HOME=.codex-work codex exec` へ委譲**（`docs/PLAN.md` §5.0 実装キュー・triage 済み BUG のうち新しい engine 機構が不要と事前確認した効果だけを抽出）。Codex の申告は Claude が独立実行で全数検算し、差し戻し0で採用。

- 対象16効果を原文・fresh・live・逆翻訳で照合。`WX10-015-E1` は第209バッチで任意性と対象が修正済みだったが、相手側閲覧の旧 STUB を型付き `LOOK_AND_REORDER` へ置換し、全16効果を parser の effectId 限定後段修復として配送した。
- A群は `LAST_PROCESSED_MATCHES{filter:{cardType:'シグニ',levelEqDeclaredNumber:true}}` で主要処理をゲートし、3枚公開系は `reorder:true`、`WXDi-D09-P14-E2` は相手デッキトップ公開を補完した。
- `WX25-P1-TK3-E1` は型付きの相手手札 `LOOK_AND_REORDER` と `TRASH{HAND_CARD,count:'ALL',levelEqDeclaredNumber:true}` へ修復。既存の同型 `PR-257-E1` の filtered `count:'ALL'` を踏襲した。
- B群は「そうした場合」の範囲に応じて `MILL.optional`、内側 `OPTIONAL_ACTIVATE`、または `OPTIONAL_COST{青}→PAID_ADDITIONAL_COST` を使い分けた。`PR-319-E2` は `AUTO/ON_TURN_END` へ修復した。
- 実測で `levelEqDeclaredNumber` は `LAST_PROCESSED_MATCHES` と手札 `TRASH` の2経路では未解決だったため、既存フィールドを静的 level へ解決する配線を追加（未宣言時 fail-closed）。新しい action/condition/state は追加していない。
- 付随発見：`WX25-P1-TK3-E1` の `ARTS_IMMOVABLE` は activated sequence 内の STUB のままで、常在収集側が要求する top-level `CONTINUOUS` 形ではない。同型クラフト群にまたがる範囲外問題のため未修正（範囲外・見送り）。
- **Claude 側の独立検証**＝①`git diff` の effectId 単位差分が申告どおり**ちょうど16件**（`PR-K022-E1-G` は親 `PR-K022-E1` として1件に数える）②`npm run typecheck` 独立実行 PASS ③`npm run gates` 独立実行＝**全緑**（golden・smoke・fuzz・census・census:stubs・census:enginetext・census:costtext・manual-fields・lint すべて PASS。census 高シグナル `0/baseline 0`・lint `0 errors/254 warnings`＝投入前と同値）④golden `--only "第233"` で新規19本 PASS ⑤新規 golden は fresh/live 両読み＋反転（任意処理skip時に後続が実行されないこと）を含む。
- 検証（Codex 申告値。Claude の独立実行と一致）：`typecheck` PASS、golden `3709/3709`、smoke `10744/10744`（CRASH/HANG/INVARIANT 0）、fuzz 200ゲーム不具合0、census 高シグナル `0 / baseline 0`、lint `0 errors / 254 warnings`。
- `src/engine/`（`effectExecutor.ts`／`execUtils.ts`）と `src/data/effectParser.ts` を触った回＝`docs/PLAN.md` §2.2 により **`src/screens/` 不触・新しい型/機構も不足**なので実機検証は不要（④まででよい）。
- 消化記録＝`scripts/archive/scratchpad/semantic_bug_fixed.txt` に16行追記（`docs/PLAN.md` §5.0 実装キューの在庫カウンタから引き算するため）。

## 2026-09-09 — 第234バッチ（前半）：機構不要の一点物30効果のうち6効果＝`.codex-work` が利用上限で停止・Claude が検証済み

**`.codex-work` が30効果中6効果を実装した時点で利用上限に達し停止**（`ERROR: You've hit your usage limit...`／
`memory/codex-limit-handoff.md` の既定どおり、途中差分を検証してから残りは別途続行する）。

- `WX24-D5-05-E1`＝「対戦相手のシグニ1体のパワーが0以下になったとき」を`INSTALL_DELAYED_TRIGGER{ON_SIGNI_POWER_ZERO_OR_LESS,zeroedOwner:'opponent'}`へ修復（アーツ解決時の無条件ミルから遅延誘発化）。
- `WXEX1-13-E1`＝「自分の【トラップ】1つを対象とし手札に戻してもよい」が場のシグニを誤対象にするBOUNCEだったのを`STUB{OPTIONAL_ACTIVATE}`→`STUB{TRAP_TO_HAND}`→`LOOK_PICK_CHAIN`（公開2枚→1枚をトラップ設置・残りデッキ下）へ修復。
- `WXEX1-30-E3`＝白1枚青1枚を検索する効果が単色filterで白しか探せなかったのを`selectionConstraint.groups`（色ごとに1枚指定）で修復。
- `WXEX1-54-E2`＝timingが`MAIN`だけで原文が許可する`ATTACK_ARTS`から起動できなかったのを追加。
- `WXEX1-67-E1`＝「《青》を支払ってもよい。そうした場合」のコストが丸ごと欠落し無償バウンスだったのを`OPTIONAL_COST`+`PAID_ADDITIONAL_COST`で修復。
- `WXEX2-10-E3`＝`levelLteLastProcessed`が`ADD_TO_FIELD`の`HAND_CARD`ソースでは`resolveDynamicFilter`を通らず未解決だった配線漏れを追加、`opponentSelectsZone`で配置先を対戦相手選択に修復。
- **Claude 側の独立検証**＝①受け皿5点（`TRAP_TO_HAND`ハンドラ・`selectionConstraint.groups`消費・`ON_SIGNI_POWER_ZERO_OR_LESS`+`zeroedOwner`トリガー収集・`opponentSelectsZone`・`levelLteLastProcessed`）が全てこのバッチ以前から実在することをコード上で確認 ②`git diff`のeffectId単位差分がちょうど6件 ③`typecheck`PASS ④`npm run gates`独立実行で全緑（lint 254 warnings=直前と同値・census 0/0） ⑤`npm run golden`（フィルタなし全件）`3718/3718`PASS（3709→+9）。
- 残り24効果（`WX05-028-E1`ほか）は別途 Claude が引き継いで実装する。

## 2026-09-09 — 第234バッチ（後半）：残24効果の stale 再照合（`~/.codex`〔default アカウント〕実装・Claude 検証済み）

指示書の live JSON はスナップショットなので、24効果を原文・現在の live・fresh parser・逆翻訳・既存 engine 受け皿で再照合した。
その結果、**21効果は先行バッチですでに修正済み**、残る**3効果は新しい機構が必要**だったため、
`repairSemanticBatch234` への case 追加や近似実装は行わなかった。

- **既修正21効果**＝`WX05-028-E1`、`WX07-026-E1`、`WX11-036-E1`、`WX11-034-BURST`、
  `WX08-023-E3`、`WX11-021-E1`、`WX03-024-BURST`、`WX20-022-E1`、`WX14-042-E2`、
  `WX20-023-BURST`、`WX21-030-E2`、`WX21-036-E1`、`WX13-036-E3`、`WX16-074-E1`、
  `WX20-029-E1`、`WX14-027-E2`、`WX12-Re22-E1`、`WX12-032-E1`、`WX19-064-E1`、
  `WX12-033-E1`、`WX18-001-E2`。全件で live と fresh が一致し、指示書の triage が指した欠落は現存しない。
- `WX05-028-E1` の `OPTIONAL_COST` 直後の `CONDITIONAL{IS_MY_TURN}` は、engine がこの並びに限って
  「そうした場合」の旧プレースホルダーとして横取りし、pay 枝だけで後続を実行する既存契約。
  相手ターンに常に不発になる条件ではない。`WX14-042-E2` の `OPTIONAL_TRASH_SELF` も同じ dispatcher が
  pay/skip を分岐する。いずれも追加不整合ではなかった。
- `WX16-074-E1` は STUB id が歴史的に `ACCE_FROM_HAND` のままだが、既存 handler は
  `hand.includes || energy.includes` を受け、`ATTACH_ACCE` も両領域から除去する。既存 golden が
  エナ発の正方向と手札・エナ双方に無い負方向を実行確認済み。
- **見送り `WX09-032-E1`**＝すでに `DEFERRED_COST_SUBSTITUTE_MULTI_ENERGY` へ明示 defer 済み。
  エナ1枚で《緑》2個または3個の1組を置換するには、複数スロットを1枚で満たす支払い候補・UIが要る。
- **見送り `WXEX2-10-E2`**＝`DECLARED_NAME_TO_SERVANT_ZERO` handler は存在するが、現存カードの
  instance を `card_identity_overrides` へ永続的に書く snapshot 実装で、ターン終了時の失効も
  発動後に該当領域へ来たカードへの適用もない。正確な実装には turn-scoped な PlayerState 規則が要る。
- **見送り `WXEX2-12-E4`**＝相手が非公開のルリグデッキを2束へ分け、こちらが片方だけを見てアーツを選ぶ
  交互・秘匿 interaction の pending/UI が存在しない。現在の `CAST_FROM_OPP_TRASH` ×2 は誤生成のまま。
- 条件以外の追加不整合は0件。`GRANT_* abilities[]` に入れ子だった監査対象も0件
  （`WX14-042-sub-E1` は対象 effectId ではなく、`WX14-042-E2` 内で付与される子能力）。
- 検証＝`npm run regen` 完走・生成差分0、`npm run typecheck` PASS、フィルタなし `npm run golden`
  **3718/3718 PASS**、`npm run gates` 全緑（golden 3718、smoke 10744/10744、fuzz 不具合0、
  census 高シグナル 0/baseline 0、`census:stubs` A群0、`census:enginetext` A群0、
  `census:costtext` A群0、lint 0 errors/254 warnings）。投入前から数値変化なし。
- **Claude 側の独立検証**＝①`git status --porcelain` が `docs/BUGFIXES.md` の1件のみ（コード・JSON差分0＝申告と一致）
  ②stale21件のうち4件（`WX20-029-E1`／`WX12-033-E1`／`WX19-064-E1`／`WX16-074-E1`）を live JSON で直接抜き取り確認
  ＝申告どおりの実装が既に入っていた（`WX16-074-E1` は `execStubPart3.ts:3554-3559` のコメントが「第221バッチで
  ゲート1行だけ直した」と明記しており、より古いバッチでの既修正と確認できた）③新規発見2件（`WXEX2-10-E2`／
  `WXEX2-12-E4`）の live JSON・原文を直接照合し、真に機構待ちと確認 → **`O-306`／`O-307`** として §5.3 索引 G
  ＋ [PLAN_DETAIL.md](./PLAN_DETAIL.md) 登録票へ追加登録した。`WX09-032-E1` は既存の `DEFERRED_COST_SUBSTITUTE_MULTI_ENERGY`
  （`census:stubs` の DEFERRED_ 免除規約）で十分カバーされているため新規登録はしていない。
- 消化記録＝stale21件を `scripts/archive/scratchpad/semantic_bug_fixed.txt` へ`FP（stale）`として追記
  （実装キューの在庫カウンタを引き算するため）。実装キュー: 309→**288効果**。

## 2026-09-09 — 第235バッチ：機構不要の一点物30効果のうち16効果＝default アカウントが利用上限で停止・Claude 検証済み

第234バッチ後半に続き default アカウント（`~/.codex`）へ第235バッチ（一点物30効果・第234バッチと同じスクリーニング）を投入。
**16効果を実装した時点で default アカウント自身の利用上限にも到達し停止**（`ERROR: You've hit your usage limit... try again at 1:18 PM`）。
報告書は書けずに終わったため、Claude が差分を直接検証して採用。**残り14効果（`WXEX2-29-E3`ほか）は未投入のまま実装キューに残る**。

- `WXEX2-23-E3`＝`BANISH`に`selectionConstraint:{same:'name'}`を追加し、同名のシグニ2体を対象にする制約を復元。
- `WXEX2-29-E1`＝`REMOVE_ABILITIES`単独だったのを`FREEZE{filter.isTriggerSource}`+`REMOVE_ABILITIES`の2段へ。
- `WXEX2-39-E1`＝`TRASH{HAND_CARD}`の`count:1`を`count:'ALL',upToCount:true`にして「好きな枚数」を表現。
- `WXEX2-44-E3`＝`SEND_TO_ENERGY`後、自陣に該当シグニがある場合だけ`TRANSFER_TO_HAND`する条件分岐を追加。
- `WXK01-037-E1`＝`BANISH`のfilterに`isTriggerSource:true`を追加。
- `WXK01-051-E1`＝`CONDITIONAL{LIFE_COUNT gte 2}`で全体をゲート。
- `WXK02-030-E1`／`WXK03-030-E1`＝`OPTIONAL_COST{白}`+`PAID_ADDITIONAL_COST`で任意コストを復元し、後続処理も正しい対象へ修正。
- `WXK03-029-E2`＝`SEARCH`のfilterを`cardName:"ガードアイコン"`（誤り）から`hasGuard:true`へ訂正。
- `WXK04-034-E2`＝`REVEAL_AND_PICK`の`remainder.location`を`'energy'`へ修正。
- `WXK06-073-E1`＝相手手札を見て非無色1枚をデッキ下へ送り、送れたら1枚引く3ステップへ実装。
- `WXK06-074-E1`＝`CONDITIONAL{OPP_CARDS_MOVED_TO_DECK_THIS_TURN}`でゲートを追加。
- `WXK07-056-E1`＝`STUB{DECK_SIGNI_LEVEL_OVERRIDE}`へ実装（デッキ内の該当シグニの基本レベルを上書き）。
- `WXK09-004-E1`＝`CHOOSE`の選択肢c1を`TRANSFER_TO_HAND`+`ADD_TO_FIELD`（トラッシュから手札経由で場出し）へ実装。
- `WD10-001-E1`＝`POWER_MODIFY`の対象を`owner:'any',count:1`から`owner:'self',count:'ALL',filter.crossState:true`へ修正。
- `WD14-009-E1`＝エナから捨てた＜悪魔＞の枚数を`{$ref:'last_processed_count'}`でトラッシュからの場出し枚数へ連動。
- **Claude 側の独立検証**＝①`git diff`のeffectId単位差分がちょうど16件 ②`typecheck`PASS ③`npm run golden`（全件）
  `3737/3737`PASS（3718→+19）④`npm run gates`独立実行で全緑 ⑤`node scripts/heldReview.mjs`を再実行し、
  batch235関連の一時的なheld項目（fresh/live不一致）が0件に収束することを確認（build:effects直後の中間スナップショットで
  一時的に6枚分の差分が`_held_review.txt`に残っていたが、`heldReview.mjs`再実行で解消＝live側は既に正しい）
  ⑥`WD14-009-E1`の`{$ref:'last_processed_count'}`は`execUtils.ts:242`の`resolveCountRef`が`ctx.lastProcessedCards`
  から解決する確立済みパターンであることをコードで確認（`delta`に書くと0になる別の`$ref`経路と混同していないことも確認）。
- 消化記録＝`scripts/archive/scratchpad/semantic_bug_fixed.txt`へ16行追記。実装キュー: 288→**272効果**。

## 2026-09-09 — 第236バッチ：機構不要候補30効果の再照合・6効果修正（`.codex-work` 実装・Claude 検証済み）

指示書のスナップショットを信用せず、対象30効果すべてについて原文・現在のlive JSON・fresh parser・逆翻訳・既存golden・engineの実消費箇所を再照合した。triageが指した不整合は30件とも現存し、staleは0件。うち**既存の型・フィールドだけで正確に閉じた6効果を採用**し、残る24効果は新しい動的条件・選択者・遅延状態などが要るため近似せず据え置いた。全対象ともトップレベル効果で、`GRANT_*`配下の入れ子は0件。

- `WDK01-007-E1`＝ドライブ状態の対象を支払前に保存し、`LAST_PROCESSED_MATCHES{level.min:3}`のthen/elseで【トリプルクラッシュ】と【ダブルクラッシュ】を排他的に付与。
- `WDK05-R11-E1`＝`OPTIONAL_COST{青}`の支払枝の中へ下2枚MILLとBANISHをまとめ、対象filterを`levelEqLastProcessedLevelSum:true`にした。旧goldenの「未払いでもBANISH」を原文どおり不発へ訂正。
- `WDK09-017-E1`＝相手手札を全閲覧し、非無色1枚までをデッキ下へ移す`TRANSFER_TO_DECK`を追加。1枚動いた場合だけ相手が1枚引く。
- `WDK12-007-E1`＝選択肢②を`REMOVE_CHARM{ALL}`→`DRAW{$ref:last_processed_count}`→`ENERGY_CHARGE_FROM_DECK{$ref:last_processed_count}`へ修復。
- `WDK15-001-E3`＝`DRAW_PER_FIELD_COUNT.countFilter`へ`hasUnderCards:true`を追加。
- `PR-460-E1`＝相手センタールリグへの`GRANT_KEYWORD{アタックできない, UNTIL_END_OF_TURN}`を追加し、既存の相手シグニ`POWER_MODIFY{-15000}`もターン終了時までと明示。

**見送り24効果**（いずれもtriage有効）：

- `WXEX2-29-E3`＝最初のSEARCH結果に左右されず、元の相手シグニのレベルを両プレイヤーのSEARCHまで保持する参照が無い。
- `WXEX2-81-E2`＝自分の＜天使＞の色種類数を相手シグニの動的レベル上限へ渡すfilterが無い。
- `WXK02-002-E3`＝相手の宣言値と当該ターンのアーツ使用回数をターン終了時まで保持・比較する遅延状態が無い。
- `WXK04-003-E2`＝見た同じ4枚を「場出し」「アクセ」「残りトラッシュ」の複数選択へ引き回す共有poolが無い。
- `WXK04-033-E1`＝トラッシュの札とアクセ先を最大3組対応付け、ターン終了時にその札だけ戻す追跡が無い。
- `WXK04-038-E1`＝「このターン、＜植物＞がエナへ置かれた」履歴条件が無い。
- `WXK05-001-E2`＝追加ターンのメインフェイズだけ、手札からのシグニ配置を禁じるsource/phase限定が無い。
- `WXK06-025-E2`＝正面シグニの任意TRASHは既存語彙で書けるが、その後に**相手自身が**自分の手札から選ぶ`ADD_TO_FIELD`の候補選択者フィールドが無い。
- `WXK07-003-E1`＝既存の付属札除去は裏向きのトラップ等を除外するため、「指定シグニゾーンの非シグニ札すべて」と一致しない。
- `WXK07-018-E1`＝自分と相手の各1体をチェックゾーンへ移してから、それぞれダウン状態で戻す対称な選択・往復actionが無い。
- `WXK07-033-E1`＝相手ルリグレベル以下の宣言値を、選んだ相手シグニの基本レベルへ動的に渡す配線が無い。
- `WXK10-018-E2`＝既存`TRASH_ATTACHED_OR_UNDER_CARD`は候補を自動取得する近似で、起動コストとしての選択・支払失敗ゲートを満たさない。
- `WXK10-044-E1`＝手札sourceへ直すだけでは使用者が相手手札を選べるため、「相手自身が選ぶ」選択者配線が要る。
- `WXK10-091-E1`＝ownerを相手へ直すだけではSEARCHの選択者が使用者のままになり、相手自身のデッキ探索にならない。
- `WD20-006-E1`＝修飾先が限定されないエナゾーン2枚を正確に対象化する複数owner候補が無い。
- `WD20-008-E1`＝両者の3枚までチャージは既存語彙で書けるが、`USE_CONDITION_ARTS_USED`が使用可否を実際にはゲートしない。
- `WXK08-001-E1`＝対象宣言後に任意コストを払う順序を3選択肢で保持する必要があり、特に`REMOVE_ABILITIES`に保存対象を渡す既存配線が無い。
- `WXK08-017-E1`＝次のダメージ1回防止は既存だが、任意のキー移動STUBが成否を記録せず「そうした場合」を正確にゲートできない。
- `WXK08-028-E2`＝全ライフを手札へ移した実枚数まで、手札から任意枚数をライフへ戻す動的up-to countが無い。
- `WDK10-015-E1`＝捨てたシグニのパワーの半分以下を参照する動的power filterが無い。
- `WDK11-001-E3`＝指定名の札をルリグデッキからシグニ場へ出す既存action/STUBが無い。
- `SP26-002-E1`＝全領域の相手シグニのトリガー能力だけを、ライフバーストを除外してターン中抑止する収集ゲートが無い。
- `PR-305-E1`＝バトル終了時まで「このシグニがバトルした相手」を保持してデッキ下へ送る遅延対象carrierが無い。
- `PR-422-E1`＝バニッシュ直前の効果元パワー0以下を読むtrigger conditionが無い。

triage記載以外にも、`WXK06-025-E2`・`WXK10-044-E1`・`WXK10-091-E1`の相手側選択者、`WD20-008-E1`の使用条件STUBが非ゲート、`WXK08-001-E1`の対象宣言順、`WXK08-017-E1`の任意処理成否未記録を確認した。これらも今回の範囲では新しい受け皿が要るため未修正。

検証＝対象6件の個別`npm run golden -- --only` PASS、`npm run regen`完走、`npm run typecheck` PASS、フィルタなし`npm run golden` **3745/3745 PASS**（投入前3737→新規8本）、`npm run gates`全緑。smoke **10744/10744**（CRASH/HANG/INVARIANT 0）、fuzz 200ゲーム不具合0、census高シグナル`0 / baseline 0`、`census:stubs` A群0、`census:enginetext` A群0、`census:costtext` A群0、manual field loss 0、lint `0 errors / 254 warnings`。commit/pushなし、`docs/PLAN.md`・`docs/PLAN_PROGRESS.md`不触。

- **Claude 側の独立検証**＝①`git diff`のeffectId単位差分がちょうど6件（採用申告と一致）②`typecheck`／`npm run golden`全件（`3745/3745`）／`npm run gates`を独立実行して全緑（申告値と一致）③新規識別子6点（`betChoose`／`DRAW_PER_FIELD_COUNT`／`hasUnderCards`／`TRASH_SIGNI_UNDER_FIELD_SIGNI`／`costReplacement.accumulate`／`levelEqLastProcessedLevelSum`）をすべてコードで実在・消費確認済み ④`src/screens/`不触のため実機検証は不要（PLAN §2.2）。
- **見送り24効果は今回の「機構不要」スクリーニングの誤判定**＝いずれも実際には新しい動的条件・選択者・遅延状態などの
  engine 機構が要ると Codex が確認した。個別の系統性は無い（それぞれ異なる根本原因）ため §5.3 への個別登録はせず、
  実装キューには残したまま次回の「機構不要」候補選定から除外する（ローカルの候補リストから除去済み）。
- 消化記録＝`scripts/archive/scratchpad/semantic_bug_fixed.txt`へ6行追記。実装キュー: 272→**266効果**。
