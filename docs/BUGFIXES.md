# バグ修正記録 (BUGFIXES)

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
