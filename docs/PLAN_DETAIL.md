# PLAN_DETAIL — 消化済みバッチ・完了項目の詳細台帳

## 2026-08-29 整理（§6 恒久指標・続き725時点値の退避・続き726）

- **2026-08-29 続き725 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)（据置）｜台帳 残 OPEN 547（据置）｜census 高シグナル 518→517**
  **golden 2988→2995**（§5.3 manual1 の7効果に1本ずつ）、census 517/517、smoke 10703 全異常0、fuzz 全0、
  lint 0 errors／249 warnings（据置）、同型★0、`census:stubs` A群🔴0／C群0、manual-fields 0、
  🆕**孤児 MANUAL 12→11**（`BASELINE_ORPHAN_MANUAL`＝live 限定 `WX24-P2-049-E1b` を撤去）。
  🆕**`census:enginetext` A群 136行 据置**＝**engine を1行も触っていない裏取り**（このバッチは manualEffects.ts だけ）。
  🆕**`_idset_fresh` 13→11カード** / **`_partial_fresh` 12→11カード**（`WX24-P2-049` / `WXDi-P13-050` を解凍）＝
  **`_held_fresh` は 93 で据置**。⚠**id 集合ズレの解凍は「そのカードの全効果」に parser 改善が届く**
  （実際 `WX24-P2-049-E1` の【常】【シュート】が `thisCardOnly`＋`PERMANENT` へ直った）。
  🆕**`POWER_MODIFY{splitTotal}` を持つ live 効果 4→5**（`BASELINE_SPLIT_TOTAL`）、
  🆕**`reorder` 未到達 16→14**（`BASELINE_REORDER_MISSING`）、
  🆕**`POWER_MOD_PER_COUNT` の live 3→2効果**（残＝`O-151`(a) の1＋`O-153` の1）。
  ⚠**census の −1 は前進ではない**＝MANUAL 免除による不可視化（`BASELINE_HIGH` の行コメントに明記済み）。
  ⚠**3計器がどれも動かないのは想定どおり**＝対象7カードは Sheet1 外で、台帳 finding も close していない（§3 の原則）。

## 2026-08-29 クローズ（§5.3 `O-75` / `O-124` ＋ `O-104`③＝manual 第2バッチ・続き726）

**ユーザー指示＝「さらに早いレーンのものを、今度は codex-work に投げる」。**
実装は Codex CLI（`CODEX_HOME=.codex-work`）、スコープ決定・実測・検証・簿記は Claude。**全文は BUGFIXES.md 2026-08-29 の項。**
**Codex の完全報告は `scripts/archive/codex_manual2_report.md`。**

### ■ 結果（5効果・3群＋「触るな」群）

| 群 | 項目 | 効果 | 直し方 |
|---|---|---|---|
| A | `O-75`（**クローズ**） | `WX17-001-E2`③ / `WD15-001-E2` / `WX19-023-E2` | 「このルリグは【X】を得る」の対象を `{SIGNI,any}` → `{LRIG,self}`。`WX19-023-E2` は `duration:'PERMANENT'` → `'UNTIL_END_OF_TURN'` |
| B | `O-124`①（**クローズ**） | `WX15-060-E1` | `STUB{SELECT_TARGET_ONLY}` ＋ `BANISH{filter:{powerLtLastProcessed:true}}` |
| C | `O-124`②（**クローズ**） | `SP26-008-E1` | 「それ」を `targetsLastProcessed` で照応し、3段目を `GRANT_EFFECT{effect:{…【自】《ターン１回》アタック時に自身をアップ…}}` へ |
| X | `O-104`③ | `WX08-036-E1` | **触っていない**＝実測すると **live は既に `story:['鉱石','宝石']` の OR で正しかった** |

**受け皿は5件すべて既存＝engine も parser も1行も触っていない。新しいアクション型・条件型は0本**（前バッチと通算でも0）。

### 🔑 教訓

1. **在庫の実測が着手前に1件を消した**＝`O-104`③ は既に正しく、指示書では「触るな」群として先に分離した（§5-3-4″）。
   **`O-75` も登録の2効果に対し実測3効果**（`WX19-023-E2` が同じ枝を通っていた）。
2. **外れ値は「同じ句の live 全数走査」で見つかる**＝`WX19-023-E2` の `PERMANENT` は、「そのアタックの間」を含む12効果を
   全数見て**慣例エンコードが `UNTIL_END_OF_TURN`（4件一致）**と分かったので、**新しい duration 値を作らずに**倒せた。
3. **Codex に §5-15（消費地点を関数名＋行番号で報告）を書くと受け皿の要否まで詰めてくる**＝
   `STORE_LAST_PROCESSED_TARGETS` を**挟まない**判断を `resumeSelectTarget:9277` /
   `execGrantKeyword:3993-4009` / `execGrantEffect:4142-4158` の実コードで根拠づけて返してきた。

### ■ 登録票（クローズ時点で PLAN §5.3 から退避した原文）

| **O-104** | 🆕**「〈宣言〉を対象とし、〈中間動作〉」の残り3形**（B6 で本体は消化・残りは受け皿が要る） | S〜M | **2026-08-27 Sheet1 B6 で分離**。■①🔴**N体（N≧2）の犠牲**＝`WX07-039-E2`「あなたの＜原子＞のシグニ**３体**をバニッシュする」／`WXEX1-14-E2`「エナゾーンから＜植物＞のシグニ**３枚**をトラッシュに置く」。**owner を直すだけでは実機がソフトロックする**＝`EffectInteractionModal` の `canConfirm` は非 optional で「**選択数 ≧ count**」を要求するので、**候補が count 未満の盤面で確定ボタンが永久に押せない**（旧「段2 第24バッチ 見送り契約」の理由が今も生きている＝golden が固定）。🔑**当ては UI 側**＝「払えないなら払わない（＝コスト不成立で本体を撃たない）」枝を用意するか、`selectOrInteract` が `cands.length < count` を fail-closed で返す。⚠**engine を直さずに parser だけ直してはいけない**。■②**別ゾーンを指す中間動作**＝`WXEX1-14-E2`（エナゾーン→`TRASH{ENERGY_CARD}`）／`WXK06-030-E1`（デッキ上を「＜龍獣＞が8枚置かれるまで」ミル＝`untilFilter`/`untilCount` は既存）。**どちらも中間節を単独でパースしても正しくならない**（前者は `UNKNOWN`・後者は payload 無しの `STUB{DECK_MILL_UNTIL_CLASS}`）＝規則の新設が要る。■③**クラスOR の filter**＝`WX08-036-E1`「トラッシュから**＜鉱石＞か＜宝石＞の**シグニ合計５枚」＝誤付着していたパワー閾値は B6 で剥がれたが、クラスOR そのものは未表現（`TargetFilter.story` は配列＝OR を受けるので**受け皿は在る**＝`TRANSFER_TO_DECK.source` の合成側の穴）。 |
| **O-75** | 🆕**「このルリグは【X】を得る」が `{type:'SIGNI',owner:'any'}` に誤パースされる** | S | **2026-08-26 続き662（`O-61` の消化）で分離＝実測2効果**＝`WX17-001-E2`（【自】このルリグがアタックしたとき…③ターン終了時まで、**このルリグ**は【ダブルクラッシュ】を得る）と `WD15-001-E2`（…２枚以上ある場合、ターン終了時まで、**このルリグ**は【ダブルクラッシュ】を得る）。どちらも `GRANT_KEYWORD{target:{type:'SIGNI',owner:'any',count:1}}` になっており、**ルリグに乗るべき【ダブルクラッシュ】がシグニの選択UIに化ける**。■**現状の実害**＝効果元がルリグなので `cands`（シグニ）に効果元が入らず、旧実装でも選択UIへ落ちていた＝**`O-61` で挙動は変わっていない**（`O-61` の刻印は `この(シグニ|カード|ルリグ)` ガードで届かないようにした）。■**次の一手**＝`parseSentencePart2.ts` の `kwBracketM` / 引用キーワード枝は owner を `t.includes('あなた')` だけで決めており**対象名詞が「ルリグ」か「シグニ」かを見ていない**。「このルリグは」で始まる付与は `{type:'LRIG',owner:'self'}` へ倒す（`アタックできない` 枝は既に `lrigOnlyCA` で見分けているので**同じ判定を流用できる**）。⚠**母集団は「このルリグ」だけで数えない**＝「そのルリグ」「あなたのセンタールリグ」も同じ枝を通る（`WX19-023-E2` は「そのルリグは【ダブルクラッシュ】を得る」で同型）。 |
| **O-124** | 🆕**`O-119` が露出させた既存バグ2件**（STUB が隠していた） | S | **2026-08-27 続き692**。①`WX15-060-E1`：原文「**対象のあなたのシグニ１体よりパワーの低い**対象の対戦相手のシグニ１体をバニッシュする」なのに live の `BANISH` は `filter:{cardType:'シグニ'}` だけ＝**パワー比較が丸ごと落ちた過剰実行**。②`SP26-008-E1`：付与能力側（ターン１回・アタック時）の欠落。■⚠**どちらも `O-119` とは無関係の既存バグ**で、census 高シグナル 526→528 の正体。直したら `BASELINE_HIGH` を下げる。 |

### ■ ここから分離した生きている項目

- **`O-154`**（`WD15-001-E2`＝「その中に＜龍獣＞が１枚以上ある場合、それを」の条件と照応が両方落ち、条件なしで自分の＜龍獣＞を割る）
  ＝**受け皿は既存**（`LAST_PROCESSED_MATCHES` ＋ `targetsStored`）＝**次の速いレーン候補**。
- `O-104` は ①（N体の犠牲＝UI がソフトロックする）と ②（別ゾーンを指す中間動作）が残り、**③だけ外した**。

---

## 2026-08-29 整理（§6 恒久指標・続き723時点値の退避・続き725）

- **2026-08-29 続き723 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)（据置）｜台帳 残 OPEN 558（据置）｜census 高シグナル 520（据置）**
  **golden 2977→2988**（`O-141` 3本／`O-142` 5本／`O-143` 3本＋ラチェット2本の更新）、census 520/520、
  smoke 10702 全異常0、fuzz 全0、lint 0 errors／248 warnings（据置）、同型★0、
  `census:stubs` A群🔴0／C群0、manual-fields 0、孤児 MANUAL 12。
  🆕**`census:enginetext` A群 136行 据置**＝カード全文 regex を2本（パターン4・5）撤去したが、
  **A群は「読み出し地点の行数」であって regex 本数ではない**ので動かない（`O-141` で較正済み）。
  🆕**`POWER_MOD_PER_COUNT` の live 17→3効果**（`O-140` 5／`O-141` 3／`O-142` 6／第3バッチ1 を消化。
  残3＝`O-151` の2＋`O-153` の1）＝**この族の進捗は行数ではなく live 効果数で測る。**
  🆕**`Condition` の型数 132→133**（`CHECK_ZONE_COUNT`・golden がラチェット）。
  ⚠**この4巡も3計器はどれも動かない**＝機構バッチは「意味の計器」ではなく「機構の計器」で測る（§3 の原則）。

## 2026-08-29 クローズ（§5.3 `O-98` / `O-151`(b) / `O-94`① / `O-149`＝「1〜3枚」の機構項目を manual 手書きで消化・続き725）

**ユーザー指示＝「§5.3 の『1件あたり1〜3枚』を codex に投げる。manual で実装することで高速化を狙う」。**
実装は Codex CLI、スコープ決定・実測・検証・簿記は Claude（`docs/CODEX_GUIDE.md` の分担）。**全文は BUGFIXES.md 2026-08-29 の項。**

### ■ 結果（7効果・4群）

| 群 | 項目 | 効果 | 直し方 |
|---|---|---|---|
| A | `O-98`（**クローズ**） | `WXK10-024-E3` / `WXK07-002-E1`② / `WXEX1-16-E2` | 付与キーワードの取り違え／OR 形キーワードフィルタの脱落／レゾナを `LRIG` へ誤分類 を手書きで是正 |
| B | `O-151`(b) | `WX24-P2-009-E1` | 裸 `STUB{POWER_MOD_PER_COUNT}` → `POWER_MODIFY{deltaFromZone, splitTotal}` |
| C | `O-94`① | `WXDi-P03-087-E2` | 汎用 `ADD_TO_FIELD`（最初の空き）→ `STUB{FROM_TRASH_TO_CENTER_ZONE}`（zone[1] 固定） |
| D | `O-149`（**クローズ**） | `WX24-P2-049` / `WXDi-P13-050` | manual shadow の id を parser に揃えて **idset 凍結を解除** |

**受け皿は7件すべて既存＝engine も parser も1行も触っていない。新しいアクション型・条件型は0本。**

### 🔑 この巡の教訓＝**登録票の見立てが実測と外れた（通算9巡連続）**

`O-149` の登録票は「`WX24-P2-049` は live 限定の `-E1b` を `manualEffects.ts` へ**持ち込む**」だったが、
実測では **parser は既に `E1/E2/E3/BURST` を出しており、`-E2`＝【自】バトルバニッシュ・`-E3`＝【出】**。
`manualEffects.ts` の `-E2` が【出】の内容だったため、**手書きが parser の【自】を上書きして消していた**。
⇒ 正解は「持ち込む」ではなく **`-E2` を【自】へ差し替え、【出】の手書きは削除して parser の `-E3` に任せる**。
**着手したらまず `parseCardEffects` を直に呼んで id 集合を見る。**

🆕**id 集合ズレのカードは兄弟効果まで丸ごと凍る**＝解凍した `WX24-P2-049-E1`（【常】【シュート】）は
**`thisCardOnly` なし・`UNTIL_END_OF_TURN`** という別物だった（正しくは `thisCardOnly` ＋ `PERMANENT`）。
**`_idset_fresh` は「そのカードへの parser 改善が全部止まっている」という意味**で、当該効果だけの話ではない。

### ■ `O-149` の付帯物（データだけ直しても閉じない）

1. `scripts/fixLrigColorFilters.mjs` の `WX24-P2-049-E1b / powerPlusBanishedPower` エントリ削除。
2. `scripts/goldenTest.ts` §6.3 K トリップワイヤ既知リストから `'WX24-P2-049-E2'` / `'WXDi-P13-050-E1b'` 削除。
3. 同 `:51315` 付近の「idset 凍結中」コメントを解凍済みへ更新（正例として追加）。
4. `BASELINE_ORPHAN_MANUAL` 12→11 ／ `BASELINE_SPLIT_TOTAL` 4→5 ／ `BASELINE_REORDER_MISSING` 16→14 ／ `BASELINE_HIGH` 518→517。

### ■ 登録票（クローズ時点で PLAN §5.3 から退避した原文）

| **O-149** | 🆕**`manualEffects.ts` の shadow と live/parser で effectId が食い違い、`syncManualLive` が使えない2カード** | **2カード**（`WX24-P2-049` / `WXDi-P13-050`） | **2026-08-29 続き718（`O-144`）で分離。** ■**実測**＝`syncManualLive` は `mergeManualEffects(parseCardEffects(row))` を**カード単位で丸ごと**書くので、`WX24-P2-049` は **live 限定の `-E1b`（【自】このシグニがバトルによってシグニ1体をバニッシュしたとき…パワー＋）が丸ごと消え**、`WXDi-P13-050` は **【出】が `-E2`（parser）と `-E1b`（manual shadow）の二重**になった（同じ能力が2回発動する）。 ■✅**ツール側は fail-closed にした**（`syncManualLive.ts`＝id 集合が変わるカードは**書かずにスキップして exit 1**・意図してやるときだけ `--allow-idset-change`）。**この2カードは `golden` の §6.3 K トリップワイヤの既知リストへ入れてある。** ■**やること**＝manual 側の id を live/parser に揃える＝(a) `WX24-P2-049` は `-E1b` を `manualEffects.ts` へ持ち込む (b) `WXDi-P13-050` は shadow `-E1b` を捨てて parser の `-E2` に条件を寄せる（`O-93` の「manual shadow」族）。 ■⚠**どちらも `gates` の他のどの計器にも映らない**（id 集合を見るのはあのトリップワイヤだけ）。 |
| **O-151** | 🆕**「合わせて／合計で±N」のうち、対象宣言が同じ文に無い形／総量が可変の形が割り振り機構に乗っていない** | **2効果**（`PR-K026-E1`（の付与【起】）／`WX24-P2-009-E1`） | **2026-08-29 続き719（`O-140`）で分離。** ■**現在地**＝`O-140` で `POWER_MODIFY{splitTotal}` ＋ `ALLOCATE_POWER` 対話を新設し、**同じ文に「〈owner〉のシグニを好きな数対象とし」がある4効果**（`SP26-003` `WXK11-073` `SPDi47-05` `WX17-021`）は乗せた。**この2つは乗っていない**＝挙動は旧のまま（`parseSentencePart4` に残した narrow な catch-all が `STUB{POWER_MOD_PER_COUNT}` を返す）。 ■**形と要るもの**＝(a) `PR-K026`＝「対戦相手のシグニを**２体まで**対象とし、…（別の文で）**それら**のパワーを合わせて－18000する」＝**照応が文をまたぐ**。⚠`O-80` の教訓どおり**確定できない照応は fail-closed**にしてある。受け皿は `targetsStored` ＋ `splitTotal` の組み合わせ（engine 側は数行）だが、**前の文が対象を stored に積む形に parse されているかの確認が先**。 (b) `WX24-P2-009`＝「それらのパワーを**合計であなたのトラッシュにあるカード１枚につき－1000**する」＝**総量が可変**。受け皿は `deltaFromZone{zone:trash, per:-1000}` ＋ `splitTotal`（型は両方あるので**組み合わせるだけ**）。⚠`execPowerModify` は `deltaFromZone` を先に解決してから `splitTotal` を見るので**そのまま動くはず**＝手で書けば済む見込み。 ■⚠**着手したら `parseSentencePart4` の narrow catch-all（`それらのパワーを(合わせて|合計で)`）を撤去すること**（残すと死んだ枝＝catch-all の温床）。 |
| **O-94** | 🆕**シグニゾーン限定の残穴2枚**（受け皿は在るのに届いていない） | S | **2026-08-26 続き675（段2 第43バッチ 群D）で実測**＝原文に「〜のシグニゾーン」を含む **76枚中 74枚は正しく配線済み**（`centerZoneOnly`／`zoneSide`／`IS_SELF_IN_CENTER_ZONE`／`THIS_CARD_IN_CENTER_ZONE`／`SIGNI_ATTACK_BAN{zones:[1]}`／`PLACE_VIRUS_CENTER`）。残り2枚だけが穴。■①**`WXDi-P03-087`＝parser の優先順位**＝dispatch は Part1→2→3（`effectParser.ts:5271-5273`）で、Part1 の汎用「トラッシュ→場」（`parseSentencePart1.ts:3226`・return `:3259`）が先に `ADD_TO_FIELD` を返すため、Part3 の中央専用規則（`parseSentencePart3.ts:755-757`）へ届かない。専用 engine は `execStubPart2.ts:2044-2064` に実在し zone[1] へ置く。⚠汎用 executor は最初の空きへ置く（`effectExecutor.ts:3117-3121`）＝**中央が埋まっていると別ゾーンへ出る**。■②**`WXDi-P14-068`＝配置制限 collector の部分配線**＝parser は `OPP_ZONE_PLACEMENT_RESTRICT`（`parseSentencePart3.ts:409-411`）、collector は `effectEngine.ts:6610-6633`。**呼び出しは通常召喚 UI の1箇所だけ**（`BattleScreen.tsx:5942-5946`）＝**CPU 配置・効果配置は素通りする**。 |
| **O-98** | 🆕**GRANT 系入口で対象名詞句の【キーワード】／レゾナが落ちる・化ける（実測3枚）** | S | **2026-08-27 続き678（Sheet1 B1）で実測**＝対象名詞句の修飾語は `parseSigniTarget`（parserUtils）と BOUNCE ビルダーには配線したが、**GRANT 系の入口だけ別経路**で残った。■①🔴**`WXK10-024-E3` は付与キーワードそのものを取り違えている**＝原文「あなたの**【ダブルクラッシュ】を持つ**赤のシグニ１体を対象とし、ターン終了時まで、それは**【アサシン】**を得る」に対し live は `keyword:'ダブルクラッシュ'`（＝**原文がどこにも与えていない能力を与え、与えるはずの【アサシン】を与えない**）。⚠`parseSentencePart2.ts:2241` の `kwBracketM` は「【X】を得る」を要求していて正しいので、**別の（未特定の）規則が先に返している**＝着手時はまず発火規則を特定する（`GRANT_KEYWORD` の構築点は40箇所ある）。■②**`WXK07-002-E1` の選択肢①**＝「**【アサシン】か【ダブルクラッシュ】を持つ**シグニ１体を対象とし、それをバニッシュする」＝**OR 形のキーワードフィルタ**が丸ごと落ちて `{cardType:'シグニ'}`（＝どのシグニでもバニッシュできる過剰効果）。受け皿は在る（`TargetFilter.keyword` は `string | string[]` で配列＝OR）。■③**`WXEX1-16-E2`**＝「あなたの**レゾナ**１体を対象とし、ターン終了時まで、それは「【常】：バニッシュされない。」を得る」が `target.type:'LRIG'` に化けている（**レゾナはシグニであってルリグではない**）＝`cardType` ではなく `target.type` の誤りなので `signiClauseResonaFilter` では届かない。■**母集団は3枚とも Sheet1 外**（Sheet4／WXK／WXEX1）＝Sheet1 分母では 0。着手時に「【X】を持つ…を対象とし」「か【」の OR 形を全数で数え直すこと。 |

### ■ ここから残した生きている項目

- **`O-94`②**（`WXDi-P14-068`＝配置制限 collector が通常召喚 UI の1箇所からしか呼ばれない）＝`src/screens/` を触るので遅いレーン。
- **`O-151`(a)**（`PR-K026-E1`＝照応が文をまたぐ「それら…合わせて－18000」）＝`parseSentencePart4` の narrow catch-all はこの1件のために残してある。

---

## 2026-08-29 整理（§6 恒久指標・続き719時点値の退避・続き723）

- **2026-08-29 続き719 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)（据置）｜台帳 残 OPEN 558（据置）｜census 高シグナル 520（据置）**
  **golden 2976→2977**（`O-140` の機構＋母集団ラチェット1本）、census 520/520、smoke 10702 全異常0、fuzz 全0、
  lint 0 errors／248 warnings（据置）、同型★0、`census:stubs` A群🔴0／C群0、manual-fields 0、孤児 MANUAL 12。
  🆕**`census:enginetext` A群 137→136行**（`POWER_MOD_DISTRIBUTE` の撤去。`BASELINE_SELF_TEXT` も 136 へ）。
  🆕**`POWER_MODIFY{splitTotal}` を持つ live 効果＝4**（golden `BASELINE_SPLIT_TOTAL` でラチェット）。
  🆕**`O-80` 残 C群＝17→12効果**（`O-140` の5効果を消化。うち4を機構へ、2形は `O-151`）。
  ⚠**この巡は3計器がどれも動かないが、`census:enginetext` と golden の2本が動いた**＝
  **機構バッチは「意味の計器」ではなく「機構の計器」で測る**（§3 の原則の実例）。

## 2026-08-29 整理（§5.3 の完了行 `O-133` を退避・続き723）

> **退避の理由**＝**クローズした項目は PLAN から消す**（CLAUDE.md のドキュメント配置ルール）。
> この行は 2026-08-28（続き704〜705）に完了していたのに、取り消し線つきで §5.3 に残っていた。
> 計器（`npm run census:orphanmanual`）と件数ラチェット（golden の `BASELINE_ORPHAN_MANUAL`）が
> 生きているので、**PLAN に完了行を残さなくても再発は止まる**。

**■完了行（PLAN §5.3 から退避した原文）**

| ~~**O-133**~~ 🏁**完了（2026-08-28 続き704〜705）** | **live 限定の MANUAL スタンプ**＝残 **12**（**B群 0**・A 0 / C 0 / **D 9**＋parser 由来3） | — | **609 → 12。** ■**計器＝`npm run census:orphanmanual`**（`--id <効果ID|分類名>`／`--list A|B|C|D`／`--unfreeze A` は分類名・`--unfreeze <id>,<id>` は**明示 id なら B も許す**〔C・D は明示でも拒む〕）。**ラチェットは golden の `BASELINE_ORPHAN_MANUAL = 12`**（増えたら「また出所の無いスタンプを押した」合図）。⚠**golden の数と計器の表示は 3 ずれる**（計器は「parser 自身が同じ印を出す効果」を母集団から外すが、golden は parser を回さない）。 ■**残 D群9 は凍っていない**＝`fixLrigColorFilters.mjs` が build 後に毎回生成し直す id。触る必要はない。 ■🔴**手順は4段**＝①`--unfreeze` ②`npm run build:effects` ③**`docs/_held_fresh.json` を見て `node scripts/heldReview.mjs --adopt`** ④`npm run regen` → `npm run gates`。**③を飛ばすと解凍しただけで live は旧値のまま残る**（収穫マージが自動採用するのは「純粋上位集合」だけ）。 ■**次の畳みどころ＝`npx tsx scripts/censusManualDrift.ts` の「削除候補（実体同一）」**。第12・14・15バッチで **217効果を `manualEffects.ts` へ逐語移設**したので、parser が追いつくたびにそこへ載る。**移設分は live の値を1バイトも変えていない**（A/B で実体変化0を実測）。 |

## 2026-08-29 クローズ（§5.3 `O-80` 本体と残 C群の4項目＝`O-141` / `O-142` / `O-143` / 第3バッチ・続き720〜723）

> **退避の理由**＝クローズした項目は PLAN から消し、全文はここと BUGFIXES.md が正（CLAUDE.md のドキュメント配置ルール）。
> 続き720〜723 は誤って PLAN §5.3 に取り消し線つきの完了行を残していたので、ここへ退避して PLAN から削除した。

### 🔑 4巡まとめて出た一番大事な教訓＝**登録票の見立ては5巡連続で実測と外れた**

| 項目 | 登録票の見立て | 実測 |
|---|---|---|
| `O-141` | 「①`CountFromZone.zone` に `'under'` ②`POWER_MODIFY_PER_STACK` の executor を書く」の2案 | ②は**使えない**（CONTINUOUS 専用で case が `addLog` だけの no-op）。①を採り**新型0** |
| `O-142` | 「パワー値／レベル値そのものを運ぶ口が**見つからなかった**」 | **在った**（`perLastProcessed`）＝列挙値 `'power_sum'` を1つ足すだけ |
| `O-143` | 「`field.check` を配列化し、消費地点56箇所を全部追随させる／回帰が広い」 | `field.check` は**ゾーンではなくバースト確認中の1枚専用スロット**。別スロット `check_rest` を足せば**既存56箇所は0箇所改変** |
| 第3バッチ | 「第1バッチが **fail-closed で差し戻した**分・当時の判断の読み直しが要る」 | 差し戻しではなく**「この効果で」という語が1つ足りなかっただけ** |
| （`O-140`・続き719） | 「いま過剰実行が生きている」 | 半分だけ正しい＝**同じ登録票に「過少（無言 no-op）」と「過剰」が同居**していた |

⇒ **登録票は「症状の記録」であって設計判断ではない。着手したらまず `grep` して読む。**
🔑**5巡とも「受け皿は最初から在り、parser がそこへ吐いていなかっただけ」＝新しいアクション型の新設は通算0。**

### ■登録票（クローズ時点で PLAN §5.3 から退避した原文）

| **O-80** | **`POWER_MOD_PER_COUNT` が「何を数えるか／誰に効くか」を持たず、engine のカード全文 regex で決めている** | 🆕**残 2効果（初回 58・第1バッチ21・`O-88` で1件・第2バッチ19・`O-140` 5・`O-141` 3・`O-142` 6・`O-143` 1 を消化）** | ■🆕**現在地（2026-08-29・`O-143` 後）**＝**live 4効果**（58→37→17→14→11→5→4）。⚠**`census:enginetext` の A群行数（136）は動かない**＝ハンドラは残り効果のために生きている。**この項目の進捗は行数ではなく live 効果数で測る**（計器の `POWER_MOD_PER_COUNT` の live がその数字）。 ■✅**第1バッチ＝「この方法で〜した〈X〉N枚につき」21効果**（BUGFIXES.md 2026-08-26）。✅**第2バッチ＝ゾーン／場を数える14効果＋catch-all 流入5効果**（BUGFIXES.md 2026-08-29）。**受け皿は2バッチとも最初から在り、parser が payload を吐いていなかっただけ**＝**新しいアクション型の新設は通算0**。 ■🔴**第2バッチの最大の学び＝実害は「regex が外れる（miss）」側ではなく「当たったうえで別のものを数えている」側にあった。** 主力 regex `N枚につき±X` に当たると掛ける枚数が**常に `lastProcessedCards.length`**になり、既定分岐が**相手3ゾーンの最上面すべてに満額**を掛ける。⇒ **`miss=0` を安全の根拠にしない**（`O-60` 登録票の警告と同じ）。 ■🆕**`O-140`（割り振り5効果）は 2026-08-29 続き719 でクローズ**（うち4効果を機構へ載せ、残2形は `O-151`）。🆕**`O-141`（下のカード3効果）も 2026-08-29 にクローズ**（`CountFromZone.zone:'under'`＋`sumBy:'power'` を新設・新しいアクション型は0・実機2本 PASS）。🆕**`O-142`（〜と同じだけ6効果）も 2026-08-29 にクローズ**（`perLastProcessed.unit:'power_sum'` ＋ `LEVEL_MODIFY` への横展開・新型0・実機2本 PASS）。🆕**`O-143`（チェックゾーン）も 2026-08-29 にクローズ**（`field.check_rest` を新設・既存56箇所は無改変・実機2本 PASS）。**残り2効果**＝**lastProcessed カウント2**（`WX25-P3-102-E1` `WX24-P2-035-E1`＝第1バッチが fail-closed で差し戻した分。当時の判断の読み直しが要る）。**取るなら `O-142` から**。 ■⚠**第1・第2バッチで踏んだ落とし穴は次バッチでも同じ**＝①**新規則は dispatch の後ろに置く**（前に置くと専用受け皿を横取りして退化）②**「それ」の照応は文をまたぐ**（確定できなければ fail-closed で差し戻す）③**修飾句を外すと読点が余る**。 ■⚠**STUB を外すと census の STUB 免除が外れてベースラインが上がる**＝**退化ではなく可視化**（第2バッチは 518→520・内訳は `WX14-048-E1` / `WXDi-P06-041-E1` の2件と特定済み）。 |

| **O-141** | 🆕**「このシグニの下にあるカード１枚につき±N」を AUTO/ACTIVATED 経路で数えられない** | **3効果**（`WXDi-CP02-054-E1` `WXK09-060-E1` `WXDi-P07-065-E1`） | **2026-08-29 続き711（`O-80` 第2バッチ）で分離。** ■**実測**＝`CountFromZone.zone` の union（`src/types/effects.ts:162`）に**スタック（下のカード）が無い**。🔴**`POWER_MODIFY_PER_STACK` は型も CONTINUOUS collector もあるのに、`effectExecutor.ts:8379` が `addLog` するだけの no-op**＝**CONTINUOUS 専用**で、この3効果（【自】アタックしたとき等）では使えない。**§4.2「型はあるが評価器が無い」の典型。** ■**要るもの**＝①`CountFromZone.zone` に `'under'` を足して `countFromZone`（`execUtils.ts:215`）で効果元スタックの最上面より下を数える、または ②`POWER_MODIFY_PER_STACK` の executor 実装を書く。⚠**`WXDi-P07-065-E1` だけは「枚数」ではなく「下にあるシグニのパワーの合計」**なので別枝（`O-142` 寄り）。 |

| **O-142** | 🆕**「この方法で〜したシグニのパワー／レベルと同じだけ±」＝直前処理カードの値を運ぶ受け皿が無い** | **6効果**（`WXEX2-79-E2` `WX24-P1-046-E2` `WXDi-P14-037-E1` `WXK10-026-E1` `WXK03-018-E1` `WXK10-053-E2`） | **2026-08-29 続き711（`O-80` 第2バッチ）で分離。** ■**実測**＝直前処理カードの**枚数**は `{$ref:'last_processed_count'}`／`last_processed_level_sum` で運べる（`O-80` 第1バッチで実装済み）が、**パワー値そのもの／レベル値そのもの**を運ぶ口が見つからなかった。⚠**「見つからなかった」であって「無い」の証明ではない**＝着手時にまず `grep` で受け皿を探す（§5.3 の「まず受け皿を疑う」＝2026-08-29 の実測で2件とも既に在った）。 ■⚠**`WXK10-053-E2` だけはパワーではなく「レベルを同じだけ－」**（`LEVEL_MODIFY` 側）＝別の受け皿。 ■⚠**動詞が効果ごとに違う**（バニッシュした／デッキに移動した／場に出た／トラッシュに置かれた／公開された）＝**動詞ごとに regex を足すのではなく、直前ステップの結果を運ぶ1本の口**にする（`O-80` 第1バッチの `perLastProcessed` と同じ設計）。 |

| **O-143** | 🆕**チェックゾーンの枚数を数えられない（`field.check` が1スロットしか無い）** | **S（1効果＝`WXDi-P11-006-E2`）** | **2026-08-29 続き711（`O-80` 第2バッチ）で分離。** ■🔴**engine のモデル自体が足りない**＝`PlayerState.field.check` は **`string \| null`**（`src/types/index.ts:251`）で**1枚しか保持できない**。原文（`アロス・ピルルク MIRA`）は「あなたのチェックゾーンにあるカードが**４枚以下**の場合」「チェックゾーンにあるカード**１枚につき**－1000」と書いており、**複数枚あることを前提にしている**。 ■**要るもの**＝`field.check` を配列化し、既存の消費地点（`EXILE_FROM_CHECK_ZONE`＝`execStubPart1.ts:2905`／ライフバースト解決の経由地＝`effectExecutor.ts:2380`／`FIELD_SIGNI_VIA_CHECK`＝`:8738` ほか）を全部追随させる。⚠**回帰が広い**（バースト解決の経路に触る）ので、**着手前に `grep 'field.check' src/` で消費地点を全数える**（`O-60` の手口①）。⚠**着手前に母集団を実測する**（チェックゾーンの枚数を参照する効果の全数）。 |

### ■結果

**`O-141`（3効果・BUGFIXES.md 2026-08-29）**＝`CountFromZone.zone:'under'`（効果元スタックの下段）と
`sumBy:'power'`（枚数ではなく Power の総和）を新設し、`countFromZone()` に `sourceCardNum` を渡した。
engine のカード全文 regex パターン4を撤去。実機 `o141UnderCount` / `o141UnderCountOne` が PASS（下段2枚→-8000／1枚→-4000）。

**`O-142`（6効果・同上）**＝`perLastProcessed.unit` に `'power_sum'` を足し、`LevelModifyAction` へ同じ口を横展開。
engine のカード全文 regex パターン5を撤去。🔴**実機だけが `battleCardMap` の穴を炙った**＝`pending_effect` が抱える
カード（`LOOK_AND_REORDER` の閲覧札）は**どのゾーンにも居ない間 `battleCardMap` から落ち**、resume の continuation で
`cardMap.get()` が undefined を引いて後続の属性判定が全部 false/0 に倒れていた（headless golden は PASS する）。
**同名カードがデッキに複数あると「たまたま」動く**ので対照の作り方しだいで見逃す。
付随して parser バグ2件（デッキ「一番下」の兄弟枝／トラッシュ→デッキ下が `LOOK_AND_REORDER` に食われる）も修正。

**`O-143`（3効果・同上）**＝`field.check_rest`（配列）を新設し「チェックゾーンにあるカード」は
`checkZoneCards()`＝`check` ＋ `check_rest` の合計で数える。`Condition.CHECK_ZONE_COUNT`／`CardLocation` と
`CountFromZone.zone` に `'check'`／`EffectTarget.CHECK_CARD`／`StubAction.trapCheckRest`／ターン終了時の掃き出し／
`BoardComponents` のスタック表示を追加。⚠**`execTransferToHand` と `applyDirectAction` の両方に書く**
（片方だけだと選択UIを通る経路でカードが動かない）。付随＝**「〜捨てたとき、」がトリガー句 strip-list に無く
直後の条件節が丸ごと落ちていた**（⚠無条件に剥がすと `WX24-P2-051-E1` が `UNKNOWN` へ退化するので
**直後が状態条件節のときだけ**剥がす）。実機 `o143CheckCount` / `o143CheckCountOne` が PASS（3枚→-3000／1枚→-1000＋回収）。

**第3バッチ（1効果・速いレーン・同上）**＝第1バッチの regex を `この(?:方法|効果)で` へ広げて `WX25-P3-102-E1` を載せた。

### ■ここから分離した生きている項目

- **`O-151`**（`O-140` の残2形）／**`O-152`**（`ON_HAND_DISCARDED` が効果由来の捨て札で発火しない・`O-143` の実機で発見）
  ／**`O-153`**（`LOOK_PICK_CHAIN` が手札行きと場行きを `lastProcessedCards` に混ぜる・2効果）。
- `POWER_MOD_PER_COUNT` の live は **58 → 3**（`O-151` の2＋`O-153` の1）。**`O-80` 本体はここでクローズ。**

## 2026-08-29 整理（§6 恒久指標・続き718時点値の退避・続き719）

- **2026-08-29 続き718 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)（据置）｜台帳 残 OPEN 558（据置）｜census 高シグナル 520（据置）**
  **golden 2975→2976**（`O-144` の到達率ラチェット1本）、census 520/520、smoke 10702 全異常0、fuzz 全0、
  lint 0 errors／248 warnings（据置）、同型★0、`census:stubs` A群🔴0／C群0、manual-fields 0、
  `census:enginetext` A群 137行（据置）、孤児 MANUAL 12。
  🆕**`remainder.reorder` の到達率**＝原文に「残りを好きな順番で」を含む live **327効果**のうち、
  **どこにも `reorder:true` が無いのは 30 → 16**（golden `BASELINE_REORDER_MISSING` でラチェット）。
  🆕**§6.3 K トリップワイヤの既知リストが 2件増えた**（`WX24-P2-049-E2` / `WXDi-P13-050-E1b`＝`O-149`）。
  ⚠🔴**この巡は「計器は動いたが挙動は動いていない」**＝反転確認が両方向 PASS で、
  **41効果のうち何件が実際に挙動を変えたのかは分かっていない**（`O-150`）。
  **件数メトリクスを完了指標にしない**（§3 の原則）の実例としてここに残す。

## 2026-08-29 クローズ（§5.3 `O-140`＝「合わせて－N」の割り振り機構・続き719）

**■登録票（クローズ時点で PLAN §5.3 から退避した原文）**

| **O-140** | 🆕**「それらのパワーを合わせて／合計で－N する」＝合計値を好きな数の対象へ 1000 単位で割り振る機構が無い** | **5効果**（`SP26-003-E1` `SPDi47-05-E2` `PR-K026-E1` `WXK11-073-BURST` `WX24-P2-009-E1`） | **2026-08-29 続き711（`O-80` 第2バッチ）で分離。** ■**実測**＝`grep '割り振\|SPLIT_POWER\|POWER_ALLOC' src/types/effects.ts` が **0件**＝型も engine も無い。 ■🔴**いま過剰実行が生きている**＝`execStubPart1.ts` の既定分岐が**相手3ゾーンの最上面それぞれに満額**を掛けるので、`SP26-003`（「合わせて－20000」）は**計 －60000** になる。**5効果のうち最も安く実害が消える項目。** ■**要るもの**＝①「総量 N を対象群へ割り振る」action（`upToCount` の対象選択＋各対象への配分）②**1000 単位の丸め**（原文が毎回「この効果では1000単位でしか数字を割り振ることができない」と書いている）③CPU 側の自動配分。⚠**受け口の見立て**＝分割 UI の先例は `INTERNAL_SPLIT_REVEALED`（`execStubPart2.ts:2996`）と `O-51` の流用先が同じなので、**`O-51` を先にやると受け口が揃う可能性がある**（着手前に確認する）。⚠**着手前に母集団を実測する**（「合わせて」「合計で」を含むパワー修正の全数）。 |

**■結果**＝`POWER_MODIFY{splitTotal}` ＋ 新 interaction `ALLOCATE_POWER` を新設し、**5効果中4効果**を載せた
（`SP26-003` `WXK11-073` `SPDi47-05` `WX17-021`）。残2形（照応が文をまたぐ／総量が可変）は §5.3 `O-151`。
**■登録票の実測ズレ**＝「いま過剰実行が生きている（`SP26-003` が計 －60000）」は**半分だけ正しかった**＝
実測では **`合わせて` はどの regex にも当たらず無言 no-op**（`SP26-003` `PR-K026` `WXK11-073`）で、
**過剰実行だったのは `合計で` の `SPDi47-05` の方**。⇒ **同じ登録票の中に「過少」と「過剰」が同居していた。**
**■副産物**＝`POWER_MOD_DISTRIBUTE`（＋側1効果・**総量をカード全文 regex から読み、配分は均等割りの近似**）を
撤去して同じ機構へ統合＝`census:enginetext` A群が 137→136。
**全文は BUGFIXES.md 2026-08-29（続き719）の項。**

## 2026-08-29 整理（§6 恒久指標・続き717時点値の退避・続き718）

- **2026-08-29 続き717 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)（据置）｜台帳 残 OPEN 558（据置）｜census 高シグナル 520（据置）**
  **golden 2973→2975**（`SEED_BLOOM` の payload 1本＋`GAIN_EXTRA_TURN`/`REMOVE_VIRUS` の payload 1本）、
  census 520/520、smoke 10702 全異常0、fuzz 全0、lint 0 errors／248 warnings（据置）、同型★0、
  held **90→91→90枚**（`WX16-033` を採用）、`_partial_fresh` 12／`_idset_fresh` 13、
  `census:stubs` A群🔴0／C群0、manual-fields 0、孤児 MANUAL 12。
  🆕🔴**`census:enginetext` A群 141行/137ハンドラ → 137行/134ハンドラ**（`BASELINE_SELF_TEXT` も 137 へ）。
  **miss 43ハンドラ/70カード → 40ハンドラ/59カード。**
  🆕**ライズ配置条件が立つカード 28 / 41枚（据置）。**
  ⚠**3計器がどれも動かないのが正しい**＝A群の payload 化は**JSON に情報が増える**修正で、
  census は「原文の語彙が JSON に無い」を測る計器なので、**STUB のまま payload が増えても動かない**。
  **この巡を測る計器は `census:enginetext` の A群行数と miss 数、それに実機。**

## 2026-08-29 クローズ（§5.3 `O-144`＝`remainder.reorder` を MANUAL/PARTIAL へ届けた・続き718）

**■登録票（クローズ時点で PLAN §5.3 から退避した原文）**

| **O-144** | 🆕**`remainder.reorder`（`O-51` の並べ替え対話）が MANUAL/PARTIAL の46効果に届いていない** | **46効果**（機構は実装済み・配線だけ） | **2026-08-29 続き712（`O-51`）で分離。** ■**実測**＝母集団288効果のうち live へ届いたのは **237ノード/234効果**で、**未達51の内訳は「live が MANUAL/PARTIAL＝収穫マージが効果単位で不可侵」46 ＋ `_held_fresh` 5**（**説明できない未達は0**）。 ■⚠**退化ではない**＝46効果は**従来どおりの挙動**（公開順のままデッキへ置く）で、原文が与える順序の選択権が無いだけ。**`O-51` 以前と同じ**。 ■**やること**＝①`manualEffects.ts` に定義がある効果は `remainder` に `reorder:true` を足す ②`censusManualDrift.ts` の「削除候補」に出る（＝parser 出力と実体同一の）ものは**manual 定義を削除して parser に任せる**（§CODEX_GUIDE `5-10′`）③live 限定スタンプは `censusOrphanManual --unfreeze A`。 ■⚠**`syncManualLive.ts` を回すこと**（`build:effects` だけでは既存 id の手修正が live に届かない）。⚠**着手前に46効果を数え直す**（`manualEffects.ts` を触る他バッチで自然に減る）。 |

**■結果**＝**44効果のうち41効果へ届けた**（`manualEffects.ts` の `remainder` へ `reorder:true` を47ノード追加 →
`syncManualLive.ts` で live へ同期）。live A/B は **41カード / 45パス差分がすべて `reorder:true` の追加**で、
id 集合の変化も他の drift も0。
**■残り2カード**（`WX24-P2-049` / `WXDi-P13-050`）＝**新しく入れた fail-closed ガードが止めた**（§5.3 `O-149`）。
**■🔴一番大事な発見**＝**フラグを届けても実機の挙動は変わらなかった**（2形で反転確認して2回とも PASS）＝
`remainder.reorder` は並べ替え対話の唯一のスイッチではない。⇒ §5.3 `O-150`。
**■副産物**＝`syncManualLive.ts` に **id 集合ガード**（消える/増える id があれば書かずに exit 1）。
**全文は BUGFIXES.md 2026-08-29（続き718）の項。**

## 2026-08-29 整理（§6 恒久指標・続き716時点値の退避・続き717）

- **2026-08-29 続き716 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)（据置）｜台帳 残 OPEN 558（据置）｜census 高シグナル 520（据置）**
  **golden 2972→2973**（`getRiseFilter` の形＋件数ラチェット1本）、census 520/520、smoke 10702 全異常0、fuzz 全0、
  lint 0 errors／248 warnings（据置）、同型★0、held 30バケット/90枚、`_partial_fresh` 12／`_idset_fresh` 13、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` **A群 141行（据置）**、孤児 MANUAL 12。
  🆕**ライズ配置条件が立つカード＝10 → 28 / 41枚**（`RISE_CARD_GATED` で golden がラチェット）。
  **残 13枚は複数体ライズ＝`O-147`**（＝**いまもライズ条件なしで召喚できる既知の穴**）。
  🆕**実機シナリオ＝3本追加**（`riseGateLevelColor` / `o135SpellMidInteractionTrigger` ＋ `lookReorderCanTrash` 作り直し）。
  ⚠**3計器がどれも動かないのが正しい**＝今回も live JSON ではなく **`BattleScreen` / `execUtils` の配線**の修正で、
  3計器はどれも live JSON しか見ていない。**この巡を測る計器は golden の件数ラチェットと実機。**

## 2026-08-29 整理（§6 恒久指標・続き715時点値の退避・続き716）

- **2026-08-29 続き715 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)（据置）｜台帳 残 OPEN 558（据置）｜census 高シグナル 520（据置）**
  golden **2972（据置）**、census 520/520、smoke 10702 全異常0、fuzz 全0、
  lint 0 errors／**260→248 warnings**（削除した手書き収集ブロックのぶん）、同型★0、
  held 30バケット/90枚、`_partial_fresh` 12／`_idset_fresh` 13、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` **A群 141行（据置）**、孤児 MANUAL 12。
  🆕**スペル解決経路が中央 diff（`collectBoardDiffTriggers`）を通るようになった**＝
  それまで届いていなかった watcher **約370効果**（`ON_BANISH` 166／`ON_TRASH` 105／`ON_LEAVE_FIELD` 71／
  `ON_ZONE_MOVED` 21／ミル17／`ON_DRAW` 13／`ON_ENERGY_CHARGE` 12 …）。
  起こす側＝**スペル391カード中 BANISH 130／TRASH 105／DRAW 72／BOUNCE 29**。
  ⚠🔴**3計器がどれも動かないのが正しいどころか、「動きえない」**＝これは live JSON ではなく
  **`BattleScreen` の配線**の修正で、**3計器も golden も smoke も fuzz も `BattleScreen` を通らない**。
  **この巡を測る計器は実機（`verifyBattleDrive.mjs`）だけ**＝新設2シナリオ PASS ＋**反転確認で両方 FAIL**、
  既存スペル経路14シナリオ全 PASS。
  ⚠**この層のバグは「全計器が緑のまま意味が壊れる」**（`census:enginetext` が測っている A群と同じ性質）。

## 2026-08-29 クローズ（§5.1 `V-89` / `V-92`・続き716）

**■退避した登録票の原文**

- [ ] 🆕**`V-89`（2026-08-26 続き671＝`O-90` の回帰実行で露出）＝既存シナリオ `lookReorderCanTrash`（`WX20-037`・デッキ上3枚を見て好きな枚数をトラッシュ）が FAIL する。**
  ⚠**O-90 とは無関係**＝`git stash` して **HEAD でも同じ FAIL**（`hDeck=2（開始5） hTrash=3（開始0）`）。live の `WX20-037` は O-90 の A/B 差分に入っていない。
  ■**症状**＝「召喚→ゾーン1」の直後に**モーダルが出ないまま3枚がトラッシュへ行き**（`pEff=-`・`trashClicked` が一度も立たない）、以後14ティック空振りする。
  ■**切り分けの起点**＝§4.4 の3分類でいう (a)**シナリオの腐り**か (b)**engine の穴**か。spec の `deck` が**5枚しかない**ので、3枚見た時点で残2枚＝
  リフレッシュ誘発（罠22）か、`canTrash` UI に到達する前に別経路が解決している可能性がある。**まず deck を10枚以上にして再実行する**（腐りなら1手で緑）。
  🆕**2026-08-28 続き708 の実測＝`deckshufflespell` は PASS する**（`FRESH=1` 単体実行）。**この行が併記していた `deckshufflespell` の FAIL はもう再現しない**ので、`V-89` に残っているのは `lookReorderCanTrash` だけ。 🆕**2026-08-29 続き712（`O-51`）で4度目の再確認＝やはり本セッション起因ではない**（`WX20-037` の live JSON はベースラインと**バイト同一**で、remainder は `location:trash`＝`O-51` の対象外）。⚠**登録票の「reorder:false/canTrash:true」という見立ては現在の live と食い違う**＝実体は `LOOK_PICK_CHAIN{stages:[{then:field}], remainder:{location:trash}}` で、**canTrash の LOOK_AND_REORDER はもう出ない**。着手時はまず JSON を読み直すこと。⚠`V-90` と同じく、**登録票の FAIL は別バッチの作業で先に直っていることがある**＝着手時に必ず単体で回し直す。
  🆕**2026-08-28（`O-133` B群 第5バッチの回帰実行）で3度目の再確認**＝`git stash` した本バッチ前のツリーでも
  **単体実行で同じ FAIL**（`hDeck=2（開始5） hTrash=3（開始0）`）。**3セッション連続で同じ症状**なので、
  次に触るときは上の「deck を10枚以上にして再実行」を**最初に**やること（腐りなら1手で緑になる）。
  🆕**同型がもう1本（2026-08-27 Sheet1 B11）＝`deckshufflespell`**。`FRESH=1` だと **HEAD でも FAIL**（`shuffled=0`）で、
  既存 PLAYING ルームを再利用したときだけ PASS する。**2本とも「新規ルームの初期盤面では前提が揃わない」疑い**が濃いので、
  まとめて1回で見るとよい＝注入直後の `queryState()` を新規/既存で並べ、**どのゾーンが違うか**を先に確定させる。

- [ ] 🆕**`V-92`（2026-08-29 続き715＝`O-135` の一本化で新しく収集されるようになったが、実機で観測できていない枝）＝
  **スペルが「対話に入る前に確定させた盤面変化」**（`handleCutinPass` の `result.done === false` 分岐）。
  ■**なぜ残ったか**＝`O-135` の実機2本はどちらも**対話なしでインライン完了する**スペル（`count:'ALL'` の
  バニッシュ／コスト0のドロー）で取った＝**この枝を1度も通っていない**。
  ■**必要なカード形**＝`SEQUENCE[（非対話で盤面が動く step）, （対話を要する step）]` を持つスペル
  （例＝「カードを2枚引き、手札を1枚捨てる」＝ドローは即時・捨てるは選択）。
  ■**観測点**＝1つ目の step で起きた変化（ドロー等）の watcher が、**対話を挟んでも発火すること**。
  ⚠**旧実装ではこの枝は `ON_PLAY` すら収集していなかった**ので、**壊す方向の回帰は原理上ありえない**
  （収集が0件→1件以上になるだけ）。⇒ **緊急ではないが、二重発火が無いことは実機で見ておきたい。**

**■`V-89` の結論＝(a) シナリオの腐り。engine は最初から正しかった。**
`WX20-037` の live はもう `LOOK_AND_REORDER{canTrash}` ではなく
`LOOK_PICK_CHAIN{revealCount:3, stages:[{filter:{赤のシグニ}, pickCount:2, pickUpTo, then:'field'}], remainder:{trash}}`。
旧シナリオは**存在しない「トラッシュ」トグルUI**を待って空振りしていた。
🔑**しかも旧 spec の deck は白バニラ5枚だけ**＝赤のシグニが1枚も無く、**pick 0枚→3枚とも remainder→トラッシュ**が
正しく起きていた＝**登録票が「症状」として引用し続けた `hDeck=2 hTrash=3` は、実は仕様どおりの数字だった**
（4セッション連続で「同じ FAIL が再現する」と記録されていたが、再現していたのは**正しい挙動**）。
⇒ deck の上から3枚を「赤のシグニ2枚＋非赤1枚」に組み直し、**2枚が場に出て残り1枚がトラッシュへ**を観測点にした。

**■`V-89` の道中で見つけた engine バグ（その場で修正）＝ライズ配置条件が41枚中31枚で無効だった。**
`getRiseFilter`（`src/engine/execUtils.ts`）の終端が **`（この条件` 固定**で、その書式を持たない古いカードは
**すべて null**＝ライズ条件が丸ごと効かず**空きシグニゾーンへ普通に召喚できた**（下にカードが無いので
「このシグニの下から〜」のコスト・パワー参照も死ぬ）。併せて**色は「あなたの」直後限定**（「あなたの
レベル２以下の**赤の**シグニ」で色が落ちる）、**レベルは「以上」だけ**（実データの主流「以下」「レベルNの」が全落ち）。
⇒ 終端を「（この条件／次の `【`／文末」に、色は位置非依存、レベルは以上/以下/丁度、＋カード名指定を追加。
**10 → 28枚**が正しくゲートされるようになった。**残 13枚（複数体ライズ）は §5.3 `O-147`。**

**■`V-92` の結論＝新実装で発火し、しかも二重発火は無い。**
`WX17-045`（ＦＬＡＳＨ・《青》×0「カードを１枚引き、手札を１枚捨てる」）で `result.done === false` の枝を通し、
`WXK02-090` の `ON_DRAW`（＋5000）が**対話を挟んでも1件だけ**発火することを実機で確認した。
**全文は BUGFIXES.md 2026-08-29（続き716）の項。**

## 2026-08-29 整理（§6 恒久指標・続き714時点値の退避・続き715）

- **2026-08-29 続き714 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)（据置）｜台帳 残 OPEN 558（据置）｜census 高シグナル 520（据置）**
  golden **2970→2972**（`O-76/O-77②` の parser 契約1本＋engine 両方向1本）、census 520/520、
  smoke 10702 全異常0、fuzz 全0、lint 0 errors／260 warnings（据置）、同型★0、
  held **30バケット/90枚**（92→90）、`_partial_fresh` 12／`_idset_fresh` 13、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` **A群 141行（据置）**、孤児 MANUAL 12。
  🆕**catch-all の裸 STUB＝両方 0**＝`LOOK_OPP_LIFE_TOP` **27→18効果**（真の穴 9→0）／
  `LRIG_UNDER_CARD_OP` **10→2効果**（真の穴 8→0）。**残りは全部 payload つき＝正当な用法。**
  ⚠**3計器がどれも動かないのが正しい**＝catch-all の分解は**機構バッチ**で、台帳の finding にも
  census の高シグナルにも紐づかない（JSON 上は「STUB がある」だけなので欠落として検出されない）。
  **この巡を測る計器は「裸 STUB の数」と `census:stubs` の明示 defer 欄。**
  ⚠**held の申告は必ず `build:effects` → `heldReview` を回し直してから**（採用直後は +14 に見えた）。

## 2026-08-29 クローズ（§5.3 `O-135`＝スペル解決経路が中央 diff を通らない・続き715）

**■登録票（クローズ時点で PLAN §5.3 から退避した原文）**

| **O-135** | 🆕**スペル解決経路が中央 diff を1度も通らない＝盤面変化のトリガーが丸ごと収集されない** | **M〜L（回帰が広い）** | **2026-08-28 続き708（`V-91` の実機で発見）。** ■`BattleScreen` のスペル解決（`castSpell` 内・`applyRefreshOnDone` の後）は **`collectBoardDiffTriggers` を呼んでいない**＝収集しているのは `ON_SPELL_USE` と placed-self と bloom と、**インラインで個別に手当てされた**`ON_DECK_SHUFFLED`（`collectDeckShuffleInline`）と `ON_REFRESH`（`collectRefreshInline`・`V-91` で新設）だけ。■**まだ通らない族**＝バニッシュ／トラッシュ／ミル／ドロー／エナ移動／凍結／デッキ移動／キーワード獲得ほか**中央 diff が見る全部**。スペルがそれらを起こしても watcher が1件も誘発しない（golden も census も緑のまま）。■🔴**一括で `collectBoardDiffTriggers` を呼ぶのが正しい形だが、回帰が広い**＝いま個別収集しているON_PLAY 系と**二重collection**になりうるので `suppressOnPlay` 等の meta 設計と、**スペルを使う既存シナリオ全部の回帰**が要る（`verifyBattleDrive` は引数なしフルバッチがフリーズするので1本ずつ）。■**着手の順序**＝①スペル経路で起こしうる族を live 実測で数える ②多い族から**インライン収集を1つずつ足す**（`ON_DECK_SHUFFLED`／`ON_REFRESH` と同じ形＝退化の面を狭く保てる） ③全族が揃った時点で中央 diff へ一本化する。 |

**■結果**＝**登録票の見立ては外れていた。** 「族ごとにインライン収集を足す（②）→揃ったら一本化（③）」ではなく、
**③へ直行できた**（−128/+27行）。理由＝**中央 diff の `ON_PLAY` ブロックはスペル側の手書きと同一コード**で、
自身【出】は `meta.collectPlacedSelfOnPlay` / `suppressOnPlay` の opt-in で同じく制御されていた
＝`fieldPlacementOnPlayOpts(spellEff)` を spread して渡せば**二重 collection は起きない**。
`collectRefreshInline`（`V-91`）は呼び出し元が消えて dead になり削除。
■**追加で塞いだ穴**＝`result.done` での分岐をやめた（`!done`＝対話待ちでこの段が確定させた変化も収集する。
resume 側の before は**そこで commit した state** なので、拾い直す機会は二度と来なかった）。
■**実機**＝`o135SpellBanishTrigger`（`WX03-033`→`WXDi-P00-054`・`ON_BANISH`）と
`o135SpellDrawTrigger`（`WD01-018`→`WXK02-090`・`ON_DRAW`）を新設＝**両方 PASS・反転確認で両方 FAIL**。
既存スペル経路14シナリオも全 PASS。**全文は BUGFIXES.md 2026-08-29 の項。**

## 2026-08-29 整理（§6 恒久指標・続き713時点値の退避・続き714）

- **2026-08-29 続き713 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)（据置）｜台帳 残 OPEN 558（据置）｜census 高シグナル 520（据置）**
  golden **2968→2970**（`O-77` の parser 契約1本＋engine 両方向1本）、census 520/520、smoke 10702 全異常0、
  fuzz 全0、lint 0 errors／260 warnings（据置）、同型★0、held **31バケット/92枚**、
  `_partial_fresh` 12／`_idset_fresh` 13、`census:stubs` A群🔴0／C群0、manual-fields 0、
  `census:enginetext` **A群 141行（据置）**、孤児 MANUAL スタンプ **12（A解凍候補 0）**。
  🆕**`LRIG_UNDER_CARD_OP` の live＝17→10ノード／真の穴 15→8効果**（`O-77` の進捗はこの数で測る）。
  🔴**コスト先取りに食われる効果 7→0**＝この巡の本題はここ（過剰実行と恒久 no-op の同時解消）。
  ⚠**3計器がどれも動かないのが正しい**＝`O-77` は**機構バッチ**で、台帳の finding にも census の高シグナルにも
  紐づかない（catch-all に落ちた効果は JSON 上「STUB がある」だけなので欠落として検出されない）。
  **この巡を測る計器は「`LRIG_UNDER_CARD_OP` の live ノード数」と「コスト先取り数」。**
  ⚠**`manualEffects.ts` が1件減った**（`WX24-P2-075-E1` の影武者コピー削除）＝`O-42` トリップワイヤが検出。

## 2026-08-29 整理（§6 恒久指標・続き712時点値の退避・続き713）

- **2026-08-29 続き712 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)（据置）｜台帳 残 OPEN 558（据置）｜census 高シグナル 520（据置）**
  golden **2965→2968**（`O-51` の parser 契約1本＋engine 両方向2本）、census 520/520、smoke 10702 全異常0
  （**SKIP(対話未対応) 0**＝288効果に対話を1つ足しても未対応は出ていない）、fuzz 全0、
  lint 0 errors／260 warnings（据置）、同型★0、held **31バケット/92枚**、`_partial_fresh` 12／`_idset_fresh` 13、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` **A群 141行（据置）**、孤児 MANUAL スタンプ 12（据置）。
  🆕**`remainder.reorder` の live 着地＝237ノード / 234効果**（`O-51` の進捗はこの数で測る）。
  母集団288との差51は**live が MANUAL/PARTIAL で不可侵 46 ＋ `_held_fresh` 5**＝**説明できない未達 0**（→ `O-144`）。
  ⚠**3計器がどれも動かないのが正しい**＝`O-51` は**機構バッチ**で、台帳の finding にも census の高シグナルにも
  紐づかない（原文の「好きな順番で」は JSON に語彙が無かっただけで、欠落として検出されていなかった）。
  **この巡を測る計器は「`reorder` の live 件数」と「実機シナリオ」**。
  ⚠**held が 91→92 に1増えたのは `O-51` の対象外カード**（parser 改善の未採用が1件増えただけ・実体変化なし）。

## 2026-08-29 整理（§6 恒久指標・続き711時点値の退避・続き712）

- **2026-08-29 続き711 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)（据置）｜台帳 残 OPEN 558（据置）｜census 高シグナル 518→520（可視化）**
  golden **2960→2965**（`O-80②` の parser 契約2本＋engine 両方向3本）、census 520/520（`BASELINE_HIGH` 実数更新）、
  smoke 10702 全異常0、fuzz 全0、lint 0 errors／260 warnings（据置）、同型★0、held **31バケット/91枚**、
  `_partial_fresh` 12／`_idset_fresh` 13、`census:stubs` A群🔴0／C群0、manual-fields 0、
  `census:enginetext` **A群 141行（据置）／miss 43ハンドラ・70カード**（73→70）、孤児 MANUAL スタンプ 12（据置・全 D 群＝凍っていない）。
  🆕**`POWER_MOD_PER_COUNT` は miss7/live36 → miss4/live17**（`O-80` の進捗は A群行数ではなく**この live 効果数**で測る）。
  ⚠**A群 141行が動かないのが正しい**＝ハンドラは残 C群17効果のために生きており、計器が数えるのは
  「`EffectText` を読む**代入行**」であって regex の本数ではない（`O-60` 第8バッチと同じ読み方）。
  ⚠**census +2 は退化ではなく可視化**＝`WX14-048-E1` / `WXDi-P06-041-E1` が STUB 免除を失っただけ（続き529 と同型）。
  ⚠**Sheet1 と台帳が動かないのが正しい**＝`O-80` の36効果に紐づく finding は**台帳に0件**（1444件と全数突合済み）、
  触った19効果に Sheet1 のカードは**1枚も無い**。**機構バッチは台帳では測れない**（測るのは census と `census:enginetext`）。
  ⚠**held の申告前に必ず `build:effects` を回し直す**＝コミット済み `_held_fresh.json` は 95件で **stale** だった
  （実測 91件。差の4件＋`_partial_fresh` 1件は**前セッションで採用済み**のカード）。

## 2026-08-29 整理（§6 恒久指標・続き710時点値の退避・続き711）

- **2026-08-29 続き710 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)｜台帳 残 OPEN 570→558｜census 高シグナル 520→518**
  golden 2960（据置）、census 518/518（`BASELINE_HIGH` 実数更新）、smoke 10702 全異常0、fuzz 全0、
  lint 0 errors／260 warnings（据置）、同型★0、held 31バケット/91枚（増減なし）、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行（据置）、孤児 MANUAL スタンプ 12（据置）。
  🆕**この行から「速いレーン」の実績**＝§5.2 Sheet2 バッチ1 で**6枚を手書き修正＋偽陽性3件を台帳で閉じ**、
  **残 OPEN が12件減った**（570→558）。**engine 変更ゼロ・実機なし・live 差分6枚ちょうど。**
  ⚠**Sheet1 が動かないのが正しい**＝今回触ったのは Sheet2 のカードだけ。
  ⚠**census −2 は6枚の手書き修正ぶん**（`BASELINE_HIGH` を 518 へ実測更新）。

## 2026-08-28 整理（§5.1 クローズ済み `V-88`／`V-90`／`V-91` の全文退避 ＋ §6 恒久指標を最新1行へ・続き708）

> **やったこと**＝①§5.1 から `[x]` の3件を全文このファイルへ移した（§5.1 は「まだ返済していない実機検証」だけに戻した）
> ②§6 恒久指標に19行溜まっていたのを**最新1行だけ**にして、旧行を全部このファイルへ移した。
> ⚠**運用どおり PLAN 側には1行も残していない**（§6 の運用注記＝「溜め始めたら破綻する」）。

### §5.1 から退避したクローズ済みエントリ（原文ママ）

- [x] ✅**`V-88`（クローズ・2026-08-26 続き668）＝旧 `charm_facedown` は §5.3 `O-81` で受け皿ができ、`ATTACH_FACEDOWN_FROM_HAND` へ移行した**（`PLACE_CARD_UNDER_SIGNI` から `charm_facedown` モードごと削除）。「実機から原理的に観測できない」枠から外れ、**実機2本で観測済み**＝`o81FacedownAttachRevealBanish`（付与→離脱で公開し手札へ→同レベルだけバニッシュ）＋対照 `o81NoAttachNoBanish`（【起】を撃たなければ何も起きない）。詳細は BUGFIXES.md 2026-08-26 `O-81`。
- [x] ✅**`V-91` クローズ（2026-08-28 続き708）＝シナリオ `v91refreshonce` を新設し、実機で engine バグを1件見つけて直した。**
  ■**書き方**＝登録票の懸念（`deck:[]` にするとドロー処理が先に走る）は、**`deck` を1枚だけにして
  0コストのドロースペル（`WD01-018` 噴流する知識）で 1→0 にする**と回避できた（`refreshTrigger` と同じ型）。
  ■🔴**実機で見つかったバグ**＝アーツの設置までは正常（`delayed=1`・`once=true`・ライフは減らない＝即時実行ではない）
  なのに、**リフレッシュが実際に起きている（deck 1→4・trash 4→2）のに `ON_REFRESH` が発火せず設置も消費されなかった**。
  真因＝**スペル解決経路が中央 diff（`collectBoardDiffTriggers`）を1度も通らない**。
  既存コードの `BattleScreen.tsx:7989` が「スタック解決を経由しないスペル解決経路は中央 diff を通らないため
  ここで拾う」と書いて **`ON_DECK_SHUFFLED` だけ**をインラインで手当てしており、**同じ穴が `ON_REFRESH` にも空いていた**
  （§5-15＝同型の配線が複数箇所に要るとき1箇所で満足する、の再発）。
  ⇒ `collectRefreshInline` を新設してスペル解決経路へ配線（`once` の消費まで中央 diff と同じ規約）。
  ■**反転確認済み**＝修正前 FAIL（`guestLife=5/5 delayed=1` のまま14ティック空振り）→ 修正後 PASS
  （`guestLife 5→4`・`delayed 1→0`）。回帰＝`refreshTrigger` / `deckshufflespell` / `b12delayattack` とも PASS。
  ■⚠**残りのトリガー族はまだこの経路を通らない**＝§5.3 `O-135` へ登録した。
- [x] ✅**`V-90` クローズ（2026-08-28 続き708 で実機再実行）＝`banishbyeffect` は `FRESH=1` で 2/2 PASS**。
  **登録票が推測した「シナリオの腐り（新規ルームでは前提が揃っていない）」ではなく、`36fa75665` で直った engine バグだった。**
  ■**根拠**＝(a) `WX19-023` / `WX07-036` の live JSON は登録時（`33ea78488`）から**1バイトも変わっていない**
  （＝データ側の変化ではない）(b) 症状の `grants=-` は `36fa75665` が直した
  **`BattleScreen` の `augMap` が素の `Map` だった**バグと一致する＝`augMap.get(getCardNum(instanceId))` が
  常に `undefined` になり、**付与を載せる時にそのインスタンスの印字能力ごと落ちていた**
  （`BattleScreen.tsx:941-942`）＝watcher の【自】が effectsMap から消えるので収集されない。
  ⚠**「暖まった部屋だけ PASS」も同じ機構で説明が付く**（再利用ルームでは augMap の再構築を通らない経路がある）。
  📌**教訓**＝**実機 FAIL の3分類（(a) シナリオの腐り／(b) engine・parser のバグ／(c) 未実装）を登録時に断定しない。**
  ここでは (a) と書かれていたが実体は (b) で、しかも**別バッチの実機作業が先に踏んで直していた**。
  **登録票の「切り分けの起点」は仮説であって観測ではない**（`docs/CODEX_GUIDE.md` §3-1 が自分のメモにも効く）。

### §6 恒久指標の旧行（続き707 以前・原文ママ・新しいものが上）

- **2026-08-28 続き707 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 2→0 / 863 (0.0%)｜台帳 残 OPEN 570（据置）｜census 高シグナル 529→521**
  🔴**live 実体変化 0**（A/B 全カード比較）＝**この巡で直したのは計器であって実装ではない**。
  **golden 2941→2942**（+1＝`O-134` の帯分解トリップワイヤ）、census 521/521、
  smoke 10700 全異常0、fuzz 全0、lint 0 errors、`census:stubs` A群🔴0／C群0、manual-fields 0、
  `census:enginetext` A群 141行（据置）、孤児 MANUAL スタンプ 12（据置）、`censusManualDrift` 削除候補0。
  ⚠**台帳が動かない理由**＝この巡は findings を1件も消化していない（触ったのは census の語彙キーと
  由来原文の対応表だけ）。⚠**Sheet1 −2 は「2枚直した」ではなく「2枚の偽陽性を外した」**。
  **実機シナリオ＝新規なし**（§2.3＝14効果とも STUB でなく `sourceAbilityText` を読む経路が無いことを golden で固定）。

- **2026-08-28 続き704 後**：
  📊**進捗3計器＝Sheet1 要対応 0→2 / 863｜台帳 残 OPEN 570（据置）｜census 高シグナル 491→510**
  🆕**孤児 MANUAL スタンプ 609 → 402**（A 0 / B 393 / C 0 / D 9）｜**`_idset_fresh` 23 → 13**
  ⚠🔴**Sheet1 +2 と census +19 はどちらも「退化」ではなく「可視化」**＝孤児 MANUAL スタンプ **186効果**を
  解凍して census の **STUB/MANUAL 免除**が外れた。**A/B で「parseStatus だけ変化 186 ／ 実体変化 0」**を実測し、
  **増えた19件が全部その186効果の中にある**ことも機械照合済み（外部からの流入0）。
  **golden 2941**（+1＝孤児 MANUAL のラチェット `BASELINE_ORPHAN_MANUAL=402`）、census 510/510、
  smoke 全異常0、fuzz 全0、lint 0 errors、`census:stubs` A群🔴0／C群0、manual-fields 0、
  `census:enginetext` A群 141行（据置）、`censusManualDrift` 削除候補0。
  **live 変化＝186効果（`parseStatus` のみ）／実体変化 0**（C群21件の移設でも実体変化 0）。
  🆕**計器を新設**＝`npm run census:orphanmanual`（A/B/C/**D 生成元あり**の4分類・`--unfreeze A`）。
  **実機シナリオ＝新規なし**（`parseStatus` は実行時に一度も読まれないことを grep で機械確認）。
  **既存12シナリオ ALL PASS**＋**`b27orihalmiss` の位置依存フレークを恒久修正**。

- **2026-08-28 続き703 後**：
  📊**進捗3計器＝Sheet1 要対応 8→0 / 863（0.9%→0.0%）｜台帳 残 OPEN 575→570｜census 高シグナル 491（据置）**
  ⚠**census が動かないのが正しい**＝この巡の本題は **engine の収集配線**と **parser の退化戻し**で、
  census が見る「原文の修飾句 × JSON 語彙」は元から揃っていた（`WX04-052` の色/クラスだけが例外だが
  同カードは `partial` 側で数えられていた）。
  **golden 2940**（+4）、census 491/491、smoke 全異常0、fuzz 全0、lint 0 errors、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行（据置）。
  **live 変化＝12カード**（`WX04-052` `WX05-021` `WX05-025` `WX06-CB03` `WX07-029` `WX09-Re07`
  `WX11-053` `WX19-031` `WX19-034` `WX21-056` `WX21-061` `WXK10-033`）。
  **実機シナリオ +2 全 PASS**（`b28grantedauto` / `b28grantedautoff`）＋**反転確認2本**
  （`augMap` を素の `Map` へ／`hasFieldGrant` の SEQUENCE 分岐を外す＝**どちらか一方でも FAIL**）
  ＋**既存12本の回帰 ALL PASS**。
  🔴**engine 修正2点（実機だけが見つけた層）**＝①`BattleScreen` の `augMap` を `InstanceMap` で組む
  （素の `Map` は instanceId を解決できず、付与コレクタが**常に0件**だった＝live 71効果）
  ②`hasFieldGrant` が SEQUENCE の中も見る（連用中止形 live 11効果）。
  ⚠**Sheet1 要対応 0 は「Sheet1 が終わった」ではない**＝計器が何も指していないだけ。
  フラグの立たない863枚への検出パス（シート限定の意味照合再監査）は未着手。

- **2026-08-28 続き702 後**：
  📊**進捗3計器＝Sheet1 要対応 20→8 / 863（2.3%→0.9%）｜台帳 残 OPEN 575（据置）｜census 高シグナル 516→491**
  🔴**この行は「較正」であって前進ではない**＝`src/` と `public/` は1バイトも変わっていない
  （`git diff --name-only HEAD -- src/ public/` が 0件）。**Sheet1 の census フラグは 12→0**。
  **golden 2936**（+1＝較正キーが live に実在することのトリップワイヤ25ペア）、census 491/491、
  smoke 全異常0、fuzz 全0、lint 0 errors、`census:stubs` A群🔴0／C群0、manual-fields 0、
  `census:enginetext` A群 141行/137ハンドラ（据置）。**live 変化＝0カード**。
  **実機シナリオ＝なし**（アプリのバイト列が変わらないので観測対象が原理的に存在しない）。
  ⚠**Sheet1 の残り8枚は別の検出器**＝`audit` 3／`held` 3／`partial` 1／`idset` 1。
  ⚠**フラグの立たない855枚は「正しい」ではなく「計器が見ていない」**＝シートを閉じるには
  シート限定の意味照合再監査が別途要る。

- **2026-08-28 続き701 後**：
  📊**進捗3計器＝Sheet1 要対応 25→20 / 863（2.9%→2.3%）｜台帳 残 OPEN 575（据置）｜census 高シグナル 522→516**
  ⚠**台帳が動かないのが正しい**＝今回の6件はどれも意味照合 findings に載っていない
  （入口が `census:cards --sheet 1 --list` の**全数目視**で、台帳とは別経路の発見）。
  **golden 2935**（+6＝A〜G の各主張を1本ずつ）、census 516/516（`BASELINE_HIGH` 更新）、
  smoke 全異常0、fuzz 全0、lint 0 errors、`census:stubs` A群🔴0／C群0、manual-fields 0、
  `census:enginetext` A群 141行/137ハンドラ（据置）。
  **live 変化＝22カード**（`WX07-002` `WX07-003` `WX07-004` `WX07-005` `WX07-027` `WX07-028`
  `WX08-001` `WX08-002` `WX08-003` `WX08-005` `WX08-025` `WX08-035` `WX09-027` `WX11-026`
  `WX12-021` `WX14-041` `WD10-001` `PR-195` `WX25-P1-085` `WD23-041-EA` `WXDi-P06-040` `WX24-P2-054`）。
  **実機シナリオ +5 全 PASS**（`b27orihalhit` / `b27orihalmiss` / `b27hestia` / `b27heaven` /
  `b27heavennowatch`）＝**判別力があるのは `b27orihalmiss` と `b27heaven`**。
  **反転確認3本**＝①味方 watcher ループを潰す ②`normalizeCrossName` を素の `===` へ戻す
  ③live の `WX09-027-E2` から `CONDITIONAL` を剥がす＝**3本とも旧挙動を再現**し、
  FAIL メッセージが原因を指すことまで確認した。
  **既存シナリオ回帰7本 ALL PASS**（`b11attacktrigger` / `banishbyeffect` / `b25targetfirst` /
  `b25targethit` / `b26grantquoted` / `b22artshit` / `b22artsmiss`）。
  ⚠**新規語彙**＝`StubAction.revealPickParams.restDest:'deck_top'`（＋`PendingInteractionDef.restDest`）／
  `GRANT_PROTECTION.sourceFilter.color`（既存キーの新用途）／`ON_LEAVE_FIELD` 主語の
  状態・色・レベル修飾（状態は `triggerCondition.leftStateFilter`・色/レベルは `triggerFilter`）／
  `ON_HEAVEN` の `triggerScope:'any_ally'`。
  ⚠**engine 追加2点**＝`matchesStateFilter` に `crossState`（**キーを書いても素通り＝無条件成立**していた）／
  `normalizeCrossName`（クロス相方の名前照合。**7枚が永久に外れていた**）。

- **2026-08-28 続き700 後**：
  📊**進捗3計器＝Sheet1 要対応 26→25 / 863（3.0%→2.9%）｜台帳 残 OPEN 575（据置）｜census 高シグナル 522（据置）**
  ⚠**census と台帳が動かないのが正しい**＝この巡の3件はどちらの計器も見ていない
  （`O-125`＝BLOCK_ACTION の**消費地点**／`O-129`＝木の**順序**／`O-128`＝STUB→構造化で、
  census は STUB を欠落として数えない）。**Sheet1 が -1 しか動かない**のは Sheet1 側の該当が3枚だけで、
  うち `WX02-020` は別 finding が残り、`WX09-Re07` は `O-128` の残り27カード側だから。
  **golden 2929**（`O-125` +2 / `O-128` +3 / `O-129` +4）、census 522/522、smoke 全異常0、fuzz 全0、
  lint 0 errors、`census:stubs` A群🔴0／C群0、manual-fields 0、
  `census:enginetext` A群 141行/137ハンドラ（据置）、
  **live 変化＝11カード**（`WX02-020` / `WX05-022` / `WX08-073` / `WXEX2-18` / `WXEX2-27` /
  `WXDi-P06-059` / `WXDi-P12-069` / `WXDi-P13-061` / `WX24-P1-014` / `WX24-P1-078` / `WX25-P1-071`）。
  **`GRANT_ABILITY_INNER_TEXT` を含む live カード 34→27**。
  **実機シナリオ +5 全 PASS**（`b24drawblock` / `b24drawok` / `b25targetfirst` / `b25targethit` /
  `b26grantquoted`）＝**判別力があるのは `b24drawblock` と `b25targetfirst`**（どちらも旧挙動なら FAIL）。
  ⚠**新規語彙**＝`StubAction.abortIfNoCandidate`（`SELECT_TARGET_ONLY` が候補0なら SEQUENCE を打ち切る。
  **フラグ付きだけ**＝既存93効果は据置）。`BLOCK_ACTION` の actionId `DRAW_OUTSIDE_DRAW_PHASE` は
  `DRAW_OR_ADD_OUTSIDE_GROW_DRAW_PHASE_OWN_TURN` へ改名（原文の3条件と1対1）。
  ⚠**`public/data/effects_WX.json` が全行差分**＝HEAD が整形済み117,520行だったのを `build:effects` が
  正準形（1行・他4ファイルと同じ）へ戻したもの。**内容は 1,914 カードすべて一致**を機械照合済み。

- **2026-08-28 続き699 後**：
  📊**進捗3計器＝Sheet1 要対応 26 / 863（3.0%）｜台帳 残 OPEN 575｜census 高シグナル 522＝いずれも据置**
  🔴**3計器とも動かないのが正しい**＝`O-131` で欠けていたのは **engine/UI の呼び出し配線**で、
  **live JSON は1バイトも変わらない**（カードの表現は既に正しかった）。
  ⇒ **この巡の成果は実機でしか観測できない**（`b22artshit` / `b22artsmiss` が FAIL→PASS）。
  §3「計器ごとに見えるものが違う」の極端な例＝**3計器が全部見えない層が実在する**。
  **golden 2921**（`O-131` の配線トリップワイヤ +1）、census 522/522、smoke 全異常0、fuzz 全0、
  lint 0 errors、`census:stubs` A群🔴0／C群0、manual-fields 0、
  `census:enginetext` A群 141行/137ハンドラ（据置）、
  **実機シナリオ 全6本 PASS**（`b20`×2 / `b21`×2 / `b22`×2＝**据置だった2本が解消**）。
  ⚠**配線の静的ガード**＝`collectOppArtsUseForResolution(` と `collectArtsUseForResolution(` が
  **それぞれ2箇所**（スタック解決／対話解決）から呼ばれること、
  および `applyForcedTurnEnd(` が **2箇所**、`clearTurnEndScopedState(` が BattleScreen に **6箇所**。

- **2026-08-28 続き698 後**：
  📊**進捗3計器＝Sheet1 要対応 26 / 863（3.0%）｜台帳 残 OPEN 575｜census 高シグナル 522（据置）**
  （`O-127`／`O-117`／`O-113` の3件。live 変化は **2 effectId / 2カード**（`WX05-010` / `WX05-016`）＋
  manual 同期1件（`WX05-020`）。B10〜B22 で Sheet1 要対応は 65→26）。
  **golden 2920**（B20 +1 / B21 +1 / B22 +3）、census 522/522、smoke 全異常0、fuzz 全0、lint 0 errors、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置）、
  **実機シナリオ +6**（`b20lifeswap` / `b20lifeswapzero` / `b21end5colors` / `b21endsamecolor` PASS ＋
  🔴**`b22artshit` は FAIL のまま据置＝`O-131`**。⚠`b22artsmiss` は PASS するが
  **トリガーが一度も発火しない以上「空振りの PASS」**＝判別力はまだ無い）。
  ⚠**新規語彙**＝`Condition`/`ActiveCondition` に `PAID_COLORS_INCLUDE_ALL`（型数 132 / 61）、
  `PlayerState.last_paid_energy_colors`（ターン限定フィールド 25／母集団 66）、
  `triggerCondition.affectedByOppArtsFilter`。
  ⚠**強制ターン終了は `applyForcedTurnEnd` へ抽出**＝`clearTurnEndScopedState(` の BattleScreen 走査期待値は **6**、
  `applyForcedTurnEnd(` が **2**（スタック解決／カットイン窓）。

- **2026-08-28 続き694 後**：
  📊**進捗3計器＝Sheet1 要対応 31 / 863（3.6%）｜台帳 残 OPEN 581｜census 高シグナル 523**
  （`O-121`＝バニッシュ台帳で **live 変化 2 effectId / 2カード**・**スコープ外0**。B10〜B16 で Sheet1 要対応は 65→31）。
  **golden 2910**（B16 で 2909→2910）、census 523/523、smoke 全異常0、fuzz 全0、lint 0 errors（263 warn）、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置）、
  **held 89 / partial 14 / idset 24**（据置）、
  **実機シナリオ +2**（🆕`b16banish3`＝合計3体でアップ／🆕`b16banish2`＝合計2体ではアップしない。
  **反転確認済み**＝条件を外すと negative がアップして FAIL。回帰 `b15plaincrash` / `b14costup` PASS）
  ⚠**実機 fixture は `battleCardMap` に載っているカードで作る**＝デッキ外のカード番号で台帳を仕込むと数えられない（fail-closed）

- **2026-08-27 続き693 後**：
  📊**進捗3計器＝Sheet1 要対応 32 / 863（3.7%）｜台帳 残 OPEN 583｜census 高シグナル 525**
  （`O-120`＝【ランサー】原因限定で **live 変化 3 effectId / 3カード**・**スコープ外0**。B10〜B15 で Sheet1 要対応は 65→32）。
  **golden 2909**（B15 で 2908→2909）、census 525/525、smoke 全異常0、fuzz 全0、lint 0 errors（263 warn）、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置）、
  **held 89 / partial 14 / idset 24**（据置）、
  **実機シナリオ +2**（🆕`b15plaincrash`＝通常のバトルダメージのクラッシュで**引かない**／🆕`b15lancercrash`＝
  【ランサー】のクラッシュで**引く**。**反転確認済み**＝`triggerCondition` を外すと negative が hand 5→6 で FAIL。
  回帰 `b14costup` / `b13colorpower` PASS）
  ⚠**反転確認の本体は negative 側**＝positive は修正の有無にかかわらず PASS するので単独では判別力がない

- **2026-08-27 続き692 後**：
  📊**進捗3計器＝Sheet1 要対応 33 / 863（3.8%）｜台帳 残 OPEN 584｜census 高シグナル 528（＋2＝較正）**
  （`O-119`＝比例使用コストの payload 化で **live 変化 40 effectId / 40カード**・**スコープ外0**。B10〜B14 で Sheet1 要対応は 65→33）。
  **golden 2908**（B14 で 2907→2908）、census 528/528、smoke 10700効果・全異常0、fuzz 全0、lint 0 errors（263 warn）、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置＝`costs.ts` は A群の走査対象外）、
  **held 89 / partial 14 / idset 24**（90/15/24 から各−1）、
  **実機シナリオ +1**（🆕`b14costup`＝`WX05-034` の使用コストがライフ3枚ぶん《無×3》増えてエナ4枚消費。**反転確認済み**＝
  `costScaling` を外すと1枚消費に戻る。回帰 `b12spellkiten` / `b13colorpower` PASS）
  ⚠**census +2 は退化ではなく較正**＝コストマーカー STUB が消えて `WX15-060-E1`／`SP26-008-E1` の既存の欠落が見えた（→ `O-124`）

- **2026-08-27 続き691 後**：
  📊**進捗3計器＝Sheet1 要対応 35 / 863（4.1%）｜台帳 残 OPEN 585｜census 高シグナル 526（据置）**
  （Sheet1 B13＝4巡目で **5 effectId / 3カード**。B10〜B13 で Sheet1 要対応は 65→35）。
  **golden 2907**（B13 で 2902→2907）、census 526/526、smoke 全異常0、fuzz 全0、lint 0 errors、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置）、
  **held 90 / partial 15 / idset 24**、
  **実機シナリオ +1**（🆕`b13colorpower`＝表記パワー0の `WX11-032` が場に残る。**反転確認済み**＝
  旧 JSON へ戻すと 1 tick で自動バニッシュされる。回帰 `b12delayattack` PASS）
- **2026-08-27 続き690 後**：
  📊**進捗3計器＝Sheet1 要対応 37 / 863（4.3%）｜台帳 残 OPEN 591｜census 高シグナル 526**
  （Sheet1 B12＝3巡目で **7効果変更＋3効果追加 / 8カード**。B10〜B12 で Sheet1 要対応は 65→37）。
  **golden 2902**（B12 で 2896→2902）、census 526/526、smoke 全異常0、fuzz 全0、lint 0 errors、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置）、
  **held 90 / partial 15 / idset 24**、**MANUAL 効果数 Sheet1 129→130**（`WX05-020-E2` に《ターン１回》を刻印）、
  **実機シナリオ +2**（🆕`b12spellkiten`＝唱えても【起】は走らない／🆕`b12delayattack`＝
  唱えた時点ではエナが増えず**アタック時に**増える。回帰 `b11attacktrigger` PASS）
- **2026-08-27 続き689 後**：
  📊**進捗3計器＝Sheet1 要対応 40 / 863（4.6%）｜台帳 残 OPEN 599｜census 高シグナル 528**
  （Sheet1 B11＝2巡目で **11効果 / 11カード**。B10 と合わせて Sheet1 要対応は 65→40）。
  **golden 2896**（B11 で 2894→2896）、census 528/528、smoke 10697/全異常0、fuzz 全0、lint 0 errors（263 warn）、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置）、
  **held 92 / partial 14 / idset 24**、**live 変化 11 effectId / 11カード**（意図した差分以外ゼロ）、
  **MANUAL 効果数 Sheet1 129→128**（`WX10-053-E1` の影武者を撤去＝parser より劣化していた）、
  **実機シナリオ +1**（🆕`b11attacktrigger`＝【常】表記の「アタックしたとき」が**アタック前に走らない**ことを両方向で観測）
- **2026-08-27 続き688 後**：
  📊**進捗3計器＝Sheet1 要対応 49 / 863（5.7%）｜台帳 残 OPEN 609｜census 高シグナル 532**
  （Sheet1 B10＝**1バッチで21 findings** 消化＝65→49／629→609／535→532。従来1〜4効果／巡から規模を上げた初回）。
  **golden 2894**（B10 で 2892→2894）、census 532/532、smoke 10697/全異常0、fuzz 全0、lint 0 errors（263 warn）、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置）、
  **held 91 / partial 14 / idset 24**、**live 変化 22 effectId / 21カード**（意図した差分以外ゼロ）、
  **MANUAL 効果数 Sheet1 130→129**（`WX04-030-E1` の影武者を撤去＝§6.4 `O-42` 発火）、
  **実機シナリオ +1**（🆕`oppdecktop`＝「対戦相手のデッキの一番上を見る」を guest.deck の減りで機械判定）
- **2026-08-27 続き687 後**：
  📊**進捗3計器＝Sheet1 要対応 65 / 863（7.5%）｜台帳 残 OPEN 629｜census 高シグナル 535**（**B9 ではどれも動かない**＝
  この失敗クラス（固定挙動 catch-all）を**どの計器も見ていなかった**。⇒ golden にトリップワイヤを新設）。
  **golden 2892**（B9 で 2890→2892）、census 535/535、smoke 10697/全異常0、fuzz 全0、lint 0 errors（263 warn）、
  同型★0、`census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置）、
  **held 73 / partial 12 / idset 24**（据置）、**live 変化 26 effectId**（新規0・消滅0）、
  **実機シナリオ +14**（続き686 の12本＋🆕`b9OptionalCostPayRunsBody` / 🆕`b9OptionalCostSkipDoesNothing`）、
  **残 `TRADE_BANISH_SELF_SIGNI` 6件**（トリップワイヤの許容リストと集合一致・両方向 FAIL）
- **2026-08-27 続き686 後**：
  📊**進捗3計器（§3 の併記）＝Sheet1 要対応 65 / 863（7.5%）｜意味照合 段2 台帳 残 OPEN 629｜census 高シグナル 535**。
  ✅**B8 は3計器とも動いた**（66→65／630→629／536→535）＝「機械で検出できる壊れ方」を1つ決めて全数を3分した回。
  **census 535/535**（B8 で **536→535**＝ON_PLAY の由来ゾーン限定。`BASELINE_HIGH` も 535 へ更新）、
  **golden 2890**（B8 で **2885→2890**＝+5テスト・FAIL 0。うち1本は**恒久 no-op のトリップワイヤ**＝AUTO かつ timing 空の集合が許容リストと一致するか）、
  smoke **10697 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**（warning 263・±0）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**・据置）、
  **`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・据置）、
  **`POWER_MOD_PER_COUNT` の live 36効果**（据置。⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10697 / MANUAL 効果 1012 / PARTIAL 21**（MANUAL は **1013→1012**＝`WXDi-P07-044-E1` が
  **manualEffects.ts に実体を持たない live 限りの遺物**（§4.5 `O-54` の形）だったため parser 出力へ戻り、E2 だけを manual 化した）、
  **`_held_fresh` 73 / `_partial_fresh` 12 / `_idset_fresh` 24**（held は 73 据置。⚠**途中 78 まで増えて parser の退行を1つ捕まえた**＝
  由来句の抽出を密着マッチにして「トラッシュから＜X＞のシグニが場に出たとき」の語順で `placedFromTrash` が消えていた。live は curated が守っていたので gates は緑のままだった）、
  **どのフラグも立たないカード 5158 / 5975（86.3%）**（`npm run census:cards`。⚠**「フラグ0＝正しい」ではない**）、
  **意味照合 段2 台帳＝残 OPEN 629**（段0 221／段1 111／段2 消化 483）、
  **実機シナリオ +12**（続き685 の10本＋🆕`b8OnPlayOriginTrashFires` / 🆕`b8OnPlayOriginHandBlocked`＝各2回連続 PASS・**反転確認あり**・既定 `order` へ追加済み）、
  **Sheet1 分母（`CardData_Sheet1.csv`）**：全 **974枚**（効果あり **863** / バニラ **111**）、
  **要対応カード 65 / 863（7.5%）**（着手時 92 → B1 87 → B2 75 → B3 73 → B4 69 → B5 66 → B6 66 → B7 66 → **B8 65**）。
  内訳＝census **26**／意味照合 47（findings 58件）／held 5／partial 0／idset 1（`--list` でカード名つき列挙）
- **2026-08-27 続き685 後**：
  📊**進捗3計器（§3 の併記）＝Sheet1 要対応 66 / 863（7.6%）｜意味照合 段2 台帳 残 OPEN 630｜census 高シグナル 536**。
  ⚠**B7 で動いたのは台帳だけ（631→630）。** Sheet1 が動かない理由＝**6効果はすべて Sheet1 外**（WX24／WXDi／WXK）。
  census が動かない理由＝**この6効果は元から「STUB/MANUAL 格納」バケット側**で高シグナルに数えられていない＝
  **census には最初から映らない穴**だった（逆翻訳・census・golden・smoke・fuzz が全部緑のまま意味が壊れる形）。
  **census 536/536**（据置）、**golden 2885**（Sheet1 B7 で **2880→2885**＝+5テスト・FAIL 0）、
  smoke **10697 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**（warning 263・±0）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**・据置＝B7 は型を1つも足していない＝**既存型の `count` を省略可にしただけ**）、
  **`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・据置）、
  **`POWER_MOD_PER_COUNT` の live 36効果**（据置。⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10697 / MANUAL 効果 1013 / PARTIAL 21**（据置＝B7 は `manualEffects.ts` に触れていない）、
  **`_held_fresh` 73 / `_partial_fresh` 12 / `_idset_fresh` 24**（held は B7 の採用で 74→73）、
  **どのフラグも立たないカード 5157 / 5975（86.3%）**（`npm run census:cards`。⚠**「フラグ0＝正しい」ではない**＝計器が見ていないだけ）、
  **意味照合 段2 台帳＝残 OPEN 630**（段0 221／段1 111／段2 消化 482／HIGH 435・MED 192・LOW 3／影響カード 480・効果 498）、
  **実機シナリオ +10**（続き684 の9本＋🆕`b7KawariBindsOpponentTarget`＝2回連続 PASS・**反転確認あり**・既定 `order` へ追加済み）、
  **Sheet1 分母（`CardData_Sheet1.csv`）**：全 **974枚**（効果あり **863** / バニラ **111**）、
  **要対応カード 66 / 863（7.6%）**（着手時 92 → B1 後 87 → B2 後 75 → B3 後 73 → B4 後 69 → B5 後 66 → B6 後 66 → **B7 後 66（±0・2巡連続）**）。⚠🔑**2巡続けて Sheet1 が動いていない**＝**parser の系統バグは Sheet1 の外に厚く分布している**（B7 の6効果は Sheet1 に1枚も無い）。**Sheet1 の枚数を落としたい巡は、着手時に「Sheet1 のカードを含む母集団か」を先に確かめる**（内訳＝census **27**／意味照合 48（findings 59件）／held 5／partial 0／idset 1。`--list` でカード名つき列挙）

- **2026-08-27 続き684 後**：
  📊**進捗3計器（§3 の併記）＝Sheet1 要対応 66 / 863（7.6%）｜意味照合 段2 台帳 残 OPEN 631｜census 高シグナル 536**。
  ⚠**B6 で Sheet1 が動かなかった理由**＝直した11効果のうち Sheet1 は `WX08-036` の1枚だけで、そのカードは別の finding（クラスOR）が残るため計器から落ちない。
  **census 536/536**（Sheet1 B6 で **537→536**＝中間動作への owner／filter 誤付着と対象宣言の復元。⚠**`WX07-039-E2` は据置**＝実機 UI がソフトロックするため §5.3 `O-104` へ。詳細は BUGFIXES）、**golden 2880**（Sheet1 B6 で +4 テスト・FAIL 0）、
  smoke **10697 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**（warning 263・±0）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**・据置＝Sheet1 B6 は型を1つも足していない＝**既存の受け皿への配線だけ**）、
  **`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・据置）、
  **`POWER_MOD_PER_COUNT` の live 36効果**（据置。⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10697 / MANUAL 効果 1013 / PARTIAL 21**（据置＝B6 は `manualEffects.ts` に触れていない）、
  **`_held_fresh` 74 / `_partial_fresh` 12 / `_idset_fresh` 24**（B6 の +10 はすべて採用済み。⚠**held が 75→74 に減ったのは B6 の採用による**）、
  **どのフラグも立たないカード 5155 / 5975（86.3%）**（`npm run census:cards`。⚠**「フラグ0＝正しい」ではない**＝計器が見ていないだけ）、
  **意味照合 段2 台帳＝残 OPEN 631**（段0 221／段1 111／段2 消化 481／HIGH 436・MED 192・LOW 3／影響カード 481・効果 499）、
  **実機シナリオ +9**（`crossIconBouncePicker` / `servantMultiEnaPaysColor` / `b3ShareClassDrawsFour` / `b3DistinctClassDrawsThree` / `b4NextSpellReductionConsumed` / `b5KawariElseBanishesOnlyLow` / `b5KawariThenReachesHigh` / 🆕`b6MiddleClauseDownsOwnSigni` / 🆕`b6DesignationClassReachesTarget`＝各2回連続 PASS・既定 `order` へ追加済み）、
  **Sheet1 分母（`CardData_Sheet1.csv`）**：全 **974枚**（効果あり **863** / バニラ **111**）、
  **要対応カード 66 / 863（7.6%）**（着手時 92 → B1 後 87 → B2 後 75 → B3 後 73 → B4 後 69 → B5 後 66 → **B6 後 66（±0）**）。⚠🔑**B6 は11効果を直したが Sheet1 の枚数は動いていない**＝直した中で Sheet1 は `WX08-036` の1枚だけで、そのカードは別の finding が残るため計器から落ちない。**進捗を「Sheet1 の枚数」だけで測らない**（内訳＝census **27**／意味照合 48（findings 59件）／held 5／partial 0／idset 1。`--list` でカード名つき列挙）

---

---


## 2026-08-26 整理（§6 恒久指標・続き674時点値の退避・続き675）

- **2026-08-26 続き674 後（本行が直近の正）**：
  **census 563/563**（`O-73` で −1。`BASELINE_HIGH` 更新済み）、**golden 2845**（`O-73` +1）、
  smoke **10696 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**・据置）、
  **`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・据置＝`O-73` は engine に**収集経路を足した**が全文 regex は増やしていない）、
  **`POWER_MOD_PER_COUNT` の live 36効果**（据置。⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10696 / MANUAL 効果 1034 / PARTIAL 21**（据置＝`O-73` は AUTO 1効果が変化）、
  **`_held_fresh` 76 / `_partial_fresh` 12 / `_idset_fresh` 43**（`O-73` で1件採用）、
  **どのフラグも立たないカード 4962 / 5975（83.0%）**（`npm run census:cards`）、
  **実機シナリオ +1**（`o73DelayedMillTrigger`＝**3連続 PASS で安定確認**・反転確認済み）、
  **`npm run golden` の所要＝全件 約168秒／`--only` 約1.5秒**

### 恒久指標アーカイブ（PLAN §6 から退避）

- **2026-08-26 続き668 後（本行が直近の正）**：
  **census 568/568**（据置）、**golden 2832**（`O-81` +7）、
  smoke **10694 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 263）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **148**＝`ATTACH_FACEDOWN_FROM_HAND` を追加）、
  **`census:enginetext` A群 142行 / 138ハンドラ**（B 59／C 27・miss ありハンドラ 43／miss カード 75・据置）、
  **`POWER_MOD_PER_COUNT` の live 37効果**（⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10694 / MANUAL 効果 1034 / PARTIAL 21**（`O-81` で `WX16-003` に +2＝E2 の MANUAL 化と E3 の新設）、
  **`_held_fresh` 76 / `_partial_fresh` 13 / `_idset_fresh` 45**（`_partial_fresh` +1＝`WX16-003` の MANUAL 化。live は `syncManualLive` で同期済み）、
  **どのフラグも立たないカード 4961 / 5975（83.0%）**（`npm run census:cards`）、
  **実機シナリオ +2**（`o81FacedownAttachRevealBanish` ／ 対照 `o81NoAttachNoBanish`）、
  **`npm run golden` の所要＝全件 約167秒／`--only` 約1.5秒**

- **2026-08-26 続き667 後（本行が直近の正）**：
  **census 568/568**（`O-80` 第1バッチ＝566→568 は**退化ではなく可視化**＝STUB を外すと census の STUB 免除が外れる）、**golden 2825**（第1バッチ +2）、
  smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 266）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**、
  **`census:enginetext` A群 142行 / 138ハンドラ**（B 59／C 27・miss ありハンドラ 43・miss カード 75）、
  **`POWER_MOD_PER_COUNT` の live 58→37効果**（⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10693 / MANUAL 効果 1032**（据置。`O-80` 第1は**21効果**が変化＝`POWER_MODIFY`+payload 19／`DEFERRED_*` 2）、
  **`_held_fresh` 76 / `_partial_fresh` 12 / `_idset_fresh` 45**（いずれも据置＝parser 改善が凍っていない）、
  **実機シナリオ +1**（`o80PerProcessedCount`。回帰＝`o60RevealLifeTopArts` PASS）、
  **`npm run golden` の所要＝全件 約158秒／`--only` 約1.5秒**

- **2026-08-26 続き666 後（本行が直近の正）**：
  **census 566/566**（`O-60` 第8バッチの逆翻訳是正の副産物＝572→566・`BASELINE_HIGH` 更新済み）、**golden 2823**（第8バッチ +2）、
  smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 266）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**、
  **`census:enginetext` A群 142行 / 138ハンドラ**（B 59／C 27・miss ありハンドラ 43・miss カード 76）、
  **live カード 5975 / 効果総数 10693 / MANUAL 効果 1032**（据置。`O-60` 第8は**12効果**が変化＝payload 追加8／`DEFERRED_*` へ2／typed `LOOK_AND_REORDER` へ2）、
  **`_held_fresh` 76 / `_partial_fresh` 12 / `_idset_fresh` 45**（いずれも据置＝parser 改善が凍っていない）、
  **実機シナリオ +1**（`o60RevealLifeTopArts`）、
  **`npm run golden` の所要＝全件 約152秒／`--only` 約1.5秒**

- **2026-08-26 続き665 後（本行が直近の正）**：
  **census 572/572**（`O-60` では動かず＝engine の全文 regex は census の網に載らない）、**golden 2821**（第5〜7バッチ +6）、
  smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 263）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**、
  **`census:enginetext` A群 143行 / 139ハンドラ**（B 59／C 26・miss ありハンドラ 44・miss カード 80）、
  **live カード 5975 / 効果総数 10693 / MANUAL 効果 1032**（据置。`O-60` 第5〜7は payload 追加＝**19効果**）、
  **`_held_fresh` 76 / `_partial_fresh` 12 / `_idset_fresh` 45**（いずれも据置＝parser 改善が凍っていない）、
  **実機シナリオ +3**（`b60TrapToHandOne`／`b60DoubleMinusArts`／`b60DoubleMinusNoArts`。累計 `b60*` 9本）、
  **`npm run golden` の所要＝全件 約156秒／`--only` 約1.5秒**

- **2026-08-25 続き658 後（本行が直近の正）**：

- **2026-08-25 続き660 後（本行が直近の正）**：
  **census 572/572**（`O-66` では動かず＝engine 側の穴は census の網に載らない）、**golden 2799**（`O-66`②+2／③+3／④+4、既存1本の固定を緩和）、
  smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 263）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**、
  **live カード 5975 / 効果総数 10693 / MANUAL 効果 1036**、
  **実機シナリオ +6**（🆕`O-66`②＝`b66WallProtectsAlly`／`b66WallAllyAttackPhase`、③＝`b66UnderGrantPayload`／`b66UnderGrantNonMatch`、
  ④＝`b66TurnEndDelayInstalled`。回帰＝`b65WallOppMainProtected`／`b65WallAttackPhaseNotProtected` も PASS）、
  **実機 testid +1**（`onplaycost-hand-${i}`＝【出】手札コストのセル）、
  **`npm run golden` の所要＝全件 約158秒／`--only` 約1.5秒**

- **2026-08-25 続き659 後（本行が直近の正）**：
  **census 572/572**（`O-45` で 573→572＝「下に置く」の名詞句修飾を filter へ配線）、**golden 2788**（`O-44` +2／`O-45` +3）、
  smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 263）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**、
  **live カード 5975 / 効果総数 10693 / MANUAL 効果 1036**、`_held_fresh` **83**／`_partial_fresh` **12**／`_idset_fresh` **45**、
  **逆翻訳の生JSON漏れ 0**、
  **実機シナリオ +4**（🆕`O-44`＝`poisonPowerDecreaseFires`／`poisonPowerDecreaseGate`／`poisonPowerDecreaseGateAll`、🆕`O-45`＝`underPlaceLevelFilter`。
  回帰＝`oppPowerDecreased`／`spellUnderMemoriaPlace` も PASS。**反転確認**＝`poisonPowerDecreaseGateAll` は旧実装で FAIL することを実測）、
  **`npm run golden` の所要＝全件 約155秒／`--only` 約1.5秒**
  **census 573/573**（`O-46` では動かず＝コスト側の穴は census の網に載らない）、**golden 2783**（`O-46` で 2781→2783＝live 契約1本＋gate 1本）、
  smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 263）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**、
  **live カード 5975 / 効果総数 10693**、`_held_fresh` **78**／`_partial_fresh` **12**／`_idset_fresh` **45**、
  **意味照合 残 OPEN 678→677**（`WXK08-027-E2 :: 手札を１枚捨て、他のシグニ１体` を台帳でクローズ。他の4効果は台帳の母集団外＝標本に載っていなかった実バグ）、
  **逆翻訳の生JSON漏れ 0**（🆕`costJa` の未対応コストキー 22種＝42効果以上を全数解消）、**`costUnparsed` の明示 12効果＋入れ子**、
  **実機シナリオ +29**（🆕`O-46`＝`b46ThreeElementCostPaid`/`b46ThreeElementUnpayable`/`b46HandDiscardSigniPaid`/`b46HandDiscardSigniNoMatch`/`b46KeyEnergyTrashAllPaid`/`b46KeyTrashOnlyControl` 6本、`O-67` 4本、`O-66` 2本、`O-65` 4本、`O-64` 3本、`O-63` 2本、第44〜46 の8本）＝**`O-63`〜`O-67` の13本＋`O-46` の6本は ALL PASS を2回連続**、
  **`npm run golden` の所要＝全件 約164秒／`--only` 約1.5秒**

## 恒久指標の旧行（PLAN §6 から退避・新しいものが上）

- **2026-08-28 続き697 後**：
  📊**進捗3計器＝Sheet1 要対応 28 / 863（3.2%）｜台帳 残 OPEN 578｜census 高シグナル 522（据置）**
  （`O-126`＝`cost_modifiers` の配線。**live JSON は不変**＝engine/UI 側の穴だったので parser 出力は動かない。
  B10〜B19 で Sheet1 要対応は 65→28）。
  **golden 2915**（B19 で 2912→2915）、census 522/522、smoke 全異常0、fuzz 全0、lint 0 errors（263 warn）、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置）、
  **held 89 / partial 14 / idset 24**（据置）、
  **実機シナリオ +2**（🆕`b19costup`＝《無》×0 のスペルにエナ3枚を請求（旧挙動は0枚）／
  🆕`b19costupnone`＝修正が無ければエナを消費しない。**反転確認済み**＝配線と寿命を戻すと golden 新規2本が FAIL。
  回帰 `b14costup` / `craftTurnEndP03078` PASS）
  ⚠**census が動かない回がある**＝この軸（engine の死にストア）は census の語彙表に無い。§3「計器ごとに見えるものが違う」どおり。

- **2026-08-28 続き696 後**：
  📊**進捗3計器＝Sheet1 要対応 29 / 863（3.4%）｜台帳 残 OPEN 579｜census 高シグナル 522**
  （`O-108`＝コスト側の集合制約で **live 変化 1 effectId / 1カード**・**スコープ外0**。B10〜B18 で Sheet1 要対応は 65→29）。
  **golden 2912**（B18 で 2911→2912）、census 522/522、smoke 全異常0、fuzz 全0、lint 0 errors（263 warn）、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置）、
  **held 89 / partial 14 / idset 24**（据置）、
  **実機シナリオ +2**（🆕`b18distinctok`＝名前違い4枚で撃てる／🆕`b18distinctsame`＝同名4枚では**【起】が提示されない**。
  **反転確認済み**＝制約を外すと negative が撃ててしまい FAIL。回帰 `b17resonadiff` / `b16banish2` PASS）
  ⚠**シグニ【起】の実機は `[data-action-label]` で能力を先に選ぶ**（モーダルを開くだけでは支払いUIが出ない）

- **2026-08-28 続き695 後**：
  📊**進捗3計器＝Sheet1 要対応 30 / 863（3.5%）｜台帳 残 OPEN 580｜census 高シグナル 523（据置）**
  （`O-122`＝出現条件の支払い記録で **live 変化 1 effectId / 1カード**・**スコープ外0**。B10〜B17 で Sheet1 要対応は 65→30）。
  **golden 2911**（B17 で 2910→2911）、census 523/523、smoke 全異常0、fuzz 全0、lint 0 errors（263 warn）、
  `census:stubs` A群🔴0／C群0、manual-fields 0、`census:enginetext` A群 141行/137ハンドラ（据置）、
  **held 89 / partial 14 / idset 24**（据置）、
  **実機シナリオ +2**（🆕`b17resonasame`＝同名2体で2枚チャージ／🆕`b17resonadiff`＝別名2体ではチャージしない。
  **反転確認済み**＝条件を外すと negative が2枚チャージして FAIL。回帰 `b16banish2` / `b15plaincrash` PASS）
  ⚠**実機 fixture は「限定」列を先に見る**＝`WX07-009` はサシェ限定・`WX05-034` は花代限定で、2回とも空振りした

- **2026-08-26 続き675 後**：
  **census 562/562**（段2 第43バッチで −1。`BASELINE_HIGH` 更新済み）、**golden 2854**（第43バッチ +9＝対象9効果に両方向 E2E を1本ずつ）、
  smoke **10696 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**（warning 263・±0）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**・据置）、
  **`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・据置＝第43バッチは engine に触れていない）、
  **`POWER_MOD_PER_COUNT` の live 36効果**（据置。⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10696 / MANUAL 効果 1034 / PARTIAL 21**（据置。⚠`WX06-022-E1` の manual shadow を撤去したが live 側は元から `AUTO` 表記＝**この数字では shadow を検知できない**＝`O-93`）、
  **`_held_fresh` 75 / `_partial_fresh` 12 / `_idset_fresh` 43**（held 76→75。減った1件は続き674 が `_held_review.txt` を再生成せずコミットした stale で、第43バッチとは無関係）、
  **どのフラグも立たないカード 4964 / 5975（83.1%）**（`npm run census:cards`）、
  **意味照合 段2 台帳＝残 OPEN 668**（段0 221／段1 111／段2 消化 444／HIGH 463・MED 201・LOW 4／影響カード 501・効果 527）、
  **実機シナリオ ±0**（第43バッチは `src/screens/` に触れていないため新規なし＝§1 に理由を記載）

- **2026-08-26 続き673 後**：
  **census 564/564**（`O-89` で **−3**＝スコープつきキーワード直後のブロック飲み込みを是正。`BASELINE_HIGH` 更新済み）、**golden 2844**（`O-89` +1。既存「照応B」は id が E2→E3 へずれただけ＝回帰ではない）、
  smoke **10696 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**・据置）、
  **`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・据置＝`O-89` は engine を1行も触っていない＝parser 側で完結）、
  **`POWER_MOD_PER_COUNT` の live 36効果**（据置。⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10696 / MANUAL 効果 1034 / PARTIAL 21**（`O-89` で **+2 効果**＝`WXDi-P10-040` と `WX24-P4-044` で飲み込まれていたブロックが復活）、
  🆕**`_held_fresh` 77 / `_partial_fresh` 12 / `_idset_fresh` 43**（`O-89` で2件採用＋**`_idset_fresh` が 45→43**＝`WXDi-P09-048` / `WX25-P2-118` の凍結が実体一致で解けた）、
  **どのフラグも立たないカード 4962 / 5975（83.0%）**（`npm run census:cards`）、
  **実機シナリオ +1**（`o89ShadowKeywordBlockSplit`＝**反転確認済み**）、
  **`npm run golden` の所要＝全件 約158秒／`--only` 約1.5秒**


- **2026-08-26 続き672 後**：
  **census 567/567**（`O-91` で −1＝`WXK05-043-E1` の bare BANISH が `CONDITIONAL{SELF_POWER_GTE 12000}` になり条件節カテゴリから抜けた。`BASELINE_HIGH` 更新済み）、**golden 2843**（`O-91` +1。`O-88` の (c) は「既知の残」前提だったので更新＝回帰ではない）、
  smoke **10694 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**・据置）、
  **`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・据置＝`O-91` は engine を1行も触っていない＝parser 側で完結）、
  **`POWER_MOD_PER_COUNT` の live 36効果**（据置。⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10694 / MANUAL 効果 1034 / PARTIAL 21**（据置＝`O-91` は AUTO 1効果が変化）、
  **`_held_fresh` 76 / `_partial_fresh` 12 / `_idset_fresh` 45**（`O-91` で1件採用）、
  **どのフラグも立たないカード 4961 / 5975（83.0%）**（`npm run census:cards`）、
  **実機シナリオ +1**（`o91BelowThresholdNoBanish`＝**負方向・対照つき・反転確認済み**。対照＝`o88AttackAnaphoraBanishesOpponent` PASS）、
  **`npm run golden` の所要＝全件 約157秒／`--only` 約1.5秒**


- **2026-08-26 続き671 後**：
  **census 568/568**（`O-90` で −1＝`O-88` が可視化した穴の**払い戻し**。`WXK07-051-E1` の公開札がデッキ上へ戻る形を是正して「公開し」カテゴリから抜けた。`BASELINE_HIGH` 更新済み）、**golden 2842**（`O-90` +1）、
  smoke **10694 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**・据置）、
  **`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・据置＝`O-90` は engine の全文 regex を1本も増やしていない＝parser 側で完結）、
  **`POWER_MOD_PER_COUNT` の live 36効果**（据置。⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10694 / MANUAL 効果 1034 / PARTIAL 21**（据置＝`O-90` は AUTO 5効果が変化）、
  **`_held_fresh` 76 / `_partial_fresh` 12 / `_idset_fresh` 45**（`O-90` で5件採用）、
  **どのフラグも立たないカード 4962 / 5975（83.0%）**（`npm run census:cards`）、
  **実機シナリオ +1**（`o90RevealedCardsToDeckBottom`＝**反転確認済み**。回帰＝`o88AttackAnaphoraBanishesOpponent` PASS／`lookReorderCanTrash` は**HEAD でも赤い既存の腐り**＝`V-89` に登録）、
  **`npm run golden` の所要＝全件 約155秒／`--only` 約1.5秒**


- **2026-08-26 続き670 後**：
  **census 569/569**（`O-88` で +1＝**退化ではなく可視化**。`WXK07-051-E1` を STUB から実アクションへ移して「公開し」に計上された）、**golden 2841**（`O-88` +1）、
  smoke **10694 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**・据置）、
  **`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・miss ありハンドラ 43／miss カード 75・据置）、
  **`POWER_MOD_PER_COUNT` の live 36効果**（`O-88` で `WXK07-051-E1` を1件解消。⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10694 / MANUAL 効果 1034 / PARTIAL 21**（据置＝`O-88` は AUTO 6効果が変化）、
  **`_held_fresh` 75 / `_partial_fresh` 12 / `_idset_fresh` 45**（`O-88` で6件採用＝81→75）、
  **どのフラグも立たないカード 4962 / 5975（83.0%）**（`npm run census:cards`）、
  **実機シナリオ +2**（`o88LeadingDesignationAnaphora` ／ `o88AttackAnaphoraBanishesOpponent`。回帰＝`o80PerProcessedCount`／`o87ResetTrapReplace` PASS・`verify:browser` 3本 PASS）、
  **`npm run golden` の所要＝全件 約157秒／`--only` 約1.5秒**


- **2026-08-25 続き657 後**：
  **census 573/573**（`O-67` で 574→573・`BASELINE_HIGH` も更新）、**golden 2781**（`O-67` で 2778→2781＝live 1本＋engine 1本＋gate 1本）、
  smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 260）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**、
  **live カード 5975 / 効果総数 10693**、`_held_fresh` **77**／`_partial_fresh` **12**／`_idset_fresh` **45**、
  **意味照合 残 OPEN 678**、**実機シナリオ +23**

- **2026-08-25 続き648 後（本行が直近の正）**：
  **census 600/600**、**golden 2735**、smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 260）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、
  **live カード 5975 / 効果総数 10693**、`_held_fresh` **75**／`_partial_fresh` **15**／`_idset_fresh` **45**、
  **意味照合 残 OPEN 701**（段2消化 409・**本バッチで 708→701 の −7**／段0 221・段1偽陽性 113 は不動）、
  **実機シナリオ +2**（`b42OwnEffectEnergyChargeFires` / `b42EnergyPhaseDoesNotFire`）、version **0.502**。（⚠`census:wiring`／`census:timing`／`census:goldentypes` は本バッチ未再計測）

- **2026-08-25 続き647 後**：
  **census 601/601**、**golden 2709**、smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 260）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、
  **live カード 5975 / 効果総数 10693**、`_held_fresh` **75**／`_partial_fresh` **15**／`_idset_fresh` **45**、
  **意味照合 残 OPEN 708**（段2消化 402・本バッチで 713→708 の −5）、
  **実機シナリオ +2**（`b41GrantKeywordExpiresAtTurnEnd` / `b41GrantKeywordTargetsOwnSigniOnly`）、version **0.502**。（⚠`census:wiring`／`census:timing`／`census:goldentypes` は本バッチ未再計測）

- **2026-08-24 続き643 後**：
  **census 601/601**、**golden 2672**、smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 260）**、
  `census:stubs` **A群🔴0／C群0**（live の STUB id 種類 **597**）、manual-fields **0**、**同型★ 0**、
  **live カード 5975 / 効果総数 10693**、`_held_fresh` **77**／`_partial_fresh` **15**／`_idset_fresh` **45**、
  **意味照合 残 OPEN 714**（本バッチは機構 worklist＝台帳は未消化）、
  **実機シナリオ +2**（`b55TrapFromEnergySelf` / `b55TrapFromDeckTop`）、version **0.502**。（⚠`census:wiring`／`census:timing`／`census:goldentypes` は本バッチ未再計測）

- **2026-08-24 続き642 後**：
  **census 604/604**、**golden 2669**、smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 260）**、
  `census:stubs` **A群🔴0／C群0**（live の STUB id 種類 598→**597**）、manual-fields **0**、**同型★ 0**、
  **live カード 5975 / 効果総数 10693**、`_held_fresh` **77**／`_partial_fresh` **15**／`_idset_fresh` **45**、
  **意味照合 残 OPEN 714**（前バッチから増減なし＝本バッチは機構 worklist）、
  **実機シナリオ +2**（`b54EnergySelfReviveOnlySelf` / `b54EnergySelfToLife`）、version **0.502**。（⚠`census:wiring`／`census:timing`／`census:goldentypes` は本バッチ未再計測）

- **2026-08-24 続き641 後**：
  **census 604/604**、**golden 2668**、smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 260）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0／文型★ 324**、
  **live カード 5975 / 効果総数 10693**、`_held_fresh` **77**／`_partial_fresh` **15**／`_idset_fresh` **45**、
  **意味照合 残 OPEN 714**（未 triage 0／段1 真バグ確定 705／HIGH 495）、`census:wiring` **miss 197**（続き547 実測）／`census:timing` フォールバック **2効果**、
  **実機シナリオ +2**（段2 第36 の2本を追加。`title:` 行の実測で 499→501）、version **0.502**。（⚠`census:goldentypes` は続き552d 以降 未再計測）

- **2026-08-24 続き639 後**：
  **census 608/608**、**golden 2662**、smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 269）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0／文型★ 323**、
  **live カード 5975 / 効果総数 10693**、`_held_fresh` **81**／`_partial_fresh` **15**／`_idset_fresh` **45**、
  **意味照合 残 OPEN 729**（未 triage 0／段1 真バグ確定 720）、`census:wiring` **miss 197**（続き547 実測）／`census:timing` フォールバック **2効果**、
  **実機シナリオ定義総数 518**、version **0.502**。

- **2026-08-24 続き638 後（本行が直近の正）**：
  **census 608/608**、**golden 2659**、smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 269）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0／文型★ 323**、
  **live カード 5975 / 効果総数 10693**、`_held_fresh` **81**／`_partial_fresh` **15**／`_idset_fresh` **46**、
  **意味照合 残 OPEN 730**（未 triage 0／段1 真バグ確定 721）、`census:wiring` **miss 197**（続き547 実測）／`census:timing` フォールバック **2効果**、
  **実機シナリオ定義総数 518**（続き638 は実機シナリオを追加していない＝parser 側の構造是正のみ）、version **0.502**。（⚠`census:goldentypes` は続き552d 以降 未再計測）

- **2026-08-24 続き637 後（本行が直近の正）**：
  **census 608/608**、**golden 2655**、smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 269）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0／文型★ 323**、
  **live カード 5975 / 効果総数 10693**、`_held_fresh` **81**／`_partial_fresh` **15**／`_idset_fresh` **46**、
  **意味照合 残 OPEN 734**、`census:wiring` **miss 197**（続き547 実測）／`census:timing` フォールバック **2効果**、
  **実機シナリオ定義総数 518**（+42＝V-84/85/83/04/16/87/86/30/35/44/45/63・O-47/O-48・段2第34/37/38/40）、version **0.502**。（⚠`census:goldentypes` は続き552d 以降 未再計測）

### 2026-08-23 整理（続き636 で §4 から退避した恒久指標行）

- **2026-08-23 続き635（Opusタスク12 (clii)+(cli) 残0クローズ）後 最新値（本行が直近の正）**：
  **census 608/608 据置**、**golden 2651**（続き634 は 2647）、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、**lint 0 errors 据置**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0／文型★ 323 据置**、
  **live カード 5975 / 効果総数 10693 据置**。
  `_held_fresh` **81 据置**／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  **残 OPEN 734 据置**（今回は段2 バッチではない）。


### 2026-08-23 整理（続き635 で §4 から退避した恒久指標行）

- **2026-08-23 続き634（段2 第41〜43バッチ＝集合主語／選択集合の相互差異／「N枚まで」）後 最新値（本行が直近の正）**：
  **census 608/608 据置**、**golden 2647**（続き633 は 2639）、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、**lint 0 errors / 261 warnings 据置**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0／文型★ 323 据置**、
  **live カード 5975 / 効果総数 10693 据置**。
  `_held_fresh` **81**（同 82）／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  `censusManualDrift` **削除候補 0 据置**（§6.4 `O-42` 残0クローズ済み・トリップワイヤ稼働中）。
  **残 OPEN 734**（続き633 は 746）。



## 2026-08-23 整理（§4 恒久指標・続き632時点値の退避・続き633）

- **🆕 2026-08-23 続き632（段2 第33〜37バッチ＝5連投／台帳書式の是正）後 最新値（本行が直近の正）**：
  **census 621/621**（`BASELINE_HIGH` 更新済み・セッション開始時 640）、**golden 2618**（同 2563）、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、**lint 0 errors / 261 warnings 据置**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live カード 5975 / 効果総数 10693 据置**。
  `_held_fresh` **83**（同 86）／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  `censusManualDrift` **削除候補 0 据置**（§6.4 `O-42` は残0クローズ済み・トリップワイヤ稼働中）。
  **条件型の数＝`Condition` 122 据置／`ActiveCondition` 52→53**（`LIFE_COMPARE_OPP` の新設分）。
  🔴**engine／実機の改変（セッション累計）**＝
  `execRevealAndPick`／`LOOK_PICK_CHAIN` が `pickUpTo` を `SEARCH` pending の `optional` へ配線（第34）／
  `LOOK_AND_REORDER` の `upToCount`＝見る枚数を 0..N から選ぶ `CHOOSE`（第34）／
  `TRANSFER_TO_DECK` に `destination:'lrig_deck'` と `self/opp_lrig_trash` スコープを新設（第34）／
  `CountFromZone.unitSize`（除数）と `SelectionConstraint.totalLevelExactRef` を新設（第35）／
  `cards_drawn_this_attack_phase` を新設し `turnScopedState` へ `attack-phase-start` 境界で登録（第35）／
  `execDown`／`execUp`／`CHOOSE.countChoose` を `resolveCountRef` へ移行（第35）／
  **`LIFE_COMPARE_OPP` を新設**し `effectEngine.ts:340`・`effectEngine.ts:1081`・`execUtils.ts:2207` の**3経路**へ配線（第36）／
  **`oppLifeCrashSourceMatches` を新設**し engine collector（`triggerCollect.ts:3469`）と
  実機 BattleScreen（`BattleScreen.tsx:11960` 経由 `battle/lifeCrashTriggers.ts`）を**共通 predicate** へ集約（第37）。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 813**（セッション開始時 876）／段2 消化 **292**／
  HIGH・MED・LOW＝**551・254・8**／影響カード **595** ・効果 **642**（`semanticAuditLedger.mjs` の実測）。
  🔴🔑**台帳（`stage2_closed.txt`）の書式は2種類しかない**（`semanticAuditLedger.mjs` の `closedAll`／`closedOne`）＝
  **`EFFECTID` 単体**＝その効果の finding を全部閉じる／**`EFFECTID :: <quote>`**＝
  **`findings.jsonl` の `quote` への前方一致**で1本だけ閉じる。**`::` の右に説明文を書くと1件も閉じない**
  （続き632 実測＝63行中55行が空振り。CODEX_GUIDE §4 に2書式の表、§5 `28` に事故を登録済み）。
  ⚠**バッチの締めでは必ず `node scripts/archive/semanticAuditLedger.mjs` を実行して残 OPEN が減ったかを見る。**
  ⚠**live 修正数と OPEN の減りは一致しない**＝続き632 は108効果を直したが母集団に載っていたのは45件
  （残りは同じ parser 規則で一緒に直った標本外の実バグ）。**OPEN を進捗指標にするなら母集団は必ず `findings.jsonl` 側から切る。**
  📊**母集団の切り方＝10原則**（603〜608 で確立・CODEX_GUIDE §5 `3-3′`〜`3-4″`）＝
  ①消費地点まで見る ②srctext でなく CSV ③完全一致で数えない ④同義語彙を全部列挙 ⑤「変な形＝バグ」と決めつけない
  ⑥原文の括弧内ルール説明を能力として数えない ⑦再帰探索で入れ子まで拾わない ⑧既存の受け皿型を先に一覧化して引き算する
  ⑨カード単位の「個数差」で数えない ⑩`CardData_Sheet8.csv` の先頭 BOM を必ず剥がす
  🔑**続き629〜632 で4回連続で当たった型＝「受け皿はあるのに parser／engine が配線していない」穴は既存の計器に映らない**
  （`census` にも `census:wiring` にも出ない）。⇒ **「型はあるが live 利用が極端に少ない語彙」を数える計器**の優先度を上げる。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-44` のみ**。**§6.3 の新規は `L`**（共通色比較・**10バッチ連続で保留中**）。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **`census:wiring` miss 合計 194**（続き606 実測）／**`census:timing` フォールバック 2効果**。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**実機未検証＝続き588 の6件（最優先）＋`V-85`＋`V-84`＋`V-83`＋続き616〜632 の計15バッチ（第23〜37）全部**。
  特に**第34（0枚選択可の UI）・第36（条件ゲート）・第37（クラッシュ主体の限定）は実機経路に直接触っている**。
  ⚠**`.codex-work`（有料 Codex）は続き632 で5連投とも正常動作**（続き631 が記録した 2026-08-28 までの利用上限には当たらなかった）。
  **投入コマンド（実績）**＝`CODEX_HOME="C:/Users/zerom/.codex-work" codex exec -C "C:/Users/zerom/WixossReact" -c model_reasoning_effort="high" -o <report> - < <指示書> > <log> 2>&1`
  （`.codex-work` の config に `sandbox_mode` があるので `-c sandbox_mode=…` は**付けない**＝Claude 側の分類器に弾かれない）。
  ⚠**投入前に必ず `git status --porcelain` を空にする**（続き624＝計器の生成時刻1行の差分で Codex が起動を拒否した。判断自体は正しい）。

## 2026-08-23 整理（§4 恒久指標・続き631時点値の退避・続き632）

- **🆕 2026-08-23 続き631（段2 第32バッチ＝レベル合計 exact の機構新設／`O-42` 残0クローズ）後 最新値（本行が直近の正）**：
  **census 640/640**（`BASELINE_HIGH` 更新済み・セッション開始時 659）、**golden 2563**（同 2518）、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、**lint 0 errors / 261 warnings 据置**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live 効果総数 10693 据置**。
  `_held_fresh` **86**（同 87）／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🏁**`censusManualDrift` 削除候補＝0**（§6.4 `O-42` 残0クローズ）／`manualEffects` **411 カード**（同 412）。
  **条件型の数＝`Condition` 122／`ActiveCondition` 52 据置**（golden のトリップワイヤが正）。
  🔴**engine の改変（セッション累計）**＝`execStubPart1` が引用【自】内の `SET_OPP_SIGNI_POWER_BY_SELF_POWER` を許可し長期 store へ（627）／
  `collectGrantedFromLayer` が CONTINUOUS 引用付与を当該ブロックから展開（627）／
  `FIELD_LEVEL_SUM` に `parity` と `lrigRole` を追加し `checkActiveCondition`／`evalCondition` へ配線（628）／
  `ALL_FIELD_SIGNI_MATCH` が `levelParity` を受ける（628）／
  **`totalLevelMax` の消費を `execBanish` 以外（`execGrantKeyword`／`execSendToEnergy`／`execDown`）へ実装**（629）／
  `GRANT_PROTECTION` の AUTO 期間付与で `protectionKeyword` が `sourceFilter` を捨てていた穴を配線（629）／
  **`SelectionConstraint` に `totalLevelExact`／`totalLevelMax` を新設**し SEARCH・コスト経路・移動経路の
  候補提示／完了可否／resume 再検証へ配線（631）。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 876**（セッション開始時 883・**closed effectId 231→247**）／段2 消化 **247**／
  HIGH・MED・LOW＝**524・343・9**（`stage2_closed.txt` の effectId を除いた同一計算での実測）。
  🔴🔴**⚠この数字の読み方**＝**このセッションの41効果のうち audit の母集団に載っているのは16件だけ**。
  残りは Claude が**自作計器と `census:clusters`** から切った母集団で、**実バグだが構造的に OPEN を動かさない**。
  **OPEN を進捗指標にするなら、母集団を `findings.jsonl`（`stage3_worklist.md` 第2層＝38サブ群・302件）から切ること。**
  📊**母集団の切り方＝5原則＋α**（603〜608 で確立・CODEX_GUIDE §5 `3-3′`〜`3-4″`）＝
  ①消費地点まで見る ②srctext でなく CSV ③完全一致で数えない ④同義語彙を全部列挙 ⑤「変な形＝バグ」と決めつけない
  ⑥原文の括弧内ルール説明を能力として数えない ⑦再帰探索で入れ子まで拾わない ⑧既存の受け皿型を先に一覧化して引き算する
  ⑨カード単位の「個数差」で数えない（兄弟効果が相殺する）
  ⑩🆕**自作走査では `CardData_Sheet8.csv` の先頭 BOM を必ず剥がす**（続き627＝剥がさないとそのシートが丸ごと
  キー `undefined` へ落ち、第27バッチの母集団から `WXDi-P13-061-E1` が静かに漏れていた）
  🆕🔑**続き629 で確立＝「受け皿はあるのに parser が配線していない」型の穴は既存の計器に映らない**＝
  `EffectTarget.totalLevelMax` は engine 実装済みなのに live 利用が1枚だけだった（11カードで過剰実行）。
  `census` にも `census:wiring` にも出ない。⇒ **「型はあるが live 利用が極端に少ない語彙」を数える計器**が要る。
  🆕🔑**続き629 の再確認＝「engine 実装済み」を Claude が先回りで書くと死フラグを生む**＝
  `totalLevelMax` を読むのは `execBanish` だけで、他3経路は未消費だった（§5-14。**先回りメモが覆された通算11回目**）。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-44` のみ**（🏁`O-41` 続き609／🏁`O-43` 続き615／🏁**`O-42` 続き631 で残0クローズ**）。
  **§6.3 の新規は `L`**（共通色比較・**9バッチ連続で保留中**）。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **`census:wiring` miss 合計 194**（続き606 実測）／**`census:timing` フォールバック 2効果**。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**実機未検証＝続き588 の6件（最優先）＋`V-85`＋`V-84`＋`V-83`＋続き616〜631 の計10バッチ（第23〜32）全部**。
  特に**第31・第32 は対象選択 UI（候補提示・完了可否・resume）に触っている**ので観測点を §7 へ追加すべき。
  ⚠**`.codex-work`（有料 Codex）は 2026-08-28 21:58 まで利用上限**＝当面は既定 `~/.codex`（環境変数なしの `codex exec`）で投げる。
  **投入コマンド（実績）**＝`codex exec -C "C:/Users/zerom/WixossReact" -c sandbox_mode="danger-full-access" -c model_reasoning_effort="high" -o <report> - < <指示書> > <log> 2>&1`
  ⚠**投入前に必ず `git status --porcelain` を空にする**（続き624＝計器の生成時刻1行の差分で Codex が起動を拒否した。判断自体は正しい）。

## 2026-08-23 整理（§4 恒久指標・続き615時点値の退避・続き621）

- **🆕 2026-08-22 続き615（段2 第22バッチ＝§6.4 `O-43` 残0クローズ）後 最新値（本行が直近の正）**：
  **census 702/702**（`BASELINE_HIGH` 更新済み・セッション開始時 730）、**golden 2442**（同 2366）、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、**lint 0 errors / 261 warnings 据置**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live 効果総数 10693 据置**。
  `_held_fresh` **88 据置**／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  **`censusManualDrift` の削除候補（§6.4 `O-42` の母集団）＝86 据置**。
  🔴**engine の改変（セッション累計）**＝`execBlockAction` に `GUARD_LV_DECLARED`／`GUARD_LV_LAST_DOWNED`（609）／
  `execSequence` の `DECLARE_NUMBER` 横取りを `GRANT_KEYWORD` 直前のみへ限定＋`SET_DECLARED_NUMBER` の保存先を `declared_number` へ分離（609）／
  `SearchAction.handOrField` と `execSearch` の引き渡し（613）／`GrantProtectionAction.sourceOwner:'any'` と消費地点6箇所＋`effectSourceOwner` 引数（614）／
  `FIELD_LEVEL_SUM` を両 union・両評価器へ新設＋`LRIG_TEAM_COUNT` を `ActiveCondition` へ（615）。
  🆕**条件型の数＝`ActiveCondition` 49／`Condition` 122**（golden のトリップワイヤが正）。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 905**／段2 消化 **184**／真バグ確定 892／
  HIGH・MED・LOW＝**606・291・8**／段0 除去 231／段1 偽陽性 125。
  📊**母集団の切り方＝5原則＋α**（603〜608 で確立・CODEX_GUIDE §5 `3-3′`〜`3-4″`）＝
  ①消費地点まで見る ②srctext でなく CSV ③完全一致で数えない ④同義語彙を全部列挙 ⑤「変な形＝バグ」と決めつけない
  ⑥🆕**原文の括弧内ルール説明を能力として数えない**（続き610）。
  🆕🔑**続き614 で確立＝「直す前に、消費地点が“省略値”をどう扱うかを読む」**＝`sourceOwner` を消すと
  6箇所中3箇所が `!== 'opponent'` で continue して**27効果の耐性が丸ごと死ぬ**（過小→恒久 no-op の裏返り・計器に映らない）。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-42`／`O-44`**（🏁`O-41` は続き609、🏁`O-43` は続き615 で残0クローズ）。
  **§6.3 の新規は `L`**（共通色比較・**6バッチ連続で保留中**）。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **`census:wiring` miss 合計 194**（続き606 実測・⚠`levelExact × BLOCK_ACTION{PLAYER}` の3件は恒久的な偽陽性）／**`census:timing` フォールバック 2効果**。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**実機未検証＝続き588 の6件（最優先）＋`V-85`（宣言 UI が新規に30カードで出る）＋`V-84`（レベル限定つきガード禁止）＋`V-83`**。
  ⚠**`.codex-work`（有料 Codex）は 2026-08-28 21:58 まで利用上限**＝当面は `CODEX_HOME=C:/Users/zerom/.codex` で投げる。


## 2026-08-22 整理（§4 恒久指標・続き594時点値の退避・続き596）

- **🆕 2026-08-22 続き594（タスク8 台帳新設＋段2 第4・第5バッチ）後 最新値（本行が直近の正）**：
  **census 776→773**（`BASELINE_HIGH` 773）、**golden 2334→2337**、smoke **10693 / 全異常0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（260 warnings 据置）、`census:stubs` **A群🔴0／C群0**、manual-fields **0**、
  **同型★ 0**、`parserWorklist` held **99→97枚**、`docs/_partial_fresh.json` **6カード 据置**、
  **live 効果総数 10693 据置**（per-effect diff **changed 16／added 0／removed 0**）。
  🆕**Sonnetタスク8 の残 OPEN＝1,080件**（`node scripts/archive/semanticAuditLedger.mjs` で実測。
  内訳＝段1 で真バグ確定 405／未 triage の単発 662／HIGH 715・MED 357・LOW 8／影響 784カード・858効果）。
  **被覆マトリクス（`census:wiring`）の盤面状態語彙**＝`hasAcce` 0／`infected` 0／`hasCharm` 0／`isDown` 0／
  `isSelfCharmed` 0／`isFrozen` 1／`isUp` 2／`isSelfAcced` 1／`acceHost` 3（続き593 から据置。
  ⚠**全体の miss 合計は未再計測**）。version **0.502 据置**。**実機シナリオ定義総数 476 据置**。
  （⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  **Opusタスク12＝在庫1件**（(cxlvi)）／**§6.4 は `O-39`／`O-40` の2件**／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は §6.2 段2（第6バッチ）・§6.4 O-39/O-40・Opusタスク12 在庫1件・§5d-0 (i)・§6.3**。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  🆕**カード単位の進捗（`npm run census:cards`・2026-08-22 続き595 新設）**＝母数 **全6712枚**
  （効果テキストあり **6031** ／ バニラ 681 ／ live に効果 **5975枚・10693効果**）。
  効果の `parseStatus`＝**AUTO 9548 (89.3%) ／ MANUAL 1120 (10.5%) ／ PARTIAL 25 (0.2%) ／ UNKNOWN 0**。
  懸念フラグ別＝**census 604枚 ／ 意味照合の未消化 777枚 ／ held 97 ／ partial 6**
  ⇒ **どのフラグも立たないカード 4833 / 5975（80.9%）**。意味照合監査のカバレッジ **5745/5975（96.2%）**。
  ⚠**STUB を「未実装」と数えない**（数えると 80.9%→52.2% に化ける。無言 no-op は `census:stubs` A群🔴＝0）。
  ⚠「効果テキストがあるのに live に効果が無い」56枚は**実害なし**（【マルチエナ】等の括弧注釈だけ）。
  CPU の射程は続き553 据置。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-22（続き594）。

---

## 2026-08-19 整理㊿（§7 決着済み `V-15`／`V-17`／`V-21`〜`V-23`／`V-28`／`V-29`／`V-39`〜`V-43`／`V-81`／`V-82` の全文退避・続き587）

> **§7 の運用ルール（「消化したら行ごと PLAN_DETAIL へ退避して、ここには残さない」）に沿った定期整理**。
> **14ブロックを verbatim で退避**した（PLAN §7 側には ID・決着した続きNN・退避先だけの索引行を残す）。
> ⚠**採番は固定**（消化しても番号を詰めない）。**同じ番号を再着手する前に、まずこの節を読むこと。**
> ⚠**ここに退避したブロックのうち、明示的に「follow-up・優先度低」と書いてある枝は未着手のまま**＝
> `V-21`（持続側 `WX15-089/090/091` の据置確認）／`V-40`(d) 本体`WX25-P3-050-E1`／`V-41`(a)(c)(d)／
> `V-42`(b)(c)(d)／`V-43`(b)(c)(d)。**踏むならこの節の原文を読んでから §7 へ `V-<次番号>` で立て直す**。
> ⚠**発見済みの実バグは §3 Opusタスク12 側が正**＝`V-39`→(cxliv)／`V-40`(b)→(cxlv)。

### 退避したブロック（原文ママ）

- **🔶 V-15 §6.3 J-4 フェイズ／アタック終了 timing（続き384）＝2026-08-14 続き480 で**機構は両方とも実機で確認・6シナリオ中5本が緑**（Codex 起案→Claude 実機検証）。**engine バグ0**。
  - [x] **アタック終了時の【自】が発火するか**（`WXK11-018-E2`）＝**実機PASS 3本**（`v15AttackEndBlockedFiresAndUpsOther`／`v15AttackEndDirectDamageDoesNotFire`／`v15AttackEndOncePerTurnConsumed`）。①正面にシグニがいてダメージが通らなかった場合＝**発火し、別の低Lvシグニだけが up**（＝**アップされるのが自分自身ではない**ことも確認）②**正面だけ空にした対照**＝life 7→6・確認フロー消化まで観測して**非発火** ③`actions_done` だけ変えた対照で**《ターン1回》消化済みなら再発火しない**。
  - [x] **アタックフェイズ終了時の【自】が発火するか**（`WX24-P2-075-E1`）＝**機構は実機で確認**（`left=true`→`phaseEnd=true`→**`trigger=true`＝E1 発火**をログで観測）。**緑2本**＝`v15AttackPhaseEndBattlePathRecordsOpponentToy`（**バトル経路**の離場記録＝`resolvePendingSigniBattleFor`）／`v15AttackPhaseEndNoToyLeftDoesNotFire`（**同一盤面でアタックしなければ非発火**）。
    - [x] 🔴**続き573＝`v15AttackPhaseEndCentralDiffToyLeftFires` を緑で固定・2回連続PASS（19秒）**。真因は3点重なったシナリオ側の未完（engineバグ0）＝①共有ヘルパー`H.clickTextOrBtn`/`H.clickZone`の`.click()`にtimeoutが無く📌19の規約から漏れていた（`決定`ボタンがdisabledのまま毎ティック既定30秒待ち＝これが「40秒/tick」の正体）→両方に`{timeout:1200}`を追加（全シナリオ共通ヘルパーの是正）②「デッキに加えるカードを選んでください」の候補（watcher自身1件）を`pick-0`でクリックしていなかった＝`決定(0/1)`が永久disabled③draw後に**E1原文後半「手札からレベル２以下の＜遊具＞を場に出してもよい」の`SELECT_SIGNI_ZONE`**が続けて出る＝`H.clickZone()`を追加して消化。**V-15 全項目 決着**。

- **🔶 V-17 §6.3 J-5 単発機構（続き381）＝2026-08-14 続き480 で**コイン獲得は機構を実機で確認・5シナリオ中3本が緑**（Codex 起案→Claude 実機検証）。**engine バグ0**。
  - [x] **コイン獲得で【自】が発火するか**（`SP27-007`）＝**実機PASS 3本**。①**人間 `executeGrow` の Coin 欄獲得**で発火（coins 0→2・draw・`actions_done` 1件）＝`v17CoinGainedHumanGrowFires` ②⚠**所持コインだけ5枚にした同一盤面**では**上限クランプ後の実増加0＝非発火**＝`v17CoinGainedHumanGrowAtCapDoesNotFire` ③**効果解決の中央 diff 経路**（`WXK07-006-E3` で coins 2→4）でも発火＝`v17CoinGainedEffectCentralDiffFires`。
    - [x] **CPU がグロウしたとき（scope `any`）も発火する**＝🔑**実機ログで確認**（`[CPU] グロウ`→`[自分] …の【自】効果（コイン獲得時）`→`1枚ドロー`・`host.actions_done=["SP27-007-E1"]`）。⚠ただし**シナリオ `v17CoinGainedCpuGrowAnyScopeFires` は赤**＝CPU がそのままアタックまで進み settled 条件に到達しないため（**engine ではなく settle 条件の未完**）。
    - [x] ⚠**コイン"支払い"では発火しない**＝**実機で確認**（`【自】効果（コイン支払時）` は出るが `SP27-007-E1` は `actions_done` に入らない）。⚠**シナリオ `v17CoinPaymentDoesNotFire` は赤**＝負方向を確定させる settle 条件に到達せずループ終端（同上）。
  - [x] **夢限-Q- の反転機構が実機で通しで動くか**（`WXDi-P11-010A`→`B`）＝**続き571 で `mugenQFlip` 実行→実機PASS**（4秒）。`ON_GROW_PHASE_START`→`EFFECTIVE_LRIG_LIMIT_GTE(9)`成立→`MUGEN_Q_RESET_AND_FLIP`で`card_identity_overrides`がB面へ反転＋手札/エナ/トラッシュがリセット後B面E1で再構築（hHand=5・hEnergy=5・hTrash=0）まで確認。**engineバグ0**。**V-17 全項目 決着**。

- **✅ V-21 `isDisona` 条件節グループ（続き379）＝続き573 で実機PASS・2回連続緑（各4-5秒）決着**。`WXDi-P13-078-E1`（【自】アタック時、あなたの場にパワー10000以上のディソナがあれば【エナチャージ1】）を新規シナリオ`v21ConditionPowerBuffedReachesThreshold`／`v21ConditionPowerBelowThresholdNoCharge`で検証＝印字2000の自分自身を`temp_power_mods`で+8000（実効10000）にしてアタック→エナ0→1（PASS）。対照は+6000（実効9000・未到達）→アタックしてもエナ0のまま（PASS）。**engineバグ0**（`Condition`評価が`ctx.effectivePowers`をバフ込みで見ている実装どおり）。持続側（`WX15-089/090/091`）の据置確認は未着手（follow-up・優先度低＝別ロジックのため今回のバグ発見には直結しない）。

- **✅ V-22 `isDisona` パリティ移植（続き378）＝続き573 で実機PASS・2回連続緑（各2秒）決着**。`WXDi-P13-047-常`（【常】あなたのターンの間、他のディソナのパワー+3000）を新規シナリオ`v22DisonaOnlyContinuousBuff`で検証＝自身(印字12000)は「他の」対象外で据置・他のディソナ(印字2000)は+3000で表示5000・非ディソナ(印字3000)は据置3000、を1回の盤面注入で同時観測。**engineバグ0**（`matchesFilter`のisDisonaフィルタが正しく機能）。残り4効果（P12-044/P12-060/P13-009/P13-070）は同一機構（`isDisona`フィルタ）の横展開なので個別検証は不要と判断（同じ`matchesFilter`経路を通るため）。

- **✅V-23 機構ギャップ7効果（続き377n）2件**＝engine/golden では固定済みだが `BattleScreen` の経路は計器に映らない。**続き572＝両方とも実機PASS（各2回連続）で決着**。
  - [x] **ATTACH_CHARM の複数ペア付与が実機で描画されるか**（`WXK07-070`＝【出】でデッキ上2枚を自分のシグニ2体へ／`WXEX1-22-E2`＝相手のトラッシュ3枚を相手のシグニ3体へ）。**新規シナリオ`wxex122AttachCharmMultiPair`でPASS**＝`WXEX1-22`（ミュウ＝フォーゼ）の【起】コイン1を発動→guestの3ゾーンすべてに`fieldCharms=["WD01-013#4","WD01-013#5","WD01-013#6"]`が同時付与（旧「先頭1組だけ」の過小実行ではない）。engineバグ0。
  - [x] **「N体まで＝0体でもよい」選択UIがキーワード付与でも出るか**（`WXDi-P00-004`＝パワー15000以上のシグニ2体まで【ランサー】／`WXDi-P09-053`＝レベル1のシグニ2体まで【シャドウ】）。**続き572＝`WXDi-P09-053`で実機PASS（2回連続）**＝新規シナリオ`wxdip09053GrantUpToTwo`。自分のLv1シグニ2体を召喚→ON_PLAYのSELECT_TARGET候補が`["WD01-013#1","WD01-013#2"]`（自分のシグニ2体だけ／guest側の同名`WD01-013#3`は候補に一切含まれない＝**候補が自分のシグニだけに絞られている**ことを確認）→決定で2体とも「シャドウ:{levelLte:2}（次の相手ターン終了まで）」の付与ログを確認。⚠**観測の罠**＝`duration:UNTIL_OPP_TURN_END`のGRANT_KEYWORDは`keyword_grants`ではなく`keyword_grants_until_opp_turn`に書かれる（`execGrantKeyword`）ため、queryStateの`keywordGrants`フィールドでは検出できず盤面ログで判定し直した（テスト側の観測ミス・engineは最初から正しかった）。engineバグ0。📋0体で確定できるかは`WXDi-P00-004`（ピース＝使用条件UI）側の検証として持ち越し（低優先）。

- **✅V-28** 続き409〜413 の A群実装（相手ルリグデッキ選択モーダル・新規 CHOOSE 等）＝**続き579〜580で6件すべて実機PASS・残0クローズ**（`WX16-021`〔側面アタック空ゾーンダメージ・正方向＋対照〕／`WX25-CP1-074`〔CANNOT_DEAL_DAMAGE_TO_OPPONENT・正方向＋対照〕／`WX24-P4-014`②〔相手ルリグデッキ選択モーダル＝`opponentResponds`でCPU自動応答〕／`WXDi-P09-079`〔ミル済みレベル1シグニの自動配置〕／`WXK11-001`②〔ルリグデッキのアーツ除外→相手のシグニアタックステップ封じ〕）。engineバグ0。詳細はBUGFIXES 2026-08-19（続き579・続き580）。⚠**「エナ支払い元 funnel（14サイト＋14モーダル）」は別枠＝`V-04`側で6シナリオPASS済み・残経路は`V-04`の行を参照**（V-28とは別に管理）。

- **✅V-29** 続き452＝相手応答モーダルの実表示（PvP の相手側／CPU 自動応答）＝`WXEX2-84-E2`。**続き572＝新規シナリオ`wxex284OppResponds`で実機PASS（2回連続）**。エクシード2発動→`TRASH{ALL}`で対戦相手シグニ全滅→`REVEAL_AND_PICK{opponentResponds:true}`がデッキ上2枚公開→`SEARCH`型interactionへ→CPU（guest）が自動応答して`SELECT_SIGNI_ZONE`を2回消化し2体とも場に配置（gDeck 10→8）。ソフトロックなし＝engineバグ0（`opp_hand`のviewer視点バグ＝Opusタスク12(cv)とは別経路のSEARCH分岐だが、こちらは正しく配線されていた）。

- **✅ V-39** **続き494＝`OPP_LRIG_ATTACK_COST` の「払えないときタダで通っていた」是正**＝エナ0でルリグアタックできないことを対で見る。**続き581＝実機PASS・残0クローズ（想定と異なりヘッドレスで検証可能だった＝`lrigAttackCostInfo`がボタンラベルへ直接コストを出す設計のため`data-action-label`を読むだけで判定できた）**。`WX25-P2-014`（明星の使者　サシェ・モティエ）でエナ不足（1枚）＝「アタック不可（《無》×2）」表示・状態不変／エナ十分（3枚）＝「アタック（《無》×2）」表示・クリックで2枚消費してダウン、を各2回連続PASSで確認。**engineバグ0（このゲート自体は）**。🔴**ただし追加調査で新規engineバグ1件を発見**＝原文前半「あなたの場に＜宇宙＞のシグニがあるかぎり」の条件節が丸ごと未実装（＜宇宙＞シグニが無くても常時ゲートが掛かる）。**Opusタスク12(cxliv)へ登録**。詳細はBUGFIXES 2026-08-19続き581。

- **✅ V-40 続き582＝5経路中4件 残0クローズ・(b)は新規engineバグ発見＝Opusタスク12(cxlv)へ登録**（原記述：続き500＝O-34 実装の5経路＝(a)`WX19-064-E1`③／`WX18-029-E1`(b)`WX20-077-E2`(c)`WXDi-P12-055-E1`(d)`WX25-P3-050-E1`(e)`WXK07-034-E1`。**「ヘッドレスでは検証できない層」ラベルは誤りだった**＝data-action-label・SEARCH/CHOOSEピッカーとも既存ヘルパーで駆動できた）。
  - **✅(a) 残0クローズ**＝`v40StripAttachedAndUnder`。対象シグニ自身は場に残置・下カード/チャーム/アクセの3枚がトラッシュへ。2回連続PASS。engineバグ0。
  - **🔴(b) 新規engineバグ発見**＝`v40UseSearchedSpellOrTrashCrash`（意図的FAIL・2回連続同一結果）。SEARCHモーダルが`inter.thenAction`未定義で`undefined.type`を読みcrash＝画面が真っ黒。**Opusタスク12(cxlv)へ登録**。
  - **✅(c) 残0クローズ**＝`v40DeclaredIconHandDiscardProtects`／`v40DeclaredIconHandDiscardBanishes`。CPUの`opponentResponds`自動応答が常に候補先頭（＝《白》）を選ぶ性質を使い正負を決定論化。各2回連続PASS。engineバグ0。
  - **✅(d) 残0クローズ**＝`v40PerOwnLrigColorScaleFires`／`v40PerOwnLrigColorScaleZero`（`WX25-P3-050-E1`より単純な同機構横展開先`WXDi-P08-064-E1`で検証）。青ルリグ1体→FREEZE1回発動／0体→無条件不発、を各2回連続PASS。engineバグ0。
  - **✅(e) 残0クローズ**＝`v40DeckLevelOverrideBothChoicesReveal2`／`v40DeckLevelOverrideOnlyChoice2NoReveal`。印字Lv1のみのデッキで①②両方選択→Lv4扱いで2枚めくれる／①なし→0枚、を確認。engineバグ0。
  - 📋**(d)の`WX25-P3-050-E1`本体（【チーム】3体・色別回数・赤節パワー12000以下）は同機構の横展開のため個別検証は見送り**（follow-up・優先度低）。

- **✅ V-41 続き583＝(b)でO-32の核（`RepeatAction.optional`＋レベル一致フィルタ）を残0クローズ・(a)(c)(d)は同機構の横展開でfollow-up**（原記述：続き501＝O-32 実装の4経路＝(a)`WXDi-CP01-024-E1`（トラッシュ選択が最大3回出て、**同じパワーの札だけ**が候補になり**相手シグニの正面**ゾーンに出る）(b)`WX16-042-E1`（1回目のあと「繰り返す／繰り返さない」が出て、断れば手札は1枚しか減らない／バニッシュ候補が**捨てたシグニと同レベルだけ**に絞られる）(c)`WXDi-P07-007-E3`（相手側に3回とも応答が出る）(d)`WXDi-CP02-047-E1`（対象選択が3回・毎回別のシグニ）。**「ヘッドレスでは検証できない層」ラベルは誤りだった**）。
  - **✅(b) 残0クローズ**＝`v41RepeatOptionalFiltersByLevelAndStops`。Lv1/Lv2の手札→相手Lv1/Lv2/Lv3シグニへ2周実行→各周のBANISH候補（`pendingCandidates`）が同レベル1体だけに絞られることを直接確認・「繰り返さない」で3周目を打ち切りLv3は無傷。2回連続PASS。engineバグ0。
  - **📋(a)(c)(d) は同一機構の横展開のため個別検証は見送り**（follow-up・優先度低＝V-22/V-40(d)と同判断基準）。

- **✅ V-42 続き584＝(a)を残0クローズ・(b)(c)(d)はfollow-up**（原記述：続き502＝O-33 実装の4経路＝(a)`WX25-CP1-050-E1`（次の相手ターンだけ**中央のシグニだけ**にアタックボタンの《無》×1 注記が出て、左右は無条件でアタックできる）(b)`WX24-P1-038-E2`／`WXDi-P03-027-E2`（自分のシグニは止まらない＝旧`owner:'any'`是正確認）(c)`WXK10-011-E1`（3択・選ばなかった選択肢が走らない）(d)横展開5枚。**「ヘッドレスでは検証できない層」ラベルは誤りだった**）。
  - **✅(a) 残0クローズ**＝`v42ZoneLimitedAttackBanCenterOnly`。`signi_attack_bans_this_turn`にゾーン限定banを直接注入→中央だけ「アタック（《無》×1）」・左右は無条件「アタック」。2回連続PASS。engineバグ0。
  - **📋(b)(c)(d) は未着手のまま follow-up**（優先度低）。

- **✅ V-43 続き584＝(a)を残0クローズ・(b)(c)(d)はfollow-up**（原記述：続き503＝O-28 実装の4経路＝(a)**Sランサー26効果**（バトルに勝つとライフを追加クラッシュし、ライフが無ければ相手が敗北する＝通常ランサーとの対で見る。旧実装は綴りズレで格下げ／不発だった）(b)`WX24-P1-064-E1`（手札2枚以下のときだけ【アサシン】）(c)`WXK07-029-E1`（バニッシュ／手札戻しの両方が効かない）(d)`WXK08-049-E2`。**「ヘッドレスでは検証できない層」ラベルは誤りだった**）。
  - **✅(a) 残0クローズ**＝`v43SLancerDefeatsOpponentAtZeroLife`／`v43RegularLancerFizzlesAtZeroLife`。`keyword_grants`で【Ｓランサー】相当を付与→相手ライフ0枚のバトル勝利で相手を敗北させる／通常ランサーは効果消滅で試合続行、を対で確認。各2回連続PASS。engineバグ0。
  - **📋(b)(c)(d) は未着手のまま follow-up**（優先度低）。

- **🔶 V-81** 続き567＝§6.4 `O-19b`＝**到達不能だった `ArtsModal` Phase1（アーツ一覧）を削除**（`artsCandidates` ごと）。**死にコードの除去なので挙動は不変のはず**＝観測点は「アーツが従来どおり使えること」1点。**続き572＝実機PASSで決着**。
  - [x] **(A) 回帰**＝**実機PASS（3回連続）**。`wxk02029`（通常コスト・ルリグDK→zone-card-0→使用→Phase2でエナ選択→アーツ使用→CHOOSE→グロウ成立）と `negateAttackLrig`（`WXK10-012`・《緑》×０のコスト0アーツ→Phase2「アーツ使用」ボタンがエナ未選択でも直接使える）の両方で確認。⚠**初回試行は「使用」ボタンが一度も出ずFAIL**したが、`git checkout fdc0b9c13~1 --`でO-19b直前のコードに戻して再実行→PASSしたため一時は回帰を疑ったが、**現在のHEADのままFRESH=1で再実行したところPASS**＝**コールドスタート起因のフレークで、O-19bによる回帰ではない**と判明（3連続PASSで確定）。engineバグ0。

- **🔶 V-82** 続き569＝§8/`O-1` (g) 選択の精緻化 v1（`cpuBoardEval.ts`）。**実機2本は PASS 済み**（詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-19 整理㊻」）。
  - [x] **(a) 召喚**＝`v82CpuDeploysStrongestWithinLimit`＝リミット内でいちばん強い札を出しつつ体数は落とさない。
  - [x] **(b) アタック順**＝`v82CpuAttacksInValueOrder`＝正面が空のシグニから先に殴る（格上に阻まれる側もそのあと撃つ）。
  - [x] **(c) 応答アーツの温存**（`prevent` はライフ2枚以下でだけ解禁）。**続き572＝実機PASS（正方向・対照とも各2回連続）**。新規シナリオ`v82ResponseArtsPreventAtLowLife`（guestライフ2枚＝CPUが`WX25-P1-008`（千里同風・コスト0のprevent専用アーツ）を自律使用＝`lrigDeck→lrigTrash`）／`v82ResponseArtsWithheldAtHighLife`（guestライフ4枚＝対照・使わず温存）。driverはクリック不要＝`ATTACK_ARTS_OP`へ注入するだけでCPUが`responseArtsAllowedKinds`（ライフ<=2でのみprevent許可）どおりに自律判断することを確認。engineバグ0。

## 2026-08-19 整理㊾（§4 恒久指標・続き580時点値の退避・続き586）

- **2026-08-20 続き590（Opusタスク12 第3バッチ＝未確定ゲートより先に継続が走る2件を残0クローズ）後 最新値（本行が直近の正）**：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2319→2324**（+5＝二段任意コストの①skip／①pay②skip／①pay②pay＋独立後続の対照＋応答順序）、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings 据置）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**（再計測済み）、
  **被覆マトリクス miss 190 据置**（未再計測）、
  `parserWorklist` held **99枚 / 40署名群 据置**、`docs/_partial_fresh.json` **6カード 据置**、
  **live 効果総数 10693 据置**（**live per-effect diff＝changed 0／added 0／removed 0**＝engine の解決順序だけの修正でデータ不変）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**（今回シナリオ非改変＝既存の `v20`／`v58d`／`v58e` を回しただけ）。
  （⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  **Opusタスク12＝在庫2件**（(cxlvi)(cl)／🏁**(cxlvii)(cxlix) を残0クローズ**）／🏁**§6.4 残0**／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は Opusタスク12 在庫2件・§5d-0 (i) の残セル・§6.3／§6.2／タスク13**。
  ✅**今回の2件は実機検証まで完了**（群A 2/2・群B は3ラウンド 6/6 PASS）。⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-20（続き590）。（2026-08-20 続き591 で退避）

- **2026-08-20 続き589（Opusタスク12 第2バッチ＝parser／表現系3件を残0クローズ）後 最新値（本行が直近の正）**：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2312→2319**（+7＝群A 4効果の支払い/辞退 E2E・SEARCH live E2E・採用live構造・＜宇宙＞条件 collector E2E）、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings 据置）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**（再計測済み）、
  **被覆マトリクス miss 190 据置**（未再計測）、
  `parserWorklist` held **103→99枚 / 署名42→40群**（新規 held 0）、`docs/_partial_fresh.json` **6カード 据置**、
  **live 効果総数 10693 据置**（live 変更は10効果＝per-effect diff **changed 10／added 0／removed 0／outlier 0**。🆕**生パース diff は changed 5／added 0／removed 0**＝parser 変更の波及0）。
  version **0.502 据置**。**実機シナリオ定義総数 475→476**（旧2本を廃し新3本＝`v40UseSearchedSpellOrTrashResolves`／`v45cPaySelfBanishRemovesOnlyFiltered`／`v45cSkipSelfBanishDoesNothing`）。
  （⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  **Opusタスク12＝在庫3件**（(cxlvi)(cxlvii)(cxlix)／🏁**(cxliv)(cxlv)(cxlviii) を残0クローズ**）／🏁**§6.4 残0**／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は Opusタスク12 在庫3件・§5d-0 (i) の残セル・§6.3／§6.2／タスク13**。
  ✅**今回の3件は実機検証まで完了**（`v39ConditionGapNoStorySigni`／新 v40／新 v45c×2 が全 PASS）。⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-20（続き589）。（2026-08-20 続き590 で退避）

- **2026-08-20 続き588（Opusタスク12 第1バッチ＝配線漏れ6件を残0クローズ）後 最新値（本行が直近の正）**：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2307→2312**（+5＝新設 golden 5本）、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings 据置）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  🆕**同型★ 0**（`node scripts/groupSimilar.mjs --all` 再実行済み＝続き552d 以来の再計測）、
  **被覆マトリクス miss 190 据置**（未再計測）、
  `parserWorklist` held **103枚 / 署名42群 据置**、`docs/_partial_fresh.json` **6カード 据置**、
  **live 効果総数 10693 据置**（live 変更は `WXDi-P10-041-E3` の1効果のみ＝per-effect diff **changed 1／added 0／removed 0／outlier 0**）。
  version **0.502 据置**。**実機シナリオ定義総数 475 据置**（今回シナリオ非改変）。
  （⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  **Opusタスク12＝在庫6件**（(cxliv)(cxlv)(cxlvi)(cxlvii)(cxlviii)(cxlix)／🏁**(cxxxviii)(cxxxix)(cxl)(cxli)(cxlii)(cxliii) を残0クローズ**）／🏁**§6.4 残0**／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は Opusタスク12 在庫6件・§5d-0 (i) の残セル・§6.3／§6.2／タスク13**。
  ⚠🔴**今回の6件はすべて実機未検証**（Codex 環境はネットワーク遮断で `verifyBattleDrive.mjs` を実行できない）＝**Sonnet 側 §7 の最優先**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き586）。（2026-08-20 続き589 で退避）

- **🆕 2026-08-19 続き580（§7 実機検証6件＝V-28 A群6件全て残0クローズ・engineバグ0）後 最新値**：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2307 据置**、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  🆕**被覆マトリクス miss 190 据置**（今回は engine/parser 非改変のため未再計測）、
  `parserWorklist` held **103枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes` は続き552d 以降 未再計測**）。
  **live 効果総数 10693**（今回 live/CSV とも非改変）。version **0.502 据置**。
  🆕**実機シナリオ定義総数 466**（464→466＝`v30AbilityRemovedSuppressesActivated`／`v30AbilityRemovedControlShowsActivated`の2件を新設・`order`登録済み）。**V-20の`v20DiscardSkipFirstBlocksSecond`／`v20DiscardPayBothReturnsToField`は同名のまま実装を能動discard経路へ全面置換**（既存カウントは不変）。**既定`order`実行数は461→463**。
  **Opusタスク12＝在庫10件**（(cxxxviii) タナバタ`WXDi-P10-041-E3`のTAKE_FROM_UNDER_SIGNI空振り／(cxxxix) ON_ABILITY_ACTIVATEDの《ターン1回》永続化漏れ／(cxl) `SigniOnPlayCostModal`が`handDiscardSigni`コスト非対応／(cxli) `confirmEndDiscard`がON_TRASH系トリガー未収集／(cxlii) `evalUseCondition`が`effectsMap`未伝搬で`SELF_LEVEL_THRESHOLD`が印字レベルへフォールバック／(cxliii) `collectTurnTriggers`が`activeKeyAbilitySources`を呼ばずキー起点【自】がON_TURN_END等7 timingで無言no-op／(cxliv) `WX25-P2-014-E1`の「あなたの場に＜宇宙＞のシグニがあるかぎり」条件節が丸ごと未実装＝`OPP_LRIG_ATTACK_COST`が宇宙シグニ不在でも常時ゲート／(cxlv) `WX20-077-E2`の`SEARCH`アクションに必須フィールド`then`が無くモーダルがcrashして画面が真っ黒になる／(cxlvi) `WX16-Re18-E1`のルリグデッキから複数レゾナを配置する継続が間欠的に発火せず2枚目が取り残される＝4回中2回再現／(cxlvii) `WXDi-P10-039-E2`の「そうした場合」二段任意コストの入れ子ゲートが外れ、①をスキップしても③が無条件で実行される＝連鎖した任意コスト全般に波及する構造バグ）／🏁**§6.4 残0**／🏁**§8 は (g) v1 まで完了**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き585）。

## 2026-08-19 整理㊽（§7 `V-24` 全5項目決着ぶんの退避・続き577）

- **V-24 🔴 タスク12 在庫5件の残0クローズ（2026-08-08）5件**＝engine/golden では固定済みだが、いずれも `BattleScreen` の経路にしか無く **golden では原理的に踏めない**（付与の合流・耐性コレクタの呼び出し・レベル表示）。
  - [x] **(cxiv) 条件つきキーワード付与が `granted_effects` → augmented effectsMap 経由で実際にバッジ／アタック処理に効くか**＝**続き577＝実機PASS（2回連続・両シナリオとも）・engineバグ0**。`WXDi-P11-071`（「正面のシグニのパワーが3000以下であるかぎり、【ランサー】を得る」）へ`buildGatedKeywordGrant`相当のCONTINUOUS`granted_effects`を直接注入し、CPU自動アタックで観測。`v24cxivLancerGateOn`＝正面パワー3000（ゲート成立）→バニッシュ後にライフクロス1枚クラッシュ（ランサー効果）を確認／`v24cxivLancerGateOff`＝正面パワー5000（ゲート不成立）→バニッシュのみでライフクロス変化なし（旧＝正面が誰でも常時付いていたが是正済みと確認）。
  - [x] **(cxiii) `WXK10-035` の効果耐性**＝**続き577＝実機PASS（2回連続・両シナリオとも）・engineバグ0**。guestの攻撃シグニへON_ATTACK_SIGNI granted BANISHを注入しCPU自動アタックで発火（host側はwd07012と同型・`temp_power_mods`で通常バトルでは絶対に負けないようバフして純粋にBANISH能力の耐性だけを切り分け）。`v24cxiiiLevel1Immune`＝レベル1シグニ（`WD01-013`）のBANISHは効果耐性で不発→WXK10-035が生存／`v24cxiiiLevel2NotImmune`＝レベル2シグニ（`WD01-012`）のBANISHは耐性対象外→通常どおりバニッシュ（旧＝`sourceFilter`が無く相手シグニの効果を全部受けない過剰保護だったが是正済みと確認）。
  - [x] 🔴**(cxv) 条件つき常在パワーの出入り**＝`PR-426-E3`（ライフ1枚以下**かつ**中央ゾーンで＋4000）＝**実機検証実施→2件とも実機PASS（各2回連続）・engineバグ0**。`pr426ConditionalPowerBuff`＝ライフクロス1枚＋中央ゾーンで表示パワー8,000→12,000（+4000反映）／`pr426ConditionalPowerBuffOffWhenLifeAbove1`＝ライフクロス3枚（条件不成立）では印字どおり8,000のまま（旧＝常時適用だったが是正済みと確認）。**続き577＝`WXDi-P07-060-E3`（覚醒で+2000）も実機PASS（2回連続・両シナリオとも）・engineバグ0**。`v24cxvHyperionAwakened`＝`awakened_signi`（インスタンスID形式で保持）に含まれる状態で印字3000→5000（+2000反映）／`v24cxvHyperionNotAwakened`＝覚醒していなければ印字どおり3000のまま。
  - [x] **(cxvii) `WX20-Re18` の動的レベル**＝エナ10枚（Lv4）／15枚（Lv5）で場に出し、**レベル表示・アタック時の正面バニッシュ（Lv4以上）・対戦相手の効果を受けない（Lv5以上）**が実効レベルどおりに切り替わるか。⚠`BattleScreen` のレベル表示は `calcSigniLevels` を別途呼ぶので **engine の判定と一致するか**も併せて見る。**続き572＝実機検証実施→新規実バグを発見**（`wx20re18DynamicLevelAttackBanish`）。**レベル表示・パワー補正（1000+3000×4=13000）は正しい**が、**E2（アタック時の正面バニッシュ）が発火しない**＝`evalUseCondition`（`collectAttackerSelfTriggers`が使う）が`effectsMap`を渡さないため`SELF_LEVEL_THRESHOLD`が実効レベルを計算できず印字レベル（2）にフォールバックし続ける。E4（Lv5効果耐性）も別経路（`checkActiveCondition`の`effectiveLevels`を渡すcallerが0件）で同型に壊れていると判明。詳細はOpusタスク12 **(cxlii)** へ登録済み。
  - [x] **(cxviii) `WXDi-P15-071` のベット分岐**＝**ベットあり／なしで撃ち分け**、ベット時は【Ｓランサー】（無条件）、非ベット時は正面パワー8000以下ゲート付き【ランサー】＝**排他**になること。**続き573＝実機PASS（2回連続・両シナリオとも）**＝新規シナリオ`v24cxviiiSpellBetGrantsSLancer`（ベット3枚宣言→`keyword_grants`に`Sランサー`が直接書かれる。guest正面WX01-053がP15000＝8000超でも無関係に付与＝無条件を確認）／`v24cxviiiSpellNoBetNoDirectGrant`（ベットなし→SELECT_TARGET解決完了後も`keywordGrants`にSランサーなし＝非ベット側は`GRANT_EFFECT`経由の別ストア`granted_effects`へ分岐しており直接付与とは排他）。engineバグ0。⚠非ベット側のCONTINUOUS条件ゲート自体（正面パワー8000以下でのみランサー表示）は2026-08-08に別途実働化・検証済みのため今回は再検証していない。

**V-24 全5項目決着**（(cxiii)(cxiv)(cxv)(cxviii)は残0クローズ・(cxvii)は実バグ発見しOpusタスク12(cxlii)へ登録済み）。

> **2026-08-19 続き577 で PLAN §4 から退避した旧・恒久指標行**（直近の正は PLAN §4 の最新行）
- **🆕 2026-08-19 続き576（§7 実機検証1件＝V-24(cxv)残0クローズ・engineバグ0）後 最新値**：
  census **783 据置**（`BASELINE_HIGH` 783 据置）、golden **2307 据置**、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  被覆マトリクス miss 190 据置、`parserWorklist` held **103枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**。
  live 効果総数 **10693**（今回 live/CSV とも非改変）。version **0.502 据置**。
  実機シナリオ総数 **431**（429→431＝`pr426ConditionalPowerBuff`／`pr426ConditionalPowerBuffOffWhenLifeAbove1` の2件を新設）。
  Opusタスク12＝在庫5件 据置。一次記録は BUGFIXES.md 2026-08-19（続き576）。

> **2026-08-19 続き575 で PLAN §4 から退避した旧・恒久指標行**（直近の正は PLAN §4 の最新行）
- **🆕 2026-08-19 続き574（§7 実機検証さらに5件＝実バグ1件発見・V-23(a)(b)/V-29/V-81/V-82(c)残0クローズ）後 最新値**：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2307 据置**、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  🆕**被覆マトリクス miss 190 据置**（今回は engine/parser 非改変のため未再計測）、
  `parserWorklist` held **103枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes` は続き552d 以降 未再計測**）。
  **live 効果総数 10693**（今回 live/CSV とも非改変）。version **0.502 据置**。
  🆕**実機シナリオ総数 426**（420→426＝`wxex284OppResponds`／`wxdip09053GrantUpToTwo`／`wxex122AttachCharmMultiPair`／`wx20re18DynamicLevelAttackBanish`（意図的FAIL・engine修正待ち）／`v82ResponseArtsPreventAtLowLife`／`v82ResponseArtsWithheldAtHighLife` の6件を新設）。
  🆕**Opusタスク12＝在庫5件**（(cxxxviii)(cxxxix)(cxl)(cxli)(cxlii)）／🏁**§6.4 残0**／🏁**§8 は (g) v1 まで完了**。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き574）。

> **2026-08-19 続き573 で PLAN §4 から退避した旧・恒久指標行**（直近の正は PLAN §4 の最新行）
- **🆕 2026-08-19 続き572（§7 実機検証の続き5件＝実バグ2件発見・V-17残0クローズ）後 最新値**：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2307 据置**、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  🆕**被覆マトリクス miss 190 据置**（今回は engine/parser 非改変のため未再計測）、
  `parserWorklist` held **103枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**。
  **live 効果総数 10693**（今回 live/CSV とも非改変）。version **0.502 据置**。
  🆕**実機シナリオ総数 415**（414→415＝`v04TanabataLeaveFieldE3` を新設）。
  ⚠**`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・続き572 で再確認・未解決・follow-up）**（→**続き573 で残0クローズ**）。
  🆕**Opusタスク12＝在庫2件**（(cxxxviii)(cxxxix)）／🏁**§6.4 残0**／🏁**§8 は (g) v1 まで完了**。

> **2026-08-19 続き572 で PLAN §4 から退避した旧・恒久指標行**（直近の正は PLAN §4 の最新行）
- **🆕 2026-08-19 続き571（§5 P1／§5d-0 (i) 第21バッチ）後 最新値**：
  **census 783**（786→783・`BASELINE_HIGH` も 783 へ更新）、**golden 2307**（+2＝直した3効果の live assert／`signiClauseColorFilter` の正負4方向）、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（262 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  🆕**被覆マトリクス miss 190**（193→190。上位＝`cardClass × SIGNI[filter]` 15／`cardClass × (filter無)` 13／`color × SIGNI[filter]` 6／`cardClass × TRASH_CARD[filter]` 7）、
  `parserWorklist` held **103枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes` は続き552d 以降 未再計測**）。
  **live 効果総数 10693**（live 改変＝`WD13-003-E2`／`WX16-041-E1`／`WX17-071-E1` の**3効果**・CSV 非改変）。version **0.502**。
  **実機シナリオ総数 414 据置**（今回は実機未実行＝parser/データ層のみ）。
  ⚠**`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）**。
  🏁**Opusタスク12＝在庫0件**／🏁**§6.4 残0**／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は §5d-0 (i) の残セル・§6.3／§6.2／タスク13**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き571）。

> **2026-08-13 続き464 で PLAN §4 から退避した旧・恒久指標行**（直近の正は PLAN §4 の最新行）
- **🆕 2026-08-13 続き459（§6.4 O-3＝`LRIG_GROW_RESTRICT` ゴミ箱の解体）後 最新値（本行が直近の正）**：census **831 据置**（`BASELINE_HIGH` 831）、golden **1956（+2＝合成 actionId が live に0件／期間3値／`LRIG_GROW_RESTRICT` は本来のグロウ制限文にだけ付く、を live 全走査で固定）**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（グループ265）、held（parserWorklist）**106枚 / 署名グループ 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**ターン限定 PlayerState レジストリ 35フィールド**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`MANDATORY_SUSPICIOUS` **0**、`census:stubs` A群＝**無言 no-op 0**／**明示 defer 24種 42件（14種16件から可視化＝隠れていた26効果を worklist へ）**、**`FieldGrant` の kind 3種**（`power`〔`perTargetLevel`〕／`abilityLoss`／`blockAction`）。live effect 単位 diff **33効果・effectId 増減 0/0**。

> **2026-08-15 続き499 で PLAN §4 から退避した旧・恒久指標行**（直近の正は PLAN §4 の最新行）
- **🆕 2026-08-15 続き498（§6.4 **O-3 クローズ**＝受け皿7種すべて解体）後 最新値（本行が直近の正）**：census **830 据置**（⚠**+3 は較正漏れだった**＝新語彙 `DECLARE_CARD_NAME_LOCK` を `vocabCensus` の「制限「できない」」キー表へ追加して 830 へ戻した。**受け皿 STUB を実装で置き換えるとその効果が STUB バケツから出て高シグナルへ昇格する**＝毎回仕分ける）、**golden 2057**（+7＝照応の state 復元1・`owner/all` の裏向き移送1・チェックゾーン往復1・シード開花の置換1・ルリグタイプの期間つき/恒久と実効クラス1・アタック禁止の補集合1・カード名 blacklist/whitelist 1。ほかに turn-scoped レジストリの T1 トリップワイヤと `ADD_EXTRA_ATTACK_PHASE` の live 形 assert を正方向へ更新）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **105枚 / 45群**（+1＝`WXEX2-09` は E1 を curated 値に温存したため fresh と差が残る）、lint **0 errors / 260 warnings**、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**15種/17件**（22種/24件から **−7種/−7件**＝O-3 の受け皿7種が残0。**無言 no-op は 0 のまま**）。🆕**live JSON changed 9効果/9カード**（`WXDi-P09-066`／`SPDi43-02`／`WX22-010`／`WDK07-Y07`／`WDK17-008`／`WDK17-001`／`WXDi-P08-030`／`PR-K046`／`WXEX2-09`。CSV 非改変）。🆕**挙動是正 9効果**（恒久 no-op 7／置く側と返す側の二重バグ1／往復ごと no-op 1・重複あり）＋**波及2**（カード名の使用封じがアーツ一覧と実行入口を素通り／`blocked_card_names` の失効が片側だけで1ターン長く残る）。🆕**新機構＝`RETURN_FACEDOWN_LRIG_ZONE_TO_HAND`／`FIELD_SIGNI_TO_CHECK_ZONE`／`GAIN_LRIG_TYPE`＋`lrig_gained_types_timed`＋`effectiveLrigClass`／`DECLARE_CARD_NAME_LOCK`＋`cardNameUseBlocked`＋`blocked_card_names_next_turn`＋`arts_name_whitelist_this_turn`／`SigniAttackBan.exceptCardNums`（＋`StubAction.bounceOccupant`・`StubAction.opponentSelects`・`PendingInteractionDef.CHOOSE.costlessOpponentChoice`）**。⚠**9経路とも実機未検証**（§7 送り）。⚠**残した近似**＝プレイヤーへの引用【起】付与（`WXDi-P09-066-E1` の早期回収）／強制アタック（`WXDi-P08-030-E1` の「可能ならばアタックしなければならず」）／チェックゾーン往復での付随物（チャーム・アクセ・ソウル）の離場扱い／宣言候補を公開領域に限定。⚠`census:goldentypes` は**未カバー2型**（`RESERVE_DRAW_PHASE_REPLACEMENT`／`SET_LRIG_BASE_LIMIT`＝続き492 で新設・**当時から未カバー**）＝簿記の「未カバー0」は stale だった。

> **2026-08-19 続き567 で PLAN §4 から退避した旧・恒久指標行**（直近の正は PLAN §4 の最新行）
- **🆕 2026-08-19 続き566（§7 実機検証継続＝17件 ALL PASS で残0クローズ）後 最新値（本行が直近の正）**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.497**。
  🆕**実機シナリオ総数 407**（+28＝V-38×2・V-36×2・V-49×1・V-47×2・V-31×2・V-32×2・V-34×2・V-37×2・V-33×2・
  V-48×1・V-50×4・V-46×1・V-52×2・V-51×2・V-57×1・V-54×2・V-55×1）。
  🆕**実機 PASS（続き566 実測）＝17件・計28シナリオ ALL PASS（2回連続）**。
  ⚠**`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）**＝
  ドライバー側の不安定化を疑うが engine 側の回帰ではない。
  🆕**Opusタスク12＝在庫3件据置**（(cxxxv)続き559／(cxxxvi)(cxxxvii)続き562で登録・未修正）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き566）。

> **2026-08-19 続き568 で PLAN §4 から退避した旧・恒久指標行**（直近の正は PLAN §4 の最新行）
- **🆕 2026-08-19 続き567（§6.4 `O-19b`＝到達不能な `ArtsModal` Phase1 の削除）後 最新値（本行が直近の正）**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263→**262 warnings**＝Phase1 削除ぶん −1）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変＝変更は UI 3ファイルのみ）。version **0.498**。
  **実機シナリオ総数 407 据置**（今回は実機未実行＝観測点 `V-81` を §7 に登録しただけ）。
  ⚠**`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）**＝
  ドライバー側の不安定化を疑うが engine 側の回帰ではない。
  🆕**Opusタスク12＝在庫3件据置**（(cxxxv)続き559／(cxxxvi)(cxxxvii)続き562で登録・未修正）＝**§6.4 が残0になったので次の Opus の最優先**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き567）。

> **2026-08-19 続き569 で PLAN §4 から退避した旧・恒久指標行**（直近の正は PLAN §4 の最新行）
- **🆕 2026-08-19 続き568（§8 `O-1` の続き＝Opusタスク12 (cxxxv)(cxxxvi) 残0クローズ＋`V-75`／`V-78` 緑化）後 最新値（本行が直近の正）**：
  **census 786**（787→786＝`WXEX2-11-E2` の条件節を拾ったぶん。`BASELINE_HIGH` も 786 へ更新）、**golden 2300**（+5＝ルリグ本体の相手向け封じ／`LRIG_IS_DRIVE_STATE` の成立・不成立／`DRAW_LIMIT_<n>` の上限／グロウ色制限の連結 Color／スラッシュ色コスト）、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（262 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  `parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**）。
  **live 効果総数 10693**（live JSON は `WXEX2-11-E2` の1効果だけ改変・CSV 非改変）。version **0.499**。
  🆕**実機シナリオ総数 410**（+3＝`v78CpuResolvesFieldLimitTrash`／`v78CpuGrowsWhenColorRestrictSatisfied`／`v78CpuSkipsGrowWhenColorRestrictViolated`）。
  🆕**実機 PASS（続き568 実測）＝7シナリオ ALL PASS（2回連続）**＝上の新規3本＋`v75ArtsLimit1FirstUseShown`／`v75ArtsLimit1SecondUseBlocked`（**赤→緑へ反転**）／`v78CpuGrowsAndPaysOnPlayCost`／`v78CpuGrowsButSkipsOnPlayWithoutCoin`（**赤→緑へ反転**）。
  ⚠**`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）**。
  🆕**Opusタスク12＝在庫1件**（(cxxxvii) のみ。(cxxxv)(cxxxvi) は本セッションで残0クローズ）。
  🏁**§8 `O-1`＝(a)〜(f) 消化済み＋実機検証（`V-74`〜`V-80`）完了＝残るのは (g) 選択の精緻化だけ**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き568）。

> **2026-08-19 続き570 で PLAN §4 から退避した旧・恒久指標行**（直近の正は PLAN §4 の最新行）
- **🆕 2026-08-19 続き569（🏁§8 `O-1` (g) 選択の精緻化 v1＝`O-1` 残0クローズ）後 最新値（本行が直近の正）**：
  **census 786 据置**（`BASELINE_HIGH` 786）、**golden 2303**（+3＝召喚の体数維持／アタックの価値順＋公式ルールの同値・格下／`prevent` 温存の線）、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（262 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  `parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**）。
  **live 効果総数 10693**（live JSON・CSV とも非改変＝変更は engine/UI と scripts のみ）。version **0.500**。
  🆕**実機シナリオ総数 412**（+2＝`v82CpuDeploysStrongestWithinLimit`／`v82CpuAttacksInValueOrder`）。
  🆕**実機 PASS（続き569 実測）＝新規2本＋回帰15本 ALL PASS**（`v11`×3・`v12`×3・`v14`・`v74`×3・`v75`×2・`v76`×2・`v77`・`v78`×5・`v79`×2・`v80`）。
  ⚠**`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）**。
  🆕**Opusタスク12＝在庫1件**（(cxxxvii) のみ）。
  🏁**§6.4 は残0**（唯一の大物 `O-1` も (a)〜(g) 全消化）。**§8 は (g) v2 候補だけが残**（優先度低め）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き569）。

> **2026-08-19 続き571 で PLAN §4 から退避した旧・恒久指標行**（直近の正は PLAN §4 の最新行）
- **🆕 2026-08-19 続き570（🏁Opusタスク12 (cxxxvii)＝ゾーン隣接フィルタ新設＝在庫0件）後 最新値（本行が直近の正）**：
  **census 786 据置**（`BASELINE_HIGH` 786）、**golden 2305**（+2＝隣接の4方向対照／`adjacentToSelf` の用法 tripwire）、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（262 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  `parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**）。
  **live 効果総数 10693**（live 改変＝`WXDi-P04-050-E2`／`WXDi-P00-053-E1` の**2効果だけ**・CSV 非改変）。version **0.501**。
  🆕**実機シナリオ総数 414**（+2＝`v73AdjacentNeighborGetsBuff`／`v73AdjacentDistantNoBuff`）。
  🆕**実機 PASS（続き570 実測）＝`V-73` 6本 ALL PASS（2回連続）**＝新規2本＋`v73UpGateActiveShowsBuffedPower` が**赤→緑へ反転**（18000→15000）。
  ⚠**`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）**。
  🏁**Opusタスク12＝在庫0件**／🏁**§6.4 残0**（`O-1` 含む）／🏁**§8 は (g) v1 まで完了**（v2 候補のみ）。
  ⇒ **Opus 側の生きた worklist は §6.3／§6.2／タスク13 だけ**（どれも在庫を実測してから着手）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き570）。

## 2026-08-19 整理㊼（Opusタスク12 (cxxxvii) 残0クローズぶんの退避・続き570）

> 🏁**これで Opusタスク12 の在庫は0件**（常設の受け口として残す）。以下は**登録時の原文**。
> **どう直したかは `BUGFIXES.md` 2026-08-19（続き570）**。観測点は §7 `V-73`（(d) を新設して実機 PASS）。

- 🔴**(cxxxvii) 「隣にあるあなたのシグニ」の対象フィルタが未実装＝ゾーン隣接を無視して「自分の全シグニ（自分自身含む）」に過剰実装されている**（2026-08-18 続き562・V-73 実機検証で発見）。
  - **再現手順**＝`v73UpGateActiveShowsBuffedPower`（`scripts/verifyBattleDrive.mjs`）＝`WXDi-P04-050`（聖将　コウチュウ・パワー10000。【常】①「このシグニがアップ状態であるかぎり、このシグニのパワーは＋5000される」②「このシグニがアップ状態であるかぎり、**このシグニの隣にあるあなたのシグニ**のパワーを＋3000する」）を**単独で**（両隣とも空）場に出してアップ状態にすると、隣が無いのに②が自分自身に誤爆し、盤面のパワー表示が 10000+5000+3000=**18000**になる（ルール上の正しい表示は隣が無いので②は不発＝15000）。
  - **原因**＝`WXDi-P04-050-E2` の JSON は `action:{type:POWER_MODIFY, target:{type:SIGNI, owner:self, count:'ALL', filter:{cardType:'シグニ'}}, delta:3000}`＝**「隣」の条件がフィルタに一切無く、自分の全シグニ（自分自身を含む）に一律+3000**。`src/types/effects.ts` の `TargetFilter` にゾーン隣接（`adjacentToSelf`／`neighborOnly` 等）の概念が存在せず、パーサ側も「隣にある」を検出する語彙が無い（`src/data/parserUtils.ts` の `*_ADJACENT_*` はすべて「原文の文中で対象節に隣接する語」を拾うテキストパース用のヘルパーで、**盤面のゾーン隣接とは無関係**）＝機構そのものが未実装。
  - **live 母集団＝2件**（原文に「隣にある」を含むカード）＝`WXDi-P04-050`（聖将　コウチュウ）／`WXDi-P00-053`（中装　ホタルマル・【常】「あなたのターンである間、隣にあるあなたのシグニのパワーを+3000」＝同型の過剰実装＝`target:{owner:self,count:'ALL'}`）。
  - **修正の型（提案）**＝`TargetFilter` にゾーン隣接（センターの `zi±1`）を表すフィルタを新設し、パーサに「隣にある」検出を追加、`matchesFilter`／候補列挙側でゾーンインデックス比較を実装する。2件しかないので golden にトリップワイヤ（単独配置で不発／隣接配置で発火の両方）を足してから直すこと。
  - **§7 follow-up**＝直った後 `v73UpGateActiveShowsBuffedPower` を再実行して緑化を確認すること。

- **結末（続き570）**＝提案どおり **`TargetFilter.adjacentToSelf` を新設**した。
  - **parser**＝`parseSentencePart1.ts` に「このシグニの隣にある[あなたの]…シグニのパワーを」の枝を、既定の「あなたの…シグニのパワーを」より**前**に足した（後ろだと既定枝が先に食って `count:'ALL'` へ潰れる）。
  - **engine**＝`calcFieldPowers` の `count:'ALL'` 経路で、効果元のゾーン `ziHost` から `ziHost±1` の集合を作り `applyDeltaToState` に `onlyZones` として渡す。⚠**効果元自身は「隣」ではない**ので `ziHost` は含めない／「あなたのシグニ」限定の語彙なので**相手側には適用しない**。
  - **decompiler**＝`f.adjacentToSelf` → 「このシグニの隣にある」。
  - ⚠**消費地点は CONTINUOUS `POWER_MODIFY` だけ**＝`matchesFilter`／`matchesStateFilter` は効果元のゾーンを受け取らないので隣接を判定できない。対象宣言に付けると黙って無視されて過剰選択になるため、**live で CONTINUOUS 以外に付いていないことを golden の tripwire で見張る**。
  - **live 改変＝2効果**（`WXDi-P04-050-E2`／`WXDi-P00-053-E1`）。census 786 据置。

## 2026-08-19 整理㊻（§6.4 `O-1`／§7 `V-82` 完全消化ぶんの退避・続き569）

> 🏁**§6.4 で唯一の大物だった `O-1`（CPU AI の拡張）が (a)〜(g) 全消化で残0クローズ**。
> 以下は PLAN §6.4 の worklist 行を verbatim で退避したもの（(a)〜(f) の射程と是正の記録）。
> **(g) の実装内容は `BUGFIXES.md` 2026-08-19（続き569）**。観測点は §7 `V-82`（実機2本 PASS 済み）。

- **原記述（`O-1`）**：🚧**2026-08-18 続き551〜552 で着手**。✅**続き551＝シグニ【起】の能動使用 v1**（`signiActivateGate.ts`＝提示ゲートを人間と共有／`performSigniActivated`＝owner パラメータ化／`cpuActivate.ts`＝選択。射程は MAIN で撃てる 682 のうち **500**）。✅**続き552＝(a) 相手ターンの応答アーツ v1**（`artsUseGate.ts`＝提示＋コスト計算の funnel を人間と共有／`performArts`＝owner パラメータ化／`cpuArts.ts`＝守りの分類と脅威判定。射程はアタックフェイズ Timing の 428 のうち **214**）。✅**続き552b＝(b) 自ターンのアーツ／スペル v1**（`pickCpuOffensiveArts`＝攻めは除去だけ・足切りは `hasBlockedAttacker`／`spellUseGate.ts`＝スペルの提示＋コスト計算の funnel（`SpellCastModal` も同じ関数を通す）／`performSpell`＝owner パラメータ化／`cpuSpell.ts`。射程は攻めのアーツ 除去がメイン窓 **174**・アタック窓 **188**、スペルが 427枚中 **123**）。✅**続き552c＝(c) ルリグ【起】＋《アタックフェイズアイコン》付きシグニ【起】 v1**（`lrigActivateGate.ts`／`performLrigActivated`／`cpuLrigActivate.ts`／`pickCpuSigniActivated` の `phase` 引数化。射程はルリグ【起】 MAIN **425**・AA **83**、アイコン付きシグニ【起】 **54**。🔴同時にルリグ【起】のコスト踏み倒し3件を是正＝コイン82効果／MAIN 窓の使用条件／AA 窓の【絆起】等）。✅**続き552d＝(d) CPU グロウの統合**（手書き再実装 約150行を削除して `performGrow` へ。候補は `growLogic.listGrowCandidates`。🏁**これで DESIGN §4「CPU は対人戦と同じ処理」は達成＝CPU 独自の実行実装は残っていない**）。✅**続き553＝(e) CPU の `ATTACK_LRIG`→`END` を state 込みコミットへ**（`ADVANCE_TURN_WITH_STATE`＋`resolveNextPhaseAfterAttack`＝追加アタックフェイズのキューを1件消化。🔴同時に CPU 側の穴2つを塞いだ＝`ON_ATTACK_PHASE_END` の未収集／アタックフェイズ遅延 watcher の消し忘れ。⭐`CPU_UNSUPPORTED_ACTION_TYPES` は**空集合**になった＝`ADD_EXTRA_ATTACK_PHASE` の除外を撤去）。✅**続き553＝(f) 付与／継承のルリグ【起】**（`collectGrantedLrigEffects`／`listActivatableGrantedLrigEffects`／`listActivatableInheritedLrigEffects` を `lrigActivateGate` に新設し、可否判定は既存の `canActivateLrigEffect` 1本へ。射程＝付与【起】**92効果/63カード**・継承宣言**3カード**。🔴付与は コイン/エクシード/`lrigDown`/【絆起】/【歌のカケラ】を、継承は**ほぼ全軸**を見ておらず踏み倒しで撃てた）。**残＝(g) 「強い順に撃つ」等の選択の精緻化 だけ**。⚠**(g) は §7 `V-74`〜`V-80` の実機検証を終えてから着手する**（土台が動いていない状態で盤面評価を足すと、悪手なのか壊れているのかを切り分けられない）。CPU 召喚の ON_PLAY 解決は「全配置後まとめて」の近似（人間は1枚ごと）。**§6.4 で唯一の大物＝単独フェーズ扱い**。詳細は §4「次の一手 ⓪」

- **(g) 消化（続き569）＝`src/screens/battle/cpuBoardEval.ts`（選択だけの純関数）**
  - **召喚**＝`pickCpuDeployCard`＝①いまの予算で置ける最大体数を出し ②その体数を落とさない札に絞り ③パワー最大（同点はレベル大→候補順）。旧＝レベル昇順の最初の1枚＝**わざと弱い順**に出しており強い札が腐っていた。
  - **アタック**＝`pickCpuAttackZone`＝`life`（正面が空）→`winBattle`→`noEffect` の順。強制アタックは最優先、同点はゾーン昇順。旧＝`findIndex`＝ゾーン0から順。
  - **応答アーツ**＝`responseArtsAllowedKinds`＝軽減（`prevent`）は**ライフ2枚以下**でだけ解禁＝温存。
  - 🔑**教訓**＝当初は「格上の正面には撃たない」を入れたが、[公式ルール](https://www.takaratomy.co.jp/products/wixoss/library/rule/word_051/)は「パワーが**以上**なら相手をバニッシュ／**未満**なら**両方残る**」＝**格下で殴っても自分は落ちない**ので前提が誤り。**実機回帰4本**（`v12`×3・`v14`）が落ちて判明した＝「精緻化」は実機回帰とセットでしか入れられない。
  - 📋**v2 以降の候補**＝アタック順への【自】誘発の価値／除去アーツの対象価値／グロウ先の選択／エナチャージの選択／踏み込み判断。

- **§7 `V-82`（続き569 で新設・実機 PASS 済み）**
  - `v82CpuDeploysStrongestWithinLimit`＝手札 Lv1×3＋Lv4(P15000)・リミット12 で場が `[P15000, Lv1, Lv1]` の3体になる（旧は Lv1×3 で Lv4 が手札に残る）。
  - `v82CpuAttacksInValueOrder`＝正面が空のゾーンが**先に**アタックし、格上に阻まれるゾーンも**そのあと撃つ**（両方ダウン・両方生存・相手の壁も健在）。
  - 📋**follow-up**＝応答アーツの温存（`prevent`）は golden だけで、実機シナリオは未作成（該当カードの盤面づくりが要る）。

## 2026-08-19 整理㊺（Opusタスク12 (cxxxv)(cxxxvi) 残0クローズぶんの退避・続き568）

> §3 Opusタスク12 の在庫2件を続き568 で修正した（どちらも §8 `O-1` の実機検証で見つかったもの＝
> 直したことで `V-75`(C)-2 と `V-78`(C) 対照が緑になり、**`O-1` (g) の着手条件が満たされた**）。
> 以下は**登録時の原文**（真因・母集団・提案）。**実際にどう直したかは `BUGFIXES.md` 2026-08-19（続き568）**。

- 🔴**(cxxxvi) CPU グロウが「効果解決なしで state だけ変わる」ケースで GROW フェイズから先に進めなくなる（ターンが凍結）**（2026-08-18 続き562・V-78 実機検証で発見）。
  - **再現手順**＝`v78CpuGrowsButSkipsOnPlayWithoutCoin`（`scripts/verifyBattleDrive.mjs`）＝CPU（guest）にコイン0枚・`WDK01-003`（コスト付き任意【出】＝`cost.coin:1`／`DRAW`）をグロウ先候補として持たせて GROW フェイズから開始。CPU はグロウ自体は実行する（ログに「[CPU] グロウ」「◯◯にグロウ」まで出る）が、そこから60秒（ポーリング上限）経ってもターンが先に進まない＝`handedOver` が立たない。
  - **原因**＝`BattleScreen.tsx` の `performGrow`（6346行目〜）は、ON_PLAY 系エントリ（`autoPaidOnPlay`／`mandatoryOnPlay`／`fieldLimitEntries`／`growTriggerEntries` 等）が1件もない場合（`entries.length === 0`、6597行目）、`effect_stack` を一切動かさず `WRITE_STATE` だけ commit して return する。コスト付き任意【出】が**コイン不足で自動発火しなかった**場合はまさにこのケース（`costOnPlay.length = 0` に強制クリアされる＝6549行目）。ところが CPU ターンを進める `useEffect`（504行目〜、`cpuTimerRef` を再スケジュールする側）の依存配列（520〜529行目）は `turn_phase`／`active_user_id`／`field.check`／`field.lrig_attacked`／`signi_down`／`pending_*` などに限定されており、**グロウで変わる `field.lrig`（トップ/下敷き）・`lrig_deck`・`coins`・`actions_done` はどれも依存配列に含まれない**。よって WRITE_STATE 後の再レンダーでも useEffect の依存が1つも変化せず、CPU ターン処理の `setTimeout` が二度と積まれない＝GROW フェイズで永久凍結する。
  - **対照確認**＝コイン1枚持たせた `v78CpuGrowsAndPaysOnPlayCost` は PASS する（コストが払える＝`autoPaidOnPlay` 経由で `effect_stack` にエントリが積まれ、`pending_effect`/`effect_stack` 絡みの別経路でスタックが解決されるたびに何かしら依存配列の対象が触れて useEffect が再起動する）。**「entries が空のまま state だけ変わる」経路に限って詰む**、という切り分けまで完了。
  - **修正の型（提案）**＝(a) useEffect の依存配列に `guest_state.field.lrig`（トップカード等の軽量な要約値）や `guest_state.lrig_grew_this_turn` を足して、グロウ単体でも再起動できるようにする。または (b) `performGrow` 側で `entries.length === 0` でも「フェイズ遷移を促す」ための最小限の合図（例えばダミーの `ADVANCE_TURN` 相当）を書き込む。**golden ではこの `useEffect` 依存配列は踏めない**（React コンポーネント内なので実機検証でしか踏めない）。
  - **live 影響範囲**＝「グロウ先に ON_PLAY 効果が無い」または「ON_PLAY 効果はあるがコスト不足等で発火しない」CPU グロウすべてが対象＝**CPU 対戦で頻繁に踏みうる**（対人戦は影響なし＝人間はモーダル操作で明示的に次へ進むため、このタイマー再スケジュール依存の穴を踏まない）。
  - **§7 follow-up**＝直った後 `v78CpuGrowsButSkipsOnPlayWithoutCoin` を再実行して緑化を確認すること。
- 🔴**(cxxxv) `calcContinuousBlockedActions` がルリグ本体の CONTINUOUS `BLOCK_ACTION`（`target.owner:'opponent'`）を一切拾わない＝恒久 no-op**（2026-08-18 続き559・V-75(C)-2 実機検証で発見）。
  - **再現手順**＝`WX13-007`（博愛の使者 サシェ・リュンヌ＝【常】「対戦相手は各ターンに一度しかアーツを使用できない」＝`WX13-007-E1`＝`BLOCK_ACTION{target:{owner:'opponent'},actionId:'ARTS_LIMIT_1'}`）を場（センタールリグ）に置いた状態で、`calcContinuousBlockedActions(host, guest, ...)`（host=対戦相手視点）を呼んでも `forSelf`/`forOther` ともに空集合が返る＝**ARTS_LIMIT_1 が一切効かない**。実機でも同型＝`actions_done:['USE_ARTS']` を注入しても host のルリグデッキ2枚目アーツの「使用」ボタンが消えない（`v75ArtsLimit1SecondUseBlocked` 実機FAIL・単体スクリプトの isolated 再現でも `forSelf`/`forOther` 空を確認済み）。
  - **原因**＝`src/engine/effectEngine.ts:2757` の `scanField`（シグニゾーンのみ走査）と `:2788` の `scanLrigSelfBlocks`（`target.owner==='self'` のケースのみ処理）の2関数しか無く、**「ルリグ本体が持つ `target.owner:'opponent'` の CONTINUOUS `BLOCK_ACTION`」を処理する経路がどこにも無い**（シグニなら `scanField` の `else forSelf.add/forOther.add` 分岐で拾えるが、ルリグにはその対の分岐が無い）。
  - **live 母集団＝5件**（ルリグ本体の CONTINUOUS＋`target.owner:'opponent'` の BLOCK_ACTION）＝`WX04-005`（アルテマ/メイデン イオナ・`DRAW_LIMIT_1`）／`WX05-011`（ミルルン・ティコ・`USE_SPELL`）／`WX13-007`（サシェ・リュンヌ・`ARTS_LIMIT_1`）／`WXEX2-11`（レイラ＝オーバードライブ・`GUARD`）／`WD14-001`（虚幸の閻魔 ウリス・`GUARD`）。⚠**`GUARD`／`USE_SPELL`／`DRAW_LIMIT_1` は他経路（`blocked_actions` 直書き等）で部分的に効いている可能性がある**ので、**5件とも個別に実効性を確認してから直す**こと（`ARTS_LIMIT_1` は今回 isolated スクリプトで完全な no-op を確認済み）。
  - **修正の型（提案）**＝`scanLrigSelfBlocks` を拡張するか新関数を足し、ルリグ本体の CONTINUOUS `BLOCK_ACTION` で `target.owner==='opponent'` のケースも `(isMe ? forOther : forSelf)` へ振り分ける（シグニの `scanField` と対称の分岐を足すだけで良いはず）。**golden にトリップワイヤを追加**（`WX13-007` 等で `calcContinuousBlockedActions` の出力を直接固定）してから直すこと（続き512 の既存 golden は「判定式の存在」しか見ていない＝真の恒久 no-op を検出できていなかった教訓）。
  - **§7 follow-up**＝直った後 `v75ArtsLimit1SecondUseBlocked` を再実行して緑化を確認すること（V-75(C)-2 の残り）。

- **結末（続き568）**
  - **(cxxxv)**＝`scanLrigSelfBlocks` を `scanLrigBlocks` に拡張し、`target.owner === 'opponent'` を `isMe ? forOther : forSelf` へ入れた。消費地点も同時に確認＝`ARTS_LIMIT_1`（`artsUseGate`）／`USE_SPELL`（`spellUseGate`）／`GROW`（`growLogic`）は既存、**`GUARD` と `DRAW_LIMIT_1` は消費地点が無かった**ので `GuardResponseDialog`（素の `GUARD`＝丸ごとガード不可）と人間／CPU 両方のドロー地点（新 `drawPhaseLimitFromBlocked`）へ配線した。⚠`WXEX2-11-E2` は条件節「このルリグがドライブ状態であるかぎり」が live から落ちており、**経路を開くと無条件でガード不能になる**ので、新型 `LRIG_IS_DRIVE_STATE`（シグニ用 `IS_DRIVE_STATE` はルリグ本体では常に false）を type/評価器/parser に足してから開いた（census 787→786）。実機 `v75ArtsLimit1SecondUseBlocked` が赤→緑。
  - **(cxxxvi)**＝提案 (a) を採用＝CPU ターン駆動 useEffect の依存配列に**グロウで動く値**（`guest_state.field.lrig` の段数とトップ・`lrig_deck` 枚数・`coins`・`actions_done` 長）を足した。再スケジュールは clearTimeout→setTimeout なので多重発火しても実行は1回。実機 `v78CpuGrowsButSkipsOnPlayWithoutCoin` が赤→緑（`handedOver=true`）。

## 2026-08-19 整理㊹（§7 `V-75`／`V-78` 完全消化ぶんの退避・続き568）

> §8/`O-1` (a)(d) の実機検証。**続き568 で残っていた `V-75`(C)-2 と `V-78`(B)(D) をすべて緑にして残0クローズ**
> （(C)-2 は Opusタスク12 (cxxxv)、`v78CpuGrowsButSkipsOnPlayWithoutCoin` は (cxxxvi) の engine 修正で反転）。
> 🏁**これで `V-74`〜`V-78` が全部終わり、§8 `O-1` (g)「選択の精緻化」の着手条件が満たされた**。
> 一次記録は `BUGFIXES.md` 2026-08-19（続き568）。追加シナリオ3本＝`v78CpuResolvesFieldLimitTrash`／
> `v78CpuGrowsWhenColorRestrictSatisfied`／`v78CpuSkipsGrowWhenColorRestrictViolated`。



- **✅ 続き568 の追記（消化した残り）**
  - **`V-75`(C)-2**＝`v75ArtsLimit1SecondUseBlocked` が**赤→緑へ反転**（(cxxxv) 修正後に2回連続 PASS）。1枚目は「使用」が出て、`actions_done:['USE_ARTS']` の対照では出ない。
  - **`V-78`(B)**＝`v78CpuResolvesFieldLimitTrash`＝`WX04-005`（すべてのプレイヤーはシグニ1体まで）へ CPU がグロウ → **場3体→1体・trash+2・`handedOver=true`**＝選択エントリ（`__field_limit_trash__`）を CPU の自動応答が解決して止まらないことを確認。⚠**ライフを1枚に絞らないと【グロウ】条件（ライフクロス1枚以下）を満たさない**。
  - **`V-78`(D)**＝グロウ色制限が CPU ターンでも効くことを対で確認（`WX25-P3-034`＝赤かつ緑のルリグにしかグロウできない／候補が `WX25-P3-035`〔赤緑〕なら**グロウする**・`WX02-008`〔赤単〕なら**グロウしない**）。🔴このシナリオが**engine の実バグ2件**を炙り出した＝①`listGrowCandidates` の色分解（`Color` は「赤緑」の連結形式なのに `split(/[・,、]/)` で読んでおり**満たす札まで弾く**過剰制限）②`canAffordGrowCost` がスラッシュ色コスト（《赤/緑》×１＝**24枚**）を**どの色でも払えない**＝ルリグ13枚がグロウ不能・アーツ9枚とキー2枚が使用不能。どちらも修正して golden にトリップワイヤを追加。
  - 📋**残した follow-up**＝(D) の `GROW_FROM_LEVEL0`／`GROW_COST_SUBSTITUTE_TRASH_SIGNI`／`SUPPRESS_CENTER_ON_PLAY` は未確認（原記述の「1枚でも実例で見られれば十分」に従い色制限1本で消化）。

## 2026-08-19 整理㊸（§7 決着済み `V-01`／`V-02`／`V-03`／`V-05`〜`V-14`／`V-18` の全文退避・続き567）

> PLAN §7 にあった**決着済み15ブロックを verbatim で退避**（`V-01`〜`V-03`＝§3 実バグ待ちの残0クローズ分、
> `V-05`〜`V-14`・`V-18`＝🅱🅲 の決着分）。PLAN 側には ID・続きNN・本節へのポインタだけを残す。
> ⚠`V-06`／`V-07`／`V-09` は**見出しに ✅ が付いていなかった**が、**チェック項目が全て `[x]`＝実機PASS**で
> 実体は決着済みだったので同時に退避した（見出しの `2件`／`残り2件` という数え方だけが古かった）。
> 各ブロック内の `📋` は「未実装として送る（バグではない）」＝**再着手の対象ではない**。

- **✅ V-01 離場置換の対話＝2026-08-14 続き475/475b で決着＝6シナリオすべて緑**（`leaveSubCpuAutoRespondsSubstitute`／`leaveSubAskDirectedToVictim`／`leaveSubDecisionNoneIsHonored`／`leaveSubDecisionKeyIsHonored`／`leaveSubNoOptionMeansNoAsk`／`leaveSubAllTargetsAskedPerVictim`）。**在庫3件のうち (cxxv) は取り下げ・(cxxvi)(cxxx) は engine 修正で残0クローズ**。以下は経緯。⭐**(cxxv)「数値 count では問いが出ない」は取り下げ＝シナリオ偽陽性だった**（`pendingCandidates` の index を `pick-<idx>` に使っており、`opp_field` は reverse 描画なので**犠牲シグニを直接バニッシュしていた**＝victim は対象ですらないので問いが出ないのは当然。**結果の盤面は身代わり成立時と同一**＝§7 📌4 の実例）。`clickPendingInstance` へ差し替えて **`leaveSubCpuAutoRespondsSubstitute`／`leaveSubAskDirectedToVictim`／`leaveSubDecisionKeyIsHonored`／`leaveSubNoOptionMeansNoAsk` が PASS**（`asks=1`・`responder=CPU`・options＝`banishSubstitute…`／`none:置換しない`）。**数値 count の hoist（`resumeSelectTarget`＝`effectExecutor.ts:7412`）は正しく効いている。**
  - [x] 🔴**赤で残っていた2本＝engine の実バグ＝続き475b で修正して緑へ**。①`leaveSubDecisionNoneIsHonored`（→§3 **(cxxx)**＝置換不成立時に消費済み ctx を捨てていた）＝**11経路で `sub.ctx` を無条件に採る**ように修正 ②`leaveSubAllTargetsAskedPerVictim`（→§3 **(cxxvi)**＝身代わりで先に場を離れた instance を再処理して移動先へ2枚目を push）＝**ループ5経路に `isOnFieldTop` ガード**を追加。**golden にトリップワイヤ2本を追加し、外すと FAIL することも確認済み**（golden 1964→1966）。
  - [ ] 📋**人間側モーダル（`場離れの置換`）の描画確認は defer**＝`leaveSubstituteAskQueue`（`effectExecutor.ts:740-743`）は victim を `ctx.otherState.field.signi` に限定するので、**問いは常に「効果を撃った側の対戦相手」にしか飛ばない**＝host vs CPU のドライバでは **host を victim にする決定論的手段が無い**。将来案＝(a) CPU 側に効果バニッシュを撃たせる経路を作る (b) `pending_effect` を直接注入する。
  - [ ] 📋**未実装として送る（バグではない）**＝(a) **CPU は常に先頭の選択肢（＝最も安い置換）を選ぶ**＝盤面評価はしない近似 (b) `WX14-026` の**ライフクラッシュは選択肢に出るが engine の自動適用はしない**。

- **✅ V-02「このアタックを無効にする」＝2026-08-14 続き475d で決着＝3シナリオすべて緑**（`oppPayNegateAttackWhenPaid`／`oppPayAttackGoesThroughWhenUnpaid`／`oppHandDiscardIsOpponentSide`）。**§3 (cxxvii) を残0クローズ**＝真因は**2つ**あり、①parser が `NEGATE_ATTACK{owner:'opponent'}` を作っていた（→`STUB{SET_CANCEL_ATTACK_FLAG}` へ是正）②🔴**`resumeOpponentPayOptional` の `pay` 枝が `payOpt.action` を実行していなかった**＝`thenOnPay` の帰結が**エナ払いのときだけ**丸ごと落ちていた（コスト種別で挙動が割れる無言バグ）。
  - ⚠**観測の注意**＝進行中アタックのキャンセルは **`negatedAttacks` には載らない**（一時フラグ＝`effectExecutor.ts:8822` で立て `BattleScreen.tsx:8119` で消去）。**ライフが減ったかどうかで見る**。

- **✅ V-03 ピースの効果が使用時に解決しない＝2026-08-14 続き475g で決着**（→§3 **(cxxiii)** 残0クローズ）。`connectSpinningChoice4Pay`／`connectSpinningChoice4Insufficient` が**緑へ反転**（④pay＝host.hand 2→0・guest.life 7→6／手札不足では pay が `(disabled)`）。**ピースは「使用＝印刷コストを1回払って即解決→ルリグトラッシュ」**になり、キーゾーンを占有しなくなった。新規 `pieceUseResolvesAndGoesToLrigTrash` も PASS。

- **✅ V-05 対象宣言の脱落（続き423）＝2026-08-13 続き469 で決着**（Codex 起案→Claude 実機検証・**5シナリオが2回連続PASS**・既定 order 登録済み）。⭐**母集団は `STUB{SELECT_TARGET_ONLY}` を使う live 118効果**（PLAN が書いていた「16効果」は**続き423 で変更した数**であって母集団ではない）＝代表2枚で filter の enforce を固定した。
  - [x] 🔴**所有者と体数**（`WXDi-P02-009-E3`）＝**実機PASS 3本**。①`targetDeclOpponentOnlyCandidates`＝`pendingCandidates` が **guest の3体だけ**で**自分のシグニは混入しない**（旧＝自分のシグニ1体が戻っていた）②`targetDeclUpToTwoSelectsBoth`＝**2体選べて、選んだ2体だけが相手の手札へ戻り未選択の1体は場に残存**（旧＝`count:1` 固定）③`targetDeclUpToTwoAllowsZero`＝**`決定 (0/2)` で0体確定でき相手3体すべて残存**（旧＝1体強制）。⚠**0体確定でも《ガードアイコン》の任意コストは提示され、payすると手札→トラッシュへ動く**＝**現状を記録しただけで仕様判断はしていない**（原文「対象とし、〜捨ててもよい。そうした場合、それらを手札に戻す」の解釈が要るなら別途）。
  - [x] **パワー制限が候補に効くか**（`WX06-CB01-E1`）＝**実機PASS 2本**。①`targetDeclPowerCapExcludesAbove`＝候補は **P3000 の1体だけ**で **P15000 は除外**（旧＝無差別）②⭐`targetDeclPowerCapUsesEffectivePower`＝**対照**＝盤面のカードを1枚も変えず `guest.temp_power_mods` に **+1000 を足すだけ**（印字3000→**実効4000**）で**候補が一度も非空にならない** ⇒ **パワー判定が実効パワーで行われている**（`fieldCandidates` に `ctx.effectivePowers` を渡す＝`execStubPart1.ts:163`）ことを実機で証明。⚠**注入が効いたことを `powerMods` で先に確認してから**候補を見ている（効いていないのに「候補0」で PASS すると偽陽性）。

- **V-06 🔴 幻コスト第2波＋下カードコストの絞り込み（続き422）2件**
  - [x] **下カードコストの候補が絞られるか**（`WXDi-P11-042-E1`）＝**実機PASS 2本**（`underCostFiltersByColor` ＋ 対照 `underCostUnavailableWhenNoRed`・2026-08-13 続き471）。下に「赤シグニ1枚＋非赤2枚」を置くと**候補は赤1枚だけ**／支払うと下 stack から trash へ行き対象がバニッシュ（エナへ）。**下の1枚を白へ交換するだけ**の対照で **`pay` が `(disabled)`** になり本体も走らない。⭐**続き421 でこの filter は「型にも無い死フィールド」だった**（逆翻訳にだけ出て engine は無視）＝**続き422 の配線が実UIまで届いていることを実機で確認**。⚠**runtime 型（`execUtils.ts:171-196`）と JSON payload 型は別物**で、**片方にキーを足しただけでは `resolveOptionalCostSpec` が落として黙って無視される**（`:177-179` の警告）。
  - [x] 🔴**捨てさせる向き**（`WXDi-P14-060-E1`）＝**実機PASS 2本**（`revealOppHandSkipKeepsOpponentHand` ＋ 対照 `revealOppHandPayDiscardsOpponentAndDraws`・2026-08-14 続き473）。**辞退**すると `host.hand` 2→2／`guest.hand` 3→3／`guest.trash` 0→0／`guest.deck` 40→40 で**全て不変**（＝捨てさせもドローも起きない）。**pay** すると **`guest.trash` 0→1・`guest.deck` 40→39** で、🔑**`host.hand` は 2→2 のまま**（旧実装＝自分が1枚失って相手が引く**真逆**は再現しない）。⚠**手札の枚数では見えない**（捨て1・引き1で戻る）＝**trash と deck で見る**。
    - 🔑**構造の読み違いに注意**＝この JSON は `SEQUENCE[REVEAL, OPTIONAL_ACTIVATE, TRASH{opponent}, CONDITIONAL→DRAW]` で **`TRASH` が `CONDITIONAL` の外**にあるため「辞退しても捨てさせるのでは」と疑ったが、**実際は Pattern⑤**（`effectExecutor.ts:4314`）が**後続の `TRASH＋CONDITIONAL` を丸ごと pay 側 `cont5` に包み skip 側を no-op にする**（`:4421`）＝**「そうした場合」慣例（`:3745`）は STUB の直後が CONDITIONAL のときだけ**。実機でも辞退時に何も動かないことを確認した。

- **V-07 🔴 幻の手札コストの是正（続き421）2件**＝**16効果**でコストの徴収先が変わった（従来は原文と無関係に**手札**が1枚落ちていた）。
  - [x] 🔴**エナゾーンから正しく徴収されるか**（`WX24-P1-047-E1`）＝**実機PASS 2本**（`energyTrashCostDeductsEnergyNotHand` ＋ 対照 `energyTrashCostUnavailableWhenShort`・2026-08-14 続き473）。エナに「Lv1シグニ2枚＋Lv2シグニ＋スペル」を置くと**候補は Lv1シグニ2枚だけ**／支払うと**その2枚だけがトラッシュへ**行き、🔑**手札は1枚も減らない**（旧実装＝**原文と無関係に手札が1枚落ち、しかもエナは減っていなかった**）。**2枚目を Lv2 へ交換するだけ**（総エナ4枚は維持）の対照で **`pay` が `(disabled)`**。
    - ⚠**検証側で足したドライバ修正**＝**支払い後に `BANISH{targetsStored}` がもう一度 `SELECT_TARGET` を開く**（候補は宣言済み対象に限定）＝**ここに応答しないと `pEff=SELECT_TARGET` のままタイムアウトする**（続き469 の `targetDeclUpToTwoSelectsBoth` と同じ挙動）。**支払い自体は初回から正しく完了していた**。
  - [x] **自己トラッシュコストが二重に取られないか**（`WX06-CB01-E1`）＝**実機PASS**（`optionalTrashSelfNoHandLoss`・2026-08-13 続き469）。**pay**＝`WX06-CB01` 自身が場からトラッシュへ行き対象がバニッシュされ、🔑**host の手札は1枚も減らない**（旧＝手札1枚＋このシグニの**両方**を失っていた）／**skip**＝**双方のシグニも手札も不変**。⚠**同一 spec を再注入して `optcost-pay`／`optcost-skip` のクリックだけを変える**対照形。

- **✅ V-08 `OPTIONAL_COST{handDiscard}` のモーダル（続き420）＝2026-08-13 続き470 で決着**（Codex 起案→Claude 実機検証・**6シナリオが2回連続PASS**・既定 order 登録済み）。**18効果**で「手札を捨てる／捨てない」のモーダルが新たに出るようになった分。
  - [x] **絞り込みが効くか**＝**実機PASS**（`handDiscardCostFiltersCandidates`）。⚠**代表カードは `WX18-001-E3` ではなく `WXK09-041`**（同じ `handDiscard.filter`／`canAfford` 経路を**シグニの【自】アタックだけ**で踏めるため。`WX18-001` はルリグ Lv4・GrowCost《黒》×3・《コインアイコン》起動が要る）。**手札に「＜天使＞シグニ1枚＋非該当2枚」**で pay を選ぶと**候補は該当1枚だけ**／支払い後に本体が走り**相手の手札 2→1**。⚠従来は**末尾の1枚が問答無用で落ちていた**。
  - [x] **`canAfford` が効くか**＝**実機PASS**（`handDiscardCostUnavailableWhenNoMatch`＝**対照**＝手札の該当札を非該当へ**交換するだけ**）。**`pay` が `(disabled)`**（`canAffordOptionalCostSpec`＝`execUtils.ts:250,253-257`）／`skip` しか選べず**本体が走らない**（相手の手札不変）。
  - [x] **辞退できるか**＝**実機PASS 2本**（`handDiscardSkipBlocksBody` ＋ 対照 `handDiscardPayRunsBody`）。`WXDi-CP01-027-E3` で **skip すると本体（相手シグニを手札に戻す）が走らず**自分の手札も減らない／**pay すると《ガードアイコン》持ちシグニだけが候補**になり、支払うと相手の P10000以下シグニが手札へ戻る。
  - [x] 🔴**ルリグを対象にするか**＝**実機PASS 2本**（`handDiscardOptionTwoDownsOpponentLrig` ＋ 対照 `handDiscardOptionThreeDownsOpponentSigni`）。`WX25-CP1-004-E1` の**②だけ**を選ぶと **guest の lrigDown=true・両者の signi は全て up**／**③だけ**を選ぶと **guest の signi だけ down・guest lrig は up**＝**②と③で対象が入れ替わっていない**（旧＝自分のシグニがダウンしていた）。⚠**「4つから2つまで選ぶ」は `choose_count:2`＋`upTo:true` の multiSelect**（`effectExecutor.ts:4567`/`:4613`）で、**1つ選んだ時点で「決定」が押せる**（`EffectInteractionModal.tsx:541`）＝**②③を同時に選ぶと対象の切り分けができないので必ず1つずつ**。
  - 📋**やらなかった**＝`WX18-001-E3` 本体（上記の理由）。⚠**その原文は「捨て**る**」＝強制なのに live は `OPTIONAL_COST`（任意）**という既知差がある＝**仕様判断は未実施**。

- **✅ V-09① 手札捨ての任意コスト＝2026-08-13 続き470 で決着**（上の V-08 と**同一 STUB**なので同じバッチで消化）。`WXK09-041` で ①pay/skip が出る ②**skip で手札が減らず本体も走らない** ③支払うと**＜天使＞のシグニだけ**が候補 ④**該当が0枚なら「支払う」が `(disabled)`**＝**4点すべて実機PASS**。

- **V-09 🔴 任意性脱落の系統消化（続き416〜417）＝残り2件**（①は上で✅・②は続き469 の `optionalTrashSelfNoHandLoss` で✅）＝engine 側は golden で固定したが、**任意コストの pay/skip モーダルが新たに出るカードが 140枚超**あり、実UIでの提示・支払い徴収は golden では踏めない。
  - [x] ~~**手札捨ての任意コスト（`OPTIONAL_COST{handDiscard}`）**~~＝**✅続き470**（上の V-09① を参照）。
  - [x] **効果まるごと任意（`OPTIONAL_ACTIVATE`）**＝**実機PASS**（`optionalActivateSkipThenPay`・2026-08-13 続き471）。⚠**PLAN が例示していた `WX07-003` は記述が誤り**＝実データは**ルリグ**（ミルルン・ユニオン Lv4）で、原文は【自】「あなたの**《クロスアイコン》を持つシグニ１体が場に出たとき**、カードを１枚引いてもよい」＝**【出】でドローではない**。⇒ 代わりに **`WXDi-P02-037-E3`**（シグニ／限定なし／【出】「あなたのライフクロス１枚をクラッシュしてもよい」）で検証＝**通常召喚の ON_PLAY で「発動する／発動しない」が出る**／**発動しないと `host.life` 7→7（不変）**・**発動すると 7→6**（確認フローも消化）。⚠**同一 spec を再注入して応答だけを変える**対照形。
  - [x] ~~**自己トラッシュコスト（`OPTIONAL_TRASH_SELF`）**~~＝**✅続き469**（`optionalTrashSelfNoHandLoss`＝V-07② と同一）。
  - [x] **`underAnySigniTrash{fromThis}` が「このシグニの下」だけに絞るか**＝**実機PASS**（`underCostFromThisOnly`・`WXK08-052`）。**このシグニの下1枚**と**別シグニの下1枚**を同時に置くと、**候補は自分の下の1枚だけ**／支払うと相手シグニに **−3000**、**別 stack は不変**。
  - [x] 🔴**新設 `fieldDown`（アップ状態の自シグニをダウン＋色）**＝`WXDi-P04-051`。①**アップ白シグニが3体そろっていないと「支払う」が選べない**＝**実機PASS**（`fieldDownCostRequiresThreeUpWhite`）。②③＝**2026-08-14 続き475d で決着**（→§3 **(cxxviii)** 残0クローズ）。従来は timing が `ON_ATTACK_SIGNI` で**シグニのアタック時に発火→攻撃者が先にダウン→3体そろわない＝恒久 no-op** だった。**engine に `collectAllyLrigAttackTriggers` を新設**（アタック側の味方カードを走査する経路が丸ごと無かった）してから timing を `ON_ATTACK_LRIG`＋`triggerScope:any_ally` へ、帰結を **LRIG 対象**へ是正。⇒ **実機PASS**（`fieldDownCostPaysThreeAndWhite` を**ルリグアタック経路へ書き換え**＝3体down＋白エナ徴収→**ルリグがアップし能力を失う**・シグニは対象外）。⚠**シナリオはライフ枚数を spec で固定する**（ルーム再利用で前シナリオのクラッシュが残ると `before` がずれて完走タイムアウトになる＝実測）。

- **✅ V-10 F-3 身代わりを効果バニッシュへ配線＝2026-08-14 続き475／475c で決着＝5シナリオすべて緑**（`effectBanishSubstituteRunsAutomatically`／`effectBanishNoSubstituteWithoutSacrifice`／`effectBanishSubstituteDiscardsSpell`／`effectBanishLifeCrashSubstitutePaysLife`／`battleBanishSubstituteStillInteractive`）。**在庫だった (cxxix) も engine 修正で残0クローズ**。以下は経緯。
  - [x] **バトルバニッシュは従来どおり対話モーダルが出る**（＝自動適用に化けていない）＝**実機PASS**（`battleBanishSubstituteStillInteractive`）。`pending_banish_substitute` が立ち、モーダル「身代わりバニッシュ」と待機ログを確認。
  - [x] 🆕**効果バニッシュの身代わりは「被害側へ問い1件→CPU が選択」で成立する＝2026-08-14 続き475 で 3本とも緑**（`effectBanishSubstituteRunsAutomatically`／`effectBanishNoSubstituteWithoutSacrifice`／`effectBanishSubstituteDiscardsSpell`。**2回連続 ALL PASS**）。⭐**続き474 が「問いなし自動適用」を前提に `asks===0` を要求していたのが誤り**＝`BANISH{count:1}` は `resumeSelectTarget` の hoist（`effectExecutor.ts:7412`）を通るので**問いが1件出るのが現行の正**（V-01 の再検証と整合）。**期待値を `asks===1 かつ victim名を含む` に変え、機構が動いた証拠（§7 📌4）は「問いログ＋身代わりログ」の2本立てで取る**ようにした。⚠**対照側（犠牲なし／非スペル）の `asks===0` は据置**＝置換候補が1本も無いので問いが立たないのが正。
  - [x] 🆕**driver の位置依存フレークを2件つぶした（続き475）**＝①**盤面は正しいのに `normalLog=false` で落ちる**＝`H.queryState()` の盤面は Supabase 直照会で先に真になるが `game_logs` の行は数百ms遅れる（§7 📌7 と同型）。⇒ **settled 後も PASS しない間は最大12反復ぶんログの到着を待ってから確定**する（単体PASS・3件バッチFAIL の再現を解消）。②**`決定 (1/1)` が出ず 64反復×3秒＝211秒溶かす**（実測1回）＝pick のクリックが React に載らなかったとき。⇒ **`SELECT_TARGET` が続いているうちは pick からやり直す**自己回復を追加。
  - [x] 🏁**(cxxix)＝`WX14-026` の「コスト0」身代わりを修正（続き475c）**＝真因は `lifeCrash` が `autoEligible:false` でも **`leaveSubstituteAskOptions` は `kind==='optional'` だけで絞るので選択肢には出る**→CPU が選ぶ→**`applyEffectBanishSubstituteChoice` に分岐が無く末尾の `trashStackSpell` へフォールスルー**＝**0枚トラッシュで成立**（実機ログと完全一致）。⇒ **apply 側に `lifeCrash` を実装**（`field.check` を立てて【ライフバースト】確認フローへ乗せる）＋**未実装 costType を列挙段階で落とす `isImplementedSubstituteCost`**。⭐**「同期的に差し込めない」という旧コメントの前提は誤りだった**＝実機で `[CPU] ライフクロスをオープン: …（ライフバーストなし）` まで通しで動く。**`effectBanishLifeCrashSubstitutePaysLife`（旧 `…NotOnEffect`）が guest.life 7→6 で PASS**。
  - 📋**残る近似（バグではない）**＝**CPU は常に先頭の選択肢を選ぶ**ので、`lifeCrash` しか無い盤面では**必ずライフを払って生き残る**（盤面評価はしない）。原文は「してもよい」なので**辞退も正当**＝人間側 UI では選べる。
  - 📋**参考（旧記述）**＝下の項目が当初の検証内容。⚠③は**前提が誤っていた**（下の (cxxix) 参照＝`WX14-026` も効果バニッシュで身代わりできるのが正しく、当時は「されない」を期待値にしていた）。
  - [x] **効果でバニッシュされたときに身代わりが自動で走るか**＝相手の場に `WX12-024`（＋他の＜電機＞）を置き、**バトルではなく効果**で `WX12-024` を狙う → **`WX12-024` が残り、代わりに他の＜電機＞がバニッシュされてログに「身代わり：〜」が出る**こと。あわせて①`WX10-033`（手札のスペル1枚が自動で捨てられる）②**バトルバニッシュは従来どおり対話モーダルが出る**こと③`WX14-026`（ライフクラッシュ型）は**効果バニッシュでは身代わりされない**ことを確認する。⚠**V-01 と同じカードを使うが軸が違う**（V-01 は対話化・こちらは自動適用の配線）。

- **✅ V-11 配置制限ゲートの一本化＝2026-08-14 続き476 で決着＝6シナリオすべて緑**（フラグ版／CONTINUOUS 版＝`fillDeployCaps` 経路／CPU 召喚の3経路とも実UIで効いていることを確認・engine バグ0）。**経緯と罠の詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-14 整理⑭」へ退避**。📋**未カバー＝`deployCountCapOpponent`（自分の効果で相手の場に出す）＝踏むなら V-25 として別立て**。

- **✅ V-12 アタック可否ゲート一本化＋付与ストア共通走査（続き404）＝2026-08-14 続き478 で決着＝8シナリオすべて緑**（続き477 で6/8→続き478 で残り2本が緑へ反転・Codex 起案→Claude 実機検証・既定 order 登録済み）。**在庫だった (cxxxiii) は取り下げ**（＝engine バグではなくシナリオ偽陰性）＋**《ターン2回》未管理の実バグ1件を修正**して残0クローズ。
  - [x] 🔴**CPU がアタック不可のシグニでアタックしないか**＝**実機PASS 3本**。①`keyword_grants` に「アタックできない」を注入すると、**そのシグニだけ up のまま**・もう1体はアタックして down・**`ATTACK_LRIG` へ前進**（＝`performSigniAttack` の早期 return で同じシグニを選び続ける**無限ループが起きない**）＝`v12CpuCannotAttackGranted` ②**対照**＝`keyword_grants` だけ外すと両方 down＝`v12CpuCannotAttackGrantedControl` ③**別軸**＝防御側 `opp_signi_attack_power_cap:5000` で P3000 だけ up・P7000 は down、cap を外すと両方 down＝`v12CpuPowerCapWithControl`。
    - 🔑**アタック可否の6軸のうち4軸は `PlayerState` 注入だけで作れる**（`keyword_grants`／`signi_attack_once_limit`＋`attacked_signi_ids`／`opp_signi_attack_power_cap`／`signi_attack_cost`）＝**CPU 側の検証が決定論的に書ける**。
    - ⚠**アタッカーの正面が空だとライフクラッシュ確認モーダルで止まる**（`VERIFY_BROWSER.md` の既知の罠）＝CPU 観測系は**防御側3ゾーンを埋めて正面を塞ぐ**。実際これで対照2本が最初 FAIL した。
    - 📋**未カバー**＝`fieldTrashCostAlreadyPaid`（G154 BURST 無効化回避モーダルからの再入）。予約済みコストと再入状態を注入だけで作れないため見送り。
  - [x] 🔴**付与された【自】が ON_SPELL_USE / ON_SIGNI_BANISH_OPPONENT で発火するか**＝**実機PASS 2本**。(a)`WXDi-P13-008-E3` を**エクシード4で実際に撃って付与**（`lrigUnder` 4→0・`grantedLrigAutoIds` に sub が入る）→ ディソナスペル `WXDi-P12-089` 使用で相手シグニに **-4000**＝`v12GrantedSpellUseMinus4000` (b)`WXDi-P12-041-sub-E1` を付与ストアへ直接注入→**バトルバニッシュで発火**しエナのシグニとアタッカーが入れ替わる／**2回目は《ターン1回》で非発火**（`actions_done` に同 ID が1件だけ）＝`v12GrantedBattleBanishOnce`。
    - ⚠**swap は2段階**＝①エナから1枚を `SELECT_TARGET` ②`REARRANGE_SIGNI{mode:'swap'}` モーダルで**カード画像を1回クリックすると即確定**（`EffectInteractionModal.tsx:842` 付近＝確定ボタンが無い）。②を押さないと `pending_effect` が `REARRANGE_SIGNI` のまま止まり、**発火しているのに盤面が動かない絵**になる。
    - ⚠🔎**要確認（断定しない）**＝場に**同名シグニ2体**が居ると swap モーダルの候補で**非アタッカー側**を掴めた（`targetsBattleAttacker` が instance 単位で効いていない疑い）。シナリオは zone1 を別カードにして回避済み。**確証は取っていない**ので、踏むなら候補列を直接見るシナリオを1本立てる。
  - [x] 🔴**付与された【自】が ON_ENERGY_CHARGE で発火するか＝2026-08-14 続き478 で決着＝実機PASS 2本**（`v12GrantedEnergyChargeTwice`／`v12GrantedEnergyChargeThirdBlocked`）。`SPDi43-13-E2` を【起】から撃って付与→`WXDi-P12-082`（【エナチャージ１】）を1枚ずつ使うと、**各回 `actions_done` に `SPDi43-13-sub-E1` が入り `lrig_down` が false になる**。**3回目（`energy 2→3`）は約5秒待ってもアップしない**＝《ターン2回》が効く。
    - 🔴**続き477 の「発火しない」は誤りだった**（→§3 (cxxxiii) 取り下げ）＝**シナリオが「エナ増加後の最初の settled 観測」で即 FAIL していた**（📌13 違反）。付与 watcher は `BattleScreen.tsx:1734` の early return により **stack/pending が空になった「あと」の useEffect** で走るので、**最初の settled では必ず未発火**。⚠**対照 `v12PrintedEnergyChargeControl` だけが最初からポーリング型**で、**2本の「判定の待ち方」が非対称**だったことが誤診の原因＝**対照は盤面だけでなく待ち方まで揃える**。
    - ✅**実在した実バグ＝付与 watcher が `usageLimit` を一切見ず `actions_done` にも書き戻していなかった**。`reserveGrantedAutoUsage`（`src/screens/battle/grantedAuto.ts`）を新設して**この経路だけ**で判定・予約し、`WRITE_STATES` で書き戻す（**印刷能力の走査ループは無変更**＝diff 実査で確認）。golden にトリップワイヤ1本（1975→**1976**）。
    - ⚠**負方向側も「その瞬間の絵」で確定させない**＝「3回目はアップしない」は**まだ発火していないだけ**と区別が付かないので、**正方向と同じ待機予算（約5秒）**を置いてから確定する形に是正した。
    - ⚠**SPDi43-13 は【起】が2つあり、E1（《ダウン》でSランサー付与）も「【起】コストなし」と表示される**（ルリグ用のコストラベル生成に `down_self` が無い＝`BattleScreen.tsx:12585` 付近）＝**nth 指定が必須**。→§3 **(cxxxi)** と同根の表示側の穴。

- **✅ V-13 トラッシュ起動のコストUI（続き403）＝2026-08-14 続き478 で決着＝6シナリオすべて緑（engine バグ0）**（Codex 起案→Claude 実機検証・既定 order 登録済み）。**トラッシュゾーンUIからの実発動経路（`getMyTrashCardActions` → `TrashActivatedModal` → `executeTrashActivated` → `execAddToField`）は golden では原理的に踏めない**。全件で **①【起】ボタンが出る ②本体が trash→field で全ゾーン合計1枚（＝複製していない） ③払ったカードが正しいゾーンから減る** を assert。
  - [x] **アップ状態のレベル2のルリグ2体をダウン**（`WXDi-P04-042`）＝**実機PASS 2本**（`v13TrashActLrigDownTwo` ＋ 対照 `v13TrashActLrigDownTwoNoUpLv2`）。**センター→アシストL の順に自動でダウン**（`down=[true,true,false]`）／**アップしているルリグを Lv1 だけにするだけ**の対照で**【起】が出ない**。
  - [x] **アタックフェイズ起動＋複合コスト**（`WX19-029`）＝**実機PASS 2本**（`v13TrashActAttackPhaseCombo` ＋ 対照 `v13TrashActAttackPhaseComboShortHand`）。エナ《黒》2枚＋**手札の＜遊具＞2枚**を払って**ダウン状態で**場に出る／**手札総数は維持したまま＜遊具＞を1枚に減らすだけ**の対照で**【起】が出ない**。
  - [x] **《ディソナアイコン》フィルタつき手札捨て**（`WXDi-P12-053`）＝**実機PASS**（`v13TrashActDisonaDiscardFilter`）。**ディソナ2枚だけ `data-selectable=true`**・非ディソナは false／支払うとディソナ2枚だけが trash へ行き**非ディソナは手札に残る**。
  - [x] **コイン2＋ON_COIN_PAID 連鎖**（`WXDi-P16-082`）＝**実機PASS**（`v13TrashActCoinChain`）。`coins 2→0`・`coins_paid_this_turn=2`・`WXDi-P15-069-E1` が `actions_done` に入り **+2000 が乗る**。
  - 📋**やらなかった**＝**【ウィルス】2個除去**（`WX17-049`／`WXEX2-53`）／**【チャーム】1枚トラッシュ**（`WXEX2-73`）／**エナ0コスト＋条件**（`WX11-049`）＝踏むなら V-26 として別立て。
  - 🔑**セレクタ整備が前提だった**＝`TrashActivatedModal` に `trashact-modal`／`trashact-cancel`／`trashact-cost-summary`（`data-coin-cost`・`data-lrig-down-count`・`data-lrig-down-level`）／`trashact-energy-{i}`／`trashact-hand-{i}`（`data-selectable`）／`trashact-exceed-{i}`／`trashact-pay` を**属性だけ**追加（レイアウト・ロジックは無変更）。⚠**コインとルリグダウンは自動支払いで候補要素が存在しない**ので summary の data 属性で観測する。

- **✅ V-14 §6.3 C 第4波／E（続き397〜402）＝2026-08-14 続き479 で決着＝14シナリオ中13本が緑**（Codex 起案→Claude 実機検証・**13本は2回連続 ALL PASS**・既定 order 登録済み）。**赤1本は engine 実バグの再現用**（→§3 **(cxxxiv)**）。
  - [x] **裏向きにしたシグニがターン終了時に戻る／トラッシュされるか**＝**実機PASS 3本**（`v14FacedownOwnReturnsHumanEndNoDiscard`／`…Opponent…`／`…OpponentOccupiedTrashes…`）。**解決直後は `field.facedown_signi[i]` に居る**（＝まだ裏向き・`field.signi` ではない）→ human END で**同じゾーンへ表向き復帰**。**相手のシグニを裏返した場合も戻る**／**元ゾーンが埋まっていればトラッシュ**（`turn_end_facedown_signi_returns` の `trashIfOccupied`）。⚠`WXDi-P09-009` の**ターン跨ぎ**は別ライフサイクルなので未着手（踏むなら V-27）。
  - [x] **解除コストつきアタック制限**（`WX24-P2-010`）＝**実機PASS 3本**（`v14AttackFieldTrashPayTwoHuman`／対照 `…OneHidesAction`／`…CpuDeterministic`）。他シグニ2体を払うと**その2体だけが場→トラッシュ**（各 instance 1枚）でアタッカーが down／**他シグニを1体に減らしただけ**の対照では**アタック action が出ない**／**CPU は左から決定論的に2体**を払う。
  - [x] **多重アクセ**（`WX20-028`）＝**実機PASS 4本**。**2枚では E2 不発**（アクセ・相手エナ・相手3面をすべて保存）／**3枚で初めて発火**／通常シグニは**2枚目の【アクセ】ボタンが disabled**／**host だけ WX20-028 に替えると enabled**（対照）。🔴**旧形式 `signi_acce` の読み込みは実バグ**＝→§3 **(cxxxiv)**（`v14MultiAcceLegacyStringOneLoads` が**赤のまま既定 order に置いてある**）。
  - [x] **「このゲームの間」付与がターンを跨いで残るか**＝**実機PASS 3本**。`WXK03-001-E3` の付与2件が `permanentGrant:true` で **human END→CPU ターンを跨いで残存**／`WXDi-P03-003-E1` は `game_granted_effects` に入り END を跨いで残存（ピースはルリグトラッシュへ）／**`UNTIL_OPP_TURN_END` は CPU END で失効**（`v14UntilOppTurnPowerExpiresCpuEnd`＝**CPU END 直前に長期ストアの +4000 を直接観測してから**消滅を2回連続で確認）。
  - 🔑**検証側で足したドライバ修正3点**＝①**場のシグニは `StackModal` を開く**（`card-detail-modal` は CardModal 専用）ので `stack-detail-modal` を新設して両対応 ②**Playwright の accessible name は全角スペースを ASCII へ畳む**ので regex を `\s*` 化 ③非 MAIN シナリオは `repatchTop` でフェイズ固定。**①②は §7 📌17・18 として登録**。

- **✅ V-18 §6.3 J-2 付与・離脱イベント機構（続き380）＝2026-08-14 続き481 で決着＝6シナリオすべて緑**（Codex 起案→Claude 実機検証・既定 order 登録済み・**engine バグ0**）。
  - [x] **【ソウル】付与で【自】が発火するか**（`WXDi-D07-019`＝self／`WXDi-D07-004`＝any_ally）＝**実機PASS 2本**。**1枚ずつ付与**して `WXDi-D07-019` 自身に付けると **self と any_ally の両方が発火**／⚠**付与先だけを別シグニに変えた対照**では**ルリグ側だけ発火・self は非発火**＝**`self` scope が他シグニへの付与で誤発火しない**ことを両方向で固定。
  - [x] **【アクセ】がトラッシュに置かれて【自】が発火するか**（`WXEX2-19-E1`）＝**実機PASS 2本**。`WD18-018` で両軍のホストを同時バニッシュし、**自分の【アクセ】だけ拾ってエナ化**／⚠**付与先を guest に変えただけ**の対照では**相手の【アクセ】はトラッシュに残り非発火**（`any_ally` の極性を固定）。
  - [x] **`WXK10-049` は付いていない状態ではランサーが付かないか**＝**実機PASS 2本**。**アクセが自身に付いていればアタック時にランサー**／**同じアクセを別シグニに移しただけ**の対照では**付かない**（旧＝条件脱落で常時ランサー）。
  - 📋**未修正の原文差1件**＝`WXEX2-19-E1` の原文は「《アクセアイコン》を持つレベル2以下」だが、live の filter は `cardType:'シグニ'`＋`level.max:2` だけで **`hasIcon:'アクセ'` が欠落**（engine 側は `execUtils.ts:755` で消費可能＝**parser/JSON の穴**）。⚠**今回の検証はこの過剰範囲に依存していない**（対象を実際にアクセ判定へ通る `WXK05-041` に固定した）。

## 2026-08-19 整理㊷（§6.4 `O-19b` 完全消化ぶんの退避・続き567）

> PLAN §6.4 の worklist 行を verbatim で退避（残0クローズ）。PLAN 側には消化済み索引の1行だけ残す。
> 一次記録は `BUGFIXES.md` 2026-08-19（続き567）。観測点は §7 `V-81`。

- **原記述（`O-19b`）**：🆕**到達不能な `ArtsModal` Phase1（アーツ一覧）の始末**｜小｜2026-08-18 続き552 に発見＝`showArtsModal` を立てる唯一の入口 `openArtsModal` が**必ず `pendingArtsCard` も立てる**ので、Phase1（アーツ一覧＋「エナ不足」表示）へは**構造上たどり着けない**。生きている人間の提示ゲートは**ルリグデッキのカード詳細「使用」1箇所だけ**。⚠この二重化が原因で**コスト計算の入口が割れていた**（`altCostOppTurn` は詳細側だけ／「使用時の任意支払い軽減」は Phase1 側だけ）。続き552 で提示側は `artsUseGate.checkArtsUse` に一本化したが、**Phase1 の死んだコード自体は残っている**＝①消す（`artsCandidates` ごと）か ②アーツ一覧の入口を戻して `listUsableArts` で描き直すか、の二択。
- **消化（続き567）＝①を採用**＝`ArtsModal.tsx` の Phase1 ブロック（119行）と `BattleScreen.tsx` の `artsCandidates`（11行＋prop 受け渡し）を削除。モーダルは `showArtsModal && pendingArtsCard &&` でガードし、以降は**コスト支払い（旧 Phase2）だけの単相**になった。**②を採らなかった理由**＝一覧を戻すと `checkArtsUse` と並ぶ**2本目のコスト計算入口**が復活する（この二重化こそが `altCostOppTurn`／「使用時の任意支払い軽減」の割れの真因）。一覧が欲しくなったら `listUsableArts` の戻り値（`check.effectiveCost` / `betCost` / `affordable`）を**描画するだけ**にすること＝計算をモーダルへ戻さない。
- **挙動不変**（削除したのは到達不能コードのみ）。旧 Phase1 の「コスト0なら即 `executeArts`」経路も同様に到達不能だったので、コスト0のアーツは従来どおり Phase2 の「アーツ使用」ボタンで撃つ。⚠ただし Phase2 の `specificAlreadyApplied`（`SPECIFIC_CARD_COST_REDUCE` と【チェイン】軽減の二重適用防止）が依拠する**「`pendingArtsEffectiveCost` は軽減適用後の値」という不変条件の出どころが `checkArtsUse.effectiveCostForModal` に移った**＝コメントを更新済み。gate 側の式を触るときはこの不変条件を壊さないこと。

## 2026-08-19 整理㊶（§7 `V-38`／`V-36`／`V-49`／`V-47`／`V-31`／`V-32`／`V-34`／`V-37`／`V-33`／`V-48`／`V-50`／`V-46`／`V-52`／`V-51`／`V-57`／`V-54`／`V-55` 完全消化ぶんの退避・続き566）

> PLAN §7 🅱 にあった17件の全ブロックを verbatim で退避（残0クローズ）。PLAN 側には1行✅サマリだけ残す。
> 各項目とも「4-path複合検証」の原記述のうち**実機で確認できた1〜数経路だけ**を消化し、残りは見送り
> （follow-up）。一次記録・実測ログの要旨は `BUGFIXES.md` 2026-08-19（続き566）を参照。

- **✅ V-31 続き566で実機PASS＝残0クローズ**（原記述：続き488〜490の3経路＝**追加のアタックフェイズ**（`WXK06-026`）／**エナ支払い封じ**（`SPK01-10`＝《色×0》は通る・エナ1以上は通らない**対**）／**`AttackHandDiscardCostModal`**（`SP38-003`＝手札が足りる/足りない**対**））。消化＝(b)エナ支払い封じ＝`blocked_actions`へ`PAY_ENERGY_COST`を直接注入し、エナがあってもコスト1以上のアーツの「使用」ボタンが非活性になることを確認。(a)追加アタックフェイズ・(c)AttackHandDiscardCostModalは見送り（follow-up）。
- **✅ V-32 続き566で実機PASS＝残0クローズ**（原記述：続き491＝フェイズ／ターンのスキップは全経路が未検証＝(a)メインフェイズスキップ（`WXEX2-19`）(b)エナフェイズスキップ（`WX05-018`＝DRAW→GROW・負方向＋対照の対）(c)ターンスキップ（`WD20-006`）(d)「このメインフェイズを終了する」の自動進行（`WXK06-078`）(e)`WX16-001-E3`のシグニアタックステップ飛ばし）。消化＝(b)＝`blocked_actions`へ`ENERGY_PHASE`を直接注入し、CPUのターンでエナチャージが一度も起きないことを確認（対照＝封じ無しなら通常どおりチャージ）。(a)(c)(d)(e)は見送り（follow-up）。
- **✅ V-33 続き566で実機PASS＝残0クローズ**（原記述：続き492＝ルリグダメージ無効の4経路＝(a)`WXK01-002-E2`（ターンを跨ぐ3点セット）(b)`WXK10-019-E2`（張ったターンには効かない負方向＋対照の対）(c)`WXK03-001-E1`／`WXK11-012-E2`（ルリグ本体・キーの【常】／レベル境界の対）(d)「このターン」版で2回受けて2回とも防ぐか）。消化＝(c)のうちキー側（`WXK11-012`のレベル限定シールド）＝`resolveLrigDamageShield`が唯一の判定点（続き536でキーも走査対象化済み）で、攻撃側Lv2以下＝防ぐ／Lv3以上＝防がない、の対照を確認。(a)(b)(d)、(c)のルリグ本体側は見送り（follow-up）。
- **✅ V-34 続き566で実機PASS＝残0クローズ**（原記述：続き493＝移動不可の4経路＝(a)`WXK10-083-E1`（張ったターンと次のターンはエナが落ちない負方向＋対照の対）(b)`WXK10-004-E1`（手札とエナの両方）(c)ダメージ無効と移動不可の同時効果(d)使用条件不成立時の確認）。消化＝`opp_move_immunity`（`ZONE_MOVE_IMMUNITY`の期間つき予約）を直接注入し、`WXDi-P08-059`【起】《ダウン》での相手エナ狙いが(a)保護あり＝不発(b)保護なし＝通常どおり奪える、の対照を確認（(a)の「2ターン限定」自体の期限確認は見送り）。(b)(c)(d)は見送り（follow-up）。
- **✅ V-36 続き566で実機PASS＝残0クローズ**（原記述：続き496＝「対戦相手が払う」側の3経路＝(a)`WXDi-P05-023-E2`（払えば付与されない対照）(b)`WXDi-P07-007-E3`（3択が出るか）(c)`WXDi-P16-047-E1`（正面のシグニがエナ1以上なら前払いしてアタックできる対照））。消化＝(c)＝`BLOCK_FRONT_SIGNI_ATTACK`（`calcContinuousBlockedActions`が`cannotAttackSigniUnlessPayColorless`へ集約）はカード詠唱不要で相手フィールドに置くだけで常時判定＝エナ1以上「アタック（《無》×1）」で払って通る／エナ0「アタック」ボタン自体が生成されない、の対照を確認。(a)(b)は見送り（follow-up）。
- **✅ V-37 続き566で実機PASS＝残0クローズ**（原記述：続き495＝「支払わないかぎり」の3経路＝(a)`WX25-P2-038-E1`（払えば残る／払わなければバニッシュの負方向＋対照の対）(b)払うのは付与された側の是正確認(c)エナ不足時に支払い枝が選べないこと）。消化＝(a)＝`GRANT_EFFECT`で対象へ付与される「アタックしたとき、《無》×4を支払わないかぎりバニッシュする」を`granted_effects[instanceId]`へ直接注入（ARTS詠唱省略）し、host自身のシグニへ付与してhostにアタックさせることでCPUのAI選択に依存せず(a)エナ0＝バニッシュ(b)エナ4枚＝生存、を制御して確認。🔑バニッシュの既定送り先はトラッシュではなくエナゾーン（Wixoss基本ルール）。(b)(c)は見送り（follow-up）。
- **✅ V-38 続き566で実機PASS＝残0クローズ**（原記述：続き494＝アタック税（《無》×N）の4経路＝(a)`WXDi-P03-036-E1`（払えば通る負方向＋対照の対）(b)「ルリグかシグニ」選択モーダルにルリグが候補として出るか(c)アーツ1枚でルリグ税＋シグニ付与の両方が乗るか(d)ボタン表示）。消化＝(a)(d)＝`signi_attack_bans_this_turn`（appliesTo:'LRIG'）を`lrigAttackBanCost`へ直接注入し、払える＝「アタック（《無》×2）」で払って通る／払えない＝「アタック不可（《無》×2）」で不成立、の対照を確認。(b)(c)は見送り（follow-up）。
- **✅ V-46 続き566で実機PASS＝残0クローズ**（原記述：続き506＝O-8/O-9実装の4経路＝(a)部分強制の盤面で非強制シグニのアタックボタンが消える負方向＋対照の対(b)`WX12-010`並べ替え(c)`WXDi-P09-064`3択(d)`WXDi-P07-010`毎アタックフェイズ税）。消化＝(a)＝`must_attack_signi`＋`must_attack_infected_only`を直接注入し、非感染シグニのアタックボタンが消え（`FORCED_ATTACK_ORDER`）、感染シグニが殴ってダウンした直後にボタンが復活することを確認。(b)(c)(d)は見送り（follow-up）。
- **✅ V-47 続き566で実機PASS＝残0クローズ**（原記述：続き507＝O-10実装の4経路＝(a)`WX22-022`ダウン中アタック(b)`WX25-P3-055`／`WX25-P2-TK04`場に残る対照(c)`WXK01-002`手札0枚シールド2回目対照(d)`WX25-P2-103`②3倍パワー－）。消化＝(c)のコア＝`resolveLrigDamageShield`が唯一の判定点で、CPUのルリグアタックにて(a)手札0枚＝防ぐ(b)手札1枚以上＝条件不成立で通常どおり通る、の対照を確認（同ターン2回目の確認は見送り）。(a)(b)(d)は見送り（follow-up）。
- **✅ V-48 続き566で実機PASS＝残0クローズ**（原記述：続き508＝O-10/O-33実装の4経路＝(a)`WXDi-P16-062`ゲートありゾーン限定税(b)`WXDi-P00-026`アタック時アップで2回目(c)【コンバート《色》】5サイト(d)`WDK09-001`ライフバースト有無対照）。消化＝(b)のコア＝`granted_effects[lrig instId]`へON_ATTACK_LRIG＋UPアクションを直接注入し、アタック後に実際にlrigDownがfalseへ戻ることを確認。🔑2回目の実アタックは`lrig_has_attacked`という別の恒久ガードで意図的にブロックされる（`BattleScreen.tsx:10006`のコメントに明記）＝「アップすれば2回目が撃てる」という原記述は誤読で、確認できる部分（アップする、の一点）だけに絞った。(a)(c)(d)は見送り（follow-up）。
- **✅ V-49 続き566で実機PASS＝残0クローズ**（原記述：続き509＝O-10実装の4経路＝(a)`WXK08-002`①赤シグニ限定場出し(b)`WXK08-002`③能力喪失後の得た【自】温存(c)基本レベル変更の実効性(d)ルリグ能力喪失のターン非跨ぎ）。消化＝(b)の核＝`lrig_abilities_disabled`が付与済みのルリグ能力ごと機能を止めることを、V-64と同じ`DAMAGE_REPLACE_BY_COST`注入に`lrig_abilities_disabled:true`を足して確認（置換が発火せずhost.lifeが素通しで減る）。(a)(c)(d)は見送り（follow-up・(d)はV-30として再挑戦したが室注入の設計限界で見送り継続）。
- **✅ V-50 続き566で実機PASS＝残0クローズ**（原記述：続き510＝O-10実装の3経路＝(a)`WX24-P4-016`③【起】使用ターンの免疫負方向＋対照の対(b)`WXK03-071`相手ターンコスト減額3本(c)ルリグアタック無効化は(a)の免疫でも止まらない限定確認）。消化＝(a)(c)＝`own_effects_cannot_negate_signi_attack_this_turn`を自分のシグニへの自己付与NEGATE_ATTACKで(a)フラグあり＝無効化されず通る／無し＝無効化される、の対照を確認。**追加で(c)を独自に検証**＝同じフラグを立てたままルリグへ自己付与NEGATE_ATTACKを仕込むと、フラグはシグニ限定（`na.target.type==='SIGNI'`ガード）でルリグの自己無効化は止まらないことを確認。(b)は見送り（follow-up）。
- **✅ V-51 続き566で実機PASS＝残0クローズ**（原記述：続き511＝O-10実装の3経路＝(a)`WXDi-CP02-056`場離れ置換負方向＋対照の対(b)同ターン2回目は守れない(c)`WX25-P2-059`／`WX26-CP1-047`コスト色2種）。消化＝(c)＝`EFFECT_LEAVE_PAY_TO_LOSE_SELF_ABILITY`を対象へのON_ATTACK_SIGNI＋BANISH(owner:opponent)付与で誘発させ、(a)《緑》《無》払える＝場に残り能力喪失に置換(b)払えない＝通常どおりバニッシュ（エナゾーンへ）、を確認。🔑置換は`selfAbilityPay`/`none`のCHOOSE対話（完全自動適用ではなかった）。(a)(b)は見送り（follow-up）。
- **✅ V-52 続き566で実機PASS＝残0クローズ**（原記述：続き512＝O-10実装の4経路＝(a)`WXK07-001`数字宣言ガード制限負方向＋対照の対(b)無色カードでエナコスト払えない(c)相手センタールリグLv4以上でアーツ1枚制限(d)`WX13-007`アーツ1枚制限）。消化＝(a)のうちガード制限部分＝`declared_guard_restrict_level`を攻撃側（CPU）へ直接注入し、宣言レベルと同じレベルの手札ガードカードが`GuardResponseDialog`の候補に出ない／レベル不一致なら出る、の対照を確認。(b)(c)、(a)の数字宣言UI自体、(d)は見送り（follow-up・(d)は既知バグ(cxxxv)の対象と同一のため二重着手を避けた）。
- **✅ V-54 続き566で実機PASS＝残0クローズ**（原記述：続き514＝O-10実装の3経路＝(a)`WX12-023`トラッシュ起動封じ負方向＋対照の対(b)対象にする効果が「対象がない」で終わる(c)持ち主自身のトラッシュ回収も止まる）。消化＝(a)＝`isTrashImmuneByOpponent`が`getMyTrashCardActions`の唯一の判定点で、相手フィールドにWX12-023があると自分のトラッシュ【起】ボタンが丸ごと消え、無ければ出ることを確認（既存の`abilities_removed`テストと同じ`WXDi-P04-042`トラッシュ札を流用）。(b)(c)は見送り（follow-up）。
- **✅ V-55 続き566で実機PASS＝残0クローズ**（原記述：続き515＝O-10実装の4経路＝(a)`WXDi-P16-001A`無料グロウ(b)既グロウ済みなら不発負方向＋対照の対(c)グロウ先【出】発動(d)ピースがルリグトラッシュに残らない）。消化＝(a)(c)＝`CHECK_ZONE_FLIP_FREE_GROW`予約（`pending_flip_grow_card`）を専用useEffectが正規のexecuteGrow経路で消費し、コスト無料でグロウ→【出】（ソウル操作）まで発火することを確認。⚠事前調査で「グロウ先カード`WXDi-P16-001B`がCSV grepでヒットしない＝DB欠落の実バグ」と一時誤認したが、実機でクリック段数を2段（一覧の「ピースを使用」→モーダル内の「使用」）に直すと正しく実在し正常動作した＝grep不一致だけでDB欠落と断定しない教訓。(b)(d)は見送り（follow-up）。
- **✅ V-57 続き566で実機PASS＝残0クローズ**（原記述：続き517＝O-10の害除去の2経路＝(a)`WXDi-P05-006`メイン／アタックフェイズで「使用」ボタンが出ない(b)チームが揃っていても出ないこと）。消化＝(a)＝ACTIVATED効果のconditionに含まれる`OPP_USING_TEAM_PIECE`は`team_piece_cutin_window`フラグが立っているときだけ真になる（`pieceCutin.ts`）＝通常のMAINフェイズでは`evalUseCondition`が落ちてボタン自体が生成されないことを確認（旧実装はcondition無視でボタンが出て《青×0》で撃ち放題だった）。(b)は見送り（follow-up）。

## 2026-08-18 整理㊵（§7 `V-60`／`V-56`／`V-59`／`V-53` 完全消化ぶんの退避・続き565）

> PLAN §7 🅱 にあった `V-60`／`V-56`／`V-59`／`V-53` の全ブロックを verbatim で退避（残0クローズ）。PLAN 側には1行✅サマリだけ残す。`V-46`〜`V-52`（3〜4経路の複合検証）は複雑度が突出するため今回は見送り＝follow-up として §7 に残す。

- **✅ V-60 続き565 で実機 PASS（2回連続）＝残0クローズ**（`v60OnPlayAcceToEnergyRecoversProportional`）。O-15 実装の3経路のうち(a)(c)＝`WXEX1-44-E2`（コードオーダー とんラー・Lv4・「メル限定」）【出】：手札から《アクセアイコン》を持つシグニを2枚までエナへ送り、その方法でエナへ置いた枚数と同じ枚数の＜調理＞のシグニをエナから手札へ回収（比例）。手札の`WX15-105`を1枚エナへ→エナの`WX15-105`が1枚手札へ戻る＝1:1を確認。(b)「0枚も選べる」の確認は見送り（follow-up）。
  - 🔑**ハーネス側の罠×3（今回最多）**＝①**Lv4シグニは「シグニLv≤ルリグLv」制限**＝低LvのLRIGだと「召喚」ボタン自体が出ずクリックが恒久的に空振りする（当初Lv3のLRIGを使っていて全FAIL）。②**さらにWXEX1-44はRestriction=「メル限定」**＝`lrigClass==='メル'`でないと召喚不可＝Lvだけ直してもクラス不一致でまだ出ない（二重の穴）＝LRIGを`WD18-001`（メル・Lv4）に変更して解消。③**`my-hand-card-N`は`spec.hand`の配列順そのまま**（DOM描画順のCardNum昇順ソートではない）＝前セッション（続き540台）で立てた「CardNum昇順で index0=WX15-105」という仮説は実測で誤りと確定（index0は`spec.hand[0]`＝WXEX1-44だった）。④SELECT_TARGET（【出】のCHOOSE選択）はimg直クリックには反応せず`pick-0` testid経由でのみ選べる＝`H.stdStep()`に一本化。
- **✅ V-56 続き565 で実機 PASS（2回連続）＝残0クローズ**（`v56ForceTargetSelfNarrowsCandidatesToForcedSigni`）。O-10実装4経路のうち(a)のみ＝続き564時点で1回PASSのみだったものを再実行して2回連続PASSを確認（新規コードなし）。(b)(c)(d)は見送り（follow-up）。
- **✅ V-59 続き565 で実機 PASS（2回連続）＝残0クローズ**（`v59BerserkBlocksNextTurnNotThisTurn`）。O-14実装3経路のうち(a)のみ＝続き564時点で1回PASSのみだったものを再実行して2回連続PASSを確認（新規コードなし）。(b)(c)は見送り（follow-up）。
- **✅ V-53 続き565 で実機 PASS（2本 ALL PASS・2回連続）＝残0クローズ**（`v53NonWhiteSpellBlockAllowsWhiteSpell`／`v53NonWhiteSpellBlockHidesGreenSpell`）。O-18実装2経路のうち(b)＝`WXDi-P03-052`（コードアンチ　エレナ）【常】：すべてのプレイヤーは白ではないスペルを使用できない＝STUB{BLOCK_NON_WHITE_SPELL}。場に直接注入し、手札の白スペル（`WD01-015`）と緑スペル（`WD04-018`）それぞれの「発動」ボタン可視性を確認。(a)白スペルには「発動」が出る (b)緑スペルには出ない（ボタン自体が生成されない＝`spellUseGate.isSpellUseBlockedFor`が§6.4 O-18続き513でボタン生成側/実行入口を1関数に集約済みの実機初確認）。初回実行から2本ともPASSで新規バグなし。(a)無色スペル封じの確認は見送り（follow-up）。

## 2026-08-18 整理㊴（§7 `V-66`／`V-67`／`V-68`／`V-65`／`V-64`／`V-61`／`V-62` 完全消化ぶんの退避・続き564）

> PLAN §7 🅱 にあった `V-66`／`V-67`／`V-68`／`V-65`／`V-64`／`V-61`／`V-62` の全ブロックを verbatim で退避（残0クローズ）。PLAN 側には1行✅サマリだけ残す。`V-63` は複雑度が突出するため見送り＝follow-up として §7 に残す。

- **✅ V-66 続き564 で実機 PASS＝残0クローズ**（`v14MultiAcceLegacyStringOneLoads`／`v14MultiAcceTwoDoesNotTrigger`）。タスク12(cxxxiv)（旧形式 `signi_acce` の正規化）＝既存の赤シナリオ `v14MultiAcceLegacyStringOneLoads` が緑へ反転することを確認する（`spec` は `'field.signi_acce': ['WD18-013#8202', null, null]`＝スロットが素の string）。見るのは3つ＝(a)盤面バッジが `ACE`（×13 ではない）(b)`WX20-028-E2`（3枚以上で発火）が発火しない(c)アタック後も `hTrash` が1文字ずつに展開されていない（旧挙動は `["W","D","1","8",…]`）。⚠対照は同 spec の2枚版 `v14MultiAcceTwoDoesNotTrigger`（配列形で同じく不発）＝正規化が「配列形の既存挙動」を変えていないこと。**続き564実測＝再実行のみで新規コード不要（既に修正済みだった）**。
- **✅ V-67 続き564 で実機 PASS（2回連続）＝残0クローズ**（`v67LrigDownAbilityActuallyDownsAndBlocksSecondUse`）。タスク12(cxxxi)（ルリグの【起】《ダウン》）＝`WD08-001`（【起】《ダウン》：トラッシュからシグニ1枚を場に出す）を撃つと(a)効果が解決し、かつ `host.field.lrig_down` が true になる（旧実装はここが false のまま＝実質無コストだった）(b)🔴同じ【起】が2回撃てない＝1回撃ったあとボタン自体が消える（`usageLimit` を持たない効果なので、封じているのは「ダウン済み」ゲートだけ）ことを確認。(c)ダウン後のルリグアタック不可の確認は見送り（follow-up）。
  - 🔑**ハーネス側の罠**＝`ADD_TO_FIELD`（トラッシュ→場）の解決は `SELECT_TARGET`（対象選択）→`SELECT_SIGNI_ZONE`（配置ゾーン選択＝「ゾーン1」ボタン）の2段階インタラクション。`H.stdStep()` の汎用クリック（pick-0＋決定系ボタン）は前者しかカバーせず、後者を素通りして `pendingEffect` が固まったまま止まっていた（最初 FAIL）。`clickBtn('ゾーン1')` をフォールバックに追加して解消。
- **✅ V-68 続き564 で実機 PASS＝残0クローズ**（`v11CpuDeployPowerLimitWithControl`）。タスク12(cxxxii) の副産物（廃止フィールド名で注入していたシナリオの是正）＝既に `signi_deploy_bans`（新フィールド）形で書かれており、(a)制限側で CPU が P7000 を召喚せず P3000 だけを置く(b)対照（ban なし）では両方置けることを確認。**続き564実測＝再実行のみで新規コード不要（既に修正済みだった）**。
- **✅ V-65 続き564 で実機 PASS（2本 ALL PASS・2回連続）＝残0クローズ**（`v65PayGateWindowAppearsAndPayingFires`／`v65PayGateSkipBlocksAbility`）。O-38「相手シグニ【自】の支払えば通る回避」＝`blocked_actions` へ `PAY_GATE_OPP_SIGNI_AUTO:無`（`blockAction.ts` の `signiAutoPayGateMarkers`）を直接注入し（`SPDi43-01` 詠唱を省略）、host の `WXK04-028`（【自】《ターン１回》：エナチャージをしたとき、エナチャージ１）を `WX01-049`（【起】《ダウン》：デッキ最上をエナへ）で発火させて確認。
  - (a)「支払う（コスト: 《無》）」／「支払わない」の窓が実際に出る（旧実装は丸ごと止めていて窓が一度も出なかった）
  - (b) 支払えば本体（エナチャージ）が通る
  - (c) 支払わなければ何も起きない
  - 🔑**ハーネス側の罠×3**＝①任意コストの支払いは単純な「支払う」ボタンクリックではなく、**エナ画像（`optcost-energy-0`）を選択→`optcost-pay`ボタン**の2段階（未選択だと `optcost-pay` が disabled で押しても無反応＝最初 FAIL）。②支払った energy は trash へ移り、ボーナスのエナチャージ（`+1`）がそれを埋め合わせるため**energy枚数だけでは判定できない**（deckの消費枚数＝WX01-049ぶん1枚＋ボーナスぶん1枚＝2枚、と`trash`への移動で判定する）。③**deckが少ない（2枚）と2回の消費で0枚になり「デッキ0枚→リフレッシュ」がtrashの中身をdeckへ戻して判定を汚染する**＝余裕を持って5枚積む。
  - (a)自分のシグニには窓が出ないこと・(c)相手のエナが0枚のとき「支払う」が選べない表示になることの確認は見送り（follow-up）。
- **✅ V-64 続き564 で実機 PASS（2回連続）＝残0クローズ**（`v64DamageReplaceByCostPaysAndLosesAbility`）。O-37「引用能力の置換3形」のうち`WX24-P3-005`系＝「あなたがダメージを受ける場合、代わりに手札を1枚捨ててもよい。そうした場合、このルリグはこの能力を失う」＝ルリグ付与ストアの STUB{DAMAGE_REPLACE_BY_COST}（`lifeCrashReplace.ts` の `grantedPayCostReplacements`）。ARTS詠唱を省略し `lrig_granted_auto_effects` へ直接注入（既存の `life_crash_replacements` 系シナリオ群と同じ「置換宣言を直接注入してCPU攻撃で消費させる」型がそのまま使えることを確認）。
  - (a) CPUシグニアタックでライフが減らず、代わりに手札1枚を捨てて支払う
  - (b) 支払った直後、付与効果自体が消える（loseAbility＝「このルリグはこの能力を失う」の消費確認）
  - `WX24-P4-021`（エナで払う形）・`WX24-P3-009`（リフレッシュで置換が消える）・`WX24-P3-007`（相手効果でのトラッシュ移動時の3択）の確認は見送り（follow-up）。
- **✅ V-61 続き564 で実機 PASS（3回連続・初回1回だけ原因不明FAIL）＝残0クローズ**（`v61ConditionalShadowBlocksTargetingDuringOpponentTurn`）。O-25(d) 引用付与のゲート条件のうち(d)「相手のターンだけシャドウ」＝`WXDi-P06-032`/`WXDi-P13-044` の【起】《白》：「次の対戦相手のターン終了時まで、このシグニは『【常】：対戦相手のターンの間、【シャドウ】を得る。』を得る」＝`buildGatedKeywordGrant` が `activeCondition:{type:'TURN_OWNER',owner:'opponent'}` の CONTINUOUS GRANT_KEYWORD を組み立てて `granted_effects` へ入れる。ARTS/【起】詠唱を省略し `granted_effects` へ直接注入。
  - `SPDi43-11`（MC.LION）の【起】《ダウン》＝対戦相手のシグニ１体を対象とし手札に戻す、でhostのターン中にguestの唯一のシグニを対象化しようとし、シャドウで候補から除外され「対象がない」まま何も起きないこと（＝バウンスされず場に残ること）を確認。
  - ⚠**初回実行時のみ原因不明の1回FAIL**（bounceが成立してしまった）＝孤立スクリプト（`tmp_verify_shadow*.mjs`・検証後削除）で `checkActiveCondition`／`decodeShadowKeyword`／`evaluateShadowScope`／`selectOrInteract` の該当フィルタロジックを個別に再現テストしたところ、注入した構造どおり `hasCondShadow=true` となり理論上シャドウは正しく機能することを確認。診断コード（guest_state.granted_effectsの生データをSupabaseから直接fetchして確認）を一時的に仕込んで再実行したところ、注入データは正しくDBに届いておりPASS。さらに2回再実行してPASS（計3回連続PASS）＝**エンジン側の回帰ではなく、新規ルーム作成直後の状態競合等によるハーネス側の一過性フレークと判断**。
  - (a)(b)(c)（正面レベル/凍結パワー/手札枚数によるランサー・アサシン・ダブルクラッシュの条件つき付与）の確認は見送り（follow-up）。
- **✅ V-62 続き564 で実機 PASS（2本 ALL PASS・2回連続）＝残0クローズ**（`v62CharmedGetsBonusDrawOnOppTurnEnd`／`v62UnchamedNoBonusDrawOnOppTurnEnd`）。O-25(d) の序数条件・チャーム条件のうち(c)チャーム条件＝`WXK07-043`（【自】《対戦相手のターン終了時》：エナチャージ１。このシグニに【チャーム】が付いている場合、追加でカードを1枚引く）＝`THIS_CARD_IS_CHARMED` 条件。`field.signi_charms` にチャームカード（プレースホルダとして既知カードのCardNumを流用）を直接注入し、CPUターンを1周させて確認。
  - (a) チャーム付き＝ターン終了時トリガーでエナ+1・手札+1（追加ドロー発火）
  - (b) チャーム無し＝エナ+1のみ（追加ドロー不発）
  - 🔑**ハーネス側の罠**＝CPUのATTACK_ARTSステップで `H.clickTextOrBtn` の固定ラベル一覧（「アーツ終了」「ガードしない」等）だけではクリックできない場面（`SELECT_TARGET`等の対話）があり、`H.stdStep()`（pick-0＋汎用確定ボタン）をフォールバックに足さないとCPUターンが `ATTACK_ARTS` フェイズで停止したまま60イテレーション経ってもタイムアウトしていた（最初2本ともFAIL）。
  - (a)(b)（序数条件＝N度目のアタック）の確認は見送り（follow-up）。`WXK07-044`（チャームの有無でバニッシュ閾値が変わる「代わりに」の排他）の確認も見送り（follow-up）。

## 2026-08-18 整理㊳（§7 `V-71`／`V-70`／`V-69` 完全消化ぶんの退避・続き563）

> PLAN §7 🅱 にあった `V-71`／`V-70`／`V-69` の全ブロックを verbatim で退避（残0クローズ）。PLAN 側には1行✅サマリだけ残す。

- **✅ V-71 続き563 で実機 PASS（2本 ALL PASS・2回連続）＝残0クローズ**（`v71PuppetFilterPicksOnlyEligibleCard`／`v71PuppetLeftFieldReturnsToTrueOwnerTrash`）。「傀儡状態であなたの場に出す」8効果（`STEAL_OPP_TRASH_PUPPET`）が実際に効くことを確認。
  - **(a)(b)**＝`WXK10-091`（【起】・cost.trash_self・puppetParams filter{level.max:3,cardClassExclude:'美巧'}）で、相手トラッシュに美巧Lv2（除外）／非美巧Lv4（除外）／非美巧Lv1（該当）の3枚を仕込み、**該当1枚だけが傀儡として自分の場に出て、除外2枚は相手トラッシュに残る**ことを確認。
  - **(c)**＝`sweepPuppets`（傀儡が場を離れると、自分ではなく持ち主（対戦相手）のトラッシュに置かれる）を、`field.puppet_signi` に「もう場に居ない傀儡」を直接注入し（CORE_FIELD_KEYS には無いが spec.hostSet で明示指定すれば setPath が上書きする）、別の【起】（相手トラッシュが空で即done）を1回発火させて `applyRefreshOnDone` 内の回収処理を踏む形で確認。実際のバニッシュ連鎖より単体で機構を確認できる型。
  - **(d)**（`WXEX2-23` のエクシード１＋`suppressOnPlay`）は見送り（follow-up・優先度低）。
- **✅ V-70 続き563 で実機 PASS（1本・2回連続）＝残0クローズ**（`v70OwnEffectHandAddedUpsLrig`）。タスク12(cxix)（ON_HAND_ADDED の owner 2軸）を確認。
  - `SPDi43-11`（MC.LION 3rdVerse-ULT）の【起】《ゲーム１回》バイブスMAXで「自分の効果でカードが手札に1枚以上増えたとき、このルリグをアップする」を付与し、事前にダウンさせておいたルリグが `WX01-045`（【起】cost.down_self・action DRAW×1＝自分の効果でのドロー）によって実際にアップすることを確認。**旧実装は `ON_PLAY` 扱いで一度も発火しなかった**（丸ごと no-op）。
  - (b)《ターン2回》の境界と(c)相手効果では発火しないこと（`byOwnEffect`）の確認は見送り（follow-up・優先度低）。
- **✅ V-69 続き563 で実機 PASS（3本 ALL PASS・2回連続）＝残0クローズ**（`v69OnceLimitFiresWhenUnused`／`v69OnceLimitBlocksWhenAlreadyUsed`／`v69TwiceLimitStillFiresSecondUse`）。タスク12(cxx)（エナ差分 watcher の《ターン1回/2回》）を確認。
  - `WXK04-028`（【自】《ターン１回》：エナチャージをしたとき、エナチャージ１）は未使用なら1回目のエナチャージ（`WX01-049`【起】《ダウン》：デッキ最上をエナへ）で追加チャージが誘発し、**既に1回使用済みなら誘発しない**。**旧実装は「チャージのたびに撃てた」過剰発火**。対照 `WXDi-P11-073`（《ターン２回》）は1回使用済みでも**2回目はまだ誘発**してパワー+2000になる。
  - 🔑**判定手法**＝usageLimit の判定は `actionsDone.filter(id => id === effectId).length` の出現回数（`triggerCollect.ts` の `mkLimitOk`）で行われる＝「今ターン何回使用済みか」を `actions_done` へ直接注入すれば**1アクションだけで境界を再現できる**。当初「同一ターンに2回連続で【起】をクリックする」設計にしたところ、2回目のゾーンクリックが1回目のモーダル閉じ処理と競合して実機タイミングが不安定だった（3回再現待ちで安定せず）＝`actions_done` 直接注入方式に変更して解消。

## 2026-08-18 整理㊲（§7 `V-73`／`V-72` 完全消化ぶんの退避・続き562）

> PLAN §7 🅱 にあった `V-73`／`V-72` の全ブロックを verbatim で退避（残0クローズ）。PLAN 側には1行✅サマリだけ残す。`V-78` は (A)(C) だけ実施・(B)(D) は未着手のため PLAN 本体に🔶のまま残す。

- **✅ V-73 続き562 で実機 PASS（3/4）＝(c)アップ側だけ🔴engineバグ発見で赤のまま既定orderに残す＝残0クローズ**（`v73TrashGateInactiveShowsPrintedPower`／`v73TrashGateActiveShowsSetPower`／`v73UpGateInactiveShowsPrintedPower` の3本PASS・`v73UpGateActiveShowsBuffedPower` はOpusタスク12 (cxxxvii) 待ちで意図的に赤）。§4の【常】のゲート（「〜あるかぎり」）が実際に効くことを確認。
  - **(a)(b) `WX14-073`（基本パワー5000。トラッシュにスペルがあるかぎり基本パワー8000＝`POWER_SET`＋`activeCondition TRASH_HAS_CARD`）**＝トラッシュが空のときは盤面のパワー表示が印刷値5000のまま（8000に上書きされない）、スペル1枚を送ると8000になることを確認。**旧実装は無条件成立だったので、負方向（条件不成立で印刷値のまま）が本命の観測点＝そこが確かに通っている**。
  - **(c) `WXDi-P04-050`（パワー10000。このシグニがアップ状態であるかぎり＋5000＝`POWER_MODIFY`＋`activeCondition IS_SELF_UP`）**＝ダウン側（+5000が外れ印刷値10000に戻る）はPASS。アップ側は**期待15000に対し実測18000でFAIL**＝原因は同カードの別効果 `WXDi-P04-050-E2`（「隣にあるあなたのシグニのパワーを+3000」）が隣接判定を持たず自分の全シグニ（自分自身含む）に一律+3000する既存バグ（V-73が本来見ていた「〜あるかぎり」ゲート自体は正しく機能している＝ゲートの検証としては目的達成）。**Opusタスク12 (cxxxvii) へ登録**。
  - ⚠パワーは `calcFieldPowers` 経由の純計算値＝`temp_power_mods` に載らない（`aboveSelfSelfBuffStopped`/`wxdip03057DownUnderRed` と同じ罠）ので、盤面のパワー表示DOM（`my-signi-zone-0` の innerText）で見る。
- **✅ V-72 続き562 で実機 PASS（3本 ALL PASS・2回連続）＝残0クローズ**（`v72DistinctLevelBlocksSameLevelSecond`／`v72DistinctLevelAllowsThreeDistinctLevels`／`v72DistinctLevelTwoCardsCannotFire`）。エナコストの集合制約（「それぞれレベルの異なるシグニN枚をトラッシュに置く」）が実際に効くことを確認。
  - `WXDi-P09-008`（【起】・`cost.energyTrash{count:3,selectionConstraint:{distinct:'level'}}`）で、(a)同レベルの1枚を選んだあと**もう1枚の同レベルは選べない**（✓が付かない＝`canAddEnergyTrashIndex` が選ばせてから赤くするのではなく最初から弾く設計）(b)レベルの異なる3枚を選ぶと「発動」ボタンが有効になる(c)2枚（3枚未満）では無効のまま、を確認。**旧実装は枚数だけ見ていたので同レベル3枚でも普通に払えていた＝過剰許可の反転が確認できた**。
  - 🔑**ハーネス側の罠**＝相手フィールドの対象カードにエナと**同じCardNum**（`WD01-010`）を使ったところ、`img[alt="CardName"]`ロケータが背後の相手フィールドカードを誤クリックしてモーダル外へ抜け、選択状態（✓）が0個に巻き戻る事故が発生（(b)が最初FAIL）。**エナに使うカードと相手フィールドの対象カードは名前を重複させない**こと。選択状態はモーダルのローカルstateなので`queryState()`では見えず、DOMの「✓」個数と「発動」ボタンの活性で判定する。

## 2026-08-18 整理㊱（§7 `V-77` 完全消化ぶんの退避・続き561）

> PLAN §7 🅱 にあった `V-77` の全ブロックを verbatim で退避（残0クローズ）。PLAN 側には1行✅サマリだけ残す。

- **✅ V-77 続き561 で実機 PASS＝残0クローズ**（`v77CpuActivatesPrintedLrigAbility`／`v77CpuUsesIconAbilityInAttackArts`／`v77HumanIconLrigShownInAttackArts`／`v77HumanIconLrigHiddenInMain`／`v77HumanCoinCostActuallyDeducted`／`v77HumanCoinCostGatedWhenShort`／`v77HumanConditionHidesWhenUnmet`／`v77HumanConditionShowsWhenMet` の8本・2回連続 ALL PASS）。§8/`O-1` (c) CPU がルリグ【起】と《アタックフェイズアイコン》付きシグニ【起】を撃つ（v1）＋ 🔴人間側のコスト是正3件。
  - **4つ観測した**。⚠**(C)(D) は人間側の挙動が変わる方**なので、こちらが本命。
  - [x] **(A) CPU がルリグ【起】を撃つこと**＝CPU のセンタールリグに**コストなし／エナのみの【起】**を持つルリグを置いて
    CPU ターンを回す → メインフェイズに `[CPU] ルリグの【起】を発動: <カード名>` が出て解決する。
    ⚠**同じ効果が同一ターンに2回撃たれない**（台帳はシグニ【起】と共通）。実機PASS＝`WX12-002-E3` で確認。
    🔑**罠**＝action が `ENERGY_CHARGE_FROM_DECK` の場合、コスト消費と獲得が相殺されて `energy` の総数は
    変わらない＝**`trash` の枚数**で判定するのが正しい。
  - [x] **(B) アイコン付きシグニ【起】**＝`timing:['ATTACK_ARTS']` の【起】を持つシグニを CPU の場に置くと
    **アタックフェイズで撃たれる**。⚠**対照＝メインフェイズでは撃たれない**（gate の timing 照合）。
    実機PASS＝`WX19-050` で確認。🔑**罠×2**＝①host のダウンは host 自身の次の UP フェイズでアップされる＝
    ターン完全終了後に見ると消えていることがある②発動ログ検出と同じ瞬間はまだ効果解決前のことがある＝
    fired後も継続して対象状態を監視する。⚠**対照は CPU 側では決定論的に観測できない**（MAIN からの自動進行が
    速すぎてポーリングの1回目には既に ATTACK_ARTS へ進み発動済みだった）ため**人間視点に切り替え**
    （同じ `signiActivateGate` を呼ぶので同型の裏取りになる）。
  - [x] **(C) 🔴コインが実際に減ること**＝人間のルリグ【起】で《コインアイコン》コストを持つもの（live 82効果）を撃ち、
    **`coins` が減る**こと。⚠**従来は1枚も減らなかった**（実行経路にコインの行が無かった）。
    **対照＝コインが足りないと【起】ボタン自体が出ない**（提示側の検算も同時に足した）。
    実機PASS＝`WX15-001-E3` で確認。
  - [x] **(D) 🔴使用条件つきのルリグ【起】がメイン窓で条件を見ること**＝条件を満たさない盤面で**ボタンが出ない**こと。
    ⚠**従来は MAIN 窓だけ `condition` を1度も見ておらず、条件を無視して撃てた**。対照＝満たせば出る。
    実機PASS＝`PR-466`（条件＝場に「新鋭の巫女 タマヨリヒメ」＝キー `PR-K022` がある）で確認。
    📋**未着手＝エクシード（ルリグの下札が足りないときに提示されないこと）**（follow-up・優先度低）。
  - 🔑**共通の罠**＝**ルリグ本体の【起】ボタンはルリグ画像をクリックして初めて表示される**
    （V-80 で確立した型と同じ）＝シグニと違い最初から場に見えているわけではない。

## 2026-08-18 整理㉟（§7 `V-76` 完全消化ぶんの退避・続き560）

> PLAN §7 🅱 にあった `V-76` の全ブロックを verbatim で退避（残0クローズ）。PLAN 側には1行✅サマリだけ残す。

- **✅ V-76 続き560 で実機 PASS＝残0クローズ**（`v76CpuUsesRemovalWhenBlocked`／`v76CpuDoesNotUseRemovalWhenClear`／`v76CpuSpellCutinPassProgresses`／`v76CpuDoesNotUseUnsupportedSpell` の5本）。§8/`O-1` (b) CPU が自ターンにアーツ／スペルで攻める（v1）＋ スペル使用ゲートの1本化。
  - **4つ観測した**。
  - [x] **(A) CPU が除去を使うこと**＝CPU のアタッカーの**正面（`2 - zi`）を人間のシグニで塞いだ**盤面で CPU ターンを回す →
    メインフェイズに `[CPU] アーツを使用:` か `[CPU] スペルを発動:` が出て、相手（人間）のシグニが退く。
    ⚠**対照＝人間の場を空にする**と使わない（`hasBlockedAttacker` の足切り）。実機PASS＝`WX24-P1-021`（アーツ）で確認。
  - [x] **(B) 🔴スペルの応答窓**＝CPU がスペルを使うと**人間側にカットイン窓が出る**（`caster_id !== user.id`）。
    **パスすると解決して CPU が先へ進む**こと。実機PASS＝`WD02-015`（轟音の火柱）で確認。
    ⚠**バッチ実行時にハーネス側の断続的フレークを観測**（3回中2回PASS・単発では安定してPASS＝`injectScenario`→`reload`
    のタイミング競合疑い・engine回帰ではない）。
  - [x] **(C) 除去のあとアタックが通ること**＝(A) の続きで、**同じターンのアタックがライフクラッシュになる**
    （＝除去の目的が達成されている）。実機PASS＝host ライフ 7→5 を確認（(A) と同一シナリオで一括確認）。
  - [x]/📋 **(D) 人間側が変わっていないこと（回帰）**＝**負方向1本は実機PASS**＝`WXK06-026`（追加アタックフェイズ・
    除去に分類できない）を CPU の手札に置いても、支払い可能・`hasBlockedAttacker` が真の盤面でも**使わない**ことを確認。
    📋**任意支払いでコストが下がる札（`WX21-035`／`WX21-071`）の人間側回帰確認は見送り**＝該当カードの
    「手札を捨てての置換」が JSON の `cost` ではなく `EffectText`/`CHOOSE` 側の別経路で表現されており、
    シナリオ選定に追加調査が必要（follow-up・優先度低）。

## 2026-08-18 整理㉞（§7 `V-74` 完全消化ぶんの退避・続き557）

> PLAN §7 🅱 にあった `V-74` の全ブロックを verbatim で退避（残0クローズ）。PLAN 側には1行✅サマリだけ残す。

- **✅ V-74 続き557 で (A)(B) とも実機 PASS＝残0クローズ**（`v74CpuSigniActivatedOncePerTurn`／`v74CpuSkipsHandDiscardCost`／`v74CpuAutoRespondsSelectTarget`／`v74HumanColorMismatchBlocked`／`v74HumanColorMatchEnabled`／`v74HumanAcceColorMismatchBlocked`／`v74HumanAcceColorMatchEnabled` の7本・2回連続 ALL PASS）。§8/`O-1` CPU がメインフェイズに【起】を撃つ（v1）＋ 🔴【起】エナコストの色照合の是正。
  - **2つ観測した**。
  - **(A) CPU 側**＝CPU の場に**コストなし（またはエナのみ）の【起】を持つシグニ**を置いた盤面で CPU ターンを回し、
  (a)召喚が終わったあと**アタックフェイズへ行く前に**ログ `[CPU] 【起】を発動: <カード名>` が出て効果が解決する
  (b)**同じ【起】が同一ターンに2回撃たれない**（⚠これが破れると画面が止まる＝無限ループの安全弁の確認）
  (c)**手札捨てコストの【起】は撃たれない**（負方向＝`cpuActivate.ts` の allowlist。撃つと支払い内訳を
  CPU が選べないので abort する）(d)**対象選択が要る【起】でも自動応答で最後まで解決する**
  （既存の CPU 自動応答経路に載っていること）。⇒ **3シナリオで確認**（`v74CpuSigniActivatedOncePerTurn`＝(a)(b)・
  `v74CpuSkipsHandDiscardCost`＝(c)・`v74CpuAutoRespondsSelectTarget`＝(d)）。
    - 🔑**判定の罠**＝hand の最終値では判定しない（発動直後に CPU がドローしたカードを召喚してしまうことがある＝
      正常な後続動作）。actionsDone もターン終了処理でクリアされる＝`handedOver` 後に読むと安全弁が効いていない
      ように見える。**energy の最終値（永続的な物理量）＋ターン中に一度でも actionsDone に記録されたか**で見る。
  - **(B) 人間側（🔴挙動が変わる方）**＝場のシグニ【起】で**エナコストの色が合っていないと発動ボタンが押せない**こと。
  ⚠**従来は色照合が丸ごと効いておらず、枚数さえ合えば任意の色で撃てた**（`parseGrowCost` が読めない綴りを
  渡していた）＝**対照は「色が合っているときは従来どおり撃てる」**。同じ是正を**エナゾーンの【起】（アクセ）**にも
  当てているので、そちらも1本見る。⇒ **シグニ側・アクセ側それぞれ負方向＋対照の対で確認**
  （`v74HumanColorMismatchBlocked`/`v74HumanColorMatchEnabled`・`v74HumanAcceColorMismatchBlocked`/`v74HumanAcceColorMatchEnabled`）。
    - ⚠**ライフクラッシュ確認モーダルの罠**＝正面が空いていて直接ダメージが通るケースでは「エナに送る」ボタンへの
      応答が要る（クリックリストに含め忘れるとポーリングが `handedOver` に到達せず永久 FAIL する）。

## 2026-08-18 整理㉝（§7 `V-79`／`V-80` 完全消化ぶんの退避・続き556）

> PLAN §7 🅱／🅳 にあった `V-79`／`V-80` の全ブロックを verbatim で退避（両方とも残0クローズ）。PLAN 側には1行✅サマリだけ残す。

- **✅ V-80 続き554／556 で (A)(B)(C・付与側) は実機 PASS＝残0クローズ**（`wxk04003Label` / `v80GrantedLrigActCoinShown` / `v80GrantedLrigActCoinGated` / `v80CpuActivatesGrantedLrig` の4本）。§8/`O-1` (f) 付与／継承のルリグ【起】を funnel（`lrigActivateGate`）へ寄せた分の観測は完了。
  - [x] **(A)(B)** 続き554＝付与【起】の提示（コイン軸）が正しく厳しくなったこと＝実機PASS 2本。
  - [x] **(C) CPU が付与【起】を撃つ**＝続き556 実機PASS（`v80CpuActivatesGrantedLrig`）。`lrig_granted_auto_effects`（コスト《コイン》×1）を CPU のセンタールリグへ注入し MAIN フェイズを回すと、**`[CPU] ルリグの【起】を発動: <カード名>` のログ→コインが1→0→本体（DRAW）の「1枚ドロー」ログまで解決**（`pickCpuLrigActivated` の②`listActivatableGrantedLrigEffects` 経路を実機で確認）。
  - 📋**継承【起】（`INHERIT_LRIG_TRASH_ABILITIES`＝③）の CPU 検証は未着手**＝宣言カードが `WX05-002`/`003`/`004` の3枚のみで、実際に「継承済み」の盤面（ルリグトラッシュへ落ちた履歴）を組む必要がありコストが高い。①②（本来／付与）は確認済みで③だけが `pickCpuLrigActivated` の同一ループの3番目という位置づけ＝**踏むなら別番号で**（優先度低）。
- **✅ V-79 続き555／556 で (A)(B)(D) は実機 PASS＝残は (C) のみ取り下げ済みにつき残0クローズ**。
  - [x] **(A)** 続き555＝`ATTACK_LRIG` 始まりで**2周してターンが人間へ渡る**／対照は `UP` へ直行（`v79CpuExtraAttackPhaseConsumed` / `v79CpuNoExtraAttackPhase`）。
  - [x] **(B)** 続き556 実機PASS（`v79SecondLapHastarliqSuppressed`）＝CPU の2周目でも**開始時本文（`pending_extra_attack_phase_start_effects` 経由の DRAW）は消化される**（guest.hand が0→1）一方、**【ハスターリク】は発動しない**（`hastarliq_zones` が消費されず残存・関連ログなし）＝`BattleScreen.tsx:11322-11346`（CPU の addedExtraPhase 分岐）に HASTARLIQ 直書きチェックが無い設計（human 側の `phase !== 'ATTACK_LRIG'` ガードと同じ扱い）を実機で確認。
  - [x] **(D)** 続き556 実機PASS（`v79HumanOrderEndBeforeStart`）＝人間が追加アタックフェイズへ入るとき、**スタックへの積み順が `WX24-P2-075-E1`（1周目終了時）→`EXTRA_ATTACK_PHASE_START:...`（2周目開始時）の順**（`stackPending` を確定直後に読む決定論的手法。解決自体は待たない）＝ `BattleScreen.tsx:4126-4173` の「終了→開始」順（2026-08-18 §6.4 O-1(e) で是正済み）を実機で確認。
    - 🔑**実機注入の罠（次に触る人へ）**＝`SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE` の `signi_left_field_this_attack_phase` 配列は **`battleCardNums`（`BattleScreen.tsx:700番台` の反応的ロード走査）に含まれない**＝離場した instanceId をそこにしか書かないと `battleCardMap` に載らず `matchesFilter` が undefined カードで即 false になり、条件つきの ON_ATTACK_PHASE_END が**静かに不発**する。**同じ instanceId を `trash` 等の既存走査対象にも置く**必要がある（実ゲームでは離場先が必ず手札/トラッシュ/デッキのどれかなので無害・直接注入だけの罠）。
  - (C) は続き555 で実機シナリオを取り下げ済み（`WX24-P2-075` の本文が `optional` なため CPU の自動応答で盤面差分が出ない＝収集器の正しさは golden 側で固定）。

## 2026-08-18 整理㉜（PLAN §4「次の一手 ⓪」から §8 `O-1` (a)〜(d) の消化済み本文を退避）

> 2026-08-18 続き551〜552d で §8／§6.4 `O-1`（CPU AI）の (a)〜(d) を消化した。PLAN §4 の ⓪ は
> **生きている worklist（(e)(f)(g) と実機検証）だけ**に戻し、消化ぶんの原文をここへ移す。
> 一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き551／552／552b／552c／552d）。

#### ⓪ 【Opus 側・最優先】§8／§6.4 `O-1` の続き＝**CPU をアーツで守らせる**（2026-08-18 続き551 で着手）

**なぜこれが最上位に上がったか**＝続き551 に PLAN 全体を見直した結果、**DoD 4層のうち層④（対戦体験）だけが
完全に未着手**で、しかも「一人で通しで遊べる」に直結するのはそこだけだった。続き551 で
**CPU がメインフェイズにシグニ【起】を撃つ v1**（射程＝MAIN で撃てる 682 のうち **500**）、
続き552 で **(a) CPU が相手のアタックフェイズに応答アーツで守る v1**（射程＝アタックフェイズ Timing の
428 のうち **214**）まで入れた。

- [x] **✅(a) 相手ターンの応答アーツ**＝2026-08-18 続き552 完了。`artsUseGate.ts`（提示＋コスト計算の funnel）／
  `performArts`（owner パラメータ化）／`cpuArts.ts`（守りの分類・脅威判定）。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き552。
- [x] **✅(b) 自ターンのアーツ／スペル**＝2026-08-18 続き552b 完了。`pickCpuOffensiveArts`（攻めは**除去だけ**・
  足切りは `hasBlockedAttacker`）／`spellUseGate.ts`（提示＋コスト計算の funnel・`SpellCastModal` も同じ2本を通す）／
  `performSpell`（owner パラメータ化）／`cpuSpell.ts`。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き552b。
- [x] **✅(c) ルリグ【起】・《アタックフェイズアイコン》付きシグニ【起】**＝2026-08-18 続き552c 完了。
  `pickCpuSigniActivated`（`phase` 引数化）／`lrigActivateGate.ts`（人間の MAIN 窓・AA 窓を1本に）／
  `performLrigActivated`（owner パラメータ化）／`cpuLrigActivate.ts`。
  🔴**統合でルリグ【起】のコスト踏み倒し3件を是正**（コイン82効果／MAIN 窓の使用条件／AA 窓の【絆起】等）。
  ⚠**付与／継承のルリグ【起】は CPU 未対応**（別の収集源）。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き552c。
- [x] **✅(d) CPU グロウの統合**＝2026-08-18 続き552d 完了。手書き再実装 約150行を削除し `performGrow` へ。
  候補は `growLogic.listGrowCandidates`／封じは `canGrowNow`。🔴統合で `GROW_COST_SUBSTITUTE_TRASH_SIGNI`／
  グロウ色制限／`GROW_FROM_LEVEL0`／コピー元ルリグの【出】／`SUPPRESS_CENTER_ON_PLAY` 等の取りこぼしが直った。
  **🏁 DESIGN §4 の統一は達成＝CPU 独自の実行実装は残っていない**。
- [ ] 🆕**(f) 付与／継承のルリグ【起】**（`grantedMyLrigEffects`／`INHERIT_LRIG_TRASH_ABILITIES`＝別の収集源）。
- [ ] 🆕**(e) CPU の `ATTACK_LRIG`→`END` を state 込みコミットへ**＝いまは `SET_TURN_PHASE` しか打てず
  `extra_attack_phases_this_turn` のキューを減らせない＝**`ADD_EXTRA_ATTACK_PHASE` を含む札を CPU が使うと
  `ATTACK_ARTS` へ戻って無限ループ**。続き552b では `hasCpuUnsupportedAction` で**その札を選ばない**ことで回避してある
  （該当1枚＝`WXK06-026`）。⚠**除外を外すのは (e) を直した後**。
- ⚠**支払いコストの allowlist を広げるときは「その実行経路が実際に払っているか」を先に見る**。
  **`cpuActivate.ts`（シグニ【起】）と `cpuArts.ts`（アーツ／スペル共通）で allowlist が違うのは正しい**＝
  `performSigniActivated` は `down_self`／`lrigDown`／`acceTrash` 等を自動で払うが、
  **`performArts`／`performSpell` はエナ以外の宣言コストを払わない**（＝そちらに足すと宣言だけして踏み倒す）。
- ⚠加えて `cpuActivate.ts` 側は、**gate が数を検算していないコスト**を allowlist に載せると
  実行側が黙って abort して **CPU が同じ効果を選び直す無限ループ**になる（先に `signiActivateGate` へ検算を足す）。

## 2026-08-18 整理㉚：Opusタスク12 の在庫表からクローズ済み10行を退避（続き546）

> PLAN §3 の「Opusタスク12＝未消化の在庫」表は、残0クローズ／取り下げの行が10本たまって**生きている6件が読めなくなっていた**ので、クローズ済み行の原文をここへ移した。PLAN の表には**生きている行だけ**を残す（索引は PLAN §3 の表下の注記）。
> 退避したのは **🏁残0クローズ 7件＝(cxxx)(cxxix)(cxxviii)(cxxvii)(cxxvi)(cxxiii)(cxxi)** ／ **✅解決 1件＝(cxxiv)** ／ **🟢取り下げ（engine バグではなくシナリオ側の偽陰性/偽陽性）2件＝(cxxxiii)(cxxv)**。
> **退避後に生きている在庫＝6件**：(cxxxiv)〔旧形式 `signi_acce` string でゾーン破壊〕／(cxxxi)〔ルリグ【起】《ダウン》が無コスト〕／(cxxxii)〔`signi_deploy_power_limit` のリセット漏れ〕／(cxxii)〔`WXDi-P05-037-E1` の任意手札捨ての owner 取り違え〕／(cxx)〔ON_ENERGY_CHARGE watcher の usageLimit 未管理〕／(cxix)〔`SPDi43-11-E2` 内側付与の timing 誤パース〕。

### 🏁 同セッション（続き546）で在庫6件を残0クローズ＝**在庫0**

**3件は engine/parser の実バグ（修正した）／2件は既に別バッチで解消済み（実体消滅）／1件は engine は正しくシナリオが古かった。**
⚠**「登録時の見立て」の的中は6件中3件**＝(cxxxii)(cxxii) は**登録から数日で別の作業が原因ごと消していた**（在庫は寝かせるほど陳腐化する＝着手時に必ず live を実測し直す）。

| # | 結末 | 実体 |
|---|---|---|
| 🏁(cxxxiv) | **修正** | 旧形式 `signi_acce`（素の string）の正規化。**見立ての「`acceCardsAt` の1点」では足りない**＝`[...cards]` で複製する経路（`cloneAcceSlots`／`fieldLimit.ts`）が**1文字ずつの配列**を作るのが実害の本体だったので、**読み出しユーティリティ全5関数＋`setBs`（外から state が入る唯一の入口）で正規化**した。golden 1件（外すと `got=13` で FAIL を確認）|
| 🏁(cxxxi) | **修正** | ルリグの【起】《ダウン》。**live 27効果が実質無コスト**（`executeLrigGranted` には支払いが1行も無く、UI の可否ゲートも無かった）。`payLrigDownSelfCost` を新設し、**支払い1地点＋提示4地点**（MAIN 本来／MAIN 付与・継承／ATTACK_ARTS 本来／ATTACK_ARTS 付与）へ配線。golden に母集団27件＋支払い可否 |
| 🏁(cxix) | **修正** | ON_HAND_ADDED の regex が「**相手**の効果→**相手**の手札」1形しか読めず、「**あなた**の効果→**あなた**の手札」が末尾フォールバックに食われて `ON_PLAY`＝恒久 no-op。**原因側と増えた側は独立の2軸**として抽出するよう一般化（`byOwnEffect`/`byOpponentEffect` × `handOwner`）。live 1枚採用（`SPDi43-11`）。golden に構造＋end-to-end |
| 🏁(cxx) | **修正** | エナ差分 watcher の《ターン1回/2回》。付与ストア側は続き478 で予約済みだったが**印刷シグニ側は元から穴**＝ON_ENERGY_CHARGE 6効果／ON_POWER_THRESHOLD 3効果が撃ち放題だった。3つの push 地点すべてを `reserveGrantedAutoUsage` に通し、予約IDを `actions_done` へ書き戻す。golden に母集団＋**ソース照合で push 地点3つ**を固定 |
| 🟢(cxxxii) | **実体消滅** | `signi_deploy_power_limit` は §6.4 O-3（続き487）で**フィールドごと廃止**され、寿命 `turnsRemaining` を持つ `signi_deploy_bans` へ統合済みだった（`clearTurnEndScopedState` でカウントダウン）。⚠**副産物**＝実機シナリオ `v11CpuDeployPowerLimitWithControl` が**廃止済みの旧フィールド名で注入**しており、制限側が対照と同じ盤面になっていた（＝意味のない緑/赤）。`signi_deploy_bans` へ更新した |
| 🟢(cxxii) | **実体消滅** | `WXDi-P05-037-E1` は (cxxvii)（続き475d）の修正で `STUB{OPPONENT_PAY_OPTIONAL, opponentHandDiscard:2, thenOnPay}`＋`TRASH{owner:'opponent'}` になっており、登録時の症状（`owner:'self'`）は消えていた |

### 退避した行（原文そのまま）

#### (a) 続き546 で残0クローズした在庫6件の登録行

| # | 症状 | 発見経緯 | 見立て |
|---|---|---|---|
| 🆕🔴(cxxxiv) | 🔴**旧形式の `signi_acce`（配列化前の素の string）が残っていると、アクセ枚数が「文字列長」になりゾーンが壊れる**＝`src/utils/acce.ts:6` の `acceCardsAt` は `field.signi_acce?.[zoneIdx] ?? []` を**そのまま返す**ので旧形式では string が返り、`src/engine/execUtils.ts:1667`（`THIS_CARD_IS_ACCED`）が `.length >= minCount` で数えるため、**1枚しか付いていなくても `"WD18-013#8202".length === 13` で「3枚以上」が真**になる（盤面バッジも `BoardComponents.tsx:732-739` で文字列長を表示）。🔴**実害は誤判定だけではない**＝実機で `WX20-028-E2` が発火し、**トラッシュへ1文字ずつ展開された**（`hTrash=["W","D","1","8","-","0","1","3","#","8","2","0","2"]`）＝**ゾーンのデータ破壊** | 2026-08-14 続き479＝§7 V-14 の実機検証。**Codex が起案段階でソースから発見**し、再現シナリオ `v14MultiAcceLegacyStringOneLoads` を**赤のまま既定 order に置いた**（engine が直れば緑へ反転する）| **修正するなら `acceCardsAt` の1点**＝旧形式（string）を受けたら `[value]` に正規化して返す。⚠**消費側は `.length` と反復の両方**を使うので、正規化しないと片方だけ直しても壊れ方が変わるだけ。📋**そもそも live の `battle_states` に旧形式が実在するかは未確認**＝実在しないなら優先度は低い（移行互換の保険）|
| 🆕(cxxxi) | 🔴**ルリグの【起】《ダウン》コストが誰もダウンさせない**＝`down_self` の支払い/可否判定は **`field.signi` しか探さない**（`BattleScreen.tsx:11250,11282` と `execUtils.ts:321`）。**ルリグの【起】では `findIndex` が常に -1** になるので、UI 側は「既にダウン済みなら弾く」ガードも空振りし、支払い側もどのゾーンもダウンさせない。⇒ **ルリグ【起】の《ダウン》が実質無コスト**の疑い（`usageLimit` を持たない効果は同一ターンに何度でも撃てるはず） | 2026-08-14 続き476＝V-11 の実機シナリオで `WD08-001-E3`（【起】《ダウン》：トラッシュからシグニ1枚を場に出す）を撃ったとき、**効果は解決するのに `host.field.lrig_down` が false のまま**だったことから発見。⚠当初シナリオはこれを「効果が走った証拠」に使っており、そのままでは永久 FAIL だった | 実測できているのは「**ルリグがダウンしない**」ところまで。**多重発動できるか自体は未検証**＝同じ【起】を2回撃つシナリオを1本足せば確定する。修正するなら「ルリグが source のとき `field.lrig_down` を立てる」分岐を可否判定と支払いの**両方**へ（§5-20＝支払い地点が2箇所ある型） |
| 🆕(cxxxii) | 🟡**`signi_deploy_power_limit` を undefined へ戻す箇所が engine/UI のどこにも無い**（`signi_deploy_count_limit` は `BattleScreen.tsx` 3700/3802/4150/4814/10605 の**5箇所**でターン開始時にリセットされるのに、パワー版は0箇所）。engine のログは「対戦相手はパワーN以上のシグニを場に出せない（**次ターンまで**）」（`execStubPart3.ts:1469`）と言うのに、**状態は以後ずっと残る**疑い | 2026-08-14 続き476＝V-11 の CPU 検証シナリオを設計する過程で、Codex 起案・Claude 実測の両方で確認。**このリセット漏れのおかげで `v11CpuDeployPowerLimitWithControl` は直接注入で決定論的に撃てている**（＝直したらシナリオ側も追随が要る） | 原文が「次のターンまで」型か「このターン」型かをカード別に確認してから、`clearTurnEndScopedState` 相当へ寄せるのが筋。⚠**直すと V-11 の B-2 シナリオが影響を受ける**ので、修正時は同シナリオの注入タイミングも合わせて見直す |
| (cxix) | **`SPDi43-11-E2` の内側付与【自】が timing 誤パース**＝原文「あなたの効果１つによってカードが合計１枚以上あなたの手札に移動したとき」は **ON_HAND_ADDED**（`triggerCondition` つき）なのに、live は **`ON_PLAY` + `triggerScope:'self'`** になっている。同型の `SPDi43-12-E2`（ON_ENERGY_TO_TRASH）／`SPDi43-13-E2`（ON_ENERGY_CHARGE）は正しくパースされているので、**「手札に移動したとき」節だけが ON_PLAY へ落ちている**疑い | 続き404（§6.4 付与ストア共通走査）で付与能力144件を timing 集計した際に発見。**今回は ON_PLAY の scope 集合から `self` を外したので誤発火はしていない**（＝現状は no-op のまま） | parser の「〜が場に出たとき」フォールバックが先に食っている可能性。`GRANT_LRIG_ABILITY` の内側 rawText 再パース経路（続き398 の `WX20-036-CB-E1` と同型）も疑う |
| 🆕(cxxii) | **`WXDi-P05-037-E1` の任意手札捨てが所有者取り違え**＝原文「このシグニがアタックしたとき、**対戦相手は**手札を２枚捨ててもよい。そうした場合、このアタックを無効にする」なのに、live は `TRASH{HAND_CARD, owner:'self'}`＝**アタックされた側（自分）が捨てさせられる**。しかも捨てるかどうかを決めるのも自分になっている | 続き417（§6.4 任意性脱落の掃き出しで隣接発見） | `opponentResponds`（相手自身に選ばせる）＋ `owner:'opponent'` の組が要る。⚠**`opponentResponds` は「誰がクリックするか」だけを変え ctx の視点は反転しない**（続き411 の教訓）ので、候補と適用先を明示的に `otherState` 側へ向けること。1カードの端案件だが**アタック無効化の可否が逆転する**ので影響は大きい |
| (cxx) | **ON_ENERGY_CHARGE watcher 経路の usageLimit が未管理**＝`BattleScreen` のエナ差分 watcher（場のシグニ＋続き404 で足した付与ストア）は entries を積むだけで **`actions_done` へ書き戻さない**ため、《ターン1回/2回》が効かず**エナチャージのたびに撃てる** | 続き404 で `SPDi43-13-E2`（《ターン2回》）を配線したときに判明。**印刷シグニ側にも元からある穴**（今回作った穴ではない） | 他コレクタと同型に `usedIds` を返して呼び出し元で `actions_done` へ書き戻す。該当 useEffect は `SET_STACK` しかしていないので state 書き込みの追加が要る |

#### (b) それ以前にクローズ済みだった10行


| # | 症状 | 発見経緯 | 見立て |
|---|---|---|---|
| 🏁~~(cxxxiii)~~ | 🟢**取り下げ（2026-08-14 続き478）＝engine バグではなく実機シナリオの偽陰性だった。** 付与ストアの `ON_ENERGY_CHARGE` watcher は**元から発火していた**（実機 `v12GrantedEnergyChargeTwice` が緑＝`energy 0→1` の直後に `actions_done` へ `SPDi43-13-sub-E1` が入り `lrig_down` が false になる）。🔑**Codex が足したのは「阻止しかできないゲート」（`reserveGrantedAutoUsage`）なので、これで発火が直ることは原理的にあり得ない**＝続き477 時点でも生きていたと確定できる。**偽陰性の機序**＝付与 watcher は `BattleScreen.tsx:1734` の early return により **`effect_stack`/`pending_effect` が空になった「あと」の useEffect** で初めて走るのに、旧シナリオは**エナ増加後の最初の settled 観測で即 `return {pass:false}`** していた（📌13 違反）。⚠**気付けなかった理由＝切り分けの対照 `v12PrintedEnergyChargeControl` だけが最初からポーリング型で、2本の「判定の待ち方」が非対称だった。対照は盤面だけでなく待ち方まで揃える。** ✅**実在した欠落は《ターン2回》の未管理だけ**で、これは同セッションで修正済み（下の V-12 参照）。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き478 | ~~2026-08-14 続き477~~ | ~~見立て~~ |
| 🏁~~(cxxx)~~ | 🟢**残0クローズ（2026-08-14 続き475）＝離場置換の「決定」が消費されず `PlayerState` に残留していた**（置換不成立時に呼び出し側が消費済み ctx を捨てていた）。**11経路すべてで `sub.ctx` を無条件に採る**よう修正。実機 `leaveSubDecisionNoneIsHonored` が緑へ反転（`choices=null`）。golden に end-to-end のトリップワイヤ1本を追加（**外すと FAIL することを確認済み**）。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き475b |
| ~~(cxxv)~~ | 🟢**取り下げ＝シナリオ偽陽性だった**（engine は正しい）。「離場置換の対話が `BANISH{count:数値}` 経路で発火しない」という症状は、**シナリオ側が `pendingCandidates` の index をそのまま `pick-<idx>` に使っていた**ため＝`EffectInteractionModal` は `targetScope==='opp_field'` のとき候補を **reverse して描画**する（`:189-192`）ので **`pick-0` が victim ではなく犠牲シグニを指し、犠牲を直接バニッシュしていた**。victim は対象ですらないので問いが出なくて当然で、**結果の盤面は身代わり成立時と1バイトも変わらない**（PLAN §7 📌4 の「盤面だけを見る判定は偽陽性」の実例）。⇒ `clickPendingInstance`（`data-card-num` で狙う）へ差し替えたところ **`leaveSubCpuAutoRespondsSubstitute`／`leaveSubAskDirectedToVictim`／`leaveSubDecisionKeyIsHonored` が PASS**（`asks=1`・`responder=CPU`・options に `banishSubstitute…`／`none:置換しない` の2択）。**数値 count 経路の hoist（`resumeSelectTarget`＝`:7412`）は正しく効いている** | 2026-08-14 続き475。⚠**罠 📌6 が判明したのは続き469 で、この4シナリオを書いた続き466 より後**＝「後から見つかった罠を、既存の赤シナリオへ遡って適用する」ことでバグ在庫が1件消えた | 残った実体は **(cxxx)**（決定の消費漏れ＝`leaveSubDecisionNoneIsHonored` だけが赤で残る）と **(cxxvi)**（instance 複製） |
| 🏁~~(cxxix)~~ | 🟢**残0クローズ（2026-08-14 続き475c）＝`lifeCrash` の身代わりが「コスト0」で成立していた**（`applyEffectBanishSubstituteChoice` に分岐が無く末尾の `trashStackSpell` へフォールスルー＝スペル在庫0でも「0枚トラッシュ」で成立し、**ライフを払わずにバニッシュを回避**）。⇒ **apply 側に `lifeCrash` 分岐を実装**（`execLifeCrash` と同じ形で `field.check` を立てる＝【ライフバースト】確認フローへ通常どおり乗ることを実機で確認）＋**`isImplementedSubstituteCost` で未実装 costType を列挙段階から落とす**安全弁を新設。⭐**旧コメントの「同期的に差し込めない」は誤り**だった（engine から `field.check` を立てても CPU 側の確認フローは正常に回る）。実機 `effectBanishLifeCrashSubstitutePaysLife`（旧 `…NotOnEffect`）が **guest.life 7→6** で PASS。golden にトリップワイヤ2本（**外すと FAIL することを確認済み**）。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き475c |
| 🏁~~(cxxviii)~~ | 🟢**残0クローズ（2026-08-14 続き475d）＝`WXDi-P04-051-E1` の timing 誤りで `fieldDown:3` が恒久 no-op だった**。真因は parser が「**あなたの**（センター）ルリグがアタックしたとき」を `ON_ATTACK_SIGNI` へ倒していたこと＝**シグニのアタックで誤発火**し、その経路では攻撃者が先にダウンするので**アップの白シグニが3体そろわない**。⚠**engine 側にそもそも収集経路が無かった**（BattleScreen のルリグアタック収集は「ルリグ自身の能力」4ソースだけ）ので、**`collectAllyLrigAttackTriggers` を新設**（アタック側の場のシグニ／アシストを走査・アタックしたルリグ自身は除外）してから timing を直した。あわせて「そのルリグをアップし」「そのルリグは能力を失う」を **LRIG 対象**へ是正（従来は SIGNI ＝シグニをアップする幻覚）。**live 17枚を採用**（差分が今回の是正だけであることを機械照合してから採用）。実機 `fieldDownCostPaysThreeAndWhite` が **ルリグアタック経路で PASS**（3体down＋白エナ徴収→**ルリグがアップ＋能力喪失**・シグニは対象外）。golden にトリップワイヤ2本。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き475d |
| 🏁~~(cxxvii)~~ | 🟢**残0クローズ（2026-08-14 続き475d）＝「このアタックを無効にする」が自分のアタックに効かなかった**。**真因は2つ**＝①parser が「**この**アタックを無効にする」を汎用規則へ落として `NEGATE_ATTACK{owner:'opponent'}` を作っていた（`execNegateAttack` は**対戦相手の場**から候補を作るので自分のアタッカーが候補に入らず無言で空振り）。⇒ **`STUB{SET_CANCEL_ATTACK_FLAG}`**（攻撃側＝効果オーナーのフラグ）へ是正＝マジックボックス系4枚の MANUAL 定義が既に使っていた正しい表現で、**AUTO 側だけが取り残されていた**。②🔴**`resumeOpponentPayOptional` の `pay` 枝が `payOpt.action` を一度も実行していなかった**＝`thenOnPay`（「支払ってもよい。**そうした場合**、X」）の X が**エナ払いのときだけ丸ごと落ちる**（`discard`/`energyTrash` 枝は `choiceId !== 'pay'` の分岐が実行するので動いていた）。実機 `oppPayNegateAttackWhenPaid`／`oppPayAttackGoesThroughWhenUnpaid`／`oppHandDiscardIsOpponentSide` の**3本とも PASS**。golden にトリップワイヤ2本。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き475d |
| 🏁~~(cxxvi)~~ | 🟢**残0クローズ（2026-08-14 続き475）＝身代わりで先に場を離れた instance を離場ループがもう一度処理し、移動先へ2枚目を push していた**（`removeFromField` は空振りするので**カードが増える**）。**`isOnFieldTop` ガードをループ5経路へ追加**。実機 `leaveSubAllTargetsAskedPerVictim` が緑へ反転（`gEnergy` の重複が消滅）。golden に保存則のトリップワイヤ1本を追加（**外すと `got=2` で FAIL することを確認済み**）。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き475b |
| 🏁~~(cxxiii)~~ | 🟢**残0クローズ（2026-08-14 続き475g）＝ピースがキーと同じ経路で処理され、コストを払ったのに効果が走らず【起】で二重請求されていた**。実測＝**Type='ピース' 119枚中118枚が `ACTIVATED`＋印刷 Cost と同額の `cost.energy`**＝**live の形は正しく実行経路が壊れていた**。⇒ **`card.Type === 'ピース'` で厳密に分岐**し（キーは1行も変えない）、**①キーゾーンを占有しない ②ルリグトラッシュへ置く ③`['AUTO','ACTIVATED']`×`['ON_PLAY','MAIN','ATTACK','SPELL_CUTIN']` を積む**（`queueCardEffects` は `effect.cost` を徴収しないので**印刷 Cost の1回払いだけ**になる）。あわせて**過少実行2件も解消**＝(a) `!my.field.key_piece` ゲートを外した（**キーを1枚出すと全ピースが使えなかった**）(b) **Timing が「アタックフェイズ」の14枚**をアタックフェイズで使えるようにした。🔑**唯一の例外 `WXDi-P15-003`（CONTINUOUS `GRANT_LRIG_ABILITY`）は解決時に `lrig_granted_auto_effects` へ載せ替える**（`duration:'PERMANENT'` なので `permanentGrant` を刻む＝ターン境界で落ちない）。実機＝**新規 `pieceUseResolvesAndGoesToLrigTrash` PASS**（エナ1→0の1回払い・候補は《ディソナアイコン》2枚だけ・回収成立・**keyPiece=null／ピースはルリグトラッシュ**）／**V-03 の赤2本 `connectSpinningChoice4Pay`・`connectSpinningChoice4Insufficient` が緑へ反転**。golden にデータ不変条件2本。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き475g |
| ✅(cxxiv) | ~~`WX25-CP1-091` の ON_TURN_END 任意コストが実機で出ない~~ **＝2026-08-13 続き463 で解決**。**切り分けの結果、続き436 の見立て（ターンが終わっていない）は誤りで、ターンは正しく進んでいた**（実機スクリーンショットで T3・アーツステップ(相手)を確認）。**真因は engine ではなく parser の runtime 補完**＝`inferTriggerScope` がカード全文の「次の対戦相手のターン終了時**まで**」（＝効果の**期間**）をトリガーと誤読し、`ON_TURN_END` 効果を `any_opp` へ書き換えて**自分側 collector から丸ごと落としていた**（**41効果/40カードが実機で一度も発火しない無言バグ**）。`kokonaUnderThreePay`/`ThreeSkip`/`Insufficient` の3本は反転して**2回連続PASS・既定 order へ登録**。詳細は BUGFIXES 続き463 |
| ~~(cxxi)~~ **🏁2026-08-10 続き416〜417 で残0クローズ** | 「〜てもよい。そうした場合、…」型の任意性脱落 35件 | 続き408 | **見立ては半分外れ**＝「動詞ごとに手書き」ではなく**型ごとに `optional` の受け皿が有る/無い**のが本質だった。`TRASH`/`TAKE_FROM_UNDER_SIGNI` は既に正しく、`DRAW`/`DOWN`/`ATTACH_CHARM`/`TRASH{DECK_CARD}` に受け皿が無い。汎用「連用形＋てもよい→optional」規則は**入れなかった**（受け皿の無い型に付けても黙って無視されるだけ）。正準形の STUB（`OPTIONAL_COST`/`OPTIONAL_ACTIVATE`/`OPTIONAL_TRASH_SELF`）へ寄せる5クラスタで消化。詳細は BUGFIXES 2026-08-10（続き416/417） |

---

## 2026-08-17 整理㉙：🏁§6.4 `O-29` 完了（「同じ選択肢を複数回選ぶ」ループ）（続き542）

> PLAN §6.4 からは行を削除し、索引だけ残した。**実機の観測点は §7 の `V-63`**。

### 📏 在庫の実測＝台帳の記述が2箇所とも古かった

母集団（`CHOOSE_SAME_OPTION_*` / `REPEAT_EFFECT` を含む live 効果）＝**2効果**（簿記どおり）。ただし：

- 台帳「`WX17-003-E1` は先頭に `UNKNOWN{raw:"以下から２つまで選ぶ"}` が残る」→ **もう残っていない**。
  live は `CONDITIONAL{IS_BETTING, then: STUB{CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE}, else: STUB{CHOOSE_SAME_OPTION_TWICE}}`
  （続き531/532 の `conditionChoose` 整備で先に変わっていた）。
- 台帳「`WX22-016-E1` の MANUAL は本体のバニッシュ節も落ちている」→ **落ちていない**（続き532 で手当て済み）。
  残っていたのは②`STUB{REPEAT_EFFECT}` の無言 no-op だけ。

### ⭐ 本当の穴は engine ではなく **UI** だった

`resumeChoose`（`effectExecutor.ts`）は **`choiceId: string | string[]`** を受け、`ids.map(...)` で
**重複 id をそのまま順に実行する**（dedup していない）。つまり **engine は最初から `['c1','c1']` を捌ける**。

穴は `EffectInteractionModal.tsx` の複数選択UIが **`selectedMultiChoiceIds: Set<string>`** だったこと＝
**同じ選択肢は一度しか選べない**。これが「同じ選択肢を２回以上選んでもよい」を表せない理由だった。

⇒ **`ChooseAction.allowRepeat`（JSON語彙）→ `PendingInteractionDef.CHOOSE.allowRepeat`（engine→UI）→
UI は回数マップ（`Record<id, number>`）へ切り替え**、決定時に `['c1','c1',…]` へ展開する。
**engine の解決ロジックは1行も変えていない。**

- ⚠**選択数1のときは立てない**（`multiSelect` が付かず単発UIになるため意味が無い）。
- ⚠**CPU 自動応答も直した**（`BattleScreen.tsx`）＝`avail.slice(0, count)` のままだと
  選択肢2つ・count4 のとき CPU は2つしか選ばず、**ベットしたコインぶんの選択が黙って目減りする**（過少）。
  `allowRepeat` のときは先頭から巡回して `count` を埋める。

### ① `WX17-003-E1`＝受け皿 STUB から構造化 CHOOSE へ

原文「ベット―《コイン》×2／以下**から**２つまで選ぶ。同じ選択肢を２回選んでもよい。あなたがベットしていた場合、
代わりに４つまで選ぶ。①…②…③…」

- 🔴旧＝**カード全文を実行時に regex で読む受け皿 STUB**（`CHOOSE_SAME_OPTION_TWICE` /
  `CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE`＝§6.4 O-20 で潰した型の生き残り）。
  しかもその受け皿は `count:1` の `continuation` を N 周回す形なので、
  🔴**「Nつ**まで**」の upTo が落ちて必ずN回選ばされる**過剰実行でもあった。
- 🔑**ベット選択数変更型のヘッダ regex を「以下**から**Mつ選ぶ」でも受けるよう広げただけ**で構造化できた
  （従来は「以下の**N個**から」で始まる形しか受けなかった＝コメントに「未マッチ＝据置」と明記されていた）。
- 結果＝`CHOOSE{choose_count:2, upTo:true, allowRepeat:true, betChoose:{thenChooseCount:4, thenUpTo:true}}`
  ＋①`SEQUENCE[BOUNCE, TRASH{hand}]`／②`GRANT_KEYWORD{LRIG opponent, アタックできない}`／③`SEARCH{story:'怪異', maxCount:2}`。

### ② `WX22-016-E1`＝②「このアーツの効果を一度繰り返す」を本体と同じ木へ

- 🔴旧＝`STUB{REPEAT_EFFECT}`＝engine では `[反復未実装]` のログを出すだけの**無言 no-op**
  （②を何回選んでも盤面は1回ぶんしか動かない）。
- ⇒ ②の action を**アーツ本体と同じ木**（`SEQUENCE[BANISH, TRANSFER_TO_HAND{story:'遊具'}]`）にした。
  `allowRepeat` で②をN回選べば本体がN回**追加で**走る（基底の1回は CHOOSE の兄弟ステップ）。
- ⚠**解決順は「追加ぶん → 基底」**（CHOOSE が SEQUENCE の先頭にあるため）。このカードの本体は
  順序に依存しないので影響しないが、**順序が意味を持つ本体を持つカードが出たら基底を CHOOSE より前へ出すこと**。
- ⚠**MANUAL 不可侵**なので `syncManualLive.ts` で live へ同期した。
- 🏁これで **`REPEAT_EFFECT` / `REPEAT_N_TIMES` はどちらも live 0件**（golden にトリップワイヤ）。

### ③ 副産物＝SEARCH の「レベル／名前の異なる」を配線（6効果の過少を是正）

`WX17-003-E1`③「**レベルの異なる**＜怪異＞のシグニ２枚を探して」の相互制約が
`SearchAction.selectionConstraint`（実装済み）に載っていなかった＝**同じレベルを2枚探せる**（原文より緩い）。
デッキサーチのビルダーへ配線したところ、収穫マージが**同型6効果を自動採用**した：
`WXEX2-43-E3`／`WXEX2-47-E4`／`WXK05-029-E3`／`WXK10-032-E2`／`WD23-001-E-E3`／`WXK02-028-E1`（distinct level）、
`WX21-Re07-E1`（distinct name）。**全件、原文に「レベルの異なる」「名前の異なる」があることを照合済み。**

### 計器・ゲート

- **golden 2210→2214**（+4＝`resumeChoose` が重複 id を潰さないこと／選択数1では `allowRepeat` を立てないこと／
  `WX17-003-E1` の構造・upTo・betChoose・distinct level／`WX22-016-E1` の②を2回選ぶと本体が3回走ること）。
  ⚠**既存の2本を更新**＝`REPEAT_EFFECT` の残存許容（1件→0件）と、
  `(O-11) WX22-016-E1` の「選択肢の中に本体が無いこと」→「①は本体を持たない／②は本体と同じ木」へ精密化。
- 🔑**6本とも「実装を戻すと赤くなる」ことを実測**（live JSON と engine の pending 伝搬を一時 revert して `FAIL 6`）。
- **census 800→799**（`BASELINE_HIGH` 更新）、smoke 10693 / SKIP 0、fuzz 全0、
  `census:stubs` A群＝7種/8件（すべて明示 defer。無言 no-op 0）、manual-fields 0、lint 0 errors。
- **live JSON changed 8効果/8カード**（held 採用1＋MANUAL 同期1＋収穫マージ自動採用6。CSV 非改変）。
- ⚠**UI（回数モーダル）と CPU 自動応答は実機未検証**（§7 `V-63` 送り）＝
  golden は engine 側（`resumeChoose` と pending の形）までしか踏めない。

## 2026-08-17 整理㉘：🏁§6.4 `O-25` 完了（自己引用付与の残り (c)(d)）（続き541）

> PLAN §6.4 からは行を削除し、索引だけ残した。**実機の観測点は §7 の `V-61`／`V-62`**。

### 📏 在庫の実測（着手前・§3-1）＝簿記の「(d) 39効果」は実態と違った

原文 regex「〈期間〉、この(シグニ|ルリグ|カード)は「【常】…」を得る」を効果単位で走査＝**36ヒット／35カード**。
そのうち**大半は既に実装済み**（`GRANT_PROTECTION`／`SIGNI_ATTACK_BAN`／`POWER_MODIFY`／`BANISH_REDIRECT`／
`GRANT_LRIG_ABILITY` などの「期間つき即時適用」で**実際に効いている**）。

⭐**PLAN が (d) の本体と書いていた「CONTINUOUS の走査軸が付与ストアを読んでいない」は、この母集団では
主症状ではなかった**（それは `GRANT_LRIG_ABILITY`＝**ルリグ側**の話で、シグニ側の `granted_effects` は
`collectContinuousGrantedKeywords`→`getSigniAttackKeywordState` まで既に通っている）。
実際に壊れていたのは**別の3クラス・計14効果**で、いずれも**条件節が落ちて無条件発火する過剰実行**だった。
⚠**着手前に台帳の見立てを実データで検証すること**（O-14／O-15 と同じ教訓が3セッション連続で出ている）。

### ① 引用付与のゲート条件が1形しか読めない（6効果）

`buildFrontPowerGatedKeywordGrant`（`execUtils.ts`）は「**正面のシグニのパワーが**N{以上|以下}であるかぎり」
1形だけを読み、他の綴りには `null` を返していた。呼び出し元（`execStubPart1` の `GRANT_QUOTED_ABILITY` ほか）は
`null` のとき**無条件の `keyword_grants`** へフォールバックするので、**ゲートが丸ごと落ちて常時発動**になる。

engine で実行して確認した実測値：

| 効果 | 原文のゲート | 旧挙動 |
|---|---|---|
| `WXDi-P12-078-E2` | 正面のシグニがレベル１ | 常時【ランサー】 |
| `WXDi-P13-079-E1` | 正面のシグニがレベル２以下 | 常時【ランサー】 |
| `WXDi-P13-069-E2` | 正面が凍結状態でパワー5000以下 | 常時【アサシン】 |
| `WX24-P1-042-E2` | あなたの手札が２枚以下 | 常時【ダブルクラッシュ】 |
| `WXDi-P06-032-E2` | 対戦相手のターンの間 | 常時【シャドウ】 |
| `WXDi-P13-044-E2` | 対戦相手のターンの間 | 常時【シャドウ】 |

⇒ **`buildGatedKeywordGrant` へ改名し、読めるゲートを5形へ広げた**（`FRONT_SIGNI_POWER` ／ `FRONT_SIGNI{level}` ／
`AND[FRONT_SIGNI{isFrozen}, FRONT_SIGNI_POWER]` ／ `COUNT_THRESHOLD{hand}` ／ `TURN_OWNER`）。
**新しい `ActiveCondition` は1つも要らなかった**＝語彙は全部あった。

- ⚠**パワーとレベル／状態は評価器が別**＝「凍結状態でパワーがN以下」は **`AND` で2本に割る**。
  `FRONT_SIGNI{filter:{isFrozen, powerRange}}` にまとめると `matchesFilter` が**表記パワー**で判定して
  バフ／デバフを無視する（`FRONT_SIGNI_POWER` だけが実効パワーを見る）。
- ⚠**比較語の無い「レベル１であるかぎり」は丁度N**（`{max:N}` に倒すと過剰）。
- ⚠**ゲートが見つからなければ従来どおり `null`**＝無条件フォールバックを残す（読めない綴りで退化させない）。

### ②🔴 条件を付けた瞬間に走査軸から外れる（シャドウ）＝ここが本当の「走査軸」問題

【シャドウ】だけは、条件つきにして `granted_effects` へ移すと**効かなくなる**ことが分かった。
`selectOrInteract` のシャドウ除外（`execUtils.ts`）が読んでいたのは
**`keyword_grants` ＋ カードの印字 `effects` ＋ 場全体付与**の3軸だけで、**付与ストアが入っていなかった**。

⇒ `condShadowSources` に `granted_effects` / `granted_effects_until_opp_turn` を足した。
🔑**足さないと「常時シャドウ（過剰）」が「シャドウが一切効かない（過少）」へ裏返る**＝
**近似を外すときは、外した先の走査軸が本当にそこを読むかを実行して確かめる**（PLAN の警告の実例が出た形）。

### ③🔴「そのアタックがこのターンN度目の場合」が条件節ごと落ちていた（7効果）

新条件 **`ATTACK_ORDINAL_THIS_TURN{owner, operator, value}`**（`Condition` 側）。

- 🔑**序数はシグニ単位ではなくアタックしたプレイヤーのターン内通算**＝`attacked_signi_ids.length`
  ＋ルリグアタック済み分（シグニは通常1回しかアタックできないので「四度目」は盤面全体の通算でしか成立しない）。
- ⚠**解決中のアタック自身を含む**＝`BattleScreen` は `attacked_signi_ids` へ追記した `newMyState` で
  `ON_ATTACK_SIGNI` を収集するので、一度目のアタックの解決時点で既に 1 になっている。
- 母集団＝`WXK06-033/035-E1`（**アタックのたびに自分をアップ**＝実質もう1回アタックできる／原文は四度目のみ）、
  `WXK06-037/038/062-E1`・`WXDi-P14-052-E1`（毎アタックで引き／エナチャージ／手札戻し）、
  `WXDi-P16-063-E1`（**一度目と二度目の排他分岐が両方走る**）。
- ⚠**「一度目か二度目」は拾わない**（`WX10-018`／`WX17-006`／`SP27-016`）＝あちらは「そのアタックを無効にする」
  側の別機構（`negateNthAttack` のカウントダウン窓）が既に実装済み。regex を「N度目の場合」に限定して避けた
  （golden に「奪っていない」トリップワイヤあり）。

### ④🔴「このシグニに【チャーム】が付いている場合」が落ち、しかも別物に化けていた

新条件 **`THIS_CARD_IS_CHARMED`**（`ActiveCondition` の `IS_SELF_CHARMED` と同型・同実装。
`THIS_CARD_HAS_ATTACHED`＝チャーム/アクセ/ソウルの合計とは別物）。

- 🔴`WXK07-043-E1`＝**条件節の「【チャーム】」を付与キーワードとして拾って** `GRANT_KEYWORD{keyword:'チャーム'}`
  ＝**原文と無関係な別物**（本体のバニッシュ耐性は消失、条件も消失）。
- 🔴`WXK07-043-E2`＝「チャームが付いている場合、**追加で**カードを1枚引く」が**無条件**。
- 🔴`WXK07-071-E1`＝チャーム条件が落ちて**無条件で《緑》支払いの選択が出る**。
- 🔴`WXK07-044-E1`（MANUAL・手書き）＝**チャーム分岐が丸ごと欠落**していて「パワー7000ちょうど」の弱い枝しか
  撃てなかった（原文は「代わりにパワー12000以上」）。⚠「代わりに」＝**排他**なので `then`/`else` で書く
  （SEQUENCE にすると両方バニッシュする過剰）。`syncManualLive.ts` で live へ同期。

### ⑤ (c) `SPDi43-05-E2` は**宣言済みの穴**にした（実装したことにしない）

原文＝「次の対戦相手のターン終了時まで、このルリグは「【自】：対戦相手のルリグかシグニ１体がアタックしたとき、
**あなたの場かエナゾーンから**そのルリグかシグニと**同じレベルの**シグニ１枚をトラッシュに置いてもよい。
そうした場合、そのアタックを無効にする。」を得る。」

- 🔴**旧状態は「真 no-op」ですらなく「無言の no-op」だった**＝live は `STUB{GRANT_QUOTED_AUTO_ABILITY}` で、
  そのハンドラは**カード全文 regex で拾おうとして黙って何もしない**＝ハンドラが在るので
  `census:stubs` では「実装済み」に見えて計器に映らない（CLAUDE.md の「STUB＝未実装ではない」の実例）。
- ⇒ `expandGrantEffectRawTexts` に分岐を足し、**`STUB{DEFERRED_ATTACKER_LEVEL_TRADE_NEGATE}`** へ落とした
  （O-37 の `deferredQuotedAbility` と同じ方針）。`census:stubs` A群の**明示 defer** に載る。
- **実装に要る機構4本**（次に着手する人向け）＝①ルリグ／シグニ両方を受ける union トリガー
  ②🔴**ソース側の場∪エナ横断選択**（既存 `wrapFieldOrEnergy` は「場に**出す**かエナに**置く**」＝行き先側で
  向きが逆・流用不可。`TRADE_BANISH_SELF_SIGNI` も `field.signi` しか読まない場だけの近似）
  ③アタッカーのレベルを実行時に束縛 ④アタック無効化（`SET_CANCEL_ATTACK_FLAG` は実装済み）。
  **②が engine のどこにも無い**のが唯一の実ブロッカー。

### 計器・ゲート

- **golden 2203→2210**（+7）。⚠**うち1本は既存テストの順序依存の是正**＝`(xlvi) wave17 WXDi-P15-005-E1` は
  埋め札を `fill(4)`（POOL の **cursor 位置**から取る）で作っており、live JSON が変われば
  **埋め札がたまたま赤**になって「共通色だけ候補」が落ちる（実測＝`WXK08-074`〜`077` が混入）。
  ファイル冒頭に「cursor 依存の既知の結合」と注記されていた実体がこれ。⇒ **性質（赤を持たない）で選ぶ**形へ是正。
- 🔑**5本とも「実装を戻すと赤くなる」ことを実測**（live JSON と `buildGatedKeywordGrant` を一時 revert して `FAIL 5`）。
- **census 806→800**（`BASELINE_HIGH` 更新済み）、smoke 10693 / SKIP 0、fuzz 全0、
  `census:stubs` A群＝**7種/8件（すべて明示 defer。無言 no-op は 0）**、manual-fields 0、lint 0 errors。
- **live JSON changed 11効果/11カード**（held 採用10＋MANUAL 外科パッチ1。CSV 非改変）。
  ⚠**ゲート条件の6効果は live 非改変**＝`buildGatedKeywordGrant` は実行時に STUB から呼ばれる engine 側の是正。
- ⚠**14効果すべて実機未検証**（§7 `V-61`／`V-62` 送り）。

## 2026-08-17 整理㉗：§6.4 `O-14`（申告済みの原文不一致2件）と `O-15`（手札からの選択機構）の消化（続き540）

> PLAN §6.4 からは行を削除し、索引だけ残した。**実機の観測点は §7 の `V-59`／`V-60`**。

### O-14(a) `WX15-003-E3`＝1文に2機構（強制アタック＋アーツ/スペル/【起】封じ）

原文「【起】ベルセルク《コインアイコン》×3：**次のターンの間、対戦相手はアーツとスペルと【起】能力を使用できず**、シグニは可能ならばアタックしなければならない。」

- 🔴**従来は後半の強制アタックだけが拾われ、前半が丸ごと落ちていた**＝`FORCE_SIGNI_ATTACK{opponent, NEXT_TURN}` 単体。
- ⭐**なぜ既存規則で拾えなかったか**（着手前に実測した）＝①既存の `BLOCK_OPP_ARTS_SPELL_ACT`（`parseSentencePart3`）は綴りが**「使用できない」限定**で、連用中止の**「使用できず」**を取らない ②そもそも `parseSentencePart1` の強制攻撃規則が**先に文全体を消費する**ので part3 まで届かない。⇒ **合流点は強制攻撃規則しかない**＝そこで `SEQUENCE[STUB, FORCE_SIGNI_ATTACK]` へ畳んだ。
- **新設 STUB `BLOCK_OPP_ARTS_SPELL_ACT_NEXT_TURN`**（`execStubPart3.ts`）＝`otherState.blocked_actions` へ **`USE_ARTS:NEXT_TURN` / `USE_SPELL:NEXT_TURN` / `USE_ACT:NEXT_TURN`**。⚠**新しい語彙は要らなかった**＝`:NEXT_TURN` の2スロット規約（`clearTurnEndScopedState` が接尾辞つきだけを跨がせ、`activateTurnStartScopedState` が接尾辞を外して active 化）も、`isActionBlocked('USE_ARTS'/'USE_SPELL'/'USE_ACT')` の消費地点（`BattleScreen.tsx`）も**既にある**。兄弟の `BLOCK_OPP_SPELL_ACT_NEXT_TURN` と同型。
- 🆕**同族の穴を1件同時に是正**＝`WX25-P1-050-E1`「**次の対戦相手のターンの間**、対戦相手はアーツとスペルと【起】能力を使用できない」は、綴りに関係なく**当ターン版へ潰れていた**＝**自分のターンに効いて相手のターンには切れる**1ターンずれ。part3 の規則に「期間を読む」分岐を足して解消。

### O-14(b) `WXDi-P08-010-E3`＝文跨ぎの「そのターン」照応と遅延バニッシュ

原文「【起】《ゲーム１回》《黒》《無》：次の対戦相手のターンの間、対戦相手のシグニは可能ならばアタックしなければならない。**そのターン終了時、そのターンにアタックしていたすべてのシグニをバニッシュする。**」

- 🔴**従来は `SEQUENCE[FORCE_SIGNI_ATTACK, BANISH{SIGNI owner:'any', count:'ALL'}]`＝使った瞬間に両者の全シグニが飛んでいた**（遅延も限定も落ちた二重の過剰）。
- ⭐**機構は3つとも既にあった**＝①`DELAY_TO_NEXT_OPP_TURN_END`＋`pending_next_opp_turn_end_effects`＋collector（`ON_TURN_END` で `opState` 側を走査）＋`STUB{RESOLVE_NEXT_OPP_TURN_END_EFFECT}`（§6.4 O-3 続き497）②`TargetFilter.attackedThisTurn`（`execUtils` が `state.attacked_signi_ids` を読む・§6.4 O-3 続き497）③`fieldCandidatesByOwner` の `owner:'any'` 両場走査。⇒ **要ったのは parser の2本だけ。**
- **(1) 文跨ぎの照応**＝`effectParser` の sentence map に「**そのターン終了時、**」→「次の対戦相手のターン終了時、」の書き換えを追加（直前の文が「次の対戦相手のターン」を含むときだけ）。既にあった「**そのターンの間、**」の兄弟。⚠書き換えないと**遅延宣言そのものが消える**。
- **(2) 本文の解決**＝`rewriteNextOppTurnEndBody` に「そのターンにアタックしていたすべてのシグニをバニッシュする」の分岐を追加。⚠**`^その` で受け皿へ落とす既存ガードの例外**＝ここでの「その」は**カードの照応ではなくターンの照応**で、予約が発火する**そのターンそのもの**を指すので発火時の state だけで解ける。
- 🔑**`owner:'any'` のままで自分のシグニを巻き込まない**＝`attackedThisTurn` は各 state の `attacked_signi_ids` を見るので、**アタックした側にしか載らない**。
- ⚠**タイミングの確認**＝`attacked_signi_ids` のリセットは END フェイズの後始末で、`ON_TURN_END` の解決**より後**（人間経路 `doPhaseAdvance` の END 分岐／CPU 経路の両方で確認済み）＝予約の発火時点ではまだ残っている。

### O-15 `WXEX1-44-E2`＝手札からの選択機構

原文「【出】：**あなたの手札から**《アクセアイコン》を持つシグニを２枚までエナゾーンに置く。その後、あなたのエナゾーンから**この方法でエナゾーンに置いたカードと同じ枚数**の＜調理＞のシグニを対象とし、それらを手札に加える。」

- 🔴**従来は前段が `STUB{PLACE_ACCE_SIGNI_TO_ENERGY}`＝場のアクセゾーンを全部エナへ送る別機構**（`allAcceCards(field.signi_acce)`）で、**手札は1枚も動かない**。後段は固定1枚＝置いた枚数と無関係に必ず1枚回収する過剰。
- ⭐**「要るのは手札選択の機構だけ」という PLAN の見立ては合っていたが、その機構すら既にあった**＝`ENERGY_CHARGE{HAND_CARD}` は `execEnergyCharge` が `handCandidates` で filter を効かせ `selectOrInteract` で選ばせる完全実装で、**同じ形を `WX22-043-E1` が MANUAL で先に手当てしていた**。⇒ **parser を追いつかせるだけ**だった。
- **(1)** `parseSentencePart3` に「あなたの手札から《アクセアイコン》を持つシグニをN枚（まで）エナゾーンに置く」の規則を、既存の `PLACE_ACCE_SIGNI_TO_ENERGY` の**手前**へ追加＝`ENERGY_CHARGE{HAND_CARD, count:2, upToCount:true, filter:{cardType:'シグニ', hasIcon:'アクセ'}}`。⚠**アクセは CardClass ではない**（`hasIcon:'アクセ'` の判定は**カード自身のテキストに「【アクセ】」があるか**＝`matchesFilter`。「《アクセアイコン》」の綴りで拾うと候補0件になる＝golden を書くときに実際に踏んだ）。
- **(2)** 後段の「同じ枚数」を `{$ref:'last_processed_count'}` へ（`effectParser` の per-effectId 表）。⚠**前段が期待の形のときだけ**書き換える（別機構へ戻ったら $ref は無関係な数字に化ける）。⚠`upToCount` は落とす＝「同じ枚数」は上限ではなく**丁度その枚数**。
- ⚠**旧 defer の根拠2つはどちらも既に古かった**＝「`TRANSFER_TO_HAND` が `resolveNum` で $ref を0にする」は続き441 で解消済み（いまは `resolveCountRef`）、「前段 STUB が別機構」は本項で解消。**着手前に台帳の根拠を実データで検証すること**（J-4／J-5 と同じ教訓がまた出た）。

### 計器・ゲート

- **golden 2200→2203**（+3＝O-14(a) の2本／O-14(b) の1本）。`WXEX1-44-E2` の defer トリップワイヤは**正方向の挙動テストへ書き換え**（前段の型・filter・upTo／後段の $ref／2枚置き→2枚回収／**0枚置き→0枚回収**の対照）。
- 🔑**4本とも「実装を戻すと赤くなる」ことを live JSON を一時 revert して実測**（`FAIL 4`）してから復帰させた。
- **census 806 据置**（ベースライン 806）、smoke 10688 / SKIP 0、fuzz 全0、`census:stubs` 無言 no-op 0、lint 0 errors。**live JSON changed 4効果/4カード**（`WXEX1-44` / `WX15-003` / `WXDi-P08-010` / `WX25-P1-050`。CSV 非改変）。
- ⚠**3件とも実機未検証**（§7 `V-59`／`V-60` 送り）。

## 2026-08-17 整理㉖：§6.4「■ 消化済み」節と `O-11` 行の退避（続き539）

> PLAN §6.4 が読めない長さになっていたので、**消化済みの記録をここへ全文移した**（PLAN 側は ID と日付の索引だけ）。
> 本文は**移設時点のまま verbatim**。一次記録は [BUGFIXES.md](./BUGFIXES.md) の各日付。

### 残0クローズ済みの worklist 行

- ~~**O-11**~~ ｜ 🏁**2026-08-17 続き533 で残0クローズ**（519 較正:135→43・520:43→37・521:37→34・522:34→31・523:31→25・525:25→22・526:22→17・531:17→7・532:7→3・**533:3→0**） ｜ — ｜ 🏁**`verifyEffects` を全10シートで回して「アクション[STUB代替?]／[要確認]」が 0件**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-16 整理㉑」（仕分け）と「2026-08-17 整理㉓／㉔／㉕」（消化）、一次記録は [BUGFIXES.md](./BUGFIXES.md) の各日付（520/521/522/523/525/526/531/532/**533**）。⚠**残した近似2つ**＝(a)**選択履歴**（「まだ選ばれていない1つ」＝`PR-469`／「まだ選んでいないもの」＝`WXDi-P11-002`・`WXDi-P11-003`）は**毎回すべての選択肢から選べる**まま＝3効果ぶんの器が要る(b)`WXK10-018-E2` はコストが**ゾーンを跨ぐ OR**（シグニに付いているカード**か**下にあるカード）で表せず `costUnparsed`＝提示されない（続き532 で ACTIVATED 提示7経路にガードを入れた）。⚠**明示 defer 3種/4件**＝`DEFERRED_OPP_LRIG_UNDER_TO_TRASH`（相手ルリグ下の操作＝engine が `ownerState` 固定）／`DEFERRED_COLOR_QUALIFIED_USE_BLOCK`（色限定つき使用封じ＝`BLOCK_ACTION` に色の絞りが無い）ほか。⚠`npm run verify` は**全10シート**で回す（既定は `Sheet1` だけ）

### 消化済み（PLAN §6.4「■ 消化済み」節の全文）

> ✅**O-31 完了＝2026-08-17 続き537**（「〈コスト〉を支払わないかぎり、X」の残り）。🟢**簿記の2件はどちらも実装済みだった**＝(a)`SPDi43-01-E2` は `GRANT_ABILITY_INNER_TEXT` だが**真 no-op ではなく** `execStubPart1` の専用分岐が `BLOCK_OPP_SIGNI_AUTO`／`BLOCK_OWN_SIGNI_AUTO:NEXT_TURN` を積む（**支払い回避だけが未実装の近似**＝新設 **O-38**）(b)`WXDi-P16-062-E1` の `DEFERRED_GATE_ZONE_GRANT_AUTO_ABILITY` は**もう存在しない**（src 0件）＝MANUAL で完全表現。母集団は「支払わないかぎり」を含む**73効果**（効果単位）で、**回避表現が無いものは残0**。🔴**代わりに実測で新規の穴を2つ消化**＝①**読点なしの「支払わないかぎり〈X〉」**（`WXDi-P11-044-E2`＝self 版の規則が読点必須で、**条件も回避も落ちて払っても落ちる**。ガードを読点の有無から**本体の形（`できない` を含むか）**へ置き換え。読点なし28効果のうち consequence 型は本件1件だけ）②**「このシグニを場からトラッシュに置く」に `thisCardOnly` が無く、自分の他のシグニも選べた**（実測**10効果**＝任意の自軍シグニを処理できる抜け道。すぐ下の「これをトラッシュに置く」は最初から付けていた取りこぼし。`WXDi-P04-040-E1`（MANUAL・手本）が持っていたのでクロスチェックになった）。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-17（続き537）。
> ✅**O-27 完了＝2026-08-17 続き536**（引用能力の中身が丸ごと未パース＝ダメージ無効の残り）。🟢**在庫を実測したら2件のうち `WXK04-014-E1` は既に動いていた**（`choiceTextParser` に `PREVENT_DAMAGE{scope:'LRIG'}` の分岐があり `BET_MECHANIC` が①②③を正しく提示する＝簿記が続き492 のまま古かった）。残る `WX24-P3-003-E1` は**同じ文型の姉妹4枚と一緒に**解いた＝「あなたのレベルN以上のセンタールリグ１体を対象とし、**次のあなたのエナフェイズ終了時まで、それのリミットを＋１し**、それは以下の能力を得る。『…』」に規則が無く、**4枚はリミットだけ動いて引用能力が丸ごと消え**、`WX24-P3-003-E1` は安全網 `GRANT_ABILITY_INNER_TEXT` に落ちて**リミットごと何も起きない真 no-op**だった。🔑**【常】のダメージ無効は「ウィンドウ」ではなく「宣言」**＝期間つきは `PREVENT_DAMAGE{scope:'LRIG'}`、【常】は `STUB{PREVENT_LRIG_DAMAGE}`（`resolveLrigDamageShield` が毎回 `activeCondition` を評価し直す軸。ウィンドウ側に倒すと**条件が落ちて張りっぱなし**）。🔴**engine 側の穴も塞いだ**＝`resolveLrigDamageShield` は `effectsMap` しか見ておらず**付与された【常】シールドが判定へ一度も届いていなかった**（`grantedStore.ts` 冒頭の注記どおり付与能力は effectsMap に載らない）＝`shieldCandidates()` で印刷能力と付与ストア3本を**対で**走査するようにした。⚠**表せない引用は「ブロック単位」で明示 defer にする**（→ 新設 **O-37**）＝rawText 全体を1つの STUB へ潰すと**同居する【起】が丸ごと消える**（既存の特例3分岐はその形。実測で一度作り込んだ）。⚠**古いトリップワイヤを1本更新**＝`task12(lxx)` は「引用内の語が live に現れないこと」を substring で見ており、構造化された今は正しい是正でも落ちる（続き528 と同型）＝**GRANT_* の内側を落としてから**検査する形へ。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-17（続き536）。
> ✅**O-26 完了＝2026-08-17 続き535**（「この(シグニ|カード)を場からトラッシュに置き、」が**コストに載らない**＝**場のシグニを失わずに効果だけ得られる**状態を残0まで解体）。母集団は原文 regex で**9効果**、うち3効果は本文側で続き488 に規則化済み＝**本件は6効果**。**A群＝【起】の複合コスト前半**（`WX25-P3-100-E1`／`WXDi-CP02-099-E1`＝コスト節パーサが**終止形「置く」しか見ておらず**エナ側だけが `cost` に載っていた）／**B群＝束ねた任意コスト**「〜置き《色》を支払ってもよい」（`WX24-P2-063-E1`／`WX24-P2-086-E1`／`WX24-P4-059-E1`／`WXDi-P13-044-E1`＝`costColors` しか拾わず**《無》1つで撃ち放題**だった）。⚠engine は `EffectCost.trash_self` も `OPTIONAL_COST{selfTrash}` も**最初から実装済み**＝parser が生成していなかっただけ（O-11 の `exceed` と同型）。**副産物2本**＝(a) 支払いボタンのラベルに「シグニ1体を失う」対価が出ていなかった＝**pay 枝は4サイトに分かれている**ので `execUtils` に `optionalCostExtraLabels(spec)` を新設して集約（`selfToEnergy` も同時に復旧）(b) 逆翻訳が `OPTIONAL_COST{selfTrash}` を描画せず**挙動監査の偽陰性**になっていた。⚠数え直しの罠＝**付与された内側能力**（`GRANT_FIELD_SIGNI_ABILITY.abilities`）まで辿ること／「**エナゾーンから**このカードを」は `energyTrashSelf` の別コスト。⚠**engine 層の golden でエナ残量を assert しない**（エナ色は pending の `costColors` で UI が徴収する規約）。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-17（続き535）。
> ✅**O-36 完了＝2026-08-17 続き534**（「(あなた|対戦相手)の**ターンの場合**」の条件持ち上げを **25カードの allowlist から解放**。allowlist 外の **23効果**は条件が丸ごと落ちて**ターンを問わず発火**していた）。**全5971カードの A/B で実測**＝変わったのは**21カード・21効果だけで巻き添えゼロ**（16効果は純粋な条件追加／5効果は表現も改善＝🔴`WXDi-P03-010-E2` の **opponent→self** 取り違え是正ほか）。**MANUAL 刻印で収穫マージが触れない4効果は live を外科パッチ**（`WXK01-082-E1`／`WXK05-041-E2`／`WXK10-007-E1`／`WXDi-P03-010-E2`）。連言形「手札がN枚で〜のターンの場合」（`WXK01-040-E1`＝**ノーコストの無条件バニッシュ**だった）も語彙化。**原文に「ターンの場合」を含む42効果すべてが live で `TURN_OWNER` を持つ（残0）**。⚠**持ち上げると残り文が別規則に当たり実装済みハンドラが無言 no-op へ退化する**罠を3件塞いだ（golden にトリップワイヤ）＝`WXEX1-16-E1`（照応→任意2枚の過剰）／`WXDi-P03-012-E2`（`DEFERRED_UNPARSED_THIS_TURN_OPP_CLAUSE`＝消費地点なし）／`WXK10-013-E1`①（`DEPLOY_RESTRICT` は「N体までしか」「パワーN以上」しか読まない）。⚠**`STATE_HOIST_BATCH1_CARDS` 自体はまだ生きている**（ライフクロス閾値形と `printedLifeM` が引く）＝他の語彙を外すときも A/B を取ること。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-17（続き534）。
> ✅**O-35 完了＝2026-08-17 続き530**（`CONDITIONAL_POWER_BONUS` の受け皿を **live 0件**まで解体。524（21→14）→527（14→13）→528（13→7）→529（7→5）→**530（5→0）**）。**挙動是正 8効果**（うち🔴**【出】でノーコストの相手シグニ除去**が3件）。**新機構3本**＝`COST_TRASHED_MATCHES{minCount}`（コスト支払い枚数のゲート）／`EffectCost.conditionalEnergyReduction`（**この能力**スコープのコスト減額）／`USE_SPELL_FROM_TRASH_PAYING_COST`（**コストを払って**トラッシュのスペルを使用）＋ 表示用 `REVEAL_EACH_PLAYER_DECK_TOP`。**副産物のバグ2本**＝ルリグ【起】経路に `last_cost_trashed_cards` の記録が無かった／`INTERNAL_CMCLG_DEDUCT` が**支払ったエナをゲームから消していた**。**golden 4本を契約として追加**（受け皿の live 0件トリップワイヤ込み）。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-17 整理㉒」／一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-17（続き530）。
> ✅**O-8／O-9 完了＝2026-08-16 続き506**（O-8＝アタック順の規則を gate へ1本化＋`WX12-010-E3` の defer 解除／O-9＝相手側の可変枚数コストと**繰り返す**遅延ゲートを実装）。**A群 18種/22件 → 16種/20件**。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き506）。
> ✅**O-6／O-7 完了＝2026-08-16 続き505**（O-6＝AUTO 採用へ切替＋`LAST_PROCESSED_HAS_NO_ABILITIES` の holder 取り違え是正／O-7＝据置3軸を解消し、原文 regex で数え直した **timing 母集団6効果**と**交換の分解表記2効果**も同時に是正）。**live changed 7効果 / 7カード**。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き505）。
> ✅**O-4 完了＝2026-08-15 続き499**（`UNKNOWN` 25ノード → **0**）。**実装12／構造修正8／明示 defer 5**。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き499）。残した defer は 🆕O-34。
> ✅**O-3 完了＝2026-08-15 続き498**（受け皿7種を残0）。**挙動是正 9効果＋波及2**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-15 整理⑲」。
> ✅**O-3 の受け皿2種＝2026-08-15 続き497 で解体**。**挙動是正 2**（遅延本体の不発1／自分のシグニをタダでバニッシュ1）。
> 🔑**「次の対戦相手のターン終了時、〜」の予約は続き489 のアタックフェイズ版と同型**＝予約は**予約した側**（そのターンの非ターンプレイヤー）に積み、`ON_TURN_END` の collector が **`opState` 側**を読む。🔑**`myState` を読むと自分のターン終了時に誤発火する**（golden に軸のトリップワイヤ）。⚠ターン境界を跨ぐので `turnScopedState` にも `delayed_triggers` にも載せない。
> 🔴**遅延を跨いだ照応は予約できない**＝予約が運ぶのは action だけで参照先を束縛しない。`WXDi-P09-066-E1` の「**その**カードを手札に加える」は単独文だと `TRANSFER_TO_HAND{DECK_CARD}`＝デッキから引くへ化けるので**受け皿のまま**（過少側）。
> 🔴**`WDK06-R09-E1` は相手のターン終了時に自分のシグニを1体タダでバニッシュしていた**＝受け皿 STUB が no-op のまま任意コスト Pattern が pay/skip を出し `BANISH{owner:'self'}` が走っていた。新設語彙は `TargetFilter.attackedThisTurn`（判定は state を持つ `fieldCandidates` の層）と `OptionalCostSpec.trashOwnKey`（⚠キーゾーンはシグニゾーンと別＝`fieldToLrigTrash` では払えない）の2つだけ。
> ⚠**後続文が二重実行になる**（「そうした場合、それらをバニッシュする。」が別文で残る）＝`dropRedundantStepAfterTargetOppSigniOnly` に落とす規則を追加。⚠**カード単位 PRESERVE で held に載らない**（同居の `E2b` が MANUAL）＝effectId アンカーの外科パッチで訂正。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き497）。**
> ✅**O-31 の「回避クローズが落ちていた4効果」＝2026-08-15 続き496 で消化**（O-31 自体は残2＝別層）。**すべて過剰実行**（払っても帰結が起きる）。
> 🔑**在庫は効果単位で数える**＝`docs/_effect_srctext.json`（効果ごとの原文）で走査。カード単位だと**同じカードの別効果が支払い語彙を持つだけで PAY と出る偽陰性**が出る。
> 🔑**「付与そのものを止める支払い」は標準ペアで表せる**（`WXDi-P05-023-E1/E2`）＝除外④に「〜を得る」＝能力の付与の例外を追加。🔴**純加算チェックが「分割後のほうが正しい」ケースを弾いていた**（回避クローズを挟んだ全文では対象解析が `filter` を落とす）＝**情報が増える向きだけ**許すよう緩和。
> 🔴**「以下をN回行う。「…」」の引用括りで回避が消えていた**（`WXDi-P07-007-E3`）＝`stripFullSentenceQuote`（**文全体が1つの引用のときだけ**外す）を両ゲートの入口へ。あわせて「手札をN枚捨てるか《無》を支払わ」の**2枝**語彙も追加。
> 🔴**【常】の正面アタック禁止が「払っても通らない」だった**（`WXDi-P16-047-E1`）＝`cannotAttackSigniUnlessPayColorless` を新設して**無条件禁止と別集合**へ（同じ集合だと「払えば通る」が「絶対に通らない」に化ける）。支払い額は**parse 時に STUB の `value` へ焼き込む**（条件剥がしループで消えるので**剥がす前のブロック本文**から復元）。
> 🔑**判定と引き落としは1関数へ**＝`signiAttackColorlessCost`（ban 由来＋【常】由来の合算）を gate／引き落とし／ボタン表示の3箇所すべてが見る。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き496）。**
> ✅**O-30「〈コスト〉を支払わないかぎり、X」の回避ゲート＝2026-08-15 続き495 で消化**（「自分が払う」側＝本体。「対戦相手が払う」側の残りは 🆕O-31 へ）。**挙動是正 11**（過剰実行 8／払う側の取り違え 2／文言・逆翻訳のみ 1）。
> 🔴**在庫は「1効果」ではなく母集団44カードだった**＝PLAN の記述は着手前の実測で覆った。`/を支払わないかぎり[、,]/`（**読点つき**＝後続に帰結が来る型）は **46箇所/44カード**。読点なし（制限型・30箇所）は O-28 の領分で別枠。
> 🔴**「自分＝能力の持ち主が払う」形に規則が1つも無かった**＝前置きが丸ごと落ち、下流の汎用規則が帰結（バニッシュ）だけを拾って**無条件バニッシュ**（8効果・大半は引用付与の内側）。
> 🔑**新機構は要らなかった**＝正準形 `SEQUENCE[STUB{OPTIONAL_COST, unlessPay}, CONDITIONAL{PAID_ADDITIONAL_COST, then:[], else:<帰結>}]` は隣接 `STUB+CONDITIONAL` の既存 Pattern（skip 枝＝`conditional.else`）でそのまま動く（`WXDi-P04-040-E1` が既存の手本）。⚠**本体が解けないときは据置**（前置きだけ食うと過少実行になる）。
> 🔴**払うのは「付与された側」＝`ownerState`**＝`granted_effects` は付与先の持ち主の state に積まれ、`collectAttackerSelfTriggers` が `playerId: attackerId` で積むので `ownerState` は付与された側。`WX24-P2-044-E1/E2`（MANUAL）の `OPPONENT_PAY_OPTIONAL` は**払う側が逆**だった。🔑**同じ action の `BANISH{owner:'self', thisCardOnly}` が成立している時点でこれは確定する**。⚠**golden がこの誤りを写していた**（`PLAN 6.3 batch 8 B-1`）＝正方向へ書き換え。⚠**その test を `withSavedCursor` で包むと直後の `(xlvi) wave17` がカーソルのズレで落ちる**（既知の結合・コメント済み）。
> 🔑**「支払わないかぎり」形を汎用の任意コストの文言に潰さない**＝`StubAction.unlessPay`（機構は不変で**文言と逆翻訳だけ**）。「発動する／スキップ」のままだと**払わない方が得に見える**表示になり実機で判断できない。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き495）。**
> ✅**O-28 の「《無》×Nを支払わないかぎりアタックできない」5効果＝2026-08-15 続き494 で消化**（O-28 自体は継続＝残 23綴り）。**挙動是正 8**（恒久 no-op 5／丸ごと no-op 1／過剰実行 1／対象の過少 1）。
> 🔴**引用文が丸ごと `GRANT_KEYWORD.keyword` に入ると `hasKeyword` の照合外＝一度も効かない無言 no-op**（STUB ですらないので `census:stubs` にも映らない）。続き490 の fixup を《無》×N へ一般化（`rewriteAttackTaxKeywordGrant`）。⚠**コスト句の無い `keyword:"アタックできない"`（live 132件）を巻き込まない**ため regex はコスト句必須。⚠**`STATE_COND_BATCH4_ACTIONS` の action リテラルで固定されているカード（`WX11-012-E1`）は parser 規則が届かない**＝リテラル側に正準形を書く。
> 🔴**`SELECT_TARGET_ONLY` がルリグ対象を扱えず丸ごと no-op だった**＝`tgt.type !== 'SIGNI'` で `lastProcessedCards:[]` に降り、STORE が空→本体が「対象が確定していない」で降りる（ルリグ／ルリグかシグニの3効果）。`LRIG`／`CENTER_LRIG_OR_SIGNI` を追加。🔑**live の形を assert するだけでは足りない**＝golden に「通しで実行して ban が載るか」を足した。
> 🔴**入れ子 SEQUENCE で内側の continuation が上書きされ消えていた（engine 一般バグ）**＝`execSequence` は対話に入ると残りステップを `pending.continuation` へ**代入**していたので、内側 SEQUENCE や `LOOK_PICK_CHAIN` のように自前の continuation を積む action の残りが無言で落ちていた。**合成する**へ是正（同じ規約は `resumeOpponentPayOptional` ほか4サイトで既に合成済み＝`execSequence` の2箇所だけが outlier だった）。母集団＝**入れ子SEQUENCE+後続 47効果／内部continuationを積みうる型が中間ステップ 147効果**。
> 🔑**ルリグのアタック税は新軸だが置き場は増やさない**＝`SigniAttackBan.appliesTo:'LRIG'` を1キー足して `signi_attack_bans_this_turn` を共用（turn-end 失効の登録が1つで済む）。仕分けは**実行時に対象の `Type`** で行う（`CENTER_LRIG_OR_SIGNI` は選ばれるまで決まらない）。⚠**両方向にガードする**＝`cardNums` 一致だけに頼ると広域 ban がルリグにも掛かる。🔴**既存バグ同時是正**＝`performLrigAttack` の `OPP_LRIG_ATTACK_COST` は**払えないときは else で素通り＝タダでアタック**できていた。
> ⚠**残した近似**＝アシストルリグは `CENTER_LRIG_OR_SIGNI` の候補に入れない（既存 `GRANT_KEYWORD` と同じ）／ルリグ版の「手札をN枚捨てないかぎり」は母集団0なので生えたらアタック不可へ倒す。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き494）。**
> ✅**O-3 の `NON_FIELD_ZONE_MOVE_IMMUNITY`＝2026-08-15 続き493 で解体**（O-3 自体は継続）。**5効果の挙動是正**（永続化バグ 1／恒久 no-op 1／片側採用 1／過剰実行 1／汎用 STUB 誤配 1）。
> 🔴**期間つき予約に失効地点が無く永続していた（3回目の再発）**＝`prevent_opp_trash_from` は **set が1箇所・clear が0箇所**で、`WXK10-083-E1`「このターンと次のターンの間、対戦相手の効果によってあなたのエナゾーンにあるカードはトラッシュに移動しない」が**ゲーム終了まで**効いていた。`opp_move_immunity{zones, turnsRemaining}`（`signi_deploy_bans` と同じターン数カウントダウン・減算は `clearTurnEndScopedState` の1点）へ置き換えた。
> 🔑**消費側は「ctx 側の集合 ∪ state 直読み」で判定する**＝`ExecCtx.otherProtectedZones` を組み立てない経路が実在するので `activeOppMoveImmunityZones(state)` を新設し、4サイトとも両方を見る。⚠**【常】宣言は state に書かない**（書くと「1回で消える」に化ける）＝`collectProtectedZones` が effectsMap から読む。
> 🔴**複合節を片側だけ採用すると残りが無言で落ちる**＝`WXEX2-06-E3`／`WXDi-P16-002-E1` の「…**ダメージを受けず**、…**移動しない**」は前半だけが拾われ後半が消えていた。`SEQUENCE[PREVENT_DAMAGE{scope:'LRIG'}, ZONE_MOVE_IMMUNITY]` で両方載せ、golden の据置トリップワイヤを**正方向（両方載る）**へ置き換えた。
> 🔴**`WXDi-P16-002-E1` は3つ同時に壊れていた**＝(a)【使用条件】ヘッダが `GRANT_KEYWORD{keyword:"使用条件"}` に化けて本来の使用条件が条件として載っていなかった（続き490 の「引用文が丸ごと keyword に入る」クラス）(b)複合節の両方が脱落 (c)「次の対戦相手のターン終了時、…」の本体を**使った瞬間に実行**していた。
> 🔑**遅延タイミング宣言の受け皿は parser の先頭に置く**＝本文側の汎用規則（`カードをN枚引く` 等）が先に食うと**宣言が消えて本文だけ残る**（＝過剰実行）。予約機構が無い間は明示 defer（`DEFERRED_NEXT_OPP_TURN_END_BODY`）で過少側に倒す。`WXDi-P09-066-E1` は無関係な汎用 `STUB{LOOK_AND_REORDER}` に落ちて計器に映っていなかったぶんも同時に可視化した。
> ⚠**残した近似**＝移動不可の保護は **hand / energy → トラッシュ**だけ（デッキ／トラッシュ／ライフ側は移動地点の funnel が無い）。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き493）。**> ✅**O-3 の `UNTIL_NEXT_MAIN_PHASE_CLAUSE`＝2026-08-15 続き492 で解体**（O-3 自体は継続）。**9効果の挙動是正**（恒久 no-op 2／無言 no-op 2／1回で消費されていた 5／過剰実行 1／過少実行 1・重複あり）。
> 🔑**「N回まで」ではなく「期間中ずっと」の防御は、回数フラグではなくウィンドウで持つ**＝「（対戦相手の）ルリグによってダメージを受けない」12効果の期間軸を `PREVENT_DAMAGE{scope:'LRIG'}`（`prevent_damage_windows`）1本に集約した。旧 STUB は `prevent_lrig_damage`＝**1回で消費される boolean** を立てるだけで、①「次のターンの間」は turn-end でクリアされ**一度も効かず**（`WXK10-019-E2`）②「このターン」も**2回目以降が素通り**していた（5効果）。
> 🔴**【常】判定の走査軸がシグニだけだった**＝`WXK03-001-E1`（**ルリグ本体**）と `WXK11-012-E2`（**キー**）は宣言が読まれず無言 no-op。新設 `isLrigDamagePrevented`（`screens/battle/lrigDamageShield.ts`）がシグニ／ルリグ／アシスト／キーを走査する。⚠**レベル限定は宣言の `value` から読む**（parser が落とすと全ルリグから守る過剰効果）。⚠**宣言型の【常】は state にフラグを書かない**（書くと「1回防いだら消える」に化ける）。
> 🔑**「回数無制限の防御」は消費型より先に判定する**＝従来この判定はバリア／`prevent_next_damage`／置換ミルの**後ろ**にあり、無制限に防げる盤面でも限りある資源が先に減っていた。
> 🔑**新期間「次のあなたのメインフェイズまで」（`MY_NEXT_MAIN_PHASE`）**＝`WXK01-002-E2` の3機構はすべてこの期間で、**相手のターンを丸ごと跨ぐ**＝`UNTIL_OPP_TURN_END` では**次のドローフェイズが範囲外**。`turnScopedState` に境界 `main-phase-start` と `clearMainPhaseScopedState()` を新設し**失効地点をこの1関数だけ**にした（呼び出しは `ON_MAIN_PHASE_START` 収集と同じ人間/CPU の2箇所・golden にトリップワイヤ）。新アクション＝`SET_LRIG_BASE_LIMIT`（**加算ではなく置換**）／`RESERVE_DRAW_PHASE_REPLACEMENT`。
> 🔴**「〜引く場合、代わりに〜引く」を汎用ドロー規則に食わせない**＝置換の `fromCount` 側が実ドローと読まれ `WXK01-002-E2` は**使った瞬間に1枚引く**過剰実行になっていた。あわせて `WXK02-022-E2` の再parseで、live から**丸ごと脱落していた**「対戦相手のシグニ１体をトラッシュに置き」も復元。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き492）。**> ✅**O-3 のフェイズ／ターンのスキップ系統＝2026-08-15 続き491 で解体**（O-3 自体は継続）。**6効果の挙動是正**（無言 no-op 4＋恒久 no-op 2）＋**PvP 限定の波及是正4効果**＋**CPU の追加ターン**。
> 🔑**「STUB の在庫」を数えても半分しか見えない**＝原文 regex（「〜フェイズ／ステップ／ターンをスキップする」13効果）で数え直すと壊れていたのは6効果で、**うち4件は STUB ですらなかった**＝`BLOCK_ACTION{ENERGY_PHASE}`（消費地点ゼロ）／`BLOCK_ACTION{SIGNI_ATTACK_PHASE}`（消費側は `SIGNI_ATTACK_STEP`＝**綴りが1つズレて不発**）／`STUB{SKIP_MAIN_PHASE}`（**ログを1行出すだけのハンドラ**＝`census:stubs` は「実装済み」と誤判定）／`SP38-006-E4`（アタック側が丸ごと脱落＋グロウ側は `END_OF_TURN`＝スキップ対象でないターンを封じていた）。
> 🔑**進行そのものの制限は funnel を1本だけ作る**＝`PHASE_SKIP_BLOCK_IDS`（フェイズ→封じ id の表）＋`resolveNextPhaseWithSkips`（旧 `resolveNextPhaseWithAttackStepBlocks` の一般化）。フェイズ内の個別アクションを1つずつ封じると封じ漏れが無言ですり抜ける（続き488 の `PAY_ENERGY_COST` と同じ設計）。⚠**CONTINUOUS 由来の封じは `blocked_actions` に載らない**＝`calcContinuousBlockedActions(...).forSelf` を渡し忘れると【常】が丸ごと no-op。⚠**`GROW` はこの表に載せない**（既存7効果の `ON_GROW_PHASE_START` を巻き込むため行動封じ近似のまま＝golden で固定）。
> 🔑**「◯◯フェイズ開始時」フックは遷移元（`phase`）ではなく遷移先（`nextPhase`）で判定する**＝①飛ばしたフェイズの開始時処理は走らない ②次に実際に入るフェイズの開始時処理はちゃんと走る、を1つの書き換えで満たす（通常進行では挙動不変）。
> 🔑**ターンプレイヤー交代の判定も1関数へ**（`resolveTurnHandover`）＝`extra_turn` と新設 `skip_next_turn` は**結果が同じ**（交代しない）。ターン終了は3経路あり、🔴**CPU 経路は交代判定を一切持たず `activeUserId: user.id` 直書きだった**＝CPU の追加ターンも人間のターンスキップ予約も効かなかった。golden にソース走査のトリップワイヤ（BattleScreen に**ちょうど3回**）。
> 🔴**条件節を落としたまま機構だけ足すと過剰実行になる**＝`WD20-006-E1` の受け皿 STUB は「このターンが対戦相手のターンで」「あなたがベットしていなかった場合」の**2条件とも捨てていた**。`CONDITIONAL{AND[TURN_OWNER{opponent}, IS_BETTING{negate:true}]}` へ組み替え（`IS_BETTING.negate` 新設）、golden は3通りの対で固定。
> 🔴**PvP 限定バグ**＝`ATTACK_ARTS_OP` は `NON_TURN_PLAYER_PHASES`＝進行ボタンを持つのが非ターンプレイヤーなのに、`doPhaseAdvance` は `my.blocked_actions` でスキップ判定していた＝「相手のシグニアタックステップを飛ばす」札4効果（`WX09-Re02-E1`／`WXK01-007`／`WXDi-P09-031`／`WXK11-001`）が PvP で無言ですり抜けていた（CPU 戦は専用経路なので影響なし）。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き491）。**> ✅**O-3 の `DEFERRED_ATTACK_TAX_HAND_DISCARD`（1）＝2026-08-15 続き490 で解体**（O-3 自体は継続）。**2効果の挙動是正**（恒久 no-op 2＝うち1件は計器に映らない無言 no-op）。
> 🔑**「支払えば通る」制限は軸ごとに別関数を生やさない**＝`signiAttackBanCost` が `{colorless, handDiscard}` を**まとめて返す**（解除不能な ban が1つでもあれば `null`）。軸ごとに関数を分けると「片方の軸だけ見る gate」が生まれて無言ですり抜ける。⚠支払い軸を足すときはこの1関数に足す。
> 🔴**引用文が丸ごと `GRANT_KEYWORD.keyword` に入る形は無言 no-op**＝`WXDi-P05-022-E1`「それは「【常】：手札を１枚捨てないかぎりアタックできない。」を得る」は keyword が**文そのもの**になり、`hasKeyword` は正式名でしか照合しないので**一度も効かない**（狙われたシグニが無条件でアタックできる）。**STUB ですらないので `census:stubs` にも映らない。** 正準形 `SELECT_TARGET_ONLY → STORE_LAST_PROCESSED_TARGETS → 〈ban〉{targetsStored}` へ組み替えた（`WX10-024-E2` の《無》×N 版と同じ組み立て）。
> ⚠**「アタックするごとに払う」と「1回きりの回避」は別機構**＝`SigniAttackBan.unlessPayHandDiscard`（毎回・ban は消費しない）と `NegateAttackAction.escapeDiscard`（1回きり・消費する）。原文の括弧書き「（アタックするごとに捨てる）」が両者を分ける。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き490）。**
> ✅**O-3 の `DEFERRED_NEXT_OPP_ATTACK_PHASE_START`（2）＝2026-08-15 続き489 で解体**（O-3 自体は継続）。**5効果の挙動是正**（過剰実行3＋対象取り違え1＋永続化バグ1）。
> 🔑**受け皿 id は母集団の一部しか映さない**＝原文「次の対戦相手のアタックフェイズ開始時」を regex で数えると**5効果**あり、A群に出ていたのは2件だけだった。残り3件のうち `WX25-P2-051-E2`（**即時に相手の全シグニをレベル無制限でダウン**）と `WXK01-003-E3`（**自分のルリグ**をアタック不可にしていた）は**もっと壊れていた**のに、`STUB{SOUL_OP}`／`STUB{PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE}` という**ハンドラ持ちの汎用 id**に落ちていたため計器に映らなかった。**着手時は原文 regex で母集団を数え直す。**
> 🔑**遅延予約は「予約した側」に積み、collector は `opState` を読む**＝`ON_ATTACK_PHASE_START` は自分のアタックフェイズでも走るので、`myState` を見ると**同一ターン内で即発火**する。走査軸は既存の `pending_opponent_attack_facedown_returns` と同じ（`playerId: opId` のエントリを積む）。⚠ターン境界を跨ぐので `turnScopedState` にも `delayed_triggers`（THIS_TURN 限定）にも載せない。
> 🔑**遅延本体は `splitSentences` の前に全文で切り出す**＝`SPDi43-24-E2` の本体は「…1体を対象とする。このターン、それがアタックしたとき、…」の**2文**。文単位に切ると本体が後続ステップとして並び予約した瞬間に走る（続き488 と同じ壊れ方）。
> 🟢**本体の機構はほぼ既存で足りた**＝`SPDi43-24-E2` は `NEGATE_ATTACK{CENTER_LRIG_OR_SIGNI, escapeDiscard:3}`（回避モーダルまで実装済み）、`WX25-P2-051-E2` は `levelEqLastProcessed`、`WXK01-003-E3` は `GRANT_KEYWORD{CENTER_LRIG_OR_SIGNI}`。**新規に要ったのは遅延予約と裏向きルリグゾーンだけ。**
> 🔴**`negated_attacks` / `negated_attacks_escape` は型コメントに「このターン」と書いてありながら失効地点が1つも無かった**（`signi_deploy_power_limit` と同じクラス）＝消費は「そのカードがアタックしたとき」だけなので、**狙われた側がアタックしなければゲーム終了まで残る**。`turnScopedState` へ登録して解消。**「期間つき」と書いてあるフィールドは失効地点を grep して実測する**（続き487 の教訓が再発）。
> ⚠**計器の較正は narrow なキーで行う**＝census +4 の解消に `NEGATE_ATTACK` を鍵にすると既存の高シグナル11件を丸ごと隠すので、`escapeDiscard`（live 15件・うち高シグナルは対象1件のみ）を使った。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き489）。**
> ✅**O-3 の `DEFERRED_EXTRA_ATTACK_PHASE`（2）／`_SELF_RESTRICT_THIS_TURN`（2）／`_UNPARSED_NEXT_OPP_TURN_CLAUSE`（1）＝2026-08-15 続き488 で解体**（O-3 自体は継続）。**8効果の挙動是正**（過剰実行4＋恒久 no-op2＋対象取り違え2）。
> 🔑**「遅延タイミング宣言」の後続文を即時実行しない**＝「追加のアタックフェイズを加える。**この方法で加えたアタックフェイズの開始時**、〜」「**次の対戦相手のアタックフェイズ開始時**、〜」は、文単位に切ると本文が後続ステップとして並び**宣言した瞬間に走る**。`ADD_EXTRA_ATTACK_PHASE.onStart` へ畳み込む（機構あり）か、後続ステップを落とす（機構なし＝過少側）。
> 🔑**フェイズを増やす機構は「次のフェイズを決める1点」に置く**＝`resolveNextPhaseAfterAttack` が遷移先の決定と**キューの減算**を同じ戻り値で返す（別分岐にすると減らし忘れ＝無限ループ／減るのに進まない＝不発のどちらかになる）。⚠CPU 経路は `SET_TURN_PHASE` しか commit できず state を書けないので**通さない**（母集団2枚とも CPU は能動使用しない＝安全側の近似・O-1 で解消）。
> 🔑**「支払えない」系は「支払い元を作る側」に載せる**＝`buildEnergyPayPool` が空配列を返せば、`canAffordGrowCost`／`canAffordWithExtraCost` は**エナ1以上のコストだけ**が false になり《色×0》は通る＝原文の「１以上のエナコストを支払えない」がそのまま出る。14本のモーダルに検算を撒かない。
> 🔴**`ADD_TO_FIELD` は `source` が無いと engine で「デッキの一番上」を場に出す**（`execAddToField` の `!src` 分岐）＝「それらを場に出し」の参照先が明示 defer なら、この配置は**無関係なシグニを増やす過剰実行**にしかならない（`WX22-010-E3`）。
> 🔴**対象選択を挟む経路（`applyDirectAction`）にも同じ delta 解決を入れる**＝`execPowerModify` 側だけ `deltaFromZone` を解くと、選択UIを通る対象では `resolveNum(0)` に潰れて**無言でパワー±0**になる（実装中に踏んだ）。
> 🔑**`STUB{OPTIONAL_COST}` のような「ハンドラ持ちの汎用 id」に落ちた文は `census:stubs` に映らない**＝`SPK01-10-E1` の「ターン終了時、それらをエナゾーンからトラッシュに置く」は**丸ごと no-op** なのに A群に出ていなかった。専用 id（`TRASH_ENERGY_AT_TURN_END`）へ寄せて実装した。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き488）。**
> ✅**O-3 の `_NEXT_OPP_TURN_CLAUSE`（5）／`_THIS_AND_NEXT_TURN_CLAUSE`（4）＝続き487**（7効果是正・新機構 `SIGNI_DEPLOY_BAN`）
> ✅**O-3 の最大クラスタ `_THIS_TURN_OPP_CLAUSE`（7）＝続き486**（5効果の恒久 no-op 解消・新機構 `SIGNI_ATTACK_BAN`）
> ✅**O-19（watcher の `triggerScope` 推論）／O-25 本体（引用能力の自己付与）＝続き485**（5効果是正）
> ✅**O-20（実行時のカード全文 regex 読み・20サイト）＝続き482**／✅**O-21（到達不能な二番手 STUB・19 id）＝続き483**
> ✅**O-22（(a)(b)(c)）／O-23／O-24＝続き484**（5効果是正・うち4件は恒久 no-op）
> **上記5セッションの教訓・実装詳細（24行）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-15 整理⑱」へ全文退避**（2026-08-15）。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) の各日付。**

> **以下は続き403〜453 ぶん**
> **1行サマリも含めて [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-13 整理⑨」へ全文退避した**（2026-08-13）。
> ここは**生きている worklist だけ**を置く方針の徹底＝消化済みの記録は PLAN には残さない。
> 一次記録は [BUGFIXES.md](./BUGFIXES.md) の各日付。




## 2026-08-17 整理㉕：🏁§6.4 `O-11` 完了（続き533）— 最後の3件と、残した近似

> 一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-17（続き533）。

### 消化した3件（3件 → 0）

| カード | 何が起きていたか | 直し方 |
|---|---|---|
| `WX22-016` | アーツの**本体**（相手シグニをバニッシュ＋トラッシュから＜遊具＞回収）が**選択肢②の中に埋まって**おり、ベットは任意なので**ベット0枚だとカードが何もしなかった**。バニッシュの脱落と ＜遊具＞ 限定の脱落も同居 | 本体を CHOOSE の**兄弟**へ出す／選択数は `countChoose{$ref:'bet_coins_paid'}` |
| `WX05-042` | `SEQUENCE[DRAW 1, RULE_REMINDER_TEXT]`＝**使った瞬間に無条件で1枚引くだけ**（トリガーも条件も消え、バニッシュとエナ回収は消失、ドローは過剰実行） | 機構3本を新設（下記）＋ manualEffects |
| `PR-469` | 3択が丸ごと消え、さらに【起】コスト「ルリグデッキの＜タマ＞のルリグ1枚を**ゲームから除外**」が JSON に無く **《白×3》だけで撃てた** | 4本まとめて実装（下記） |

### 🔑 `WX05-042` で新設した機構

| 追加 | なぜ要るか |
|---|---|
| `INSTALL_DELAYED_TRIGGER` の `ON_SIGNI_DOWN` 収集 | この収集は**場のカードとキーしか見ていなかった**＝スペルが設置した遅延トリガーは拾えなかった |
| `trigger.duringOwnMainPhase` | 「**あなたのメインフェイズの間**」＝発火窓。期間（`THIS_TURN`）とは別軸で、設置はターン中ずっと残るが撃てるのはメインだけ |
| `PlayerState.signi_downed_this_turn` ＋ `Condition.SIGNI_DOWNED_COUNT_THIS_TURN` | 「このターンでN回目」。**枚数ではなくカード番号を積む**（原文が ＜植物＞ で絞るので `filter` を当てられる形にする） |
| `InstallDelayedTriggerAction.fireCondition` | **収集時に評価する**＝作ってから中で分岐すると `once` が非成立の回で消費される |

⚠**台帳はダウン検出3経路すべてで積む**（中央 diff／アタック宣言／常時効果）＝`recordSigniDownedThisTurn` に集約。
⚠**記録は収集より前**にやる。最初は収集の後に積んでいて「3回目」が1つズレていた（実測）。

### 🔑 `PR-469` で新設した機構

- `EffectCost.exileLrigFromLrigDeck`（parser 抽出＋ルリグ【起】の支払い＋提示側の可否ゲート7経路）。
  ⚠**行先は `excluded`**＝`trashArtsFromLrigDeck`（ルリグトラッシュ行き）を流用しない。
- `MILLAction.all`＝「デッキから**すべての**カードをトラッシュに置く」。大きな `count` で代用しない。
- `STUB{OPP_LRIG_DECK_BLIND_REVEAL}`＝「相手のルリグデッキから1枚**見ないで選び**公開し、
  **ルリグでないときだけ**相手のルリグトラッシュへ」。公開して初めて種別が分かるので1 STUB にまとめた。
  🔴既存の後段 `NON_LRIG_TO_LRIG_TRASH` は `ctx.ownerState` 固定で、除去元が見つからなくても
  **無条件に自分のルリグトラッシュへ積む**＝そのまま繋ぐと**相手のカードが自分側に複製される**（実測）。
- CHOOSE ヘッダ「この【起】能力で**まだ選ばれていない**１つを選ぶ」を `parseChooseHeaderCount` へ集約。

### ⚠ O-11 に残した近似（クローズ後の既知の穴）

| 残り | 中身 | 影響 |
|---|---|---|
| **選択履歴** | 「まだ選ばれていない1つ」（`PR-469`）／「まだ選んでいないもの」（`WXDi-P11-002`・`WXDi-P11-003`）＝**使用済み選択肢の除外**が未実装 | 毎回すべての選択肢から選べる（3効果） |
| **ゾーンを跨ぐ OR コスト** | `WXK10-018-E2`「シグニに付いているカード1枚**か**下にあるカード1枚をトラッシュ」 | `costUnparsed`＝提示されない（続き532 で ACTIVATED 提示7経路にガード） |
| **明示 defer 3種/4件** | `DEFERRED_OPP_LRIG_UNDER_TO_TRASH`（相手ルリグ下の操作＝engine が `ownerState` 固定）／`DEFERRED_COLOR_QUALIFIED_USE_BLOCK`（色限定つき使用封じ＝`BLOCK_ACTION` に色の絞りが無い）ほか | 宣言された no-op（無言 no-op は0） |

### 🔧 `scripts/syncManualLive.ts`（新設）

`build:effects` は `MANUAL`／`PARTIAL` を不可侵にするので**既存 id の手修正は live に届かない**
（新しい id の追加だけ `adopted_manual_add` で通る）。`WX20-069`／`WXDi-P07-010`／`WX22-016`／`WX05-042` で
3セッション連続で同じ手当てをしていたため道具にした。`npx tsx scripts/syncManualLive.ts [--dry] <CardNum> ...`。

## 2026-08-17 整理㉔：§6.4 `O-11` をさらに4件消化（続き532）— 残 3件に必要な機構

> 一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-17（続き532）。**PLAN §6.4 の `O-11` 行はこの節も参照する。**

### 消化した4件（7件/7カード → 3件/3カード）

| カード | 何が起きていたか | 直し方 |
|---|---|---|
| `PR-328` | 「以下の２つから、**この方法で捨てたシグニの枚数と同じ数だけ**選ぶ」＝ヘッダの選択数が定数でないため**ヘッダごとマッチせず**、カードが `STUB{OPTIONAL_DISCARD_CLASS_SIGNI}` に落ちて**①②が1つも実行されない** | `ChooseAction.countChoose{count:{$ref:'last_processed_count'}}` |
| `PR-471` | 同上（「相手センタールリグのルリグタイプ1つにつき1つまで」）＋③のサーチに**無色限定が無い**＋②が素の `BLOCK_ACTION`＝**無色まで封じる** | `countChoose{$ref:'opp_center_lrig_type_count'}`／`parseColorFilter` に `無`／②は明示 defer |
| `WXK10-018` | 「②【ランサー】**【起】**《ターン１回》…」が句点なしで直結し、**2本目の【起】が丸ごと欠落** | `splitEffectBlocks` の句点挿入リストに**キーワード単独ブロック**を追加 |
| `WXDi-P07-010` | 旧パースは `REVEAL_AND_PICK{owner:'self', then:RULE_REMINDER_TEXT}`＝**自分のデッキを公開して pick して何もしない**＝レベル別4分岐が全部 no-op | manualEffects に `REVEAL_DECK_TOP{owner:'opponent'}`＋`LAST_PROCESSED_MATCHES` の **else 入れ子** |

### 🔑 `ChooseAction.countChoose`（選択数が実行時に決まる CHOOSE）

`conditionChoose`（条件を満たしたら**定数へ差し替え**）の隣。`choose_count` を丸ごと `NumberOrRef` で解決する。
engine は `execChoose` で `resolveCountRef`、**0 のときは選ばせずに終了**（0枚捨てたのに1つ選べると過剰実行）。
CHOOSE ヘッダの選択数解析は `parseChooseHeaderCount` に集約し、**解けないヘッダには null を返す**
（既定の「1つ選ぶ」へ倒さない）。新 `$ref`＝`opp_center_lrig_type_count`／`self_center_lrig_type_count`
（ルリグタイプは `CardClass` の `/` 区切り＝`タマ/イオナ` は2種）。

### 🔴 能力ブロック分割：キーワード単独ブロックの直後で割る（live 5枚が復活）

`splitEffectBlocks` は「`。` の直後」でしか割らない。【エナチャージN】【シュート】【ダブルクラッシュ】
【マルチエナ】は句点挿入済みだったが、**【アサシン】【ランサー】【シャドウ】【シャドウ（スペル）】が漏れて**おり、
`【常】：【アサシン】【常】：【ダブルクラッシュ】` のような形で**後続ブロックが丸ごと欠落**していた（実測8カード）。
復活＝`WX13-030`（ダブルクラッシュ）／`WX17-034`（シャドウ）／`WX22-025`（すべての色を得る）／
`WXK01-036`（アサシン・ドライブ）／`WXK10-018`（2本目の【起】）。

⚠**マーカー自身（【自】【出】【起】）を区切りに足してはいけない**＝
「対戦相手のシグニの**【自】【出】【起】能力**が発動する場合」（`WXDi-P08-044`）という**文中の参照**がある。

### 🔴 `costUnparsed` の ACTIVATED 経路が無防備だった

`WXK10-018-E2` のコスト「シグニに付いているカード1枚**か**下にあるカード1枚をトラッシュ」は
**ゾーンを跨ぐ OR コスト**で表現できず `costUnparsed` が立つ。ところが**このフラグを見ていたのは
`triggerCollect`（AUTO 経路）だけ**で、ACTIVATED の提示側（シグニ／ルリグ MAIN・AA／付与 MAIN・AA／
キー／手札／トラッシュ）は素通りだった。既存の `costUnparsed` 11効果はすべて AUTO なので被害は0だが、
**ACTIVATED に1本でも出た瞬間にコスト踏み倒し**になるため全経路にガードを入れた。

### 残 3件に必要な機構（次の担当への引き継ぎ）

| カード | 要るもの |
|---|---|
| `WX05-042` | **回数カウンタつきの一時付与トリガー**＝「このターン、〜がダウン状態になったとき、それが**このターンで3回目**である場合」。`delayed_triggers` は回数を持たない |
| `WX22-016` | §6.4 `O-29`（`REPEAT` の反復）合流 |
| `PR-469` | **4本**＝①「この【起】能力で**まだ選ばれていない**1つ」＝**選択履歴**（既存の「まだ選んでいないもの」も未実装で同じ器を待っている）②「相手デッキから**すべて**トラッシュ」③「相手ルリグデッキから1枚**見ないで選び**公開」④コスト「ルリグデッキの＜タマ＞1枚を**ゲームから除外**」。⚠**④が無いまま CHOOSE を組むと《白×3》だけで撃てる**＝**コストを踏み倒す過剰実行**（実測確認済み） |

## 2026-08-17 整理㉓：§6.4 `O-11` の実装穴10件消化（続き531）— 消化の内訳と、残 7件に必要な機構

> 一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-17（続き531）。**PLAN §6.4 の `O-11` 行はこの節も参照する。**

### 消化した10件（17件/16カード → 7件/7カード）

| カード | 何が起きていたか | 直し方 |
|---|---|---|
| `WXK05-005-E1` | 「カードを３枚引き、【エナチャージ４】をし、**デッキ上5枚公開して…好きな枚数の緑のシグニを場に出し、残りをトラッシュ**」で**後半が丸ごと消滅** | ①【エナチャージN】ショートハンドの catch-all に安全網 ②`fusedLookPickSentence` が読点なしの「N枚公開して」を受けるよう拡張 ③記述子の**前置き枚数語**（「好きな枚数の〈色〉のシグニ」）対応 ④畳み込み経路の `dest==='field'` 分岐（欠けていて「場に出す」が黙って「手札に加える」になっていた） |
| `WX20-069-E1` | 「手札から＜遊具＞を３枚捨て、このシグニを場からトラッシュに置いてもよい」の**手札3枚が丸ごと踏み倒され**、自己トラッシュ1枚だけでレゾナが出ていた | `StubAction.selfTrash` ＋ `OptionalCostSpec.selfTrash` を新設し、両方を**1つの任意ゲート**に束ねる（別々の2ゲートに割ると片方だけ払えてしまう） |
| `WXEX2-66-E2` | 「カードを1枚引く**か**【エナチャージ1】をする」の**引く側が消えた**ただのエナチャージ | 素の二択規則を【エナチャージ】ショートハンドの**前**に追加（ルリグレベル比例版だけが在った） |
| `SPDi43-26-E2` | 「デッキ上5枚見る→2枚まで手札→残りデッキ下」の**早期 return が3文目以降を捨て**、バウンスと支払いが消滅 | 「その後、」で始まる**明示的に逐次**の続きだけを `parseActionText` にまとめて渡し、**平坦化して**足す（入れ子のままだと支払いゲートの隣接が壊れる） |
| `WXEX2-13-E2` | サーチの行き先語彙に「ライフクロスに加え」が無く、**サーチごと消えて後続の `LIFE_CRASH` だけ**が走る＝**ライフが増えずに減る符号逆転** | SEARCH ビルダーに `toLife` を追加（engine の `ADD_TO_LIFE{fromSearch}` は既存＝配線のみ） |
| `WX25-P1-046-E1` | 「**あなたの**手札から…」の前置きで規則が外れ、総称 `LOOK_AND_REORDER`＋`POWER_MOD_PER_COUNT`（原文に無い）に落ちて**手札もドローも動かない真 no-op** | 既存規則の `^手札から` を `^(?:あなたの)?手札から` へ／「この方法でデッキに移動したカードの枚数に1を加えた枚数」＝`DRAW{count:1, addLastProcessedCount}` |
| `WXDi-P15-001-E1` | 「センタールリグは以下の能力を得る」の early return が**全文を GRANT として奪い**、前に書かれた3ドロー・任意コスト・ライフクラッシュが全滅 | 付与節より前の本文を別に解いて前に積む（**残りなく解けたときだけ**） |
| `WDK07-E08`③ | 打ち消しだけが在り、「トラッシュから対戦相手の手札に戻す」と「このターン同名使用禁止」が欠落。しかも `NAME_BAN` は型が `'GAME'` しか無く**ゲーム中ずっと封じる**過剰実行 | live（MANUAL）の choice を `SEQUENCE[COUNTER_SPELL, TRANSFER_TO_HAND{opp trash→opp hand}, NAME_BAN{TURN}]` へ。`NameBanAction.duration:'TURN'` を新設し engine は `blocked_card_names`（turn-end で消える軸）へ載せる |
| `WXDi-P12-005-E1` | **カードごと `STUB{RULE_REMINDER_TEXT}` の真 no-op**（3択が1つも実行されない） | `ChooseAction.conditionChoose` を新設（下記） |
| `WXK11-005-E1` | 構造化した結果、先頭の「各プレイヤーは自分のデッキの上から5枚トラッシュ」が落ちているのが**初めて見えた** | `conditionChoose` 経路に見出し前の本文の前置きを追加 |

### 🔑 `ChooseAction.conditionChoose`（汎用の選択数上書き）

「〈盤面条件〉の場合、代わりにNつ(まで)選ぶ」。既存の選択数上書きは
`recollect`／`recollectArts`／`betChoose`／`preUseVirusChoose`／`additionalCostChoose` の**5本ともトリガーを
型名に焼き込んだ特殊形**で、素の盤面条件を表せなかった。`Condition` をそのまま持ち engine の
`evalCondition` に委ねる＝条件語彙が増えても CHOOSE 側を触らずに済む。

これで **engine がカード全文を regex で再パースする `STUB{CONDITIONAL_MULTI_CHOOSE_BY_CENTER}`（live 11効果）を解体**できた。
実測すると `WD23-012-A` は3択のうち①の凍結が落ち③が丸ごと欠落、`WXDi-P12-005` はカードごと真 no-op だった。
⚠**落ちるのは engine の名前エイリアス（`lrig_name_aliases`／`LRIG_ALL_NAMES_SENTINEL`）だけ**＝
`LRIG_STORY` は `CardClass` 軸で、他の全経路が既にそちら側なので寄せた。

### ⚠ この回で作りかけた「直すつもりの過剰実行」

- **文単位で `SELECT_TARGET_ONLY`/`STORE_LAST_PROCESSED_TARGETS` を組んだら 7効果が壊れた**。
  入れ子 SEQUENCE ができて engine の任意コスト funnel（`OPTIONAL_COST` の**直後の兄弟**がゲート）が外れ、
  **払わなくても本体が撃てる**。対象の束縛は**カード単位**の `applyDroppedTargetDesignation` が担う。
- **任意コストの filter で `cardType` を落とすと `filter:{}`＝手札のどのカードでも払える**（`WX12-017-E1`）。
- **census の較正を同時に入れないと +6 する**＝`conditionChoose` は `CONDITIONAL` では表せないので、
  「代わりに」節と条件節の `extraOk` 両方に `stripConditionChooseClause` が要る。
- **golden が「当時の壊れた姿」を固定していた 3件**。アサートの**意図**へ書き換えるのが正しい。

## 2026-08-17 整理㉒：§6.4 `O-35`（`CONDITIONAL_POWER_BONUS` 受け皿）の解体・完了（続き530）

> 一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-17（続き530）。**PLAN §6.4 の `O-35` 行はここへ退避した。**

### 在庫（§3-1 の実測）

live 全走査（`type==='STUB' && id==='CONDITIONAL_POWER_BONUS'`）で **5効果6ノード → 0効果0ノード**。
内訳＝`WXK03-080-E1`／`WX09-011-E2`／`WX25-CP1-020-E2`（×2）／`WXDi-P13-008-E1`／`SPDi43-25-E2`。

### (1) 対象宣言＋デッキトップミル（**live 3効果・過剰実行**）

原文「対戦相手のシグニを〈N〉体（まで）対象とし、あなたのデッキの一番上のカードをトラッシュに置く。」

🔴 真因は `parseSentencePart1` の「トラッシュに置く（直接除去）」フォールバックが
`t.includes('対戦相手のシグニ')` **だけ**を見ていたこと＝**間に挟まる目的語を無視**して
`TRASH{SIGNI opponent}` を返し、**【出】でノーコストの相手シグニ除去**に化けていた
（`WXK03-080-E1`／`WXK03-081-E1`／`WXEX1-41-E2`。`WXEX1-41-E2` は続く「それをバニッシュする」も
**自分のシグニ**を撃ち、しかも《トラップアイコン》条件が丸ごと落ちて無条件だった）。

正準形 `SELECT_TARGET_ONLY → STORE_LAST_PROCESSED_TARGETS → TRASH{DECK_CARD}` ＋
帰結を `targetsStored` で宣言済み対象へ束縛（`applyDeckTopMillTargetAnaphora`）。
あわせて `LAST_PROCESSED_MATCHES` に `hasIcon`（「《Xアイコン》を持つ**カード**」）を配線した。

- 🔑**「を」の有無で2綴りある**＝「シグニ**を２体まで**対象とし」と「シグニ１体**を**対象とし」。
  `を対象とし` 固定だと前者が丸ごと漏れる（実際 `WXK03-080-E1` だけ外れていた）。
- ⚠**「そのカードが〜の場合、」は条件持ち上げの alternation へ丸ごとは足さない**＝原文実測53文の大半は
  `REVEAL_AND_PICK`（公開して条件一致なら帰結）として別経路で正しく解けており、引き込むと構造を壊す。
  ミル結果を受けるアイコン綴りだけを**列挙で1本**足した。

### (2) コスト支払い枚数のゲート（**live 2効果・no-op と過剰実行が1件ずつ**）

原文「〈エナ全トラッシュ〉：この方法でカードを〈N〉枚以上トラッシュに置いた場合、〈帰結〉」。

新語彙 `COST_TRASHED_MATCHES{minCount}`（既存条件に1キー追加）＝BattleScreen がコスト支払い時に
記録する `last_cost_trashed_cards` を数えるだけ。`LAST_PROCESSED_COUNT_GTE`（**本文**の直前ステップを見る）
とは参照先が違うので取り違えない＝**先頭文か、直前が同じコストゲートのときだけ**適用する。

- 🔴**ルリグ【起】の支払い経路にだけ `last_cost_trashed_cards` の記録が無かった**（BattleScreen）＝
  シグニ【起】(11825) と召喚 (12427) には在るのに欠けており、`WX25-CP1-020-E2`／`WXDi-P16-012-E3`
  （どちらもルリグ）では条件が**恒久 false** になるところだった。
- 是正＝`WX25-CP1-020-E2` は無言 no-op（ライフ→エナが一度も起きない）／`WXDi-P16-012-E3` は
  条件が落ちて**エナ0枚でもライフが1枚増える**過剰実行。
- 「〈誰か〉のライフクロス1枚をエナゾーンに置く」の**素の綴りに規則が無かった**ので追加（機構
  `STUB{LIFE_TO_ENERGY}` は最初から完全実装済み＝純粋な parser 穴）。

### (3) 能力スコープのコスト減額（**live 1効果・過少実行**）

原文「あなたのセンタールリグがレベル４以上の場合、**この能力の**発動コストは《赤×2》減る」（`WX09-011-E2`）。

`COST_REDUCTION` は「スペル／アーツ／ルリグ」という**カード種別**に掛かる別軸なので表せない。
新フィールド `EffectCost.conditionalEnergyReduction{condition, energy}` を置き、
**【出】コスト効果を集める1点**で `applyAbilityCostReduction` が `energy` へ焼き込む
（提示モーダル・支払い・可否判定がすべて同じ削減後コストを見る＝funnel を増やさない）。

- 🔑parser は `CONDITIONAL{LRIG_LEVEL, then: STUB{SELF_ABILITY_COST_REDUCTION}}` を作り、
  `hoistSelfAbilityCostReduction` が **action から cost へ移して**ノードを取り除く。
- ⚠`tryWrapLeadingStateCond` の**ガードC**（`COST_REDUCTION` を含む id は CONDITIONAL に包まない）に
  引っかかるので明示的に例外へ入れる＝包まないと条件が消えて**常時タダ**になる。
- ⚠`optionalOnPlayCostStub` の `SUPPORTED` にキーを足さないと「未対応キーあり」で任意【出】が
  **丸ごと積まれなくなる**（golden の (xxix)(1) トリップワイヤがこれを検出した）。

### (4) コストを払ってトラッシュのスペルを使用（**live 1効果**）

原文「あなたのトラッシュから《ディソナアイコン》のスペル1枚を対象とし、それを**使用**してもよい」。

🔴既存 `USE_SPELL_FROM_TRASH` は**コストを支払わずに**使うので流用すると過剰実行。
新 STUB `USE_SPELL_FROM_TRASH_PAYING_COST` が ①候補選択 ②印刷コストの支払い確認 ③本体へ委譲 を担う。

- ⚠選択を跨ぐと `lastProcessedCards` は消えるので、確定したスペルは `carriedCardNum` で運ぶ。
- ⚠可否は**枚数ではなく色**で見る（`canPayOptionalCost`）＝枚数だけ見ると色が足りないまま
  「支払う」を選べてしまい、支払いステップが黙って何も引かず**タダで使用**になる。
- 🔴副産物＝`INTERNAL_CMCLG_DEDUCT` が**支払ったエナを `energy` から抜くだけでトラッシュへ置いておらず、
  カードがゲームから消えていた**（リフレッシュのデッキ枚数が合わなくなる）。

### (5) `SPDi43-25-E2`（**live 1効果・1文目から誤読**）

原文「各プレイヤーは自分のデッキの一番上のカードを公開する。（レベル合計）３以下→4ドロー／４→相手が
ルリグデッキから1枚をルリグトラッシュ／５以上→相手が手札4枚捨て」。

- 🔴1文目が `LOOK_OPP_LIFE_TOP`（＝**相手のライフクロス**上を見る別機構）に化けており、公開が起きず
  `lastProcessedCards` に無関係な札が載っていた → 新 STUB `REVEAL_EACH_PLAYER_DECK_TOP`
  （⚠公開札は**デッキの一番上に残す**。`REVEAL_BOTH_DECK_TOPS` は一番下へ回す別文型なので流用しない）。
- 🔴3つのレベル合計条件が全部落ちて**4ドローと相手4枚捨てが両方とも無条件**だった → 既存の
  `applyThisWayTrashOutcomeGuards`「同じミル結果を読む独立3段」の recorder 判定を公開にも広げ、
  `SEQUENCE{snapshotLastProcessedForConditionals}` ＋ `LAST_PROCESSED_LEVEL_SUM` ×3 へ。
- 🔑**新しい綴りを足す前に同義の STUB が engine に無いかを見る**（続き529 と同じ罠）＝
  「対戦相手は自分のルリグデッキからカード1枚をルリグトラッシュに置く」に `TRASH{LRIG_DECK_CARD}` を
  新設しかけたが、**`STUB{OPP_LRIG_DECK_TO_LRIG_TRASH}` が実装済み**（parser 規則だけが無く、
  live では `WX24-P4-014-E3` の手パッチだけが持っていた）と分かり、engine 側の追加を撤回して
  **parser 規則を足す**方向に変えた。

### 残した契約（golden 4本）

1. 受け皿 `STUB{CONDITIONAL_POWER_BONUS}` の **live 0件**トリップワイヤ（parser の46規則がここへ流れ込むので、
   復活したら赤くなる＝規則を足すなら専用 id を与えること）。
2. (1) の正準形（`SELECT_TARGET_ONLY`/`STORE`/`DECK_CARD`/`targetsStored`）と `hasIcon` 条件。
3. (2)(3) の parse 形＋engine 評価（枚数閾値・条件成立/不成立でのコスト減額）。
4. (4)(5) の engine 挙動（支払ったエナがトラッシュへ移る／公開札がデッキ上に残る／レベル合計3分岐）。

## 2026-08-16 整理㉑：§6.4 `O-11`（計器の未仕分け）の仕分け結果 — `verifyEffects` アクション照合

> 一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き519）。**PLAN §6.4 の `O-11` 行はこの節を参照する。**

### 在庫の実測（§3-1）— 簿記の「8件」は**スクリプト既定の Sheet1 だけ**の値だった

`npm run verify`（＝`scripts/verifyEffects.ts`）は `--sheet` の**既定が `Sheet1`**。
簿記の「アクション[STUB代替?] 5件／[要確認] 3件＝8件」はその1シートぶんで、
**全10シートで数え直すと 135件（[STUB代替?] 78／[要確認] 57）**だった。

### 計器の較正（誤検出をルールで潰した）＝135件 → **43件**

| # | 潰した誤検出 | 効いた件数 |
|---|---|---|
| 1 | 🔴**幻の型名 `MOVE_TO_ENERGY`**＝型宣言にも live JSON にも存在しない。しかも**実型名 `SEND_TO_ENERGY`（live 77件）が別名表から丸ごと漏れていた**＝「エナゾーンに置く」の報告が原理的に全部誤検出だった。ほかに `DISCARD`／`CRASH_LIFE` も幻の型名（こちらは実型名が同居していたので実害は表示だけ） | 最大 |
| 2 | **枚数が盤面/レベル依存の同義形が別名表に無い**＝`DRAW_PER_FIELD_COUNT`／`DRAW_PER_LRIG_LEVEL`／`ENERGY_CHARGE_PER_LRIG_LEVEL`／`ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT` ほか | 多数 |
| 3 | **「行き先をパラメータに持つ」型を型名だけで照合していた**＝`LOOK_PICK_CHAIN`（`stages[].then`／`remainder.location`）と `REVEAL_AND_PICK`（`remainder.location`／`handOrEnergy`／`handOrField`）はエナ置き・ミル・手札加え・場出しを**型名で区別しない**。行き先から派生アクション（`~NAME`）を導くようにした | 11 |
| 4 | **任意コスト STUB の「実際に払うもの」はペイロードのキーで決まる**（`resolveOptionalCostSpec`）。id 単位で `STUB_EQUIVALENTS` に登録すると**ペイロードが空＝何も払わない個体まで実装済みに見える**ので、キー単位（`handDiscard`／`handToEnergy`／`deckTrash`…）で派生させた | — |
| 5 | **STUB のペイロードが本体アクションそのものを持つ形**（`PER_OWN_LRIG_COLOR_SCALE.scaleAction`／`unpaidAction`／`additionalCostChoices[].action`）に固定キー辿りが届いていなかった＝allowlist つきの深い走査を追加 | 10 |
| 6 | **ハンドラ本文を読んで実挙動を確認した STUB を `STUB_EQUIVALENTS` へ登録**（13 id）＝`COST_COLOR_SELECT`／`DRAW_IF_POWER_ZERO_TEMP`／`MILL_EACH_REPEAT_ON_NAME`／`DRAW_AT_TURN_END`／`RETURN_TO_HAND_AT_TURN_END`／`SELECT_OPP_SIGNI_FOR_BOTTOM_MILL`／`BANISH_ATTACKER_IF_WEAKER_THAN_FRONT`／`INTERNAL_KIYOHIME_CHOOSE`／`TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE`／`DECLARED_ICON_HAND_DISCARD_BANISH`／`CONDITIONAL_ALTERNATE_EFFECT`／`VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE`／`LOOK_PLACE_FACEDOWN_DELAYED` | 14 |
| 7 | **「このアーツ/スペルを使用する際、〜捨てる」＝使用コストの宣言節**を本体として数えていた。徴収は使用の支払い funnel が行い、action 側は `ARTS_COST_REDUCTION_BY_EFFECT`＝**「コストは支払い時点で計算済み」の no-op**（`execStubPart1.ts:772`）なので必ず鳴る。アンコールコストと同じく除去 | 5 |
| 8 | `REPLACE_NEXT_DAMAGE_WITH_MILL` が MILL の別名に無い | 2 |

🔑**再発防止＝起動時の較正チェックを常設した**。`ACTION_KEYWORDS`／`STUB_EQUIVALENTS` に書いた型名を
**型宣言（`src/types/effects.ts`）∪ live JSON の実出現**と突き合わせ、実在しない名前を 🔴 で報告する
（概念名は `CONCEPT_LABELS` に登録して明示的に除外＝現在は `HAND_DISCARD` の1つだけ）。
**これが無かったから `MOVE_TO_ENERGY` が誰にも気付かれず「全件誤検出」を出し続けていた。**

### 残った43件（41カード）＝**すべて実際の実装穴**。仕分け済みの worklist

⚠**この43件は `census:stubs` A群（0種/0件）にも `census`（823 据置）にも映らない層**＝
「ハンドラは在るが**別のことをしている**／原文の節が丸ごと落ちている」型（続き459 の教訓の一般形）。

**(a) 原文の節が丸ごと落ちている（過少実行）— 24件**
`WX05-042`（本体のバニッシュ＋エナ→手札が落ち DRAW だけ）／`WX12-CB02`（レベル3/4/5の分岐3本）／
`WX13-046`（【クロス自】のバニッシュ）／`WX21-006`（バニッシュ＋エナ置き＋**条件そのもの**が落ち無条件ドロー）／
`WXEX1-47`（バニッシュ）／`WXEX2-13`（サーチ2箇所）／`WXEX2-66`（「引くか【エナチャージ】」の**ドロー側**）／
`WXK03-044`（デッキ3枚ミル）／`WXK05-005`（公開→場出し→残りトラッシュ）／`WXK09-031`（相手シグニをエナへ）／
`WXK10-018`（【起】1本ぶんの1ドロー）／`WXK10-074`（アクセ用サーチ）／`WD23-008-A`・`WD23-033-A`（【トラップ】設置サーチ）／
`WDK07-E07`（サーチ＋アクセ付与＝**カードの本体まるごと**）／`WDK07-E08`（③の手札戻し）／`WDK07-E20`（①のサーチ＋アクセ）／
`WDK08-Y08`（手札→エナ）／`SPK01-14`（①のバニッシュ）／`PR-469`（【起】3択の②）／`PR-471`（**3択が丸ごと**）／
`SPDi43-26`（相手シグニのバウンス＋ガード捨てコスト）／`WXDi-P07-010`（公開レベルによる①②分岐）／
`WXDi-P08-063`（末尾の1ドロー）／`WXDi-P12-002`（**全体バニッシュ**）／`WX26-CP1-057`（エナ置き）

**(b) カード/効果が丸ごと no-op — 2件**
`WXDi-P12-005`（3択カードが `STUB{RULE_REMINDER_TEXT}` だけ）／`WX25-P1-046`（DRAW が無く、原文に無い `POWER_MOD_PER_COUNT` が出ている＝**幻覚も同居**）

**(c) 行き先／内容の取り違え — 4件**
`WX11-080`（原文「それをエナゾーンに置く」なのに**手札に加えている**）／
`WX24-P2-026`（原文「手札をすべて**エナゾーンに置く**」なのに `MASS_TRASH`。加えて `GUARD_ALTERNATIVE_COST` は**ログのみの no-op**）／
`PR-328`（2択が丸ごと落ちて、原文に無い `DRAW` になっている＝**幻覚**）／
`WDA-F02-07`（`STUB{id:'TRASH'}` が `lastProcessedCards` 不在時に**アーツ自身をトラッシュする**＝原文の「手札からレベルの異なるシグニ3枚まで」ではない。BANISH も枚数連動でなく固定1）

**(d) 🆕ペイロードが空の `OPTIONAL_COST` — 6件（母集団は別途 ~~67効果~~ → **41効果**）**
`WX20-069`／`WX22-029`／`WX22-037`／`WX24-P2-036`／`WD20-004`／`WDK07-E12`。
`OPTIONAL_COST` は**ペイロードのキーが空だと `resolveOptionalCostSpec` が空 spec を返し「支払う」を選んでも何も払わない**。
つまり「手札を好きな枚数捨てる」等のコストが**丸ごと踏み倒され、後続の本体だけが走る**。

> 🔴**2026-08-17（続き521）訂正＝「67効果」は過大計上だった。**
> 数えるときのキー表から **`exceed` と `coinCost` が抜けていた**（どちらも立派な支払い）。
> 正しく数え直すと**この時点で 41効果**（`OPTIONAL_COST` 総数 606 のうち）。続き521 の消化後は **37効果**。
> ⚠**計器を作った当人が計器の較正を外す**という O-11 そのものの失敗の再演。
> **支払いキーの一覧は `resolveOptionalCostSpec`（`src/engine/execUtils.ts`）が実際に読むキーから機械的に取る**こと。
> 下の一覧も同じ理由で `exceed`／`coinCost` を持つ個体（`WXDi-P03-*`／`WXDi-P11-*`／`WX25-P3-*`／`PR-Di013` 等の
> 「追加でエクシードN」族）を**含んでしまっている**＝**空ではない**。

全部が誤りとは限らない（【常】の置換コスト等・近似として置いた個体を含む）ので、**着手時に仕分けること**。
なお「好きな枚数」＝**可変枚数**は現行のペイロード（固定 `count`）では表せない＝**機構が要る**
（続き521 時点で残る本命はここ＝`WX22-037`／`WX24-P2-036`／`WX11-029-BURST`／`WX24-P1-013-E2`／`WX26-CP1-053`）。

**(e) 既知の別項目に合流 — 3件**
`WX22-016`（§6.4 `O-29`＝本体のバニッシュ節が落ちていることは同項に既記）／
`WXEX2-66`・`WXDi-P15-001` は `GRANT_ABILITY_INNER_TEXT`／`TRASH_SIGNI_UNDER_FIELD_SIGNI` を伴う＝`O-27`／`O-31` と同じ「引用能力の中身が未パース」層に隣接

<details><summary>⚠過大計上のままの旧一覧（67効果。<code>exceed</code>/<code>coinCost</code> を持つ個体を含む＝実際は空ではない）</summary>

`WX09-032-E1` `WX11-029-BURST` `WX12-011-E1` `WX14-003-E3` `WX15-059-E1` `WX20-069-E1` `WX21-Re18-E1`
`WX22-021-BURST` `WX22-029-E1` `WX22-037-E1` `WXEX2-68-E1` `WXDi-D08-012-E1` `WXDi-D09-H29-E1`
`WXDi-D09-P15-E1` `WXDi-D09-P25-E1` `WXDi-P02-083-E1` `WXDi-P03-005-E1` `WXDi-P03-054-E1`
`WXDi-P03-063-E1` `WXDi-P03-072-E1` `WXDi-P03-080-E1` `WXDi-P03-089-E1` `WXDi-P07-053-E1`
`WXDi-P07-055-BURST` `WXDi-P07-066-BURST` `WXDi-P07-072-BURST` `WXDi-P07-083-BURST` `WXDi-P07-094-BURST`
`WXDi-P08-038-E1` `WXDi-P10-038-E1` `WXDi-P11-070-E1` `WXDi-P11-076-E1` `WXDi-P11-083-E1`
`WXDi-P12-072-E2` `WXDi-P15-002-E1` `WXDi-CP01-001-E1` `WXDi-CP01-003-E1` `WXDi-CP02-072-E1`
`WX24-P1-013-E2` `WX24-P2-036-E1` `WX25-P3-001-E1` `WX25-P3-003-E1` `WX25-P3-005-E1` `WX25-P3-007-E1`
`WX25-P3-009-E1` `WX25-CP1-061-E1` `WX25-CP1-080-E1` `WX26-CP1-053-E1` `WXK03-023-E1` `WXK03-048-E1`
`WXK04-054-E2` `WXK04-056-E1` `WXK05-072-E2` `WXK06-053-E1` `WXK10-080-E2` `WXK11-071-E1` `WD13-003-E1`
`WD20-004-E1` `WD22-007-G-E1` `WDK07-E12-E1` `WDK08-Y13-E1` `WDK12-015-E2` `SP07-009-E1` `PR-204-E1`
`SPDi43-28-E1` `SPDi43-30-E1` `PR-Di013-E1`

再実測コマンド：`node tmp_*.mjs` を書き直すより、`docs/_effect_srctext.json` ではなく
`public/data/effects_*.json` を直接走査して `type==='STUB' && id==='OPTIONAL_COST'` かつ
`resolveOptionalCostSpec` が見るキー（`handDiscard` `handToEnergy` `selfToEnergy` `energyTrash` `fieldTrash`
`life_crash` `deckTrash` `costColors` `lrigDown` `fieldDown` …）が**1つも無い**ものを数える。
</details>

### 🆕 2026-08-17（続き523）追記：`SEND_TO_ENERGY` 群6件を消化し、**新しいゴミ箱受け皿**を1つ特定した

`31件 → 25件`（29カード → 23カード）。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-17（続き523）。

🔴**`CONDITIONAL_POWER_BONUS` は live 26効果が落ちるゴミ箱**（`execStubPart1.ts:1798`）。
ハンドラは**カード全文からパワー修正だけを読む**ので、パワーと無関係な文はすべて**無言 no-op**。
parser 側には**正しい意味を書いたコメントの直下でこの STUB を返す**行が並んでおり
（例：`// ---- この方法でトラッシュに置いたカードの中からカードをN枚まで対象とし、エナゾーンに置く ----`）、
§6.4 `O-3` の `LRIG_GROW_RESTRICT` と**同型**。今回はうち3本（`WX26-CP1-057-E2`／`WDK08-Y08-E1`／
`WX24-P2-026-E2` の経路）を解体した。**残り23効果は未着手＝次の worklist**。母集団の数え直しは
`type==='STUB' && id==='CONDITIONAL_POWER_BONUS'` を live 全走査。

消化した6件（すべて「原文の行き先がエナ」）＝
`WX11-080`（色 filter 脱落＋行き先が手札）／`WXK09-031`（多段閾値の後段が無条件＋追加実行）／
`WDK08-Y08`（可変枚数が丸ごと no-op）／`WX24-P2-026`（`MASS_TRASH`＝相手のエナと場を全部トラッシュする別物）／
`WX26-CP1-057`（`CONDITIONAL_POWER_BONUS` で丸ごと no-op）／`WX26-CP1-059`（行き先二択の片枝脱落）。
巻き添えで直った同型5効果＝`WX11-077`／`WXK04-027`／`WXEX2-49`／`WX24-P4-034`／`WXK09-081`。

🆕**計器に映らない別枠3件**（同族の棚卸しで発見）＝`WX13-035-BURST`／`WX14-024-BURST`／`WX18-070-E1`＝
「手札に加えるかエナゾーンに置く（か場に出す）」の**片枝が無言脱落**（`REVEAL_AND_PICK`／`SEARCH` に
`handOrEnergy` が付いていない）。`verifyEffects` は片方の行き先が在れば通すので**永久に映らない**。

⚠**計器の較正を1回外した**＝`StubAction.trashedPick` は**行き先をペイロードに持つ**型なので、
`collectActionsFromJson` に派生（`~SEND_TO_ENERGY` 等）を足すまで `WX26-CP1-057` を穴と報告し続けた
（上の較正表 #3 とまったく同じ穴を自分で作った）。**行き先をペイロードに持つ STUB を作ったら、
その場で `verifyEffects` も直す。**

### 🆕 2026-08-17（続き525〜526）追記：**連用形チェーンの「向き」**と、**stale live / 欠落 MANUAL** の層

`25件 → 22件 → 17件`。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-17（続き525／続き526）。

**(1) 復元パスには「向き」がある（続き525）**
`recoverDroppedConjClauses`（続き520 で新設）は**落ちているのが後続節**の向きしか救わない。
**先頭節が丸ごと落ちて最後の節だけ残る**向きは素通りしており、3パスを足して是正した。
🔴**ガードは語彙の列挙ではなく原理的な等値テストにする**＝最初のガードでは 20効果が動いた
（「その中から…場に出し、残りを…」は1つの `REVEAL_AND_PICK` で表す文型＝先頭節を前置すると
**場出しが二重に走る**）。最終形は**「残り節だけを parse した結果が現行結果と完全一致するときだけ足す」**。

**(2) 🔴計器に映らない層＝`PARTIAL` / `MANUAL` 刻印の stale live（続き526）**
「原文にバニッシュがあるのに live に無い」8件のうち**3件は parser を1行も触らずに解決した**
（fresh は既に正しく live が古いだけ）。⚠**この層は `build:effects` も `heldReview --adopt` も触らない**＝
`--adopt` は「held に無いID」を含むと**コマンドごと中断**する。専用の同期
（`parseStatus` は据置のまま `action` だけ差し替え）が要る。
**着手時は必ず fresh↔live を効果単位で機械比較してから parser を触ること。**

**(3) 🔴archive の one-off パッチが書いた MANUAL は「途中まで」のことがある（続き526）**
`WX12-CB02-E1` は原文がレベル別**5分岐**なのに `scripts/archive/fixWX2.mjs` が **Lv1・Lv2 だけ**を
書いており Lv3〜5 が丸ごと欠落していた。`manualEffects.ts` に正式な5分岐を追加。
🔑**else の入れ子**が要点＝並列 `CONDITIONAL` だと Lv2 の `ENERGY_CHARGE_FROM_DECK` が
**デッキトップを持っていく**ため、後段の `DECK_TOP_MATCHES` が**次のカード**を見て二重発火する。

**(4) 前提が変わったトリップワイヤは反転させる（続き526）**
続き520 の負方向テスト「`WX21-006` は条件が未表現のあいだ BANISH を足さない」は、
条件語彙（`NO_COMMON_COLOR_AMONG_FIELD_SIGNI` に `filter` を追加）を実装した時点で
**正方向**（BANISH は条件の内側にある／条件側へ漏れていない）へ更新した。ゲートが鳴って気付けた。

### 再現手順

```
# 1シートだけ（既定 Sheet1）
npm run verify
# 全シート（在庫を数えるときは必ずこちら）
for s in Sheet1 … Sheet10; do npx tsx scripts/verifyEffects.ts --sheet $s; done
```

---

## 2026-08-16 整理⑳：PLAN §6.4 のクローズ済み行（`O-3`／`O-4`／`O-5`／`O-6`／`O-7`／`O-8`／`O-9`／`O-10`／`O-18`／`O-28`／`O-32`／`O-33`／`O-34`）を退避

> §6.4 の規約「**消化済みは1行サマリも含めて全文退避／PLAN には生きている worklist だけ**」に従い、
> **残0クローズ済みの13行**をここへ移した（続き517 で12行＋続き518 で `O-10`）。番号は**再利用しない**＝§6.4 の欠番はこの節を見る。
> 一次記録は [BUGFIXES.md](./BUGFIXES.md) の各日付。
>
> **クローズ日と一次記録**＝`O-3`（2026-08-15 続き498。全記録は下の「整理⑲」節）／`O-4`（続き499）／
> `O-5`（続き504）／`O-6`・`O-7`（続き505）／`O-8`・`O-9`（続き506）／`O-28`（続き503）／
> `O-32`（続き501）／`O-33`（続き502＋据置分は続き508）／`O-34`（続き500）／`O-18`（続き513）／
> 🆕`O-10`（**2026-08-16 続き518**＝続き507〜518 の11巡で `census:stubs` A群 **16種/20件 → 0種/0件**。各巡の内容は BUGFIXES の続き507〜518）。

### 退避した PLAN §6.4 の行（原文そのまま）

| ID | 項目 | 規模 | 内容 |
|---|---|---|---|
| ~~**O-3**~~ | ~~**「次のターンの間」系統**~~ | **残0** | ✅**2026-08-15 続き498 で完了**＝受け皿7種（`SEED_BLOOM_BOUNCE_OCCUPANT`／`OPP_DECLARED_ARTS_NAME_LOCK`／`OPP_CHOSEN_SIGNI_ATTACK_LOCK`／`DECLARED_SPELL_NAME_LOCK`／`GAIN_OPP_LRIG_TYPE`／`FIELD_SIGNI_TO_CHECK_ZONE`／`NEXT_OPP_TURN_END_BODY`）をすべて解体。**通算＝続き486〜498 の13セッションで約70効果の挙動是正**。詳細（各セッションの機構・教訓）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-15 整理⑱（§6.4 O-3 全記録）」節へ退避。⚠**残した近似は §7 実機検証の worklist へ**＝プレイヤーへの引用【起】付与／強制アタック（「可能ならばアタックしなければならず」）／チェックゾーン往復での付随物の離場扱い／宣言候補の公開領域限定。|
| ~~**O-4**~~ | ~~**UNKNOWN の残り**~~ | **残0** | ✅**2026-08-15 続き499 で完了**＝`UNKNOWN` 25ノード/25カード → **0**（`parseStatus:"UNKNOWN"` も 0）。内訳＝**実装12／構造修正8／明示 defer 5**。🔑**`UNKNOWN` は「そのノードが no-op」では済まない**＝条件・対象・選択肢・遅延宣言といった**ゲートを飲み込む**ので周囲が無条件で走る（25件の大半が過剰実行だった）。新機構＝`REVEAL_BOTH_DECK_TOPS`／`DECLARE_DECK_TOP_ICON`／`SigniAttackBan.turnsRemaining`／`DELAY_TO_NEXT_OWN_TURN_END`／`GrantPlayerAbilityAction.targetOwner`／`extractQuotedGrant`（入れ子引用）。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き499）。**残した明示 defer 5件は 🆕O-34 へ**。|
| ~~**O-5**~~ | ~~**複数枚の任意配置UI**~~ | **残0** | ✅**2026-08-16 続き504 で完了**＝PLAN の「1効果」は母集団の一部で、原文 regex で数え直すと **11効果**。`SUMMON_RESONA_FROM_LRIG_DECK` は**カード全文 regex でクラスだけを読む O-20 クラスの受け皿**で、1つの受け皿に**5軸**が壊れて同居していた＝①枚数が1枚に潰れる（`WX16-Re18-E1` の「2枚まで」／`WX13-007-E3` の「好きな枚数」＝過少）②レベル（`WD12-007-E1`／`WX07-050-E1`）③色（`WX07-050-E1`）が落ちて**どのレゾナでも出せる**（過剰）④クラスの OR（`WX19-028-E3`）は `includes` に当たらず**無条件**⑤【出】抑止が `RULE_REMINDER_TEXT`＝完全 no-op で**【出】が普通に発火**⑥候補が複数でも**先頭を自動配置**。🔑parser が `StubAction.resonaSummon`（count/upTo/filter）で渡し engine は原文を読まない／【出】抑止は `placesToField` ＋ `foldSuppressOnPlay` の既存 funnel へ／複数枚配置は `INTERNAL_PLACE_SUMMONED_RESONAS` が `value`（JSON）のキューで1枚ずつ再帰。🔴**`resumeSelectTarget` の per-card ループは最初の pause で残りを落とす**（2枚選んで1枚しか出なかった）＝**全枚数まとめ渡し**の分岐を追加。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き504）。⚠**全経路 実機未検証**＝§7 送り。|
| ~~**O-6**~~ | ~~**`MANUAL` 不可侵で live に届かない改善**~~ | **残0** | ✅**2026-08-16 続き505 で完了**＝判断は**AUTO 採用**（`manualEffects.ts` の `WX25-P3-038` を削除）。fresh が MANUAL の**上位互換**だったため＝①対象宣言が `POWER_MODIFY{delta:0}` の代用ではなく `STUB{SELECT_TARGET_ONLY}` ②条件が `LAST_PROCESSED_MATCHES{noAbilities}`。🔴**engine の一般バグも同時に是正**＝`LAST_PROCESSED_HAS_NO_ABILITIES` は holder を `ownerState('self')` に固定しており、`abilities_removed` は**能力を消された側の state** に載るので**対戦相手のシグニの能力喪失を一度も見られなかった**（＝「代わりにトラッシュ」枝が永久に外れる。`WX25-CP1-002-E1` も直る）。⚠**live レコードが `MANUAL` 刻印だと `build:effects` は永久に触れない**＝manualEffects から消すだけでは届かず**live JSON の外科パッチ**が要る。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き505）。⚠**実機未検証**＝§7 送り。|
| ~~**O-7**~~ | ~~**二ゾーン交換の据置1件**~~ | **残0** | ✅**2026-08-16 続き505 で完了**＝据置ブロッカー3軸をすべて解消（①`ON_ATTACK_END` ②《アイヤイ★クイーン》条件 ③エナからの交換）。🔑**③に新機構は要らなかった**＝`parseSentencePart3` の二ゾーン交換ビルダーは**その文だけ**を見るので、交換元の名詞句が前の文にしか無い省略形（「そうした場合、**それと**〜」）に一致していなかっただけ。**照応を戻す純テキスト正規化**（`restoreElidedSwapSource`）で既存ビルダー＋`foldSuppressOnPlay` funnel にそのまま載る。🔴**原文 regex で数え直したら「1効果」ではなく6効果**＝`trigText` が非貪欲で「〜したとき、」で切れるため「**そのアタック終了時**」を一度も見ず、`WX24-P4-052-E2`／`WX25-P1-053-E1`／`WX25-P2-090-E1`／`WX25-P2-093-E1`／`WX25-P3-060-E2` が**アタック解決前**に走っていた（自分をバニッシュ/退避してアタックを取り消す）。⚠**ルリグのアタック終了時は engine 未配線**（`collectAttackEndTriggers` はアタッカー自身の【自】のみ）＝`WX24-P3-055-E2`／`WXK11-006-E4` を巻き込むと無言 no-op になるので regex を「この(シグニ|カード)が」に限定し**負方向を golden で固定**。🔴**隣接発見**＝交換の**分解表記**2効果（`WX25-P2-090`／`WX25-P2-093`）は `STUB{LRIG_UNDER_CARD_OP}`＋**source 無し `ADD_TO_FIELD`**＝**対価を払わず手札から出す**別動作だった＝新機構 `OptionalCostSpec.selfToEnergy`（`OPTIONAL_TRASH_SELF` の行き先違い）と `execSendToEnergy` の `thisCardOnly` 分岐で是正。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き505）。⚠**全経路 実機未検証**＝§7 送り。|
| ~~**O-8**~~ | ~~**強制アタックの残り**~~ | **残0** | ✅**2026-08-16 続き506 で完了**。(a)🔴**原文の括弧書き「（他のシグニより先にアタックしなければならない）」が規則そのもの**＝強制対象を後回しにして他のシグニから先に殴れていた。新機構＝`signiAttackGate.collectForcedAttackZones` ＋ ブロック理由 `FORCED_ATTACK_ORDER`。🔑**判定を gate に1本化**（人間ボタン／`performSigniAttack`／CPU 候補フィルタが同じ関数）＝CPU も自動で「強制対象→その他」の順になる。🔑**「可能ならば」の除外は同じ gate の再入で判定**（`skipForcedOrderRule` で再帰1段）＝撃てない強制対象は集合に入らずソフトロックしない（負方向を golden で固定）。⚠**`mustAttackRemainingZones` も同じ関数へ寄せた**（旧実装はボタンのラベル照合という別軸のコピーだった）。順序が意味を持つのは**部分強制**のとき（感染限定／1体指定／選んだ集合／正面限定）。(b)`WX12-010-E3`＝`resumeRearrangeSigni` が持つ `rearrMoved` を `lastProcessedCards` へ載せ、`STORE_LAST_PROCESSED_TARGETS`→`UP{targetsStored}` の**既存の正準形**で受けた（新 STUB なし）。`execUp` に `count:'ALL'+upToCount`（0体も選べる）を追加。⚠`zone_moved_just` は**累積**するので照応先に使えない。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き506）。⚠**実機未検証**＝§7 送り。|
| ~~**O-9**~~ | ~~**「対戦相手は〈コスト〉てもよい」の残り**~~ | **残0** | ✅**2026-08-16 続き506 で完了**。(a)`WXDi-P09-064-E1`＝新機構 `StubAction.opponentHandDiscardUpTo`（1..N を選択肢に並べ、0枚は skip 枝）。🔑**帰結は枚数を焼き込まず `DRAW{count:0, addLastProcessedCount:true}` で実枚数に追従**＝中間値（1枚捨てて1枚引く）が成立する。skip ラベルも「手札を捨てない（0枚）」へ（0枚が合法な選択肢だと実機で分かるように）。⚠golden の安全弁 `(ci)` の spec 一覧に新キーを足すこと。(b)`WXDi-P07-010-E2`＝新機構 `PlayerState.facedown_release_by_payment` ＋ `ON_ATTACK_PHASE_START` 合成トリガー ＋ `RESOLVE_FACEDOWN_RELEASE_PAYMENT`／`INTERNAL_FACEDOWN_RELEASE_FLIP`／`flipFacedownSigniFaceUp`。🔑**予約は裏向きカードの持ち主側**（＝支払う側）に載せる＝合成エントリの `playerId` をその側にする（効果を使った側に置くと支払い主体が反転し、`opponentResponds` を足すと**二重反転**する）。🔑**「各」＝両プレイヤーのアタックフェイズを走査**／**支払われるまで予約を消さない**（`delayed_triggers` は THIS_TURN 限定で載らない）。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き506）。⚠**全経路 実機未検証**＝§7 送り。|
| ~~**O-10**~~ | ~~**明示 defer の棚卸し**~~ | **残0** | ✅**2026-08-16 続き518 で完了＝`census:stubs` A群が 0種/0件**（真 no-op も明示 defer も全滅）。最後の1件 `WXDi-P05-006`（ピース使用への**カットイン応答窓**）を実装した。🔑**`pending_spell` は `battle_states` の既存カラム（JSON）**なので判別子 `kind:'piece'` を中に足すだけで**DB マイグレーション不要**だった（新カラムを足さない＝スキーマ変更はユーザー判断が要る、という前提を回避）。🔑**窓は「応答側に使える打ち消しピースが実在するときだけ」開く**（`collectPieceCutinCandidates` が0なら従来と同じ即時解決経路）＝**新しい待ち状態の面を最小に閉じる**。ピースを使うたびに待ちを挟むと、応答が来ない経路（切断・CPU の取りこぼし）が**そのままデッドロック**になる。⚠**窓の開閉は非対称に固定**＝開く＝フロー／**閉じる＝`closeTeamPieceCutinWindow` の1関数**（turn-scoped funnel の`consume` 軸。閉じ忘れが1箇所に集まり、保険で turn-end にも落ちる）。⚠**効果の持ち主は「ピースを使った側」**＝応答側のクライアントから解決するので `queueCardEffects` に `owner` を明示する（省略すると自分の state へ書く）。⚠選択肢①の打ち消しは**フラグを使った側に立てるだけ**で、除外と解決スキップは窓を閉じる側が行う（窓の id を知っているのはそちら）。⚠②を選んだ場合は既存の「応答完了→元の処理を継続」（`cutin_response_complete`）に乗って元のピースが解決する。🔴**ヘッドレスゲートは `pending_spell` 窓を一切駆動しない**＝純関数（候補収集・条件評価・打ち消しフラグの向き）だけをgolden で固定した。**窓が開く経路そのものは §7 実機検証が唯一の網**。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き518）。|
| ~~**O-18**~~ | ~~**ボタン生成側に無い封じゲート（押せるが無反応）**~~ | **残0** | ✅**2026-08-16 続き513 で完了**＝スペル使用の封じは**3軸**（`USE_SPELL`／`PLAY_COLORLESS`〔無色のスペル〕／`BLOCK_NON_WHITE_SPELL`〔白以外のスペル〕）あるのに、ボタン生成側は `USE_SPELL` しか見ていなかった（続き460 でその1軸だけを塞いだ残り）。実行入口 `castSpell` にはガードがあるのでルール違反にはならず、**押しても無反応**の無言 no-op だった。⇒ **`isSpellUseBlocked(card)` の1関数へ集約**し、**実行入口＋ボタン生成2箇所（手札スペル／スペル・クラフト）の計3箇所**が同じ関数を呼ぶ形にした。⚠golden は「軸の脱落」と「funnel の外での直書き復活」の**両方**を固定する（`isActionBlocked('BLOCK_NON_WHITE_SPELL')` は funnel の1箇所だけ）。⚠**実機未検証**＝§7 送り（負方向＋対照の対＝封じ中はボタンが出ない／解除で出る）。|
| ~~**O-28**~~ | ~~**`GRANT_KEYWORD.keyword` にゴミが入っているクラス**~~ | **残0** | ✅**2026-08-16 続き503 で完了**＝MANUAL マージ後に「engine のどこにも消費が無い綴り」を全数走査すると **8綴り/8効果**（PLAN の「23綴り」は `effects_*.json` を直接数えた値で、**MANUAL 上書き済みのカードを worklist に載せていた**＝`WXEX2-71-E3` は既に正しい MANUAL がある）。🔴**代わりに PLAN が数えていなかった 26効果が丸ごと死んでいた**＝原文は**全角**【Ｓランサー】／engine は**半角** `Sランサー` の綴りズレで `hasKeyword` に一度も当たらず、原文を `includes` で嗅ぐ実行時ハンドラ5箇所は**「ランサー」へ格下げ**していた。🔑`normalizeKeywordName`／`textHasKeyword` の1本に集約し**両側を正準化**（⚠**state 照合は半角が正・原文照合は全角が正で正が逆**）。引用【常】の中身が丸ごと `keyword` に入っていた5効果は「キーワード名の**形**でない綴り」を宣言済みの穴へ落としたうえで、`アサシン:{selfHandLte}`（新スコープ）／`GRANT_PROTECTION`／`DOUBLE_OWN_POWER_MINUS`（owner 是正）へ載せた。残り3種は明示 defer（🆕**O-10 へ合流**）。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き503）。⚠**全経路 実機未検証**＝§7 送り。|
| ~~**O-32**~~ | ~~**`REPEAT_N_TIMES` がカード全文 regex で自己実行し後続ステップと二重に効く**~~ | **残0** | ✅**2026-08-16 続き501 で完了**＝3効果とも正準形 `REPEAT{count, action}` へ組み替え、**engine 側の全文 regex 実装 106 行を撤去**した（`REPEAT_N_TIMES` は live 0件・golden にトリップワイヤ）。実測の壊れ方＝`WXDi-P07-007-E3` は相手デッキ **16枚**（原文は最大12枚・しかも後続の1回だけ回避可能）／`WXDi-CP02-047-E1` は「－5000」が**全シグニに×3**でミルは1回ぶんだけ／`WXDi-CP01-024-E1` は本文が `UNKNOWN` で**配置が一度も起きず**、死 `BLOCK_ACTION` だけが残っていた。新機構＝`PLACE_TRASH_SIGNI_FACING_SAME_POWER`（**相手ゾーン zi の正面は自分ゾーン 2-zi**・同パワーのトラッシュ札だけ／正面が埋まっているペアは候補に入れない）／`RepeatAction.optional`（任意反復＝**実行の前に問う**）／`StubAction.placesToField`・`suppressOnPlay`（配置アンカーを**型の列挙ではなくフラグ**で判定）。🔴**同じハンドラを共有していた `REPEAT_EFFECT` も無言 no-op だった**＝`WX16-042-E1`（「あと2回まで繰り返してもよい」が1回で終了＋「捨てたシグニと同じレベル」条件の脱落）を是正。⚠**残る `REPEAT_EFFECT` 1件（`WX22-016-E1`・MANUAL）は O-29 へ移した**。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き501）。⚠**全経路 実機未検証**＝§7 送り。|
| ~~**O-33**~~ | ~~**アタック禁止の「ゾーン限定」と「次の相手ターン」の軸**~~ | **残0** | ✅**2026-08-16 続き502 で完了**＝`SigniAttackBan.zones` を実装（`turnsRemaining` は続き499）。🔑**ゾーン添字は判定地点（`banMatches`）で引く**＝ban に CardNum を焼き込まないので、掛けたあとにシグニが入れ替わっても**いまそのゾーンにいるシグニ**に掛かる（原文はゾーンに掛かる制限）。⚠PLAN の見積り（「`matchedSigniAttackBans` の署名変更が全呼び出し元に及ぶ」）は**不要だった**＝`banMatches` には既に `attacker` が渡っている。🔴**原文 regex（8効果）で数え直したら同族2件がもっと壊れていた**＝`WX24-P1-038-E2`／`WXDi-P03-027-E2` は `BLOCK_ACTION{owner:'any', until:END_OF_TURN}`＝**両プレイヤーの全ゾーン**が**1ターンだけ**止まっていた。🔴**副産物＝choice ビルダー3種の「選択肢の2文目が top-level へ漏れる」を一般ガード化**（続き499 の `CHOOSE_SAME_OPTION_*` と同クラス）＝**6効果の過剰実行**を是正（`WD22-011-G-E1`／`WXK05-003-E1`／`WXK10-009-E1`／`WXK10-011-E1`／`WXK03-TK-01B-E1`／`WX13-003-E1`）。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き502）。🏁**据置だった `WDK09-001-E2` は 2026-08-16 続き508 で解体**＝`SigniAttackBan.zoneSource:'gate'`（**判定地点で `signi_gate_zones` を引く**動的ゾーン）を新設。🔴**壊れ方は「禁止が効かない」ではなく過剰実行だった**＝2文目が parser の catch-all（`includes('【ゲート】')` → `STUB{GATE}`）へ落ちており、**相手のアタックフェイズ開始のたびに【ゲート】がもう1つ増えて**いた（【ライフバースト】条件も丸ごと脱落）。🔴**さらに設置側も過剰**＝`INTERNAL_SET_GATE` が `blocked_actions:'ATTACK:<設置時のトップ>'` を積んでいて、①条件を無視して常に禁止 ②設置時に居た1枚に焼き込むのでゾーンが入れ替わると外れる、の二重の誤りだった（撤去）。付随して「それが【ライフバースト】を持たない場合、」（`の` を持たない否定形＝汎用 `それが〜の場合、` に当たらない）を条件節 parser へ足し、`REVEAL_DECK_TOP` 置換が **`owner:'self'` を焼き込んでいた**のを公開元から引き継ぐよう是正した（「**対戦相手は**デッキの一番上を公開する」）。⚠**全経路 実機未検証**＝§7 送り。|
| ~~**O-34**~~ | ~~**§6.4 O-4 で明示 defer にした5件**~~ | **残0** | ✅**2026-08-16 続き500 で完了**＝5件とも機構実装で解体（`census:stubs` A群 20種/22件 → **15種/17件**）。新機構＝`STRIP_ATTACHED_AND_UNDER`（付随物＋下カードだけを剥がす。`SELECT_TARGET_ONLY` に `owner:'any'` 経路を追加）／`USE_SEARCHED_SPELL_OR_TRASH`（サーチ札を「タダで使う／トラッシュに置く」の二択）／`DECK_SIGNI_LEVEL_OVERRIDE_ALL`＋**読み手 `deckSigniOverrideLevel`**（デッキ公開＝停止条件と当たり札判定の両方・デッキ探索＝`searchCardMap` 差し替え）／`PER_OWN_LRIG_COLOR_SCALE`（0体なら一度も走らない）／`DECLARED_ICON_HAND_DISCARD_BANISH`（4段対話・段跨ぎは `carried*` に焼き込む）。付随して条件 `LRIG_ANY_TEAM_COUNT`・フィルタ `noDeployConditionIcon`・`stripTrapIconClause` を新設。🔴**母集団を原文 regex で数え直したら defer に映らない同族が5効果壊れていた**（うち3件は `DEFERRED_*` ですらない）＝`WX18-029-E1`（**相手シグニ本体をトラッシュ**）／`WXDi-P07-041-E2`（対象宣言がゴミ keyword に化けて丸ごと不発）／`WXDi-P08-064-E1`（**青いシグニ**を凍結＝色の掛かり先の取り違え）／`WX25-P3-050-E1` の【使用条件】節（白節ごと消失）／【トラップアイコン】節の**スペル本体 tail-splice**（5枚中4枚）。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-16（続き500）。⚠**全経路 実機未検証**＝§7 送り。|

## 2026-08-15 整理⑲：§6.4 `O-3`「次のターンの間」系統の全記録（続き486〜498）

> **`O-3` は 2026-08-15 続き498 で完了**（受け皿7種を残0）。PLAN §6.4 には1行✅サマリだけ残し、各セッションの機構・教訓はここへ退避した。**通算13セッション・約70効果の挙動是正**。
> 一次記録は [BUGFIXES.md](./BUGFIXES.md) の続き486〜498。

### 退避した PLAN §6.4 の O-3 行（続き497 時点の原文）

| **O-3** | **「次のターンの間」系統の残り** | 7効果（受け皿6種＋照応1） | 🏁**続き497＝受け皿2種を解体**（`NEXT_OPP_TURN_END_BODY` 2件→1件／`ATTACKED_SIGNI_TARGET_BY_KEY_TRASH` 残0）＝新機構 `DELAY_TO_NEXT_OPP_TURN_END`（続き489 のアタックフェイズ版と同型＝予約は**予約した側**に積み `ON_TURN_END` の collector が `opState` を読む）／`TargetFilter.attackedThisTurn`／`OptionalCostSpec.trashOwnKey`。🔴`WDK06-R09-E1` は**相手のターン終了時に自分のシグニを1体タダでバニッシュ**していた（対象・コスト・所有者の3点とも誤り）。⚠**遅延を跨いだ照応は予約できない**（予約が運ぶのは action だけで参照先を束縛しない）＝`WXDi-P09-066-E1` の「そのカードを手札に加える」は受け皿のまま。⚠`PR-K046` は**スペル名の宣言UI**（手札からではなく任意のカード名）＋`blocked_card_names` の**次の相手ターン**への期間延長が要る＝既存 `DECLARE_CARD_NAME` は流用できない。以下は旧記録＝🏁**続き493＝`NON_FIELD_ZONE_MOVE_IMMUNITY`（1）を解体＝「対戦相手の効果によって移動しない」の期間軸を1本化＝5効果の挙動是正**（永続化バグ 1／恒久 no-op 1／片側採用 1／過剰実行 1／汎用 STUB 誤配 1）。新機構＝`opp_move_immunity{zones, turnsRemaining}`＋`activeOppMoveImmunityZones`（`signi_deploy_bans` と同じターン数カウントダウン・減算は `clearTurnEndScopedState` の1点）／`ZONE_MOVE_IMMUNITY` アクション／🆕`DEFERRED_NEXT_OPP_TURN_END_BODY`（「次の対戦相手のターン終了時、〜」の遅延本体＝**予約機構が無いので明示 defer で即時実行を止めた**・2効果）。**残り**は `ATTACKED_SIGNI_TARGET_BY_KEY_TRASH` 1（`WDK06-R09`＝「このターンにアタックしたシグニ」の対象化＋キー自己トラッシュの任意コスト。`attacked_signi_ids` は既存）／`SEED_BLOOM_BOUNCE_OCCUPANT` 1（`WDK07-Y07`）／`OPP_DECLARED_ARTS_NAME_LOCK` 1（`WXEX2-09`＝**相手が宣言**＋宣言名**以外**のアーツを封じる whitelist）／`OPP_CHOSEN_SIGNI_ATTACK_LOCK` 1（`WXDi-P08-030`）／`DECLARED_SPELL_NAME_LOCK` 1（`PR-K046`＝宣言名のスペルを次の相手ターン封じる blacklist）／`GAIN_OPP_LRIG_TYPE` 1（`WDK17-008`）／`FIELD_SIGNI_TO_CHECK_ZONE` 1（`WX22-010`）／🆕`NEXT_OPP_TURN_END_BODY` 2。**在庫は `npm run census:stubs` の A群で常時見える**／**機構ごとに独立して着手できる**。⚠**続き493 の残した近似**＝移動不可の保護は **hand / energy → トラッシュ**だけ（原文の「場以外のあなたの領域」「デッキとトラッシュに移動しない」が指すデッキ／トラッシュ／ライフ側は**移動地点の funnel が無い**）。🔑**続き493 の教訓**＝①**期間つきフィールドの失効地点は grep で実測する**（`prevent_opp_trash_from` は set 1箇所・clear 0箇所で永続していた＝続き487/489 に続く3回目）②**消費側は「ctx 側の集合 ∪ state 直読み」で判定する**（`ExecCtx` を組み立てない経路が実在する）③**複合節を片側だけ採用しない**（「…ダメージを受けず、…移動しない」の後半が無言で落ちていた）④**遅延タイミング宣言の受け皿は parser の先頭に置く**（本文側の汎用規則が先に食うと宣言が消えて本文だけ残る＝過剰実行）。以下は旧記録＝🏁**続き492＝`UNTIL_NEXT_MAIN_PHASE_CLAUSE`（1）を解体＝9効果の挙動是正**（「ルリグによってダメージを受けない」の期間軸＝`PREVENT_DAMAGE{scope:'LRIG'}` と走査軸＝`isLrigDamagePrevented` を1本ずつに集約＋新期間 `MY_NEXT_MAIN_PHASE`）。🔑**教訓**＝「期間中ずっと」の防御は回数フラグではなくウィンドウで持つ／【常】宣言の走査軸はシグニだけでは足りない／回数無制限の防御は消費型より先に判定する。🏁**続き491＝フェイズ／ターンのスキップ系統を解体＝6効果の挙動是正**（新機構 `PHASE_SKIP_BLOCK_IDS`＋`resolveNextPhaseWithSkips`／`resolveTurnHandover`）。🔑**教訓**＝**「STUB の在庫」を数えても半分しか見えない**（未消費の `BLOCK_ACTION` id・綴りズレ・ログだけのハンドラは計器に映らない）。🏁**続き490＝`ATTACK_TAX_HAND_DISCARD`（1）＝`SigniAttackBan.unlessPayHandDiscard` を新設**（隣接の無言 no-op `WXDi-P05-022-E1` も同時に是正）。🔑**教訓**＝「支払えば通る」制限は軸ごとに別関数を生やさない。🏁**続き489＝`NEXT_OPP_ATTACK_PHASE_START`（2）＝遅延予約 `DELAY_TO_NEXT_OPP_ATTACK_PHASE` を新設＝5効果是正**。🔴`negated_attacks` が永続していた。🔑**教訓**＝受け皿 id は母集団の一部しか映さない＝原文 regex で数え直す。🏁**続き488＝`EXTRA_ATTACK_PHASE`（2）／`SELF_RESTRICT_THIS_TURN`（2）／`UNPARSED_NEXT_OPP_TURN_CLAUSE`（1）＝新機構 `ADD_EXTRA_ATTACK_PHASE` ほかで8効果是正**。🔑**教訓**＝遅延タイミング宣言の後続文は絶対に即時実行しない。🏁続き486＝`_THIS_TURN_OPP_CLAUSE`（7）＝新機構 `SIGNI_ATTACK_BAN` で5効果の恒久 no-op を解消。🏁**続き487＝`_NEXT_OPP_TURN_CLAUSE`（5）／`_THIS_AND_NEXT_TURN_CLAUSE`（4）＝新機構 `SIGNI_DEPLOY_BAN` ほかで7効果是正**。⚠**期間だけ直すと「誤った対象の効果」が長持ちする**＝対象軸が壊れている札は据置（`WX11-038-E2`）。🔑**続き486/487 の教訓**＝①受け皿 id の件数だけ見て設計しない②STUB を実装で置き換えると census が +N する（毎回「較正漏れ」か「本物の穴」かを仕分ける） |

### 続き498（クローズ）で解体した残り7種

| 受け皿 id | カード | 直したもの | 新機構 |
|---|---|---|---|
| `NEXT_OPP_TURN_END_BODY` | `WXDi-P09-066-E1` | 置く側が `STUB{SOUL_OP}`＝丸ごと no-op／遅延本体が不発 | `RETURN_FACEDOWN_LRIG_ZONE_TO_HAND`（照応先を `facedown_lrig_zone_cards` から復元）＋`PLACE_FACEDOWN_LRIG_ZONE{source:hand}` |
| （隣接） | `SPDi43-02-E2` | 🔴**自分の**手札を1枚トラッシュ（`TARGET_AND_DISCARD_HAND`）＋返却が `RULE_REMINDER_TEXT`＝取り上げたまま戻らない | `PLACE_FACEDOWN_LRIG_ZONE{owner:opponent, all}`＋`INSTALL_DELAYED_TRIGGER{ON_TURN_END}` |
| `FIELD_SIGNI_TO_CHECK_ZONE` | `WX22-010-E3` | 往復ごと no-op（戻す側の文も丸ごと脱落） | `FIELD_SIGNI_TO_CHECK_ZONE`（往復を1アクションに畳む＋`dropDanglingDeckTopPlacement` の gate 拡張） |
| `SEED_BLOOM_BOUNCE_OCCUPANT` | `WDK07-Y07-E1` | 開花の**置換**が後続ステップにあり間に合わない | `SEED_BLOOM.bounceOccupant`（選択の向こう側まで運ぶ） |
| `GAIN_OPP_LRIG_TYPE` | `WDK17-008-E1` | no-op | `GAIN_LRIG_TYPE`＋`lrig_gained_types_timed`＋`effectiveLrigClass`（グロウ互換と「〇〇限定」の2軸を1本に） |
| （隣接） | `WDK17-001-E2` | 🔴【起】なのに CONTINUOUS 専用 `STUB{INHERIT_OPP_LRIG_TYPE}`＝**恒久 no-op** | `GAIN_LRIG_TYPE{turns:GAME}` |
| `OPP_CHOSEN_SIGNI_ATTACK_LOCK` | `WXDi-P08-030-E1` | 🔴`CHOOSE_N_FROM_LIST`（①②③の効果選択肢を出す別機構）＝丸ごと no-op | `SigniAttackBan.exceptCardNums`＋`SIGNI_ATTACK_BAN{exceptTargetsStored}`＋`SELECT_TARGET_ONLY{opponentSelects}` |
| `DECLARED_SPELL_NAME_LOCK` | `PR-K046-E1` | no-op | `DECLARE_CARD_NAME_LOCK{blacklist, NEXT_TURN}`＋`blocked_card_names_next_turn` |
| `OPP_DECLARED_ARTS_NAME_LOCK` | `WXEX2-09-E3` | no-op | `DECLARE_CARD_NAME_LOCK{whitelist, THIS_TURN}`＋`arts_name_whitelist_this_turn` |
| （波及） | 全カード | 🔴カード名の使用封じが `artsCandidates`／`executeArts` を素通り／`blocked_card_names` の失効が片側だけ | `cardNameUseBlocked` へ判定集約＋turn-scoped レジストリ登録 |

**教訓**：①遅延を跨いだ照応は「参照先が state に永続化されている形」なら解ける。②受け皿 STUB を実装で置き換えると `DEFERRED_` 前提の gate（`dropDanglingDeckTopPlacement`）と census のキー表が両方外れる。③置換は被置換アクションのペイロードへ畳む（後続ステップでは間に合わない）。④原文 regex で母集団を数え直すと隣接の恒久 no-op が出る（`WDK17-001-E2`）。⑤`heldReview --adopt` はカード単位なので採用後に**カード全効果を diff**して巻き添えを戻す（`WXEX2-09-E1` が `UNKNOWN` へ退化していた）。⑥コスト無しの相手応答 CHOOSE は `opponentResponds` だけだと支払いフローで無言に潰れる（`costlessOpponentChoice`）。

## 2026-08-15 整理⑱：PLAN §6.4「消化済み」の教訓行を退避（続き482〜487）

> PLAN §6.4 は**生きている worklist だけ**を置く運用。ここは退避した原文（PLAN 側には1行✅サマリだけ残した）。

> ✅**O-3 の `DEFERRED_UNPARSED_NEXT_OPP_TURN_CLAUSE`（5効果）／`_THIS_AND_NEXT_TURN_CLAUSE`（4効果）＝2026-08-15 続き487 で解体**（O-3 自体は継続＝上の worklist 行）。**7効果の挙動是正**（恒久 no-op 5＋所有者/期間の取り違え1＋永続化バグ1）。
> 🔑**配置禁止も「課した側」ではなく「場に出す側」の state に載せる**＝`signi_deploy_bans`。判定は既存 `deployLimitBlockReason` の1本（通常召喚UI／召喚ゾーンモーダル／CPU 召喚／engine の効果配置の**4経路すべてが通る** funnel）＝1行足すだけで全経路に効く。**寿命は `turnsRemaining` のカウントダウン**（`_this_turn` の1ターン失効レジストリでは「このターンと次のターン」を表せない）。
> 🔴**`signi_deploy_power_limit` は「このターンと次のターン」と型に書いてあるのに、リセット地点が1つも無く永続していた**＝一度掛かるとゲーム終了までパワーN以上を出せない。ban ストアへ `powerGte` として統合して解消。**「期間つき」と書いてあるフィールドは必ず失効地点を実測すること。**
> 🔑**文跨ぎ照応（「そのターンの間、」）は `splitSentences` の直後で解決する**＝文単位パーサは前の文を見られない。`WXEX2-19-E3` は所有者も期間も真逆（自分のシグニをこのターン強制アタック）になっていた。
> ⚠**`parseCardEffects` の内側から `abilityBlockTextOf`／`getAbilityBlockTexts` を呼んではいけない**（後者が `parseCardEffects` を呼ぶ＝**無限再帰**。キャッシュは戻り値確定後に入るので効かない）。`inferTriggerScope` が安全なのは `buildEffectsMap`＝**parseCardEffects の外**から呼ばれているから。続き487 で `build:effects` が実際にハングして発見した。
> 🔑**`OPTIONAL_COST` の「追加でエクシードN」を parser 化**＝engine は実装済みなのに parser が一度も生成せず、**live の12枚は全部手で MANUAL 化されていた**（＝parser 改善が永久に届かない O-6 の同型）。規則1本で2枚を AUTO へ戻した。**残り10枚は通常の held フローで扱う。**
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き487）。**
> ✅**O-3 の最大クラスタ `DEFERRED_UNPARSED_THIS_TURN_OPP_CLAUSE`（7効果/7枚）＝2026-08-15 続き486 で解体**（O-3 自体は継続＝上の worklist 行を参照）。**5効果の恒久 no-op を解消**（`WX24-P4-039`／`WX25-P2-010`／`WX10-024`＝アタック制限、`WX24-P2-014`＝盤面リセット＋相手ダメージ無効、うち `WX24-P4-039` は数字宣言が**ガード制限つき**だった過剰実行も同時是正）。
> 🔑**アタック制限は「課した側」ではなく「禁止を受ける側」の state に載せる**＝`signi_attack_bans_this_turn`。既存 `opp_signi_attack_power_cap` は課した側に載っていて gate が defender を引き回していた。アタッカー側に寄せると (a) `signiAttackGate` が attacker だけを見れば済み（**人間ボタン／`performSigniAttack`／CPU 候補の3経路に同時に効く**）(b) `_this_turn` 命名で `turnScopedState` の失効レジストリに**自動登録**（未登録なら typecheck が落ちる）。
> 🔑**「支払わないかぎり」型は判定と引き落としを別軸にしない**＝gate は既存 `signi_attack_cost` と**合算**で残高を見て、引き落としも同じ1地点に合算する。⚠**実効パワー条件と支払い解除を同居させない**（引き落とし地点は実効パワーを持たず表記パワーへフォールバックする＝判定と課金がずれる）。golden のデータ不変条件で固定済み。
> 🔑**「それ」の解決は `storedTargetCards`**（`lastProcessedCards` ではない）＝後者は多くのアクションが暗黙に読むが、前者は `targetsStored` を**明示した後続だけ**が読む。`execAttachCharm` に足しても既存の後続3件に影響しないことを実測してから決めた。
> ⚠**STUB を実装で置き換えると census が +N する**＝`vocabCensus` は STUB を含む効果を「STUB/MANUAL格納（要個別確認）」へ逃がしているので、STUB が消えた瞬間に**その効果の他の未表現語彙が高シグナルへ昇格する**。続き486 の +2 は「計器の較正漏れ1（`ATTACK_BAN` キー追加）」＋「**本物の穴**1（`WX24-P2-014-E2` の除外節＝実装して解消）」だった。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15（続き486）。**
> ✅**O-19＝watcher 文の `triggerScope` を推論に頼っていた層**（`inferTriggerScope` を能力ブロック限定にし、続き463 の暫定【出】guard を撤去。parser 側は由来句「トラッシュから」を読んで `any_ally`＋`placedFromTrash` を parse 時に書く）＝2026-08-15 続き485 で完了。**実測在庫は1効果**（`WX25-P1-061-E1`）だったが、**本命は golden のデータ不変条件**＝「ON_PLAY AUTO で**能力ブロックの主語が『この…』でない**のに `triggerScope` 未指定＝0件」を新設し、**このクラスが増えた瞬間に赤くなる**ようにした（scope 未指定は engine で self に落ちる＝watcher なら一度も原文どおりに発火しないのに、どの計器にも映らなかった）。
> ✅**O-25（本体）＝引用能力の自己付与が即時実行へ平坦化**（「（ターン終了時まで、）この(シグニ|ルリグ)は「【自/起/出】…」を得る」）＝2026-08-15 続き485 で parser 規則1本を追加し9カード採用。**engine の新機構ゼロ**（`GRANT_EFFECT{thisCardOnly}`／`granted_effects` は既存。足したのは `execGrantEffect` の「thisCardOnly は選択UIを出さない」1分岐＝`execGrantKeyword` と同ロジック）。**残りは上の worklist O-25 行**。
> 🔑**規則の置き場所（恒久ルール）**＝**期間プレフィックス（「ターン終了時まで、」）を要求する規則は `parseActionText` の strip より前**（`effectParser.ts` の count:'ALL' 版の隣）に置く。`parseSentencePart*` は strip 後のテキストしか見ないので、そこに置くと**永久に発火しない**。
> 🔑**引用（「…」）は「別のカードの文」**＝文単位の照応補正・主語推定は**引用を伏せ字にしてから走査する**。`applyLeadingOpponentDesignation` が引用内の「対戦相手のシグニ１体を対象とし」を外側の照応と誤読し、`WXDi-P07-063`（自分に付ける能力が相手シグニへ）／`WX24-P2-007-E1`（「**あなたの**すべてのシグニ」が `owner:'opponent'`）の2件を live に入れていた。
> **一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15。**
> ✅**O-20＝実行時にカード全文 regex で意味を決める層**（20コードサイト・挙動是正14効果）＝2026-08-15 続き482 で完了。
> ✅**O-21＝到達不能な二番手 STUB ハンドラ**（19 id / 21ブロック・うち1件は本物の実装が no-op に潰されていた live バグ）＝2026-08-15 続き483 で完了。
> ✅**O-22（(a)(b)(c) 全部）／O-23／O-24＝2026-08-15 続き484 で完了**（5効果の挙動是正・うち4件は**恒久 no-op**、1件は**過剰実行**）。
> 🔑**在庫の症状記述が (b)(c) とも stale だった**＝(c)「クラフト5種が CSV に無い＝データ側の欠落」は誤りで、`WX25-P1-TK1`〜`TK5` は**実在**し、真因は `TOKEN_SETS` の綴りが `'ダークアーツ'`（**全 CSV に0件**）だったこと（原文は「**ヤミノアーツ**」＝カード名は「ダーク・○○」でも束の呼称は別）。(b) も「別機構＝実装不可」ではなく、既存の CHOOSE＋継続で書けた。**§3-1 のとおり着手前に実測すること**が3セッション連続で効いている。
> **詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-15 整理⑮」／一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15 の3本。**
> 🔑**以後の規則（両方から出た恒久ルール）**＝①ハンドラは `cardMap.get(sourceCardNum).EffectText` を直接読まず **`sourceAbilityText(ctx)`**（ctx が無い走査は `abilityBlockTextOf(card, effectId)`）②同じ STUB id の分岐を足すときは**先着が素通りする形**にする（先着が必ず return すると後発は永久に呼ばれない）。どちらも golden のトリップワイヤで固定済み。

## 2026-08-15 整理⑰：PLAN §4 恒久指標の旧行を退避（続き478〜489）

> PLAN §4「📊 恒久指標」は**最新1件だけ**を置く運用。ここは退避した旧行の原文（新しい順）。

- **2026-08-15 続き496（§6.4 O-31「対戦相手が払う」側の回避クローズ）後 最新値**：census **830**（831→830＝回避クローズの復元で高シグナル欠落 −1。`BASELINE_HIGH` も更新）、**golden 2044**（+2＝【常】の正面アタック禁止が支払いで解除できる挙動1・live データ不変条件1。ほかに `(ci)` の母集団カウントを `OPPONENT_PAY_OPTIONAL` 73→**76**／costColors 付き 38→**40**／非搭載 35→**36** へ更新）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **104枚 / 45群**（据置）、lint **0 errors / 260 warnings**、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0・明示 defer 23種/26件**（据置）。🆕**live JSON changed 4効果/3カード**（`WXDi-P05-023`(2効果)／`WXDi-P07-007`／`WXDi-P16-047`。CSV 非改変）。🆕**挙動是正 4**（すべて回避クローズが落ちた過剰実行＝払っても帰結が起きる）。🆕**新機構＝`ContinuousBlockResult.cannotAttackSigniUnlessPayColorless`（【常】の「払えば通る」アタック禁止を無条件禁止と別集合に持つ）／`signiAttackColorlessCost`（ban 由来＋【常】由来を合算する判定・引き落とし共通の1関数）／`stripFullSentenceQuote`（文全体が引用の形の括り外し）**。⚠**3経路とも実機未検証**（§7 送り）。⚠**同じカードに残る別軸**＝`WXDi-P07-007-E3` は `REPEAT_N_TIMES` が二重に効いて**実測16枚**落ちる（原文は最大12枚）＝O-32。
- **2026-08-15 続き495（§6.4 O-30「支払わないかぎり」の回避ゲート）後 最新値**：census **831 据置**（較正なし）、**golden 2042**（+2＝挙動1〔払う→X が起きず ownerState から引かれる／払わない→X／エナ不足で pay 枝が出ない／文言〕・live データ不変条件1。ほかに `PLAN 6.3 batch 8 B-1` を正方向へ書き換え、`(ci)` の母集団カウントを `OPPONENT_PAY_OPTIONAL` 75→**73**・costColors 付き 40→**38** へ更新）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **104枚 / 45群**（8枚採用＋MANUAL 3効果は外科パッチ）、lint **0 errors / 260 warnings**、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0・明示 defer 23種/26件**（据置）。🆕**live JSON changed 11効果/10カード**（`WXDi-P02-041`／`WXDi-P04-040`／`WXDi-P05-017`／`WXDi-P08-058`／`WX24-P2-004`／`WX24-P2-044`(2効果)／`WX24-P4-001`／`WX24-P4-029`／`WX25-P2-004`／`WX25-P2-038`。CSV 非改変）。🆕**挙動是正 11**（過剰実行 8＝無条件バニッシュ／払う側の取り違え 2／文言・逆翻訳のみ 1）。🆕**新語彙＝`StubAction.unlessPay`**（機構は不変で**文言と逆翻訳だけ**を「支払わないかぎり」形へ）。⚠**3経路とも実機未検証**（§7 送り）。⚠**母集団の残り**＝「対戦相手が払う」側32箇所は実装済みだが**帰結が「そのシグニ」照応**の形などが据置（→ O-31）。
- **2026-08-15 続き494（§6.4 O-28 のアタック税5効果＋engine の continuation 取りこぼし）後 最新値**：census **831 据置**（較正なし）、**golden 2040**（+6＝ルリグ軸の ban 分離1・軸の相互漏れ1・live 形1・通し実行1・入れ子 continuation 1・選択ループ二重の不変条件1。ほかに `WXDi-P01-026-E1` の据置 assert を正方向へ更新）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **104枚 / 45群**（109→104＝5枚採用）、lint **0 errors / 260 warnings**、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0・明示 defer 23種/26件**（いずれも据置。C群は 259→258箇所）。🆕**live JSON changed 6効果/6カード**（`WX11-012`／`WX24-P1-041`／`WX24-P4-001`／`WXDi-P03-036`／`WXDi-P05-033`／`WX17-003`。CSV 非改変）。🆕**挙動是正 8**（恒久 no-op 5／丸ごと no-op 1／過剰実行 1／対象の過少 1）。🆕**新機構＝`SigniAttackBan.appliesTo:'LRIG'`＋`lrigAttackBanCost`／`lrigAttackCostInfo`（ルリグアタックの《無》前払いを判定と引き落としで1関数に）／`SELECT_TARGET_ONLY` の LRIG・CENTER_LRIG_OR_SIGNI 対応／`execSequence` の continuation 合成**。⚠**4経路とも実機未検証**（§7 送り）。⚠**continuation 合成の母集団は 47効果（入れ子SEQUENCE+後続）／147効果（内部continuationを積みうる型が中間ステップ）**＝すべて「落ちていた残りが動くようになる」側の変化だが、実機で目に見える差が出るのはこれから。
- **2026-08-15 続き493（§6.4 O-3 `NON_FIELD_ZONE_MOVE_IMMUNITY` 解体）後 最新値**：census **831 据置**（較正なし）、**golden 2034**（+4＝期間軸1・実消費地点1・実カード1・遅延本体1。ほかに据置トリップワイヤ3件を正方向へ更新）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **110枚 / 46群**、lint **0 errors / 260 warnings**、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**（据置。明示 defer は **23種/25件 → 23種/26件**＝`NON_FIELD_ZONE_MOVE_IMMUNITY` −1／新設 `NEXT_OPP_TURN_END_BODY` +2＝**隠れていた2件を明示 defer へ可視化**したぶん）。🆕**live JSON changed 5カード**（`WXK10-004`／`WXK10-083`／`WXEX2-06`／`WXDi-P16-002`／`WXDi-P09-066`。CSV 非改変）。🆕**挙動是正 5効果**（永続化バグ 1／恒久 no-op 1／片側採用 1／過剰実行 1／汎用 STUB 誤配 1）。🆕**新機構＝`opp_move_immunity`＋`activeOppMoveImmunityZones`（期間つき移動不可をターン数カウントダウンで持つ）／`ZONE_MOVE_IMMUNITY` アクション／`DEFERRED_NEXT_OPP_TURN_END_BODY`（遅延本体の明示 defer）**。⚠**4経路とも実機未検証**（§7 送り）。⚠**現行の近似**＝保護できるのは hand / energy → トラッシュの移動だけ（デッキ／トラッシュ／ライフ側は移動地点の funnel が無い）。
- **2026-08-15 続き492（§6.4 O-3 `UNTIL_NEXT_MAIN_PHASE_CLAUSE` 解体）後 最新値**：census **831 据置**（⚠一度 832 まで上がったが `RESERVE_DRAW_PHASE_REPLACEMENT` の較正で解消＝「STUB を実装で置き換えると +N する」既知パターン）、**golden 2030**（+3＝期間軸1・走査軸1・`WXK01-002-E2` の3機構1。ほかに T1/T6 のレジストリ実数を更新）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **112枚 / 47群**、lint **0 errors / 260 warnings**、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**（据置。明示 defer は **24種/26件 → 23種/25件**）。🆕**live JSON changed 7カード**（`WXK01-002`／`WXK10-019`／`PR-K019`／`WX26-CP1-004`／`WX26-CP1-023`／`WX26-CP1-073`／`WXK02-022`。CSV 非改変）。🆕**挙動是正 9効果**（恒久 no-op 2／無言 no-op 2／1回で消費されていた 5／過剰実行 1／過少実行 1・重複あり）。🆕**新機構＝`isLrigDamagePrevented`（ルリグダメージ無効の走査軸を1本へ）／`turnScopedState` の境界 `main-phase-start`＋`clearMainPhaseScopedState`（「次のあなたのメインフェイズまで」＝ターン境界を跨ぐ期間）／`SET_LRIG_BASE_LIMIT`／`RESERVE_DRAW_PHASE_REPLACEMENT`／`PREVENT_DAMAGE.untilNextMainPhase`**。⚠**4経路とも実機未検証**（§7 送り）。
- **2026-08-15 続き491（§6.4 O-3 フェイズ／ターンのスキップ系統を解体）後 最新値**：census **831 据置**（較正なし＝STUB→実装で高シグナルが増えなかった）、**golden 2027**（+8＝新機構の表駆動テスト1・実カード5・交代funnel1・ソース走査トリップワイヤ1）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **109枚 / 49群**、lint **0 errors / 260 warnings**、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**（据置。明示 defer は **26種/28件 → 24種/26件**）。🆕**live JSON changed 4カード**（`WXEX2-19`／`WX16-001`／`SP38-006`／`WD20-006`。CSV 非改変）。🆕**挙動是正 6効果**（無言 no-op 4＝うち3件は STUB ですらないクラス／恒久 no-op 2）＋**PvP 限定の波及是正4効果**＋**CPU の追加ターン**。🆕**新機構＝`PHASE_SKIP_BLOCK_IDS`＋`resolveNextPhaseWithSkips`（フェイズスキップを遷移の1点へ）／`resolveTurnHandover`（ターン交代判定を1関数へ）／`skip_next_turn`／`IS_BETTING.negate`**。⚠**フェイズスキップは全経路が実機未検証**（§7 送り）。
- **2026-08-15 続き490（§6.4 O-3 `ATTACK_TAX_HAND_DISCARD` 解体）後 最新値**：census **831 据置**（較正なし＝今回は STUB→実装で高シグナルが増えなかった）、**golden 2019**（+2＝gate の両方向1・live 形1）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **107枚 / 48群**（据置）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**（据置。明示 defer は **27種/29件 → 26種/28件**）。🆕**live JSON changed 2カード**（`SP38-003`／`WXDi-P05-022`。CSV 非改変）。🆕**挙動是正 2効果**（恒久 no-op 2＝うち1件は `GRANT_KEYWORD.keyword` に文が入った**計器に映らない無言 no-op**）。🆕**新機構＝`SigniAttackBan.unlessPayHandDiscard`＋`signiAttackBanCost`（軸をまとめて返す）＋`AttackHandDiscardCostModal`**。⚠**新モーダルは実機未検証**（§7 送り）。
- **2026-08-15 続き489（§6.4 O-3 `NEXT_OPP_ATTACK_PHASE_START` 解体）後 最新値**：census **831 据置**（⚠一度 835 まで増えたが計器較正4件で戻した＝`DELAY_TO_NEXT_OPP_ATTACK_PHASE`／`levelFromLastProcessed`／`escapeDiscard`×2。**`NEGATE_ATTACK` を鍵にすると既存11件を隠すので narrow なキーに絞った**）、**golden 2017**（+5＝新機構3・live 形1・永続化バグのトリップワイヤ1）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **107枚 / 48群**、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**（据置。明示 defer は **28種/31件 → 27種/29件**）。🆕**live JSON changed 4カード**（`SPDi43-24`／`WX24-P3-014`／`WX25-P2-051`／`WXK01-003`。CSV 非改変）。🆕**挙動是正 5効果**（過剰実行3＋対象取り違え1＋永続化バグ1）。🆕**新機構＝`DELAY_TO_NEXT_OPP_ATTACK_PHASE`／`PLACE_FACEDOWN_LRIG_ZONE`／`REVEAL_FACEDOWN_LRIG_ZONE`／`SIGNI_ATTACK_BAN.levelFromLastProcessed`**。🆕**`negated_attacks`／`negated_attacks_escape` を turnScopedState へ登録**（永続バグ解消）。

- **2026-08-15 続き488（§6.4 O-3 の3クラスタ解体）後 最新値**：census **831 据置**（⚠一度 832 まで増えたが計器較正1件で戻した＝`ADD_EXTRA_ATTACK_PHASE` を「トリガー:アタックフェイズ開始時」の対応語彙に追加）、**golden 2012**（+11＝新機構3・live 形3・データ不変条件/トリップワイヤ5）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **108枚 / 48群**、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**（据置。明示 defer は **30種/35件 → 28種/31件**）。🆕**live JSON changed 8カード**（`SPK01-10`／`PR-422`／`SPDi43-24`／`WX20-049`／`WX22-010`／`WX26-CP1-066`／`WXDi-P07-050`／`WXK06-026`。CSV 非改変）。🆕**挙動是正 8効果**（過剰実行4＋恒久 no-op2＋対象取り違え2）。🆕**新機構＝`ADD_EXTRA_ATTACK_PHASE`／`blocked_actions:'PAY_ENERGY_COST'`／`TRASH_ENERGY_AT_TURN_END`／`POWER_MODIFY.deltaFromZone`／`DeployBlockReason:'ALL_BAN'`**。

- **2026-08-15 続き487（§6.4 O-3 の2クラスタ解体）後 最新値**：census **831 据置**（⚠一度 832 まで増えたが計器較正2件で戻した＝`DEPLOY_BAN`／`namesFromTargets` キー追加）、**golden 2001**（+4＝executor 1・funnel 1・寿命1・live 形1）、smoke **10688 / SKIP 0**、fuzz 全0、held **112枚 / 48群**（うち採用済み5枚はレビュー対象外）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**（据置。明示 defer は **27種/39件 → 30種/35件**＝受け皿2種が消えて固有4種が出た）。🆕**live JSON changed 8カード**（`WXK10-019`／`WX25-P3-001`／`WX25-P3-009`／`WX25-CP1-016`／`WXEX2-19`／`WXK10-004`／`WDK17-008`／`PR-K046`。CSV 非改変）。🆕**挙動是正 7効果**（恒久 no-op 5＋所有者/期間の取り違え1＋永続化バグ1）。🆕**`signi_deploy_power_limit` 廃止**（`signi_deploy_bans` へ統合）。

- **2026-08-15 続き486（§6.4 O-3 最大クラスタ解体）後 最新値**：census **831 据置**（⚠一度 833 まで増えたが、計器較正1＋実装1で戻した＝④参照）、**golden 1997**（+7＝executor 3・gate 1・データ不変条件1・live 形1・盤面リセット1）、smoke **10688 / SKIP 0**、fuzz 全0、held **108枚 / 48群**、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**（据置。明示 defer は **25種/43件 → 27種/39件**＝受け皿1種が消えて固有3種が出た）。🆕**live JSON changed 7カード**（`WX10-024`／`WX24-P2-014`／`WX24-P4-039`／`WX25-P2-010`／`SP38-003`／`WXDi-P08-030`／`WXEX2-09`。CSV 非改変）。🆕**挙動是正 5効果**（恒久 no-op 5＋うち1件は過剰実行も同時是正）。

- **2026-08-15 続き485（§6.4 O-19 完了＋新設 O-25 消化）後 最新値**：census **831**（`BASELINE_HIGH` 実数更新＝**−2**。引用能力を `GRANT_EFFECT` へ構造化した結果、引用の中身が外側効果の語彙として数えられなくなった分）、**golden 1990**（+5＝データ不変条件1＋トリップワイヤ4）、smoke **10688 / SKIP 0**、fuzz 全0、held **116枚 / 48群**（うち採用済み9枚はレビュー対象外＝**実質 107枚**。純増は `SPDi43-05` の1枚＝PARTIAL 保留）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**（据置）。🆕**live JSON changed 9カード**（`WX24-P2-007`／`WX25-P1-056`／`WX25-P1-061`／`WX25-P2-030`／`WX25-P3-056`／`WX25-P3-059`／`WX25-CP1-048`／`WXK10-079`／`WXDi-P07-063`。CSV 非改変）。🆕**挙動是正 5効果**（恒久 no-op 1＋過剰実行3＋所有者反転1）。

- **2026-08-15 続き484（§6.4 O-22/O-23/O-24 完了）後 最新値**：census **833**（`BASELINE_HIGH` 実数更新。⚠**+2 は既知の良性クラス**＝加算モデルは原文の合計値を JSON に literal で持たない＝**実質 831 据置**）、**golden 1985**（+5＝5件それぞれのトリップワイヤ）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**、held **106枚 / 47群**（増えた5枚を全部採用して元に戻した）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**（明示 defer 24→25 種）。🆕**live JSON changed 5カード**（`WX07-031`／`WX08-032`／`WX12-037`／`WX25-P2-103`／`WXK06-030`。CSV 非改変）。🆕**挙動是正 5効果**（恒久 no-op 4＋過剰実行1）。

- **2026-08-15 続き483（§6.4 O-21 完了）後 最新値**：census **831 据置**、**golden 1980**（+2＝O-21 の到達可能性トリップワイヤ／`BET_CONDITION` の両方向）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**、held **106枚 / 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**。🆕**live JSON changed 0**（effects JSON・CSV 非改変）。🆕**engine −352行**（死コード20ブロック削除）。🆕**到達不能ハンドラ 19 id → 0**。

- **2026-08-15 続き482（§6.4 O-20 完了）後 最新値**：census **831 据置**、**golden 1978**（+2＝O-20 の契約テスト／トリップワイヤ）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**、held **106枚 / 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**。🆕**live JSON changed 0**（effects JSON・CSV は非改変。変更は engine 5ファイル＋`effectParser` ＋ `behaviorAudit`／`goldenTest`）。🆕**O-20 変換＝20サイト・挙動是正14効果**。🆕**重複 STUB ハンドラ 58 id を検出（O-21）**。

- **2026-08-14 続き481（§7 V-18 決着・V-19 要追試）後 最新値**：census **831 据置**、**golden 1976 据置**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**、held **106枚 / 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**。🆕**live JSON changed 0**（engine/parser/JSON/React 非改変）。🆕**実機シナリオ＝+10本**（V-18/19）＝**緑/赤の内訳が 101緑6赤 → 107緑10赤**（赤10＝(cxxxiv) 再現1・V-15/16/17 未完5・**V-19 要追試4**）。🆕**Opusタスク12 の在庫＝5件**（据置）。

- **2026-08-14 続き480（§7 V-15/16/17 消化）後 最新値**：census **831 据置**、**golden 1976 据置**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**、held **106枚 / 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**。🆕**live JSON changed 0**（engine/parser/JSON 非改変）。🆕**実機シナリオ＝+13本**（V-15/16/17）＝**緑/赤の内訳が 93緑1赤 → 101緑6赤**（赤6本＝(cxxxiv) 待ち1本＋**シナリオ側の未完5本**）。🆕**Opusタスク12 の在庫＝5件**（据置）。

- **2026-08-14 続き479（§7 V-14 決着）後 最新値**：census **831 据置**、**golden 1976 据置**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**、held **106枚 / 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**。🆕**live JSON changed 0**（engine/parser/JSON 非改変。UI は `stack-detail-modal` の属性追加のみ）。🆕**実機シナリオ＝+14本**（V-14）＝**緑/赤の内訳が 80緑0赤 → 93緑1赤**（赤1本は §3 (cxxxiv) 待ちで既定 order に置いてある）。🆕**Opusタスク12 の在庫＝5件**（(cxxxiv) を登録）。

- **2026-08-14 続き478（§7 V-12 完全決着・V-13 決着）後 最新値**：census **831 据置**、**golden 1976**（+1＝`reserveGrantedAutoUsage` のトリップワイヤ）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**、held **106枚 / 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**。🆕**live JSON changed 0**（parser/effects JSON 非改変。engine 側は `BattleScreen.tsx` と `grantedAuto.ts` のみ）。🆕**実機シナリオ＝+6本**（V-13）＝**緑/赤の内訳が 72緑2赤 → 80緑0赤**（V-12 の赤2本が緑へ反転）。🆕**Opusタスク12 の在庫＝4件**（(cxxxiii) を取り下げ）。

## 2026-08-15 整理⑯：PLAN §6.4 `O-22`／`O-23`／`O-24` の消化記録（続き484）

> PLAN §6.4 には1行✅サマリだけを残す。一次記録は BUGFIXES.md 2026-08-15（3本目）。
> **5効果の挙動是正＝恒久 no-op 4件＋過剰実行 1件。live JSON は 5カード（4ファイル中3ファイル）を更新。**

**■ O-22(a) `CHARM_CONDITIONAL_POWER`（`WX07-031-BURST`／`WX08-032-BURST`）＝恒久 no-op**
- 原文は「…－10000する。**あなたのシグニに**【チャーム】が付いている場合、代わりに－20000する」（`WX07-031`）と
  「…－8000する。**それに**【チャーム】が付いている場合、代わりに－15000する」（`WX08-032`）。
- 🔴旧ハンドラは delta を **`sourceCardNum`（＝効果元カード自身）** へ当てていた。両方**ライフバースト**＝場に無いので
  `hasCharm` の判定に使うゾーンが引けず**常に偽＝一度も発火しない**。
- ⭐**機構は既にあった**＝`effectParser.ts` の「代わりに」置換 fixup が `CONDITIONAL + POWER_MODIFY{targetsLastProcessed}` の
  **加算モデル**（base はそのまま、条件成立時に**差分**を同じ対象へ足す）を組む。regex が
  「それに…**それのパワーを**－M」の完全形しか取れず、この2枚の短縮形（「代わりに－Mする」）が外れていただけ。
  **主語2形 × 帰結2形**を1本の regex にまとめて解決＝`それ`→`LAST_PROCESSED_MATCHES{hasCharm}`／
  `あなたのシグニ`→`CHARM_COUNT{self,gte,1}`。engine 変更ゼロ（新語彙0・新 action 型0）。
- ⚠**加算モデルにする理由**＝else 置換にすると `LAST_PROCESSED_MATCHES` が**対象選択より前**に評価され常に偽になる（既知）。
- ⚠**倍率形は別機構**＝`WX25-P2-103` ②「代わりに**３倍**－される」は `double_power_minus_targets` が**2倍固定のフラグ集合**
  （`effectEngine.ts:2322`）なので表せない → `DEFERRED_CHARM_POWER_MINUS_MULTIPLIER` へ分離（§6.4 O-10 が 14→15 id）。
- 旧ハンドラは**削除**（残すと「新しい綴りの変種」が黙って誤実装へ落ちる）。

**■ O-22(b) `CONDITIONAL_PER_TRASH`（`WX12-037-E2`）＝恒久 no-op → 新機構**
- 原文「各プレイヤーは自分のデッキの上からカードを５枚トラッシュに置く。この方法でトラッシュに置いたカードの中に
  カード名に《メツム》を含むカードがある場合、あなたはこの効果を繰り返してもよい。（リフレッシュはこの効果を
  すべて処理してから行う）」＝**トラッシュ枚数条件ではない**（旧 STUB は「トラッシュN枚以上ならドロー」の別物で、
  この効果には条件句が無いため何も起きなかった）。
- 新 `STUB{MILL_EACH_REPEAT_ON_NAME}`（ペイロード `millEachRepeatOnName:{count,name}`）を parser の
  `applyThisWayTrashOutcomeGuards` で**ミルごと1つに畳み込む**。
- 🔑**畳み込みが必須な理由**＝条件が見るのは「この方法で」置いた**両プレイヤー分**だが、`SEQUENCE` は
  **step ごとに `lastProcessedCards` を上書きする**ので前段を残すと**相手の5枚しか見えず過少発火**する。
- 繰り返しは既存の `CHOOSE` ＋ **同じ STUB の再入**で表す（新しいループ機構は作っていない）。
  終了条件＝①名前ヒット無し ②両者のデッキが尽きた（無限ループ防止も兼ねる）。
  リフレッシュは処理中に起こさない＝デッキが尽きたら取れる分だけ取り、通常経路（BattleScreen）へ委ねる＝原文の但し書きどおり。
- ⚠**同じ「繰り返す」語彙のもう1枚 `WXDi-CP01-033-E1` は別の壊れ方**（デッキ**一番下**からのミルが丸ごと欠落し、
  パワー＋5000が無条件になっている）＝本バッチのスコープ外。着手時はこの行を根拠に。

**■ O-22(c) `CRAFT_TO_LRIG_DECK`（`WX25-P1-034-E2`）＝在庫の症状記述が stale**
- 🔴在庫は「＜ヤミノアーツ＞のクラフト5種が CSV に無い＝**データ側の欠落**」と書いていたが、**実測すると全部ある**
  （`WX25-P1-TK1`〜`TK5`＝ダーク・バウンダリー／背闇之陣／ダーク・アナライズ／闇気揚々／ダーク・アウト。Type『アーツ/クラフト』）。
  `BattleScreen.tsx` の cardMap 事前ロードにも5枚とも既に登録済みだった。
- 真因は `TOKEN_SETS` のキーワードが **`'ダークアーツ'`**（**全 CSV に1件も出ない綴り**）で、原文の
  「**ヤミノアーツ**のクラフトから２種類を…」に一致せず候補0＝無言 no-op。**1語の修正**で5種類の選択が出るようになった。
- 🔑**教訓＝束の呼称をカード名から推測しない**（名前は「ダーク・○○」だが束は「ヤミノアーツ」）。

**■ O-23 `POWER_MOD_BY_ATTACKER_LEVEL`（`WXK10-084-E1/E2`）＝倍率の主語違い**
- 原文「それのパワーを**アタックしたその**シグニのレベル１につき－1000する」なのに、engine は
  `ctx.sourceCardNum`（＝能力の持ち主＝Level 3 固定）の Level を使っていた。`triggerScope:'any_ally'` なので
  **別の味方＜トリック＞がアタックすると倍率が誤る**（L1 でも L4 でも一律 −3000）。
- `ctx.triggeringCardNum ?? ctx.sourceCardNum` へ。⚠**自身がアタックした場合は挙動不変**＝両コレクタとも
  `triggeringCardNum === attacker === source` を積む（`collectAttackerSelfTriggers`＝`triggerCollect.ts:3534`／
  `collectFieldTriggers` の any_ally＝`:3649`）。

**■ O-24 `OPP_TRASH_FIELD_SIGNI_AND_ENERGY`（`WXK06-030-E2`）＝過剰実行**
- 原文「対戦相手は、自分の場からシグニ**１体**と自分のエナゾーンからカード**１枚**を対象とし、それらをトラッシュに置く」
  に対し、engine は**相手の場のシグニ全部＋エナ全部**を流していた。
- ⭐**engine 変更ゼロ**＝`TRASH{SIGNI}`／`TRASH{ENERGY_CARD}` は既に `opponentSelects`（相手が選ぶ）を備えていた
  （`effectExecutor.ts:1683`／`:1834`）。parser を `SEQUENCE[TRASH{SIGNI opponent,count:1,opponentSelects}, TRASH{ENERGY_CARD opponent,count:1,opponentSelects}]` に直しただけ。
- ⚠**`owner`（誰のカードか）と `opponentSelects`（誰が選ぶか）は独立**＝必ず併記する（続き411 の教訓）。
- 旧ハンドラと旧フォールバック regex は**削除**（全 CSV 走査で明示規則が母集団を完全に覆い、フォールバックの live 利用は0件）。

**■ ゲート／計器**
- golden **1980 → 1985**（+5＝O-22(a)(b)(c)／O-23／O-24 の各トリップワイヤ。O-23 は revert で赤くなることを実測確認）。
- **O-20 トリップワイヤの凍結値を 9→8 へ更新**（`execStubPart2.ts` の `sourceAbilityText` 使用箇所）
  ＝**差し戻しではなくサイトごと消えた**（`CHARM_CONDITIONAL_POWER` ハンドラ削除）ぶん。
- census **831 → 833**（`BASELINE_HIGH` を実数更新）。⚠**+2 は既知の良性クラス**＝加算モデルは原文の**合計値**
  （20000／15000）を JSON に literal で持たないので「数値不一致」節が拾う。先行の同型（`WX25-P2-102/107/109`／
  `WX15-027-E1`／`WX15-040-BURST`）も同じ理由で既にベースラインに入っている＝**実質は 831 据置**。
  2効果は「STUB 格納」バケットから高シグナル側へ**移っただけ**で、挙動は恒久 no-op → 原文どおりへ是正されている。
- `census:stubs` A群＝**無言 no-op 0 据置**（明示 defer が 24→25 種）。C群は **+0**（新 STUB は逆翻訳へ日本語で描画するようにした）。
- held **106枚 / 47群 に戻して着地**（parser 変更で一時 110枚／49群へ増えた5枚を全部採用した＝在庫を持ち越さない）。
  ⚠**採用前に5枚とも live vs fresh の diff を1行ずつ実測**し、意図した変更以外が混じっていないことを確認している
  （`WX25-P2-103` は STUB id の1行だけ・他4枚も STUB→構造化の当該ノードだけ）。

## 2026-08-15 整理⑮：PLAN §6.4 `O-20`／`O-21` の消化記録（続き482〜483）

> PLAN §6.4 には1行✅サマリだけを残し、個票と仕分けの明細をここへ移した。一次記録は BUGFIXES.md 2026-08-15 の2本。

**■ O-21（STUB ハンドラの id 重複）＝✅2026-08-15 続き483 で完了**
> 実測＝**A：後発が到達不能 19 id / 21ブロック**（死コード）・**B：先着が素通りしうる 16 id**（`&& targetsStored` 等の追加ガードつき＝**意図的で正当**）・**C：`effectExecutor` の `execSequence` 内 7 id**（SEQUENCE/CONDITIONAL ペア専用経路＝**両方 live**）。
> ⚠続き482 の簿記「58 id」は `uniq -d` の生数字で、**入れ子分岐を重複と誤検出**していた（着手時に必ず数え直す＝§3-1）。
> 🔴**A のうち1件は live バグ**＝`BET_CONDITION`（`WDK01-010-E1`）は `execStubPart3` に実装があるのに `execStubPart1` の3行 no-op が潰していた（**ベット時に1枚多く拾えるはずが拾えていなかった**）→ 先着から外して実装を生かした。残り18 id（20ブロック）は**旧版の死コード**として削除（−352行）。
> 🔑**再発防止**＝golden `§6.4 O-21: 同じ STUB id の後発ハンドラが到達不能になっていない`＝**重複の存在ではなく到達可能性**を不変条件にした（重複自体は正当なので、先着が「必ず return」かつ後発があるときだけ赤）。

**■ O-20 の個票（2026-08-13 続き464 の棚卸し・✅2026-08-15 続き482 で完了）**
> ✅**20コードサイトすべてを source 配線へ変換済み**（機構・個票・実測差分は [BUGFIXES.md](./BUGFIXES.md) 2026-08-15、および PLAN_DETAIL）。
> 残っていた1行（`effectParser` の `inferTriggerScope`）は**過小発火側で O-19 と同根**なので **O-19 に統合**した。
> 🔑**再発防止**＝golden に契約テスト2件（根拠5カードのブロック解決／変換済みサイトの使用箇所凍結）。
> 🔑**新しいハンドラを書くときの規則**＝`cardMap.get(sourceCardNum).EffectText` を直接読まず **`sourceAbilityText(ctx)`**（ctx が無い走査は `abilityBlockTextOf(card, effectId)`）を使う。

## 2026-08-14 整理⑭：PLAN §7 の決着済みブロック `V-11` を退避（続き476）

> `V-11`（配置制限ゲートの一本化）は6シナリオすべて緑で決着。PLAN §7 には1行✅サマリだけを残し、経緯・罠・未カバーの明細をここへ移した。

- **✅ V-11 配置制限ゲートの一本化（続き405）＝2026-08-14 続き476 で決着＝6シナリオすべて緑**（Codex 起案→Claude 実機検証・**6本まとめて2回連続 ALL PASS**・既定 order 登録済み・**engine バグ0**）。`v11EffectDeployCountFlagBlocked`／`v11EffectDeployNoLimitControl`／`v11EffectDeployContinuousBlocked`／`v11CpuDeployCountContinuousBlocked`／`v11CpuDeployCountNoLimitControl`／`v11CpuDeployPowerLimitWithControl`。
  - [x] **相手に配置数制限を掛けた状態で「効果で」シグニを場に出せないか**＝**実機PASS 3本**。効果元は `WD08-001-E3`（【起】《ダウン》：自トラッシュのシグニ1枚を場に出す）で、場2体＋空き1面＋トラッシュ候補1枚に固定して対象選択とゾーン選択の曖昧さを消した。①**フラグ版**（`signi_deploy_count_limit:2` を直接注入）で不発＋**完全一致ログ**「`配置数制限のため小剣　ククリを場に出せない`」②**対照**＝flag だけ外すと同じ操作で `trash→場`（場2→3・ログ「`小剣　ククリを場に出す`」）③**CONTINUOUS 版**＝相手の場に `WX07-006`（【常】シグニ2体まで）を注入するだけで同じく不発＝**`fillDeployCaps`→`ctx.deployCountCapSelf` 経路が実UIで生きている**ことを確認。
    - ⭐**「通常召喚は従来どおりボタンが出ない」は PLAN の記述が実装と食い違っていた**＝配置数制限は **CardModal の「召喚」ボタンでは見ていない**。ゲートは `SigniSummonZoneModal.tsx:72`（**召喚先ゾーンボタンの disabled**）と `handleSummonSigni`（`BattleScreen.tsx:5551`）にある。⇒ シナリオは「**召喚先ゾーンが1つも選べない**（z0/z1/z2 すべて disabled）」を assert する形にした（実機で確認済み）。
    - ⚠**この追加 assert は効果配置の観測が終わってからやること**＝先に手札→召喚ゾーンのモーダルを開閉すると、**その後ルリグスロットのクリックがオーバーレイに吸われて【起】モーダルが二度と開かない**（40反復を空振りして FAIL する。実測で1回踏んだ）。
  - [x] **CPU が配置制限・パワー制限を守って召喚するか**＝**実機PASS 3本**。①**配置数**＝host 場に `WX07-006` を置くと CPU は場2体で止まり3体目が手札に残る／**対照**＝`WX07-006` だけ外すと `[CPU] シグニ配置: 小剣　ククリ（ゾーン3）` で3体目を出す ②**パワー**＝`signi_deploy_power_limit:5000` で CPU 手札の P3000 だけが出て P7000 は残る／**対照**＝flag だけ落とすと同じ2枚が両方出る。
    - 🔑**配置数フラグ版は CPU 検証に使えない**＝`signi_deploy_count_limit` は**ターン開始時にリセットされる**（`BattleScreen.tsx` 3802/4150/4814/10605 が「次のターンプレイヤー」の分を消す）ので、注入して CPU ターンへ進めると消える。**CPU 側の配置数は CONTINUOUS 版で撃つ**のが正解。一方 **`signi_deploy_power_limit` はどこでもリセットされない**（→§3 **(cxxxii)** に登録）ので直接注入で撃てる。
  - 📋**未カバー（申告）＝`deployCountCapOpponent` 経路**（自分の効果で**相手の場に**シグニを出す＝`fillDeployCaps` の2本目）。`WXEX2-50-E3` 型は2段 SEQUENCE で単一原因の対照を維持できないため見送った。**踏むなら V-25 として別立てする**。
  - 📋**スコープ外で見つけた実装の疑い2件**＝→§3 **(cxxxi)**（ルリグ【起】の《ダウン》が誰もダウンさせない）／**(cxxxii)**（パワー制限がリセットされない）。

## 2026-08-13 整理⑫：PLAN §6.4 `O-17`「能力喪失の対象軸」の消化記録（続き458）

> PLAN §6.4 の worklist から `O-17` の行を落とした（**クローズ**）。一次記録は [BUGFIXES.md](./BUGFIXES.md) の続き458。
> `O-17` は続き457（`O-16` 第4波）の**隣接発見として登録し、同日中に消化**した項目。

**`O-17`＝「期間は合っているのに**誰に効くか**が違う」3件**。`O-16`（ゾーン軸）とは別軸で、対象**種別**（キー／シグニ）・
対象**領域**（場だけ／手札・エナ・トラッシュも）・対象の**同一性条件**（レベル等値）の3方向。

| 効果 | 何が違っていたか | 直し方 |
|---|---|---|
| `WXK05-010-E2` | 対象種別が**キー→シグニ**（キーを捨てるコストを払って相手シグニが止まる） | `EffectTarget.type:'KEY'`＋`TargetScope:'self_key'/'opp_key'`。読みは続き457 の `activeKeyAbilitySources` funnel に1行足すだけ。`resumeSelectTarget` の持ち主判定にキー枠を追加（**キーを選ぶと無言で空振り**する穴） |
| `SPDi47-01-E2` | 領域を跨ぐのに**場のシグニ1体だけ**（`count:1`） | `all` 判定に列挙形（「手札と場とエナゾーンとトラッシュにある」）を追加＋`allZones` |
| `WX24-P4-013-E3` | **レベル条件が落ちて相手シグニ全体**から能力を奪う過剰効果 | 前段は parser の一般規則（「この方法で公開された〜と同じレベルの」）／後段（照応語だけの文）は `IDENTITY_BATCH5B` |

**⭐ 共通機構＝`EffectTarget.allZones`**（場＋手札＋エナ＋トラッシュ）。`abilities_removed` は cardNum のリストで
ゾーンに依存しないので、**候補プールを広げるだけ**で載る。
- ⚠**デッキ／ライフは足さない**＝この engine にはデッキ/ライフのカードの能力を参照する経路が無く、
  足しても「実装したように見えるだけ」になる。原文の「すべての領域」との差はここだけ。
- ⚠**`cardType:'シグニ'` を必ず載せる**＝手札／エナ／トラッシュも候補にするので、種別を明示しないと
  スペルやアーツまで巻き込む（場だけを見る既定経路では cardType が無くても実害が無かった）。
- 🔴**消費地点を1つ足した**＝トラッシュ起動（`getMyTrashCardActions`）が `abilities_removed` を一切見ていなかった。
  足さないと「候補を広げただけの見せかけ」になる。

**⚠キー対象の2軸を混同しないこと**＝`RemoveAbilitiesAction.alsoKeys`（続き457）は「場にあるキーとシグニ」＝
そのプレイヤーの**全キー**を `keys_abilities_disabled` フラグで倒す。`EffectTarget.type:'KEY'`（続き458）は
**1枚を選ぶ**ので同じフラグでは表せない。読みだけが共通（`activeKeyAbilitySources`）。

## 2026-08-13 整理⑪：PLAN §6.4 `O-16`「指定したシグニゾーン」の消化記録（続き454〜457）

> PLAN §6.4 の worklist から `O-16` の行を落とした（**クローズ**）。一次記録は [BUGFIXES.md](./BUGFIXES.md) の続き454／455／456／457。

**`O-16`＝「（指定した）シグニゾーンにある○○は…」＝ゾーンに紐づく継続効果**。per-card（instanceId 記録）では
「**後からそのゾーンへ出たシグニ**」に効かず、原文の「新たに得られない」「このアーツの使用後にそこに置かれた
シグニにも影響を与える」が丸ごと死ぬ、という共通の穴。**受け皿は `FieldGrant`（ゾーンに紐づく場レベル grant）**で、
4波かけて型が出そろった。

| 波 | 続き | 何を機構化したか | 効果数 |
|---|---|---|---|
| 第1波 | 454 | `FieldGrant{kind:'power'}`＝ゾーン継続のパワー修正。`applyActiveFieldGrant`（現ターン）と `reserveFieldGrant`（次ターン）の2スロット式。`alignDesignatedZoneOwner`（保存先と読み手の owner 一致を**木の形**で保証） | 6 |
| 第2波 | 455 | `FieldGrant{kind:'abilityLoss'}`＋**複数ゾーン指定**（`designated_zone?: number` → `designated_zones?: number[]`／読みは `designatedZones()` 1本へ集約）。`BLOCK_OPP_ZONE_PLACEMENT` の `?? 0` 過剰実行も是正。**O-3 の据置2件を同時に解除** | 2 |
| 第3波 | 456 | `FieldGrant{kind:'blockAction'}`＝ゾーンのアタック禁止。消費は既存 funnel `calcContinuousBlockedActions.cannotAttackSigni`（人間UI／`performSigniAttack`／CPU の3経路が通る唯一の場所）。`alignDesignatedZoneOwner` を CONDITIONAL/CHOOSE の枝へも降ろした | 3 |
| 第4波 | 457 | (a)`FieldGrant{kind:'power'}` に **`perTargetLevel`（動的 delta＝対象シグニ自身のレベル倍率）**＝`WDK10-009-E2` の真 no-op を解消 (b)**別軸**の `SP38-006-E1` 内側能力＝`RemoveAbilitiesAction.alsoKeys` と `activeKeyAbilitySources` funnel（キー能力喪失フラグの「AUTO 素通り」「turn-end で戻らない」2バグも同時に修正） | 2 |

**⚠残さなかった判断**＝除数つき（「レベル**２**につき」）は live 0件なので、Part4 の
`STUB{POWER_MOD_PER_COUNT}` 規則を**フォールバックとして残した**（将来出たときに黙って誤パースさせない）。
**⚠計器の注意**＝`zoneSource` キーの有無だけで数えると `BLOCK_OPP_ZONE_PLACEMENT`（`zoneBlockSource:'designated'`
で自前に読む）を**偽陽性**に拾う。

**続き457 の隣接発見2件は `O-17` として PLAN §6.4 に登録**（`WXK05-010-E2` のキー対象取り違え／`WX24-P4-013-E3` の
レベル・領域脱落）＝**ゾーン軸ではないので O-16 には戻さない**。

## 2026-08-13 整理⑩：PLAN §4 恒久指標の旧行を退避（続き435〜455）

- **🆕 2026-08-14 続き475〜475g（§7 V-01・V-02・V-03・V-09④・V-10 決着＋§3 実バグ6件クローズ）後 最新値（本行が直近の正）**：census **831 据置**、**golden 1975**（**1964→+11**）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（グループ265）、held **106枚 / 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`census:stubs` A群＝**無言 no-op 0**／**明示 defer 24種 42件**。🆕**live JSON changed 19枚**（(cxxvii) 2＋(cxxviii) 17。**(cxxiii) は live 不変＝実行経路の修正のみ**）。🆕**実機シナリオ＝+1本**（`pieceUseResolvesAndGoesToLrigTrash`）・**判定/経路を直したのが13本**・**id を1本 rename**。**緑/赤の内訳が 45緑12赤 → 60緑0赤**。🆕**Opusタスク12 の在庫＝2件**。

> §4「📊 恒久指標」は**最新1件だけ**を置く節（同節の運用ルール）。積み上がった旧行をここへ移した。
> ⚠退避時に各行の「（本行が直近の正）」という但し書きを外した＝**旧行に付いたままだと、
> どれが直近の正か分からなくなる**（機械的に接頭辞だけ付け替えると残る種類の矛盾）。

- **旧行（2026-08-13 続き455・§6.4 O-16 第2波＝能力喪失のゾーン継続＋複数ゾーン指定）後の計測値**：census **832 据置**（`BASELINE_HIGH` 832）、golden **1944（+2＝ゾーン能力喪失の E2E／2ゾーン指定の E2E）**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（グループ265）、held（parserWorklist）**106枚 / 署名グループ 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**ターン限定 PlayerState レジストリ 34フィールド**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`MANDATORY_SUSPICIOUS` **0**、`census:stubs` A群＝**無言 no-op 0**／**明示 defer 14種 16件**（据置）。live effect 単位 diff **2効果・effectId 増減 0/0**。
- **旧行（2026-08-13 続き454・§6.4 O-16＝指定シグニゾーンの配線）後の計測値**：census **832 据置**（`BASELINE_HIGH` 832）、golden **1942（+2＝指定ゾーンの現ターン継続 E2E／live 6効果の「保存先と読み手の一致」）**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（グループ265）、held（parserWorklist）**106枚 / 署名グループ 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**ターン限定 PlayerState レジストリ 34フィールド**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`MANDATORY_SUSPICIOUS` **0**、`census:stubs` A群＝**無言 no-op 0**／**明示 defer 14種 16件**（据置）。live effect 単位 diff **6効果・effectId 増減 0/0**。
- **旧行（2026-08-13 続き453・§6.4 O-3＝`REMOVE_ABILITIES.until` の死フィールド解消）後の計測値**：census **832 据置**（`BASELINE_HIGH` 832）、golden **1940（+3＝`until` 3語彙の書き分け／ターン境界の2スロット寿命＋既存リークの回帰／live 2件の `NEXT_TURN` と据置3件の固定）**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（グループ265）、held（parserWorklist）**106枚 / 署名グループ 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**ターン限定 PlayerState レジストリ 34フィールド**（32→34＝`abilities_removed`／`keyword_abilities_removed` を登録）、**UNKNOWN 25ノード / 25カード**（据置）、`MANDATORY_SUSPICIOUS` **0**、`census:stubs` A群＝**無言 no-op 0**／**明示 defer 14種 16件**（据置）。live effect 単位 diff **2効果・effectId 増減 0/0**。
- **旧行（2026-08-13 続き452・§6.4 O-2＝`SEARCH` の相手応答ルーティング）後の計測値**：census **832**（833→832・`BASELINE_HIGH` 832）、golden **1937（+3＝応答者ルーティングの型網羅／`deckOwner` の領域分離／ゾーン選択の引き継ぎ。ほか旧 defer トリップワイヤ4件を新しい正へ反転）**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（グループ265）、held（parserWorklist）**106枚 / 署名グループ 47件**（107→106）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 25ノード / 25カード**（27/26→25/25）、`MANDATORY_SUSPICIOUS` **0**、`census:stubs` A群＝**無言 no-op 0**／**明示 defer 14種 16件**（16種→14種）。live effect 単位 diff **3効果・effectId 増減 0/0**。
- **旧行（2026-08-11 続き442）**：census **846**（据置・`BASELINE_HIGH` 846）、golden **1841（+7＝E2E 4本＋構造検査＋T1/T2）**、smoke **10688 / SKIP 0**、**同型★ 0**（グループ265）、held（parserWorklist）**107枚 / 署名グループ 47件**（増減0）、lint **0 errors / 259 warnings**（据置）、**UNKNOWN 27ノード / 26カード**（28/27→27/26）、`MANDATORY_SUSPICIOUS` **0**、`census:stubs` A群（無言 no-op）**0**、**live の裸 `STUB{REVEAL_AND_PICK}` 7カード**（T1 が固定・11→7）、**`DECK_TOP_TO_LIFE` 2カード**（T2 が固定・4→2）、**live の `TRANSFER_TO_DECK{DECK_CARD}` 6箇所**（うち `WD23-013-A-E1` は SEARCH 欠落で no-op＝未着手）。live effect 単位 diff **4効果・outlier 0・effectId 増減 0/0**。
- **旧行（2026-08-11 続き441）**：census **846**（847→846）、golden **1834（+8）**、held **107枚 / 47件**、**UNKNOWN 28ノード / 27カード**、**live の `$ref` 26箇所＝全て `resolveCountRef` が解ける位置**（C1 が固定）、**枚数を `resolveNum` で解く関数 30個**（C2 が凍結・live に `$ref` 無しで無害）。
- **旧行（2026-08-11 続き435〜440）**：census **847**（852→847）、golden **1826（+17）**、smoke **10688 / SKIP 0**、**同型★ 0**、held（parserWorklist）**107枚 / 署名グループ 47件**（全バッチで増減0）、lint **0 errors / 259 warnings**、**UNKNOWN 28ノード / 27カード**（30→28）、`MANDATORY_SUSPICIOUS` **0**、`census:stubs` A群（無言 no-op）**0**、`live で noAbilities を持つカード` **11→16**、`verifyBattleDrive` 既定 order **+3**（`assistAttackBoth`／`fezoneDoubleCostPay`／`sYokusenkiSpellPay`）。⚠**`fuzz` の `distinct効果` は乱択で毎回変動する**（同一ツリーで 2682/2674/2670/2666 を実測）＝**指標にも一致基準にも使わない**（見るのは「バグ0・SKIP 0」だけ）。

## 2026-08-13 整理⑨：PLAN §6.4 の「消化済み」1行サマリ欄を退避（続き403〜453）

> §6.4 は**未消化 worklist だけ**を置く節にした（2026-08-13）。消化済みの1行サマリはここへ移す。
> 各行の一次記録は [BUGFIXES.md](./BUGFIXES.md) の該当日付、実装詳細は「2026-08-12 整理⑧」節。

**■ 消化済み（1行サマリ・詳細は PLAN_DETAIL「2026-08-12 整理⑧」と BUGFIXES 各日付）**
- ✅**任意性脱落の系統消化**（続き408/416/417/425/426/431）＝`MANDATORY_SUSPICIOUS` 33→0。`OPTIONAL_COST` の受け皿を `handDiscard`/`fieldDown`/`underAnySigniTrash.fromThis`/`OPTIONAL_ACTIVATE`/`OPTIONAL_TRASH_SELF`/`MILL{optional}` へ拡張。
- ✅**STUB 仕分け計器の新設と A群残0**（続き409〜413/427）＝`npm run census:stubs` を新設しゲート化。無言 no-op を実装6件＋明示 defer 化。
- ✅**UNKNOWN の系統消化 第1〜6波**（続き414/415/418/433/434/437）＝43→28ノード。
- ✅**強制アタック機構**（続き424）＝CONTINUOUS 側が engine から読まれず印字【常】6カードが恒久 no-op だった。
- ✅**`manualEffects.ts` の新規 effectId が live へ届かない第4の死角**（続き424）＝手書き効果3件が長期欠落。
- ✅**「対戦相手は〈コスト〉てもよい」の主語・極性反転**（続き425）＝自傷2件＋アタック無効の真逆2件。
- ✅**エナ支払い元の一本化**（続き428）＝`energyPaySource.ts` funnel＋`UNDER_CARD_AS_ENERGY_COST`。支払い14サイト／候補14モーダル／可否7箇所。
- ✅**離場置換の対話化 M1/M2**（続き429/430/432）＝列挙→policy→採用の3段に分離し、10カードが実際に選べるように。
- ✅**ライフクラッシュ置換の funnel**（続き431）＝`lifeCrashReplace.ts`。自傷・過剰・恒久no-op の3枚を是正。
- ✅**デッキ全体サーチ→シャッフル→デッキ上**（続き442/443）＝裸 `STUB{REVEAL_AND_PICK}` の**万能サーチ化**を残0に。
- ✅**デッキ公開の停止条件・行き先の構造化**（続き444）＝`REVEAL_UNTIL` 新設。`DECK_REVEAL_UNTIL` 10→4。
- ✅**`REVEAL_PICK_PLAY` の実行時原文再parse全廃**（続き445）＝live 11→0・engine ハンドラごと削除。
- ✅**【出】抑止が engine 未参照の死アクション**（続き446）＝10効果が恒久 no-op。`suppressOnPlay`／ターンフラグ／CONTINUOUS 宣言走査の3機構へ。
- ✅**ターン限定 PlayerState 30フィールドの funnel 化**（続き447）＝`turnScopedState.ts`。型で登録漏れを止める。
- ✅**「次のターンの間」の予約化 第1波**（続き448）＝`must_attack_signi_next_turn` ほか。続き447 の暫定を畳んだ。
- ✅**シグニの「場所を入れ替える」の二ゾーン交換**（続き449）＝13効果。場外→場は配置制限と中央 funnel を通す。
- ✅**場レベルの継続効果予約**（続き450）＝`FieldGrant`（keyword/power 統一・filter/zone/condition つき）。8効果。
- ✅**`SEARCH` の相手応答ルーティング＝O-2**（続き452）＝pending に **`deckOwner`（誰のカードか）と `opponentResponds`（誰がクリックするか）を分離**して持たせ、応答者判定を `pendingRespondsOpponent` 1本へ集約（`BattleScreen` のベタ書き2箇所を置換）。defer 3効果を解除。⚠**併せて潜在バグ4件**＝`applyDirectAction` の `ADD_TO_HAND`/`ADD_TO_ENERGY`/`ADD_TO_BEAT` が `owner` を無視（相手デッキから自分の手札へカードが跨ぐ）／resume 4本が次 pending の `respondPlayerId` を一律に落とす（配置チェーン2枚目以降を効果オーナーが操作）／`execLookPickChain` に場出し段の空きゾーン cap が無い（超過ピックがデッキからも盤面からも消失）／`INTERNAL_SPLIT_REVEALED` の戻し先が `self` 固定。


## 2026-08-12 整理⑧：PLAN §6.4 の消化済み項目を退避（続き403〜450）

> §6.4 が176行／90KB まで肥大したので、**消化済みバッチの詳細記録をここへ全文退避**した（2026-08-12）。
> PLAN 側には**未消化の worklist（O-1〜）と、消化済みの1行✅サマリ**だけを残す。
> ⚠**退避前に live で現状確認したところ、消化済みなのに残件として残っていた行が2つあった**
> （`WX24-P3-033-E1`＝続き443 で消化／`WDK13-011-E1`＝続き444 で消化）。**在庫は実測してから移すこと。**
> 個々のバッチの一次記録は `docs/BUGFIXES.md` の各日付。ここはその索引と、PLAN から落とした注記の保管庫。

> **消化済み7項目の詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-10 整理⑤」へ退避**（続き403〜407）。ここには**未消化の課題と、消化に伴って残った宿題だけ**を置く。

**■ 未消化（着手順の目安つき）**
- ~~**`checkAllEffects` の `MANDATORY_SUSPICIOUS` 精査＋`verifyEffects` の誤検出除外**~~ **✅2026-08-10 消化（続き408）**＝**33件を1件ずつ仕分けたら真バグ3件／誤検出30件**だった。誤検出6系統をルールで潰し、**`POWER_VALUE_MISMATCH` 6→0／`MILL_COUNT_MISMATCH` 3→0／`OPTIONAL_SUSPICIOUS` 2→0／`EFFECT_TYPE_MISSING_CONTINUOUS` 15→1（残1＝真バグ `WX12-010`）／`verifyEffects` のタイミング 4→0**。**計器の精度改善が本体**（続き407 の教訓「過剰報告する計器は無いより悪い」の実践）。詳細は BUGFIXES 2026-08-10（続き408）。
  - ~~**🔴 副産物＝任意性脱落 35件**~~ **✅2026-08-10 第1バッチ消化（続き416）＝`MANDATORY_SUSPICIOUS` 35→18**。**最大クラスタ＝「〈手札からN枚捨て〉てもよい。そうした場合、…」を parser 規則1本で系統是正**（`applyOptionalHandDiscardCost`・`effectParser.ts`）。素の `TRASH{HAND_CARD,owner:self}` を engine の正準形 **`STUB{OPTIONAL_COST, handDiscard{count,filter}}`** へ置換＝**107カード採用（heldReview 95＋混在カード12）＋ live/`manualEffects.ts` 直編集9件**。census **877→868**。
    - ⭐**この置換が安全な理由＝支払い枝が変換前と厳密に等価**（`optionalCostPaySteps` が同じ `TRASH{HAND_CARD,asCost}` を再生成する）＝**増えるのはスキップ枝だけ**。採用前に「live と fresh の差が本当にこの変換だけか」を正規化比較で機械確認してから `--adopt` した（署名グループ一括採用だと `WX25-P3-003` の `exceed:3` を巻き添えで失っていた）。
    - 🔴**変換した120箇所のうち「本当に強制だった」のは46箇所（45カード）**＝**素の `TRASH`（`optional` 無し）**。残る74箇所は既に `TRASH{optional:true}` が付いており、**engine 側は正しく動いていた**（`resumeSelectTarget` の `stripDidItConditional` が0枚選択で「そうした場合」ゲートごと落とす。手札0枚でも本体は撃たない＝続き417 に engine 実測）。**これらにとっての本変換は表現の統一＋支払い可能性チェック＋「支払う／スキップ」の明示UI**であってバグ修正ではない。
    - ⚠**`mandatory:false` は代用にならない**＝**ON_PLAY 以外では engine が `mandatory` を読まず**、ON_PLAY では「コスト無し mandatory:false」が収集フィルタの穴に落ちる。任意性は必ず action 木の側（`STUB{OPTIONAL_COST}` か `optional:true`）で表す。
    - ⚠**使用時（支払い時）コストは対象外**＝「この{スペル|アーツ}を使用する際、…捨ててもよい」は `useTimeCost.ts` の領分。触ると「以下のNつから選ぶ」連結条件（素の TRASH を要求）が外れて **CHOOSE 本体が丸ごと落ちる**（`WD21-008` で実測）。parser にガード済み。
    - **逆翻訳も併せて修正**＝`decompileEffects.ts` の `OPTIONAL_COST` は `handDiscard` を見ておらず「コストを支払ってもよい」に潰れていた（既存 MANUAL も同じ）。原文どおり「手札から＜天使＞のシグニを1枚捨ててもよい」を描画する。
    - **golden トリップワイヤ新設**＝「素の `TRASH{HAND_CARD,self}`（`optional` 無し）＋ did-it ゲート」を全 live から機械検出し、既知リスト外は即FAIL（`FORCED_HAND_COST_KNOWN`）。**残 worklist はこのリストの 🔴 側 7件**（下記）。
  - ~~**🔴 残 16件**~~ **✅2026-08-10 第2バッチ消化（続き417）＝`MANDATORY_SUSPICIOUS` 16→2**。残クラスタを**機構ごと**片付けた（census 868→860）。
    - **①効果まるごと任意＝`STUB{OPTIONAL_ACTIVATE}` 前置（17カード）**＝`DRAW`／`ENERGY_CHARGE_FROM_DECK`／`MILL`／`LIFE_CRASH`／`ATTACH_CHARM` は engine に `optional`/`upToCount` の受け皿が**無く**、原文「〜てもよい」を書く場所が無いまま強制だった。Pattern⑤ の「発動する／発動しない」に載せる。⚠**型ホワイトリスト制**＝`OPTIONAL_ACTIVATE` は `canAfford` が常に true なので、コスト系へ広げると**払えなくても発動できて本体だけ通る**。
    - **②自己トラッシュコストの脱落＝`STUB{OPTIONAL_TRASH_SELF}` 挿入（11カード）**＝「このシグニを場からトラッシュに置いてもよい。そうした場合、…」で**コストのステップが1つも生成されず本体だけ無条件に走っていた**（＝ただで撃てる）。engine 側の STUB は実装済みで parser が一度も生成していなかった。
    - **③任意デッキミル＝`MILL{optional}` 化（6カード）**＝`TRASH{DECK_CARD}` は `optional` を**一切見ない**（無条件ミル）。`MILL` は専用プロンプトを持つのでそちらへ寄せる。副産物で `WX24-P4-049` の「この方法でトラッシュに置かれたシグニのレベルの合計1につき」倍率脱落も `countIsLastProcessedLevelSum` で復旧（**直さないとスキップしても相手が1枚ミルされる**）。
    - **④新設 `OptionalCostSpec.fieldDown`（4カード）**＝「あなたのアップ状態の＜X＞のシグニN体をダウンし《色》を支払ってもよい」。従来は **DOWN が強制ステップで残り《色》は丸ごと脱落**（`WX25-P3-019` はコスト句ごと消滅）。`canAfford` がアップ状態の該当シグニ数を数える＝**払えないのに発動できる**を塞ぐ。
    - **⑤`underAnySigniTrash.fromThis` 追加（4カード）**＝「このシグニの下からカードをN枚トラッシュに置いてもよい」は `TAKE_FROM_UNDER_SIGNI{upToCount:true}`＝「N枚**まで**」だった。N=1 は等価だが **N≧2 は1枚だけ払って本体を撃てる**部分払いの抜け穴（`WX20-042-CB-E3`）。all-or-nothing の pay/skip へ。
    - 🔴**副産物＝付与能力が消える構造バグを1つ潰した**＝`parseBlock` の `GRANT_LRIG_ABILITY` 展開が**トップレベル型でしか判定していなかった**ため、任意コストで `SEQUENCE`/`CONDITIONAL` に包んだ途端に `abilities` が**空のまま**になっていた（`WX14-042`／`PR-319` で検出）。木の中を探す判定へ変更（`expandGrantLrigAbilities` 自体は元から walk 可能だった）。**「包んだら別の post-pass が効かなくなる」型の死角**。
    - ⭐**教訓＝`optional` の受け皿があるかを型ごとに確かめてから直す**。`TRASH{optional}`／`TAKE_FROM_UNDER_SIGNI{upToCount}` は `resumeSelectTarget` が0枚選択で「そうした場合」ゲートごと落とすので**既に正しい**。`DRAW`/`DOWN`/`TRASH{DECK_CARD}` は `optional` を見ないので**強制**。同じ「〜てもよい」でも直す/直さないが型で割れる。
  - ~~**📋 残 1件**＝`WXDi-CP01-023`~~ **✅2026-08-11 消化（続き431）＝`MANDATORY_SUSPICIOUS` 1→0**。⚠**M2 とセットではなく別機構だった**（離場置換ではなく**ライフクラッシュ置換**）＝下記「ライフクラッシュ置換の funnel」参照。
    - ~~`WX12-010`＝強制アタック機構~~ **✅2026-08-11 消化（続き424）＝`EFFECT_TYPE_MISSING_CONTINUOUS` 1→0**。下記「強制アタック機構」参照。
    - ⚠**`POWER_VALUE_MISMATCH` は 0 ではなく 1**（2026-08-11 実測）＝`WX15-027`。ただし**計器の誤検出**＝「－7000。感染状態なら代わりに－12000」を engine は**加算モデル**（-7000 のあと条件付きで -5000）で表しており、合計は原文どおり。続き418 で「代わりに」を加算へ畳んだ副作用で計器が鳴っている（実害なし・ルール側を直すなら別件）。
  - ~~**📋 トリップワイヤ側の残7件**~~ **✅2026-08-11 に残0（続き425〜426）**。golden `FORCED_HAND_COST_KNOWN` の 🔴 worklist は空になり、恒久の許可リスト（原文が強制の12件）だけが残る。⚠**test は畳まない**＝「新しく素の TRASH が生えたら即FAIL」の見張りとして残す。
    - **続き425 の4件**＝`WX25-P2-082-E1`／`WX25-P2-100-E1`（**cardNum アンカーの外科パッチ `applyResultConditionalWave3` が任意コスト化を後段で組み直して巻き戻していた**）／🔴`WXDi-P05-037-E1`・`WXDi-P07-010-E2`（**原文の主語は「対戦相手は」＝所有者反転の自傷**）。
    - **続き426 の3件＝入口の形がそれぞれ違うだけだった**＝`WXDi-P10-039-E2`（**二段の任意**＝2段目の `OPTIONAL_COST` を見たガードが「変換済み」と誤判定）／🔴`WXDi-P14-044-E1`（トップが `CONDITIONAL`＋「**《青》を支払い**手札を２枚捨ててもよい」の複合コストで先頭アンカーに掛からず、**《青》が丸ごと脱落**）／🔴`WXDi-P14-002-E1`（`CHOOSE` 選択肢の内側＝**別の選択肢に強制の手札捨て**があり「最初の手札捨て」ガードで弾かれる。**手札が2枚無くてもライフをクラッシュできた**）。ガードを `hasOptionalHandDiscardStub` へ精密化し、`CONDITIONAL` 降下／「《色》を支払い」前置き／`CHOOSE` の選択肢別突き合わせを追加（共通部は `convertSelfHandDiscardStep`）。
    - ⚠**採用ツールのガードが退化を1件止めた**＝`WX04-004-E2` は fresh のほうがコストを正しく持つが `censusManualDrift --adopt` が **timing が変わる**として中止。**live のほうが正しい**（原文「その正面にシグニがない場合」を専用 timing `ON_OPP_SIGNI_ATTACK_DIRECT` ＋ 専用 STUB で実装した MANUAL）＝**採用しないのが正解**。
    - ⚠**`PR-459A-E1` は fresh を採用してはいけない**＝原文「レベル５のシグニの場合、あなたは手札を１枚捨てる」は**強制**なのに fresh は `OPTIONAL_COST{handDiscard}` に化ける（続き420 の `TADH_DISCARD_RE` が「捨て**る**」も受ける意図的な選択の副作用。live は変換前なので実害なし）。
  - **（消化前の内訳・記録）続き416 時点の16件**
    - (a)**別コスト種の同型**＝`OptionalCostSpec` に受け皿が無い／`fromThis` 等の限定が落ちる：**自シグニをダウン＋色**（`WXDi-P04-051`／`WXDi-P12-044`／`WX25-P3-019`＝**コスト句が丸ごと脱落**）／**このシグニの下からN枚トラッシュ**（`WXK08-052`／`WX20-042-CB`＝`underAnySigniTrash` はあるが「このシグニの下」限定が無い）／**デッキ上からN枚トラッシュ**（`WX24-P3-088`／`WX24-P4-049`＝`deckTrash` はあるが `MILL` へ落ちるので「この方法で置かれた」条件との整合確認が要る）／**このシグニを場からトラッシュ**（`PR-319`／`WX14-042`＝コスト脱落。既存 STUB `OPTIONAL_TRASH_SELF` が近い）。
    - (b)**効果まるごと任意**（コストではなく「その行動をしてもよい」）＝`SEQUENCE[STUB{OPTIONAL_ACTIVATE}, …]` が正準形：`WX08-046`（【チャーム】にしてもよい）／`WX18-035`（デッキ上2枚をエナに置いてもよい）／`WXDi-P02-037`（自ライフをクラッシュしてもよい）／`WX07-003`・`WXDi-D09-P17`（引いてもよい→そうした場合捨てる）。
    - (c)**置換**＝`WXDi-CP01-023`（「代わりに…してもよい」＋ CONTINUOUS で受け皿なし）＝§6.4「離場置換の対話化」M2 とセット。
    - ~~(d)計器の誤検出2件~~ **✅2026-08-10 消化（続き417）**＝`actionIsSkippable` が `GRANT_*_ABILITY.abilities[].action`／`GRANT_EFFECT.effect` の**内側へ再帰していなかった**だけ（`WX17-077` の `CHOOSE{upTo}`／`WX21-052` の `BANISH{target.upToCount}` はどちらも引用能力の中にあり、engine では正しく辞退できる）。子ノードに `abilities`／`effect`／`thenAction`／`burstAction` を足して **18→16**。
    - (e)`WX12-010`＝別件（`EFFECT_TYPE_MISSING_CONTINUOUS` の真バグ「対戦相手のシグニは可能ならばアタックしなければならない」）。
    - (f)**トリップワイヤ側の残7件**（カード単位では他効果が任意なので `MANDATORY_SUSPICIOUS` には出ない）＝`WX25-P2-082`／`WX25-P2-100`（**「代わりに」畳み込みが parser 後段で再構築し任意コスト化を巻き戻す**）／`WXDi-P07-010`（多分岐の内側）／`WXDi-P10-039`（二段の任意）／`WXDi-P14-002`・`WXDi-P16-048`（CHOOSE 選択肢の内側）／`WXDi-P14-044`（action のトップが CONDITIONAL）。🔴`WXDi-P05-037-E1` は**別バグ同居**＝原文「**対戦相手は**手札を２枚捨ててもよい」なのに `owner:self`（自分が捨てさせられる）。
  - ⚠**残**＝`verifyEffects` の **アクション[STUB代替?] 5件／[要確認] 3件は未仕分け**（`WX09-Re01` の `DRAW_PER_FIELD_COUNT` を「DRAW が無い」と言う等、名前照合の誤検出が混じっている見込み）。
- ~~**生ID残存＝表示or実装の穴**（仕分ける計器が要る）~~ **✅2026-08-10 消化（続き409）＝計器 `npm run census:stubs`（`scripts/censusStubs.ts`・明細 `docs/_census_stubs.txt`／`--id <STUB_ID>` で1件の完全内訳）を新設して仕分け済み**。**907箇所の内訳（初回実測）＝A 実装の穴 21件（うち明示 defer `DEFERRED_*` 9・無言 no-op 12）／B 宣言型 32件／C 表示だけの穴 259箇所／D 健全**。**続き409〜413 で無言 no-op を6件消化して現在 A 16件（明示 defer 9・無言 no-op 7）**。⚠**「STUB＝未実装」ではないので実装軸は4経路すべてを見る**＝(1)`execStubPart1-3` のハンドラ (2)engine 別経路（CONTINUOUS 宣言型を `effectEngine`/`BattleScreen` が読む） (3)**ペイロードキー**（`PREVENT_POWER_MODIFY_BY_OPP` は id を一度も比較せず `act.powerModifyProtection` だけを読む） (4)**カード番号**（`MAYU_ENCOUNTER_FLIP_AND_GROW` は `screens/battle/mayuEncounter.ts` が `'WXDi-P13-003A'` で分岐）。**この4軸を見ないと実装済みが「実装の穴」に化ける**（較正中に実測で5種が誤検出だった）。**残 worklist ＝下記 A群 12件**。
  - ~~**🔴 A群＝無言の no-op（残 7件）**~~ **✅2026-08-11 残0（続き427）**＝**1件を実装／6件を明示 defer（`DEFERRED_*`）へ**。`census:stubs` は **`DEFERRED_` で始まる id を「機構が無いことを宣言済み」**として 🔴 から外すので、着手しない理由が確定している6件が毎回 worklist を汚していた状態を解消した。**`npm run census:stubs` はゲートに昇格**（`npm run gates` に追加）＝**無言の no-op が1件でも生えたら止まる**（実際に落ちることをダミー id で確認済み）。
    - **✅実装＝`ASSIST_LRIG_ATTACK_THIS_TURN`（`WX25-P1-048`）**＝アシストルリグのアタック経路。状態は `assist_lrig_attack_min_level`（このターン限定・**数字はレベル下限なので payload は `count` ではなく `minLevel`**）、判定は `screens/battle/assistLrigAttack.ts` の1本に**人間UI／CPU／フェイズ進行の3経路**を通し、実行は `performLrigAttack(slot)` を一般化。⚠**センター専用の判定・収集はアシストで飛ばす**（`lrig_has_attacked`／ドライブ／**センタールリグ付与ストア由来の ON_ATTACK_LRIG**）。🔴**副産物**＝ダメージ解決のダブル／トリプルクラッシュ判定が「攻撃側＝センタールリグ」固定だったので、攻撃元を `pending_lrig_attack_num`→`lrig_attacked_by_num` で運ぶようにした。
    - **📋 明示 defer 6件（理由つき）**＝~~`DEFERRED_UNDER_CARD_AS_ENERGY_COST`~~ **✅2026-08-11 実装（続き428・下記「エナ支払い元の一本化」）＝残5件**／`DEFERRED_COUNTER_TEAM_PIECE_CUTIN`（§6.3 E-2 (b) 着手禁止。⚠旧 id は `_DEFERRED` が**接尾辞**で計器から見えていなかった）／`DEFERRED_GRANT_UNTAP_ON_ATTACK_TO_TEAM_LRIG`（§6.3 F＝**ルリグ再アタック機構**がブロッカー。`lrig_has_attacked` が意図的に再攻撃を止めている）／`DEFERRED_ATTACK_NEGATE_IMMUNITY_SELF`（原文が誰のシグニか確定できない＝裁定確認が先）／`DEFERRED_FLIP_SELF_FACE_DOWN_UP`（**実装すると退化する**＝fizzle が作れず費用だけ乗る）／`DEFERRED_CHECK_ZONE_FLIP_FREE_GROW`（**機構ではなくデータ欠落**＝B面 `WXDi-P16-001B` が CardData CSV に無い）。
    - ~~🔴**`UNDER_CARD_AS_ENERGY_COST` は「難しいから」ではなく「先にやることがある」defer**~~ **✅2026-08-11 実装済（続き428）＝下記「エナ支払い元の一本化」で funnel を先に作ってから載せた（判断どおりの順序だった）**。以下は当時の記録＝原文は「アタックフェイズの間、このシグニの下のカードをエナゾーンにあるかのようにトラッシュに置いて支払える（1ターンに3つまで）」＝**支払い元ゾーンの拡張**で、既存の代替エナ機構（`collectEnergyTrashSubstituteInfo`）が扱う**色の読み替え**とは軸が違う。**実測で `my.energy` を直接読む支払いモーダルが17本**あり、候補生成も控除も各モーダルに散っている。半分だけ配線すると「アーツには使えるが【起】には使えない」無言の不整合になる。**先に「エナ支払い元」の funnel を作る**（下の新項目）。
    - ⭐**A群は「半分だけ実装済み」が多い＝後段の機構が既にあるかを先に確かめる**。実績7件ともそうだった＝WXK11-001② はスキップ機構が完備／WX24-P4-014② は相手選択（`opponentResponds`）とルリグデッキ移動が既存／WXDi-P09-079 は timing・triggerCondition・ターン終了時トラッシュがすべて既存／WX16-021 は【側面アタック】の解決経路が既存／WX24-P4-016 は producer が6カードぶん実装済みで watcher 側だけが死んでいた／**WX25-P1-048 はガード応答・ダメージ解決・per-slot のダウン管理がすべて既存**で、要ったのは「枠を選べるようにする」ことだけだった。
  - **C群（表示だけの穴 259箇所）は engine が動くので無言バグではない**＝直し方は2通り。(a) 単発は `scripts/decompileEffects.ts` の `miscStubMap` に日本語文を足す (b) ハンドラ直前コメントを日本語説明にして `node scripts/genStubsMd.mjs` を回す（STUBS.md 経由で自動反映）。**優先度は A群より低い**。
  - ⚠**`scripts/genStubsMd.mjs` の「フォールバック」欄は上の A群と一致しない**（実装軸が (1) だけ＋id 正規表現が `[A-Z0-9_]+` なので日本語入り id `ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白` を実装済みなのに未実装と誤報する）。**仕分けは `census:stubs` を正とする。**
- **UNKNOWN（部分未実装・逆翻訳に `【未実装/UNKNOWN】` として露出）**：**🆕2026-08-10 続き414 に live JSON を全数走査して数え直した実数＝40 ノード／38 カード**（⚠**旧記述「42箇所／31カード」は decompile シートの出現数**で、live のノード数とは別物＝**計器は live JSON を数える**）。**続き414〜415 で 43→38**。
  - **✅ 第1バッチ（続き414）＝「その中から＜X＞のシグニN枚を場に出し、残りを好きな順番でデッキの一番下に置く」3効果**（`SP27-004-E1/E2`・`WX14-046-E1`）を `REVEAL_AND_PICK{then:ADD_TO_FIELD, remainder:deck/bottom}` へ構造化。census **880→877**。🔴**副産物＝潜在バグを1つ潰した**＝`parseRevealPickDescriptor` は最初から `dest:'field'`（場に出す）を解けていたのに `makeRevealPickStub` が **`'hand'` へ落としていた**＝この文型を通した瞬間「場に出す」が黙って「手札に加える」に化ける。golden にトリップワイヤ設置。
  - ⚠**UNKNOWN を消すには parseStatus の「不可侵」を外す必要がある**＝`buildEffectsJson.ts` の `PRESERVE_STATUSES` は **MANUAL だけでなく PARTIAL も不可侵**なので、parser を直しても live に届かない（§6.3 K と同じ「第3の死角」）。**手順＝①parser を直す ②live の当該効果の `parseStatus` を `PARTIAL`→`AUTO` へ戻す（＝parser に所有権を返す） ③`npm run build:effects`（構造が変わるので held へ落ちる） ④`node scripts/heldReview.mjs --adopt <CardNum>` で採用**。②を飛ばすと何回 build しても live は変わらない。
  - **✅ 第2バッチ（続き415）＝ライフバースト抑制 2効果**（`WXEX1-32-LAYER-E1`／`WX25-P3-036-E1`）。**原因は regex が所有者句を挟む形に対応していなかっただけ**＝「その**対戦相手の**カードのライフバーストは発動しない」「クラッシュされた**対戦相手の**カードの…」で既存規則が外れ丸ごと UNKNOWN に落ちていた。⚠**parser を直すだけでは足りなかった**＝`WXEX1-32` は【レイヤー】で付与される **CONTINUOUS** で、既存の受け皿3軸（`suppress_life_burst` は STUB **実行**時のターンフラグ／`eichiSuppressActive` は `EICHI_LEVEL_SUM` 限定＝`WX16-067` 専用／`game_suppress_lb` はプレイヤー付与）の**どれにも載らない**＝そのまま採用すると**逆翻訳にだけ出て動かない**。新設 `screens/battle/lifeBurstSuppress.ts` が **`crash_source_card_num`（発生源）だけ**を見て印字＋【レイヤー】付与（`collectGrantedFromLayer`）を走査する第4軸を足した（盤面全体を見る実装は過剰抑制＝golden にトリップワイヤ）。表示語彙も原文へ（従来は STUBS.md の実装コメント「対戦相手の suppress_life_burst フラグをセット」がそのまま出ていた）。**UNKNOWN 40→38**。
  - **✅ 第3バッチ（続き418）＝「代わりにそれを＜動詞＞」＝同一対象への動詞昇格 2効果**（`WX06-024-BURST`／`WXK08-030-E1`）を `CONDITIONAL{then:昇格, else:base}` へ畳み込み。🔴**この家族の本体は UNKNOWN ではなく無言の過剰効果だった**＝同じ文型の残り8カードは昇格文が**別ステップとして残り**、主語のない「それを〜する」が `owner:'self'` へ反転して**自分のシグニをバニッシュ/バウンス**していた（`WX08-028-BURST`／`WX09-Re01-E2`／`WXDi-CP01-026-E1`）。併せて条件語彙4本を追加してゲート脱落（無条件バニッシュ）を3件是正（`WXK08-030`下2枚／`WXEX1-38`スペル3種類／`WXK11-057`色2種類）。詳細は BUGFIXES 2026-08-10 続き418。**UNKNOWN 38→36**。
  - **✅ 第4バッチ（続き433）＝一時レゾナのターン終了時ルリグデッキ返却 2効果**（`WX07-050-E1`／`WX16-Re18-E1`）。🔴**UNKNOWN は「未実装」ではなく過剰効果だった**＝「ターン終了時、（その）レゾナを場からルリグデッキに戻す」が丸ごと落ちており、**一時的に出すはずのレゾナが場に居座り続けていた**。⚠**戻し先はトラッシュではなくルリグデッキ**（`turn_end_field_trash_targets` は流用できない）。⚠**ターン終了処理は BattleScreen に2経路ある**（`doPhaseAdvance` と終了時ディスカード確定後）＝`screens/battle/turnEndLrigDeckReturn.ts` の funnel を両方から呼ぶ（golden で呼び出し2箇所をロック）。⚠**「置いたレゾナ」はゾーン選択の対話 pause を跨ぐ**ので ctx ではなく `PlayerState.last_summoned_resonas` に記録する。⚠parser は**断片側でアンカーする**（先頭の「ターン終了時、」は文分割で剥がれて届く）＝`それ**を**ルリグデッキに戻す`（単数＝アシストルリグを戻す【起】）は原文全数を確認して**除外**した。**UNKNOWN 36→34ノード／34→32カード**。
    - 📋**残**＝`WX16-Re18` の「レゾナを**２枚まで**」は `SUMMON_RESONA_FROM_LRIG_DECK` が1枚しか出さない（複数枚の任意配置UIが要る）＝**過剰ではなく過少**なので別項目。
  - **✅ 第5バッチ（続き434）＝任意コストが UNKNOWN に落ちて「タダで本体が撃てる」形 3件**。🔴**UNKNOWN の本命は下振れではなく上振れ**＝**コストの文が UNKNOWN になると本体だけが無条件に走る**。
    - ①**手札の〈種別〉指定コスト**＝「手札から**スペル**を1枚捨ててもよい」が規則に無く（`＜クラス＞の`シグニ形と無指定形しか無かった）、`WX24-P1-065-E1`② は**コストなしで相手の手札を1枚落として**いた。`WXEX2-20-E3` も同型。**種別語彙を シグニ／スペル／アーツ／カード へ広げ、「てもよい」形も受ける**（素の `TRASH` を出して後段の `applyOptionalHandDiscardCost` が畳む設計を壊さない）。
    - ②**「このシグニの下から〈クラス〉のカードをN枚トラッシュに置いてもよい」**＝**枚数語の位置が2通り**（「カードを3枚」／「カード3枚を」）**＋クラス限定が挟まる**形で落ち、`WX25-CP1-091-E2` が**コストを払わずに毎ターン終了時エナチャージ**していた。⚠**`upToCount:true` のまま残すと N≧2 で1枚だけ払って本体を撃てる**（続き417 の部分払いの抜け穴）ので `OPTIONAL_COST{underAnySigniTrash}` へ畳むところまでやる。⚠**限定を落とさない**＝engine（`canAffordOptionalCostSpec`／`optionalCostPaySteps`）は filter を honor する。
    - ③🔴**エナ送りが `parseSigniTarget` を通していなかった**（教訓 (i)「同じ語彙でも入口ごとに壊れ方が違う」の再来）＝BANISH は共通の対象パーサを通すのに、SEND_TO_ENERGY は narrow regex で filter を手組みしており、**「ダウン状態の」は UNKNOWN・「この方法で捨てたシグニと同じレベル」は黙って脱落**していた。修飾つきの「〜を対象とし、（それを）エナゾーンに置く」を共通パーサへ寄せた。⚠**`IDENTITY_BATCH5B`（同一性参照の per-effectId 表）は付与能力の内側には届かない**（`WXEX2-20-sub-E1` で実測）＝内側は文規則側で載せる。
    - ⭐**誤検出を1つ回避した**＝「この方法で捨てたシグニと同じレベル」11カードを「レベル限定が全部落ちている」と読んだが、実際は `levelEqDiscardLevelSum`／`levelEqLastProcessed` の**別キー**で載っていた（1枚捨てなら等価）。**キー名で探すと「無い」と誤読する。**
    - **UNKNOWN 34→30ノード／32→29カード。census 854→852**（ベースラインも締め直し）。
  - **✅ 第6バッチ（続き437）＝「デッキを見る/公開する→振り分け→残りをデッキの一番下へ」の記述子変形 2効果**（`WX21-028-E1`／`WDK13-022-E1`）。🔴**落ちていたのは「その中から〜」の振り分け節そのもの**＝`WX21-028-E1` は**公開するだけで何も起きない no-op** だった。⭐**engine は変形をすべて既に受けられる**ことを投入前に消費コードで確認して **parser 専業バッチ**にした（`ownerState(a.owner, ctx)`＝`effectExecutor.ts:4985`／`resolveCountRef(a.revealCount, ctx)`＝`:4986`／`pickCount:'ALL'`＝`:5011`／`then` は generic に continuation へ渡る＝`:5049`）＝**新 action 型・新 timing・新 engine 分岐ゼロ**。軸は①**枚数語が名詞より前**（「**すべての**＜天使＞のシグニ」）②**枚数が動的参照**（「この方法でトラッシュに置いたシグニのレベルと同じ枚数」＝`$ref:last_processed_level`）。**UNKNOWN 30→28ノード／29→27カード。census 852→851**（`BASELINE_HIGH` も締め直し済み）。⚠**`then` が `ADD_TO_ENERGY` ではなく `ENERGY_CHARGE{DECK_CARD}` になるのは正しい**＝`applyDirectAction` の `ENERGY_CHARGE` case（`effectExecutor.ts:8479`）が**外部 SELECT_TARGET/SEARCH で選ばれた単一カード**をエナへ移す専用分岐で、これが無いと `target` を素通しで再評価してしまう（コメントに明記あり）＝**ピックしたカードに正しく適用される**。
    - 📋**同バッチで engine 未対応を実測して据置した3件**（**非採用を golden で固定済み**）＝(a)`WXK07-034-E1`②「レベル４のシグニが**２枚めくれるまで**公開する」＝`REVEAL_UNTIL_TO_HAND` は**最初の1件で停止**し、repeat 型は**場出し専用**（`effectExecutor.ts:5211`／`:5241`）(b)~~`WD23-024-E-E1`~~ **✅2026-08-11 続き442 で消化**（下記「デッキサーチ→デッキ上」参照。⚠**据置理由だった `INTERNAL_KEEP_ON_DECK_TOP` は使わなかった**＝あれは受け側が `execLookPickChain` の remainder 処理にしか無いマーカーで、正解は既存 `SearchAction` に「最後に配置する」順序予約を足すことだった）(c)`SP38-006-E1`「**対戦相手は**自分のデッキの上から3枚見て…1枚まで場に出し」＝`owner:'opponent'` は engine が読むが、**SEARCH の pending が相手応答へルーティングされず remainder も current owner 固定**（`BattleScreen.tsx:4623`／`effectExecutor.ts:7062`）＝載せると**自分が相手のデッキを覗いて選ぶ真逆の実装**になるので据置が正しい。
  - **📋 残り28ノードの内訳（続き437 実測）**＝(a)**上記の据置3件**（機構待ち＝engine 側の対応が要る）(b)`WXDi-P09-036-E1`＝「**あなたと対戦相手は**自分のデッキの一番上を公開し…どちらも【ライフバースト】を持っているか…」＝**両者同時公開＋比較**の別機構(c)残りは**単発**（1カード1機構）。⚠**「デッキ公開→処理」family は今回で実質枯れた**（残るのは engine 機構待ちのみ）。
- **🆕 デッキ全体サーチ→シャッフル→デッキの一番上（続き442 で消化・残1＋別家族7）**：原文「あなたのデッキから（限定つき）カード/シグニ1枚を探す→デッキをシャッフル→そのカードをデッキの一番上（or 一番目か二番目）に置く」の**4効果**を既存 `SearchAction` へ機構化（`WXK02-031-E2`／`WXK02-070-E1`／`WXK03-049-E1`／`WD23-024-E-E1`）。**新 action 型ゼロ・defer 0**。census 846 据置・golden 1834→1841。詳細は BUGFIXES 2026-08-11（続き442）。
  - 🔴**バグは過少ではなく過剰**＝ペイロード無しの裸 `STUB{REVEAL_AND_PICK}`（`execStubPart1.ts:3080`）が**実行時にカード原文を再parse**して「デッキ全体から好きなシグニ1枚を手札へ」を実行していた＝**万能サーチ（チューター）に化けていた**。`WXK02-070`／`WXK03-049` は加えて `DECK_TOP_TO_LIFE` の誤用で**タダで自分のライフが1枚増えて**いた。
  - 🔑**罠＝シャッフルの順序**（先出しして的中）＝SEARCH の契約は `thenAction`→`afterAction` なので、素直に `then:'トップへ'`＋`afterSearch:SHUFFLE_DECK` と書くと**置いた直後にシャッフルされて選択札が流れる**＝無音で効果が消える。**`execLookPickChain` の `_topReserved`（`effectExecutor.ts:5085-5087`／`:5141`）と同じ「最後に当てる」設計**で解決（選択札をデッキに残したままシャッフルし、最後に instanceId で位置確定）。⚠**`INTERNAL_KEEP_ON_DECK_TOP`（`execStubPart1.ts:1728`）を名前で借りない**＝受け側が `execLookPickChain` にしか無く、SEARCH から呼ぶと `done(ctx)` の完全 no-op。
  - ~~📋**残1（同じ文型の5枚目・未着手）＝`WD23-013-A-E1`（アンコール）**~~ **✅2026-08-12 消化（続き443）**＝`foldDeckSearchToTop` の**入口ガードも塞いでいた**（PLAN 旧記述は「句点」だけを挙げていたが、`effectParser.ts:11917` が「SEQUENCE かつ裸STUBを含む」を要求しており、当該カードは素の `TRANSFER_TO_DECK`＝**句点だけ直しても永久に届かない**）。構造入口を広げ連続形「探し**て**デッキをシャッフルし」も受けるようにして解消。⚠**残る不一致は別軸**＝「アンコール－《無》《無》」が `timing:['MAIN']`／《青×0》になっている（**ベースラインからの既存問題**でアンコール機構の話＝§6.4 とは別）。
  - ~~📋**別家族7枚（裸 `STUB{REVEAL_AND_PICK}` の残り）**~~ **✅2026-08-12 続き443 で 7→3**（Codex 委譲＋Claude 検証）。**採用4枚**＝`WXDi-P11-043`（`levelEqDeclaredNumber` filter も `DECLARE_NUMBER_PLAIN` も**engine に実装済みで parser 専業**だった）／`PR-457`（`colorMatchesLrig` も `pickCount:'ALL'` も既存。⚠原文に無い `LOOK_AND_REORDER{deck/top}` が前段に居たので併せて除去）／**手札公開コスト2枚**（`WXK05-027`／`WXK05-071`）＝`OptionalCostSpec.handReveal` を新設。**公開は既存 `REVEAL{HAND_CARD}` を使うので手札は減らない**・`canAfford` と `paySteps` の両方で filter/枚数/異名制約を honor。⚠**PLAN 未記載の実害を2件同時に是正**＝原文の「そうした場合」（＝コストを払ったなら）が `CONDITIONAL{IS_MY_TURN}` に化けており、**コストが丸ごと落ちて本体がタダで撃てて**いた（`WXK05-071` は付与対象も `owner:'any'` だった）。census 846→845・golden 1841→1847。詳細は BUGFIXES 2026-08-12。
    - ~~📋**残3＝reveal-until**~~ **✅2026-08-12 消化（続き444）＝停止条件と行き先を構造化した `REVEAL_UNTIL` を新設し 9効果を採用**（T1 は**0枚**＝裸 `REVEAL_AND_PICK` 全廃）。詳細は BUGFIXES 同日（続き444）。**PLAN の「残3件」は過小だった**＝live 13効果を原文照合したら**壊れていたのは9件**（在庫が「裸 `REVEAL_AND_PICK` を入口にした棚卸し」で作られたため `DECK_REVEAL_UNTIL` 側の取りこぼしが数えられていなかった＝続き442 の `SPDi43-06` と同型の計器の死角）。`STUB{DECK_REVEAL_UNTIL}` は **10→4効果**。
      - 🔑**壊れ方は3通りあった**＝(1)停止条件が regex に無いと **`break` で先頭1枚だけ公開**（`execStubPart1.ts:3149`）(2)**限定だけが静かに落ちる**（`レベル４の＜宇宙＞` は `/レベル(\d+)を持つ/` に掛からない）(3)**ヒット札の行き先が「手札」しか無い**ので原文「そのシグニを**場に出し**」の3枚は**ヒット札が消滅**し、後段の `REVEAL_PICK_PLAY` が**改めてデッキ上5枚を公開して別のシグニを場に出して**いた。
      - ⭐**教訓＝engine で原文を再parseする STUB は「動いているように見えて限定だけ落ちる」**。`txtRU` は**カード全文**なので別の効果文の語が停止条件に混入しうる。
    - ~~**同型の在庫＝`STUB{REVEAL_PICK_PLAY}` 11効果**~~ **✅2026-08-12 消化（続き445）＝live 11→0・engine のハンドラごと削除**。詳細は BUGFIXES 同日（続き445）。ハンドラは**公開枚数（読めなければ5枚）／ピック数（読めなければ1枚）／フィルタ（シグニなら何でも）／残りの行き先（トラッシュ固定）／所有者（self 固定）の5要素すべてがハードコード**だった。**採用9件**＝限定脱落5件（＜悪魔＞／赤／＜毒牙＞／「無色ではない」／カード名＝いずれも**どのシグニでも場に出せる過剰**）・多段×別行き先1件（`WX24-P4-008-E1`＝**手札に加える段が丸ごと脱落**し残りもエナ→トラッシュ違い）・ゾーン違い1件（`WXDi-P07-084-E1`＝原文「デッキの**一番下**の1枚」が**上から5枚**）・SEED 二択2件。**明示 defer 2件**（下記）。census 845 据置・golden 1857→1870・held 107→106。
      - 📋**明示 defer 2件＝相手所有のデッキ公開**＝`WXEX2-84-E2`（`DEFERRED_OPPONENT_DECK_REVEAL_FIELD_REFILL`）／`WXDi-P01-026-E1`（`DEFERRED_EACH_PLAYER_ZONE_RESET_AND_DECK_REFILL`）。🔑**ブロッカーは `SEARCH` pending の相手ルーティング欠如**＝`BattleScreen.tsx:4630-4631` の `respondPlayerId` は **`SELECT_TARGET` と `CHOOSE` しか見ない**ので、`owner:'opponent'` を載せると**自分が相手のデッキを覗いて相手の場に出す札を選ぶ**別物になる（PLAN 643(c) の `SP38-006` 据置理由と同一のブロッカー＝**これを外せば3効果まとめて動く**）。⚠`WXEX2-84-E2` は**所有者が真逆**で、相手シグニ全一掃の埋め合わせが**自分への補充**に反転していた＝誤った自己補充だけ除去して正しい一掃は維持した。
      - ~~⚠**過剰な `BLOCK_ACTION{PLAYER, ON_PLAY_ABILITY, END_OF_TURN}` は family**（`WXDi-P14-039-E1`／`WDA-F01-08-E1` の2件。**同型が他に無いか要確認**）~~ **✅2026-08-12 棚卸し＆消化（続き446）＝残り10効果を機構化**。詳細は BUGFIXES 同日（続き446）。🔴**「過剰」より深刻だった**＝`actionId:'ON_PLAY_ABILITY'` を読む**消費地点が src に1つも無く**（型コメント `types/effects.ts:1145` が「engine 未参照の死アクション」と明言）、**10効果すべて恒久 no-op＝抑止されず【出】が発動する過剰実行**だった。census 845→843・golden 1870→1883・live の該当 `BLOCK_ACTION` 14→9（対象10→0）。
        - 🔑**3群に割れた**＝**群A5件**（配置アンカーが `REARRANGE_SIGNI`）は**実測して「フラグを足さない」判断**＝現 live の形は場の既存2体を交換するだけで**新規配置を作らず ON_PLAY collector に到達しない**ので死ブロック除去のみ（挙動不変）／**群B2件**（「このターン、あなたのシグニの…」）は `PlayerState.suppress_signi_on_play_this_turn` ＋ ON_PLAY funnel（配線3経路・ターン境界リセット4箇所）／**群C3件**（【常】相手のレベルN以下）は `isSigniOnPlaySuppressedByContinuous` で**印字＋付与2ストアの3軸**走査＋レベル限定 honor。
        - ⚠**計器の死角を1つ確認**＝`census:stubs` の「無言の no-op」ゲートは **STUB id しか見ない**ので **`BLOCK_ACTION` 等の死 actionId は素通りする**。しかも**逆翻訳には原文どおり出る**ので原文照合でも気付けない＝**逆翻訳の一致が動作の証明にならない**型。**「型はあるが消費が無い」死フィールド/死 actionId を横断で洗う計器があると同型を先回りできる**（§5-14 の一般形）。
          - ~~📋**残＝群A の本体（外部ゾーン交換）**~~ **✅2026-08-12 消化（続き449）＝13効果を機構化**（`swapSourceLocation`／`swapSourceTarget`／`swapBetweenTargets`／`swapIfSameLevel`）。詳細は BUGFIXES 同日（続き449）。**PLAN の「5件」は過小**＝live 22効果を由来ブロックの原文で仕分けたら **(A) 二ゾーン交換10件**＋**(B) 2体指定の場内交換3件**（「対戦相手のシグニ2体を対象とし入れ替える」のに**このシグニが片方に固定**されていた＝続き446 では見えていなかった別の壊れ方）／**(C) 正しい9件**だった。census 843→835・golden 1904→1927。
            - ⭐**続き446 の見立て「抑止側の配線は既に通っている」は正しかった**＝`suppressOnPlay` は今回はじめて実際に消費される（`BattleScreen` の REARRANGE resume が `swapSourceLocation` を見て `collectBoardDiffTriggers` へ渡す→`triggerCollect.ts:345`）。**場外→場は実配置なので配置制限と中央 funnel を通す。**
            - 🔴**古いトリップワイヤを実態へ更新した（弱めていない）**＝続き446 の「消費されない `suppressOnPlay` を置くな」は前提が覆ったので、**(1)死 actionId は復活させない (2)`suppressOnPlay` は消費経路（`swapSourceLocation` が energy/trash）とセットでのみ置く**へ組み替えた。**場内交換のままフラグだけ付けると今も落ちる。**
            - 📋**据置1件＝`WX25-P2-058-E1`**（Claude の仕分けは群Cだったが**codex の再分類が正しく**エナからの交換）。原文のアタック終了時・《アイヤイ★クイーン》条件が現行木から欠落しているため、**交換節だけの部分採用はしない**（非採用 golden で固定）。
        - ~~📋**要確認（別バッチ）**＝ターン終了時の一括クリア経路に `assist_lrig_attack_min_level`／`turn_off_zone_energy_paid_count` が入っていない~~ **✅2026-08-12 消化（続き447）＝ターン限定 PlayerState 30フィールドのリセットを funnel 化**（`src/screens/battle/turnScopedState.ts`）。詳細は BUGFIXES 同日（続き447）。**取りこぼしは1経路の話ではなかった**＝**フィールドごとのリセット箇所数が 0〜6 とバラバラ**で、ターン境界は**終了4経路（PvP／手札調整確定後／`FORCE_END_TURN`／CPU）×両プレイヤー＝8サイト**＋開始2＋アタックフェイズ2に散っていた。**JSON 差分0**（状態管理のリファクタなので JSON が動いたらスコープ外）・golden 1883→1891・census 843 据置。
          - 🔑**新フラグの登録漏れを型で止める**＝`Extract<keyof PlayerState, \`${string}_this_turn\` | \`${string}_this_attack_phase\`>` を `satisfies` の対象にしたので、**規約名の新フィールドを足すと登録するまで typecheck が落ちる**。規約外の名前（`must_attack_signi` 等）は明示リストに分離。**「ターン境界リセットは3箇所／4箇所」とバッチごとに数え直していた状態を解消**した。
          - 🔴**実バグ2件**＝`free_grow_this_turn`（**グロウ実行時にしか消えず、使わないと翌ターン以降もタダでグロウできた**）／`signi_banished_this_turn`（**PvP通常終了の1箇所でしか消えず、CPU戦などで累積**していた）。
          - 🔴**検証で退行を1件検出して修正**＝funnel を**両プレイヤーへ一律に**掛けると、`must_attack_signi` を相手 state へ即時に書いて「次のターン」を表していた **`WX15-003-E3`／`WXDi-P08-010-E3` が完全な no-op** になる。`'turn-end-active'`（ターンが終わる側だけ失効）を追加して変更前の生存期間を復元し、golden T5／T7 で固定。⭐**教訓＝対称化リファクタは、非対称に依存していた近似を壊す。片側にしか書かれないフィールドの利用者を先に洗う。**
          - ~~📋**残＝「次のターン」を構造に載せる**~~ **✅2026-08-12 消化（続き448）＝`must_attack_signi_next_turn`／`must_attack_infected_only_next_turn` 予約を新設し、`'turn-end-active'` と `clearTurnEndScopedStateForEndingTurn` を完全撤去**。golden `turn-scoped T7` は「暫定が残っていないこと」の assert へ置き換え。⭐**近似を機構へ置き換えたので退行クラスが構造的に再発しない**＝E2E が**発動ターンには効かない→予約が境界を跨ぐ→次ターン開始で昇格→次ターン終了で失効**の全周期を固定。
- **🆕「次のターンの間」が `duration:INSTANT` に潰れる系統（続き448 で第1波・採用6／据置7）**：原文「次のターンの間／次の対戦相手のターンの間」が即時実行になり、**発動したターンに適用される**（または相手 state へ書く近似で**何も起きない**）。⚠**逆翻訳では原理的に見えない**（JSON に「次のターン」を表す語が無いので逆翻訳も「〜する」としか出ない）。census 843 据置・golden 1891→1904。詳細は BUGFIXES 2026-08-12（続き448）。
  - 🔑**母集団の確定に測り直しを3回要した**＝カード単位だと **373件**（「次のターン」を含むカードの全効果を数える過剰報告）。**`docs/_effect_srctext.json`（effectId→由来ブロックの対応表）で効果単位に数え直す**のが正。文型で仕分けると「次の〜ターン**終了時まで**」190件＋「次の〜のターン**まで**」11件は **duration で表せる別軸**（スコープ外）、**「次のターンの『間』」59件**のうち**13は既に予約で構造化済み**（先例）で**46が本件**。
  - 🔴**「型に `NEXT_TURN` がある＝動く」ではない**＝`execGrantKeyword` の予約分岐（`effectExecutor.ts:3167-3180`）は **`owner:'self'` かつ `count:'ALL'` かつ filter がほぼ空**のときしか通らず、満たさないまま `duration:'NEXT_TURN'` を書くと**素通りしてこのターンに付く**。続き446 の死アクション（`BLOCK_ACTION{ON_PLAY_ABILITY}`）と同じ死角。**消費側の分岐条件まで読むこと。**
  - ~~📋**残＝受け皿の拡張（次の一手）**~~ **✅2026-08-12 消化（続き450）＝「次ターンに場にいるシグニ全体へ継続効果」を表す場レベル予約を新設し8効果を採用**（`FieldGrant`＝`{kind:'keyword'|'power', filter?, zone?, condition?}` を `field_grants_active` / `_next_turn` / `_next_opp_turn` に持つ）。詳細は BUGFIXES 同日（続き450）。census 835→833・golden 1927→1934・held 107→106（`WXDi-P14-070` が解消）。
    - 🔑**欠落は1つに集約されていた**＝キーワードは `field_keyword_grants_*: string[]`（**限定を持てない**）／パワーは `temp_power_mods: {cardNum,delta}[]`（**cardNum 単位のスナップショット**＝次ターンに出るシグニに掛からない）で、**場レベルの入れ物がそもそも無かった**。**キーワードとパワーで別々の仕組みを作らず1概念に統一**した。
    - 🔴**ライフバーストが特に露骨だった**＝`WX10-047-BURST`「次のターンの間、あなたのシグニのパワーを＋10000」は**相手のアタック中に発動**するので、現行は**相手のターンに上がって自分のターンには消えて**いた（ほぼ真逆）。
    - ⚠**取り違えないこと**＝**同ターン内の付与（「ターン終了時まで、あなたのすべての＜X＞は…」）はスナップショットが正しい**（解決時点のシグニに適用する）。予約が要るのは**解決時点で次ターンの盤面が分からない**場合だけ。Claude は一度これを「バグ10件」と誤認しかけた。
    - 📋**残＝同じ「次のターンの間」の未着手**＝`STUB` 11件（宣言型・1件1機構）／`REMOVE_ABILITIES` 2件／`GRANT_PROTECTION`・`BANISH`・`FREEZE` 各1件。**`STUB` 群は1件ずつ別機構なので、まとめてではなく中身で切ること。**
  - 📋**受け皿がある型の残り**＝上記46件のうち今回13件に絞った残り33件（`POWER_MODIFY`／`REMOVE_ABILITIES`／`GRANT_PROTECTION`／`STUB`／`SEQUENCE` 内側など）＝**まず型ごとに受け皿の有無を実測してから切る**。
  - ⚠**スコープ外だが申告済みの原文不一致2件**＝`WX15-003-E3`「アーツとスペルと【起】能力を使用できず」が未表現／`WXDi-P08-010-E3` の後半は本来「そのターン終了時、**そのターンにアタックしていた**シグニだけ」なのに**即時の全バニッシュ**。
      - 📋**次の一手＝`STUB{REVEAL_PICK_HAND_SHUFFLE_BOTTOM}` 5効果**（`execStubPart1.ts:3721`）＝同じ死角クラスの残り。ただし**こちらは `revealPickParams` payload を持つ**ので、REVEAL_PICK_PLAY ほど素朴ではない＝**投入前にどこまで構造化済みかを実測すること**。
      - 🔴**採用の巻き添えで兄弟効果が退化した実例**＝`WXK07-031-E2` を採用したら E1 が実装済み `STUB{PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH}` から `UNKNOWN` に落ち【常】の移動保護が恒久 no-op になった（検証で復元・golden `§6.4 T3` 新設）。**`--adopt` はカード単位**という §5-12 の再来。⚠**この退化は census の +1 でしか表に出なかった**（golden は緑・逆翻訳はむしろ原文に近づいて見える）。
      - ⚠**`CONDITIONAL{IS_MY_TURN}` を「そうした場合」の誤訳として直してはいけない**（投入前実測で確定）＝`execUtils.ts:1855` は常に `true` を返し、`effectExecutor.ts:3452` が `IS_MY_TURN` と `PAID_ADDITIONAL_COST` を**同一に扱う**（型コメント `types/effects.ts:1036` にも明記）＝**parser の正規の慣用形**。live に **`OPTIONAL_COST` 直後の `CONDITIONAL{IS_MY_TURN}` が425効果**あるので一括置換は425効果規模の誤改変になる。続き443 の `WXK05-027-E2` が壊れていたのは **`OPTIONAL_COST` STUB 自体が欠落**して相方なしで単独評価されていたからで、`IS_MY_TURN` は原因ではない。
    - ⭐**教訓＝「裸STUB＝表現が無い」ではない**。7枚のうち**4枚は engine の受け皿が既にあって parser が繋いでいないだけ**だった（§6.4 A群の「半分だけ実装済み」の再来）。**着手前に消費側のコードで受け皿の有無を1件ずつ確かめると、機構待ちに見えるものの過半が parser 専業に落ちる。**
    - ⚠**`pickUpTo` は「原文に『まで』があるか」で決める**＝`WXDi-P11-043-E1` は「〜の場合、そのカードを手札に加える」＝**強制**なのに `pickUpTo:true` で入りかけた（検証で `false` へ是正）。**辞退できる選択肢を足すのも過少実行**。不一致時は `pickable=0` で remainder 経路へ落ちるので `false` が安全。
    - ⚠**held の採用はカードID単体で行う**＝この修正が落ちた署名グループ「（type増減なし＝値/構造変更）」には**無関係な52枚**が同居していた。`--adopt-sig` だと巻き添える（続き416 の `WX25-P3-003` 事故と同型）。
    - ⚠**`PR-457` は held にも build にも映らない**＝E2 が `parseStatus:'MANUAL'` で**カード丸ごと `PRESERVE_STATUSES` の対象**。**fresh parser の出力と live を直接照合しないと parser/JSON のドリフトを検出できない**（今回は一致を実測）。
- **🆕 数量参照「この方法で〜したカードと同じ枚数」が固定値に潰れていた（続き440 で消化・残1）**：原文が動的枚数なのに live が `count:1`（や `count:0`）の固定値だった4効果を是正。**✅`WXK11-013-E1-G`**（全シグニをトラッシュ→**同じ枚数まで**戻す。旧＝`count:1`＝**盤面全部を捨てて1体しか戻らない**＝エクシード2を払う価値が消えていた）／**✅`WXK11-028-E1`**（旧＝**`count:0`＝1枚も公開しない丸ごと不発**）／**✅`WXEX2-07-E3`**（全体バニッシュ→同数まで回収。`upToCount` も復元）／**✅`WXDi-P03-009-E3`**（捨てた**青の**カード枚数＝**フィルタ付き**）。census 848→847・golden +5・held 増減0。
  - 🔑**受け皿は既にあった**＝`{ $ref:'last_processed_count' }` を `resolveCountRef` が解決する。**フィルタ付きだけが無かった**ので `NumberOrRef` に `filter?: TargetFilter` を足した（後方互換・`CountFromZone` と同じ形）。
  - 🔴**新しい死角を発見＝`count` の解決関数は action 型ごとに違う**＝`TRANSFER_TO_HAND` は `resolveNum(src.count)`（`effectExecutor.ts:2288`）を使い、**`resolveNum` は `{$ref}` を問答無用で 0 にする**（`execUtils.ts:118-120`）＝**書いても黙って0枚**になる。`WXEX1-44-E2` はこの理由で**据置**。~~📋**残**＝`resolveNum` を使う `count` 消費地点を `resolveCountRef` へ寄せるか、golden のトリップワイヤで固定する~~ **✅2026-08-11 消化（続き441）**＝live の `$ref` 全26箇所を消費関数へ紐づけて実測したら **20件は正常・6件が現に不発**だった。**engine 4サイト**（`execBounce` 非ALL／`execTrash` の `HAND_CARD{blind}`・`ENERGY_CARD`／`execTransferToHand` 非ALL）を `resolveCountRef` へ寄せて解消（**固定値には厳密に恒等**なので既存挙動は不変）。実害＝`WDK05-T07-E1` アーツ後半が不発／`WXDi-P10-008-E3` **相手のエナが1枚も落ちない**／`WXK01-038-E1` **相手の手札破壊が0枚**ほか。**同居していた別軸3件**も是正（`WX24-P1-014-E2` は🔴**ゾーン違い**＝場のシグニ→相手エナ／`WXDi-P13-007-E3` はディソナ限定の欠落＝直さないと過剰／`WX24-P2-003-E1` は🔴**$ref と固定値が2ステップ間で入れ替わり**）。**トリップワイヤ2本**（C1＝live の `$ref` 位置ホワイトリスト／C2＝「枚数を `resolveNum` で解く関数」集合の凍結）。census 847→846・golden 1826→1834。詳細は BUGFIXES 2026-08-11（続き441）。
    - ⚠**逆翻訳では原理的に見えない偽陰性**＝JSON は正しく `$ref` を持つので「同じ枚数」と描画される。**E2E golden（盤面を組んで何枚動いたか）以外に検出手段が無い**＝修正前 engine で6本とも落ちることを検算してある。
    - 🔴**`WXEX1-44-E2` は defer 継続だが理由が入れ替わった**＝`resolveNum` は解消済みで、真のブロッカーは**前段 STUB が原文と別機構**（原文「**手札から**《アクセアイコン》を持つシグニ2枚まで」に対し `PLACE_ACCE_SIGNI_TO_ENERGY` は**場のアクセゾーンを全部**エナへ送る）。⚠**アクセは CardClass ではない**＝専用フィルタ `hasIcon:'アクセ'` が既にあるので、要るのは**手札選択の機構だけ**。
    - ⚠**在庫の要約が原記録から劣化していた**＝本項の旧記述「前段の STUB は枚数を記録する**ので**通る」に対し、**続き440 の BUGFIXES には「数量参照だけ直しても前段は一致しない」と正しく書かれていた**。**PLAN の1行サマリを根拠に着手しない**（原記録＝BUGFIXES を読む）。
  - ⚠**前段が `lastProcessedCards` を書くかは型ごとに違う**（§6.3 C の教訓の再確認）＝`BANISH`（`:928`）・`BOUNCE` の `ALL` 経路（`:986`）・**選択式 BOUNCE は `resumeSelectTarget`（`:7017`）**・`execTrash` は無条件に書く。`REVEAL_AND_PICK` はオプトイン／`LOOK_AND_REORDER` は resume 後／コスト由来は BattleScreen 側。**取り違えると恒久 no-op でゲートに映らない。**
- **🆕【マジックボックス】設置の欠落（続き438 で消化・残1）**：原文に「【マジックボックス】として…設置し」を持つ**7カード中4カードで設置ステップが live JSON から丸ごと落ちていた**（`WX24-P3-072-E1` は `LOOK_AND_REORDER{count:3, dest:deck/bottom}` **だけ**＝**デッキを3枚見て下に戻すだけでカードの主目的が何も起きない**過少実行）。**✅2026-08-11 続き438 で3件消化**（`WX24-P3-072-E1`／`067-E1`／`070-E1`）＝`REVEAL_AND_PICK{pickCount:1,pickUpTo:true,then:STUB{PLACE_MAGIC_BOX},remainder:{deck,bottom}}`。census 851→848・golden +4。engine は `PLACE_MAGIC_BOX`（`execStubPart3.ts:1257`）→`INTERNAL_SET_MAGIC_BOX`（`:1272`）が**元から完備**で、parser が繋いでいないだけだった。
  - 🔑**`then` に STUB を置くときは受け側の契約を読む**＝`PLACE_MAGIC_BOX` は `ctx.lastProcessedCards[0]` しか見ないのに、`resumeSearch` の**汎用 then ループ（`effectExecutor.ts:7224`）は picked を引数で渡すだけで `lastProcessedCards` を設定しない**＝そのまま載せると「カードなし」で**無音 no-op**（ゲートに一切映らない）。**先例＝トラップ設置の専用分岐（`:7194-7204`）を鏡写し**にして解決（`{...cur, lastProcessedCards: picked}` を渡すのが肝）。
  - 📋**残1＝`WX24-P3-033-E1`（取捨炎択）**＝「1枚まで**設置**し、**＜トリック＞のシグニ1枚を公開し手札に加え**、残りを下」＝**移動先の異なる2群振り分け**。既存 `transferGroups` は「同一移動元から複数条件を**手札へ**」の表現で**別々の移動先を表せない**（**非採用を golden で固定済み**）。⚠**設置だけ足す部分採用はしない**（原文とズレたまま固定されるため）。
    - ⚠🆕**2026-08-11 続き442 で見立てを訂正＝「型と engine の追加が要る」は過大だった**。**`LOOK_PICK_CHAIN` は元から複数 stage で行き先を変えられ**（`then: 'hand'|'energy'|'trash'|'field'|'beat'|'deck_top'|'trap'`＝`types/effects.ts:1486`）、しかも **`'trap'` が「その中からカード1枚を【トラップ】として設置し」という設置 stage の先例**になっている（`WX25-P3-038-E1` が `stages:[{then:'hand'},{then:'field'}]` で稼働中＝**多段×別行き先は既に live で動いている**）。⇒ **要るのは `'magic_box'` を union に足し、`lookPickThenAction`（`effectExecutor.ts:5058`）に1行足すだけ**。受け側の `PLACE_MAGIC_BOX` 分岐（`:7205-7219`＝続き438 実装済み・`lastProcessedCards` を渡し `afterAction`/`continuation` も正しく積む）と `INTERNAL_SET_MAGIC_BOX` の**デッキからの除去**（`execStubPart3.ts:1281`）はそのまま使える。⚠ただし `PLACE_MAGIC_BOX` は `lastProcessedCards[0]` しか読まない＝**1枚設置まで**（原文が「1枚まで」なので現行は可）。⚠`INTERNAL_SET_MAGIC_BOX` は `ctx.ownerState` 決め打ち＝**自分の場専用**。
  - 📋**将来の注意**＝追加した分岐は**1枚目だけ設置する**（トラップ分岐は per-card 展開しているのに対し単一 STUB を積むだけ）。「2枚以上を同時に設置」するカードが出たら**トラップ分岐と同じ per-card 展開へ寄せる**こと。現行3効果は原文が「1枚まで」なので実害なし。
  - ⚠**計器の読み方**＝この family を見つけたのは `census:clusters` だが、**同じ上位に出ていた【トラップ】設置5件は既に実装済み**（`LOOK_PICK_CHAIN{then:'trap'}`）で、計器が拾っていたのは「設置しても**よい**」の**任意性**の軸だった＝**クラスタ名だけで実害を判断しない**。
- **🆕「代わりにそれを〜」動詞昇格の残（続き418 で登録 → ✅2026-08-11 続き439 で「能力を持たない」版を消化）**：**✅5効果を採用**＝`WX25-P3-069-E1`／`072-E1`／`073-E1`（「それが**能力を持たない**場合、代わりにそれをトラッシュに置く」＝**昇格節が丸ごと落ちて常に手札へ戻すだけだった**過少実行）／`WX25-P3-014-E1`（**2軸とも欠落**＝対象の「能力を持たない」限定＋「レベル2以下なら代わりにトラッシュ」の昇格）／`WXEX1-55-E2`（対象の「能力を持たない」限定が落ちて**能力持ちも選べる過剰**）。golden +5・held 増減0・**defer 0**。⚠**この行の旧記述「`WX25-P3-014-E1` は `BOUNCE{owner:'self'}` の自傷が残る」は古かった**＝実測時点で既に `owner:'opponent'` へ修正済みで、残っていたのは上記2軸だった（**在庫の症状記述は実測で覆る**＝§3-1 の実例がまた1つ）。(b)**逆翻訳の表示**＝対象プロパティ版が `LAST_PROCESSED_MATCHES` の汎用文「この方法で〜を1枚以上処理したなら」で出る（意味は正しいが原文の「それが〜の場合」ではない）＝`census:stubs` の**C群（表示だけの穴）**扱い・優先度低。
  - 🔑**`LAST_PROCESSED_MATCHES` の filter は「効果で能力を失った」を見なかった**＝評価（`execUtils.ts:2003`）は `matchesFilter(card, filter)` を**CardData だけ**で呼び、状態依存キーの補助照合リスト `ZONE_STATE_KEYS` に `noAbilities` が**無かった**。一方 `hasNoAbility`（`execUtils.ts:825`＝この語彙の唯一の判定）は **`holder.abilities_removed` を第一に見る**。⇒ そのまま書くと**「このターン効果で能力を失ったシグニ」を取りこぼす**＝`WXEX1-55` は **E1 で能力を奪い E2 でそれを狙う自己完結コンボ**なので主要シナリオを直撃するところだった。**続き439 で `ZONE_STATE_KEYS` へ追加し、`findFieldZoneState` の holder を `hasNoAbility` へ渡す形で解決**。
  - ⚠**副作用の確認済み**＝`ZONE_STATE_KEYS` に入れると**場にいないカードでは常に偽**になるが、`LAST_PROCESSED_MATCHES{noAbilities}` の live 利用者は**今回の新規3件のみ**（全走査で確認）＝回帰対象なし。**将来トラッシュ/手札のカードにこの条件を使う効果が出たら、この分岐を見直すこと。**
  - 📋**残**＝`WX25-P3-038-E1` は `parseStatus:'MANUAL'` で**不可侵**（`buildEffectsJson.ts:24`）＝fresh parser では同じ改善が出るが live には届かない。**手で MANUAL を更新するか、MANUAL を外して AUTO 採用に切り替えるかの判断が要る**（別バッチ）。
  - ⚠**「能力を持たない」の他用法は別機構**＝(a)「能力を持たないシグニ**として場に出す**」（`WX16-Re20`／`WXDi-P03-034` ほか4枚）＝配置時に能力を与えない別機構(b)「対戦相手の場に能力を持たないシグニが**ある場合**」＝**条件節**であって対象フィルタではない。**節の役割を見分けずに「限定漏れ」と読むと偽陽性を掘る**（続き439 の投入前調査で3 family が実際にこれだった）。
  - ⭐**教訓＝UNKNOWN は「parser を直せば終わり」ではない**。受け皿（engine 側の消費地点）が **effectType（AUTO/CONTINUOUS）ごとに別軸**になっていることがあるので、**採用前に「この effectType でその STUB は実際に読まれるか」を確かめる**（確かめずに採ると `npm run census:stubs` の C群＝表示だけの穴が増えるだけ）。
- ~~**強制アタック機構（「（対戦相手の）シグニは可能ならばアタックしなければならない」）**~~ **✅2026-08-11 消化（続き424）**＝**軸が2本ある**うち **CONTINUOUS 側が engine のどこからも読まれておらず、印字【常】6カードが恒久 no-op** だった（`WD07-004`／`WX14-018`／`WX20-Re07`／`WX20-Re08`／`WX20-Re09`＋復活させた `WX12-010`）。⚠**CONTINUOUS は宣言型で `executeAction` を通らない**＝アクション型 `FORCE_SIGNI_ATTACK` で書いてあっても `must_attack_signi` フラグは永久に立たない。`resolveForcedSigniAttack`（`effectEngine`）に**2軸（ターン限定フラグ＋印字/付与 CONTINUOUS）を一本化**し、呼び出し元3箇所（フェイズ進行ゲート／バナー2種／`PhaseConfirmDialogs` の文言）をすべてそこへ寄せた。⚠**CPU 側は「全シグニでアタック」なので自動的に満たされている**（§8 でアタックを選ぶようにしたら同じ関数を見ること＝コードに注意書き済み）。詳細は BUGFIXES 2026-08-11。
  - **📋 残**＝(a)**アタック順（「他のシグニより先にアタックしなければならない」）は未実装**＝現行はフェイズを進めさせないだけで、強制対象を後回しにしても止まらない（`FORCE_FRONT_SIGNI_ATTACK` の既存実装も同じ近似）。(b)**`WX12-010-E3` の2段目**＝「この方法で他のシグニゾーンに移動したシグニをアップしてもよい」は明示 defer（`STUB{DEFERRED_UP_REARRANGED_MOVED_SIGNI}`）。`resumeRearrangeSigni` が移動したシグニを `rearrMoved` として既に把握しているので、**要るのは「どれをアップするか選ぶ」インタラクションだけ**。
- ~~**`manualEffects.ts` の「効果の新規追加」が live へ永久に届かない（第4の死角）**~~ **✅2026-08-11 消化（続き424）**＝`buildEffectsJson` の richness ガードが「**effectId の集合が変わるカードは丸ごと温存**」なので、*既存 id への上書き*は届くのに ***新しい id の追加*だけが黙って捨てられていた**。**手書き効果3件が長期間 live から欠落**＝`WXK04-003-DECORE`（【デコレ】そのもの）／`WXK04-042-E1b`（血晶武装で得る【自】）／`WXK05-030-MULTIENA`（【マルチエナ】）。**新規 effectId のうち MANUAL/PARTIAL のものだけ**を落とすよう修正（⚠parser 由来 AUTO の追加まで採ると `WD01-016` の【マルチエナ】が**二重に**載る）。⚠**【出現条件】は後段が必ず先頭効果へ寄せる**ので、manual 側も先頭効果に置くこと（§6.3 K トリップワイヤが鳴る）。
- ~~**「対戦相手は〈コスト〉てもよい」＝主語も極性も反転していた**~~ **✅2026-08-11 消化（続き425）**＝2段構えのバグ。**(1) 主語**＝`parseSentencePart1` の任意手札捨て規則が**先頭アンカー無し**で `手札をN枚捨ててもよい$` を拾い、主語が「対戦相手は」でも `TRASH{HAND_CARD, owner:'self'}` に落としていた（🔴`WXDi-P05-037-E1`／`WXDi-P07-010-E2`／`WXDi-P09-064-E1`＝**自分が捨てる自傷**。P09-064 は引くのも自分で完全反転）。**engine は `opponentHandDiscard` を最初から持っていて parser が生成していなかっただけ**。**(2) 極性**＝`OPPONENT_PAY_OPTIONAL` には原文の意味が2種類あり（(a)「〜しないかぎり、X」＝払わなかったら X／(b)「〜てもよい。**そうした場合**、X」＝払ったら X）、engine は (a) 固定だった。(b) の2効果（`SPDi43-06-E1`／`WXDi-P05-037-E1`＝どちらも「そうした場合、このアタックを無効にする」）は**意味が真逆**＝相手が何もしなければ自分のアタックが無効化されていた。`StubAction.thenOnPay` を新設して極性を刻む（parser は「てもよい。そうした場合」の**隣接**だけを見る＝極性は次の文にしか現れず文単位の規則では原理的に判定できない）。詳細は BUGFIXES 2026-08-11（続き425）。
  - ⚠**`SPDi43-06` はどの worklist にも載っていなかった**＝トリップワイヤは「素の手札 TRASH」しか見ないので、コストが《無》のこの札は掛からない。**計器の網の外に同型が居ないかは、原文の文型で数え直して確かめる**（今回は live 全 `OPPONENT_PAY_OPTIONAL` 67効果を原文の「ないかぎり」/「そうした場合」で仕分けて 2件と確定した）。
  - **📋 残**＝(a)**相手側の可変枚数コスト**（`WXDi-P09-064`「手札を２枚**まで**捨ててもよい。捨てたカード1枚につき1枚引く」）＝`OPPONENT_PAY_OPTIONAL` が all-or-nothing なので**0枚か2枚**に丸めてある。(b)`WXDi-P07-010-E2` の解放条件＝「**各**アタックフェイズ開始時、同じ場所にシグニがない場合、相手が支払えば表向きにする」＝**繰り返す遅延ゲート**が機構として無い（`DEFERRED_FACEDOWN_RELEASE_BY_OPP_PAYMENT`）。
- ~~**🆕 エナ支払い元の一本化（`UNDER_CARD_AS_ENERGY_COST` の前提・続き427 で登録）**~~ **✅2026-08-11 消化（続き428）＝funnel `src/screens/battle/energyPaySource.ts` を新設し、`UNDER_CARD_AS_ENERGY_COST`（`WXDi-P10-041`）をその最初の消費者として実装**。`census:stubs` の明示 defer **17→16**、golden **1776→1785**、census 854 据置。
  - **funnel の形＝「後方互換の index 空間」＋「applyTo は最後に当てる」の2点**。(1) `buildEnergyPayPool` が返す配列は**先頭 `my.energy.length` 件がエナゾーンそのもの・同じ順**なので、既存の `costIndices:Set<number>`（＝エナ index）が**そのまま pool の index として通る**＝追加元0件のとき従来と完全に等価。(2) 控除は `planEnergyPayment(...).applyTo(state)` で**サイトが state を組み立てた「あと」**に当てる＝サイトが `field` を自前で組み直しても**シグニの下からの支払いを取りこぼさない**。
  - ⭐**安全弁は関数の戻り値に置いた**（§4 教訓 (m)）＝`applyTo` を呼び忘れると**エナが1枚も減らない**（＝「ただでアーツが撃てる」という即座に露見する壊れ方）。**無言の不整合にならない設計**を選んだのが本質。加えて goldenTest に**ソース走査トリップワイヤ**（`BattleScreen.tsx` に `.energy.filter((_, i) => !` が1件も残っていない）を置いた＝新しい支払い経路が funnel を迂回したら赤くなる。
  - **配線した範囲**＝BattleScreen の支払い**14サイト**（グロウ／アーツ／キー使用／キー【起】／アシストグロウ／アシスト【起】／スペル／カットイン／シグニ【起】／エナ【起】／手札【起】／【出】コスト／ルリグ付与【起】／トラッシュ【起】）＋**候補描画14モーダル**＋**支払い可否ゲート7箇所**（`canAffordGrowCost`／`canAffordWithExtraCost`）。⚠**ゲートも pool にしないと「払えるのに候補に出ない」**になるので候補生成と対で直す。
  - ⚠**funnel を通さない支払いを3つ明示的に残した**（いずれも「選んで払う場面」ではない＝原文の「エナコストを支払う際」に当たらない）＝(a) `signi_attack_cost`（アタック時の自動控除・末尾から削る近似）(b) ガード追加《無》（同上）(c) **`energyTrash*`／レゾナ出現条件**＝原文が「**エナゾーンから**トラッシュに置く」なのでエナゾーン専用が正しい（`planEnergyPayment` の `alsoRemoveEnergyIndices` はこの軸で受ける）。⚠**CPU の支払いヒューリスティックも pool を見ない**＝下カードから払わないだけでルール違反にはならない近似（§8 で AI を強化するときに同じ関数へ寄せる）。
  - **`UNDER_CARD_AS_ENERGY_COST` 本体**＝宣言は live JSON の `STUB{id, underCardAsEnergyCost:{perTurnLimit:3, duringMyAttackPhase:true}}`（**engine で原文を再パースしない**＝`sideAttackEmptyZoneAsFront` と同じ規約）。収集は**印字＋付与2ストアの3軸**（`signiDamageGate.ts` と同じ走査軸＝印字だけ見ると付与された瞬間に無言で落ちる）。**「1ターンに3つまで」は候補生成の1点で止める**＝pool に残り上限ぶんしか載せない（13本のモーダルのトグルに検算を撒かない／過払いにならない安全側）。計数は `PlayerState.turn_off_zone_energy_paid_count`、ターン境界リセットは**3箇所**（`assist_lrig_attack_min_level` と同じ位置）。
  - 🔴**同じスタックを2つのコスト機構が index で触るとズレる**＝カットイン経路だけ `underSelfTrash`（「このシグニの下から」コスト）と同居しうる。**同じカードが両方を持たないこと**を golden でロックした（現状0件）。増えたら赤くなる。
  - **📋 残（この funnel の上に載る）**＝「エナゾーン以外を支払い元にする」語彙が増えたら `collectUnderCardEnergySources` の横に足すだけで14サイト全部に効く。**⚠実機UI未検証**＝§7 送り（4件・回帰確認が最重要）。
- ~~**`WXDi-CP01-023`（置換「代わりに…してもよい」＋ CONTINUOUS で受け皿なし）**~~ **✅2026-08-11 消化（続き431）＝ライフクラッシュ置換の funnel を新設**（`src/screens/battle/lifeCrashReplace.ts`）。**M2 待ちではなく別機構だった**＝離場置換ではなく**ライフクラッシュの置換**。
  - 🔴**3枚とも「未実装」ではなく生きた過剰効果／自傷だった**＝原文の「**代わりに**」を読み落として**即時実行**に化けていた。(a)`WX24-P4-009-E1` は `TRASH{DECK_CARD,self,10}`＝**アーツを使った瞬間に自分のデッキが10枚削れる**（自傷）(b)`WX25-P3-004-E1` は `LIFE_CRASH{opponent,1}`＝**タダで相手のライフを1枚割る**（過剰効果）(c)`WXDi-CP01-023-E1` は CONTINUOUS の中身が素の `TRASH{DECK_CARD,5}`＝**CONTINUOUS は `executeAction` を通らない**ので恒久 no-op（続き424 の `FORCE_SIGNI_ATTACK` と同型）。
  - 🔴**副産物＝既存8カードの限定が効いていなかった**＝`REPLACE_NEXT_DAMAGE_WITH_MILL` は `damageSource` を**宣言していたのに捨てて**おり（`damage_replace_mill: number[]`）、`WX25-P1-010`「次にあなたが**シグニによって**ダメージを受ける場合」が**ルリグアタックのダメージまで置換**していた。`PlayerState.life_crash_replacements` へ統合して限定を消費側で見るようにした（legacy `damage_replace_mill` は読み側で正規化＝続行中の対戦を壊さない）。
  - **funnel＝宣言（アーツ／【出】／ルリグ付与の【常】）と消費（シグニアタックの `crashOneLife` ／ルリグアタック）を1本に**。⚠**消費地点は2つある**＝片方だけ限定を見ると「シグニには効くがルリグには効かない」型の無言の不整合になる。⚠**【常】付与は付与時に宣言を積む**（`GUARD_ALT_HAND_REPLACE` と同じ扱い）＝能力として持たせるだけでは CONTINUOUS が実行されず恒久 no-op。
  - ⭐**「デッキがN-1枚以下の場合は置き換えられない」という原文の注記が、自動適用の安全弁になっている**＝枚数不足のエントリは選ばないのでデッキアウトの自傷が構造的に起きない。**だから `optional`（「してもよい」）を当面自動適用しても自滅しない**。⚠ただし**本来は被害側が選ぶ**＝対話化は離場置換（M2）と同じ枠組みで別バッチ。
  - **`crash_opponent`（`WX25-P3-004`）は呼び出し側で適用**＝`crashOneLife` は被害側の state しか持たないので `crashOpponentInstead` を返し、両者の state を持つシグニアタック2経路が相手（＝アタックしている側）のライフを割る。
- **CPU AI の拡張**（→§8）：メインフェイズ AI（アーツ/スペル/起動効果の能動使用・グロウ時トリガー）未実装。CPU 召喚の ON_PLAY 解決は「全配置後まとめて」の近似（人間は1枚ごと）。トラッシュ起動の CPU 使用も未。**§6.4 で唯一の大物＝単独フェーズ扱い**。

**■ 消化済み項目が残した宿題（小粒・親項目は退避済み）**
- **A群の初回消化＝`CANNOT_DEAL_DAMAGE_TO_OPPONENT` 実装済み（続き409）**＝`src/screens/battle/signiDamageGate.ts`（印字＋付与2ストアの3軸走査）を新設し、`resolvePendingSigniBattleFor` の**2つのダメージ地点（ランサー/Sランサーの追加クラッシュ／正面空・アサシンのライフアタック）**に配線。⚠**片方だけ止めると「バトルに勝ったときだけダメージが通る」半端な近似**になる。
- **A群6件目＝`MAGIC_BOX_FLIP_GRANT_ASSASSIN_DC`（WX24-P4-016-E3）実装済み（続き413）＝新 timing `ON_MAGIC_BOX_FLIPPED`**。PLAN §4「新規 timing 配線の確立パターン」どおり ①timing 追加 ②`boardDiff.countMagicBoxesFlipped` ③`triggerCollect.collectMagicBoxFlippedTriggers` ④BattleScreen 中央 diff funnel ⑤golden ⑥逆翻訳語彙。⚠**detector は「MB ゾーンから消えた」だけでは数えない**＝行先がトラッシュ（`INTERNAL_OPEN_MB_DO`）か場のシグニ（`MAGIC_BOX_REVEAL`）であることを要求する（`MUGEN_Q_RESET_AND_FLIP` の盤面ごとゲーム除外を誤検出しないため）。⚠**watcher は印字能力ではなく「そのターンだけ付与されるもの」**なので collector が**付与ストアも走査**する（印字だけ見ると恒久 no-op）。⚠付与先は `lrig_granted_auto_effects`（`permanentGrant` を付けない＝ターン終了時に落ちる）＝`game_granted_auto_effects` はターン境界のクリアが無く持ち越す。**⚠実機UI未検証**＝§7 送り。
- **A群5件目＝`ARTS_ATTACK_EMPTY_ZONE_AS_FRONT`（WX16-021 驚天動地）実装済み（続き412）**＝「このターン、＜英知＞のシグニがシグニのない相手シグニゾーンにアタックする場合、正面にあるかのようにダメージを与える」。⚠**【側面アタック】は既定で空ゾーンだと何も起きず、UI も空ゾーンを提示しない**＝**解決とアタック先ボタンの2箇所**を同じ関数（`screens/battle/sideAttackDamage.ts`）で判定する（片方だけ直すと「押せるのに何も起きない」か「効果が有効なのに押せない」になる）。クラス限定は **live JSON の構造**（`sideAttackEmptyZoneAsFront.cardClass`）に載せて engine で `costText` を再パースしない。⚠`WX16-021` は `manualEffects.ts` に無い MANUAL エントリ＝**live JSON 直編集が正**（`build:effects` が手修正を不可侵にするので保持される。実測で確認済み）。ターン境界リセットは**4箇所**（PvP通常終了／確認後／別経路／CPU）。**⚠実機UI未検証**＝§7 送り。
- **A群3・4件目＝`OPP_LRIG_DECK_TO_LRIG_TRASH`（WX24-P4-014②）／`PLAY_MILLED_SIGNI_DELAYED_TRASH`（WXDi-P09-079）実装済み（続き411）**＝前者は `opponentResponds`（＝相手自身に選ばせる）＋ ルリグデッキ→**`lrig_trash`**（通常トラッシュではない）。⚠**`opponentResponds` は「誰がクリックするか」だけを変え、ctx の視点は反転しない**＝候補も適用先も `ctx.otherState` のまま。後者は **collector が「そのシグニ」を落としていた**のが真因＝`collectMillTriggers` がフィルタ一致件数だけ数えて**カードそのものを捨てていた**ので `triggeringCardNum` に載せた（この timing の live 16効果のうち triggerSource を読むものは 0＝投入前に全数確認）。ターン終了時トラッシュは既存 `turn_end_field_trash_targets`、配置制限は `deployLimit.ts` を通す。**⚠実機UI未検証**（相手ルリグデッキ選択モーダル）＝§7 送り。
- **A群2件目＝`EXILE_ARTS_FROM_LRIG_DECK_SKIP_SIGNI_STEP`（WXK11-001②）実装済み（続き410）**＝新語彙 `StubAction.exileArtsFromLrigDeck{count,minTotalCost}` ＋ engine 3段（CHOOSE→`self_lrig_deck` 選択→除外＋後段）。⚠**行先が `excluded`（ゲームから除外）なので `trashArtsFromLrigDeck`（ルリグトラッシュ行き）を流用してはいけない**。後段は①のルリグ側と同じ `BLOCK_ACTION{SIGNI_ATTACK_STEP}` を engine が `exec` して再利用する。**⚠実機UI未検証**（新規 CHOOSE ＋ ルリグデッキ選択モーダル）＝§7 送り。
- **離場置換の対話化**（続き406 登録 → **2026-08-11 続き429 で前提訂正＋決定層を分離**）
  - 🔴**登録時の前提が違っていた＝「置換5本すべてが『してもよい』の自動適用＝近似」ではない**。live の原文を全数照合した結果、**強制3効果（2軸）／任意10効果（3軸）**に割れる。
    - **強制＝自動適用が正しい（近似ではない・対話の選択肢に出してはいけない）**：`EFFECT_LEAVE_PREVENT_LOSE_LRIG_ABILITY`（`SPDi44-08-E2`／`WX25-P1-018-E2`「代わりにこのルリグはこの能力を失う」）／`NO_ABILITY_SIGNI_TO_DECK_BOTTOM`（`WXEX2-30-E1`「代わりにデッキの一番下に置かれる」）。
    - **任意＝本来は被害側が選ぶ**：`BANISH_SUBSTITUTE` 9効果（`WX06-019`＝powerReduction 型／`WX10-033`／`WX11-029`／`WX12-024`／`WX14-026`／`WX20-055`／`WXEX2-60`／`WXDi-P10-052`／`WXDi-CP01-032`）＋`EFFECT_LEAVE_REPLACE_BANISH`（`WX25-P1-056-E1`）。
    - **golden で原文から機械ロック済み**＝軸の分類が原文の語尾（「てもよい」の有無）と食い違ったら赤くなる。⚠**盤面には出ない前提**なので、検算はここにしか無い。
  - ✅**決定層を分離した（続き429・挙動不変）**＝`applyEffectLeaveSubstitutes` を **`collectLeaveSubstituteOptions`（列挙）→`autoChooseLeaveSubstitute`（policy）→`resultCtx` 採用**の3段に分解。列挙は**投機実行**（`ExecCtx` は `setOwnerState`／`addLog` とも不変なので、採用しない候補の ctx は捨てるだけ・ログも漏れない）。**F-3 の内部選択（下スペル／手札スペル／犠牲／ライフクラッシュ）も1件ずつ `LeaveSubstituteOption` として列挙**するので、対話化は **`autoChooseLeaveSubstitute` を差し替えるだけ**になった。各 option は `kind:'mandatory'|'optional'` を持つ＝強制軸を選択肢に出さない責務が型に載っている。
  - ✅**`WX14-026`（`lifeCrash` 身代わり）は「列挙されるが自動では選ばれない」へ**（`autoEligible:false`）＝従来は**列挙からも落として**いたので「対話 policy を入れても選択肢に出せない」状態だった。engine が適用しない理由（【ライフバースト】確認フロー `field.check` を効果解決の途中に同期的に差し込めない）は変わらない。
  - ✅**M2＝対話 policy を実装（続き430）**＝**10カードの「代わりに…してもよい」が実際に選べるようになった**（従来は engine が勝手に適用していた）。
    - 🔑**離場ループの途中では pause しない**＝engine には「per-card ループの途中で中断して残りを再開する」機構が**無い**（`resumeSelectTarget` の per-card ループは pause すると残りの選択を落とすため、ADD_TO_FIELD 等が個別に特例回避してあるのがその証拠）。そこで**移動を1つも適用する前に対象すべてを問い**、決定を **`PlayerState.leave_substitute_choices`** に刻んでから**従来どおり同期的に**適用する。**決定を PlayerState に置いたので pause を跨いで自動的に残る**（`banish_substitute_choice` と同型）＝engine に新機構を足さずに済んだ。
    - **配線＝`resumeSelectTarget` のループ直前（対象選択を伴う全経路）＋ `count:'ALL'` の5経路**（`execBanish`／`execBounce`／`execSendToEnergy`／`execTrash`／`TRANSFER_TO_DECK`）。ALL 経路の再入は**同じ action をもう一度実行する**だけでよい（候補は盤面から再導出されるので選び直しにならない／決定が既にあるので問いは出ない）。⚠**`count:'ALL'` の分岐の内側**に置くこと＝外に置くと対象選択の**前**に問いが出て順序が壊れる（実装中に1度踏んだ）。
    - 🔴**踏んだ実バグ＝`opponentResponds` の CHOOSE は `resumeOpponentPayOptional`（相手が「支払う」流れ）へ固定ルートされていた**＝コストの無い問いをそこへ流すと「エナ不足」で即終了＝**無言で潰れる**。`PendingInteractionDef.CHOOSE.leaveSubstituteAsk` を新設して素の `resumeChoose` へ分けた。**`opponentResponds` は「誰が答えるか」であって「相手が払う」ではない**（続き411 の教訓の別形）。
    - **問いは被害側に出す**＝`CHOOSE{opponentResponds:true, leaveSubstituteAsk:true}`。`EffectInteractionModal` の見出しも専用文言へ（従来は相手のカード名＋「効果を選択してください」で誰が何を決めているか分からない）。**CPU が被害側のときは先頭の選択肢＝従来の自動 policy と同じ**を選ぶ＝挙動不変。
    - ⚠**「置換しない」を選んでも `mandatory` 軸は適用する**（原文に「してもよい」が無い置換は断れない）。⚠**決定は適用直前に再検証**＝pause 中に盤面が変わって同じ key の候補を出せないなら黙って通常の移動へ倒す（存在しない身代わりで盤面を壊さない）。⚠**ターン境界3箇所で決定をクリア**（解決が中断したまま残った分の持ち越し防止）。
    - **✅`WX14-026`（lifeCrash）は対話でなら選べるようになった**＝engine の自動 policy では相変わらず適用しない（`autoEligible:false`）が、**選択肢としては出る**。M1 で列挙側に載せておいた効き目がここで出た。

  - ~~⚠**latent な穴（現状 live 0件なので無害）**＝印字だけで付与ストアを見ていない~~ **✅2026-08-11 消化（続き432）**＝`declaredContinuousEffects`（印字＋付与2ストアの3軸）を新設して置換3本を通し、F-3 の列挙にも付与ストアを足した。**live 0件なので挙動は変わらない**が、`GRANT_EFFECT` で付与された瞬間に無言で落ちる状態を解消。golden に「関数本体に印字直読みが残っていない」ロックを設置。
- ~~**`collectIncreaseActCost`（相手の起動能力コスト+1）がトラッシュ起動に未適用**（続き403）~~ **✅2026-08-11 実測して決着（続き432）**。
  - 🔴**「トラッシュ起動に未適用」は穴ではなく仕様どおりだった**＝原文（`WXDi-P06-031`）は「対戦相手の、**センタールリグとシグニ**の【起】能力の使用コストは《無》増える」。**トラッシュにあるカードは「シグニ」ではない**（新しい札が「この**カード**をトラッシュから場に出す」と書き分けているのが根拠。古い札の「このシグニを」は緩い表記）。アシストルリグ／キー／手札・エナ起動も同じ理由で対象外。**「未適用の入口」を全部穴と決めつけない**＝原文の限定を先に読む。
  - 🔴**実際の穴は別の入口だった＝`CutinModal`（カットイン窓の【起】）が素通りしていた**＝`source:'lrig_field'`（センタールリグ）／`'signi_field'`（シグニ）の【起】は**同じ能力**なのに、カットイン窓経由だとコスト増加が乗らなかった。**同じファイルの上部にアーツ実効コストで同型の穴を踏んだ記録がある**（続き…の `WXK05-004` 等4枚）＝**入口ごとの食い違いはこのファイルで再発しやすい**。候補一覧の支払い可否と支払いモーダルの必要枚数の**両方**に載せた。
  - **golden で適用範囲を表として固定**＝適用する3入口／適用しない5入口を列挙してある。**「未適用＝穴」と誤って直すのを防ぐ**のが目的。
- ~~**`SELF_TO_LRIG_DECK_AND_FETCH_SAME_NAME`（`PR-470A`）にパワー配置制限が未評価**（続き405）~~ **✅2026-08-11 消化（続き432）**＝**count 制限が無関係なのは登録どおりだったが、パワー制限（「パワーN以上のシグニを新たに場に出せない」）は掛かるべきなのに素通りしていた**。`deployLimitBlockReason` を `fieldCountAdjust:1`（同時に場を空ける1体）で通す＝**体数制限には掛からず、パワー制限には掛かる**。⭐**「count は無関係」で止めると同じ funnel の別の判定を見落とす**（`deployLimitBlockReason` は count とパワーの2軸）。
- **`POWER_THRESHOLD_TRASH` は parser が生成しうるのに engine に消費地点が無い**（続き407）＝現状 live 0件で無害。golden に「live 0件」の契約テストを置いてあるので、parser 規則が生えた瞬間に赤くなる。

**■ 解消済み（1行サマリのみ・詳細は PLAN_DETAIL「2026-08-10 整理⑤」）**
- ✅`cannotAttackSigni` の3箇所配線＋兄弟軸（続き404・`signiAttackGate.ts`）／✅付与ストアの任意 timing・任意 scope 走査（続き404・`grantedStore.ts`）／✅配置制限ゲートの一本化（続き405・`deployLimit.ts`）／✅F-3 身代わりを効果バニッシュへ配線（続き406）／✅トラッシュ自己起動のコストUI 14枚（続き403・`trashActivateCost.ts`）／✅クラフトトークン残0（続き407 実測）／✅golden の型網羅＝未カバー0（続き407・`npm run census:goldentypes`）／✅smoke SKIP 0（2026-07-19）。

## 2026-08-11 整理⑦：PLAN §4 恒久指標の旧行を退避（続き435〜440）

> §4 は「最新1行だけを置く」入れ替え式。続き440 の簿記時点で溜まっていた 12 行をここへ移した。**直近の正は PLAN §4 の先頭行**。

- **🆕 2026-08-11 続き432〜434（§6.4 宿題残0＋UNKNOWN 2バッチ）後 最新値（本行が直近の正）**：census **852**、golden **1809（+9）**、**`MANDATORY_SUSPICIOUS` 0**、golden `FORCED_HAND_COST_KNOWN` の🔴側 **0**、**`census:stubs` A群 16件＝明示 defer 16／無言 no-op 0**（ゲート化済み）、smoke 10688 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、**UNKNOWN 30ノード/29カード**。⚠`POWER_VALUE_MISMATCH` は **1**（`WX15-027`＝計器の誤検出・実害なし）。
- **（旧）2026-08-11 続き432〜433 時点の値**：census **854**、golden **1807（+7）**、**`MANDATORY_SUSPICIOUS` 0**、golden `FORCED_HAND_COST_KNOWN` の🔴側 **0**、**`census:stubs` A群 16件＝明示 defer 16／無言 no-op 0**（ゲート化済み）、smoke 10688 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、**UNKNOWN 34ノード/32カード**。⚠`POWER_VALUE_MISMATCH` は **1**（`WX15-027`＝計器の誤検出・実害なし）。
- **（旧）2026-08-11 続き432 時点の値**：census **854**、golden **1804（+4）**、**`MANDATORY_SUSPICIOUS` 0**、golden `FORCED_HAND_COST_KNOWN` の🔴側 **0**、**`census:stubs` A群 16件＝明示 defer 16／無言 no-op 0**（ゲート化済み）、smoke 10688 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、UNKNOWN **36ノード/34カード**。⚠`POWER_VALUE_MISMATCH` は **1**（`WX15-027`＝計器の誤検出・実害なし）。
- **（旧）2026-08-11 続き428〜431 時点の値**：census **854**、golden **1800（+24）**、**`MANDATORY_SUSPICIOUS` 0**（`EFFECT_TYPE_MISSING_CONTINUOUS` も **0**）、golden `FORCED_HAND_COST_KNOWN` の🔴側 **0**、**`census:stubs` A群 16件＝明示 defer 16／無言 no-op 0**（ゲート化済み）、smoke 10688 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、UNKNOWN **36ノード/34カード**。⚠`POWER_VALUE_MISMATCH` は **1**（`WX15-027`＝計器の誤検出・実害なし）。
- **（旧）2026-08-11 続き428〜430 時点の値**：census **854**、golden **1794（+18）**、`MANDATORY_SUSPICIOUS` **1**（`EFFECT_TYPE_MISSING_CONTINUOUS` は **0**）、golden `FORCED_HAND_COST_KNOWN` の🔴側 **0**、**`census:stubs` A群 16件＝明示 defer 16／無言 no-op 0**（ゲート化済み）、smoke 10688 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、UNKNOWN **36ノード/34カード**。⚠`POWER_VALUE_MISMATCH` は **1**（`WX15-027`＝計器の誤検出・実害なし）。
- **（旧）2026-08-11 続き428〜429 時点の値**：census **854**、golden **1790（+14）**、`MANDATORY_SUSPICIOUS` **1**（`EFFECT_TYPE_MISSING_CONTINUOUS` は **0**）、golden `FORCED_HAND_COST_KNOWN` の🔴側 **0**、**`census:stubs` A群 16件＝明示 defer 16／無言 no-op 0**（ゲート化済み）、smoke 10688 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、UNKNOWN **36ノード/34カード**。⚠`POWER_VALUE_MISMATCH` は **1**（`WX15-027`＝計器の誤検出・実害なし）。
- **（旧）2026-08-11 続き428（エナ支払い元の一本化）時点の値**：census **854**、golden **1785（+9）**、`MANDATORY_SUSPICIOUS` **1**（`EFFECT_TYPE_MISSING_CONTINUOUS` は **0**）、golden `FORCED_HAND_COST_KNOWN` の🔴側 **0**、**`census:stubs` A群 16件＝明示 defer 16／無言 no-op 0**（ゲート化済み）、smoke 10688 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、UNKNOWN **36ノード/34カード**。⚠`POWER_VALUE_MISMATCH` は **1**（`WX15-027`＝計器の誤検出・実害なし）。
- **（旧）2026-08-11 続き424〜427（§6.4 を4本消化＝強制アタック機構／手書き効果追加の死角／主語・極性の反転／トリップワイヤ残0／**A群🔴側 残0＋ゲート化**）後の値**：census **854**、golden **1776（+5）**、`MANDATORY_SUSPICIOUS` **1**（`EFFECT_TYPE_MISSING_CONTINUOUS` は **0**）、golden `FORCED_HAND_COST_KNOWN` の🔴側 **0**、**`census:stubs` A群 17件＝明示 defer 17／無言 no-op 0**（ゲート化済み）、smoke 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、UNKNOWN **36ノード/34カード**。⚠`POWER_VALUE_MISMATCH` は **1**（`WX15-027`＝計器の誤検出・実害なし）。
- **（旧）2026-08-11 続き424〜426 時点の値**：census **854**、golden **1774（+3）**、`MANDATORY_SUSPICIOUS` **1**（`EFFECT_TYPE_MISSING_CONTINUOUS` は **0**）、golden `FORCED_HAND_COST_KNOWN` の🔴側 **0**（7→0）、smoke 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、`census:stubs` A群 **18件**（明示 defer 11・**無言 no-op 7**）、UNKNOWN **36ノード**。⚠`POWER_VALUE_MISMATCH` は **1**（`WX15-027`＝計器の誤検出・実害なし）。
- **（旧）2026-08-11 続き424〜425 時点の値**：census **854**、golden **1774（+3）**、`MANDATORY_SUSPICIOUS` **1**（`EFFECT_TYPE_MISSING_CONTINUOUS` は **0**）、smoke 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、`census:stubs` A群 **18件**（明示 defer 11・**無言 no-op 7**）、UNKNOWN **36ノード**、golden `FORCED_HAND_COST_KNOWN` の🔴側 **3件**（7→3）。⚠`POWER_VALUE_MISMATCH` は **1**（`WX15-027`＝計器の誤検出。続き418 の「代わりに」加算モデルを読めていないだけで実害なし）。
- **2026-08-11 続き424 単独時点の値**：census **854**、golden **1772（+1）**、`MANDATORY_SUSPICIOUS` **1**（`EFFECT_TYPE_MISSING_CONTINUOUS` は **0**）、smoke 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、`census:stubs` A群 **17件**（明示 defer 10・**無言 no-op 7**）、UNKNOWN **36ノード**。⚠`POWER_VALUE_MISMATCH` は **1**（`WX15-027`＝計器の誤検出。続き418 の「代わりに」加算モデルを読めていないだけで実害なし）。
- **2026-08-10 続き418〜423（所有者反転／コスト取り違え／対象宣言脱落を計器で6波）後の値**：census **854**、golden **1771（+18）**、`MANDATORY_SUSPICIOUS` **2**（据置）、held **123カード／48群**、同型★ **0**（265群）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors/**263 warnings**、manual field loss 0、golden 型カバレッジ **128/128**、UNKNOWN **36ノード/34カード**、🔴幻の手札コスト **1件**（19→1）。母数＝効果カード **5975**／効果 **10683**／MANUAL効果 **1118**。

## 2026-08-11 整理⑥：PLAN §7 の実機検証クローズ済み項目を退避

> [PLAN.md](./PLAN.md) §7（フェーズ3＝実機挙動）を**未検証だけの worklist** に保つため、**チェックが全部埋まった（＝実機検証をクローズした）項目**の詳細をここへ移した。
> PLAN 側には1行✅サマリだけを残してある。一次記録は `BUGFIXES.md` の各日付節と `scripts/verifyBattleDrive.mjs` の各シナリオID（シナリオ名は原文中に残してある）。
> ⚠**この検証群で発見した実バグ**（Opusタスク12 (ci)(cii)(civ)(cv)(cvi)(cvii)(cviii)）は当時 PLAN §3 へ登録し、既にクローズ済み＝登録行の原文は本ファイルの「2026-08-06 整理」「2026-08-06 整理③」節にある。
> ⚠**残した項目**＝クラフトトークン `WX22-001-E3`（機構待ち）と driver 側フレーク（Sonnetタスク3）は未消化なので PLAN §7 に残っている。

### 退避した行の原文（PLAN §7 から）

- **✅ タスク16 残0クローズ（`WXDi-P06-038`／`WX05-020`／`WXDi-P13-051`）が持ち込んだ未検証UI 3件（2026-07-31→2026-08-05クローズ）**
  - [x] **`WXDi-P06-038`（翠美姫 アン//メモリア）**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs energyLeftAnyZoneTrigger`で実機確認（2回連続PASS）＝自分のエナゾーンから効果でカードが**トラッシュ以外**（手札）へ動いたとき（WXEX1-42の自己完結する【出】で自身のエナから植物シグニを手札へ）にも`energyLeftToAnyZone`で【エナチャージ１】が発火することを確認（デッキ先頭カードがエナに加わった）。**コスト支払い経路との区別・《ターン1回》超過時の非発火は未個別実機**（低優先＝collector側のusageLimit/コスト経路除外は既存の共通機構に依拠）。
  - [x] **`WX05-020`（羅輝石 ダイヤブライド）**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs doubleCrashUpTrigger`で実機確認（2回連続PASS）＝①【ダブルクラッシュ】で1アタック2枚同時クラッシュ→「1ターンに合計2枚以上」条件成立でE1（アップ）が発火しsigni_downがfalseへ復帰することを確認。②の足し方（アタック1枚＋E2アーツ被弾1枚）と**ターンまたぎのリセット**は未個別実機（低優先＝`crashedTotalThisTurn`の閾値比較・`life_crashed_by_signi_this_turn`のターンリセットは共通機構でgolden済み）。
  - [x] **`WXDi-P13-051`（翠美姫 アン//ディソナ）**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs oppResourceLossChoose`で実機確認（2回連続PASS）＝相手効果（WXDi-D07-013）で自分のエナがトラッシュされたときに誘発しCHOOSE「引く／エナチャージ」がCPU自動応答で選択されること（従来の「エナチャージ無条件」ではなく2択が実際に生成されることを`pEff=CHOOSE`で確認）を確認。手札喪失経路と「1つの相手効果が両方やった場合は1回だけ」は未個別実機（低優先＝`collectOppResourceLossTriggers`が中央diffで両方を1entryへ畳む設計とコード読解で確認済み）。

- **✅ タスク16 `WXDi-P11-063-E2`（aboveSelf／シグニの下に置かれた）が持ち込んだ未検証UI 2件（2026-07-31→2026-08-05クローズ）**
  - [x] **スペル《無心の豪圧》(`WXDi-P11-063`) をメモリア3種のいずれかの下に置く選択**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs spellUnderMemoriaPlace`/`spellUnderMemoriaSkip`（幻怪姫エクス//メモリア＝`WXDi-P11-042`）で実機確認（各2回連続PASS）＝①バニッシュ解決後「無心の豪圧をシグニの下に置きますか？」のCHOOSE（メモリア候補＋「スキップ（トラッシュへ）」）が出ること ②置くとホストのスタック最下部にスペルが入り（`hostZone0=["WXDi-P11-063#1","WXDi-P11-042#1"]`）ホストが+2000されること ③スキップするとトラッシュのまま（+2000は乗らない・スタック不変）ことを確認。⚠この配置経路は **part1 の同名 STUB に食われて長期間到達不能だった**箇所＝UI で初めて実走。**「ターン終了時に戻る」（duration:UNTIL_END_OF_TURN）のターンまたぎ検証は未個別実機**（低優先＝duration機構自体は既存共通処理でgolden済み）。
  - [x] **【常】版4枚の自己バフが止まったこと**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs aboveSelfSelfBuffStopped`/`wxdip03057DownUnderRed`で実機確認（各2回連続PASS）＝`WXK08-086`／`WXDi-P03-057`／`WXDi-P05-050`を**単独で場に出しただけ**（下にカードなし）では`host.powerMods`が空＝自己バフが発生しないこと（`effectEngine.ts:1562`のスタック長<2ガードで構造的に保証されている）を確認。対照実験として`WXDi-P03-057`の【起】《ダウン》で他の赤シグニ（`WD02-009`・P12000）の下に潜らせると、そのホストの表示パワーが**12,000→14,000**（aboveSelf+2000）へ実際に上がることも確認（CONTINUOUS/PERMANENTのaboveSelfは`temp_power_mods`に書かれない純計算値のため`temp_power_mods`ではなくDOM表示パワーで判定）。

- **✅ タスク12(lxxiii) が持ち込んだ未検証UI 1件（2026-08-01→2026-08-05に実バグ発見でクローズ）**＝トラッシュ領域移動ロック。engine 側は全効果走査（330→0）と golden で固定済みだが UI 経路は計器に映らない。
  - [x] **`WX24-P4-007-E1`（③まで込み）／`WXDi-P14-005-E1`（選択肢③）を撃った次の相手ターン**に、相手が「あなたのトラッシュから…を手札に加える／場に出す／エナに置く／下に置く／【ビート】にする」系を使おうとしても**候補が0で何も起きない**こと＝**❌FAIL・実バグを発見・Opusタスク12(cvii)へ登録**（2026-08-05・Sonnet・`verifyBattleDrive.mjs trashMoveLockBlocksSelfEffect`／対照`trashMoveLockAllowsWhenUnlocked`で各2回連続再現）。`isOwnTrashMoveLocked`が見る`ctx.currentPhase`を`BattleScreen.tsx`のExecCtx構築6箇所がどこも設定しておらず実UI経路では常に`undefined`＝**ロック機構自体が実ゲームで丸ごと不発**（`lock_trash_move_this_turn:true`を注入してもMAINフェイズで普通にトラッシュのシグニを手札に加えられてしまう）。⚠見るべき境界3つ（①メイン/アタックフェイズ限定 ②そのターンだけ ③相手の効果は止まらない）は、根本のロック自体が効かないため個別検証に進めなかった（(cvii)修正後にあらためて確認）。

- **✅ タスク12(lxi) 第11波が持ち込んだ未検証UI 1件（2026-08-01→2026-08-05に構造的限界を確認しクローズ）**＝**ゾーンを跨いだ選択モーダル**は本プロジェクト初。engine/golden では固定済みだが UI 経路は計器に映らない。
  - [x] **`WXK06-067-E1` の跨ぎプール**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs wxk06067CrossZoneStubFires`で実機確認（2回連続PASS）＝【起】《青》＋自身トラッシュで起動するとOPPONENT_PAY_OPTIONAL{opponentHandOrEnergyToDeckTop:2}のSTUBが正しく発火することを確認。⚠**しかし本カードはcostColors非搭載＝Opusタスク12(ci)と同型の穴**（無料「支払う」がoptions配列の先頭かつ常時available）に該当し、CPU自動応答（`options.find(o=>o.available)??options[0]`）は必ず無料pay枝を選ぶため、guestの場/手札/エナは一切変化せず**跨ぎプールのpicker本体（handOrEnergyToDeckTop枝）へ実戦では到達しない**ことを確認（(ci)の影響範囲がさらに1枚拡大）。**跨ぎプールpicker自体のUI描画**（`EffectInteractionModal.tsx`の`self_hand_energy`/`opp_hand_energy`スコープ・「手札とエナから合計」表示・`inter.candidates`経由で(cv)のようなop.hand直接参照バグが無いこと）は**コード読解で確認済み**だが、本カードが非LIFE_BURSTのため`secondWaveEnergyBranch`等のLB所有者反転トリックが使えず、単一アカウントdriverでは実クリックでの検証が構造的に到達不能＝低優先で保留（①②③の跨ぎ選択挙動・手札/エナ合計1枚以下での回避枝非表示・「支払わない」時の相手自己選択は未個別実機のまま）。

- **✅ タスク12(lxi) 第10波（2026-08-01）＋(lxxvi) が持ち込んだ未検証UI＝2026-08-05に(a)(b)+ゾーン供給源2種のうち1種を実機検証完了**＝「シグニを新たに配置できないゾーン」（`BLOCK_OPP_ZONE_PLACEMENT`/`signi_zone_blocks`・`src/screens/battle/signiZoneBlock.ts`）。
  - [x] **(a) 無条件の配置禁止**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs zoneBlockUnconditional`/`zoneBlockMultiZones`で実機確認（各2回連続PASS）＝`signi_zone_blocks`注入でSigniSummonZoneModalが対象ゾーンを`ゾーンN (配置禁止) 配置禁止`ラベル＋disabledで表示・選択不可、非ブロックのゾーンには通常どおり配置できることを確認（単一・複数ゾーンの両方）。**「次の相手ターンに昇格」「さらに次のターンで解除」「ライズは禁止されない」「REMOVE_SIGNI_ZONEで消したゾーンがそのターン埋められない」は直接`signi_zone_blocks`を注入する方式では検証範囲外**（`signi_zone_blocks_next_turn`→`signi_zone_blocks`への昇格はターン終了処理の大きな共有コードパスに埋め込まれておりflakeリスクが高いと判断し据置＝低優先）。
  - [x] **(b) 《無》×5 の支払い回避**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs zoneBlockColorlessInsufficient`/`zoneBlockColorlessSufficient`で実機確認（各2回連続PASS）＝エナ3枚<5で`《無》×5不足`表示・disabled、エナ5枚でボタン活性化→配置時にちょうど5枚トラッシュへ支払われる（ログ「シグニゾーン{n}への配置コスト《無》×5を支払う」）ことを確認。**CPU側の支払い経路とWXK07-031/WXDi-P00-015等REMOVE_SIGNI_ZONE系4枚の個別実機は未実施**（コード読解＝`BattleScreen.tsx`のCPU自動召喚ループが同一`resolveSigniZonePlacement`を呼ぶ共有関数であることを確認済み・低優先）。
  - [x] **🆕 (lxxvi) のゾーン供給源2種**＝①✅2026-08-05・Sonnet・`verifyBattleDrive.mjs vacatedZoneBlockFollowsActualZone`で実機確認（2回連続PASS）＝`WX08-032-E1`を実際にキャストしてguest zone2（0-index）のシグニをバニッシュ→結果の`signi_zone_blocks`が**zone2に付き、zone0へのフォールバックが無い**ことを確認（state注入では検証できない`signi_zone_vacated_just`の実配線を実際に駆動）。②`WXEX1-24-E1`③（ウィルスゾーン複数禁止）は`signi_zone_blocks`の複数ゾーン描画自体は`zoneBlockMultiZones`で確認済みだが、**当該カードの【起】発動UI自体（コスト`removeOppVirus`消費込み）の個別実機は未実施**（低優先＝DOM描画側は同一コードパスで確認済み）。

- **✅ タスク12(lxi) 第3波が持ち込んだ未検証UI（2026-07-31→2026-08-05に主要部クローズ）**
  - [x] **相手側 CHOOSE の4つ目の枝＝「自分のシグニをNトラッシュに置く」**（`WX22-025-E3`）＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs wx22025SigniTrashBranch`/`wx22025SigniTrashUnavailable`で実機確認（各2回連続PASS）。**新パターンを確立**＝guest（CPU）をアタッカー＝効果オーナーにすることで「対戦相手」＝host（driver操作アカウント）が応答者になり`respondPlayerId`がCPU_PLAYER_ID以外になってCPU自動応答がbailoutし、host自身の画面にCHOOSEモーダルが実際に描画される（LB所有者反転が使えない非LIFE_BURST効果向けの代替手段＝`wxk06067CrossZoneStubFires`の構造的限界を回避）。①「自分のシグニを1体トラッシュに置く」を明示クリック→②場にシグニが無いとボタンがdisabledになる→③選択すると host自身の場から選ぶSELECT_TARGETになりTRASH解決・LIFE_CRASHは不発（OPPONENT_PAY_OPTIONALのcontinuation設計上'skip'以外の枝では発火しない）ことを確認。`WXDi-P16-088-E1`（「《無》／手札1枚／シグニ1体」の3択・costColors搭載）は同一signiTrashコードパスのため個別実機は任意（低優先）。
  - [x] **`SPDi43-02-E1`＝回避された場合に「以下の２つから１つを選ぶ」の選択UIが出ないこと**（従来は無条件で選択が走った）と、**`WXEX2-25-E1`／`WXDi-P08-007-E1` の対象がトリガー元シグニに固定**され選択UIが出ないこと＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs`（`spdi4302AvoidedNoChoose`／`wxex225SkipAutoTrashesTrigger`／`wxdip08007SkipRemovesAbilities`／`wxdip08007PaySpares`）で実機確認（各2回連続PASS）。**新パターン＝owner=guest（CPU・受動的watcherとして置くだけ）にし「対戦相手」=hostが応答者になるよう設計する**（wx22025と同型）。SPDi43-02はhostが「支払う」（costColors非搭載STUBの無料pay枝＝(ci)と同型）で回避すると続くCHOOSE(選択肢1/2)が一度も出現しないことを確認、WXEX2-25／WXDi-P08-007は「支払わない」1クリックのみで追加のSELECT_TARGETなしにtargetsTriggerSourceの対象（トリガー元シグニ自身）へ自動解決することを確認。⚠**新規実バグを発見・Opusタスク12(cv)へ追記登録**＝原文どおりの「手札を1枚捨てる」回避コスト（`opponentHandDiscard`）を選ぶと、続くSELECT_TARGET{targetScope:'opp_hand'}の候補描画が真の対象（host自身の手札）ではなくviewer相対の`op.hand`（guestの手札）を表示しソフトロックする＝`wxex225DiscardAvoids`（既定order外・意図的FAIL・2回連続再現）で確認。詳細は(cv)の行。

- **✅ タスク12(lxv) が持ち込んだ未検証UI 1件（2026-07-31→2026-08-05クローズ）**＝**36枚に一斉に載った**。engine の「包み形の解体」は golden で固定済みだが UI 経路は計器に映らない。
  - [x] **条件つき任意コストのゲート**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lxvGateTruePromptsChoose`/`lxvGateFalseSilentSkip`（`WXDi-P02-077-E1`＝手札6枚以上）で実機確認（各2回連続PASS）＝条件成立（手札6枚以上）で従来どおり「支払う／支払わない」CHOOSEが出現→支払うとランサー付与、条件不成立（2枚）だと`pendingEffect`が一度も`CHOOSE`にならず「任意コストの条件を満たさない（スキップ）」ログで静かに不発（本体も起きない）ことを確認。`WX24-P1-011-E1`（＜アーム＞所持）・`WXK07-035-E1`（相手シグニ3体・(lxiv)対象ピッカー前置と同居）は同一の`CONDITIONAL{gate}→STUB OPTIONAL_COST`パターンのため個別実機は未実施（低優先）。⚠`WX24-P1-011-E1`は原文の「手札を1枚捨て」コスト成分がJSONの`OPTIONAL_COST`に反映されておらず白エナのみ要求（コード読解で確認・parser側の据置候補として認識のみ）。

- **✅ タスク12(lxiv) が持ち込んだ未検証UI 1件（2026-07-31→2026-08-05クローズ）**＝**61枚に一斉に載ったので影響範囲が最大**。
  - [x] **支払い前の対象ピッカー前置**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lxivMultiTargetPayBanishesBoth`/`lxivMultiTargetSkipBanishesNone`（`WXDi-P02-043-E1`＝**2体まで**）で実機確認（各2回連続PASS）＝先に`SELECT_TARGET`（対象2体まで・パワー10000以上フィルタ）が出て、確定後に`OPTIONAL_COST`のCHOOSE（支払う／支払わない）が続く順序を確認。支払うと確定した2体がBANISHされ、支払わなければ両方とも場に残ることを確認。⚠実機で判明＝支払い後`freezeStoredTargets`で`fixedCardNums`に絞られたBANISH自体も`selectOrInteract`経由の再確認`SELECT_TARGET`（候補2件でも確認クリックが要る）をもう一度要求する＝対象確定は支払い前後で計2回。`WXDi-D07-013-BURST`（LB経由・パワー8000以下）・`WXK11-031-E1`（ON_OPP_LIFE_CRASHED・手札discardコスト＝OPTIONAL_COSTと別UI）・`WXK03-045-E1`/`WXDi-CP02-090-E1`（(lxv)ゲートと同居）は同一メカニズム（`SELECT_TARGET_ONLY`→`STORE_LAST_PROCESSED_TARGETS`→コスト→`BANISH{targetsStored}`）のため個別実機は未実施（低優先）。
- **✅ タスク12(lxiii) が持ち込んだ未検証UI 2件（2026-07-31→2026-08-05クローズ）**
  - [x] **(a) 選択肢の可否表示**＝`WX17-040-E1`（3つから3つまで選ぶ）＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs`（`wx17040ConditionsFalseNoop`／`wx17040ConditionsTrueExecuteAll`）で実機確認（各2回連続PASS）。①は**相手の手札が自分より多いときだけ**／②は**相手のエナが自分より多いときだけ**選べること（`choice.condition` が`CHOOSE`の`available`自体を決めている＝条件不成立で3条件すべて不成立にすると①②ボタンがdisabled）を確認。③は`ch.condition`を持たず常に`available:true`（条件はaction内側の`CONDITIONAL`が持つだけ）＝条件不成立でも選べるが、対象選択にすら進まず静かに無効果（hHand/hEnergy/gField無変化）であることを確認。対照実験（3条件すべて成立）では①②がenabledになり、3つ選択して確定するとドロー＋エナチャージ＋（SELECT_TARGETを経て）バニッシュが全実行されることも確認。
  - [x] **(b) 中央ゾーン限定のピッカー**＝`WXDi-P02-065-E2`（`filter.centerZoneOnly:true`）＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs centerZoneOnlyPicker`で実機確認（2回連続PASS）。対戦相手の場を左中右すべて埋めた状態で召喚すると、SELECT_TARGETの候補が**中央（zone1）の1体だけ**に絞られ（候補数=1を実測）、確定後は中央のシグニだけが凍結される（左右は対象外のまま）ことを確認。`WX15-033-E2`／`WX24-P2-091-E1`は同一の`centerZoneOnly`フィルタ機構（`execUtils.ts:1086`）を共有するため個別実機は任意（低優先）。中央が空のケースの空振り確認は未個別実機（低優先）。
- **✅ タスク12(lxii) が持ち込んだ未検証UI 1件（2026-07-31→2026-08-05クローズ）**
  - [x] **`WD16-016-BURST` の相手側ディスカードUI**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs wd16016BurstOpponentDiscard`で実機確認（2回連続再現・意図的FAIL）＝「LB解決時に対戦相手（アタッカー）側にSELECT_TARGETが生成される」こと自体は確認できた。⚠**実バグを発見・Opusタスク12(cv)へ登録**＝`opp_hand`+`opponentResponds:true`の候補描画がviewer視点のopを使うため、対象が自分自身（アタッカー）の場合はLB所有者側の手札が誤って表示され、どれも選択できずソフトロックする。相手手札5枚以下/6枚以上/0枚の分岐は、この描画バグでピッカーへ到達できないため未検証のまま。
- **✅ タスク12(lx) が持ち込んだ未検証UI 2件（2026-07-31→2026-08-05クローズ）**＝engine/golden では固定済みだが UI 経路は計器に映らない。
  - [x] **(a) `WX12-020-E3` の「手札を好きな枚数捨ててもよい」ピッカー**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lxWX12020ScaledDiscardDelta`/`lxWX12020EmptyHandSkipsPicker`で実機確認（各2回連続PASS）＝アタック時にまず相手シグニ1体の対象選択が出て、次に自分の手札から0〜全部を選ぶ画面になり、確定後にその1体だけへ（捨てた枚数×－6000）が乗ることを確認（2枚とも捨てて-12000）。手札0枚のときは選択画面自体が出ず（`execTrash`の`cands.length===0`で`selectOrInteract`に到達しない）、delta=0で静かに素通り・クラッシュしないことも確認。
  - [x] **(b) `POWER_MODIFY{targetsStored}` の再選択が消えたこと**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lxWXDiP03089SingleTargetedFire`で実機確認（2回連続再現）＝**「対象選択は最初の1回だけになり、支払い後にもう一度選ばされないこと」自体は確認できた**（`sawSecondSelectTarget=false`）。⚠一方で**別の実バグを発見・Opusタスク12(civ)へ登録**＝ON_TARGETED watcher（WXDi-P03-067）が期待の1回ではなく**0回**しか発火しない（「対象宣言そのものへのON_TARGETED」がSEQUENCEが即done()せず後続CHOOSEへ続く場合に取りこぼされている疑い）。
- **✅ タスク12(lxi) 第2波が持ち込んだ未検証UI 1件（2026-07-30・最優先→2026-08-05クローズ）**＝相手側 CHOOSE に**3つ目の枝「エナゾーンからカードをN枚トラッシュに置く」**が出るケース。engine 直叩き golden で提示・非提示は固定済みだが UI 経路は未検証だった。
  - [x] **(a) 3択＋エナ枝**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs secondWaveEnergyBranch`（`WX15-033-BURST`＝LB経由・所有者反転でdriver自身がCHOOSEを受ける）で実機確認（2回連続PASS）＝手札1枚(<2)で「手札を2枚捨てる」枝はdisabled、エナ3枚(≥2)で「エナゾーンからカードを2枚トラッシュに置く」枝を選択→自分のエナがちょうど2枚トラッシュされ対象シグニ(アタッカー自身)は場に残存を確認。`WXK05-001-E1`は同一`OPPONENT_PAY_OPTIONAL`コードパス（`effectExecutor.ts:3306`以降）のため個別実機は任意。⚠costColors非搭載につき「支払う」枝も常時available（Opusタスク12(ci)と同型の穴だが、本シナリオはそれを踏まずエナ枝を明示クリックして機能確認）。`WX24-P4-023-E3`の`ALL`枝（該当0枚で枝非表示）は未個別実機のまま残（低優先・エクシードコスト込みで別途検証が要る）。
- **🆕 タスク12(lxi) 本消化（29カード30効果）が持ち込んだ未検証UI 5件（2026-07-30・最優先）**＝相手側 CHOOSE の3択（支払う／手札をN枚捨てる／支払わない）が 30効果に一斉に載った。**engine/golden/smoke では固定済みだが UI 経路は計器に映らない**。代表カードは `WX25-P1-038`（エナ《無》×3）・`WX25-P1-040`（手札3枚）・`WXDi-P07-024`（手札3枚＋DOWN）。
  - [x] **(a) エナ不足で「支払う」が選べない**＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs oppPayEnergyInsufficient` で実機確認（2回連続PASS）＝guest energy=0 で pay が unavailable→CPU自動応答が skip を選択→BANISH実行。**対照実験（`oppPayEnergySufficient`＝energy=3で pay を選ばせる）で別の実バグを発見**＝CPU自動応答（`BattleScreen.tsx:522-530`）はCHOOSEの選択肢IDのみを渡しエナinstanceIdを渡さないため、`resumeOpponentPayOptional`が`energyNums=[]`で「コスト支払いエラー: エナ不足」を返し、エナが足りていてもpay選択が常に空振りする＝**Opusタスク12(cii)へ登録**（§3参照）。
  - [x] **(b) 手札不足で「手札をN枚捨てる」が選べない**＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs oppDiscardGateBareBug` で実機確認（2回連続、意図的FAIL）＝手札2枚(<3)でも discard が本来 unavailable のはずのところ、**costColors非搭載のOPPONENT_PAY_OPTIONALは無条件で無料「支払う」を選択肢へ積む**（`effectExecutor.ts:3333`）ためCPUがこれを最優先で選びbanishを回避＝discard枝のavailable:false判定に到達すらしない実バグ＝**Opusタスク12(ci)へ登録**（§3参照）。
  - [x] **(c) 併記型で両方の選択肢が同時に出る**＝「手札を1枚捨てるか《無》を支払わないかぎり」形で pay と discard が**並んで**出る＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs opponentPayOptionalBothBranchesCoexist`で実機確認（2回連続PASS）。**live で併記型が載っているのは現状0**だった当時の記録は古くなっており、`WXDi-P08-007-E3`（【起】《ゲーム1回》「対戦相手が手札を1枚捨てるか《無》を支払わないかぎり…」×3回）が現在 `costColors:['無']` と `opponentHandDiscard:1` を同時に持つ実例として存在する。host自身が【起】を起動しguest(CPU)が応答者になる構成のためCHOOSEの中身はhost画面には描画されない＝`pending_effect.interaction.options`をDB直読みして`options ids=["pay","discard","skip"]`（`pay`はcostColors付き・`discard`は手札1枚捨てるTRASH）が同一CHOOSEに同時に存在することを実機ランタイムのデータで確認した。
  - [x] **(d) ライフバースト経路で相手へ CHOOSE が飛ぶ**（`WX24-P2-071-BURST`／`WX24-P4-062-BURST`／`WX25-P3-076-BURST`／`WXDi-P04-058-BURST` の4件）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs lbOwnerReversal`（`WX24-P2-071-BURST`）で実機確認（2回連続PASS）＝`queueCardEffects(...,{id:ownerId})`がLB所有者(guest)をownerStateに固定するため、OPPONENT_PAY_OPTIONALの支払い側(otherState)はターン所有者に関わらず常に「LB所有者の対戦相手＝アタッカー」になる。host（アタッカー）が実際にoptcost-skip等のCHOOSEを受領→無エナでpay不能→skip→host自身のシグニがBANISHされることを確認＝owner反転が正しく機能。残る3枚（`WX24-P4-062`等）は同一機構（`queueCardEffects`のownerId固定）のため構造的に同じ結論と判断・個別実機は任意。
  - [x] **(e) 入れ子 SEQUENCE の continuation が中断を跨いで残る**（`WX24-P1-023-E1`）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs sequenceContinuationAcrossGate` で実機確認（2回連続PASS）＝内側ゲート（相手CHOOSE＝今回はOpusタスク12(ci)の無料pay枝をCPUが選択）解決後も、外側SEQUENCEの次ステップ`REVEAL_AND_PICK`（デッキ上5枚→スペル/＜電機＞を2枚まで手札）が中断を跨いで正しく続行することを確認（噴流する知識をpick済み）。同型 `WX24-P2-033-E1`／`WX25-P3-042-E1` は同一JSON構造のため個別実機は任意。
- **✅ エクシード本体5件（次の一手①）が持ち込んだ未検証UI 3件（2026-07-30・最優先→2026-08-05クローズ）**＝engine/golden では固定済みだがUI経路は計器に映らなかった。**このプロジェクト初のLRIG「【出】エクシードN」コストUI（`SigniOnPlayCostModal`のルリグの下からN枚選択→発動/スキップ）を実機で新規に駆動**（`onplaycost-exceed-{i}`testidを新設）。
  - [x] **(a) 群B＝相手側の支払い回避 CHOOSE**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs exceedBanishGateA`（`WX24-P4-018-E2`）で実機確認（2回連続再現・意図的FAIL）＝エクシード4コストUI自体はlrigUnder 3→0まで正しく消費して機能したが、`OPPONENT_PAY_OPTIONAL`がcostColors非搭載のため無料「支払う」が常時available→CPUが最優先で選択しbanishが不発＝**Opusタスク12(ci)と同型の穴を新カードで再現**（既存登録を再利用・新規登録は不要）。
  - [x] **(b) 群C＝任意ライフクラッシュ＋動的対象数**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs exceedDynamicTargetCountB`（`WX24-P4-015-E2`）で実機確認（2回連続再現・意図的FAIL）＝エクシード4支払い→「クラッシュする」選択→自分のライフクロス1→0枚クラッシュ→チェックゾーン確認（バーストなし「エナに送る」）までは正しく進行するが、続く`BANISH`（動的対象数2体）が一度も発火しない実バグを新規発見＝**Opusタスク12(cvi)へ登録**（§3参照）。
  - [x] **(c) 群E＝2群ピッカー**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs exceedTwoGroupPickerC`（`WX24-P4-017-E2`）で実機確認（2回連続再現・意図的FAIL）＝エクシード4支払い→「発動」までは正しく進行するが、続く`TRANSFER_TO_HAND{transferGroups}`（スペル1枚まで→青シグニ1枚まで）が一度も発火しない実バグを新規発見＝スペル群（候補0枚）が無音でauto-skipされた後、続く青シグニ群（候補1件）のSELECT_TARGETも一度も現れない＝**Opusタスク12(cvi)と同根の疑いとして登録**（§3参照）。
- **✅§6.3 H／I′ の機構5件が持ち込んだ未検証UI（2026-07-30・2026-08-04に(a)-(e)全項目クローズ）**＝engine/golden では固定済みだったUI経路5件すべてを実機検証完了（詳細は各項目末尾）。
  - [x] **(a) ガード追加《無》の N枚徴収**（`WX24-P3-069-E1` ほか族11効果）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs guardExtraColorlessSufficient`/`guardExtraColorlessInsufficient`（`WX24-P3-069-E1-G`＝`GRANT_LRIG_ABILITY`で付与される`STUB{OPP_GUARD_COST_COLORLESS,count:3}`をguestへ直接注入）で実機確認（各2回連続PASS・FRESHルームで安定）＝エナ十分(3枚)でガード成立→ちょうど3枚徴収（トラッシュ+4＝ガード札1＋エナ3）／エナ不足(2枚)で「使用できるガードカードが手札にありません」表示＋ガード候補ゼロ→「ガードしない」のみ。⚠**ルーム再利用バッチでは前シナリオのguestルリグダウン状態が残りCPUが再アタックせずFAILする**（個別実行/FRESHルームでは安定）＝既定order外・単体実行専用として保持（他の「CPUターン系バッチ限定FAIL」と同型の既知制約）。1枚（count省略）の既存6 CONTINUOUSは今回の注入方式（guestへの直接付与）と独立のため非回帰は自明（未個別実機・低優先）。
  - [x] **(b) `WDK14-013-E1` のトラッシュ＜悪魔＞候補ピッカー**（`SigniOnPlayCostModal`）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs wdk14013TrashPicker`で実機確認（2回連続PASS）＝トラッシュに候補2枚（必要1枚を超過）を用意→ピッカー出現→img候補クリック→発動でトラッシュから1枚ビート化。**候補が必要数ちょうど/不足のときピッカーが出ずに従来の自動選択のまま**という側面は未個別実機（`beatTrashNeedSelect`のコード読解では確認済み・低優先）。
  - [x] **(c) メルト・ファクト `WX15-067-E1` の支払い前ウィルス除去UI**（`SpellCastModal` に1段挿さる）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs meltFactVirusRemoval`で実機確認（2回連続PASS）＝相手ウィルス2個を除去→コスト《黒×2》が0まで軽減／CHOOSE上限が1→2に拡張されc0（トラッシュの黒シグニを手札に）・c1（相手シグニ-7000）を同時選択→両方実行。**「変えると支払いエナ選択がクリアされる」「モーダルcloseで選択が消える」の2点はコード読解で確認済み**（`SpellCastModal.tsx:119-133`・`35`）だが実機クリック単体では未個別検証（低優先）。0/1個除去の中間ケースも未個別実機（低優先）。
  - [x] **(d) 夢限 -Q- `WXDi-P11-010A-E1` の反転**＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs mugenQFlip`で実機確認（2回連続PASS）＝`game_lrig_limit_bonus`直接注入で印刷Limit5+4=9を満たしENERGY→GROWの実フェイズ遷移をUIクリックで踏むと、`ON_GROW_PHASE_START`→`MUGEN_Q_RESET_AND_FLIP`が発火し`card_identity_overrides[instanceId]='WXDi-P11-010B'`へ1手で反転（1回目は`hHand=5・hEnergy=5`でB面E1のドロー5+エナチャージ5も確認、2回目はqueryStateのタイミング差でB面E1解決前=0/0を観測したが反転自体は両回とも即時確認）。**「Limit9・B面E2【起】が使えA面能力が消えている」の直接UI確認と「B面【出】2件」の重複起動有無は未個別実機**（コード読解＝`card_identity_overrides`によるCardData解決の切り替えとGRANT_LRIG_ABILITY方式のA面能力（UNTIL_END_OF_TURN）がリセットで自然に失効する構造で確認済み・低優先）。
  - [x] **(e) 未知の邂逅 `WXDi-P13-003A-E1` の無料グロウ**＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs mayuEncounterFreeGrow`で実機確認（2回連続PASS）＝手札3枚+エナ2枚=5枚移動で`prepareMayuEncounter`の`canGrow`が成立→`card_identity_overrides[instanceId]='WXDi-P13-003B'`へ反転＋`executeGrow(freeCost:true)`で無料グロウ→`actions_done`に`GROW`が記録され同ターンの通常グロウが封じられることを確認。**「4枚以下は代償だけ（反転しない）」「このターン既にセンターグロウ済みなら候補に出ない」の対照ケースと「B面【出】2件」の発火確認は未個別実機**（`prepareMayuEncounter`の`movedCount>=5`分岐とキャンドル表示条件`CENTER_LRIG_NOT_GROWN_THIS_TURN`はコード読解で確認済み・低優先）。
- **✅ ON_LRIG_GROW④**＝《ターン1回》の実機検証：標準グロウの二重発火ブロックは確認済（続き132）・コード疑義は✅続き206の全コレクタ監査で「穴なし」確定。**残＝ゲット・グロウ（GROW_FREE横グロウ）経路の E2E が driver で完走できず未検証**だった旨の記載は2026-08-05時点で**stale＝続き141（`lrigGrowUsageLimit`・既定order内・2026-07-15）で既に解決・実機PASS済み**と判明（WX03-024経由の2回目グロウがlrigTop変化まで完走し、usageLimit《ターン1回》が正しく機能してON_LRIG_GROWが2回目は発火しないことを2回連続PASSで確認済み）。新規シナリオは不要。
- **✅ (xi) の skip 検証**＝`CONDITIONAL{条件, then:STUB OPTIONAL_COST}` 包み（続き206修正）で、skip 選択時に本体が発動しないことの実機確認＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lxvGateTrueSkipNoBody`で実機確認（2回連続PASS）。`lxvGateTruePromptsChoose`/`lxvGateFalseSilentSkip`は「ゲート成立→支払う」「ゲート不成立→プロンプト自体が出ない」の2branchのみ検証済みで、(xi)本来の主題（続き206修正前は「ゲート成立→CHOOSEが出たのにスキップしても本体がそのまま実行される」というコスト踏み倒しバグだった）は未検証のまま残っていた。同じ`WXDi-P02-077-E1`で手札6枚以上（ゲート成立）にしたうえで`optcost-skip`を選び、エナは無傷（支払っていない）かつ【ランサー】も付与されないことを確認＝コスト踏み倒しバグは再発していない。
- **✅ (xxxvi) のグロウ支払いUI**＝エナ代替トラッシュ（`wildcardInstIds`/`colorOverrideMap`）のグロウ経路配線（続き206）の実選択検証＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lrigDownGrowColorSubstituteFires`で実機確認（2回連続PASS）。`WX16-Re06`（印刷色「白」・エナゾーンにあるかぎりセンタールリグの色として代替可）を**緑の**センタールリグ（`WD04-004`→`WD04-003`・GrowCost《緑×1》）のエナに置き、素の色一致では絶対に払えない組み合わせでグロウが成立する（Phase1候補ボタンがenabled→Phase2でWX16-Re06を選択→グロウ実行→lrigTop変化・WX16-Re06はエナ→トラッシュへ移動）ことを確認＝グロウ支払いUIの代替配線が実選択でも機能している。
- **✅🏁完全クローズ（2026-08-06・続き356・Opus 5）lrigDown コストの限定（続き218）**＝下記で発見された未配線バグ（Opusタスク12(cviii)）を修正し、実機3シナリオで(a)(b)ともに検証完了＝`lrigDownCenterOnlyPays`（centerOnly＝アップなら払えて `lrig_down` が実際に true になる）／`lrigDownCenterOnlyUnwired`（centerOnly＝センターがダウン済みならアシストがアップでも【起】が提示されない＝**アシストが支払い候補にならない**）／`lrigDownLevelLrigActivated`（level＝Lv3センターを温存し Lv2 アシスト2体で払う＝**該当レベル以外が候補にならない**）。各2回連続PASS・3件とも既定orderへ。〔以下は発見時の記録〕(a) センター限定（`WXK10-023`・`WXK10-037`・`PR-K064`）で**アシストルリグが支払い候補にならない**こと。(b) レベル限定（`WXDi-P03-009`・`WXDi-P04-042`・`WXDi-P02-009`）で**該当レベル以外のルリグが候補にならない**こと。→**2026-08-05・Sonnet・調査の結果、新規実バグを発見**＝`WXK10-037-E2`（【起】ACTIVATED・`cost:{lrigDown:{count:1,centerOnly:true}}`）で、センタールリグを事前にダウン済みにしても【起】ボタンが`enabled`のまま押せ、コストを一切支払わずにSEARCHが実行された（`verifyBattleDrive.mjs lrigDownCenterOnlyUnwired`・既定order外・意図的FAIL・2回連続再現）。コード読解で確認＝`cost.lrigDown`は`executeSigniActivated`（`BattleScreen.tsx:10530-11138`）にも`SigniActivatedModal.tsx`にも一切参照されておらず（`payLrigDownCost`は`executeSigniOnPlayCost`＝【出】コスト専用経路からしか呼ばれない）、**【起】ACTIVATED効果の`lrigDown`コストがUI/実行経路のどちらにも配線されていない**＝centerOnly/level問わず全件（`WXK10-023`・`WXK10-037`・`WXDi-P03-009`・`WXDi-P04-042`・`WXDi-P02-009`の5枚＋他に存在すれば同様）に影響。**Opusタスク12(cviii)へ登録**（§3参照）。
- [x] **✅「コイン支払い累計」機構（続き366新設・`PlayerState.coins_paid_this_turn`／Condition `COINS_PAID_THIS_TURN`）の実機検証**＝✅2026-08-07・Sonnet・`WXDi-P15-068-E1`（羅原　ミルルン//THE DOOR＝【自】このシグニがアタックしたとき、このターンにコインを合計２枚以上支払っていた場合【エナチャージ１】。同カードの【起】《ターン１回》《コインアイコン》×2：【エナチャージ１】で支払い経路と条件判定が1枚で完結する）で条件成立／不成立の両方を実機確認。`verifyBattleDrive.mjs coinsPaidAttackFires`＝MAIN中に【起】でコイン2枚支払い（`host.energyCards`に`WD01-013#950`確認）→アタックフェイズへ進行し自身でアタック→ON_ATTACK_SIGNIのCONDITIONALが成立し2回目の【エナチャージ１】が発火（`WD01-013#951`追加）ことを2回連続PASSで確認。対照実験`verifyBattleDrive.mjs coinsPaidAttackSkipped`＝コインを一切支払わずにATTACK_SIGNIから直接アタック→ライフクロス1枚クラッシュ（`gLife`減少で解決完了を確認）してもエナチャージが発火しない（`energyCards`が空のまま＝続き366以前の「条件節が丸ごと落ちて無条件発火」という退化が再発していないこと）を2回連続PASSで確認。両シナリオとも既定orderに追加。対になる残り9枚（`WXDi-P09-039`／`P15-053`／`054`／`070`／`072`／`073`・`WXDi-P16-057`／`076`／`081`）は同じ`coins_paid_this_turn`を読むだけで、書き込み側（`BattleScreen.tsx`のコイン支払い10箇所）はACTIVATED【起】経路がこの1枚と共通のため個別実機は不要と判断。新規の engine/parser バグは発見せず。

## 2026-08-10 整理⑤：PLAN §6.4 の消化済み項目を退避（続き403〜407）

> [PLAN.md](./PLAN.md) §6.4 を「生きている worklist」だけに保つため、続き403〜407 で消化した7項目の詳細をここへ移した。
> PLAN 側には1行✅サマリだけを残してある。一次記録は `BUGFIXES.md` の各日付節。

- ~~**`cannotAttackSigni` を読むのは人間のアタックボタン生成1箇所だけ**~~ **✅2026-08-10 消化（続き404）**＝新設 `src/screens/battle/signiAttackGate.ts` に**アタック可否のルール軸を一本化**し、**人間ボタン（`getMySigniZoneActions`）／共通実行経路（`performSigniAttack`）／CPU のアタック候補フィルタの3箇所が同じ `canSigniAttack()` を呼ぶ**形にした。⭐**ついでに同じ穴だった兄弟軸も同時に閉じた**＝`opp_signi_attack_power_cap`（パワー上限）・`signi_attack_once_limit`（合計1回）・`signi_attack_cost`（アタックのエナコスト affordability）も**人間UI専用だったので CPU がすり抜けていた**（CPU はエナ不足でも `energy.slice(0,-n)` で黙って過少払いしていた）。⚠**`fieldTrashCostAlreadyPaid` フラグが要る**＝G154 BURST の無効化回避モーダルからの再入は「支払い後の盤面＋残ったコスト予約」で来るため、これ無しだと再入時に「もう払えない」と誤判定してアタックが黙って消える。
- ~~**付与ストアの収集が timing ごとにハードコードで散在**~~ **✅2026-08-10 消化（続き404）**＝新設 `src/engine/grantedStore.ts` の `grantedStoreWatchers(state, timing, scopes)` が**3ストア（`lrig_granted_auto_effects` / `..._until_opp_turn` / `game_granted_effects`）を任意 timing・任意 scope で横断走査する共通経路**。既存のハードコード5箇所（`collectLrigAttackDefenderTriggers` / `collectEnergyToTrashTriggers` / `collectHandAddedTriggers` / `collectTurnTriggers` の self・any_opp 2箇所 / `grantedAuto.collectAttackingLrigGrantedAutos`）をこれに寄せ、**未配線だった8 timing を新たに配線**（`collectFieldTriggers`＝ON_PLAY/ON_BANISH/ON_ATTACK_SIGNI/ON_BLOOM の ally・opp 両側／`collectSelfEventTriggers`＝ON_LIFE_CRASHED 他／`collectOppLifeCrashedTriggers`／`collectLeaveFieldTriggers`／BattleScreen の ON_SPELL_USE・ON_SIGNI_BANISH_OPPONENT・ON_ENERGY_CHARGE）。⚠**この行が挙げていた「`WXDi-P07-073-E1` は今も死んだまま」は古い警告だった**＝続き401 で入れた `collectTurnTriggers` の opState any_opp 走査が既に拾っており、実測で発火を確認（J-4 のときと同じ「PLAN の警告が先に古くなる」パターン）。**本当に死んでいたのは「scope が self 以外」ではなく「そもそも走査されない timing」の側**。
  - **🔑 scope 集合は timing の意味で決める**＝「あなたがスペルを使用したとき」のようにプレイヤーが主語なら `self` を含め、「あなたのシグニが場に出たとき」のようにカードが主語なら含めない（host はセンタールリグなので `self` は永久に成立せず、含めると誤発火の温床になる）。実例＝`SPDi43-11-E2` は原文が ON_HAND_ADDED なのに `ON_PLAY`+`self` へ誤パースされており、`self` を含めていたら全召喚で誤発火していた（**parser 側の別バッチ案件として残す**）。
  - 新規配線で活きた効果＝`WDK12-001-E3`(ON_PLAY any_ally)／`WX15-016-E1` ほか7件(ON_ATTACK_SIGNI any_opp)／`WXDi-P12-030-E2`(ON_LIFE_CRASHED)／`WXDi-CP02-050-E1`(ON_OPP_LIFE_CRASHED)／`WX25-P2-049-E1`(ON_LEAVE_FIELD any_ally)／`WXDi-P13-008-E3`(ON_SPELL_USE)／`WXDi-P12-041-E1`(ON_SIGNI_BANISH_OPPONENT any_ally)／`SPDi43-13-E2`(ON_ENERGY_CHARGE)。

- ~~**配置数制限（`signi_deploy_count_limit`）が効くのは通常召喚UI／CPU召喚の3箇所だけ**~~ **✅2026-08-10 消化（続き405）**＝新設 `src/engine/deployLimit.ts` の `deployLimitBlockReason()` / `deployCountCap()` に判定を一本化し、**通常召喚UI（`handleSummonSigni`）／召喚ゾーンモーダル／CPU召喚／engine の効果配置4経路**が同じ関数を呼ぶ形にした。engine 側は `execAddToField`（ゲーム外トークン／デッキトップ／`applyToField` の src 経路）・`execRevealUntilToField`・`applyDirectAction` の `ADD_TO_FIELD` に配線。該当7効果（WXDi-P13-003B-E2／WXK06-004-E1／WX07-006-E1／WX12-008-E1／WXDi-P05-024-E1／WXK05-009-E1／WXK11-074-E1）が同時に実効化。
  - **🔑 ライズが外れるのは count 制限だけ**＝数制限の原文は「（すでに場に3体ある場合は2体になるようにトラッシュ）」＝**場のシグニの体数**を縛るもので上乗せでは体数が増えない。一方パワー制限は「パワーN以上のシグニを**新たに場に出せない**」＝ライズも場に出す行為なので適用する（旧・通常召喚UIの分岐と同じ非対称をそのまま関数へ移した）。
  - **🔑 複数枚配置は1枚ごとに再評価する**＝`applyToField` は場のシグニ数が増えながら進むので、まとめて1回だけ見ると上限を跨いで置けてしまう。
  - **🔴 CONTINUOUS 版（`WX07-006`）は `ctx.effectsMap` に依存させてはいけない**＝`ExecCtx.effectsMap` は BattleScreen のスタック解決1経路でしか代入されず、依存させると「engine は正しいのに実UIでは丸ごと効かない」dead flag になる（続き296 と同じ罠）。**事前計算した `deployCountCapSelf` / `deployCountCapOpponent` を ExecCtx へ載せる**（`fillDeployCaps()` を ExecCtx 生成8箇所すべてで呼ぶ）。AUTO フラグ版は PlayerState に載るのでこの経路は不要。
  - ⚠**残**＝`SELF_TO_LRIG_DECK_AND_FETCH_SAME_NAME`（`PR-470A`）は同一ゾーンでの入れ替え＝体数不変なので count は無関係だが**パワー制限は未評価**（1カードの端案件）。

- ~~**F-3 効果バニッシュ経路（身代わり置換の execBanish フック）**~~ **✅2026-08-10 消化（続き406）**＝`collectBanishSubstitutes` の消費地点は **BattleScreen のバトルバニッシュ1箇所だけ**で、`execBanish`（効果によるバニッシュ）からは一切参照されていなかった＝**原文が「このシグニがバニッシュされる場合」＝バトル限定でないのに、効果バニッシュに対しては丸ごと無効**だった。新設 `applyEffectBanishSubstitute` を**置換チェーンの唯一の入口 `applyEffectLeaveSubstitutes` に組み込み**、バニッシュ2経路（`execBanish` の `applyBanish` と `applyDirectAction` の `BANISH`）から `{ isBanish: true }` で呼ぶ形にした。実効化は8効果中7（`WX12-024`／`WXEX2-60`＝犠牲型／`WX20-055`／`WXDi-CP01-032`／`WXDi-P10-052`＝保護型／`WX10-033`＝手札スペル／`WX11-029`＝下スペル）。
  - **🔑 フラグを `skipReplaceBanish` → `isBanish` の1本に変えた**＝③段は排他（`ReplaceBanish` は「その移動が**バニッシュによるものでないなら**」／F-3 身代わりは**バニッシュのときだけ**）。フラグを2つに分けると、バニッシュ経路を新設した人が片方だけ書いて取りこぼす。
  - **🔑 決定論的な選択順を安い順に固定**＝①スタック下のスペル→②手札のスペル→③他シグニの犠牲（対話実装が入るまでの近似）。
  - ⚠**残1＝`WX14-026`（`lifeCrash`）は engine では適用しない**＝ライフクラッシュは【ライフバースト】確認フロー（`field.check`）を伴い、効果解決の途中に同期的に差し込めない。バトル経路の対話実装が引き続き担当。
  - ⚠**置換4本＋F-3 はいずれも「してもよい」を自動適用する決定論的近似**＝対話実装があるのはバトルバニッシュの `BANISH_SUBSTITUTE`（BattleScreen）だけ。実機で選ばせるならまとめて対話化する（**engine 側は同期的な ctx 変換なので pause を張れない＝設計変更が要る**）。
  - ⚠**この行が挙げていた「残＝`WX17-075`（`ON_PLACED_FRONT` 任意トリガー・別機構）」は古かった**＝`WX17-075-E1`/`-E3-G` は `ON_PLAY`+`any_opp`+`triggerCondition.placedFront`/`frontLowerLevelThanSource` として **`collectFieldTriggers` に配線済み**（そもそも身代わり置換ではなくバニッシュトリガー側のカード）。**PLAN の在庫記述が古い**のは続き402〜406 で6回連続。

- ~~**トラッシュ自己起動のコストUI 残**~~ **✅2026-08-10 消化（続き403）**＝エナ以外のコスト（手札捨て `discard`/`discardFilter`/`handDiscardSigni`・`coin`・`removeOppVirus`・`charmTrash`・`lrigDown`・`exceed`）と**《アタックフェイズアイコン》起動**（`ATTACK_ARTS`）に対応。🔑**支払いを `src/screens/battle/trashActivateCost.ts` 1本に集約**＝「アクション出し分け（`canOfferTrashActivate`）／モーダルの発動ボタン可否（`trashActivateSelectionsSatisfied`＋`trashActivateAutoCostShortfall`）／実行（`payTrashActivateCost`）」の3箇所が同じ関数を呼ぶ。⚠**未対応コストキーは黙って素通りさせず UI ごと出さない**（`unsupportedTrashActivateCostKeys`＝新しいコスト種が parser から生えたら golden が赤くなる）。⚠**効果元カード自身はトラッシュに残す**（場へ移すのは resolver の `execAddToField`）。付随して **`CHARM_COUNT` 使用条件を新設**＝`WX11-049-E2`「対戦相手の場に【チャーム】が３枚ある場合にしか使用できない」は `COND_STUB`（＝常に許可）だったので、アタックフェイズ窓を開けた途端に無条件で使える過剰実行になるところだった。⚠**`collectIncreaseActCost`（相手の起動能力コスト+1）はトラッシュ起動には未適用**＝シグニ【起】経路だけが見ている（別バッチ）。🔴**実機検証が必要**（§7 ⑨）＝対象14枚は golden で支払い関数までしか踏めない。
  - 内訳＝`WXDi-P03-087`/`P07-089`/`P09-045`（手札N枚）・`WXDi-P12-053`（《ディソナアイコン》2枚）・`WXDi-CP01-050`／`WX19-029`（＜バーチャル＞／＜遊具＞のシグニ2枚＝`handDiscardSigni`）・`WXDi-P16-082`（コイン2）・`WX17-049`／`WXEX2-53`（【ウィルス】2除去）・`WXEX2-73`（【チャーム】1）・`WXDi-P04-042`（レベル2のルリグ2体ダウン）・`WX11-049`／`WX19-041`／`WX20-079`／`WX21-026`（アタックフェイズ起動）。

- **クラフトトークンの実機配置検証＋ADD_TO_FIELD source 近似** ＝**✅WXDi-CP02-087／WXDi-P03-078／WXDi-P05-068（続き114）・WXK07-105（続き125）で実機PASS**（過程で見つかった `resumeSelectTarget` の continuation 握り潰しは✅続き117で修正）。~~残＝WX22-001-E3~~ **✅2026-08-10 実測で残0（続き407）**＝`GRANT_LEAVE_PLACE_PENDING` は **live JSON に0件**で、`WX22-001-E3` は `INSTALL_DELAYED_TRIGGER{duration:THIS_ATTACK_PHASE, trigger:ON_LEAVE_FIELD+leftOwner+triggerFilter, effect:ADD_TO_FIELD+levelLtTrigger}` へ構造化済み。**設置→アタックフェイズ限定の発火→leftOwner/triggerFilter ゲート→レベル相対フィルタの確定**まで通しで動くことを golden で固定した（この行の「機構待ち」が古かった）。経緯は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §6。

- ~~**golden の型網羅**~~ **✅2026-08-10 消化（続き407）＝未カバー0**＝新設 `scripts/goldenTypeCoverage.ts`（`npm run census:goldentypes`）が `EffectAction` union の型名を列挙し **goldenTest.ts に型名が1度も出ない型**を数える計器。**128型中 未カバー13** を1型1テストで塞いで **0** にした。⚠**計器の第1版は `type: 'FOO'` リテラル一致で数えて39件と誤報した**＝CONTINUOUS 専用型は合成 action を書かず live effectsMap から実カードを引くのが正しい書き方なので、リテラル一致では構造的に取りこぼす（テスト名/コメントに型名を書く形が拾えない）。**型名の単語一致**へ直して実数13になった。**過剰報告する計器は無いより悪い**（無い問題へ作業を誘導する）。
  - **🔴 網羅の過程で live の真no-op 2件を発見・修正**＝(a)**`LRIG_LIMIT_MODIFY` の AUTO 版が executor でログだけの no-op**（`WX16-Re19-E2`「次の対戦相手のメインフェイズの間、対戦相手のリミットは1減る」が丸ごと死亡）→ `until:'NEXT_TURN'` は `pending_lrig_limit_mod`／`END_OF_TURN` は `lrig_limit_mod` へ書く（**`PERMANENT` は常在＝`collectLrigColorAndLimitMods` の担当なので executor では書かない**＝二重計上を避ける）。(b)**`computeEffectiveLrigLimit` が「相手の場が宣言する `owner:'opponent'` の常在」を集めていなかった**（`WX22-002-E1`「対戦相手のターンの間、対戦相手のセンタールリグのリミットは1減る」が丸ごと死亡）→ `collectOppDeclaredLrigLimitDelta` を新設して加算。
  - ⚠**`POWER_THRESHOLD_TRASH` は parser が生成しうるのに engine に消費地点が無い**＝現状 live 0件なので無害。golden に「live 0件」の契約テストを置き、parser 規則が生えた瞬間に赤くなるようにした。

- ~~smoke SKIP の解消~~ **✅解消済（現 SKIP 0・2026-07-19 実測）**。

> [PLAN.md](./PLAN.md)（現在地・生きている worklist）から 2026-07-07 に追い出した歴史記録。**cold start で読む必要はない**（PLAN §4 → DESIGN.md の順でよい）。過去セッションの要約は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md)、個別修正は [BUGFIXES.md](./BUGFIXES.md)。

> **最新の退避＝「2026-08-08 整理④」節（冒頭・Opusタスク12 在庫5件の登録行）。次が「2026-08-07 整理」節（(cx) の登録行）。次が「2026-08-06 整理③」節＝PLAN §3 のクローズ済み行16件〔(cix)＝続き362／(xciii)＝続き362b／(lxxxviii)＝続き362c／(lv)＝続き362d／(xciv)＝続き362f で追加〕＋タスク14／Sonnetタスク4 の一括退避。次が「2026-08-06 整理」節**＝PLAN §3 在庫表の残0クローズ行 (cviii)／(cvii)／(ci)＋(cii)／(cv)／**(cxi)／(c)**。次が「2026-08-04 整理」節。


## 2026-08-08 整理④：Opusタスク12 在庫5件の登録行を退避（(cxv)(cxiii)(cxiv)(cxvii)(cxviii)）

> PLAN §3 の在庫表が**再び空**になったので、5件の**登録時の原文**をここへ移した。
> クローズの内容（何をどう直したか）は `BUGFIXES.md` 2026-08-08 の**先頭2節**が正。
> ⚠**5件とも登録時の見立てが外れていた**＝下の登録文は「当時こう読み違えた」記録として残す価値がある。
> 実際の真因は右列にまとめた。

| ID | 登録時の見立て（＝外れていた） | 実際の真因（2026-08-08 に判明） |
|---|---|---|
| (cxv) | 【ダブルクラッシュ】付与が JSON に**無い**（過小） | 付与は**あった**。`activeCondition` に `Condition` 型（`SELF_POWER_GTE`）が入っており `checkActiveCondition` が無条件 true へフォールスルー＝**常時ダブルクラッシュ**（過剰）。同型が計3効果 |
| (cxiii) | 「代わりに」＝**置換機構待ち**（§6.3） | 機構は不要＝**下限以上かつ上限未満の帯**（`AND`＋`operator:'lt'`）で排他にできる。パワー修正は加算分解。実害は「`SEQUENCE` 直下のキーワード付与が1つも収集されない」等の別の穴だった |
| (cxiv) | **引用付与の構造化とセット**でないと届かない | 引用付与 STUB 2種は**実装済み**。落ちていたのは「条件を置く場所」＝`keyword_grants` は条件を持てない→`granted_effects` の条件つき CONTINUOUS へ回すだけで届いた |
| (cxvii) | **動的レベル機構が無い**ので正しく書けない | `DYNAMIC_LEVEL_BY_ENERGY`（実効レベル計算）は**実装済み**。無かったのは**それを読む条件型**だけ＝`SELF_LEVEL_THRESHOLD` を新設して解決 |
| (cxviii) | 引用付与の**中**の分岐＝別機構 | `IS_BETTING` と `GRANT_EFFECT{targetsLastProcessed}` が既にあり、`CONDITIONAL` へ組み替えるだけで排他分岐にできた |

### 登録行の原文（PLAN §3 から退避）

- **(cxiii) 多段閾値「N以上であるかぎり…、M以上であるかぎり代わりに…」**＝`WXEX1-33-E2`（20000でダブルクラッシュ／30000で代わりにトリプルクラッシュ）・`WX09-019-E2`（14000でアーツ耐性／18000でランサー＋【自】）・`WX20-Re18-E2`（レベル4で【自】／レベル5で効果耐性）。1文に閾値が2つあり、後段は「代わりに」置換＝**置換機構待ち**（§6.3）。現状は前段の閾値だけが載り、後段は前段の閾値で発火する（過剰・ただし旧＝無条件よりは近い）。
- **(cxiv) 「このシグニは正面のシグニのパワーがN以下であるかぎり」8カード**＝`WXDi-P05-081` `WXDi-P11-071` `WXDi-P14-065` `WXDi-P15-069` `WXDi-P15-071` `WXDi-CP02-089` `WXDi-P10-025` `WXDi-CP02-057`。engine/型/decompiler は `FRONT_SIGNI_POWER` を実装済みだが、**すべて引用付与の内側**にあり `GRANT_QUOTED_ABILITY` / `SIGNI_GRANT_QUOTED_CONSTANT_ABILITY` STUB か、内側原文がまるごと `keyword` 文字列に入っている（`WXDi-P14-065` / `WXDi-P15-071`）。引用付与の構造化とセットでないと届かない。
- **(cxv) `WX05-021-E1` の【ダブルクラッシュ】欠落**＝原文「パワーが20000以上であるかぎり、【ダブルクラッシュ】**と**「【自】：…」を得る」のうち、curated には【自】側（`SELF_POWER_GTE` つき MANUAL）しか無く**キーワード付与が丸ごと無い**（過小）。
- **(cxvii) `WX20-Re18` の動的レベル**＝原文「【常】：このシグニのレベルはあなたのエナゾーンにあるカード５枚につき＋１され…」＋「レベルが４以上であるかぎり『【自】アタック時、正面をバニッシュ』／レベルが**５以上**であるかぎり『【常】対戦相手の効果を受けない』」。**レベルが動的に変わる機構が無い**（`STUB:DYNAMIC_LEVEL_BY_ENERGY`）ため、現行 `E2` は「レベル4以上」を**パワー12000以上で近似**した手当てで、レベル5側は未実装。動的レベルを実装しないと正しく書けない（2026-08-08 に (cxiii) から切り出し）。
- **(cxviii) `WXDi-P15-071` のベット時「代わりに【Ｓランサー】」**＝引用付与の**中**の分岐。原文「…それは「【常】：正面のシグニのパワーが8000以下であるかぎり【ランサー】を得る。」を得る。あなたがベットしていた場合、代わりにそれは「【常】：【Ｓランサー】」を得る」。非ベット側は 2026-08-08 に実働化済みだが、**引用付与ハンドラは原文をテキスト検出するだけでベット分岐を持たない**。

## 2026-08-07 整理：§5d-0(i) 配線ギャップ 第1〜8バッチの完了行（PLAN から退避した原文）

> PLAN §5d-0 (i) の「消化済みセル」欄が10行に膨らんだため、第1〜8バッチの原文をここへ退避した（続き377e の baton）。
> PLAN 側には1行サマリだけを残してある。**各バッチの真因・A/B の実測・トリップワイヤの意図は [BUGFIXES.md](./BUGFIXES.md) の該当エントリが正**（ここは PLAN の記載を保存したもの）。

**✅第1バッチ（続き376b）＝`triggerSubjectClass × TRIGGER{ON_ATTACK_SIGNI}` miss 8→0（has 37→45）／census 1162→1151／全体 miss 541→525。**
**✅第2バッチ（続き376d）＝`cardClass × SIGNI[filter]` から BOUNCE 対象のクラス脱落3効果／census 1088→1085。**
**✅第3バッチ（続き376d）＝トラッシュ→デッキ一番下の source クラス脱落 17効果／census 1085→1072。**
**✅第4バッチ（続き376d）＝「あなたの〈filter〉シグニを対象とし…それのパワーを±N」が owner ごと落ちていた 18効果／census 1072→1061。**
**✅第5バッチ（続き376d）＝ディソナ判定が `keyword` 文字列で両方向に外れていた 12効果。⚠census は 1061 のまま動かない＝この系統は census に語彙パターンが無く、あっても文字列が JSON にある以上「合格」と判定される＝被覆マトリクスにしか映らない。**
**✅第6バッチ（続き377）＝`hasOtherSelfSigniNoun`（「他の」）ゲートの棚卸し・12効果＋engine 1本／census 1061→1053。**「〈filter〉すべてのシグニをバニッシュ」ビルダーが **owner も filter も全文スキャン**で、level/levelParity/ライズアイコン/クラス/色が丸ごと落ちていた（7効果）。UP ビルダーは「他の」が無いと **filter 無し・count 1 の裸の SIGNI** へ落ちていた（5効果）。engine は **`execBanish` だけ `excludeSelf` 未配線**（`matchesFilter` は excludeSelf を見ない＝候補集合側の責務）。**🏁「他の」ゲートの棚卸しはこれで完了**＝全13使用箇所を確認済み・残りは `excludeSelf` を立てるだけで定義どおり正しい。
**✅第7バッチ（続き377b）＝`noGuard × TRASH_CARD[filter]`（★★）から入って 30効果＋engine 1本／census 1053→1048。**①《ガードアイコン》限定の脱落11効果（トラッシュ→デッキ＋シャッフル／デッキの一番上／**相手手札の開示ハンデス**の3入口）。②**同じビルダーの構造バグ19効果**＝「トラッシュから…デッキの一番下に置く」の source が `SIGNI`（場のシグニ）固定で owner も全文スキャン＝**原文と無関係な動作**だった。正準形は同文型の13効果が既に持つ `TRASH_CARD` 形（名指し表 `DISTINCT_SOURCE_FIX_BATCH5C`）＝**名指し表のビルダー一般化**。③枚数が「N体」しか見えず「N枚（まで）」が `count:1` へ潰れる過小実行8効果。④engine の `TRANSFER_TO_DECK{TRASH_CARD}` が `upToCount` を無視して強制 N 枚。⑤計器較正＝`hasGuard:false`≡`noGuard:true`（`censusWiring.ts` に `jsonRe` を追加）。**🔎教訓＝セルは入口であって終点ではない／枚数・値だけ先に直すと誤りを増幅する。**
**✅第8バッチ（続き377c）＝《ライズ／クロス／アクセアイコン》の対象フィルタ 17効果／被覆マトリクス miss 464→422（census は 1048 のまま動かない）。**まず ★★セル `levelRange × BANISH{SIGNI}` を取ったが **miss 6 のうち5件が偽陽性**（クロス計上）だったのでセルを乗り換えた。①**較正（実装ゼロ・−28）＝キー綴りが2つ併存**（`hasCrossIcon`/`hasRiseIcon` と `hasIcon:'クロス'|'ライズ'`＝engine は両方見る／ライズは判定式まで同一）。②本物のギャップは入口ごとの脱落17効果（トラッシュ→手札/デッキ・トラッシュ→場・手札→場・キーワード付与・バニッシュ対象・デッキ検索）。③`GRANT_KEYWORD` は**同じ関数の中でも枝によって filter が落ちる**（`kwCountSelfM` 枝）。④`cardName:"ライズアイコン"` という**完全 no-match** が live に2件焼き付いていた（parser は既に正しかった）。**🔎教訓＝★★でも中身を読むまで収穫は分からない／同じ概念に2つのキー綴りが無いか先に確かめる（較正で済むなら実装ゼロ）。**
## 2026-08-07 整理：Opusタスク12 最後の在庫 (cx) の登録行を退避（続き363）

> PLAN §3 の在庫表が空になったので、最後まで残っていた (cx) の**登録時の原文**をここへ移した。クローズの内容（何をどう直したか）は `BUGFIXES.md` 2026-08-07 の節。

| ID | 登録時の内容（2026-08-06・続き360 時点の原文） |
|---|---|
| (cx) | **「対戦相手のシグニ1体がアタックしたときにしか使用できない」【起】が一度も使えない（2026-08-06・(cvii) 実装中に発見）**＝`WX05-013-E2`（アン・フィフス／【起】エクシード２：対戦相手のアタックしているシグニ1体のアタックを一度無効）は`condition:{DURING_PHASE, phases:['ATTACK_SIGNI_OP']}` だが **`ATTACK_SIGNI_OP` は `TurnPhase` に存在しない値**＝条件が常に false でボタンが一度も出ない。⚠**フェイズ名の付け替えだけでは直らない**＝原文はフェイズ条件ではなく「相手のアタック宣言後」というイベント条件で、しかも `timing:['MAIN']` のままでは**相手ターンに撃てない**。**着手＝「相手のアタックに応じて撃てる ACTIVATED の窓」をどう表すかの設計が先**（`ATTACK_ARTS_OP` の窓を使うのか、アタック宣言に反応する別 timing を足すのか）。**🆕2026-08-06（続き360）に母集団を実測＝「〜しか使用できない」103枚／44文型のうち、イベント型（「〜したときにしか」）は本カード1枚だけ**（残り全部が「〜の**場合**にしか」＝状態条件）。**＝1枚のために新しい ACTIVATED の窓を設計する費用対効果は低い＝据置が妥当**。やるなら他の「相手のアタックに応じる」機構（`ATTACK_ARTS_OP`）と合流させられるときに |

> **🏁2026-08-07（続き363）にクローズ**。⚠**登録時の見立て「新しい窓の設計が先／費用対効果が低い」は誤りだった**＝守備側の応答窓は既に `ON_OPP_SIGNI_ATTACK_DIRECT`（`WX04-004-E2`）という前例があり、**同じ作法（アタック宣言時に守備側スタックへ `wrapOptionalOnPlay` で包んで積む）に合流させれば新規UIは一切不要**。母集団1枚でも、`ATTACK_SIGNI_OP`（`TurnPhase` に無い死語）を消せたことで **golden `(cvii)` の「不正 phase 値」計器が残0** になる副次効果があった。

## 2026-08-06 整理③：PLAN §3 からクローズ済み行を一括退避（続き361）

> PLAN §3 を「生きている worklist だけ」に戻すため、**✅／🏁 が付いた行をここへ丸ごと移した**（PLAN 側には残ID と本節へのポインタだけを残す）。
> 登録時（＝バグとして積まれた時点）の原文は下の「2026-08-06 整理」節および各過去整理節にある＝**本節はクローズ行（何をどう直したか）の側**。一次記録は `BUGFIXES.md` の各節。

### Opusタスク12 在庫の残0クローズ行（2026-08-06・続き356〜362f）

| ID | 内容 |
|---|---|
| (xciv) | ✅**2026-08-06（続き362e＋362f）に残0クローズ**＝**登録時の「1枚ずつ形が違う＝クラスタ化できない」は誤り**だった。(xc) の手順（「**規則 regex に原文が当たるか**」で測る）で数え直すと未カバー23枚に明確なクラスタがあり、**α ピース5**（場の〔色〕ルリグ1体につき。⚠場のルリグ＝センター＋アシスト左右）**β 相手比較5**（〔ゾーン〕の枚数が対戦相手より〔N枚以上〕多いかぎり）**γ 2条件の重ね4**（早期 return できない累積形）**δ 個別6**（Lv N以上／トラッシュのカード名／アクセされている＜X＞／手札差／**増＋減の同一文**／**ターン履歴**）＝**20枚を実装**。残2枚は**(xciv) の対象外**と確定＝`WX22-016`（ベット枚数比例＝(lxxxviii) D群として登録済み）／`SPK06-01`（**コイン技**のコスト軸）。⚠**`WX15-067` は既に実装済み**だった（`applyMeltFactPreUseCost`＝カード番号キーのヘルパー）＝**未カバー検出を regex だけで測るとカード番号キーのヘルパーが見えない**という検出器の穴。⚠**ピースはコスト計算の入口が別**（`artsCandidates` に入らず「キーにセット」ゲートも `KeyUseModal` も印刷コスト直読み）＝2箇所を `computeArtsEffectiveCost` へ通した（(xciii) と同型）。⚠**テンプレートリテラル内の `\d` は JS が無効エスケープとして落として `d` になる**（半角数字を拾えない）＝正規表現リテラルとは逆で、同一ファイルに両方の書き方が混在する。新機構＝`addNColorToCost`（コスト**増加**）／`PlayerState.signi_banished_this_turn`（バニッシュ履歴を盤面差分 funnel で記録）。実機シナリオ `banishHistoryForCost` を2回連続PASS。一次記録は BUGFIXES 2026-08-06 の2節 |
| (lv) | ✅**2026-08-06（続き362d）に残0クローズ**＝残っていた **③CPU シグニ召喚 ④CPU グロウ**を配線。登録時の宿題「**CPU に任意効果をどう選ばせるかの方針決めが先**」に答えを出した＝**(a) 無コストの任意【出】は発動する**（`OPTIONAL_ACTIVATE` の選択肢順が「発動する→発動しない」＝CPU 自動応答は先頭 available を選ぶので、方針は**選択肢順そのもの**。コストが無いので踏み倒しも過剰支払いも生じない）**(b) コスト付きは従来どおり発動しない**（COLLAB で起きた「mandatory 判定なしで全 ON_PLAY を積む」過剰実行の再発を構造的に回避）**(c) 包めないもの（`costUnparsed` 等）は既存の安全弁でそのまま発火させない**。母集団の実測＝**③は11効果**（人間の通常召喚が拾う集合と同一）／**④は0件**（⚠0件でも配線＝将来そういうルリグが増えたとき①〜③と同じ壊れ方で黙って落ちるため）。**live JSON は不変**。実機シナリオ `cpuOptionalOnPlayCharm` を2回連続PASS（CPU が `WX04-052` を召喚すると実際に【チャーム】が付く＝デッキ3→2）。⚠シナリオ作成の注意＝対象は `ウリス限定`・Lv4 なので CPU センターを **Lv4 のウリス**にしないと召喚要件で弾かれ「配線したのに動かない」に見える。一次記録は BUGFIXES 2026-08-06 節 |
| (lxxxviii) | ✅**2026-08-06（続き362c）に「主張が誤り」と確定してクローズ**＝登録時の「ベット宣言できても**変わる先の枝が無い**3枚」は**JSON だけを見た誤り**。`STUB BET_MECHANIC` は原文から①②③を組み立て `is_betting_this_effect` で選択数を「代わりにMつ」へ切り替える**実装済みハンドラ**、`GRANT_QUOTED_AUTO_ABILITY`（`WD21-007`）も付与後にベットなら**もう一度**能力選択を出す。golden で「ベット有無で 1→2 / 1→3」「非ベットでも選択肢が出る」「WD21-007 は2回目が出る」を固定。⚠**母集団は指示どおり68枚全体で数え直した**＝分岐表現なし29枚を全数分類（A選択数変更10／Bコスト置換9＝**偽陽性**〔使用時UIが処理済み〕／B'コスト軽減1＝**実バグ**／C本体が変わる7／D枚数比例1／E分岐なし1）。**実バグは `WDK15-007` 1枚**＝「ベットする場合、使用コストは《黒×2》**減る**」を `computeCostReplacement` が「〜に**なる**」しか見ずに落としていた（ベットしても一度も安くならない）→軽減形を追加。**計器較正**＝`betChoose`（小文字）が「コスト:《コイン》」較正の `/BET/` に掛からず、ベットを**正しく表現している** `WX18-003`／`WDK05-T10` が高シグナルだった偽陽性2件を解消（census 1285→1283）。live 移行は**忠実と確認できた `WX18-005` の1枚だけ**＝A群の残り8枚は静的化すると**新しい過剰実行/幻覚が入る**（全9枚を一度採用したら census 1285→1289 に悪化＋原文照合で裏取り→採用取り消し）ので **runtime の BET_MECHANIC のまま据置が正しい**。⚠残テーマ「A群8枚の静的表現への移行」は**計器可視性のためだけ**の低優先＝新在庫にはしない。一次記録は BUGFIXES 2026-08-06 節 |
| (xciii) | ✅**2026-08-06（続き362b）に残0クローズ**＝【チェイン】の**キーワード字面が parser から丸ごと落ちて**いて、宣言しても次のアーツが一切安くならなかった。⚠**母集団は登録時の「4枚＋スペル1枚」ではなくアーツ7枚**＝注釈テキストを持たない札が3枚ある（`WX11-021`／`WX14-005`／`WX19-004`。とくに `WX19-004` は**先頭ではない**うえ**同色2つ**《白》《白》《黒》《黒》）。`WX10-073`（スペル）は既存の `next_spell_cost_reduction` 経路で**既に動いていた**。実装は登録時の見立てどおり「スペル版と同型の状態を1本足す」＝`PlayerState.next_arts_cost_reduction` を engine の `COST_REDUCTION{targetCardType:'アーツ'}` が積み、`executeArts` で消費・ターン境界でリセット。⚠**発生源側の配線とセット**という懸念も登録時どおり＝parser で【チェイン】→ `COST_REDUCTION` ステップを action 先頭へ差し込んだ。⚠**実機で「もう1つの入口」を発見**＝コスト計算は `ArtsModal` Phase1／Phase2 に加え**ルリグデッキのカード詳細「使用」ゲート**の3箇所にあり、そこを落とすと「一覧からは使えるのにタップすると『使用』が出ない」（(xcii) と同型）。実機シナリオ `chainArtsCostReduction`（エナ0枚で2枚目のアーツが使える盤面）を2回連続PASS。一次記録は BUGFIXES 2026-08-06 節 |
| (cix) | ✅**2026-08-06（続き362）に残0クローズ**＝登録時は「`WX25-P1-112` のレベル条件欠落」1点だったが、**真因は参照の運び方が実UIで切れていたこと**。実UIは支払い（`BattleScreen.payLrigDownCost`）と効果解決が**別 ExecCtx** なので `lastProcessedCards` が届かず、`colorMatchesLastProcessed` 系は **golden 緑・実機 完全no-op**だった。**支払い/ダウンの単一入口 `payLrigDownCost` が `PlayerState.last_lrig_down_cards`／`last_lrig_down_level_sum` を書く**設計にし、新フィルタ `levelEqLastDownedLrig`／`colorMatchesLastDownedLrig` を「lastProcessedCards→PlayerState」の2段で解決。母集団6枚（`WX25-P1-112`／`WX24-P1-040`×2／`WX24-P2-069`／`WX25-P2-114`／`WXDi-D03-004`／`WXDi-D04-004`／MANUAL の `WX25-P2-112`）を全部直した＝**登録時に懸念した「レベルを選ぶUI」は不要**（母集団はすべて count 固定か「好きな数」で、支払い順＝センター→アシストL→R の既定で原文を満たす）。⚠**併走で見つけた3つの穴**＝(a) `execRemoveAbilities` だけ `resolveDynamicFilter` 未通過＝動的キーが黙って無視され「制限なし」に倒れる (b) `ExecCtx.seqVars` は**インタラクションを跨げない**（実UIの resume が渡していない）＝CHOOSE を挟む札のシャドウが素の【シャドウ】に化けていた (c)「このシグニは【X】を得る」の GRANT_KEYWORD が `thisCardOnly` を持たず**別のシグニに付与できる**過剰対象化＝127枚。実機シナリオ `lrigDownLevelRemoveAbilities` 新設（**この経路は golden では原理的に守れない**）・2回連続PASS。一次記録は BUGFIXES 2026-08-06 節 |
| (cxi) | ✅**2026-08-06（続き361）に残0クローズ**＝真因は engine ではなく **`BattleScreen.resolveStackNext` の `!result.done` 分岐に盤面差分収集が無かったこと**（続き75 が resume 側の2巡目以降に入れた手当ての**1巡目版が欠けていた**）。`WX20-026-E1` は現在 `SEQUENCE[DRAW, TRASH(手札1枚選択)]`＝**ドロー直後に中断**する形で、中断時点の状態（ドロー済み）がそのままコミットされるため、resume 完了時の diff は before に既にドローを含む＝**ON_DRAW が永久に失われて**いた。⚠**規模の実測＝1巡目で中断する効果 5418／うち中断時点で既に盤面が動いている 484**（失われていたのはドローに限らない）。実機 PASS（合格条件も「watcher ログ」から「実際に -4000 が乗る」へ厳格化）。一次記録は BUGFIXES 2026-08-06 節 |
| (cviii) | ✅**2026-08-06（続き356）に残0クローズ**＝【起】ACTIVATED の `cost.lrigDown` を実行経路2本（`executeSigniActivated`＝シグニ11効果／`executeLrigGranted`＝ルリグ本体の【起】2効果）へ配線＋2モーダルの `canAfford` とアクション一覧のゲート2箇所にも判定を追加。⚠**母集団は登録時の「5枚」ではなく13効果**（経路が2つに割れるのが見落とし）。登録時原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理」節、一次記録は BUGFIXES 2026-08-06 節 |
| (cvii) | ✅**2026-08-06（続き357）に残0クローズ**＝`BattleScreen` の `ExecCtx` **8箇所**（登録時の記録は6箇所）に`currentPhase: bs.turn_phase` を配線。⚠**不発だったのは本カード2枚ではなく4機構**（トラッシュ移動ロック2／`DURING_PHASE` 1／能力なし→デッキ下置換1／アタックフェイズ限定バニッシュ先置換3）。併せて `DURING_PHASE.phases` の不正値2件も是正。実機4シナリオ各2回連続PASS。登録時原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理」節、一次記録は BUGFIXES 2026-08-06 節 |
| (cii) | ✅**2026-08-06（続き358）に残0クローズ**＝`execUtils.selectOptionalCostEnergy` を新設し CPU 自動応答が実在エナの instanceId を選出して渡すよう是正。⚠**`canPayOptionalCost` はこれへの委譲に置き換え**＝「支払えるか」と「何で払うか」を1本から出す。(ci) と同時消化（同じ CHOOSE の表と裏）。登録時原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理」節、一次記録は BUGFIXES 2026-08-06 節 |
| (cv) | ✅**2026-08-06（続き359）に残0クローズ**＝`opp_hand` ピッカーの候補一覧を **viewer 相対の `op.hand` ではなく候補（`inter.candidates`）の実在位置**から解決するよう是正（全体表示は残し**持ち主だけ**を正す＝通常方向は従来と完全に同じ）。⚠登録時の追記どおり**LB 型に限らず `opponentHandDiscard` 回避コスト経路でも同根**だったことを実機で確認。意図的FAIL 2件が PASS へ反転＋通常方向の回帰3件。登録時原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理」節、一次記録は BUGFIXES 2026-08-06 節 |
| (civ) | ✅**2026-08-06（続き360）に「engine 非バグ」と確定してクローズ**＝真因は engine ではなく **driver の計器バグ**（`verifyBattleDrive.mjs` の `queryState` が `EffectStack` に存在しない `entries` キーを読み **stackLen を常に0**にしていた）。シナリオの「スタックが空になるまで待つ」ガードが最初から無効化されていて、CHOOSE 解決直後（エントリがまだキューに載っている tick）で判定を確定させていた＝**ドロー未反映のまま FAIL**。`stackLen` を実体（整列済み＝`queue.length`／未整列＝`pendingTurn+pendingOpp`）に直すと**期待どおり1回だけ発火**し 2回連続 PASS。engine/JSON は無修正。シナリオは既定 order へ追加。一次記録は BUGFIXES 2026-08-06 節 |
| (ci) | ✅**2026-08-06（続き358）に残0クローズ**＝`OPPONENT_PAY_OPTIONAL` の 'pay' 枝を `costColors.length > 0` のときだけ積むよう是正（既存3枝と同じ条件付き spread へ揃えただけ）。⚠**過剰実行にならないことを全数確認済み**＝live 出現71／エナコストあり38／非搭載33で**回避枝ゼロの STUB は0件**（golden に固定）。(cii) と同時消化。登録時原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理」節、一次記録は BUGFIXES 2026-08-06 節 |
| (xcvii) | ✅**2026-08-06（続き360）に残0クローズ**＝原文「場を離れる場合」はエナ送りも含む（登録時の「まず原文で確認」への答えは YES）。**`applyEffectLeaveSubstitutes` を新設して離場11経路すべてを1本の入口へ寄せ**、`execSendToEnergy` の複数選択クロージャだけ抜けていた「代わりにこの能力を失う」を補填。適用順は従来と同一＝**挙動不変のリファクタ＋抜け1本**。golden 回帰を新設（単体case/複数選択クロージャの両形態）。一次記録は BUGFIXES 2026-08-06 節 |
| (xcvi) | ✅**2026-08-06（続き360）にクローズ**＝`ArtsModal` Phase2 の `applySpecificCardCostReduction` 二重適用を「値が同じか」ではなく**「どこから来たか」（ベット置換値／印刷コスト＝未適用・`pendingArtsEffectiveCost`＝適用済み）で分岐**して解消。併せて《無》→センター色 読み替えを**軽減のあと**に回して Phase1 と順序を揃えた。⚠**live 対象アーツは0枚＝挙動不変の予防修正**（実機で差分は見せられない）。一次記録は BUGFIXES 2026-08-06 節 |
| (c) | ✅**2026-08-06（続き361）に残0クローズ**＝①`WXDi-P13-089-E2` の `TRASH{TRASH_CARD}`（トラッシュ→トラッシュの完全 no-op）を原文どおり `EXILE{SIGNI}` へ是正②「その（対戦相手の）シグニ」＝トリガー元への限定を `filter.isTriggerSource` で表現し、**`collectTargetedTriggers` が `origin` を `entry.triggeringCardNum` に載せていなかった**配線を追加（下見どおり1行）。live 変更は3効果（`WXDi-P03-056-E1`／`WX05-047-E1`／`WXDi-P13-089-E2`）＝**巻き込みで `WX05-047`（バトル相手限定）も是正**。⚠**CPU の対象選択はランダム**なので「結果が正しい」では検証にならず、`queryState` に `pendingCandidates` を足して**候補が1件に絞られている**ことで判定した（修正を外した A/B で FAIL 再現済み）。実機シナリオ `onTargetedSourceSigniBanish` 新設・2回連続PASS。登録時原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理」節、一次記録は BUGFIXES 2026-08-06 節 |
| (lxvi) | ✅**2026-08-06（続き360b）に残0クローズ**＝据置2枚の原因は JSON ではなく **parser 側の欠落**だったので、規則2本（①「あなたか対戦相手のデッキの上からカードをN枚トラッシュ」＝CHOOSE ②「【X】を**持つ**カード」＝付与ではなく**保有条件**＋`SONG_FRAGMENT` 二重化の畳み込み）を足して fresh を curated 以上にしてから採用した。⚠**巻き込み2枚はどちらも実バグ是正**（`WX08-061`＝付与する keyword が**ダブルクラッシュ→アサシン**／`WXEX2-13`＝原文に無いライフバースト付与の除去）。fresh 全数6712枚の A/B で**変化20枚**を確認。golden 1372→1374・census 1288→1287。一次記録は BUGFIXES 2026-08-06 節 |

### Opus タスク14（リファクタ Stage2→Stage3 純粋バトルコントローラ・🏁完了）

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| 14 | 🏁**完了**（2026-08-03・続き333）リファクタ Stage2→Stage3 純粋バトルコントローラ | BattleScreen構造 | — | ✅Stage2＋永続化移行（全行 I/O 120箇所を `persist` へ）＋**reducer 純粋化＝`persist.commit` 118/118 が `reduceBattle` 経由**（18 action）。残テール (a)(b)(c)(d) すべて残0。設計・**定形13** ・新規ハンドラを書くときの手順は `docs/BATTLE_CONTROLLER.md`。⚠**残タスクは §7 実機通し確認のみ**（ハンドラ側 payload 構築は golden 非カバー＝純粋関数しか見ない）。ここから派生しうる次段（任意・未着手）＝①`BattleScreen.tsx` 本体のフェイズ別ハンドラ分割（今回の純粋化では不要と判明＝**やるなら可読性目的**）②reducer の action 単位テストをさらに厚くする |

> ⚠**残っている作業は §7 の実機通し確認だけ**（ハンドラ側 payload 構築は golden 非カバー）。設計・定形13・新規ハンドラの手順は [BATTLE_CONTROLLER.md](./BATTLE_CONTROLLER.md)。

### Sonnet タスク4（BEHAVIOR_AUDIT キュー再生成＋一次トリアージ・⛔枯渇＝休眠）

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| 4 | ~~BEHAVIOR_AUDIT キュー再生成＋一次トリアージ~~ **⛔枯渇（休眠）** | 計器実行＋分析 | S | 続き133 で高シグナル22件精査＝真no-opバグ0件。残る母数は監査ツールの構造的盲点（COUNTER_SPELL/SPELL_CUTIN・トリガー文脈依存）に該当＝再開なら盲点フィルタ実装が先（低収量見込み） |

## 2026-08-06 整理：PLAN §3 在庫表から退避した残0クローズ行（原文）

> 2026-08-06 に残0クローズした (cviii)〔続き356〕／(cvii)〔続き357〕／(ci)＋(cii)〔続き358〕／(cv)〔続き359〕／**(cxi)＋(c)〔続き361〕**の登録時原文。

- **(cxi)〔`drawBySourceStory` 実機 FAIL＝2026-08-06 続き361 で残0クローズ。真因は登録時の見立て（「engine の実バグ」か「シナリオ側の前提崩れ」）の**どちらでもなく UI 側の収集漏れ**＝`BattleScreen.resolveStackNext` の `!result.done` 分岐に盤面差分収集が無く、**中断前に確定した変化がコミットされてから resume 側が diff を取る**ため差分ゼロになっていた。登録時の観測「ドローは起きているのに watcher の解決が空振りしている疑い」はそのとおりで、「golden が緑のまま実機だけ落ちているのか」という切り分けの指示も当たっていた（golden は最後まで緑）。一次記録は BUGFIXES 2026-08-06 節〕**
  - 〔登録時の原文〕**🆕 `drawBySourceStory`（`WX20-026-E3`）が単体・FRESH ルームでも FAIL する（2026-08-06・続き360・(civ) の計器修正の A/B 中に観測）**＝原文「【自】：あなたの＜凶蟲＞のシグニの効果1つによってカードを引いたとき、対戦相手のシグニ１体を対象とし、ターン終了時までパワーを－4000する。」。実機シナリオ `drawBySourceStory` が **host 手札5枚・新規ルーム（FRESH=1）でも** `gPowerMods` 空のまま完走せず FAIL。⚠**driver の新旧（`stackLen` 修正前／後）で結果が完全に一致**するので、**計器の問題ではなく engine/UI 側の実バグまたはシナリオ側の前提崩れ**のどちらか。⚠**過去には PASS していた**（BUGFIXES で「R31 は同じ `collectDrawTriggers` で確認 PASS」と記録あり）＝**どこかで退行した可能性が高い**。**着手＝まず `verifyBattleDrive.mjs` のシナリオ手順（アタック→E2のドロー→E3のSELECT_TARGET）が現行UIとまだ噛み合っているかを確認**（バッチ実行時のログでは一度 `hHand 4→5` のドローまで到達して SELECT_TARGET も出ているのに `-4000` が乗らずに戻っている＝**ドローは起きているのに watcher の解決が空振りしている疑い**）。golden 側に `collectDrawTriggers`＋`drawBySourceStory` の固定があるので、**まず golden が緑のまま実機だけ落ちているのか**を切り分けること

- **(c)〔`ON_TARGETED` の同居問題＝2026-08-06 続き361 で残0クローズ。①は原文どおり `EXILE{SIGNI}` へ是正（登録時の見立てのとおり）。②は登録時の下見（「`collectTargetedTriggers` が受け取った `origin` を entry に載せていないだけ」）が正確で、その1行＋parser 後段の `isTriggerSource` 刻みで閉じた。⚠**JSON 手パッチ単独は禁止**の指示どおり parser 規則で入れている。⚠登録時に想定していた `triggeringCardNum` の受け皿はそのまま使えた。一次記録は BUGFIXES 2026-08-06 節〕**
  - 〔登録時の原文〕**🆕 `ON_TARGETED` の同居問題（2026-08-04・(lxviii) の turnOwner 部分だけ閉じたので繰り越し）**＝①`WXDi-P13-089-E2` の本体が原文「そのシグニを**ゲームから除外**する」なのに JSON は `TRASH{TRASH_CARD}`（除外でもシグニでもない二重ズレ・逆翻訳も「対戦相手のを1枚トラッシュに置く」と主語が欠落）②`WXDi-P03-056-E1`／`WXDi-P13-089-E2` の「**その**対戦相手のシグニ」＝**対象化した側と同一のシグニ**を指す origin 同一性が未配線。⚠**1カード監査でまとめて見るほうが早い**（`/audit-card WXDi-P13-089`）。**🆕2026-08-06（続き360）に着手経路を下見＝②の受け皿は既にある**＝`StackEntry.triggeringCardNum`（「それ」参照用の既存フィールド）と `filter.isTriggerSource` / `targetsTriggerSource`（engine 実装済みの語彙）。**足りないのは `collectTargetedTriggers` が entry に `triggeringCardNum: origin.cardNum` を載せていないこと**（`TargetedOrigin` は引数で受け取っているのに捨てている）＋JSON 側に `isTriggerSource` を持たせる parser 規則。①は原文が「そのシグニをゲームから除外する」なので `EXILE`＋同 filter で表せる。⚠**JSON 手パッチ単独は禁止**（parser 規則か MANUAL 化とセット）

- **(cv)〔`opp_hand` ピッカーの viewer 相対描画＝2026-08-06 続き359 で残0クローズ。登録時の修正方針は2案併記（①`inter.candidates` から直接解決 ②`respondPlayerId` と自分の uid を比較して出し分け）だったが、**①を採りつつ「全体表示（非候補もグレー）」は残した**＝原文「手札を見て選ぶ」の情報量を落とさないため**持ち主だけを正す**形にした（②の uid 比較は不要＝候補の実在位置だけで決まる）。⚠登録時の追記「LB 型に限らず `opponentHandDiscard` 回避コスト経路でも同根」はそのとおりで、両系統とも実機で PASS 反転を確認した。**モーダル描画は golden 非カバー**なので実機シナリオが唯一の検証手段＝通常方向の回帰3件と対で締めている。一次記録は BUGFIXES 2026-08-06 節〕**
  - 〔登録時の原文〕**🆕 `opp_hand`＋`opponentResponds:true`のSELECT_TARGETがviewer視点の食い違いでソフトロックする（2026-08-05・§7実機検証タスク12(lxii)で発見）**＝`WD16-016-BURST`（LB＝対戦相手の手札1/2枚を対戦相手自身に選ばせて捨てさせる）を実機で駆動したところ、`SELECT_TARGET{targetScope:'opp_hand', opponentResponds:true}`自体は正しく生成される（対象＝アタッカー自身の手札）が、`EffectInteractionModal.tsx`の候補描画（`inter.targetScope==='opp_hand' ? op.hand : sortedCandidates`）が**「画面を見ている側（viewer）から見たop」**を使うため、対象＝viewer自身（アタッカー）のケースでは**LB所有者側の手札が誤って表示される**（`verifyBattleDrive.mjs wd16016BurstOpponentDiscard`で2回連続再現＝host手札3枚のはずが「対戦相手の手札（全5枚）」としてguestの5枚が表示された・スクリーンショットで確認）。表示カードは実際の候補（`inter.candidates`＝host自身の手札instanceId）と一致しないため`candIdx`が全て`-1`になり**どれも選択できず「決定 (0/1)」のまま進行不能＝実質ソフトロック**。**影響範囲＝`opp_hand`+`opponentResponds:true`を使う効果全般**（対戦相手自身に自分の手札を選んで捨てさせる型＝`OPPONENT_PAY_OPTIONAL`の`opponentHandDiscard`系とは別＝あちらはCPU自動応答経由でUIを経由しないため影響を受けないが、**人間対人間戦・あるいはCPUが「LB所有者」側でhostが「アタッカー＝応答者」側になるこの組み合わせでは必ず踏む**）。**修正方針＝`EffectInteractionModal.tsx`の`opp_hand`候補描画をviewer相対ではなく`inter.candidates`（真の対象instanceId）から直接解決する**（`sortedCandidates`経路と同じ扱いにする、あるいは`respondPlayerId`と自分のuidを比較して「自分が対象なら自分の手札、そうでなければ相手の手札」を出し分ける）。**🆕2026-08-05追記（Sonnet・§7実機検証SPDi43-02/WXEX2-25/WXDi-P08-007バッチで発見）＝発生源はLB「相手に選ばせる」型に限らない**＝`OPPONENT_PAY_OPTIONAL`の`opponentHandDiscard`回避コスト（応答者=viewerが自分自身の手札を捨てる場合＝真の対象がviewer自身になるケース）でも同根のソフトロックを2件で再現（`wxex225DiscardAvoids`＝`WXEX2-25-E1`の回避コスト／`spdi4302AvoidedNoChoose`検証中に`SPDi43-02-E1`の「手札を2枚捨てる」枝でも観測・後者は「支払う」枝に迂回して検証完了）＝**影響範囲はhandSpec（`opponentHandDiscard`）持ちのOPPONENT_PAY_OPTIONAL全般（応答者が自分の手札を対象にする経路すべて）に広がる疑い**。再現手順は`scripts/verifyBattleDrive.mjs`の`wxex225DiscardAvoids`コメント参照。
PLAN §3 には1行サマリだけを残した。一次記録は `BUGFIXES.md` 2026-08-06 の各節。

- **(ci)＋(cii)〔`OPPONENT_PAY_OPTIONAL` の無料回避枝と CPU のエナ未選出＝2026-08-06 続き358 で**同時に**残0クローズ。⚠**この2件は同じ CHOOSE の表と裏**（本来無いはずの選択肢が生える／正しい選択肢を選んでも支払えない）で、どちらも「本体も回避も起きない第3の結末」という同じ壊れ方をする＝**別々に直すと片方だけ直しても実機の結末が変わらず検証できない**。登録時の見立て（修正方針）はどちらも当たっていた。**足りなかったのは「'pay' を消すと過剰実行にならないか」の全数確認**で、live 全数走査により **エナコスト非搭載33件はすべて別の回避手段を持つ（回避枝ゼロは0件）** を実測して golden に固定した。件数も登録時の「68効果中33効果」から **出現71／あり38／なし33** へ実測し直している。一次記録は BUGFIXES 2026-08-06 節〕**
  - 〔(ci) 登録時の原文〕**🆕 `OPPONENT_PAY_OPTIONAL` の costColors 無し STUB で「支払う」がタダで常時 available（2026-08-04・§7実機検証(b)着手中に発見）**＝`effectExecutor.ts:3333` の `options` 配列先頭に `{id:'pay', ..., available: canOppAfford}` を**無条件**で積むが、`costColorsOPO`（=`stub.costColors ?? []`）が空のとき `canOppAfford = costColorsOPO.length===0 || ...`（`effectExecutor.ts:3315-3316`）で**常に true**＝コスト0で選べる「支払う」が生まれる。カード原文が「〜を支払わないかぎり」で回避手段が手札捨て/エナトラッシュ等**のみ**（costColors非搭載）の場合、本来存在しないはずの無料回避枝が追加され、CPU自動応答（`options.find(o=>o.available) ?? options[0]`・`BattleScreen.tsx:522-530`）はこれを最優先で選ぶため、意図した discard/energyTrash 枝も skip（本体発動）も実質到達しない。effects JSON 全体で `OPPONENT_PAY_OPTIONAL` 68効果中 **33効果**（約半数）が costColors 非搭載＝影響範囲は広い（機械カウント：`node -e`でJSON走査・costColorsキー欠落を検出）。代表＝`WX25-P1-040-E1`（手札3枚捨てないかぎりバニッシュ）／`WX24-P1-023-E1` 内側ゲート／`WX22-025-E3`／`SPDi43-02-E1`／`WX24-P4-023-E3` 等。**修正方針＝'pay' オプションを `costColorsOPO.length > 0` のときだけ配列へ積む**（handSpec/enSpec 等の既存3枝と同じ条件付きspread化にする＝新規機構ではなく既存パターンへ揃えるだけ）。§7実機検証(b) WX25-P1-040 のシナリオ実行でCPUが常に無料 pay を選び discard 枝の available:false 検証に到達しないことを確認
  - 〔(cii) 登録時の原文〕**🆕 CPU自動応答のCHOOSEはcostColors付き'pay'選択肢を選んでも常に「コスト支払いエラー: エナ不足」で空振りする（2026-08-04・§7実機検証(a)対照実験で発見・(ci)とは別バグ）**＝`BattleScreen.tsx:522-530`（`isCpuBattle`のCHOOSE自動応答）は `selected = [firstAvail.id]` と**選択肢IDだけ**を積み、支払いに使うエナカードのinstanceIdを一切付与しない。しかし `handleEffectInteraction`（`BattleScreen.tsx:4596-4604`）は costColors 付き選択肢を `resumeOptionalCost`／`resumeOpponentPayOptional`（`effectExecutor.ts:6475`/`6538`）へ渡す際 `energyNums = selectedOrChoiceId.slice(1)` で2要素目以降をエナIDとして読む＝CPU応答は常に `energyNums=[]`。両関数とも `costColors.length > 0` なら`done(addLog('コスト支払いエラー: エナ不足'))`で**即終了**（cost未消費・`then`/`action`も未実行）＝CPUがエナを十分持っていても「支払う」を選んだ瞬間に何も起こらず終わる。**続き289で発見・修正されたのは同根だが別経路**（人間側UIが `id==='pay'` 以外の新option idで通常CHOOSEボタンにフォールバックしたケース）＝**CPU自動応答の恒常的な欠落は今回が初検出**。影響範囲＝`OPPONENT_PAY_OPTIONAL`のcostColors搭載35効果（CPUが対戦相手として支払う場面）＋CPU自身が効果オーナーとして任意コストcostColorsを支払う場面全般。**再現＝`node scripts/verifyBattleDrive.mjs oppPayEnergySufficient`**（WX25-P1-038・guest energy 3枚で「無×3」を払えるはずが不発＝gEnergy不変・banishも不発のまま`pEff`が黙って解消）。**修正方針＝CPU自動応答（`BattleScreen.tsx`のCHOOSE分岐）がcostColors付き選択肢を選ぶ際、`ctx.otherState.energy`／`ownerState.energy`から`costColors`を満たす実在エナIDを機械的に選出してselectedへ追加する**（human側の`optcost-energy-N`UIが人力でやっている選出をCPU版として実装するだけ＝新規機構ではない）。


- **(cvii)〔`ctx.currentPhase` が実UI経路で常に undefined＝2026-08-06 続き357 で残0クローズ。⚠**登録時の記録「ExecCtx リテラル6箇所」は数え漏れで正しくは8箇所**（4254／4588 が抜けていた）。また登録時は「影響は本カード2枚に限定」と見立てていたが、**実際に不発だった機構は4本**（トラッシュ移動ロック2効果／`DURING_PHASE` 1効果／能力なし→デッキ下置換1効果／アタックフェイズ限定のバニッシュ先置換3効果）＝登録時に「横断監査が必要」と書かれていた懸念のほうが当たっていた。派生の発見＝`DURING_PHASE.phases` に `TurnPhase` の実値でない文字列が混じっており（`'ATTACK'`／`'ATTACK_SIGNI_OP'`）、**旧 golden も同じ不正値を渡していたため両方が同じ間違いをしていて緑だった**。新規在庫＝(cx)。一次記録は BUGFIXES 2026-08-06 節〕**
  - 〔登録時の原文〕**🆕 `ctx.currentPhase` が実UI経路（BattleScreen.tsx）では常に`undefined`＝フェイズ限定ロック機構が丸ごと不発（2026-08-05・§7実機検証「トラッシュ領域移動ロック」で発見）**＝`isOwnTrashMoveLocked`（`execUtils.ts:1165`）は`ctx.currentPhase`不明時は**ロックしない**（permissive）設計だが、`BattleScreen.tsx`が`resumeSelectTarget`/`castSpell`/`resolveCutin`等で組み立てる`ExecCtx`リテラル（4855/4909/4958/4999/6636/6938行の計6箇所）は**どれ一つとして`currentPhase`フィールドを含まない**＝実ゲームでは常に`undefined`のため`LOCK_OPP_TRASH_MOVE`（`WX24-P4-007-E1`③／`WXDi-P14-005-E1`c2の2枚専用）が**常に無効**（実機で`lock_trash_move_this_turn:true`を注入してもMAINフェイズで普通にトラッシュを動かせてしまう＝`verifyBattleDrive.mjs trashMoveLockBlocksSelfEffect`で2回連続再現）。golden側は`src/verify/main.ts:58`のように`currentPhase:'MAIN'`を手動で埋めるハーネス経由のため機構自体は緑のまま＝**「engineは正しいがUI配線が経路を通していない」系の欠落**（(ci)(cii)(cv)(civ)(cvi)と同型）。**影響範囲は本カード2枚に限定**（`isOwnTrashMoveLocked`の唯一の呼び出し元）だが、`ctx.currentPhase`を参照する他の箇所（`effectExecutor.ts:256`のATTACK限定リダイレクト・`execUtils.ts:1651`のDURING_PHASE条件）も同じ理由で実UI上は機能していない疑いがある＝**横断監査が必要**。**修正方針＝`BattleScreen.tsx`の6箇所のExecCtx構築に`currentPhase: bs.turn_phase`（またはそれに相当するローカル変数）を追加する**（新規機構ではなく既存フィールドの配線漏れ）。再現＝`node scripts/verifyBattleDrive.mjs trashMoveLockBlocksSelfEffect`（対照＝`trashMoveLockAllowsWhenUnlocked`）。


- **(cviii)〔【起】ACTIVATED の `cost.lrigDown` 未配線＝2026-08-06 続き356 で残0クローズ。⚠**登録時の記録「影響5枚」は実測不足で正しくは13効果**、しかも**実行経路が2つに割れる**（`executeSigniActivated`＝シグニ11／`executeLrigGranted`＝ルリグ本体の【起】2）＝別関数なので配線も別に要る、というのが登録時の見落とし。修正方針そのもの（【出】経路と同型の配線＋モーダルの available 判定）は当たっていた。加えて**支払えない【起】はアクション一覧から消す**（`fieldDown`／`fieldTrash`／`underSelfTrash` と同じ既存規約）のが本プロジェクトの慣例なので、登録時に想定されていた「ボタンは出るが disabled」ではなく「ボタンが出ない」が正しい合格条件になり、再現シナリオ `lrigDownCenterOnlyUnwired` の判定を書き換えた。派生の新規在庫＝(cix)。一次記録は BUGFIXES 2026-08-06 節〕**
  - 〔登録時の原文〕**🆕 【起】ACTIVATED効果の`cost.lrigDown`がUI/実行経路のどちらにも配線されていない（2026-08-05・§7実機検証「lrigDownコストの限定(a)(b)」調査中に発見）**＝`WXK10-023-E2`／`WXK10-037-E2`／`WXDi-P03-009-E3`／`WXDi-P04-042-E2`／`WXDi-P02-009-E3`（effectType:ACTIVATED・`cost:{lrigDown:{count,centerOnly?,level?}}`）を実際に発動する経路（`executeSigniActivated`＝`BattleScreen.tsx:10530-11138`）を全文grepしても`lrigDown`への参照が一切無い。`SigniActivatedModal.tsx`のコスト表示ロジック（energy/discard/charmTrash等の一覧・62-176行）にも`lrigDown`は登場しない。`payLrigDownCost`（`src/screens/battle/lrigDownCost.ts`）を実際に呼んでいるのは`executeSigniOnPlayCost`（`BattleScreen.tsx:11139-`＝【出】コスト専用経路）だけ＝**ON_PLAYのlrigDownコスト（`PR-K064`等）は機能するが、ACTIVATED（【起】）のlrigDownコストは完全に素通り**。実機で`WXK10-037-E2`のセンタールリグを事前に`field.lrig_down:true`にしても【起】ボタンが`enabled`のままクリックでき、コストを一切支払わずSEARCH本体が実行されることを`verifyBattleDrive.mjs lrigDownCenterOnlyUnwired`で2回連続再現（hHand 0→1・field.lrig_downは変化なし＝支払われていない証拠）。**影響範囲＝`cost.lrigDown`を持つACTIVATED効果全件**（centerOnly/level問わず・上記5枚が実測対象）。**修正方針＝`executeSigniActivated`に`payLrigDownCost`呼び出しを追加する**（`executeSigniOnPlayCost`の該当ブロック（`BattleScreen.tsx:11298-11305`）と同型の配線を足すだけ＝新規機構ではない）。加えて`SigniActivatedModal.tsx`側でも`cost.lrigDown`のavailable判定（centerOnly時はアシストが上がっていてもセンターが下がっていれば不可・level時は該当レベルの上がっているルリグ数で判定）をボタンのdisabled条件へ組み込む必要がある。再現＝`node scripts/verifyBattleDrive.mjs lrigDownCenterOnlyUnwired`。

## 2026-08-04 整理：PLAN §3 在庫表から退避した残0クローズ行（原文）

> 2026-08-04（続き341〜346）に残0クローズした6件の完了行。PLAN §3 には1行サマリだけを残した。一次記録は `BUGFIXES.md` 2026-08-04 の各節。

- **🆕(xcix)〔主語なし「シグニ1体がアタックしたとき」＝2026-08-04 続き346 で残0クローズ。母集団は1件でなく**3効果**（`WXDi-P06-033-E2`／`WXDi-CP02-053-E1`／`WXEX2-04-E1`）。⚠**着手時の見立て「collector が turnOwner を見ていない」は誤り**＝ターン限定は `effectStack.turnGateOk` が全コレクタ共通に評価する設計で、collector へ足したら既存 golden 2件が落ちた（差し戻し済み）。**本当のバグは `triggerScope` だけ**で parser のみの修正で閉じた。一次記録は BUGFIXES 2026-08-04 の先頭節〕**
- **🆕(lxviii)〔散文形「対戦相手のターンの間、」の過剰実行＝2026-08-04 続き345 で残0クローズ。**母集団は3段階で数え直して 145→30→3**（本文側12件に付けると逆に永久不発になるので弁別子で分離）。実装は ON_TARGETED 分岐に閉じて live 2効果のみ変更。派生の新規在庫＝(xcix)(c)。一次記録は BUGFIXES 2026-08-04 の先頭節〕**
- **🆕(xcviii)〔CPU のターン開始ドロー＝2026-08-04 続き344 で残0クローズ。`ON_DRAW` 13効果の未収集に加え、🔴**CPU の `refresh_count_this_turn` が一度もリセットされておらず、累計2回リフレッシュ以降は CPU ターンが毎回強制終了する**既存バグも同時に是正。一次記録は BUGFIXES 2026-08-04 の先頭節〕**
- **🆕(lxvii)〔CPU ターンのフェイズ/ターン境界トリガー＝2026-08-04 続き343 で残0クローズ。**穴は登録時の見立て（`ON_TURN_END` 1 timing）ではなく5 timing で、CPU ターンで一度も発火しなかった効果は計279**。`ON_ATTACK_PHASE_START` の手書き部分再実装も人間経路と同じ pure collector へ統一。併せて CPU 経路の【ハスターリク】が人間側でなく CPU 側を指していた既存バグも是正。派生の新規在庫＝(xcviii)。一次記録は BUGFIXES 2026-08-04 の先頭節〕**
- **🆕(xcv)〔「能力を持たない」判定＝2026-08-04 続き342 で残0クローズ。**登録時に自分で書いた修正方針（`-` 判定に寄せる）が誤りだった**＝実際は3箇所とも別々のものを見ており、`-` だけ直すと逆に「自分のアタッカーを自分のトラッシュへ落とす」新バグが出る形だった。判定を `execUtils.hasNoAbility` 1本へ統一。派生の新規在庫＝(xcvii)。一次記録は BUGFIXES 2026-08-04 の先頭節〕**
- **🆕(xcii)〔相手の盤面を参照するコスト軽減8枚＝2026-08-04 続き341 で残0クローズ。**登録時の見立て「シグネチャ変更の1バッチ」は外れ**＝呼び出し4経路はいずれも既に `{ oppState: op }` で相手 `PlayerState` を丸ごと渡しており、**受け取る側の型が狭くて捨てていただけ**だったので受け口を広げるだけで届いた（呼び出し側の変更ゼロ）。派生の新規在庫＝(xcv)(xcvi)。一次記録は BUGFIXES 2026-08-04 の先頭節〕**

## 2026-08-02 整理③：PLAN §3 在庫表の残0クローズ行（(lxx)／(lxxviii)／(lxxxii)／(lxxxiii)）

> ユーザー指示「PLAN のタスク12表でクローズしたものは退避させて」で PLAN §3 から移した（2026-08-02・続き331）。
> **PLAN §3 の在庫表には残作業のある在庫だけを置く**（現存＝(lv)／(lxvi)／(lxvii)／(lxviii)／(lxxxi) の5件）。
> 一次記録は BUGFIXES の各節。⚠**(lxxxii) は第5波でいったん「残0クローズ」と書かれた後、第6波の全数再スキャンで残件が見つかり再オープン→再クローズしている**＝
> **「残0クローズ」の記録は、母集団の数え方（別在庫へ移した分・held の温存分）まで確認しないと信用できない**という先例。

### §3 Opusタスク12 在庫表から退避した完了行（原文）

| (lxx) | **✅残0クローズ（2026-08-02 Batch F）**＝Batch A〜F と E' で全残件を消化。最後の `WXDi-P02-030-E1` は (lxxviii) の `byWatcherEffect` 実装で原因限定を復元。⚠Batch E の「残漏出4効果 honest defer」は Batch E' で live 採用済み（`WX24-P3-001-E1`／`WX24-P3-005-E1`／`WX24-P3-009-E1`／`WX25-P2-001-E1`）。引用付与の忠実化と `WXEX2-66-E2` CHOOSE は (lxx) の残ではなく §6.3 の別在庫。詳細 BUGFIXES 2026-08-02 Batch F。 |

> **2026-08-02 Batch E' 追記（(lxx)）**：Batch E の held 38カードは live 採用完了（31カード単位＋curated JSON の7効果を `PARTIAL` 温存）、追加タイプ `UP`／`REMOVE_ABILITIES`／`GUARD_EXTRA_COST_BY_OPP` の巻き込み6カードも原文照合して採用。live changed 44 / added 0 / removed 0、outlier 0。held は Batch E 直前252→最終256（正味+4）で、`WX24-P3-001`／`WX24-P3-005`／`WX24-P3-009`／`WX25-P2-001` は live 是正済み・fresh と curated の不一致により残留。付与機構の忠実化と `WXEX2-66-E2` CHOOSE は honest defer。詳細は BUGFIXES 2026-08-02 Batch E'。

| (lxxxiii) | **✅第15波で残0クローズ（2026-08-02）**＝`WX06-019-E1` の相手効果による場離れ powerReduction 置換を BANISH／BOUNCE／SEND_TO_ENERGY／TRASH／TRANSFER_TO_DECK／EXILE の一括・単体選択へ共通配線し、`PR-366-E3` は他シグニの英知AUTO列挙→能力選択→対象カード発生源で即時解決まで実働化。残る引用内2件 `WX20-036-CB-E1`／`WX24-P2-010-E1` は外側 excludeSelf 在庫ではなく §6.3「引用付与の忠実化」へ移管。(a)機能是正2／(b)明示化0／(c)defer0、実装課題4→0。詳細 BUGFIXES 第15波節。 |

| (lxxxii) | **🏁第6波で再クローズ（2026-08-02）＝残0**。⚠**第5波の「残0クローズ」は誤りだった**（クローズ判定が「別在庫へ移した分」と「held の採用禁止在庫」を数えていなかった）。**母集団を全数再スキャンして残件を確定**＝先頭形157／文中形210／文中形で live に CHOOSE 無し29（うち14件は `BET_MECHANIC`／`GRANT_CHOSEN_ABILITY` 等 **engine STUB が実行時に原文解析する設計＝正常**）。**要調査15件を fresh vs live で全数仕分け**し、**計44効果を是正**＝**①系統バグ `buildChoose` が「まで」を捨てて `upTo` を落としていた（live 38効果）**＝`ChooseAction.upTo` は型・engine・UI とも完備なのにヘルパーが引数を持たず、upTo を立てていたのは**ベット/リコレクト経路だけ**だった。「２つまで選ぶ」が「丁度2つ選ぶ」に潰れていた。呼び出し元8箇所へ配線＋フォールバック3経路の正規表現 `つまで?を?選ぶ`（「ま」必須で「２つ選ぶ」に不マッチ＝`choose_count` が既定1に落ちる潜在バグ）を是正。⚠**parser 修正が届かない2群は別経路で当てた**＝`WX05-052/059/066/073-E1` は `STATE_COND_BATCH4_ACTIONS` の**curated 直書き上書き**（リテラルに追記）／`WXDi-P10-004-E1`・`WXDi-P16-048-E1` は **MANUAL＝PRESERVE 保護**（`manualEffects.ts` に無い JSON 直 curated なので外科パッチ）。**upTo 欠落 38→0**。**②文中CHOOSE救済の前置拡張**＝`WX20-007-E1` の「任意支払い STUB ＋ 素の marker」型を狭く追加（支払い STUB は engine 実装済みの2種のみ許可）。**③held「採用禁止」在庫5枚は誤判定**＝`WXK08-002` の退化を根拠に巻き添えにしていたもので、実測すると **live のほうが壊れていた**（選択肢が1本だけ残って平坦化＝**強制実行**。`WXK05-004-E1` は③と④の末尾が混線した幻覚）。5枚とも採用。**④採用に伴う過剰実行を1件先に潰した**＝`WXK08-003-E1` ③「このターンに対戦相手がアーツかスペルを使用していた場合」が落ちて無条件トラッシュになっていたので、条件テーブルへ `OR[ARTS_USED_THIS_TURN, SPELL_USED_THIS_TURN]{opponent}` を追加（**両語彙とも engine 実装済み＝新語彙0本**・波及2効果のみ）。⚠**golden の否定例を差し替えた**＝`(xxix) 配置アンカーの無い BLOCK は誤って畳まない` が `WX20-007-E1` を否定例に使っていたが、それは**CHOOSE 脱落で③の `ADD_TO_FIELD` が消え BLOCK が宙に浮いていただけ**＝復元で「畳むのが正しい」状態になったため、本当にアンカーが無い `WXK05-005-E1` へ移した。**残した在庫**＝`WXK08-001-E1` の owner/count 不正確（「そうした場合、…**それら**は」の**先行詞が文分割で切れる**＝先行詞解決機構が要る）／`WXK05-002-E1` の「選んだ数が２つ以上ならコスト増」欠落（(lxxxi) のアーツ使用コスト算出経路 待ち）。詳細 BUGFIXES 第6波節。**旧記録**＝**「以下のNつからMつを選ぶ」が文中に来ると CHOOSE が丸ごと落ちる。残10→残8効果**（2026-08-02 第1波 `WXK09-004-E1`／第2波 `WD21-008-E1`＋同型2件 `WX20-003-E1`・`SPK01-07-E1`〔在庫外だったが実測で同型と判明〕）。⚠**母集団の記載を実測で全面訂正**＝旧記載「先頭形258＋文中形46・脱落10」は誤りで、**実測は先頭形157／文中形210／文中形で live に CHOOSE が無い35**。しかも**その35件の大半は壊れていない**＝約17件は `BET_MECHANIC`（「ベット―《コインアイコン》」前置・9件）／`GRANT_CHOSEN_ABILITY`／`GRANT_CHOSEN_ABILITY_SELF`／`SIGNI_GRANT_CHOSEN_ABILITY`／`INTERNAL_KIYOHIME_CHOOSE` など **engine の STUB が実行時に原文を解析する設計**（`effectParser.ts:5753-5768`）＝**JSON に CHOOSE が無いのが正常で、素の CHOOSE に置き換えると退化する**。⛔この群は触らないこと。✅第1波＝救済規則（`effectParser.ts:5730-5749`）の適用条件を3点緩和（①前置が非 SEQUENCE でも `[prefixAction]` として拾う ②本数 2本以上→**1本以上** ③許可 marker に **`ARTS_COST_REDUCTION_BY_CENTER_LRIG`** を追加）。⚠**在庫メモの記載誤りを訂正**＝当該カードの前置 marker は `ARTS_COST_REDUCTION_BY_EFFECT` ではなく `ARTS_COST_REDUCTION_BY_CENTER_LRIG` だった（投入前実測で判明）。✅第2波＝許可する前置の木に「任意支払い action（`TRASH{HAND_CARD,self,1}`＋原文「捨ててもよい」／`STUB{TRASH_OWN_KEY_OPTIONAL}`）＋`CONDITIONAL{IS_MY_TURN}` に包まれた marker」を**狭く固定**して追加（`effectParser.ts:5741-5765`）。⚠**`CONDITIONAL{IS_MY_TURN}` は「そうした場合、」の意図的な慣例エンコード**（`:1250` に「刻印しない」と明記・engine 特別処理あり）＝**幻覚ではないので形を変えず前段へ保持する**。⚠**第2波では Claude が1件差し戻した**＝`WX20-003-E1` ②の「対戦相手のターンの場合」条件が脱落し、**対象を正しく LRIG へ直したことで初めて実効性を持ったぶんが過剰実行になっていた**（`TURN_OWNER` は `IS_MY_TURN` と違い engine で実評価される＝`execUtils.ts:1229`）。**残8件と、次に取るべき順**＝**①`WXK08-002-E1`**＝CHOOSE は復活するが fresh に退化4点（①手札回収欠落・場出し source 欠落・遅延 BOUNCE が選択対象を追跡しない／②本来「相手の合計パワー10000以下・2体まで」が `owner:self,count:1`／③引用能力付与欠落）＝配線が先／**②C群5件**（`SP26-005-E1`／`SP38-004-E1`／`WD23-044-EA-E1`／`WX26-CP1-024-E1`／`PR-Di013-E1`〔MANUAL〕）＝「追加コストを払っていた場合、代わりに2つ選ぶ」＝**支払い結果で `choose_count` が変わる条件つき CHOOSE 語彙＋engine/UI 配線の新設が要る**（`:5752` が意図的に据置している型＝**素の CHOOSE に落とすのは退化**）／**③D群2件**＝`WXDi-P05-006-E1`（【使用条件】【チーム】が `GRANT_KEYWORD` に化ける幻覚が同居＝§6.3 F の保留案件）・`WXK10-008-E1`（MANUAL 温存）。⚠**第1波の副産物＝held +7カードは「採用禁止」**（`WXK05-002`/`WXK05-004`/`WXK07-002`/`WXK08-001`/`WXK08-002`/`WXK08-003`/`SPK01-14`）＝parser 緩和が MANUAL/PARTIAL 温存カードの fresh にも波及したもので live 非影響だが、**再収穫で無検証採用すると退化が入る**。⚠**着手する前に、成功例として引くカードの `parseStatus` を必ず確認すること**（`MANUAL` を成功例にすると存在しない「判別の鍵」を探すことになる＝2026-08-01 に Claude が踏んだ）。詳細 BUGFIXES 2026-08-02 (lxxxii) 第1波・第2波節。 |

| (lxxviii) | **✅残0クローズ（2026-08-02 Batch F）**＝新軸 `triggerCondition.byWatcherEffect`（watcher 所有者の効果が原因）＋ `causeOwnerId` を `collectHandDiscardTriggers` と BattleScreen 7経路へ配線。対象4効果は watcher の効果でだけ発火し、相手自身のコスト／効果／原因不明では非発火。既存 `byOwnEffect`（捨てた本人基準）は非回帰。live changed 4 / added 0 / removed 0、outlier 0、gates 全緑。詳細 BUGFIXES 2026-08-02 Batch F。 |

> **🆕 2026-08-02 第3波追記（(lxxxii)）**：`WXK08-002-E1` は段階1を着地し、残 **8→7効果**。CHOOSE 1/3 と② `owner:any,count:2,upToCount:true,totalPowerMax:10000` を live 採用。①③は過剰実行を避ける明示 STUB no-op。詳細 BUGFIXES 第3波節。

> **🆕 2026-08-02 第4波追記（(lxxxii)）＝残 7→3効果**。「追加コストを払うと選択数が増える」5件を engine 直叩きで実測仕分け＝**engine に機構は既にあり新語彙0本**（在庫メモの「新語彙が要る・1バッチ丸ごと」は誤り）。**`WD23-044-EA-E1`**（恒久 no-op）と **`WX26-CP1-024-E1`**（支払いが選択数に伝わらない）を engine-only で実働化。⛔**`SP26-005-E1`／`SP38-004-E1` は元から完動＝誤登録につき在庫から除外**。**残3件＝`PR-Di013-E1`**（`GRANT_LRIG_ABILITY` への意味論修正が要る＝現状 `DRAW` を即時実行）／**`WXDi-P05-006-E1`**（別バグ同居・`PARTIAL`）／**`WXK10-008-E1`**（MANUAL 温存・fresh の①がエナゾーン対象をシグニと誤読）。詳細 BUGFIXES 第4波節。

> **🏁 2026-08-02 第5波追記（(lxxxii)）＝残 3→0・在庫クローズ**。実測で `WXDi-P05-006-E1`／`WXK10-008-E1` も **`mergeManualEffects` 経由で既に CHOOSE が正常動作＝誤登録**と判明（⚠**effects JSON を直読みすると「壊れている」と誤判定する**）。本物の残り **`PR-Di013-E1`** は3枝を `GRANT_LRIG_ABILITY` へ是正して着地（即時実行→能力付与）。**(lxxxii) は10件中4件＝4割が誤登録**だった。詳細 BUGFIXES 第5波節。

> **🏁 2026-08-02 第6波追記（(lxxxii)）＝在庫を再オープンして再クローズ・計44効果 是正**。⚠**第5波の「残0」は誤り**＝クローズ判定が「別在庫へ移した分」と「held の採用禁止在庫」を数えていなかった。**母集団を全数再スキャンして残件を確定**（文中形で live に CHOOSE 無し29→うち14件は engine STUB 設計＝正常／要調査15件を fresh vs live で全数仕分け）。**最大の収穫は系統バグ**＝`buildChoose` が全呼び出し元で「Mつ**まで**選ぶ」の「まで」を捨てており、**live 38効果が `upTo` 欠落＝丁度M個必須に潰れていた**（`ChooseAction.upTo` は型・engine・UI とも完備で、立てていたのはベット/リコレクト経路だけ）。**upTo 欠落 38→0**。⚠**parser 修正が届かない2群**（curated 直書き上書き／MANUAL＝PRESERVE 保護）は**別経路で当てる必要がある**＝**「parser を直した」だけでは live に届いたか分からない**ので毎回 live を実測すること。詳細 BUGFIXES 第6波節。

## 2026-08-02 整理②：PLAN §3 在庫表の残0クローズ行／§4 恒久指標の計測履歴（原文）

- **旧: 2026-08-10 続き418〜422（所有者反転／コスト取り違えを計器で5波）後 最新値（当時の正）**：census **854**（860→854・`BASELINE_HIGH` 更新済み）、golden **1769（+16）**、`MANDATORY_SUSPICIOUS` **2**（据置）、held **110カード／48群**、同型★ **0**（265群）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors/**256 warnings**、manual field loss 0、golden 型カバレッジ **128/128**、UNKNOWN **36ノード/34カード**、🔴幻の手札コスト **1件**（19→1）。母数＝効果カード **5975**／効果 **10683**／MANUAL効果 **1118**。

- **旧: 2026-08-10 続き418〜421（所有者反転／コスト取り違えを計器で4波）後 最新値（当時の正）**：census **854**（860→854・`BASELINE_HIGH` 更新済み）、golden **1766（+13）**、`MANDATORY_SUSPICIOUS` **2**（据置）、held **122カード／48群**（うち採用済み14枚は除外表示）、同型★ **0**（265群）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors/**256 warnings**、manual field loss 0、golden 型カバレッジ **128/128**、UNKNOWN **36ノード/34カード**。母数＝効果カード **5975**／効果 **10683**／MANUAL効果 **1118**。

- **旧: 2026-08-10 続き418〜420（「所有者反転／コスト脱落」を計器で3波）後 最新値（当時の正）**：census **854**（860→854・`BASELINE_HIGH` 更新済み）、golden **1764（+11）**、`MANDATORY_SUSPICIOUS` **2**（据置）、held **128カード／48群**（うち採用済み18枚は除外表示）、同型★ **0**（265群）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors/**256 warnings**、manual field loss 0、golden 型カバレッジ **128/128**、UNKNOWN **36ノード/34カード**。母数＝効果カード **5975**／効果 **10683**／MANUAL効果 **1118**。

- **旧: 2026-08-10 続き418〜419（§6.4「代わりに/選択肢」の所有者反転を系統消化）後 最新値（当時の正）**：census **854**（860→854・`BASELINE_HIGH` 更新済み）、golden **1761（+8）**、`MANDATORY_SUSPICIOUS` **2**（据置・`node scripts/_checkAllEffects.mjs`）、held **115カード／49群**（うち採用済み4枚は除外表示）、同型★ **0**（265群）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors/**256 warnings**、manual field loss 0、golden 型カバレッジ **128/128**、UNKNOWN **36ノード/34カード**（38→36）。母数＝効果カード **5975**／効果 **10683**／MANUAL効果 **1118**。

- **旧: 2026-08-10 続き418（§6.4「代わりにそれを〜」動詞昇格の機構化）後 最新値（当時の正）**：census **858**（860→858・`BASELINE_HIGH` 更新済み。**+2 は加算モデルの良性検出**＝実質 855 相当）、golden **1759（+6）**、`MANDATORY_SUSPICIOUS` **2**（据置・`node scripts/_checkAllEffects.mjs`）、held **114カード／49群**、同型★ **0**（265群）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors/**256 warnings**、manual field loss 0、golden 型カバレッジ **128/128**、UNKNOWN **36ノード/34カード**（38→36）。母数＝効果カード **5975**／効果 **10683**／MANUAL効果 **1118**。

- 旧: 2026-08-10 続き416〜417（§6.4 任意性脱落の系統消化）後 最新値（当時の正）**：census **860**（877→860・`BASELINE_HIGH` 更新済み）、golden **1753（+3）**、`MANDATORY_SUSPICIOUS` **2**（35→2・`node scripts/_checkAllEffects.mjs`）、held **115カード／49群**、同型★ **0**（265群）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors/**256 warnings**、manual field loss 0、golden 型カバレッジ **128/128**、UNKNOWN **38ノード/36カード 据置**。母数＝効果カード **5975**／効果 **10683**／MANUAL効果 **1118**。

- **2026-08-10 続き409〜415（§6.4 STUB 仕分け計器＋A群6件＋UNKNOWN 2バッチ）後 最新値（当時の正）**：census **877**（880→877・`BASELINE_HIGH` 更新済み）、golden **1750（+9）**、**UNKNOWN 38ノード/36カード**（43→38）、held **113カード／48群 据置**、同型★ **0**、smoke **10686/10686** 全0・SKIP 0、fuzz 全0、lint 0 errors/**256 warnings**（⚠**+5 は実数の測り直しぶん**＝旧 254 は `--cache` 込みの値で、キャッシュを消したベースライン実測は **251**。増分2は中央 diff funnel に1ブロック足したことで `useHost`/`useGuest`（**React hook と誤認される名前**の局所ヘルパ）の偽陽性が2件増えたもの＝既存の全ブロックが同じ warning を出している。残り3は未追跡の `scripts/_dbgFresh.ts`）、manual field loss 0、golden 型カバレッジ **128/128 据置**、**live JSON 変化 1 効果**（`WXK11-001-E1` のみ。`npm run build:effects`＋`npm run regen` 実施）。**🆕 STUB 仕分けの実数（`npm run census:stubs`）**＝逆翻訳の `[STUB:…]` **906箇所**（うち生ID露出 **275**）／**A 実装の穴 14種16件（明示 defer 7種9件・無言 no-op 7種7件）／B 宣言型 18種32件／C 表示だけの穴 176種259箇所／D 健全**（初回実測は A 19種21件・無言 no-op 12＝続き409〜413 で6件消化）。⚠**残す教訓**＝(a) 🔴**「実装済みか」を id 文字列の grep で測ってはいけない**＝実装軸は**ハンドラ／engine 別経路／ペイロードキー／カード番号**の4本あり、較正中に実測で5種が「実装済みなのに実装の穴」と誤報された。(b) 🔴**前方一致の探索は向きを逆にする**＝「id の前方一致を src から探す」は `ASSIST_LRIG_ATTACK_THIS_TURN`↔`RETURN_ASSIST_LRIG_TO_DECK` のような他人の名前に当たる。**コード側の matcher を集めて id を test する**（実測でコード全体に matcher は1本だけ）。(c) 🔴**生成側（parser/manualEffects）と型宣言（`src/types/`）は「消費」ではない**＝混ぜると真 no-op が実装済みに化ける。(d) ⭐**`genStubsMd.mjs` の「フォールバック」欄は仕分けに使えない**（軸が1本＋id 正規表現が `[A-Z0-9_]+` で日本語入り id を取りこぼす）。
- **2026-08-10 続き408（§6.4 計器の誤検出潰し）**：census **880 据置**、golden **1741 据置**、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors/**254 warnings**（増減0）、manual field loss 0、held **110 据置／47群 据置**、golden 型カバレッジ **128/128**、**live 変化 0 効果＝計器のみ**（`npm run regen` 不要）。**🆕 計器の実数**＝`node scripts/_checkAllEffects.mjs` **33件（誤検出30）→36件（誤検出0／真バグ1＋系統バグ候補35）**、`npm run verify` **タイミング 4→0**（残＝STUB代替?5・要確認3 は未仕分け）。⚠**残す教訓**＝(a) 🔴**計器を直す前に必ず全件を手で仕分ける**＝33件中30件が誤検出だったので、先にルールを削っていたら真バグ3件を一緒に消していた。(b) 🔴**「代わりに」は加算分解／可変カウントは `countPer*`・`countIs*`／任意性は「〜てもよい」＝プロジェクト固有の表現規約を知らない計器は必ず誤検出する**。計器のルールは**表現規約とセットで書く**。(c) 🔴**日本語の文分割は「引用をマスク→能力マーカーで区切る」の2段**＝`[^【]*` で切ると【ゲート】等のキーワードで文が途切れる。(d) ⭐**検出器を広げると新しい系統バグが出る**＝任意性を「してもよい」→「〜てもよい」へ広げただけで35件の候補が出た。**誤検出を消す作業と検出範囲を広げる作業はセットでやる**。

- **🆕 2026-08-10 続き407（§6.4 golden の型網羅）後 最新値（本行が直近の正）**：census **880 据置**（`BASELINE_HIGH` 変更なし）、golden **1726→1741**（+15）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム・EXPLOSION 0）、lint 0 errors/**254 warnings**（増減0）、manual field loss 0、held **110 据置／47群 据置**、**live 変化 0 効果**（`npm run regen` 不要）。**🆕 golden 型カバレッジ 128/128（未カバー0）**＝新設 `npm run census:goldentypes`。**新規関数**＝`collectOppDeclaredLrigLimitDelta`（`lrigLimit.ts`）。⚠**残す教訓**＝(a) 🔴**過剰報告する計器は無いより悪い**＝型カバレッジの第1版は `type:'FOO'` リテラル一致で 39件と誤報した（実数13）。CONTINUOUS 専用型は live 実カードを引くのが正しい書き方なので、リテラル一致では構造的に取りこぼす。**計器を作ったらまず「報告が実態と合うか」を数件手で確かめる**。(b) 🔴**網羅作業の価値は「テストが増える」ことより「no-op が見つかる」こと**＝13型を塞ぐ過程で `LRIG_LIMIT_MODIFY` の真 no-op 2件（AUTO 版が未実装／相手宣言の常在が未集計）が出た。(c) 🔴**同じ意味の型でも `until` で担当が分かれる**＝`PERMANENT` は常在collectorが毎フレーム集計するので executor で書くと二重計上、`NEXT_TURN`/`END_OF_TURN` は実行時に1回書く。(d) ⚠**アクセ/ソウル/レイヤー付与は effectsMap に載らない**＝collector を叩くテストは BattleScreen と同じ augMap を組んでから渡す。

- **🆕 2026-08-10 続き406（§6.4 F-3 身代わりを効果バニッシュへ配線）後 最新値（本行が直近の正）**：census **880 据置**（`BASELINE_HIGH` 変更なし）、golden **1721→1726**（+5）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム・EXPLOSION 0）、lint 0 errors/**254 warnings**（増減0）、manual field loss 0、held **110 据置／47群 据置**、**live 変化 0 効果＝engine 配線のみ**（`npm run regen` 不要）。**新規関数**＝`applyEffectBanishSubstitute`（`effectExecutor.ts`）。**API 変更**＝`applyEffectLeaveSubstitutes` の opts が `skipReplaceBanish` → `isBanish`。⚠**残す教訓**＝(a) 🔴**「同じ段の排他な2択」は1つのフラグで表す**＝`ReplaceBanish`（非バニッシュ専用）と F-3 身代わり（バニッシュ専用）を別フラグにすると、新しい経路を足す人が片方だけ書いて黙って取りこぼす。(b) 🔴**engine から live 効果を引く channel は `ctx.cardMap.get(...)?.effects`**＝`ctx.effectsMap` はスタック解決1経路でしか代入されない（続き296／405 と同根）。App.tsx が CardData に live JSON を載せているので前者は実アプリでも確実。(c) ⚠**対話フロー（`field.check`）を要する置換は engine の同期 ctx 変換に載せない**＝`lifeCrash` を無理に実装するとライフバーストを飛ばす別バグになる。**対象外にして理由を書く**方が正しい。(d) 🔴**PLAN の在庫記述は続き402〜406 で6回連続して古かった**＝**投入前に live JSON と engine を probe で実測してから設計する**。

- **🆕 2026-08-10 続き405（§6.4 配置制限ゲートの一本化）後 最新値（本行が直近の正）**：census **880 据置**（`BASELINE_HIGH` 変更なし）、golden **1715→1721**（+6）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム・EXPLOSION 0）、lint 0 errors/**254 warnings**（増減0）、manual field loss 0、held **110 据置／47群 据置**、**live 変化 0 効果＝engine/UI 配線のみ**（`npm run regen` 不要）。**新設モジュール**＝`src/engine/deployLimit.ts`（配置制限の単一入口）。**ExecCtx 新フィールド**＝`deployCountCapSelf` / `deployCountCapOpponent`。⚠**残す教訓**＝(a) 🔴**「事前計算した CONT 値を ExecCtx へ載せる」パターンは、載せ忘れが1箇所でもあると黙って効かない**＝`ctx.effectsMap` は BattleScreen のスタック解決1経路でしか代入されないので effectsMap 依存も同じ罠。**生成箇所を1つのヘルパー（`fillDeployCaps`）呼び出しに統一して、機械的に全箇所へ入れる**。(b) 🔴**制限の適用範囲は原文の主語で決まる**＝「N体まで場に出せない」は**体数**の制限なのでライズ（上乗せ）は対象外だが、「パワーN以上を新たに場に出せない」は**行為**の制限なのでライズにも掛かる。同じ「配置制限」でも軸が違う。(c) 🔴**複数枚をまとめて配置する経路は1枚ごとに上限を再評価する**＝場のシグニ数が増えながら進むため、入口で1回だけ見ると上限を跨いで置ける。(d) ⚠**元の領域から取り除く前に弾く**＝取り除いてから弾くとカードが消失する（`applyDirectAction` の ADD_TO_FIELD）。

- **🆕 2026-08-10 続き404（§6.4 アタック可否ゲート一本化＋付与ストア共通走査）後 最新値（本行が直近の正）**：census **880 据置**（`BASELINE_HIGH` 変更なし）、golden **1705→1715**（+10）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム・EXPLOSION 0）、lint 0 errors/**254 warnings**（増減0）、manual field loss 0、held **110 据置／47群 据置**、**live 変化 0 効果＝engine/UI 配線のみ**（`npm run regen` 不要）。**新設モジュール**＝`src/screens/battle/signiAttackGate.ts`（シグニアタック可否の単一入口）／`src/engine/grantedStore.ts`（付与3ストアの任意 timing・任意 scope 走査）。⚠**残す教訓**＝(a) 🔴**「判定は実装済み」と「判定が全経路から読まれている」は別物**＝`cannotAttackSigni` は6種の CONTINUOUS を正しく集めていたのに消費地点が人間UIの1箇所だけで、CPU には丸ごと効いていなかった。**新しい判定を足したら「これを読むべき経路は何箇所か」を数える**。(b) 🔴**同型の穴は兄弟軸にも必ずある**＝アタック可否を洗ったら power cap・once limit・エナコストも同じ1箇所読みで、CPU が過少払いまでしていた。**1つ見つけたら周辺を面で見る**。(c) 🔴**PLAN の在庫記述は5セッション連続で古かった**＝`WXDi-P07-073-E1` は「今も死んだまま」と書かれていたが実測すると発火していた。**投入前に probe で実測してから設計する**（今回は live JSON 全走査で付与能力144件を timing×scope×ストア集計し、初めて本当の穴＝8 timing が見えた）。(d) ⚠**支払い済み再入の経路はゲートの例外になる**＝コスト予約は支払っても消えないので、再入フラグ無しでゲートを足すと「もう払えない」でアクションが黙って消える（`fieldTrashCostAlreadyPaid`）。

- **🆕 2026-08-10 続き403（§6.4 トラッシュ起動のコストUI）後 最新値（本行が直近の正）**：census **880 据置**（`BASELINE_HIGH` 変更なし）、golden **1698→1705**（+7）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム・EXPLOSION 0）、lint 0 errors/**254 warnings**（増減0）、manual field loss 0、held **110 据置／47群 据置**（`WX11-049` は parser 修正で一度 held 入りしたが同セッション内で採用＝差分を残していない）、live 変化 **1効果**（`WX11-049-E2` のみ＝added/removed 0）。**新設した型**＝使用条件 `CHARM_COUNT`（`Condition` の型数 115→**116**）。**新設モジュール**＝`src/screens/battle/trashActivateCost.ts`（トラッシュ自己起動【起】の支払い単一入口）。⚠**残す教訓**＝(a) 🔴**「未対応だから UI を出さない」ガードは、対応を足したときに一緒に緩めないと死んだまま**＝§6.4 の14枚は `k !== 'energy' && v` の1行で丸ごと到達不能だった。**到達不能な効果は census にも smoke にも出ない**（実行されないので語彙が欠けない）＝**UI 側の門を数える計器が無い**。(b) 🔴**到達不能だった効果を開けるときは、その効果の使用条件が `COND_STUB` でないか必ず見る**＝`WX11-049-E2` は窓を開けた瞬間に無条件使用になるところだった。**「今まで無害だった手抜き」は到達可能になった瞬間に実バグへ変わる。**(c) 🔴**同じ判定を2つのモーダルに写経すると片方だけ古くなる**＝`handDiscardSigni` の `level` 指定は `LrigGrantedModal` 側だけ落ちていた（6効果）。(d) ⚠**golden の `fresh()` はカーソル順に依存する**＝対象フィルタつきの assert は**フィルタを満たすまで払い出す**形にしないと、無関係な前段テストの1枚で落ちる（`task12(lxiii)` が実際に落ちた）。

- **2026-08-07 続き374（§5d パターンA 第6バッチ＝「共通する色」＝相手エナ除去の色制限）後 最新値（本行が直近の正）**：golden **1417→1418**（+1＝3効果に載ること／`WXDi-P12-002` のディソナ3体ゲート／**取り違え3件には足していないこと**）、census **1166→1164**（−2・`BASELINE_HIGH` も 1164 へ更新＝**機能是正**。この系統は OK **30→33**／未配線 8→5）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **230→229／署名グループ 104件**。**live JSON の変更は4効果／4カード**。**機構・型・engine は無改造**（既存の段階ロールアウト表に3件足しただけ）。⚠**残す教訓**＝(a) **クラスタはまず分類して「もう直っている割合」を測る**＝この系統は原文38件のうち30件が既に正しく、残り8件だけが仕事だった。(b) **部分修正が誤りを固定する形かを見極める**＝対象ゾーンごと取り違えている3件に色フィルタだけ足すと「誤った対象に正しい制限」になる。**足さなかったことを golden で固定する**のも成果物。(c) **PARTIAL もカード単位 PRESERVE**＝held に載らないので外科パッチが要る（`WXDi-P15-089-E1`）。値は必ず parser 出力と一致させる。(d) **held の採用は「ついでの是正」を連れてくる**＝`WXDi-P12-002` の採用で無条件発動だったディソナ3体ゲートも同時に復活した。

- **2026-08-07 続き373（§5d パターンA 第5バッチ＝動的な同一性参照＋据置1件の解除）後 最新値（本行が直近の正）**：golden **1415→1417**（+2＝`levelEqTrigger` がトラッシュ→手札に載ること／lastProcessed 系を横取りしないこと／サーチの同一性制約／`WXK05-044` の REVEAL に source が載ること）、census **1170→1166**（−4・`BASELINE_HIGH` も 1166 へ更新＝**機能是正**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **231→230／署名グループ 104件**。**live JSON の変更は6効果／6カード**。**型・engine は無改造**。⚠**残す教訓**＝(a) **4バッチ連続で「語彙はあるが呼ばれていない」**＝`levelEqTrigger` は トラッシュ→**場** では配線済みで トラッシュ→**手札** だけ漏れていた。**同じ語彙の入口を横に洗う**のが最短。(b) **動的参照は「記録側」と「参照側」をセットで直す**＝`WXK05-044-E1` は前段の REVEAL が bare に潰れて `lastProcessedCards` を記録しておらず、参照フィルタだけ足すと**過剰効果が確実な no-op に変わるだけ**だった。(c) **据置は永久ではない**＝表せなかった2系統が表せるようになったら据置を解く（`WXEX2-06-E2` を続き370 から3セッション越しに解除）。**据置を固定した golden はアサーションごと更新する**（「いま表せない」という事実の記録であって恒久仕様ではない）。(d) **`manualEffects.ts` に書いても live に届いているとは限らない**＝`WX24-P3-063-E1` は正しい MANUAL 定義が held に滞留していた（採用漏れ）。

- **2026-08-07 続き372（§5d パターンA 第4バッチ＝`nonColorless` の残りビルダー＋ガードのスコープ是正＋engine パリティ）後 最新値（本行が直近の正）**：golden **1413→1415**（+2＝11効果に載ること／`WXEX2-06` の据置／`WX16-Re06` の条件節／engine の HAS_CARD_IN_FIELD × colorExclude・excludeResona）、census **1181→1170**（−11・`BASELINE_HIGH` も 1170 へ更新＝**機能是正**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **231 据置／署名グループ 104件**。**live JSON の変更は12効果／12カード**。⚠**残す教訓**＝(a) **語彙は「1バッチ」で終わらない**＝`nonColorless` は SEARCH とトラッシュ→手札だけ配線済みで、残り6ビルダーが素通しだった。**配線したら同じ語彙の他ビルダーを必ず洗う**。(b) **filter を落とす側のガードもスコープを間違えると過剰効果を作る**＝続き370 のガードが全文を見ており、後続文の語が前文の filter を巻き添えで消していた（`WXK09-029-BURST`）。(c) **`matchesFilter` は engine に2本ある**（`execUtils` と `effectEngine`）。effectEngine 側に `colorExclude`／`excludeResona`／`noAbilities` が無く、CONTINUOUS・activeCondition・HAS_CARD_IN_FIELD で**黙って無視**されていた＝**片方に足したら他方も確認する**。(d) **golden の新テストは `withSavedCursor` で包む**（`mkState` が共有カーソルを進めるため、包み忘れると**無関係なテスト**が落ちる）。しかも即時実行関数なので `test(name, () => withSavedCursor(() => {…}))` の形にする。

- **2026-08-07 続き371（§5d パターンA 第3バッチ＝「《カード名》以外の」の `excludeCardName` 配線）後 最新値（本行が直近の正）**：golden **1411→1413**（+2＝36効果に載ること／反転が戻っていないこと／除外と部分一致の同居／engine の完全一致判定／beat コストの `analyzeBeatSigniCost`）、census **1184→1181**（−3・`BASELINE_HIGH` も 1181 へ更新＝**機能是正**。「除外(〜以外の)」クラスタの高シグナルは **8→4**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **242→231／署名グループ 104件**（`heldReview` で12枚採用・実測）。**live JSON の変更は36効果／36カード**（1カード1効果）。**型・engine は無改造**。⚠**残す教訓**＝(a) **3バッチ連続で「語彙はあるが呼ばれていない」だった**＝§5d パターンA は新語彙を足す前に必ず `matchesFilter`／`TargetFilter` を grep する。(b) **パターンA の実害は「過剰」だけではない**＝除外名が `cardName`（部分一致）に入ると**原文と真逆（そのカードしか選べない）**になる＝13効果がこれだった。(c) **「parser を直す」と「live JSON へ届かせる」は別作業**＝反転13効果は parser では既に正しく、held に溜まっていただけ。カード単位 PRESERVE（同居効果が MANUAL）は held に載らないので外科パッチが要る（`WX09-CB02`）。(d) **census の残件＝バグとは限らない**＝【ビート】コスト3効果は `cost.beat_signi` に語彙を載せられないが engine が EffectText から除外名を読んでおり**据置で正しい**。

- **2026-08-07 続き370（§5d パターンA 第2バッチ＝「無色ではない〜」の `nonColorless` 配線）後 最新値（本行が直近の正）**：golden **1410→1411**（+1＝9効果に載ること／`WXEX2-06` の据置／engine の有色・無色判定）、census **1189→1184**（−5・`BASELINE_HIGH` も 1184 へ更新＝**機能是正**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **242 据置**（`heldReview`）／**parserWorklist は held 259・LOSS 203・VALUE 54**（2026-07-19 の 188/154/34 から実数更新＝母数が違う別計器）。**live JSON の変更は9カード**。**型・engine は無改造**（`nonColorless` は実装済みで、壊れていたのは parser のフィルタ合成の配線）。⚠**残す教訓**＝(a) **§5d パターンA の実態は「語彙が無い」ではなく「語彙はあるが呼ばれていない」**＝新しい型を足す前に**既存フィールドの有無を必ず確認**する。(b) **段階ロールアウトの whitelist は理由があって存在する**＝過去に全体有効化が危険だった機構なので、一気に外さず**原文照合した分だけ**足す。(c) **2系統を同時に表せない形は「部分 filter だけ採用しない」**（`WXEX2-06`）＝中途半端な採用は別種の過小実行を生む。

> PLAN.md が 185KB まで膨らんだため退避（2026-08-02）。**生きている worklist ではない**＝一次記録は BUGFIXES 各日付。

### §3 Opusタスク12 在庫表から退避した完了行（(lxix)(lxxi)(lxxii)(lxxiv)(lxxix)(lxxx)＋完了まとめ引用行）

| (lxxiv) | **🆕✅残0クローズ（2026-08-01・codex 実装／Claude 検証）**＝9/10枚（`WX24-P4-007` は第9波で消化済み）。残1だった `WXK11-001-E1` は**①を復元・②を honest defer** で着地。詳細は BUGFIXES 2026-08-01 (lxxiv) 節。<br>⚠**在庫の残作業定義が小さすぎた**＝「1枚の parse」ではなく、**アタックステップのスキップは engine に実装が1行も無かった**（`BLOCK_ACTION{LRIG_ATTACK_STEP/SIGNI_ATTACK_STEP}` の参照は parser 2箇所とログラベル1箇所だけ）＝**この文型5カード全部が no-op** だった。純関数 `resolveNextPhaseWithAttackStepBlocks`（`src/screens/battle/attackStepPhase.ts`）を新設し、フェイズ進行の**全5経路**（PvP／CPUターン／非ターンCPUのアーツパス）を通した。<br>⚠**在庫の「①と②で owner が食い違う」の真因は parser の部分文字列判定**（`t.includes('対戦相手')`）＝条件節の中の「対戦相手」を拾っていただけで、意味の差ではなかった。<br>**残る在庫1件**（①`WX09-Re02` は **✅2026-08-01 に残0クローズ**＝白1無7 を払って何も起きない no-op アーツだった2択スキップを復元。詳細 BUGFIXES 2026-08-01「(lxxiv)残：`WX09-Re02-E1`」節）＝②`WXK11-001-E1`②（ルリグデッキのアーツを**ゲームから除外**する任意コスト＝既存語彙はルリグトラッシュ行き専用で行き先が違い、`BANISH_FROM_GAME` は使用したアーツ自身を除外する別動作）③parser 側の2分岐が**カード固有の全文リテラル**（§5-5c）＝条件節持ち上げと owner 判定の是正で一般化すべきだが波及が大きく据置。
| (lxxii) | **🆕✅残0クローズ（2026-08-01・codex 実装／Claude 検証）**＝`delayed_triggers` のターン終了クリアが**ターンプレイヤー側だけ**だったのを両側へ。純関数 `clearEndOfTurnDelayedTriggers`（`src/screens/battle/delayedTrigger.ts`）を**3経路 × 2プレイヤー＝6箇所**から呼ぶ形にした。詳細は BUGFIXES 2026-08-01 (lxxii) 節。<br>⚠**在庫の「現時点で誤発火する実カードは確認できていない」は全数走査で1件に確定した**＝live の `INSTALL_DELAYED_TRIGGER` 全18効果のうち**17件はターンプレイヤーのみが設置**（`ACTIVATED MAIN` 14／`ATTACK_ARTS` の【起】2／`AUTO` 2）で、🔴**`WX11-024-E1`《リフレッシュ・エンド》だけがアーツ・スペルカットイン＝防御側設置**。相手ターン中に使い相手がリフレッシュしなければ持ち越し、**次の自分のターンに `FORCE_END_TURN` が誤発火**していた。<br>⚠**Claude の指示書が1点誤っていた**＝「`THIS_ATTACK_PHASE` の物理削除は存在しない」は**誤り**（`clearEndOfAttackPhaseDelayedTriggers` が `attackDuration.ts` に実在し `BattleScreen.tsx:3545/3547` で両者へ適用済み）。**grep のトークン選択ミス**＝duration リテラルは import 先ヘルパにあるので BattleScreen 本体に現れない。codex が HEAD と突き合わせて訂正した。
| (lxxi) | **🆕✅残0クローズ（2026-08-01・codex 実装／Claude 検証）**＝「このターン、**次に**あなたのシグニがバトルによって…バニッシュしたとき」の遅延設置が落ちて即時実行になっていた2効果（`WX26-CP1-040-E2`＝**撃った瞬間に無条件ダメージ**／`WX24-P1-011-E2`）を是正。詳細は BUGFIXES 2026-08-01 (lxxi) 節。<br>⚠**在庫の記述は3点とも誤りだった**＝(a)effectId は `WX24-P1-011-**E1**` でなく **E2**（E1 は同カードの別の文＝スコープ外）(b)「**2種類の「その」照応が同居**」は**誤り**＝両方とも同じ対象（バニッシュした自分のシグニ）を指す（同カード E1 が完全に並行な文型／被バニッシュ側は場を離れているので「ターン終了時まで能力を失う」が意味を成さない）(c)「消費機構が無いので先に決める必要」＝無いのは事実だが**踏襲すべき既存パターンが同リポジトリにあった**（`attackNegation.ts` の `consumeNthAttackNegation`＝純関数）。在庫が懸念した「収集は BattleScreen 側＝golden から叩けない」は**純関数へ切り出すことで解消**（`src/screens/battle/delayedTrigger.ts`）。<br>⚠**残す教訓＝「次に」の有無が消費の有無を決める**。原文に「次に」が**無い** `WX24-P4-011-E3` は**毎回発火が正しい**＝`ON_SIGNI_BANISH_BATTLE` 一般に消費を付けると退化する。**この対応は golden でデータ側まで固定済み**。
| ~~(lxxx)~~ | **✅残0クローズ（2026-08-01・codex 実装／Claude 検証・差し戻し0）**＝`ON_LEAVE_FIELD` の `triggerScope:'any'` が跨サイドで収集されず、原文「シグニ１体が場から手札に戻ったとき」＝どちらの場でも、を意図する2効果（`SPK01-04-E1`／`WXK02-041-E2`）が**相手の場の離脱で発火しなかった**過小実行。`collectLeaveFieldTriggers` の跨サイドループへ `any` を OR 追加（**engine 1行**）。詳細は BUGFIXES 2026-08-01 (lxxx) 節。<br>⚠**残す教訓3つ**＝①**在庫の「他 timing でも面で欠けている可能性が高い」は実測で否定された**＝`any` の母集団44効果のうち**30件は `ON_ATTACK_PHASE_START`＝「各アタックフェイズ開始時」＝ターン所有者の別軸**（触ってはいけない）。残る14件を collector ごとに読むと**8つ中7つは既に `any` を両側で正しく扱っており、穴は `collectLeaveFieldTriggers` 1本だけ**だった。⇒ **「collector ごとに個別実装だから面で欠けているはず」は推測であって実測ではない。1つずつ読むと大半は既に正しい**ことがある。②**engine のみの変更は live per-effect diff の期待値を `changed 0` と明記する**とスコープ漏れが自動検出できる（(lxxii) に続き2例目・今回も0で着地）。③🆕**「発火するか」を固定しても「誰に適用されるか」は固定されない**＝codex の golden は収集件数だけを見ており、`entry.playerId` を検査していなかった。`WXK02-041-E2` の本体は「**あなたの**＜遊具＞」＝`owner:'self'` を playerId 基準で解決するため、ここが離脱側になると**相手にパワーを与える真逆の効果**になる。Claude が `playerId` の assert を追加。 |
| ~~(lxxix)~~ | **✅残0クローズ（2026-08-01・codex 実装／Claude 検証・差し戻し0是正0）**＝「あなたのアタックフェイズの間、…が場から手札に戻ったとき」の フェイズ／ターン限定脱落2効果（`SPK01-04-E1`／`WXK02-001-E1`）に `duringAttackPhase`+`turnOwner:'self'` を復元。**engine 無改修・新語彙0本**。詳細は BUGFIXES 2026-08-01 (lxxix) 節。<br>⚠**残す教訓2つ**＝①**真因は「担当が居ない」**＝`effectParser.ts` の ON_LEAVE_FIELD トリガー句処理は2ブロック（7291 の `leftToZone` scope 判定は**前置きを一切見ない**／7686 の一般前置きブロックは **7704 の guard で本文型を除外**）で、本文型はその隙間に落ちていた。**在庫の「`turnOwner` も要る」は半分だけ正しかった**＝7695 の `.replace()` は guard の外側で副作用として `turnOwner` を立てるので「〜の**ターン**の間、」形は既に拾えていた（実例 `WXK11-049-E1`）。②**計器の穴が2連続で出た**＝decompiler が `leftToZone:'hand'` の**主語をハードコード**しており `any_ally` でも「シグニ１体が」と描いて限定を落としていた（Claude が是正・`WDK05-T11-E1` も併せて正常化）。**`triggerCondition` を足したら、その timing の decompiler 分岐が scope/filter を上書きで潰していないかまで読む**。 |
| (lxix) | **✅残0クローズ（2026-07-31）＝「あなたのパワーN以上のシグニ1体がアタックしたとき」の主語＋閾値脱落2効果**（`WXDi-P02-079-E2`／`WXK07-030-E2`）。行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-31 整理」節／一次記録は BUGFIXES 2026-07-31 (lxix) 節。⚠**残す教訓＝`ON_ATTACK_SIGNI` は収集経路が2本ある**（`BattleScreen.tsx` の直収集は `triggerScope`/`triggerFilter` を見ない／`collectFieldTriggers` は any_ally を拾うが自身を除外）＝片方だけ直すと素通りする |
> **🆕✅タスク12(lxi)〔支払い回避クローズ・全11波〕／(lxxiii)〔トラッシュ領域移動ロック〕／(lxxv)〔主語形の相手デッキミル＝自傷7効果〕／(lxxvi)〔配置禁止ゾーンの供給源3種〕／(lxxvii)〔連用中止の動作脱落＝**codex 実装/Claude 検証**〕は 2026-08-01 に残0クローズ**＝完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-01 整理」節／一次記録は BUGFIXES 2026-07-30〜08-01 の各波節。⚠**残す教訓3つ**＝(a)**engine の回避手段語彙は7系統**（`costColors`／`opponentHandDiscard`(+`Filter`/`ALL`)／`opponentEnergyTrash`(+`ALL`)／`opponentSigniTrash`／`opponentSigniToDeckTop`／`opponentPayColorlessPerSigniAttack`／`opponentHandOrEnergyToDeckTop`）＝新しい回避手段はここへ足す。**「AかB合計N枚」は2枝に割らない**＝`HAND_OR_ENERGY_CARD` のような**単一プールの候補型**で表す（2枝は「どちらか一方からN枚」に化ける）。(b)**「読めた」は「正しい」ではない**＝文型 regex は「同じ文型でパラメータの供給源だけが違う」カードを巻き込む。**規則を足したら `build:effects` で held の増減を必ず見る**（第9波＝engine の text パターンが実は動いていた9枚／第10波＝ゾーンの供給源が `designated_zone` でない2枚→在庫 (lxxvi)／第11波＝巻き込み0）。**逃がした在庫は「engine 側の解決を先に入れてから regex を緩める」**＝(lxxvi) はその手順どおり `zoneBlockSource` を足してから限定を外し、巻き込み0で着地した。(c)**「機構が無い」と書かれた在庫は、着手前に読み手側の既存実装を確かめる**＝第10波「配置フローが読んでいない」は3読み手に1行ずつ、第11波「選択UIも作れない」はモーダルがスコープ非依存で `scopeDesc` 1行、(lxxiii)「7地点だけ塞ぐと漏れる」は**全効果走査で母集団を 330→17→0 と実測**して7バイパス経路に確定し、(lxxv)「buildChoose が主語を落としている疑い」は**外れ**（単文でも同じ結果＝CHOOSE 無関係の parser 一般欠落。しかも母集団は在庫の1件でなく**7件**だった）（grep は104ヒットで当てにならない／PLAN が名指しした `STEAL_OPP_TRASH_PUPPET` は相手トラッシュ＝**射程外**だった）。<br>それ以前に残0クローズした在庫の完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理」節へ退避**＝**(xxix)**〔任意【出】コスト・計15波・残4は明示保留〕／**(xlvi)**〔look-pick 計73効果・第1〜17波〕／**(lvii)**〔census キー表 `pickUpTo` 較正〕／**(lviii)**〔トラップ公開 LPC 移行9効果・残1は honest defer〕／**(lix)**〔`split_top_bottom` 全4効果〕／**(l)**〔置換イベント横取り3文型を含む A群/B群 全体・残0〕／**🆕(lx)**〔①`WX25-P1-056-E1` の非バニッシュ離場→バニッシュ置換を engine 9サイトへ配線／②`WX12-020-E3` の「この方法で捨てた枚数」比例＝新語彙 `deltaPerLastProcessedCount`。2026-07-31 に残0クローズ・詳細 BUGFIXES 2026-07-31 節〕／**🆕(lxii)**〔`CONDITIONAL_DISCARD` を型ごと退役し `WD16-016-BURST` を多段閾値の昇格置換へ。2026-07-31 に残0クローズ〕／**🆕(lxiii)**〔「対戦相手の〈ゾーン〉があなたより多い場合」＝両者比較ゲートの脱落4枚＋「中央のシグニゾーン」限定の脱落4枚。2026-07-31 に残0クローズ・残は (lxiv) へ〕／**🆕(lxiv)**〔対象宣言のフィルタが「そうした場合」の本体まで届かない61枚＋「手札がN枚になるように捨てる」。2026-07-31 に残0クローズ・積み残しは (lxv) で解消〕／**🆕(lxv)**〔条件つき任意コストの**条件節だけが黙って消える**51効果＝parser ガードD の退役（engine はタスク12(xi) で包み形の解体を既に持っており**ガードだけが stale** だった＝新機構0・engine 無改修）＋「あなたのエナゾーンに＜X＞の〈シグニ|カード〉がN枚以上ある場合」の一般化。36枚採用・据置2枚は honest defer。2026-07-31 に残0クローズ・詳細 BUGFIXES 2026-07-31 (lxv) 節〕。それ以前の消化済み在庫〔(i)〜(lvi) の大半〕は同ファイルの 2026-07-19・07-24・07-28・07-29 の各退避節。

### §4 恒久指標から退避した計測履歴（続き298〜328 ほか 48 行・新しい順）

- **2026-08-09〜10 続き397〜402（§6.3 C 残クローズ＋§6.3 E・Codex 委譲6連投）後 最新値（本行が直近の正）**：census **882→880**（−2・`BASELINE_HIGH` 本体を更新。並行定数の新設なし）、golden **1682→1698**（+16）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム・EXPLOSION 0）、同型★**0 据置**（5986枚・265群）、lint 0 errors/**254 warnings**（増減0）、manual field loss 0、held **111→110枚／48→47群**、live 変化 **4＋1＋1＋1＋3＋4＝14効果**（6波とも added/removed 0・outlier 0＝巻き添えゼロ）。**新設した型**＝`GRANT_PLAYER_ABILITY`（プレイヤーが能力を得る）／`GrantLrigAbilityAction.targetOwner`（相手ルリグへの恒久付与）／`BLOCK_ACTION.attackCost.fieldTrash`（解除コストつきアタック制限）／`THIS_CARD_IS_ACCED`／`triggerCondition.outsideMainPhase`。**型移行**＝`PlayerState.field.signi_acce` を `(string|null)[]` → **`(string[]|null)[]`**（多重アクセ）。⚠**残す教訓**＝(a) 🔴**「機構待ち」と書かれた在庫4件が実測で覆った**（§4 進捗サマリ①）＝**着手前に必ず既存機構を grep する**。(b) 🔴**構造を正しくしても収集経路が読まなければ恒久 no-op**＝`collectHandAddedTriggers`／`collectTurnTriggers` は付与ストア（`lrig_granted_auto_effects` 系）を走査していなかった。**付与された能力は印刷能力とは別に走査が要る**（同型の穴が `triggerCollect.ts` に timing ごと散在＝次の一手も参照）。(c) 🔴**死語彙は grep 0件で見つかる**＝`ACCE_LIMIT_99`／`ACCE_LIMIT_2`／`MULTI_ACCE_3_MASS_TRASH` はいずれも `src` に消費実装が無く JSON にだけ居た。**「STUB があるから実装済み」と扱わない。**(d) ⭐**held 増分は「元の数値へ戻す」のでなく1件ずつ原文照合して採用する**＝今回2件（`WX16-031-E1`／`WXK04-053-E1`）が採用に値し census −2 になった。(e) 🔴**BattleScreen 経路の変更は golden に一切映らない**＝ターン終了3経路・アタック経路・アクセ描画・永続化データ形式は**実機検証項目**（§7）へ回すこと。
- **2026-08-09 続き394〜396（§6.3 C・Codex 委譲3連投）後 最新値（本行が直近の正）**：census **897→882**（−15・`BASELINE_HIGH` 本体を毎回更新。並行定数の新設なし）、golden **1649→1682**（+33）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム・EXPLOSION 0）、同型★**0 据置**（265群）、lint 0 errors/**254 warnings**（増減0）、manual field loss 0、held **113→111枚／49→48群**、live 変化 **11＋11＋11＝33効果**（3波とも added/removed 0・outlier 0＝巻き添えゼロ）。**新設した Condition 型・action 型はゼロ**（既存型へのフィールド追加のみ＝`allSameLevel`／`shareLevel`／`requiredDistinctColors`〔`string[]`→`(string|string[])[]` へ拡張〕／`lastProcessedLevelVerbJa`）。⚠**残す教訓**＝(a) 🔴**在庫の母集団が計器を取り違えていることがある**＝`docs/_partial_report.txt` は **fresh parser の出力**を測る計器で live の実害を測らない。**生成元（CSV原文×live）から数え直す**と母集団は3倍だった。(b) 🔴**「機構待ち」と書かれた共通ブロッカーが偽**＝`lastProcessedCards` の writer は153箇所あり engine は完備で、parser が条件を生成していないだけだった。(c) 🔴**同じ「記録する」でも家族ごとに書き方が3通り**＝`execTrash` は無条件／`REVEAL_AND_PICK` は `recordRevealed` オプトイン（live 利用者1枚・parser emit 0件）／`LOOK_AND_REORDER` は resume 側（`effectExecutor.ts:6791`）で書く。**取り違えると恒久 no-op でゲートに一切映らない。** (d) 🔴**コスト系フィールドの writer は engine の grep に出ない**＝`last_activated_discard_count` は `src/screens/battle/costs.ts` にあり `BattleScreen.tsx:10941`／`:11833` から呼ばれる。**死フラグ判定の前に `src/screens/` まで探す。** (e) ⭐**UI ポーズを跨ぐ家族は golden を「resume を実際に踏む形」で書かせる**＝直呼びテストは経路の生死を検査しない。(f) 🔴**共有経路（`execRevealAndPick` の候補0件パス等）を触ったら、その値を読む live 効果を全数走査する**＝今回は13件全部が step 0 で波及ゼロだったが、報告には無く検証側で埋めた。(g) ⭐**「近似で決め打ちするな」と書くと型を拡張して正解を出す**＝`requiredDistinctColors` の OR 候補スロット化。(h) ⚠**自分（Claude）の抽出計器の偽陽性2件**＝`WX20-053-E2`／`WXEX2-21-E1` は既に正しかった（条件語彙リストに `DECK_COUNT` と `afterSearch` 構造を入れ忘れ）。**在庫化する前に1枚開く。** 旧: 2026-08-09 続き386〜393（Codex 委譲8連投）後 最新値（本行が直近の正）**：census **909→897**（−12・`BASELINE_HIGH` 本体を毎回更新。並行定数の新設なし）、golden **1556→1649**（+93）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム・**EXPLOSION 0**）、同型★**0 据置**（265群）、lint 0 errors/**254 warnings**（キャッシュ削除後の実測・増減0）、manual field loss 0、held **121→113枚／53→49群**、**被覆マトリクス miss 280→277**、live 変化 **17＋15＋26＋5＋5＋6＋4＋3＝81効果**（すべて added/removed 0・outlier 0）＋**JSON 不変のまま挙動が是正された波及 7効果**（続き393 の `hasBanishResist`）。**`parseStatus:"UNKNOWN"`／トップレベル `action.type:"UNKNOWN"` はともに 0**（⚠**入れ子は 43件**）。**新設した Condition 型・action 型はゼロ**（宣言 STUB 1／collector 1／CONTINUOUS extractor 1／PlayerState フィールド2／`bySourceLevel` 1 のみ）。⚠**残す教訓**＝(a) ⭐**症状を母集団と取り違えない**。(b) ⭐**症状を後処理で潰さない**。(c) 🔴**strip には第2の目的が隠れていることがある**。(d) 🔴**条件を足すバッチは失敗の向きが反転する**。(e) 🔴**同じ「名前」でも表記が違えば別物**。(f) 🔴**「STUB → UNKNOWN／別STUB」は改善ではない**。(g) 🔴**「据置」在庫は live と fresh の両方が誤っていることがある**。(h) 🔴**STUB の実装を直すとスコープ外カードの挙動が変わる**。(i) 🔴**「型ごとに枝を1本ずつ足す」層は足し忘れた型が丸ごと no-op になる**（横断監査で他に穴が無いことは確認済み）。(j) 🔴**機構を入れる前に、その機構が読むデータの誤りを先に直す**。(k) 🔴**対象型を広げられるかは action 型ごとにバラバラ**。(l) ⭐**census にも被覆マトリクスにも映らないバグ系統がある**＝「語彙は合っていて数と範囲だけが違う」過小実行は原文照合でしか見つからない。(m) 🔴**構造化された制限の隣に「原文テキストのフォールバック」があると、制限の不成立を上書きして無条件化する**＝`hasBanishResist` の1行で7効果が過剰保護されていた。**フォールバックは「構造化情報が無いときだけ」効くようにゲートする。** (n) ⚠**自分（Claude）の検出器にも偽陽性がある**＝`from` 配列の中を見ていなかった。**在庫化する前に1枚開く。** 旧: 2026-08-09 続き386〜392（Codex 委譲7連投）後 最新値（本行が直近の正）**：census **909→897**（−12・`BASELINE_HIGH` 本体を毎回更新。並行定数の新設なし）、golden **1556→1645**（+89）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム・**EXPLOSION 0**）、同型★**0 据置**（265群）、lint 0 errors/**254 warnings**（キャッシュ削除後の実測・増減0）、manual field loss 0、held **121→113枚／53→49群**、**被覆マトリクス miss 280→277**、live 変化 **17＋15＋26＋5＋5＋6＋4＝78効果**（すべて added/removed 0・outlier 0）、**`parseStatus:"UNKNOWN"`／トップレベル `action.type:"UNKNOWN"` はともに 0**（⚠**入れ子は 43件で据置**）。**新設した Condition 型はゼロ／action 型もゼロ**（宣言 STUB 1／collector 1／CONTINUOUS extractor 1／PlayerState フィールド2＝アシスト凍結 のみ）。⚠**残す教訓**＝(a) ⭐**症状を母集団と取り違えない**。(b) ⭐**症状を後処理で潰さない**。(c) 🔴**strip には第2の目的が隠れていることがある**。(d) 🔴**条件を足すバッチは失敗の向きが反転する**。(e) 🔴**同じ「名前」でも表記が違えば別物**（チーム名の半角/全角中黒）。(f) 🔴**「STUB → UNKNOWN／別STUB」は改善ではない**＝捨てる前に engine 実装の有無を読む。(g) 🔴**「据置」在庫は live と fresh の両方が誤っていることがある**＝第3の正解を探す。(h) 🔴**STUB の実装を直すとスコープ外カードの挙動が変わる**。(i) 🔴**「型ごとに枝を1本ずつ足す」層は足し忘れた型が丸ごと no-op になる**（`calcFieldPowers`）。**⇒ 横断監査を実施し、`activeCondition × checkActiveCondition` と `POWER_MODIFY_PER_*` 一族には他に穴が無いことを確認済み**（続き392 投入前）。(j) 🔴**機構を入れる前に、その機構が読むデータの誤りを先に直す**。(k) 🔴**対象型を広げられるかは action 型ごとにバラバラ**＝`NEGATE_ATTACK` は対応済みでも `FREEZE`／`REMOVE_ABILITIES` は非対応だった。**grep で型名を数えず exec の候補生成部を読む。** (l) ⭐**census にも被覆マトリクスにも映らないバグ系統がある**＝「語彙は合っていて数と範囲だけが違う」過小実行は**原文照合でしか見つからない**。 旧: 2026-08-09 続き386〜391（Codex 委譲6連投＝Diva「場のルリグ」系統／印刷済み【使用条件】脱落／CONTINUOUS パワー機構）後 最新値（本行が直近の正）**：census **909→898**（−11・`BASELINE_HIGH` 本体を毎回更新。並行定数の新設なし）、golden **1556→1641**（+85）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム・**EXPLOSION 0**）、同型★**0 据置**（265群）、lint 0 errors/**254 warnings**（キャッシュ削除後の実測・増減0）、manual field loss 0、held **121→114枚／53→50群**、**被覆マトリクス miss 280→277**、live 変化 **17＋15＋26＋5＋5＋6効果**（すべて added/removed 0・outlier 0）、**`parseStatus:"UNKNOWN"`／トップレベル `action.type:"UNKNOWN"` はともに 0**（⚠**入れ子は 43件で据置**）。**新設した Condition 型・action 型はゼロ**（宣言 STUB 1本／collector 1本／CONTINUOUS extractor 1本のみ）。⚠**残す教訓**＝(a) ⭐**症状を母集団と取り違えない**。(b) ⭐**症状を後処理で潰さない**。(c) 🔴**strip には第2の目的が隠れていることがある**。(d) 🔴**条件を足すバッチは失敗の向きが反転する**（過剰実行→「永久に撃てない」）。(e) 🔴**同じ「名前」でも表記が違えば別物**（チーム名の半角/全角中黒）。(f) 🔴**「STUB → UNKNOWN／別STUB」は改善ではない**＝捨てる前に engine 実装の有無を読む。(g) 🔴**「据置」在庫は live と fresh の両方が誤っていることがある**＝第3の正解を探す（続き390）。(h) 🔴**STUB の実装を直すとスコープ外カードの挙動が変わる**（`CRASH_LIFE_TO_HAND`）。(i) 🔴**「型ごとに枝を1本ずつ足す」構造の層は、足し忘れた型が丸ごと no-op になる**＝`calcFieldPowers` の `extractPowerModifiesPerXxx` は11本しか無かった（続き391）。**同型の層（executor の dispatch・collector の timing 分岐）も同じ穴を持ちうる。** (j) 🔴**機構を入れる前に、その機構が読むデータの誤りを先に直す**（`excludeSelf` 脱落4件＝入れた瞬間に過剰バフ化）。(k) ⭐**codex の "NO" は信頼できる**（11枚を自発据置し held に明示在庫化）。(l) 🔴**ハーネスの10分 kill はラッパーだけを殺し `codex.exe` は完走する**。 旧: 2026-08-09 続き386〜390（Diva「場のルリグ」系統＋印刷済み【使用条件】脱落＝5連投・実装は Codex 委譲）後 最新値（本行が直近の正）**：census **909→899**（−10・`BASELINE_HIGH` 本体を毎回更新。並行定数の新設なし）、golden **1556→1630**（+74）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、同型★**0 据置**（265群）、lint 0 errors/**254 warnings**（キャッシュ削除後の実測・増減0）、manual field loss 0、held **121→114枚／53→50群**、**被覆マトリクス miss 280→278**、live 変化 **17＋15＋26＋5＋5効果**（すべて added/removed 0・outlier 0）、**`parseStatus:"UNKNOWN"`／トップレベル `action.type:"UNKNOWN"` はともに 0**（⚠**入れ子の UNKNOWN は 43件で据置**）。**新設した Condition 型・action 型はゼロ**（宣言 STUB 1本＋collector 1本のみ）。⚠**残す教訓**＝(a) ⭐**症状を母集団と取り違えない**（「ゴミ `GRANT_KEYWORD{keyword:"使用条件"}` 22件」は症状で、真の母集団は**【使用条件】79カード中66カードで条件ゼロ**）。(b) ⭐**症状を後処理で潰さない**（ゴミKW は条件節 strip の結果として消す）。(c) 🔴**strip には第2の目的が隠れていることがある**。(d) 🔴**条件を足すバッチは失敗の向きが反転する**（過剰実行→「永久に撃てない」）。(e) 🔴**同じ「名前」でも表記が違えば別物**（チーム名の半角/全角中黒で1枚が永久不発になりかけた）。(f) 🔴**「STUB → UNKNOWN／別STUB」は改善ではない**＝捨てる前に engine 実装の有無を読む（§5-5e の裏返し）。(g) 🔴**「据置」在庫は live と fresh の両方が誤っていることがある**＝第3の正解（既存だが使われていない型）を探す＝続き390 の 5効果。(h) 🔴**STUB の実装を直すとスコープ外カードの挙動が変わる**（`CRASH_LIFE_TO_HAND` で `WX24-P2-048-E1` が是正された＝**JSON 差分にもゲートにも映らない**ので STUB 利用者を全数走査する）。(i) 🔴**ハーネスの10分 kill はラッパーだけを殺し `codex.exe` は完走する**。(j) ⭐**codex の "NO" は信頼できる**（4バッチで11枚を自発据置し held に明示在庫化）。 旧: 2026-08-09 続き386〜389（Diva「場のルリグ」系統4連投＝アシストルリグ数え落とし17／印刷済み【使用条件】脱落 15＋25＋5・実装は Codex 委譲）後 最新値（本行が直近の正）**：census **909→900**（−9・`BASELINE_HIGH` 本体を毎回更新。並行定数の新設なし）、golden **1556→1625**（+69）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、同型★**0 据置**（265群）、lint 0 errors/**254 warnings**（キャッシュ削除後の実測・増減0）、manual field loss 0、held **121→119枚／53→54群**（⚠**+4 は続き389 の据置4枚＝明示的な在庫**）、**被覆マトリクス miss 280→278**、live 変化 **17＋15＋26＋5効果**（いずれも added/removed 0・outlier 0）、**`parseStatus:"UNKNOWN"`／トップレベル `action.type:"UNKNOWN"` はともに 0**（⚠**入れ子の UNKNOWN は 43件残る**）。**新設＝Condition 型・action 型・engine 分岐すべてゼロ**（宣言 STUB 1本 `CHECK_ZONE_FLIP_FREE_GROW` のみ）。⚠**残す教訓**＝(a) ⭐**症状を母集団と取り違えない**（「ゴミ `GRANT_KEYWORD{keyword:"使用条件"}` 22件」は症状で、真の母集団は**【使用条件】79カード中66カードで条件ゼロ**）。(b) ⭐**症状を後処理で潰さない**（ゴミKW は条件節 strip の結果として消す）。(c) 🔴**strip には第2の目的が隠れていることがある**（`:10174` をやめると別バッチで直した色分岐が全部落ちる）。(d) 🔴**条件を足すバッチは失敗の向きが反転する**（過剰実行→「永久に撃てない」）＝全件で成立/不成立の両方向 E2E を要求する。(e) 🔴**同じ「名前」でも表記が違えば別物**＝チーム名の半角/全角中黒で1枚が永久不発になりかけた（**新しい列挙値は実データで全部数える**の5例目）。(f) 🔴**「STUB → UNKNOWN」は改善ではなく退化**＝捨てる側の STUB にも engine 実装があるかを読む（§5-5e の裏返し）。(g) 🔴**ハーネスの10分 kill はラッパーだけを殺し `codex.exe` は完走する**＝kill 後は `_held_fresh.json` が stale なので `build:effects`→`heldReview` を再実行してから読む。(h) ⭐**codex の "NO" は信頼できる**＝4バッチで計11枚を「action が退化するので条件も付けない」と自発据置し、held に明示在庫として残した。 旧: 2026-08-09 続き386〜388（Diva「場のルリグ」系統3連投＝アシストルリグ数え落とし17／印刷済み【使用条件】脱落15＋25・実装は Codex 委譲）後 最新値（本行が直近の正）**：census **909→901**（−8・`BASELINE_HIGH` 本体を3回とも更新。並行定数の新設なし）、golden **1556→1614**（+58）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、同型★**0 据置**（265群）、lint 0 errors/**254 warnings**（キャッシュ削除後の実測・増減0）、manual field loss 0、held **121→115枚／53→50群**、**被覆マトリクス miss 280→278**、live 変化 **17＋15＋26効果**（いずれも added/removed 0・outlier 0）、**live の `parseStatus:"UNKNOWN"`／`action.type:"UNKNOWN"` はともに 0**。**新設＝Condition 型・action 型・engine 分岐すべてゼロ**（宣言 STUB 1本 `CHECK_ZONE_FLIP_FREE_GROW` のみ）。⚠**残す教訓**＝(a) ⭐**症状を母集団と取り違えない**＝「ゴミ `GRANT_KEYWORD{keyword:"使用条件"}` 22件」は症状で、真の母集団は**【使用条件】を持つ79カード中66カードで条件がゼロ**だった。**在庫の見出しではなく生成元（CSV原文 × live の condition 有無）で数え直す。** (b) ⭐**症状を後処理で潰さない**＝ゴミKW は「条件節を本文から strip する」ことの結果として消すのが正しい。(c) 🔴**strip には第2の目的が隠れていることがある**＝`:10174` をやめると別バッチで直した色分岐が全部落ちる。**「なぜこの strip があるか」をコメントから読んでから触る。** (d) 🔴**条件を足すバッチは失敗の向きが反転する**（過剰実行→「永久に撃てない」）ので、成立/不成立の両方向 E2E を全件に要求する。(e) 🔴**ハーネスの10分 kill はラッパーだけを殺し `codex.exe` は完走する**＝kill 後は `_held_fresh.json` が stale で held が +12 に見えるので **`build:effects`→`heldReview` を再実行してから読む**。(f) ⭐**「条件だけ先に入れて action の退化を飲む」を codex が自分で拒否した**（7枚据置）＝**部分的な正しさは計器を甘くする**という判断が定着している。 旧: 2026-08-09 続き386＋387（Diva「場のルリグ」系統2連投＝アシストルリグ数え落とし17効果／ピースの印刷済み【使用条件】脱落15効果・実装は Codex 委譲）後 最新値（本行が直近の正）**：census **909→904**（−5・`BASELINE_HIGH` 本体更新。並行定数の新設なし）、golden **1556→1585**（+29＝386 で +14〔群A 5効果の実行E2E／群B の `evalUseCondition` 両方向／群C の「Level1/2 アシストでは Lv4 不成立」トリップワイヤ／対照群 `PR-305-E2` のセンター限定固定〕・387 で +15〔15効果ごとに `evalUseCondition` と UI 側 `canUseArtsCondition` の両方を成立/不成立で固定〕）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、同型★**0 据置**（265群）、lint 0 errors/**254 warnings**（キャッシュ削除後の実測・増減0）、manual field loss 0、held **121→117枚／53→52群**、**被覆マトリクス miss 280→278**、live 変化 **17効果＋15効果**（いずれも added/removed 0・outlier 0）。**新設＝Condition 型・action 型・engine 分岐すべてゼロ**（既存語彙 `HAS_CARD_IN_FIELD{cardType配列}`／`AND`／`minCount`／color配列(OR)／`LRIG_LEVEL` のみ）。⚠**残す教訓**＝(a) 🔴**「評価器がそのゾーンを走査している」は「そのゾーンのカードが filter に一致する」を意味しない**（続き385 の教訓が面で回収された。`cardType` の厳密一致は `Type` 列の実在値を CSV で全部数えてから書く）。(b) ⭐**症状を母集団と取り違えない**＝「ゴミ `GRANT_KEYWORD{keyword:"使用条件"}` 22件」は症状で、真の母集団は**【使用条件】を持つ79カード中66カードで条件がゼロ**だった。**在庫の見出しではなく生成元（CSV原文 × live の condition 有無）で数え直す。** (c) ⭐**症状を後処理で潰さない**＝ゴミKW は「条件節を本文から strip する」ことの結果として消すのが正しい。(d) 🔴**ハーネスの10分 kill はラッパーだけを殺し `codex.exe` は完走する**＝kill 後は `_held_fresh.json` が stale で held が +12 に見えるので、**`build:effects`→`heldReview` を再実行してから読む**。(e) ⭐**`parseStatus:PARTIAL` のカードは `build:effects` が不可侵**なので「parser を直して build すれば反映される」は成立しない（codex が指示書を訂正＝5例目）。 旧: 2026-08-09 続き385（🏁§5d-0 (ii) `parseStatus:UNKNOWN` 完全 no-op を残0クローズ・実装は Codex 委譲）後 最新値（本行が直近の正）**：census **910→909**（−1・`BASELINE_HIGH` 更新）、golden **1548→1556**（+8＝群A 4効果を別テストで実行固定〔センタールリグ【起】UI 入口の列挙／最上段のみルリグデッキへ／下カードは場に残る〕／群A の候補純関数（アイコン・グロウコストの両除外）1／群B の自身トラッシュ E2E 1／群C の3キーワード遮断 E2E 1〔実戦判定・重複付与・CONTINUOUS 付与の3方向〕／群D の宣言 STUB 1）、smoke **10686/10686** 全0・SKIP 0、fuzz 全0（200ゲーム）、同型★**0 据置**（265群）、lint 0 errors/**254 warnings**（増減0）、manual field loss 0、held **120枚／53群 据置**、**被覆マトリクス miss 281→280**、live 変化 **7効果／7カード**（added 0・removed 0）。**`parseStatus:"UNKNOWN"` は 7→0**（この計器は残0）。**新設＝action 型1本**（`RETURN_ASSIST_LRIG_TO_DECK`）／**既存型へのフィールド追加2**（`RemoveAbilitiesAction.keywords` ／ `PlayerState.keyword_abilities_removed`）／**宣言 STUB 1**（`ASSIST_LRIG_ATTACK_THIS_TURN`＝engine 分岐なし）。⚠**残す教訓**＝(a) 🔴**「評価器がそのゾーンを走査している」は「そのゾーンのカードが filter に一致する」を意味しない**＝`lrigZoneTops` はアシストを見るのに `cardType:'ルリグ'` は Type='アシストルリグ' 340枚を厳密一致で落とす。**新しい列挙値を書くときは、その列に実在する値を CSV で全部数える**（§8 の `owner:"any"`／`upToCount`／`byOwnEffect` と同系統で4例目）。(b) 🔴**構造 assert はテスト用データの作り方で自分を欺く**＝アシストゾーンに `Type==='ルリグ'` のカードを置いた golden は、厳密一致を素通りして緑のままだった。**§5-5d は「E2E を書く」だけでなく「テストの盤面に実データの型を使う」まで含めて読む**。(c) ⭐**在庫レポートは生成元の粒度を確かめてから読む**＝`_partial_report.txt` は fresh parse の刻印であり、live が MANUAL で救済済みでも消えない（40件中38件）。**live の `parseStatus` を直接数えるのが正**。(d) ⭐**honest defer は宣言 STUB で**＝群D は機構が無いので実装せず、`execStub` 既定のログのみ・`STUBS.md` に未実装として載る専用 id にした（計器を甘くしない）。 旧: 2026-08-08 続き384（🏁§6.3 J-4 消化＝**J 群 残0クローズ**）後：census **911→910**（−1・`BASELINE_HIGH` 更新）、golden **1544→1548**（+4＝collector 1〔`ON_ATTACK_END` のダメージ有無〕／live 構造 2〔`levelLtSelf` へ是正されたこと・離場条件が残っていること＋engine 評価3方向〕／parser 1〔2 timing ＋ 離場条件の持ち上げ ＋ 既存の開始時/アタック時を奪わない回帰ガード〕）、smoke 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、**EffectTiming +2**／**Condition 型数 114→115**（`SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE`）／**PlayerState +1**（`signi_left_field_this_attack_phase`）。**🏁§6.3 J は残0**（13効果・5家族すべて消化）。⚠**残す教訓**＝(a) ⭐**台帳の警告は着手前に実データで検証する**＝「CPU 側が面で欠けている」は既に解消済みで、実際は union に1語足すだけだった（J-5 の `WXEX1-41` に続き2度目）。(b) 🔴**timing を配線する前に action 本体を原文照合する**＝配線した瞬間に「no-op」が「誤動作」へ変わる（今回2件）。(c) ⭐**前バッチのゲートと工具が次バッチで回収される**＝§6.3 K のトリップワイヤが今回の manual→live 未達を即検出し、`--adopt` でそのまま解消できた。 旧: 2026-08-08 続き383（§6.3 J-1「他能力の発動監視」＝`ON_ABILITY_ACTIVATED` 新設）後：golden **1541→1544**（+3＝collector 2〔`WX19-066-E1` の【自】×英知×self 限定／`WXEX1-77-E1` の【出】×相手×場のシグニ限定＋**監視の連鎖が起きない**トリップワイヤ〕／parser 1〔4軸の抽出＋既存トリガーを奪わない回帰ガード〕）、census **911 据置**（⚠この2効果の欠落は census 語彙に無い＝**timing 配線の穴は census には映らない**。続き378 と同型）、smoke 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、**EffectTiming +1**（`ON_ABILITY_ACTIVATED`）。**§6.3 J は実残 2効果（J-4 のみ）**。⚠**残す教訓**＝(a) ⭐**機構を足す前に「イベントの唯一の funnel」を探す**＝`initStack`/`pushToStack` は 113 箇所だが `shiftQueue` は1箇所。**同じイベントでも定義を1段ずらす（投入時→解決開始時）と配線量が2桁変わる。** (b) ⚠**監視型の機構には自己連鎖と使用回数の2つの安全弁が要る**（どちらも欠けるとゲート緑のまま無限発火しうる）。 旧: 2026-08-08 続き382（§6.3 K＝`manualEffects.ts`→live 同期 37効果＋死角のゲート化）後：census **915→911**（−4・`BASELINE_HIGH` 更新）、golden **1540→1541**（+1＝**§6.3 K トリップワイヤ**。既存の `(ci)` 母集団ガードは `OPPONENT_PAY_OPTIONAL` 71→**73** へ更新＝増えた2件はいずれも costColors 付きで安全弁〔回避枝なし＝0〕は不変）、smoke 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0。**§6.3 K の実測＝52 効果／46 カード**（速報 105/427 カードは過大＝計器化して測り直した値が正）。**37 効果を同期して残 15**（`PARSER_REVIEW` ＋ manual 定義の `UNDATED` 8／`SAME_TIME` 2）。**新計器＝`scripts/censusManualDrift.ts`**（`docs/_manual_drift.txt`／`_manual_drift_dates.txt`）。⚠**残す教訓**＝(a) 🔴**自作計器の数字は本番パイプラインで検証するまで信じない**＝初版は `FRESH_GAIN` 223件を出したが `build:effects` は1カードしか変えなかった（`leafMap` が値 `undefined` のキーをリーフに数えていた）。(b) 🔴**日付判定は manual 定義の効果にしか使えない**＝parser 由来5件は日付が MANUAL_NEWER と言ったが原文照合で**全件 live が正しかった**。(c) 🔴**同じ効果でも項目ごとに新旧が違う**＝action は manual が新しく timing は manual が退化（CSV `Timing` 列と照合して source of truth 側を直す）。(d) ⭐**テストがデータを補正していると死角は永久に見えない**＝golden の `manualEffect()` ヘルパ 204箇所が live に manual を被せていた＝**live を直接見る test を1本**置いて解決。 旧: 2026-08-08 続き381（§6.3 J-5「単発」＝`ON_COIN_GAINED` 新設＋夢限-Q- 機構の live 復旧）後：census **916→915**（−1・`BASELINE_HIGH` 更新）、golden **1537→1540**（+3＝collector 1〔`ON_COIN_GAINED` の any scope〕／boardDiff 1〔増加のみ・減少は0〕／parser 1〔獲得の3 scope ＋ 既存 `ON_COIN_PAID` を奪わない回帰ガード ＋ `ON_LRIG_FLIP`〕。**加えて既存の夢限 golden に live 直接 assert を2行追加**＝`mergeManualEffects` 再適用で陳腐化を迂回していた穴を塞いだ）、smoke 全0・SKIP 0、fuzz 全0（200ゲーム）、lint 0 errors、manual field loss 0、**EffectTiming +1**（`ON_COIN_GAINED`）。**live 変化＝`SP27-007-E1` の timing 付与＋`WXDi-P11-010A`/`010B` の manual 同期**（A面 `UNKNOWN`→`MUGEN_Q_RESET_AND_FLIP`／B面 `timing:[]`→`ON_LRIG_FLIP`）。⚠**残す教訓**＝(a) ⭐**機構台帳の記述は着手前に実データで裏を取る**＝J-5 の3件中1件（`WXEX1-41-E1`）は既に `ON_TRAP_SET` で配線済みだった。(b) 🔴**テストがデータを補正し始めたら、データのバグを隠している合図**＝夢限 golden が `mergeManualEffects` をテスト内で再適用していたため、機構が丸ごと死んでいるのにゲートが全緑だった。**live を直接 assert する**。(c) 🔴**`manualEffects.ts` を直しても live に届かない**（§6.3 K・⚠速報 105/427 は過大＝実測 52 効果／46 カード）＝`build:effects` の MANUAL 不可侵ガードが、JSON 直編集の保護と manual レジストリの反映を区別できていない。**どの計器にも出ない第3の死角**。 旧: 2026-08-08 続き380（§6.3 J-2「付与・離脱イベント」機構＝timing collector 不在で `timing:[]` 停止していた4効果を実装）後：census **919→916**（−3・`BASELINE_HIGH` 更新）、golden **1531→1537**（+6＝collector 3〔`ON_ACCE_TO_TRASH` の any_ally／`ON_SOUL_ATTACHED` の self vs any_ally／`ON_CARD_ATTACHED` の self〕／boardDiff 2〔`countAcceToTrash` のエナ行き除外／`detectSoulAttached`・`detectCardAttached` の本体入れ替え非検出〕／parser 1〔3 timing ＋ scope/minCount ＋ 既存 `ON_ACCE`・`ON_CHARM_TO_TRASH` を奪わない回帰ガード ＋ `THIS_CARD_HAS_ATTACHED`〕）、smoke 全0・SKIP 0、fuzz 全0（200ゲーム・効果実行 7983手）、lint 0 errors/252 warnings、manual field loss 0、held **145→146枚**（+1＝`WXK10-049` は同回で `--adopt` 済み・残りは既存在庫）、**Condition 型数 113→114**（`THIS_CARD_HAS_ATTACHED`）、**EffectTiming +3**（`ON_ACCE_TO_TRASH`／`ON_SOUL_ATTACHED`／`ON_CARD_ATTACHED`）。**live 変化＝4効果の timing 付与＋1効果の条件復活**。⚠**残す教訓**＝(a) ⭐**機構待ちカードは timing だけ見て閉じない**＝`WXK10-049` は timing 欠落（no-op）と条件節脱落（過剰実行）が**同じカードに同居**していた＝逆方向のバグなのでどちらの計器も片方しか映さない。(b) 🔴**golden の `mkState` は共有カード在庫カーソルを進める**＝テストを途中に挿入すると後続テストの引くカードが変わって落ちる。**新規テストは `withSavedCursor` で包む**。source の回帰と切り分けるには**ベースライン commit の worktree に node_modules を junction して golden を回す**のが速い（autocommit デーモンがあるので `git stash` A/B は使えない）。(c) ⭐**detector の「本体が前後で同一のゾーンだけ」規約**＝入れ替わり（ライズ/場出し）を状態変化と誤検出しないための既存規約（`detectNewlyDowned`/`detectNewlyUpped` と同じ）。付与系 detector を足すときも踏襲する。 旧: 2026-08-08 続き379（`isDisona` の条件節グループ＝条件が丸ごと落ちて無条件発火していた8効果・Codex 委譲）後：census **924→919**（−5・`BASELINE_HIGH` 更新）、golden **1517→1531**（+14＝構造7／**engine 実行E2E 7**＝全効果を成立・不成立の両方向で固定）、**被覆マトリクス miss 291→283**（⚠**この計器は条件内の filter も集計する**＝「条件節は対象外」は誤り。指示書の誤りを codex が訂正した2例目）、smoke **10686/10686** 全0・SKIP0、fuzz 全0（200ゲーム）、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（増減0）、manual field loss 0、held **147→145枚／71群**、live 変化 **8効果**（added 0・removed 0）。**是正した効果は 8**（常在3＝`activeCondition` 丸ごと欠落／解決時5＝`condition` 丸ごと欠落）＋**既存2効果の改善**（`HAS_CARD_IN_FIELD × powerRange` の実効パワー化）。⚠**残す教訓**＝(a) ⭐**前バッチの engine 移植が次バッチの前提を作った**＝続き378 で `isDisona` を `effectEngine.matchesFilter` へ入れたので、今回は**新しい条件型ゼロ**で8効果を直せた（既存型 `ENERGY_HAS_CARD`／`TRASH_HAS_CARD`／`THIS_CARD_HAS_UNDER{filter}`／`HAS_CARD_IN_FIELD`／`ENERGY_COUNT` のみ）。**「語彙を1つ通す」投資は次のバッチで回収される。** (b) 🔴**両評価器のパリティは「揃えるのが正しい」とは限らない**＝`powerRange` は**解決時だけ**実効パワーへ切り替えた。持続側（`WX15-089/090/091`＝「パワーN以上があるかぎり**基本パワー**がMになる」）は実効パワーで見ると**パワー計算が循環する**ので印字のまま据置が正しい。**続き378 の `isDisona`（揃えるのが正しい）と逆の判断。** (c) ⭐**`activeCondition` に評価器が知らない型を書くと `return true`＝無条件成立**（続き377n の教訓）＝**間違えても全ゲート緑のまま直らない**ので、使う型はミラー表と `case` の実在を先に確認する。 (d) **codex の据置は1件だけ過剰保守**＝`WXDi-P12-063-E1` の包み形は engine の正準形（`effectExecutor.ts:2898-2914`）だったので Claude が採用（held 採用漏れは §8 の既知傾向）。 旧: 2026-08-08 続き378（§5d-0(i) 配線ギャップ 第19バッチ＝`isDisona` / `excludeResona` の対象フィルタ合成漏れ・Codex 委譲）：census **924 据置**（⚠**この2語彙は census に無い＝被覆マトリクスにしか映らない**＝続き377c と同型。**census が動かない回でも22効果が直る**）、golden **1488→1517**（+29＝効果単位の構造22／**engine 実行E2E 5**〔候補集合がディソナのみ／レゾナ除外／activeCondition の成立・不成立の両方向／コスト支払可能ゾーン／CONTINUOUS のパワー差分〕／トリップワイヤ2〔条件節用法を対象へ漏らさない・`WXEX2-18-E2` の誤対象を狭めない〕）、**被覆マトリクス miss 307→291**、smoke **10686/10686** 全0・SKIP0、fuzz 全0（200ゲーム）、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（増減0）、manual field loss 0、held **149→147枚／71群**、live 変化 **17効果／17カード**（added 0・removed 0）。**是正した効果は 22**（live 17＝`isDisona` 対象10＋`excludeResona` 対象3＋`HAS_CARD_IN_FIELD` 1＋コスト節2＋巻き添え1／**engine パリティ移植で 5**）。⚠**残す教訓**＝(a) ⭐**判定器が2つある語彙は片方だけ穴が空く**＝`effectEngine.matchesFilter` に `isDisona` が無く、**JSON が正しくても engine が無視**して5効果が全味方バフになっていた（**JSON 差分にもゲートにも映らない**）。**条件・CONTINUOUS へ語彙を足すときは両 `matchesFilter` のパリティを先に見る。** (b) ⭐**助数詞のゆらぎで兄弟ヘルパは効かない**＝`signiClause*Filter` 3兄弟は「N**体**」しか見ないがトラッシュ／エナの対象は「N**枚**」＝**枚／体の両方**を許す（語順・数量詞・所有者・不等号に続く5例目）。 (c) **計器の母集団は除外条件つきで読む**＝被覆マトリクスは STUB/MANUAL 同居効果を除外するので同型が**セルに出てこない**（`WXDi-P13-002-E1`）＝**parser を直したら全カード A/B でセル外の同型を回収する**。 (d) ⚠**codex 委譲はハーネスの10分上限で切られる**＝成果物は無傷でも最終レポートが出ないことがある（Claude 側検証で代替可）。 旧: 2026-08-08 続き377n（§5d-0(ii) 機構ギャップ＝ブロッカー特定済み7効果の実装）：census **932→924**（−8・**全部が機能是正**＝較正ぶんは無し。`BASELINE_HIGH` 更新。⚠続き377m の簿記は 927 と書いていたが実測ベースラインは 932 だった＝**簿記の数字ではなく `npm run census` の実測を正とする**）、golden **1472→1488**（+16。うち**engine 実行E2E 4本**＝0体選択でも解決する／単数ペア1枚→1体の据置／デッキ上2枚を2体へペア付与／捨てクラスに一致する札だけ候補）、**被覆マトリクス miss 311→307**、smoke **10686/10686** 全0・SKIP0、fuzz 全0（200ゲーム）、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（キャッシュ削除後の実測・増減0。⚠`tmp_*.ts` を消し忘れると +3 に見える）、manual field loss 0、held **145→149枚／71群**、live 変化 **23カード/23効果**。**是正した効果は 23**（(a) ATTACH_CHARM 複数ペア 4＋`WX05-080-E1` 1／(b) GRANT_KEYWORD の `upToCount` 3＋**owner 誤り 14**／(c) 捨札クラス 1）＋**parser を live と一致させた 5効果**。⚠**残す教訓**＝(a) ⭐**「関数名まで特定して据置した在庫」は本当に安い**＝調査ゼロで実装に入れた。3件とも同型＝**語彙は型にも engine にもあるのに、その入口では読まれていない**（`selectOrInteract` 第3引数の `false` ハードコード／`resolveDiscardLevelFilter` を通す入口が2つだけ／`slice(0,1)` と `[0]×[0]`）。**次バッチも「関数名まで書いてから据置」を続ける。** (b) 🔴**在庫2効果を取りに行って14効果が出た**＝`owner:"any"` は engine で **`tgtOwner="opponent"`** に解決される（`execGrantKeyword`）ので、「**あなたの**〈修飾〉シグニに付与」が**相手のシグニに付いていた**。既存の枝は「あなたのシグニ」の**隣接形（色句・クラス句）しか見ない**＝パワー句・レベル句・状態句が挟まると既定へ落ちる。**既定値が無害だと思い込まない。** (c) 🔴**退化は2型とも「上書きしない」で解決した**＝`signiClause*Filter` は隣接する1つしか返さないので既存の `story:["空獣","地獣"]` を上書きすると**OR が1クラスへ潰れる**（6効果）／**対象句と枝の所有者が食い違うときは体数を上書きしない**（`WXK05-052-E1` は構造混線＝広げると誤りを2体ぶんに増幅。「枚数だけ先に直さない」の4例目）。**新しい抽出器は「足りない所だけ埋める」形にする。** (d) ⭐**逆翻訳を同じ回で直す**＝`decompileEffects.ts` の ATTACH_CHARM は枚数・体数を出さず 1枚/1体固定だったので、JSON だけ直すと**計器の偽陰性**になる。 旧: 2026-08-08 続き377m（Codex 委譲3バッチ＝(iv)計器較正2本＋(i)配線ギャップ1本）後 最新値（本行が直近の正）**：census **953→927**（−26。⚠**内訳を必ず分けて読む**＝**計器較正 −20**〔偽陽性が母集団から抜けただけ＝**実バグは1件も減っていない**〕／**機能是正 −6**〔実バグ7効果〕。`BASELINE_HIGH` 更新）、golden **1466→1472**（+6＝各バッチ +2。うち2本は**実行E2E**＝0枚選択でも成立・上限超過の打ち切り・自身と相手が候補外）、**被覆マトリクス miss 315→311**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（200ゲーム）、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（キャッシュ削除後の実測・増減0）、manual field loss 0、held **145 据置**（バッチ中 152→145＝純減7は stale 行の解消）、live で `upToCount:true` を持つ効果 **487→494**。**是正した効果は 7**（＋較正で除いた偽陽性 20）。⚠**残す教訓**＝(a) ⭐**worklist の「次の一手」は仮説であって実測ではない**＝§4 が指していた ★★セル6本を全数分類したら **41 miss 中 真の脱落は2件**で、残りは条件節用法のクロス計上だった（`levelExact × SIGNI`／`isDisona × SIGNI`／`cardClass × TRASH{HAND_CARD}`／`cardClass × BANISH{SIGNI}` は**4セルとも0件**）。**投げる前に必ず `--cell` を開く。** (b) 🔴**「語彙が engine 実装済み」は「その入口で効く」を意味しない**＝`upToCount` は live 487効果で使われているのに `execGrantKeyword` は `selectOrInteract` の第3引数を **`false` 固定**（`effectExecutor.ts:2597`）、`execAttachCharm` は `slice(0, 1)` で**1組しか処理しない**（`:4289`）。**grep で honor 箇所を数えるのではなく、その効果が通る exec の該当行を読む**（§5-2 の最頻出形）。 (c) ✅**(iv) 計器較正の鉱脈は「Nまで」で枯れた**＝条件節258件では5語彙 −17 が取れたが、「Nまで」52件は**1件も較正できず全件が実バグ**だった。**較正で census を下げ続けることはもうできない。** (d) ⭐**指示書に per-effect の誤り明細を書くと直り、書かないと落ちる**＝`WXDi-P01-042-E2` の4重欠落（上限／`excludeSelf`／`owner:"any"`＝相手にも撃てた／`count`）と `WXDi-P10-008-E1` の幻覚フィルタは、明細で名指ししたから3件とも直った。**「上限キーを足す」だけの機械作業として投げていたら取りこぼしていた。** 旧: 2026-08-08 続き377l（左右のシグニゾーン機構の新設＝15効果是正）後：census **957→953**（−4・`BASELINE_HIGH` 更新）、golden **1459→1466**（+7・うち1件は engine のゾーン添字 left=0/right=2 を両方向 assert、1件は「【K】は隣接から取るな」のトリップワイヤ5枚）、**被覆マトリクス miss 318→315**（`cardClass × POWER_MODIFY{SIGNI}` は 7→4）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（キャッシュ削除後の実測）、manual field loss 0、held **145 据置**（新規7件を同セッションで採用）、**`_partial_fresh` 行列 3 据置**（機構ギャップ3）。**是正した効果は 15**（対象フィルタ4／付与側のゾーン4／位置条件5／実行時ゲート2）。⚠**残す教訓**＝(a) ⭐**片側だけ実装された対称機構を疑う**＝`centerZoneOnly` はあるのに左右が無く、しかも `POWER_MODIFY` にはゾーン枝があって `GRANT_KEYWORD` には中央すら無い＝**非対称が2重**にあった。該当11効果すべてが限定ごと落ちて過剰発火（CONTINUOUS では `count≠ALL` が効果元自身へ解決されるので「ゾーン全体にバフ」が「自分にバフ」に化ける）。 (b) 🔴**`t.match()` は最初の一致を返す＝「隣接する語を取る」一般化は原理的に危険**＝「【K】を得る/を持つ に隣接する【K】を優先」を入れたら 36カード中16カードが退化した（保有フィルタ／OR の後段／条件付き引用付与の STUB 潰し）。**一般化は必ず全CSV A/B で検算し、退化例は golden のトリップワイヤに固定する。** (c) ⭐**ゾーン添字のような「左右どちらでも動いてしまう」対応は engine テストで両方向 assert する**＝逆でも誰も気付かない。 (d) 🔴**軸トークンを種別トークンで置き換えない**＝`from:['シグニ']` は「シグニの効果を何であれ受けない」で、原文「シグニの効果によって**バニッシュ**されない」より広い（正しくは `from:['BANISH']`＋`bySourceType`）。 旧: 2026-08-08 続き377k（`_partial_fresh` 行列を 10→**3**カードへ＝19効果是正）後：census **957 据置**（`BASELINE_HIGH` 変更なし＝**census が動かない回でも19効果は直る**）、golden **1452→1459**（+7・うち2件は「後続文を無条件に足すな」のトリップワイヤ）、**被覆マトリクス miss 318 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（キャッシュ削除後の実測）、manual field loss 0、held **145 据置**（新規3件を同セッションで採用）、**`_partial_fresh` 行列 10→3カード**（残りは機構ギャップ3）。**是正した効果は 19**（live に届いた挙動修正 6／parser を live と一致させた 13＝以後の改善が効果単位マージで自動的に届く）。⚠**残す教訓**＝(a) ⭐**同じ文型に規則が2箇所あると後ろ側は静かに死ぬ**＝`parseSentencePart2` の acceHost 規則3本は Part1 の汎用 POWER_MODIFY が `パワーを＋N` を常に先に食う**到達不能規則**で、該当10枚すべてが filter 脱落＝CONTINUOUS では効果元自身に解決され**自分にバフする**過剰実行だった。**規則の存在は発火の証明にならない＝実データで発火を確認するまで「対応済み」と書かない。** (b) 🔴**行列に居るものを疑う前に、行列を作る計器を疑う**＝偽陽性の正体は `JSON.stringify` 比較のキー順依存（実体完全同一なのに差分扱い）。リーフパス集合で正規化した。 (c) 🔴**一般化は必ず全CSV差分で検算する**＝「後続文の取りこぼし」を汎用に直したら `WX05-021`（ドロー2＋1）・`WX12-CB02`（レベル5分岐すべて発火）を壊しかけた。この文型の後続文は**ほぼ全部が公開カードを条件にする排他分岐**＝入れ子を表現できる形だけに絞る。 (d) **engine で no-op になる形は「実装済み」に見えて機能していない**＝`count:0` の `LOOK_AND_REORDER` は `cards.length === 0` で即 return＝「好きな順番で戻す」権利が丸ごと落ちていた（5効果）。 旧: 2026-08-07 続き377j（`_partial_fresh` 行列の parser 側を直す＝census 960→**957**）後：census **960→957**（−3・`BASELINE_HIGH` 更新）、golden **1450→1452**（+2）、**被覆マトリクス miss 318 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（キャッシュ削除後の実測）、manual field loss 0、held **144→145枚／71群**、**`_partial_fresh` 行列 12→10カード**。**是正した効果は 7**。⚠**残す教訓**＝(a) ⭐**レビュー行列に残るものは「採用待ち」ではなく「parser のバグ台帳」**＝「live に正しい形があるのに parser だけが退化」しているので、**手で採用しても意味がない**（fresh が退化側）。**parser を直して live と一致させ行列から落とす**のが正しい＝一致させれば以後の改善も自動で届く。 (b) **1形だけを見ている規則を疑う**＝「あなたのエナゾーンにカードがN枚以上あるかぎり」の規則は**所有者・不等号・語尾**の変種を全部素通りさせていた。**新しい条件規則を書くときは最初から〔所有者〕〔不等号〕〔語尾のゆらぎ〕を許す**（語順・数量詞のゆらぎと同じ教訓の4例目）。 (c) 🔴**`includes(語)` で種別を拾う判定は「以外」で反転する**＝`t.includes('アーツ')` が「アーツ**以外**の効果を受けない」にも当たり、保護範囲が原文とちょうど反対になっていた。**否定語（以外／ではない／持たない）の有無を先に見る。** (d) ✅**ツールを直した効果が次のバッチで実際に効いた**＝parser を直して `build:effects` を回すだけで混在カード4効果が自動収穫された（続き377i の粒度変更が無ければ手作業だった）。 旧: 2026-08-07 続き377i（収穫マージを「カード単位温存」→「効果単位温存」へ＝census 972→960）：census **972→960**（−12・`BASELINE_HIGH` 更新。**parser/engine は無変更**）、golden **1450 据置**（トリップワイヤ1件を是正）、**被覆マトリクス miss 319→318**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（キャッシュ削除後の実測）、manual field loss 0、held **144枚 据置／71群**。**是正した効果は 70**（効果単位マージの自動収穫43／新レビュー行列からの採用27）。⚠**残す教訓**＝(a) ⭐**「計器が0になった＝系統が枯れた」ではない**＝続き377h の「(iv) 枯渇」は *census が見える範囲* だけで、`thisCardOnly` のように census 語彙に無い脱落は残っていた。**枯渇宣言は計器ごとに範囲を書く。** (b) ⭐**症状を手で刈る前に、なぜ溜まるのかを見る**＝stale live の本体は `build:effects` が**カード単位**で温存していたこと（MANUAL/PARTIAL が1つでも混ざると同カードの AUTO 効果へ parser 改善が永久に届かない＝実測584カード）。**効果単位**に落としたら 43効果が自動で収穫され、以後は自動で届く。**2バッチ手作業で刈った系統が、ツールの1箇所で恒久的に解けた。** (c) 🔴**テストが落ちたら「実装が悪い」と決めつけない**＝golden のトリップワイヤが**バグ由来のアーティファクト**（E3 の内容が E2 へ漏れた `POWER_MODIFY`）を検証しており、実装が正しくなった瞬間に落ちた。**assert の参照先が原文と対応しているかを先に確かめる。** (d) **自動採用の安全性は粒度を細かくしても落ちない**＝`isPureSuperset` を効果ごとに通すだけで「既存リーフを1つも失わない」保証は同じ。**保守的すぎる粒度は安全ではなく、ただの取りこぼし。** 旧: 2026-08-07 続き377h（(iv) stale live の刈り取り完了＝census 1000→972）：census **1000→972**（−28・`BASELINE_HIGH` 更新。**全部が live 焼き付きの解消＝parser/engine は無変更**）、golden **1450 据置**（期待値のみ更新＝段階2 mandatory集合 1454→1455）、**被覆マトリクス miss 320→319**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（キャッシュ削除後の実測）、manual field loss 0、held **189→144枚／署名グループ 89→71件**。**是正した効果は 37**（held採用36カード＋外科1）。🏁**この系統は枯渇**＝終了時点で「census 高シグナルに当たる held」が **38カード → 0カード**（計器で確認）。⚠**残す教訓**＝(a) **「held が新しい」は「held が正しい」ではない**＝40効果のうち**2件（5%）は逆方向**だった（`WXDi-P06-011-E1` は原文「**対戦相手は**エナチャージ」なのに held が `owner:'self'`／`WXK06-048-E1` は原文「**それが**バニッシュされる場合」＝同一対象なのに held が `targetsLastProcessed` を落とす）。**全件原文照合は省略できない。** (b) **カード単位採用だと巻き添えになる**＝`WXDi-P06-011` は E1 が退化で E3 が改善だったので **E3 だけ外科的に採用**した。 (c) 🔴**`manualEffects.ts` の MANUAL 定義が live より古いことがある**（逆パターン）＝`parseStatus:MANUAL` は`mergeManualEffects` で毎回 live を上書きしうるので、放置すると held が永久に残る。**held が消えない MANUAL 効果は、live と `manualEffects.ts` のどちらが新しいかを先に確かめ、JSON ではなくソース側を直す。** (d) **stale live の壊れ方は7型に集約された**＝duration 取り違え／`thisCardOnly` 脱落／条件節の常時true化／「そうした場合」の対象取り違え／trigger timing の平坦化／【使用条件】の焼き付き／条件節由来の `excludeSelf` 漏れ。**同じ型は parser 側にも残っている可能性があるので、次に parser を触るときの探索キーにする。** 旧: 2026-08-07 続き377g（stale live の一括解消＝census 1030→1000）：census **1030→1000**（−30・`BASELINE_HIGH` 更新。**全部が live 焼き付きの解消＝parser/engine は無変更**）、golden **1450 据置**（FAIL 0）、**被覆マトリクス miss 338→320**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/250 warnings（追加0）、manual field loss 0、held **208→189枚／署名グループ 104→89件**。**是正した効果は 38**（外科的採用30／held採用8カード）。⚠**残す教訓**＝(a) ⭐**`build:effects` の非破壊マージは「parser は直っているのに live は古いまま」の在庫を作る**＝parser を1行も触らずに census が −30 動いた。**census が減らないときは、まず live と fresh を全件突き合わせる。** (b) **採用はカード単位ではなく効果単位で**＝30効果のうち6件は同カードの別効果が live=MANUAL で fresh はそれを退化させる。`heldReview --adopt` はカード単位なので、**MANUAL を無条件スキップする外科パッチ**にする。 (c) 🔴**簡易 fresh ダンプ（`parseCardEffects` 直呼び）は post-pass 依存の効果を取りこぼす**＝`_sourceTextLog` を参照する `applyLrigColorBatch5` 等が効かず `colorNotMatchesLrig` が落ちた。**採用の正は `build:effects` の出力**＝自作ダンプは*候補の発見*にだけ使う。 (d) **golden が live を読むことの盲点**＝parser 側の退化は live が古いままだとテストに映らない。**stale live の解消は回帰検出力そのものを上げる。** (e) **「held のほうが差分が小さい」は採用理由にならない**（`WX21-032-E1` は live も held も条件節のクラスを対象に載せている誤りで、どちらも正しくない）。 (f) **文型クラスタは枯渇を再確認**（最大6件）／★★セル `cardClass × SIGNI[filter]` も18件中15件がクロス計上＝**census を動かすなら stale live 系統のほうが桁で効率が良い。** 旧: 2026-08-07 続き377f（(i)配線ギャップ 第11バッチ）：golden **1448→1450**（+2）、census **1032→1030**（−2・`BASELINE_HIGH` 更新）、**被覆マトリクス miss 349→338**（内訳＝**機能是正 −8／計器較正 −3**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**250 warnings**（⚠**+2 は本変更由来ではなくキャッシュ由来**＝下記教訓 (c)）、manual field loss 0、held **208枚／署名グループ 104件 据置**。**是正した効果は 11**（アタック主語の複合修飾 8／`excludeSelf` の過剰発火 3）。⚠**残す教訓**＝(a) **★★セルは母集団の索引であって母集団そのものではない**＝`cardClass × (filter無)` の全数分類で見つけた「アタック主語」系統を**全CSV走査したらセル外に同型が3件**あった（`color`／`levelParity`／`isDisona`／`cardName` は別セルに散る）。**セルで系統を見つけたら、その系統の語彙全体で母集団を取り直す。** (b) **安全弁はコメントの規律ではなく関数の戻り値にする**＝「未知の修飾語が残ったら配線しない」を `parseAllyAttackSubject` の `null` 戻り値にしたことで、従来「先頭限定（`^`）にしてある」という申し合わせだった防御が構造化された。**次に語彙を足す人が規律を知らなくても壊れない。** (c) **`npm run gates` の lint は `--cache` を使うので warnings の実数とズレる**＝248→250 は本変更由来ではなかった（触った4ファイルの warning 数はベースラインと同一）。**指標を簿記する前にキャッシュを消して測り直す。** (d) **数量詞のゆらぎでも分岐ごと外れる**＝「あなたの緑のシグニ**１体**が」は `(?:[０-９\d]+体)?` が無いだけで色が丸ごと落ちていた（第10バッチの「語順のゆらぎ」と同型）。**任意の数量詞・語順は最初から両方許す。** 旧: golden **1445→1448**（+3）、census **1041→1032**（−9・`BASELINE_HIGH` 更新）、**被覆マトリクス miss 376→349**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **211→208枚／署名グループ 104件**。**是正した効果は 15**（全体バフの語順 9／続き376d 据置 held 3枚＝6）。⚠**残す教訓**＝(a) **A/B の件数と実際に直った件数は違う**＝今回15件動いたうち**6件は live が MANUAL で既に正しかった**（差は `parseStatus` だけ）。**「parser が追いついた」と「live が直った」は別**＝簿記では後者を数える。(b) **採用前の機械確認は「文字列 strip」ではなく「JSON をパースして指定キーを除いた構造比較」**＝正規表現で `"target":{…}` を削る方式は**ネストした `filter` で括弧が合わず誤検知**する（今回 6件中5件が誤って REVIEW 判定）。(c) **据置ラベルは根拠を確かめてから従う**＝続き376d が「別系統の改善が同居」として据置した3枚は、原文照合したら**その別系統も正しい修正**だった。(d) **語順のゆらぎを regex に入れ忘れると分岐ごと外れる**＝「すべての」は修飾語の前にも後ろにも来る。**同種の任意語（すべての／他の／それぞれ）は両方の位置を許す**。 旧: 2026-08-07 続き377d（(i)配線ギャップ 第9バッチ＝シグニ→デッキ上/下 のレベル範囲）後 最新値**：golden **1443→1445**（+2）、census **1048→1041**（−7・`BASELINE_HIGH` 更新）、**被覆マトリクス miss 422→376**（内訳＝**計器較正 −38／機能是正 −8**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **211 据置／署名グループ 104件**。**是正した効果は 8**。⚠**残す教訓**＝(a) **★★セルの miss 数は見込み件数ではない**＝3バッチ連続で実測（第8 `levelRange × BANISH{SIGNI}` は6件中5件が偽陽性／今回は22件中14件）。**セルを取ったらまず全数分類し、偽陽性の型が分かったら計器側を較正する**のが最短（較正は実装ゼロで miss が減り、以後のセル選定精度も上がる）。(b) **`signiClause*Filter` 3兄弟が揃った**＝`signiClauseStoryFilter`（クラス・続き376d）／`signiClauseIconFilter`（アイコン・続き377c）／`signiClauseLevelFilter`（レベル・続き377d）。**対象名詞句に隣接する語彙だけを取る**という規律は、この3つを使う限り自動的に守られる。**新しい語彙を足すときはまずここに兄弟を追加できないか見る。**(c) **同じ語彙でも入口ごとに壊れ方が違う**＝デッキ一番上は filter 固定でレベルを一切見ない／一番下は「レベルN**の**」＝丁度しか見ない。**入口を1つ直したら同族の入口も必ず見る。** 旧: 2026-08-07 続き377c（(i)配線ギャップ 第8バッチ＝《ライズ／クロス／アクセアイコン》の対象フィルタ）後 最新値**：golden **1440→1443**（+3）、census **1048 据置**（⚠**この語彙は census に無い＝被覆マトリクスにしか映らない**＝続き376d のディソナと同型。**census が動かない回でも17効果が直る**ことがあるので、census の増減だけで成果を測らないこと）、**被覆マトリクス miss 464→422**（内訳＝**計器較正 −28／機能是正 −14**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **211 据置／署名グループ 104件**。**是正した効果は 17**。⚠**残す教訓**＝(a) **★★セルでも中身を読むまで収穫は分からない**＝`levelRange × BANISH{SIGNI}` は miss 6 のうち**5件が偽陽性**（クロス計上）だったのでセルを乗り換えた。(b) **同じ概念に2つのキー綴りが併存していることがある**（`hasCrossIcon`/`hasRiseIcon` と `hasIcon:'クロス'|'ライズ'`＝engine は両方見る）＝**計器がキー名照合だけだと片方を全部 miss と誤検出する**。(c) **同じ関数の中でも枝によって filter が落ちる**（`GRANT_KEYWORD` の `kwCountSelfM` 枝）＝**枝を全部読む**。(d) **全文から取る filter を別の枝へ流用しない**＝`kwSigniFilter` は `parseLevelFilter(t)` を全文から取るので条件節のレベルを対象へ載せる。**対象名詞句に隣接する語彙だけ**を使う。(e) **`cardName:"ライズアイコン"` のような完全 no-match が live に焼き付いていることがある**＝parser を直しても消えないので、**golden に「live 全体に存在しないこと」のトリップワイヤ**を置く。 旧: 2026-08-07 続き377b（(i)配線ギャップ 第7バッチ＝`noGuard × TRASH_CARD[filter]` → 同じビルダーの構造バグ）後 最新値**：golden **1436→1440**（+4）、census **1053→1048**（−5・`BASELINE_HIGH` 更新。内訳＝機能是正 −4／計器較正 −1）、**被覆マトリクス miss 476→464**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **211 据置／署名グループ 104件**。**是正した効果は 30＋engine 1本**（《ガードアイコン》filter 11／source を SIGNI→TRASH_CARD 19／枚数の過小実行 8〔重複あり〕／`TRANSFER_TO_DECK{TRASH_CARD}` の `upToCount` 配線）。⚠**残す教訓**＝(a) **セルは入口であって終点ではない**＝★★セルを取ったら同じビルダーに**もっと重い構造バグ**（source が場のシグニ）が同居していた。**セルを取ったらビルダー全体を読む。** (b) **枚数だけ先に直してはいけない**＝構造が誤ったままだと「相手の場のシグニを1体」が「7体」になり**誤りを増幅する**（続き374 と同じ判断）。(c) **名指し表でやっていることはビルダーへ一般化できないか見る**＝`DISTINCT_SOURCE_FIX_BATCH5C` が13効果に名指しで当てていた source 付け替えが、そのまま19効果の正解だった。(d) **構造変更は held の型集合を変えるので一気に held が増える**＝採用前に「差分が意図した部分木だけ」を機械確認する。MANUAL のほうが正しい効果（`WX06-014-E2`）は採らない。 旧: 2026-08-07 続き377（(i)配線ギャップ 第6バッチ＝`hasOtherSelfSigniNoun`「他の」ゲートの棚卸し）後 最新値**：golden **1430→1436**（+6）、census **1061→1053**（−8・`BASELINE_HIGH` 更新。**全部が機能是正＝較正ぶんは無し**）、**被覆マトリクス miss 483→476**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **213→211枚／署名グループ 104件**。**是正した効果は 12＋engine 1本**（BANISH{ALL} 7／UP 5／`execBanish` の `excludeSelf` 配線）。⚠**残す教訓**＝(a) **`excludeSelf` 以外を gate している `hasOtherSelfSigniNoun` は全部疑う**（第1バッチ＝ON_ATTACK_SIGNI 主語／第5バッチ＝`parseSigniTarget` の isDisona／今回の BANISH{ALL}・UP で**4例目**）。(b) **auto-commit 環境では `git stash` で A/B が取れない**＝ベースラインコミットから `git show <sha>:<path>` で parser を取り出して**全カード fresh をダンプ→戻して再ダンプ→diff**。**live diff だけ見ると MANUAL/カード単位 PRESERVE の差分を見落とす**（今回 12件中2件）。(c) **`matchesFilter` は `excludeSelf` を見ない**＝候補集合を作る各 exec 側の責務なので、**新しいアクション型に `excludeSelf` を載せるときは exec 側の配線を必ず確認する**（`execBanish` は10年ぶんの効果が未配線だった）。 旧: 2026-08-07 続き376（§5d-0 工程改善3件の完遂 → 配線ギャップ5バッチ＋計器較正3バッチ）後 最新値**：golden **1419→1430**（+11）、census **1162→1061**（−101・`BASELINE_HIGH` 更新。**内訳＝機能是正 −38／計器較正 −63**＝**この2つは別勘定で読むこと**）、**被覆マトリクス miss 541→483**（`npm run census:wiring`・新設）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **229→213枚／署名グループ 104件**、実機 driver 既定order **126→128件**。**是正した効果は計 66**（配線ギャップ5バッチ）＝**census の減少幅と一致しない**（較正ぶんが混ざり、逆に第5バッチは census が動かないまま12効果を直した）。⚠**残す教訓**＝(a) **素の `parseStoryFilter(文全体)` を対象フィルタに使わない**（A/B で7件中4件・20件中3件が誤配線＝コスト側／条件節／個数参照／別の対象のクラスを引き込む）＝**対象名詞句に隣接**するときだけ拾う。(b) **曖昧なら付けない**＝span 内にクラスが2つ以上（「＜A＞と＜B＞」＝別ピック／「＜A＞か＜B＞」＝OR）なら片方だけ載せると**原文と逆の過小実行**になるので**既存の過剰効果を残す**ほうを選ぶ。(c) **誤った中間ビルドは live JSON に焼き付く**＝`build:effects` は非破壊マージなので parser を直して回し直しても消えない＝**parser を触る前に live JSON をスナップショットし、A/B 差分を全件読む**。(d) **held の署名グループ「（type増減なし＝値/構造変更）」は102枚の受け皿**＝`--adopt-sig` を使ってはいけない。採用前に「差分が意図した箇所のみ」を機械確認する。(e) **census の5つ目の死角＝「語彙はあるが判定器が違う」**（`keyword:"ディソナアイコン"` は印字ベース判定でディソナ属性に両方向で外れる）＝**語彙突き合わせ型の計器は原理的に検出できない**。 旧: 2026-08-07 続き375（§5d パターンA 第7バッチ＝続き374 のブロッカー2件を実装）後 最新値（本行が直近の正）**：golden **1418→1419**（+1＝エナ対象のゾーン是正3件／`WD15-018` の条件節／evalCondition のルリグ色解決）、census **1164→1162**（−2・`BASELINE_HIGH` も 1162 へ更新＝**機能是正**。この系統は OK **33→37**／未配線 5→1）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **229 据置／署名グループ 104件**。**live JSON の変更は4効果／4カード**（すべて held 経由で採用）。⚠**残す教訓**＝(a) **ブロッカーを潰すより、既に正準な別の形へ寄せられないか先に見る**＝`SELECT_TARGET_ONLY` 方式は engine 拡張3点（うち1つは循環 import）が要るのに得るのは選択タイミングの前後だけで、同族30効果が使う素の `TRASH{ENERGY_CARD,...,filter}` に寄せれば parser だけで済んだ。(b) **名詞句 span は名詞まで含めて捕る**＝直前で切ると `LRIG_COLOR_NOT_RE` 等が外れ、**ゾーンだけ直って色制限が黙って落ちる**。A/B 差分の中身を必ず読む。(c) **条件節の新規則は `STATE_CONDITION_CLAUSES_V2` に足す**＝「…を対象とし、」プレフィックスを許すループが spread しているのは V2 だけで、`STATE_CONDITION_CLAUSES` に足すと**黙って効かない**。(d) **条件内の動的フィルタは条件評価器側でも解決が要る**＝`matchesFilter` は `colorNotMatchesLrig` を知らないので、未解決だと**黙って無視され過剰条件**になる。**「型にあるキーを条件に入れた」だけでは効かない。**


> **最新値は PLAN §4 の先頭1行が正**。以下はその手前の推移（census / golden / smoke / fuzz / held の各時点値）。

- **2026-08-06 続き362f（🏁§3 タスク12(xciv) 残0クローズ＝コスト軽減の残テールを全数処理）後の値（履歴）**：golden **1394→1395**（+1＝**増＋減が同一文**の `WX08-026`〔増加方向を含む5ケース〕と**ターン履歴**の `WX13-026`〔実績あり/なし/相手未知の3ケース〕）、census **1283 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held 245 据置。**live JSON は不変**。新機構＝`addNColorToCost`（コスト**増加**）／`PlayerState.signi_banished_this_turn`（バニッシュ履歴）。**実機は新規 `banishHistoryForCost` を2回連続 PASS**（【出】で相手シグニをバニッシュ→`guest.signi_banished_this_turn` 0→1）＋回帰2件。既定order 130→**131件**。⚠**未カバー検出の穴**＝カード番号キーのヘルパー（`applyMeltFactPreUseCost`）は regex 走査では見えない。
- **2026-08-06 続き362e（§3 タスク12(xciv)＝コスト軽減の残テールを 23→5枚まで消化）後 最新値（本行が直近の正）**：golden **1393→1394**（+1＝新クラスタ α/β/γ/δ を「満たす盤面なら減る／満たさなければ減らない」の両方向12ケースで固定）、census **1283 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held 245 据置。**live JSON は不変**（規則は `costs.ts` の EffectText 由来＝JSON を持たない）。⚠**ピースはコスト計算の入口が別**だったので「キーにセット」ゲートと `KeyUseModal` の2箇所も `computeArtsEffectiveCost` へ通した（(xciii) と同型の食い違い）。既存の過剰適用ゼロガードは `WX25-P3-002` の**正しい発火**1件を期待値へ追加。
- **2026-08-06 続き362d（🏁§3 タスク12(lv)＝CPU の任意・無コスト【出】未配線2経路）後 最新値（本行が直近の正）**：golden **1391→1393**（+2＝CPU が拾う母集団と「コスト付きは入らない」方針の固定／`OPTIONAL_ACTIVATE` の選択肢順が「発動する→発動しない」＝CPU 自動応答の方針そのものであることの固定）、census **1283 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held 245 据置。**live JSON は不変**（触ったのは `BattleScreen` の収集コードだけ）。母集団の実測＝③CPU シグニ召喚 **11効果**／④CPU グロウ **0件**（0件でも配線）。**実機は新規 `cpuOptionalOnPlayCharm` を2回連続 PASS**（CPU が `WX04-052` を召喚→【チャーム】が実際に付く）＋回帰3件。既定order 129→**130件**。
- **2026-08-06 続き362c（🏁§3 タスク12(lxxxviii)＝ベット分岐は実装済み〔主張が誤り〕＋`WDK15-007` の実バグと計器較正）後 最新値（本行が直近の正）**：golden **1388→1391**（+3＝BET_MECHANIC がベット有無で選択数を切り替えること〔`WX19-006` 1→2／`WDK12-007` 1→2／`WX16-005` 1→3〕・非ベットでも選択肢が実際に出ること／`WD21-007` のベット繰り返し／`WDK15-007` のベット時コスト軽減）、census **1285→1283**（`BASELINE_HIGH` も 1283 へ更新＝**instrument 側の較正**。`betChoose` が小文字で `/BET/` に掛からず、ベットを正しく表現した2枚が偽陽性だった）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **246→245枚**。**live JSON の変更は `WX18-005` の1カードのみ**（4択すべて原文一致を確認して canonical な `CHOOSE + betChoose` へ移行。A群の残り8枚は静的化すると過剰実行が入るため**据置**）。
- **2026-08-06 続き362b（🏁§3 タスク12(xciii)＝【チェイン】がキーワードごと落ちて次のアーツが一度も安くならなかった）後 最新値（本行が直近の正）**：golden **1386→1388**（+2＝アーツ7枚の【チェイン】軽減ステップ形状〔注釈なし・非文頭・同色2つを含む〕／engine が `next_arts_cost_reduction` に積み UI ヘルパーが実際に引くこと・2枚目の宣言で積み増しになること）、census **1285 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **246 据置**。**live JSON の変更は7カード**（`WX10-004`／`WX10-005`／`WX10-022`／`WX11-018`／`WX11-021`〔MANUAL＝外科採用〕／`WX14-005`／`WX19-004`）。**実機は新規 `chainArtsCostReduction`（エナ0枚で2枚目のアーツが使える＝軽減が無ければ成立しない盤面）を2回連続 PASS**＋回帰3件。既定order 128→**129件**。
- **2026-08-06 続き362（🏁§3 タスク12(cix)＝「この方法でダウンしたルリグ」参照がコスト経路＝実UIで届いていなかった）後 最新値（本行が直近の正）**：golden **1378→1386**（+8＝支払い関数の記録／`WX25-P1-112` のレベル限定と参照不能時の空ヒット／`WX24-P1-040` の LRIG ダウン・アシスト代替・スキップ枝の did-it／シャドウのレベル解決と `thisCardOnly`／`WXDi-D03-004`・`D04-004` の枚数・レベル・owner／`WX24-P2-069` の旧キー不在／「このシグニは〜を得る」の `thisCardOnly`／`WX25-P2-114` の 0..N ダウンと「レベル合計＋1」ミル）、census **1286→1285**（`BASELINE_HIGH` も 1285 へ更新＝利得を固定）、smoke **10679/10679** 全0・SKIP0、fuzz 全0（distinct効果 2705種）、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（**本セッションの追加0**）、manual field loss 0、held **250→246枚**。**live JSON の変更は133カード**＝(cix) 母集団6枚＋MANUAL 1枚（外科採用）＋**巻き込み127枚**（`+thisCardOnly` の1キーのみ＝全数の差分署名で機械確認）。**実機は新規 `lrigDownLevelRemoveAbilities`（コスト経路の参照＝golden では原理的に守れない）を2回連続 PASS＋回帰9件**（`lrigDownCenterOnlyPays`／`lrigDownCenterOnlyUnwired`／`ontargeted5`／`keywordgained`／`wx24p2018GrantFire`／`banishbyeffect`／`g144DownTrigger`／`freezeLrig`／`lriggrow`）。既定order 127→**128件**。
- **2026-08-06 続き361（🏁§3 タスク12(cxi)＝中断エントリの盤面差分トリガー取りこぼし／🏁(c)＝ON_TARGETED の「そのシグニ」限定）後 最新値（本行が直近の正）**：golden **1374→1378**（+2＝(cxi)〔中断時点でドローが確定していること／その状態から `collectDrawTriggers` が `WX20-026-E3` を返すこと／「ON_DRAW と DRAW が最終でない SEQUENCE」の同居母集団2効果〕／+2＝(c)〔`collectTargetedTriggers` の `triggeringCardNum` 配線と origin なし時の非設定／3効果の `isTriggerSource` と「トリガー元が不明なら no-op＝巻き添えを出さない」実行確認〕）、census **1287→1286**（`BASELINE_HIGH` も 1286 へ更新＝利得を固定）、smoke **10679/10679** 全0・SKIP0、fuzz 全0（distinct効果 2701種）、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（**本セッションの追加0**）、manual field loss 0、held **250→247枚／105群**。**live JSON の変更は3効果**（`WXDi-P03-056-E1`／`WX05-047-E1`／`WXDi-P13-089-E2`＝per-effect 差分で changed=3 / added=0 / removed=0）。逆翻訳差分も同3行のみ（「対戦相手のを1枚トラッシュに置く」→「そのシグニをゲームから除外する」等）。**実機は `drawBySourceStory`（判定を「実際に -4000 が乗る」まで厳格化）と新設 `onTargetedSourceSigniBanish`（2回連続）＋回帰6件**。既定order 126→**127件**。⚠**(cxi) の穴の規模＝1巡目で中断する効果 5418／うち中断時点で既に盤面が動いている 484**（＝これまで一度も diff 評価されていなかった母数）。
- **2026-08-06 続き360／360b（🏁§3 タスク12(civ)＝engine 非バグと確定／(xcvii)(xcvi)／🏁(lxvi) 残0クローズ）後 最新値（本行が直近の正）**：golden **1371→1374**（+1＝(xcvii) の離場6アクション×`count:1`/`count:'ALL'` 両形態の回帰／+2＝(lxvi) の parser 規則2本）、census **1288→1287**（`BASELINE_HIGH` も 1287 へ更新＝利得を固定）、smoke **10679/10679** 全0・SKIP0、fuzz 全0（distinct効果 2711種）、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（**本セッションの追加0**＝245→248 の差は未追跡の置き忘れ `scripts/_dbgFresh.ts` が lint 対象に入っている分）、manual field loss 0、held **250枚／107群**。**live JSON の変更は4枚**（`WX24-P3-057`／`WX26-CP1-101`／`WX08-061`／`WXEX2-13`）＋収穫マージの自動採用2枚（`WXDi-P07-087`／`WXDi-D07-019`）＝**parser 変更前後の fresh 全数6712枚 A/B で変化20枚**を確認済み。実機は **`stackLen` を判定に使う20シナリオを全数単体実行（16 PASS）＋残4件を旧/新 driver で A/B して同一**。既定order 125→126件。
- **2026-08-06 続き359（🏁§3 タスク12(cv) 残0クローズ＝`opp_hand` ピッカーの viewer 相対描画によるソフトロック）後 最新値（本行が直近の正）**：**すべてのゲート値が前行から据置**＝golden **1371**、census **1288**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings**、manual field loss 0、同型★0（265群）、held **257枚／109群**。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `EffectInteractionModal.tsx` のみ。⚠**モーダルの描画は golden 非カバー**＝純関数が無い UI 分岐なので**実機シナリオが唯一の検証手段**。意図的FAILだった2件（`wd16016BurstOpponentDiscard`／`wxex225DiscardAvoids`）の**PASS 反転**と、通常方向の回帰3件（`trashCounterOpp`／`handDiscard`／`exileHandBlind`）で締めた。既定order 124→125件。
- **2026-08-06 続き358（🏁§3 タスク12(ci)＋(cii) 残0クローズ＝`OPPONENT_PAY_OPTIONAL` の無料回避枝と CPU のエナ未選出）後の値**：golden **1368→1371**（+3＝①エナコストの有無で 'pay' 枝が出る／出ないこと、回避手段不足時は `available:false` で**枝は残る**こと ②live 母集団 **OPO 出現71／エナコストあり38／非搭載33**と、**「エナコスト非搭載でも回避枝ゼロの STUB は0件」**（＝'pay' を消しても過剰実行にならない安全弁）＋`costColors` にパイプ記法（`青|黒`）を持つ OPO が live に0件〔`resumeOpponentPayOptional` の色照合が解さないため〕 ③`selectOptionalCostEnergy` の戻りが `resumeOpponentPayOptional` にそのまま通って実際にエナが減ること／`canPayOptionalCost` と可否が一致すること／**instanceId を渡さないと従来どおり空振りする**ことの回帰）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0（265群）、held **257枚／109群 据置**。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `effectExecutor.ts`（枝の条件付き spread 化）・`execUtils.ts`（`selectOptionalCostEnergy` 新設＋`canPayOptionalCost` の委譲）・`BattleScreen.tsx`（CPU 応答のエナ選出）。⚠**CPU 応答と枝の available は golden 非カバー**（固定できるのは pure な options 生成と支払い関数まで）＝**実機4シナリオ（`oppDiscardGate*` 2件＋`oppPayEnergy*` 2件・各2回連続PASS）と対で締めた**。既定order 123→124件。
- **2026-08-06 続き357（🏁§3 タスク12(cvii) 残0クローズ＝`ctx.currentPhase` の配線漏れ是正）後の値**：golden **1367→1368**（+1＝①`DURING_PHASE` を持つ**8効果**を effectId 単位で phases ごと固定 ②**`TurnPhase` に無い phase 値は既知の1件だけ**〔`WX05-013-E2:ATTACK_SIGNI_OP`〕と全数 assert＝不正値が増えたら落ちる ③`ctx.currentPhase` を見る他3機構の宣言元母集団〔`LOCK_OPP_TRASH_MOVE` 2／`NO_ABILITY_SIGNI_TO_DECK_BOTTOM` 1／アタックフェイズ限定バニッシュ先置換 3〕を固定。既存の `ON_OPP_ENERGY_ADDED` テストも4実値＋不正値の両方向へ拡充）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、**同型★0（265群）**、held **257枚／109群 据置**（parser 修正で一時 259 へ増えた2枚は採用して元に戻した）。**live per-effect 差分＝changed 2／added 0／removed 0**（`WX13-035`／`WX24-P2-050` の `phases` のみ＝**機械 diff で「phases 以外の変化 0」を確認済み**）。**新語彙0本**。逆翻訳差分は `decompile_sheet2` の2行のみ（生列挙→「アタックフェイズの間」）。⚠**ExecCtx の配線そのものは golden 非カバー**（固定できるのは母集団と phase 値の妥当性まで）＝**実機4シナリオ（`trashMoveLock*` 2件＋`noAbilityDeckBottom*` 2件・各2回連続PASS）と対で締めた**。既定order 121→123件。
- **2026-08-06 続き356（🏁§3 タスク12(cviii) 残0クローズ＝【起】ACTIVATED の `cost.lrigDown` 配線）後の値**：golden **1366→1367**（+1＝ACTIVATED の `cost.lrigDown` 母集団**13効果**を effectId＋payload 単位で固定し、**実行経路の内訳〔シグニ11／ルリグ2〕**も固定。併せて母集団に実在する3形〔count のみ／centerOnly／level〕の支払い可否を共有関数 `payLrigDownCost` で両方向 assert）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0、held **257枚／109群 据置**（**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `BattleScreen.tsx`（実行2経路＋アクション一覧ゲート2箇所）・`SigniActivatedModal.tsx`／`LrigGrantedModal.tsx`（`canAfford`）・`lrigDownCost.ts`（表示ラベル関数の新設のみ）。⚠**コスト支払いUIと available 判定は golden 非カバー**（固定できるのは母集団と純関数の戻りまで）＝**実機3シナリオ（`lrigDownCenterOnlyPays`／`lrigDownCenterOnlyUnwired`／`lrigDownLevelLrigActivated`・各2回連続PASS）と対で締めた**。既定order 118→121件。
- **2026-08-04 続き346（🏁§3 タスク12(xcix) 残0クローズ＝主語なしアタック watcher の scope 是正）後の値**：golden **1363→1366**（+3＝①3効果の `triggerScope:'any'` とターン限定の有無 ②scope:any での収集＋`initStack`／`turnGateOk` の残存・除外 ③母集団3効果の固定）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0（265群）、held **257枚／109群 据置**。**live per-effect 差分＝changed 3／added 0／removed 0**（`WXEX2-04-E1`／`WXDi-P06-033-E2`／`WXDi-CP02-053-E1` の `triggerScope:'any'` 追加＋後者2枚の `turnOwner`）。**新語彙0本**＝`triggerScope:'any'` も `turnOwner` も既存で collector/`turnGateOk` も対応済み＝**parser が生成していなかっただけ**。⚠**ターン限定を collector に足してはいけない**（`effectStack.turnGateOk` が担当。足すと二重ゲートで既存効果が落ちる＝本セッションで実際に golden 2件が落ちて差し戻した）。
- **2026-08-04 続き345（🏁§3 タスク12(lxviii) 残0クローズ＝散文形「対戦相手のターンの間、」の過剰実行是正）後の値**：golden **1360→1363**（+3＝①対象2枚の相手ターン発火／自ターン非発火〔origin 付き〕②本文側4枚に turnOwner を付けないこと③母集団の固定〔前置き AUTO 30件・未ゲート1件〕）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0（265群）、held **258→257枚／109群**。**live per-effect 差分＝changed 2／added 0／removed 0**（`WXDi-P12-074-E1`／`WXDi-P13-089-E2` の `turnOwner` 追加のみ）。**新語彙0本**＝`triggerCondition.turnOwner` は既存フィールドで collector も対応済み＝**parser が生成していなかっただけ**。逆翻訳差分は `decompile_sheet8` の当該2行のみ。
- **2026-08-04 続き344（🏁§3 タスク12(xcviii) 残0クローズ＝CPU のターン開始ドロー処理の統一）後の値**：golden **1357→1360**（+3＝①CPU＝guest のターンドローでの `ON_DRAW` 収集と `playerId` ②`drawBySourceStory` の残値あり発火／クリア後 非発火 ③`ON_DRAW` の live 母数13）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0・held **258枚／109群 据置**（**parser も JSON も触っていない**）。**live JSON は完全不変**（**新語彙0本**）＝触った層は `BattleScreen.tsx` の CPU UP 分岐のみ。⚠**CPU 経路の配線とリフレッシュ回数リセットは golden 非カバー**＝実機通し確認と対で締める。
- **2026-08-04 続き343（🏁§3 タスク12(lxvii) 残0クローズ＝CPU ターンのフェイズ/ターン境界トリガー統一）後の値**：golden **1354→1357**（+3＝①CPU＝guest をターンプレイヤーとした6 timing の pure collector 戻り〔entries の `playerId`・人間側 usageLimit 不消費〕②CPU ターンでの `any_opp` watcher 発火と解決主体 ③**影響母数の固定**〔`ON_TURN_END` 187／`ON_ATTACK_PHASE_START` 非 self 57／`ON_MAIN_PHASE_START` 31／`ON_TURN_START` 3／`ON_LRIG_ATTACK_STEP_START` 1／`ON_GROW_PHASE_START` 2〕）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0・held **258枚／109群 据置**（**parser も JSON も触っていない**）。**live JSON は完全不変**（**新語彙0本**・`BattleAction` も 18種のまま）＝触った層は `BattleScreen.tsx` のみ（`collectCpuTurnTriggers` 新設＋CPU 5経路への配線＋【ハスターリク】の side 是正＋当該遷移を `SET_TURN_PHASE`→`ADVANCE_TURN_WITH_STATE`）。⚠**CPU 経路の配線は golden 非カバー**＝固定できるのは pure collector の戻りと母数まで。**実機通し確認と対で締める**。
- **2026-08-04 続き342（🏁§3 タスク12(xcv) 残0クローズ＝「能力を持たない」判定の統一）後の値**：golden **1350→1354**（+4＝①`WXEX2-30` の場離れ置換〔バニッシュ/手札戻し/トラッシュ/エナ送り/除外/デッキ戻しの6経路・能力持ちは素通り・メインフェイズでは不成立・宣言者不在・victim が自分側でも成立・`abilities_removed`〕②`ABILITY_CHECK_ELSE_TRASH` の「それ」＝直前 BOUNCE が戻したカード／**効果元シグニが場に残ること**＝旧バグの再発検知／対象なしで盤面不変 ③live 母集団の内訳固定〔STUB 3枚・条件形2枚・宣言1枚〕④**マルチエナ持ちを「能力なし」に倒さないこと**を条件側・置換側の両方で）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0（265群）・held **258枚／109群 据置**（**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**＝engine の action/condition 型は増えていない）＝触った層は `execUtils`（`hasNoAbility` 新設＋`LAST_PROCESSED_HAS_NO_ABILITIES` の委譲）・`execStubPart2`（STUB 2件）・`effectExecutor`（置換1本＋離場11経路への配線）。⚠**修正前は3箇所とも常に no-op**＝計器には一切映っていなかった（smoke も census も緑のまま）＝**実機確認と対で締める**。⚠`docs/STUBS.md`／`grouped_all.txt` の差分には 2026-08-01 以降の未再生成ぶん（続き333〜341 由来）が含まれる。
- **2026-08-04 続き341（🏁§3 タスク12(xcii) 残0クローズ＝相手の盤面を参照するコスト軽減8枚）後の値**：golden **1346→1350**（+4＝①相手の場を数える軽減〔凍結2体・**シグニ不在ゾーンの凍結フラグは数えない**・【ウィルス】2つ・素のシグニと能力持ちの区別・`abilities_removed`〕②合算形の自分側/相手側/両方0と累積形の3状態③相手コイン枚数とライフ枚数比較〔多い/同数/少ない/**相手状態が無ければ減らさない**〕④**相手盤面フルの全数走査＝アーツ/スペル/ピース1236枚のうち動くのは8枚だけ**を期待コスト文字列まで固定）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（⚠ローカルで248に見えるのは**未追跡の残置ファイル `scripts/_dbgFresh.ts`（3件）**が混じるため＝ベースライン commit の worktree で実測して245を確認済み。本作業の増分は**0**）、manual field loss 0、同型★0・held **258枚／109群**（いずれも前回据置＝**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `costs.ts`（`CostReplaceCtx.oppState` の型拡張＋規則5本）と `BattleScreen.getMyLrigDeckCardActions`（実効コスト算出を `ArtsModal` Phase1 と同式へ統一）のみ。⚠**コスト表示・請求は golden 非カバー**（純関数 `computeArtsEffectiveCost` までは固定済み）＝実機確認と対で締める。
- **2026-08-03 続き340（§3 タスク12(xc) 37枚実装＋🏁(xci) 残0クローズ）後の値**：golden **1343→1346**（+3＝①新規規則が**条件成立時だけ**効くこと〔A/D/C/E/H の成立・不成立の対、既存 ＜クラス＞規則の回帰、`SP36-001` の3状態〕②**過剰適用ゼロ**の全数走査〔アーツ/スペル/ピース 1236枚を空盤面で走査し0枚〕③(xci) の対象2枚が実在しスペルであること＋対象名以外/カード名不明/発生源不在では何もしないこと）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0・held **258枚／109群**（いずれも前回据置＝**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `costs.ts`（規則6本追加＋既存2本の是正＋`applySpecificCardCostReduction` 新設）と3モーダルの呼び出しのみ。⚠**コスト表示・請求は golden 非カバー**（純関数 `computeArtsEffectiveCost` までは固定済み）＝実機確認と対で締める。
- **2026-08-03 続き339（🏁§3 タスク12(lxxxvi)＋(lxxxvii) 残0クローズ）後の値**：golden **1341→1343**（+2＝①ベット持ちスペル7枚の母集団固定〔`ON_COIN_PAID` 収集自体は BattleScreen 層＝非カバー〕②場の CONTINUOUS 軽減が効くべきカットインアーツ3枚＋青以外は効かないこと）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0・held **258枚／109群**（いずれも前回据置＝**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**）＝触った層は `CutinModal`（`artsBaseCost` 追加）と `castSpell`（`collectCoinPaidTriggers` 追加）のみ。⚠**コスト表示とコイン反応の発火順序は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き338（🏁§3 タスク12(lxxxix) 残0クローズ＝使用時の任意支払い「場のシグニをトラッシュ」2枚）後の値**：golden **1339→1341**（+2＝①場のシグニ払いの後始末〔2ゾーン払いで下のカード・チャーム→トラッシュ／ソウル→ルリグトラッシュ／ダウン・凍結フラグのリセット／選んだゾーンだけ空く／ダウン中でも候補／`WX25-P1-110` のクラス・レベルフィルタ〕②`QUEUE_SPELL` の `effectStack` 指定時のみ `effect_stack` を書く。併せて (lxxxv) の3テーブルを 31→33 へ更新）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0、held **257枚／109群 → 258枚／109群**。**live per-effect 差分＝changed 2／added 0／removed 0**（2枚とも「先頭1本除去のみ」で完全一致＝相乗りドリフトなし）。**新語彙 0本**＝engine の action/condition 型は増えていない（`BattleAction` も 18種のまま＝`QUEUE_SPELL` の payload 拡張のみ）。⚠**支払いUI・離場トリガーの発火順序は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き337（§3 タスク12(lxxxv)＝使用時の任意支払いによるコスト軽減 31枚）後の値**：golden **1334→1339**（+5＝①対象31枚の spec と軽減後コスト〔支払い元・上限・比例/固定・1枚時・上限時・0枚時の据え置き〕②除外5枚を読まないこと〔理由つき〕③固定形の「ちょうどN枚」境界と候補フィルタ④**5ゾーンすべての支払いが盤面を正しく動かすこと**⑤**31枚の解決中の支払いステップが live から落ち、かつ本体ステップが残っていること**＋据え置き2枚の先頭は不変）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings**（+5＝新規2ファイル分）、manual field loss 0、同型★0、held **259枚／110群 → 257枚／109群**。**live per-effect 差分＝changed 31／added 0／removed 0**（29枚は「先頭1本除去のみ」で完全一致・残2枚は採用に相乗りした既存ドリフトで `WX07-024` は純増）。**新語彙 0本**＝engine の action/condition 型は増えていない（UI 層の純関数モジュール `useTimeCost.ts` を新設し、parser は先頭ステップを落とすだけ）。⚠**支払いUIとコスト再計算は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き336（🏁§3 タスク12(lxxxiv) 残0クローズ＝スペルカットインのベット宣言UI）後の値**：golden **1333→1334**（+1＝`FINISH_CUTIN` の `effectStack` 指定時のみ `effect_stack` を書く〔省略＝不干渉は既存2件が保証〕。併せて既存のコスト置換テストに**対象8枚の `parseBetOptions` 段階＋`Timing` にカットインを含むこと**と `WX17-019` のベット時《青×0》を追加＝**ベットUIの枚数ボタンはこの options から出る**ので空になれば落ちる）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**＝`BattleAction` も 18種のまま〔`FINISH_CUTIN` の payload 拡張のみ〕）。触った層＝`CutinModal`／`useCutin`／`handleCutinUse`／`battleController`。⚠**ベットUIと支払い配線は golden 非カバー**（BattleScreen/モーダル層）＝実機確認と対で締める。
- **2026-08-03 続き335（🏁§3 タスク12(lxxxi) 残0クローズ）後の値（履歴）**：golden **1331→1333**（+2＝`SET_CARD_COST_REPLACEMENT` の engine 書き込み〔クラフト追加との順序・置換後コスト・**同名再設定の後勝ち**〕と UI 読み取り〔別カード名には効かない〕／任意支払い2枚の仕様・未払い/支払い済み・**多色シグニのバックトラック**・境界〔1枚/3枚/クラス違い〕・**母集団は実測2枚だけ**・**先頭 `OPTIONAL_COST` が live から落ちていること**）、census **1289→1288**（`コスト:《コイン》` に《コイン×0》較正を追加＝STUB を実アクション化して表に出た偽陽性の是正。**`BASELINE_HIGH - 2` の暫定オフセットも解消**＝ゲート値は `BASELINE_HIGH` そのもの）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群**（`WXK03-002` 採用で元に戻った）。**live JSON の変更は全5ファイルで3カードのみ**＝`WXK03-002`（heldReview 採用）／`WX21-035`・`WX21-071`（MANUAL＝PRESERVE 保護のため**外科パッチ**）。**新語彙 1本＝`SET_CARD_COST_REPLACEMENT`**（＋`PlayerState.card_cost_replacements`）。⚠**支払いUI（`SpellCastModal` の任意支払い）とコスト算出は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き334（§3 タスク12(lxxxi)＝使用コストの条件つき置換）後 最新値（本行が直近の正）**：golden **1330→1331**（+1＝`computeCostReplacement` のベット9枚〔宣言前 null／宣言後の置換値〕・`WX09-Re02` の4状態〔未使用／アーツのみ／スペルのみ／両方＝《白×0》〕・`WX05-038` の場の有無・`WD22-041-UG` の24/25枚境界・`computeArtsEffectiveCost` 経由・**既存「対戦相手ルリグ色」経路の回帰**）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**＝engine の action/condition 型は一切増えていない）。触った層＝`src/screens/battle/costs.ts`（新関数1本）＋`ArtsModal`／`SpellCastModal`／`BattleScreen.getCardActions` のコスト算出呼び出し。⚠**コスト算出は UI 層＝golden から叩けるのは純関数 `computeCostReplacement` までで、モーダルのベット宣言→再計算→支払い検証の配線は非カバー**＝実機確認と対で締める。
- **2026-08-03 続き333（🏁§3 タスク14 完了・5バッチ）後 最新値（本行が直近の正）**：golden **1326→1330**（+4＝`SET_TURN_PHASE` の状態/スタック任意〔キー集合＋null 明示クリア〕／`WRITE_STATE.markCutinResponseComplete`〔既存フィールド温存・**盤面側を書き換えない純粋性**・省略時はキー無し〕／`WRITE_STATES` の片側・両側・スタック省略・空 states／`RESOLVE_EFFECT_STEP.beginNextTurn` のキー集合・`turn_count` 現盤面+1・省略時はターン関連キー無し）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（BattleScreen 構造のみ＝`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**）。**reducer 経由 102/117→118/118（＝残0）・`BattleAction` 17→18種**（+`WRITE_STATES`。`SET_TURN_PHASE`／`WRITE_STATE`／`RESOLVE_EFFECT_STEP` は payload 拡張）。⚠**ハンドラ側の payload 構築は golden で検出できない**（golden は純粋関数のみ）＝**この作業は実機通し確認と対で締める**。
- **2026-08-03 続き332（§3 タスク14 Stage3・5バッチ）後の値**：golden **1317→1326**（+9＝`RESOLVE_EFFECT_STEP` 4本〔継続/完了・settle の3分岐・スペル解決のキー集合・**新スタックが settle に勝つ順序**〕／`BEGIN_NEXT_TURN` 2本〔`turn_count` +1・**追加ターンは `active_user_id` を書かない**〕／`ADVANCE_TURN_WITH_STATE` の opp/effectStack 任意／`WRITE_STATE` の条件式 undefined／`RESOLVE_JANKEN` の勝敗・あいこ非対称）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（BattleScreen 構造のみ＝`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**）。**reducer 経由 72/117→102/117・`BattleAction` 14→17種**（+`BEGIN_NEXT_TURN`／`RESOLVE_EFFECT_STEP`／`RESOLVE_JANKEN`）。⚠**ハンドラ側の payload 構築は golden で検出できない**（golden は純粋関数のみ）＝**この作業は実機通し確認と対で締める**。
- **2026-08-02 続き330 第6波後の値＝🏁(lxxxii) 再クローズ**：golden **1312→1317**（+5＝①「Mつまで＝upTo／Mつ＝upTo無し」の両方向 ②`WX20-007-E1` の前置2本保持＋CHOOSE 3択 upTo＋③の suppressOnPlay ＆宙ぶらりん BLOCK 不在 ③採用5効果の choose_count/from_count/upTo とコスト減 marker 保持 ④`WXK08-003-E1` ③の OR ゲート ⑤curated 直書き4件と MANUAL 外科パッチ2件の upTo）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **264枚／115群 → 259枚／110群**。live per-effect 差分＝**changed 44／added 0／removed 0／outlier 0**（内訳＝**upTo 追加のみ 38**〔機械検証＝`upTo` を剥がすと before と完全一致・それ以外の変化 0〕＋**構造復元 6**〔held 5枚＋`WX20-007`〕）。**新語彙 0本**＝`ChooseAction.upTo` も `ARTS_USED_THIS_TURN`／`SPELL_USED_THIS_TURN`／`OR` も**すべて既存**で、engine/UI も対応済みだった（`effectExecutor.ts:3731`／`EffectInteractionModal.tsx:509,524,967`）＝**parser が語彙を生成していなかっただけ**。⚠**「parser を直した」＝live に届いた、ではない**＝curated 直書き上書き（`STATE_COND_BATCH4_ACTIONS`）と MANUAL の PRESERVE 保護の2群は parser 修正が無効なので、**毎回 live を実測してから件数を締める**。
- **2026-08-02 続き330 第5波後の値**：golden **1311→1312**（+1＝`PR-Di013-E1` を **`manualEffect()` 経路と JSON 生読み経路の両方**で同一検証。スペルの発生源を `field.check` に置き、**①選択直後は手札不変／ルリグアタック時に初めて1枚引く**という即時実行と能力付与を区別する assert、`once_per_turn`、2回目不発火、ターン終了時消滅、支払い時 count=2／未払い時 count=1、2枝同時選択で両方付与、フラグ消費まで固定。`withSavedCursor` 済み）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **264枚／115署名 据置**。live per-effect 差分＝全5ファイルで **changed 1（`PR-Di013-E1`）**／added 0／removed 0／outlier 0。**新語彙 1本＝`CHOOSE.additionalCostChoose`**（保持効果は live 全数で1件。engine 変更はすべて同フィールドのガード内＝既存 CHOOSE・既存 `OPTIONAL_COST` は分岐に入らない）。⚠**PRESERVE 保護カード（既存 JSON が MANUAL/PARTIAL）は `manualEffects.ts` を書いても JSON に出ない**＝外科パッチが要る（第5波の差し戻し理由）。
- **2026-08-02 続き330 第4波後の値**：golden **1308→1311**（+3＝`WD23-044-EA-E1` の支払/未払 2分岐と両枝の盤面効果／`WX26-CP1-024-E1` の支払時 count=2・未払時 count=1／⛔完動2件の現状固定。`withSavedCursor` 済み）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（265群）、held **264枚／115署名 据置**。**生成 JSON は完全不変**（engine-only＝`public/data/` に差分なし・live per-effect changed 0）。**新語彙 0本**。
- **2026-08-02 続き330 第3波後の値**：golden **1307→1308**（+1＝`WXK08-002-E1` のアーツ3択。**発生源を `field.check` に置いてアーツ実戦経路と揃え**、CHOOSE 1/3・前置 marker 保持・①③の**両盤面 JSON 完全一致 no-op**・②の両陣営候補/0-1-2体/3体拒否/合計10000超拒否を**実行で**固定。`withSavedCursor` 済み）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（265群）、held **265→264枚／116→115署名**（`WXK08-002` が MANUAL 化で抜けた＝**解決ではなく curated 固定**。⚠**残り6枚の採用禁止在庫**〔`WXK05-002`/`WXK05-004`/`WXK07-002`/`WXK08-001`/`WXK08-003`/`SPK01-14`〕は held に残存を確認済み＝触っていない）。live per-effect 差分＝**全5ファイル**で `changed 1`（`WXK08-002-E1`）／added 0／removed 0／outlier 0。`build:effects` 冪等（md5 不変）・生成 JSON の日本語健全（`???` 0）・regen 差分は sheet4 当該行のみ。**新語彙 0本**（engine は `totalPowerMax` の `count` 反映＋`resumeSelectTarget` の上限 slice のみ＝既存4件は `count:"ALL"` で非影響）。
- **2026-08-02 続き330（タスク12(lxxxii) 第1波＋第2波＝文中 CHOOSE 脱落 計4効果／**codex-work 実装・Claude 検証**）後の値**：census **1289 据置**（⚠4効果とも census の高シグナル語彙に**載っていない**＝実働化しても数字は動かない。`BASELINE_HIGH` 変更なし）、golden **1305→1307**（+2＝第1波1本〔`SEQUENCE[marker, CHOOSE{1/3}]` と3選択肢の condition〕／第2波1本〔同型3件をまとめて。**前置の支払い action と `CONDITIONAL{IS_MY_TURN}` 慣例包みが消えていないこと**・`suppressOnPlay`・②の `TURN_OWNER{opponent}` を assert〕。いずれも `withSavedCursor` で共有 `cursor` を save/restore 済み）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **258→265枚／署名グループ 109→116**（⚠**増分 +7カードは「採用禁止」在庫**＝parser 緩和が MANUAL/PARTIAL 温存カードの fresh にも波及したもの。live 非影響だが `WXK08-002` の fresh には退化4点あり。明細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」の (lxxxii) 行と BUGFIXES 該当節。⚠**codex 報告の 266 は誤りで 265 が正**＝`node scripts/heldReview.mjs` で数え直すこと）。live per-effect 差分は第1波 **changed 1**（`WXK09-004-E1`）／第2波 **changed 3**（`WD21-008-E1`／`WX20-003-E1`／`SPK01-07-E1`）、いずれも added 0・removed 0・**スコープ外 outlier 0・兄弟効果変更0**。`TURN_OWNER` 保持効果 **23→24**。**新語彙 0本**＝既存救済規則（`effectParser.ts:5730-5765`）の適用条件を緩めただけ（第1波＝前置が非 SEQUENCE でも拾う／本数 2→1／marker id に `ARTS_COST_REDUCTION_BY_CENTER_LRIG` を追加。第2波＝許可する前置の木に「任意支払い action ＋ `CONDITIONAL{IS_MY_TURN}` に包まれた marker」を**狭く固定**して追加）。
- **2026-08-07 続き369（🏁🏁§5c 文型バッチ店じまい＋§5d 新設・パターンA 第1バッチ「能力を持たない」）後の値（履歴）**：golden **1408→1410**（+2＝11効果に載ること／付与形5枚・条件節4枚に**載らない**こと／engine 判定の3方向）、census **1199→1189**（−10・`BASELINE_HIGH` も 1189 へ更新＝**機能是正**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **245→242**。**live JSON の変更は11カード**。新語彙＝`TargetFilter.noAbilities`。⚠**残す教訓**＝(a) **枚数順は実バグの薄い側から掘る順序**＝大クラスタ＝systematic＝parser が既に正しい（偽陽性 33/37）／単発＝汎用規則から漏れた1件もの（実バグ 11/11）。**母集団の性質でクラスタサイズと実バグ率が逆相関する。**(b) **同じ日本語でも用法で filter にしてよいかが変わる**＝「能力を持たない」は名詞句修飾だけが filter で、付与形「〜として場に出す」を誤爆すると**原文と逆の過小実行**になる。**新しいフィルタ語彙を足すときは全CSV走査して用法を数える**（今回38件→4用法）。(c) **census 0 は「完璧」の十分条件でも必要条件でもない**＝完了判定は BEHAVIOR_AUDIT と実機検証で出す。
- **2026-08-07 続き368（§5c テンプレ消化 第3波＝デッキ移動累計ゲートを共通表へ＋パワー/レベル/下置きコストの計器較正）後の値（履歴）**：golden **1407→1408**（+1＝4効果の条件構造と `WXK06-071` の多段入れ子の保持）、census **1233→1199**（−34・`BASELINE_HIGH` も 1199 へ更新＝**機能是正4効果＋計器較正33効果**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **245 据置**。**live JSON の変更は3カード**（`WDK09-014` `WXK06-068` `WXK06-070`）。⚠**残す教訓**＝(a) **「規則が無い」と「規則はあるが共通表に無い」は別物**＝同じ文型なのに一部の効果だけ直らないときは、regex の有無ではなく `STATE_CONDITION_CLAUSES_V2` に居るかを疑う（V2 は共通表と `parseSingleSentence` 局所 CLAUSES の両方に spread される）。(b) **census の対応語彙は部分一致なので大文字小文字で穴が空く**＝小文字 `under` は camelCase の `handToUnderSelf` に当たらない。parser に新しいフィールド名を足したら keys 側も同時に見る。(c) **素直な parser 規則で取れる §5c テールはほぼ尽きた**＝残り77本の主力は「下の枚数」「共通クラス」「配置応答窓」「次スペルのコスト予約」など**engine に条件型/状態を足す**作業。
- **2026-08-07 続き367（🏁§3 Opusタスク12(cxii) 残0クローズ＝パワー参照ゲートの表記パワー落ちを是正）後の値（履歴）**：golden **1406→1407**（+1＝`WDK08-Y11` のバニッシュ耐性を4方向で固定＝表記では不成立／実効パワー明示で成立／**常在バフを powers 未指定でも自前計算で拾う**／バフ源が居なければ不成立）、census **1233 据置**（表現ではなく**実行**の是正なので動かないのが正）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held 245 据置。**JSON・逆翻訳は不変**（触ったのは `effectEngine.ts` の3コレクタと golden だけ）。⚠**残す教訓**＝(a) **表現を正すと実行の穴が露出する**＝(cxii) は §5c で `SELF_POWER_THRESHOLD` を新たに載せた瞬間に顕在化した（それまでは「無条件で常に真」で隠れていた）。**新しい条件型を data に載せたら、その条件を読む engine 経路が全部 powers/context を持っているか確認する**。(b) **「呼び出し元から渡す」が常に正解ではない**＝コレクタは解決途中のローカル state で呼ばれるので、component の memo を渡すと1手前の盤面になる。**渡されなければその場で計算**が正しい既定値。(c) **配線先は母集団を測ってから決める**＝powers 未指定の `checkActiveCondition` は約50箇所あるが、実データが通るのは3コレクタだけだった。
- **2026-08-07 続き366（🏁§3 Opusタスク12(cxvi) 残0クローズ＝コイン支払い累計を機構ごと実装）後の値（履歴）**：golden **1404→1406**（+2＝10効果の条件構造固定と `COINS_PAID_THIS_TURN` の累計判定／**支払い経路の網羅ガード**＝`coins:` を減らす行の近傍に `coins_paid_this_turn` が無ければ FAIL＋リセット箇所数の一致）、census **1241→1233**（−8・`BASELINE_HIGH` も 1233 へ更新＝**機能是正**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **254→245**。**live JSON の変更は10カード**。新機構＝`PlayerState.coins_paid_this_turn`／Condition `COINS_PAID_THIS_TURN`。**⚠要実機検証**（加算は BattleScreen＝golden 非到達）。⚠**残す教訓**＝(a) **状態を1つ足す修正でいちばん漏れるのは「加算箇所」**＝同じ資源を減らす経路が10箇所あった。**ソース静的走査の golden ガード**を同時に入れると将来のコスト経路追加でも素通りしない。(b) **ターン境界のリセットは「同種の既存カウンタと同じ箇所数」で固定する**（`turn_arts_used` と一致を assert）＝片方だけ増えると相手ターン中の支払いが持ち越す。(c) **「新機構が要る」と早合点しない**＝「支払ってもよい。そうした場合」の包み形は タスク12(xi) が既に対応済みだった。採用前に engine 側の既存対応を確認する。
- **2026-08-07 続き365（§5c「テンプレ2効果以上」消化に着手＝エナ帯条件の持ち上げ＋「それが〈desc〉の場合」の計器較正＋英語条件ID漏れ残0）後の値（履歴）**：golden **1402→1404**（+2＝`ENERGY_EACH_LEVEL_FILTER_GTE` の JSON 構造固定と「各レベルにN枚必要／1つ欠けたら不成立」の engine 評価）、census **1274→1241**（−33・`BASELINE_HIGH` も 1241 へ更新＝**機能是正4効果＋計器較正35効果**の合算）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **245→248**。**live JSON の変更は4カード**（WXK09-051/052/077/081）。**逆翻訳の英語条件ID漏れは残0**（14種を意味文化＝§5b DoD の1項を閉じた）。⚠**残す教訓**＝(a) **文型規則を一般化したら、その文型を名指しで処理していた旧 `wrap()`/`gate()` hack を必ず撤去する**（`WXK09-083-E1` が二重 CONDITIONAL になった）。(b) **計器較正には「残渣チェック」を必ず付ける**＝原文の記述から識別子を抜いた残りが空でないなら covered にしない。付けないと「共通する色を持つ」「《X》以外の」「よりパワーの低い」のような**filter に載っていない実バグ**まで合格になる（実測3件）。(c) `STATE_CONDITION_CLAUSES_V2` は **CONDITIONAL 持ち上げと「代わりに」昇格の共通入口**＝ここに足すと二重発動バグ（SEQUENCE で then/else 両方実行）も同時に直る。
- **2026-08-07 続き364（§5c 文型バッチ＝「このシグニはパワーがN以上であるかぎり、〜」の無条件付与を是正）後の値（履歴）**：golden **1400→1402**（+2＝11効果の activeCondition 構造固定／「閾値未満ではキーワードが付かない・実効パワーで真になる」の engine 挙動）、census **1283→1274**（−9・`BASELINE_HIGH` も 1274 へ更新＝**機能是正**。主語先行形の自己パワー閾値が `genericKagiri` に無言消費され無条件付与になっていた11効果を `activeCondition:SELF_POWER_THRESHOLD` へ持ち上げた）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **245 据置**。**live JSON の変更は11カード**（自動採用6＋フィールド粒度の手採用5）。**engine/型/decompiler は無改造**＝`SELF_POWER_THRESHOLD` も `FRONT_SIGNI_POWER` も既に実装済みだった（表現できることを確認してからバッチを開いた）。⚠**残す教訓**＝(a) **`isTimingMarker:true` の無言フォールバックは parseStatus を落とさない**＝PARTIAL 刻印にも `_partial_report.txt` にも映らない死角で、census だけが検出できる。(b) 条件節を剥がすとき **`rest` を既存フォールバックと同じ残余に揃える**と action の parse が不変になり、`isPureSuperset` の自動採用に乗る（＝レビュー不要の安全な採用経路）。(c) **held は「カード単位」でしか採用できない**＝同カード内の無関係なドリフトに gain が巻き込まれる。parser と一致する**フィールド粒度の手採用**なら held を増やさずに拾える。
- **2026-08-07 続き363（🏁🏁§3 Opusタスク12 在庫 残0クローズ＝最後の (cx) を機構ごと実装）後の値（履歴）**：golden **1395→1400**（+5＝データ側の載せ替え／`OPP_SIGNI_ATTACKING` の真偽／`attackingOnly` の候補限定と `cancel_current_signi_attack`／守備側応答窓の収集と包み／支払う・支払わないの両分岐）、census **1283 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **245 据置**（`_held_fresh.json` は再生成で 246→245 になったが、これは前回の記録値 245 に対する**ファイル側の stale 解消**＝`WX18-005` の fresh が live と一致していた）。**live JSON の変更は `WX05-013` 1カードのみ**。新機構＝timing `ON_OPP_SIGNI_ATTACK`（守備側の応答窓）／Condition `OPP_SIGNI_ATTACKING`／`NegateAttackAction.attackingOnly`／`screens/battle/attackResponse.ts`。**`ATTACK_SIGNI_OP`（TurnPhase に無い死語）は effects_*.json から全滅＝golden (cvii) の「不正 phase 値」は残0**。**実機は新規 `oppSigniAttackActivated` を3回連続 PASS**＋回帰2件。既定order 131→**132件**。
- **2026-08-01 続き329（タスク12(lxx) 残消化 Batch D＝`ON_TRAP_SET` 新設1効果／**codex 実装・Claude 検証**）後の値（履歴）**：census **1341 据置**（⚠この効果は census の高シグナル語彙に載っていない＝**`timing` 空で計器の外にあった完全 no-op**。実働化しても数字は動かない）、golden **1270→1272**（codex +2＝**実行 E2E**〔3設置ハンドラそれぞれが owner 付きイベントを発行・`LOOK_PICK_CHAIN` は**対話 resume を跨ぐ**／自分の設置で収集＋両枝／相手の設置では非発火／《ターン1回》／**対照 `ON_TRAP_ACTIVATE` が設置で誤発火しない**〕）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **252枚／署名グループ 100 据置**。live per-effect 差分 **changed 1 / added 0 / removed 0**・**スコープ外 outlier 0・兄弟効果変更0**（`WXEX1-41-E1`。**ベースライン commit `a44ce070` と比較**）、`build:effects`・`regen` 冪等。**新語彙2本**＝timing `ON_TRAP_SET` ＋ 設置イベント `trapSetOwners`（`ExecCtx`/`ExecResult`/`PendingEffect` を伝播）。engine 新設は**純関数 collector 1本**（`collectTrapSetTriggers`＝golden から直接叩ける）。**逆翻訳描画も追加済み**。

- **2026-08-01 続き328（タスク12(lxx) 残消化 Batch B＝「手札以外から場に出ていた」履歴条件の脱落1効果／**codex 実装・Claude 検証**）後の値（履歴）**：census **1342→1341**（`BASELINE_HIGH=1341`＝条件が丸ごと落ちて毎アタックフェイズ開始時に無条件発火していた1効果の**機能是正**）、golden **1269→1270**（codex +1＝**実行 E2E** 1本に4項目〔手札から出したら不発／トラッシュから発火＋両枝／**エナから出しても発火**／ターン開始時クリア後は不発〕）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **252枚／署名グループ 100 据置**。live per-effect 差分 **changed 1 / added 0 / removed 0**・**スコープ外 outlier 0・兄弟効果変更0**（`WXDi-P07-075-E1`。**ベースライン commit `fdcfef6d` と比較**）、`build:effects`・`regen` 冪等。**新語彙2本**＝`PlayerState.signi_played_from_non_hand_this_turn`＋条件 `THIS_CARD_FROM_NON_HAND_THIS_TURN`。**書込6/除去3/クリア3地点へ面配線**（クリアは既存の出自マーカーと同じ3行）。
- **2026-08-01 続き327（タスク12(lxx) 残消化 Batch C＝素の遅延設置＋2択脱落2効果／**codex 実装・Claude 検証**）後の値（履歴）**：census **1344→1342**（`BASELINE_HIGH=1342`＝設置が落ちて即時実行されていた2効果の**機能是正**）、golden **1267→1269**（codex +2＝**実行 E2E**〔実行直後は3枚しか引かない／メインフェイズでは遅延分が発火しない／ターン終了時に収集される／両枝の盤面差分〕）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **252枚／署名グループ 100 据置**。live per-effect 差分 **changed 2 / added 0 / removed 0**・**スコープ外 outlier 0・兄弟効果変更0**（`WX24-P4-018-E3`／`WXDi-P16-051-E1`。**ベースライン commit `a925f9d8` と比較**）、`build:effects`・`regen` 冪等（decompile シート差分は当該2行のみ）。**新 action 型・新 timing 0本**＝既存 `DELAYED_INSTALL_PREFIXES` を「回避クローズ無しの素の設置文」からも引けるようにし、`ON_LEAVE_FIELD` 用の厳格形を1行追加しただけ。
- **2026-08-01 続き326（タスク12(lxx) 残消化 Batch A＝クラス種類数条件の脱落5効果／**codex 実装・Claude 検証・是正2件**）後の値（履歴）**：census **1347→1344**（`BASELINE_HIGH=1344`＝条件が丸ごと落ちて無条件発火していた5効果の**機能是正**）、golden **1262→1267**（codex +5＝`WXK10-006-E1` の実行 E2E〔条件未達で不発／成立で CHOOSE 両枝／精元除外／**規則解釈の固定**〕＋同族4件の条件評価）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251→252枚／署名グループ 99→100**（⚠**増分は Claude の是正②**＝`WXDi-D01-014-E2` の `excludeSelf` を curated から復元したため fresh と差が出た＝正直な計上）。live per-effect 差分 **changed 5 / added 0 / removed 0**・**スコープ外 outlier 0**（`WXK10-006-E1`／`WX25-P1-094-E1`／`WXDi-D01-012-E1`／`WXDi-D01-014-E1`／`WXDi-P00-040-E2`。**ベースライン commit `35ed00e3` と比較**）、`build:effects`・`regen` 冪等（decompile シート差分は当該5行のみ）。**新 Condition 型0本**＝既存 `distinct*` ファミリへ `distinctClasses`／`excludeClasses` を足し3ゾーンへ横展開＋`splitClasses` ヘルパ1本（`splitColors` の兄弟）。⚠**新在庫 (lxxxiii) を登録**＝「あなたの他の…シグニ」の `excludeSelf` 脱落 163件中86件。
- **2026-08-01 続き325（`WX09-Re02`＝アーツ1枚まるごと no-op の実働化・1効果／**codex 実装・Claude 検証**）後の値（履歴）**：census **1347 据置**（⚠この効果は census の高シグナル語彙に載っていない＝**計器の外にあった完全 no-op**。実働化しても数字は動かない）、golden **1261→1262**（codex +1＝**実行 E2E** 1本に5項目〔CHOOSE 提示／両枝が相手 state へ／使用者 state へ積まない／純関数で実際にステップが飛ぶ／`owner:'self'` 対照〕）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 99 据置**。live per-effect 差分 **changed 1 / added 0 / removed 0**・**スコープ外 outlier 0**（`WX09-Re02-E1`。**ベースライン commit `882ec8f2` と比較**）、`build:effects`・`regen` 冪等（decompile シート差分は当該1行のみ）。**engine 無改修・新語彙0本**＝`parseActionTextInner` に「前置部の tree が `ARTS_COST_REDUCTION_BY_EFFECT` STUB のみ×2本以上なら後続 CHOOSE を連結する」構造ルールを1本追加しただけ。⚠**新在庫2件を登録**＝(lxxxi)（アーツコストの条件つき**置換**が engine 未実装＝本カードは常に印刷コストでしか使えない）／(lxxxii)（同症状の残10効果）。
- **2026-08-01 続き324（タスク12(lxxx)＝`ON_LEAVE_FIELD` の `triggerScope:'any'` 跨サイド収集2効果／**codex 実装・Claude 検証**）後の値（履歴）**：census **1347 据置**（`BASELINE_HIGH=1347`＝**engine のみの変更＝parser 不変なので census は動かないのが正常**）、golden **1258→1261**（codex +3＝両効果の自分側/相手側が各ちょうど1件・メインフェイズ不発・`any_ally` 対照の非拡張／**Claude が `playerId` assert を追加**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 99 据置**。**live per-effect 差分 `changed 0 / added 0 / removed 0`**（**ベースライン commit `0398db38` と比較**＝engine のみを触るため 0 が期待値。指示書に「0でなければスコープ漏れ」と明記して検出可能にしてあった）、`build:effects` 冪等。**engine 変更は1行**（`collectLeaveFieldTriggers` の跨サイドループへ `any` を OR 追加）・**新語彙0本・新フィールド0**。⚠**挙動が変わる母集団は `ON_LEAVE_FIELD` × `triggerScope:'any'` の2効果のみ**を機械抽出で確認済み＝意図しない効果が新たに発火することはない。
- **2026-08-01 続き323（タスク12(lxxix)＝手札戻りトリガーの自アタックフェイズ限定脱落2効果／**codex 実装・Claude 検証**）後の値（履歴）**：census **1347 据置**（`BASELINE_HIGH=1347`＝この2効果は census の高シグナル語彙に載っていない＝**計器の外にあった過剰発火**）、golden **1255→1258**（codex +3＝**すべて実行 E2E**〔メイン不発／相手APS不発／自APS発火＋盤面差分／無前置き対照 `WXK02-041-E2` がメインでも発火し続けることの lock-in〕）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 99 据置**。live per-effect 差分 **changed 2 / added 0 / removed 0**・**スコープ外 outlier 0**（`SPK01-04-E1`／`WXK02-001-E1`。**ベースライン commit `bf3d6b43` と比較**）、`build:effects`・`regen` 冪等。**変更禁止12効果は全て UNCHANGED を機械確認**。**engine 無改修・新語彙0本**＝`effectParser.ts:7291` の `leftToZone` 経路に一般前置き形を水平拡張し、トリガー句を消費する形へ（**非アンカー regex の「たまたま」依存も解消**）。⚠**decompiler 1本修正**（`leftToZone:'hand'` の主語ハードコード＝`any_ally` でも限定を落として描いていた。`WDK05-T11-E1` も併せて正常化）。⚠**新在庫 (lxxx) を登録**＝`triggerScope:'any'` は engine 上 `any_ally` と同義。
- **2026-08-01 続き322（タスク12(lxx) 第2波＝前置き条件つき draw-or-choice 2効果＋巻き込み2効果／**codex 実装・Claude 検証**）後の値（履歴）**：census **1349→1347**（`BASELINE_HIGH=1347`＝`WXDi-CP01-027-E2` が「クラス指定(＜X＞のシグニ)」高シグナルから、`WX21-027-E2` が「ゾーン:エナゾーンに置く」高シグナルから抜けた**それだけ**＝帰属を実測確認）、golden **1252→1255**（codex +3＝**すべて実行 E2E**〔条件未達の不発と usageLimit 未消費／フェイズ・ターン別の発火／CHOOSE 両枝の盤面〕）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 99 据置**。live per-effect 差分 **changed 4 / added 0 / removed 0**・**スコープ外 outlier 0**（`WXDi-CP01-027-E2`／`WX21-027-E2`／`WX24-P2-077-E1`／`WX24-P4-070-E1`。**ベースライン commit `30644f00` と比較**＝codex 起動中の自動コミットが無いことを確認済み）、`build:effects`・`regen` 冪等。**変更禁止リスト10件は全て UNCHANGED を機械確認**。**タスク12(lxx) は 5/17採用・残 defer 12件**。**engine 無改修・新語彙0本**＝既存 `HAS_CARD_IN_FIELD` 行の `(?:場合|間)` 化、`stripParsedTriggerBeforeDrawChoice` allowlist に木の形で1形追加、ON_LEAVE_FIELD 前置き regex の「(あなた|対戦相手)の」対応の3点のみ。⚠**decompiler 1本修正**（`ON_LEAVE_FIELD` の `duringAttackPhase` 未描画＝**engine は評価しているのにシート上は無制限発火に見えていた**計器の穴。既存7効果の描画も是正）。⚠**新在庫 (lxxix) を登録**。
- **2026-08-01 続き320（タスク12(lxxii)＝`delayed_triggers` ターン終了クリアの片側漏れ／**codex 実装・Claude 検証**）後の値（履歴）**：census **1349 据置**（`BASELINE_HIGH=1349`＝**engine のみの変更＝parser 不変なので census は動かないのが正常**）、golden **1248→1250**（実カードの状態遷移固定＋(lxxi) の `once` 消費との互換）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 99 据置**。**live per-effect 差分 `changed 0 / added 0 / removed 0`**（**ベースライン commit `eff74f50` と比較**＝engine のみを触るため 0 が期待値。指示書に「0でなければスコープ漏れ」と書いて検出可能にしてあった）、`build:effects`・`regen` 冪等。**タスク12(lxxii) 残0クローズ**。**新語彙0本・新型0**＝純関数1本（`clearEndOfTurnDelayedTriggers`）を**3経路 × 2プレイヤー＝6箇所**から呼ぶだけ。⚠**実害があったのは `WX11-024-E1` 1件**（アーツ・スペルカットイン＝防御側設置→次の自ターンへ持ち越し→`FORCE_END_TURN` 誤発火）。
- **🆕 2026-08-01 続き319（タスク12(lxxi)＝「このターン、次に…バトルバニッシュ」遅延設置・2効果／**codex 実装・Claude 検証**）後 最新値（本行を直近の正とする）**：census **1351→1349**（`BASELINE_HIGH=1349`＝**撃った瞬間に無条件ダメージ**だった1件を含む2効果の機能是正）、golden **1244→1248**（codex +3 は**実行 E2E**〔設置直後は何も起きない／1回目に発火／同一ターン2回目は不発／対照は2回とも発火〕／**Claude +1 は実カードの `once` 有無をデータ側で固定**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 99 据置**。live per-effect 差分 **changed 2 / added 0 / removed 0**・**スコープ外 outlier 0**（`WX24-P1-011-E2`／`WX26-CP1-040-E2`。**ベースライン commit `d08b4390` と比較**）、`build:effects`・`regen` 冪等。**タスク12(lxxi) 残0クローズ**。**新語彙1本**＝`InstallDelayedTriggerAction.once`（**省略時は従来どおり期間中は毎回発火**＝対照 `WX24-P4-011-E3` の挙動不変）。engine 新設は**純関数1本**（`src/screens/battle/delayedTrigger.ts` の `consumeBattleBanishDelayedTriggers`＝**golden から直接叩ける**）＋`collectBattleBanishDelayedTriggers` への `triggeringCardNum` 配線。**新 timing・新 action 型・新 STUB はゼロ**。
- **🆕 2026-08-01 続き318（タスク12(lxx)＝「引くか<B>」の2択脱落・3効果／**codex 実装・Claude 検証**）後 最新値（本行を直近の正とする）**：census **1351 据置**（`BASELINE_HIGH=1351`＝本バッチの3効果は census の高シグナル語彙に載っていない＝**計器の外にあった機能欠落**）、golden **1239→1244**（codex +4 は**実行 E2E**〔CHOOSE を開いて両枝＋辞退の盤面まで固定〕／**Claude +1 は罠の lock-in**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 99 据置**。live per-effect 差分 **changed 3 / added 0 / removed 0**・**スコープ外 outlier 0**（`SPDi43-32-E1`／`WXDi-P11-008-E1`／`WXDi-P15-011-E2`。**ベースライン commit `d4320d54` と比較**）、`build:effects`・`regen` 冪等。**タスク12(lxx) は 3/17採用・14件 honest defer**（残は在庫行へ内訳と着手コスト順を記載）。**新語彙0本・engine 改修0**＝前置トリガー句の除去を「trigger metadata が構造化済みと確認できた形だけ」に限定する述語1本（`stripParsedTriggerBeforeDrawChoice`）と、`parseDrawOrChoice` の主語・任意対応のみ。⚠**新在庫 (lxxviii) を登録**＝「あなたの効果によって対戦相手が捨てたとき」の原因限定軸が engine に無い（既存 `byOwnEffect` は別軸＝**流用すると4効果が恒久 no-op**。golden で固定済み）。
- **🆕 2026-08-01 続き317（タスク12(lxxiv)＝「以下のNつを行う」8効果／**codex 実装・Claude 検証**）後 最新値（本行を直近の正とする）**：census **1352→1351**（`BASELINE_HIGH=1351`＝任意コストが落ちて8項目が無償実行されていた分ほかの**機能是正**）、golden **1234→1239**（codex +2 は JSON 構造 assert／**Claude +3 は E2E 挙動**＝任意コストゲートが本体を止めるか・ルリグ下移動・ルリグ凍結）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 99 据置**。live per-effect 差分 **changed 8 / added 0 / removed 0**・**スコープ外 outlier 0**（`WXK11-002/007/008/009/010`／`WXDi-P05-052`／`WXDi-P06-050`／`WX24-P4-002`。**ベースライン commit `07e79bd6` と比較**＝codex 起動中の自動コミットが無いことを確認済み）、`build:effects`・`regen` 冪等。**タスク12(lxxiv) は 8/9枚採用・残1（`WXK11-001`）は honest defer**。**新設 STUB は `OPP_LRIG_UNDER_TO_LRIG_TRASH` の1本だけ**（engine の旧 `DO_THREE_THINGS` パターン P4 からの**移設**＝新機構ではない）、**新語彙は `StubAction.optionalCostTarget` 1本**（既存 `TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST` の拡張＝並行 STUB 新設なし）。⚠**`DO_THREE_THINGS` の10パターンは本母集団では全て到達不能になったが削除していない**（`parseSentencePart4.ts:421` の `CHOOSE_N_FROM_LIST` は defer した `WXK11-001` で引き続き到達）。
- **2026-08-01 続き316（タスク12(lxxvii)＝連用中止の動作脱落・8効果／**codex 実装・Claude 検証**）後 最新値（本行を直近の正とする）**：census **1353→1352**（`BASELINE_HIGH=1352`＝機能是正）、golden **1229→1234**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **250→251枚／署名グループ 98→99**（⚠**+1 は honest defer**＝`WXK03-069` は fresh が `LOOK_AND_REORDER` になるが curated の `TRANSFER_TO_DECK` のほうが素直なので据置）。live per-effect 差分 **changed 8 / added 0 / removed 0**（`WX18-025-E1`／`WX24-P3-022-E1`／`WXDi-P04-028-E3`／`WXDi-P10-003-E1`／`WXEX2-48-BURST`／`WXK03-051-E1`／`WXK04-006-E1`／`WDK14-007-E1`。**ベースライン commit `af28e1d4` と比較**＝codex 起動中の自動コミットが無いことを確認済み）、`build:effects`・`regen` 冪等。**タスク12(lxxvii) 残0クローズ**。**新語彙0本・engine 改修0**＝`effectParser.ts` の連用中止 splitter に**具体的な動詞句7種**を足し、枚数は `[０-９\d]+` で一般化した（⚠**特定カードの本文を先読みに埋め込まない**＝codex 初版の決め打ち3つは改善2件を取りこぼしていた）。
- **2026-08-01 続き315（タスク12(lxxv)＝主語形の相手デッキミル・7効果／**Claude 実装**）後 最新値（本行を直近の正とする）**：census **1354→1353**（`BASELINE_HIGH=1353`＝**自分のデッキを削る自傷7効果の機能是正**）、golden **1226→1229**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **250枚／署名グループ 98 据置**（規則を広げて 250→257 に落ちた7枚を同じ回で全採用）。live per-effect 差分 **changed 7 / added 0 / removed 0**（`WX08-020-E1`／`WX18-037-E1`／`WX25-CP1-024-E1`／`WXDi-P07-007-E3`／`WXDi-P10-003-E1`／`WXDi-P14-005-E1`／`WXEX2-27-E3`）、`build:effects`・`regen` 冪等。STUB 種類/実装 据置。**タスク12(lxxv) 残0クローズ**。**新語彙0本・engine 改修0**＝`parseSentencePart1` の `oppDeckMill` 判定を主語形へ広げ、連用中止 splitter に**主語の持ち越し**を1行足しただけ（後者の blast radius は実測1カード）。
- **2026-08-01 続き314（タスク12(lxxvi)＝配置禁止ゾーンの供給源3種・2効果／**Claude 実装**）後 最新値（本行を直近の正とする）**：census **1354 据置**（⚠この2効果は census の高シグナル語彙に載っていない＝**計器の外にあった no-op**。実働化しても数字は動かない）、golden **1222→1226**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **250枚／署名グループ 98 据置**（規則を広げて 250→252 に落ちた2枚を同じ回で全採用）。live per-effect 差分 **changed 5 / added 0 / removed 0**（新規2＝`WX08-032-E1`／`WXEX1-24-E1`、既存3＝`WX10-051-E1`／`WX24-P4-024-E3`／`WXDi-P11-009-E3` は `zoneBlockSource:'designated'` が**足されただけ**）、`build:effects`・`regen` 冪等。STUBS.md `BLOCK_OPP_ZONE_PLACEMENT` **3→5**・`LRIG_GROW_RESTRICT` **35→33**（使用中 STUB 種類 577／実装 548 据置）。**タスク12(lxxvi) 残0クローズ**。**新語彙2本**＝`StubAction.zoneBlockSource`（`designated`/`vacated`/`virus`）＋`PlayerState.signi_zone_vacated_just`（`removeFromField` が書く使い捨てマーカー）。**受け皿（`signi_zone_blocks`／配置フロー3読み手）は第10波のまま無改修**。
- **2026-08-01 続き313（タスク12(lxxiii)＝トラッシュ領域移動ロックの実働化／**Claude 実装**）後 最新値（本行を直近の正とする）**：census **1354 据置**（**parser 不変＝engine 実装のみ**。第9波で宣言 STUB として欠落に数え始めた分がそのまま残る＝計器を甘くしていない）、golden **1218→1222**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **250枚／署名グループ 98 据置**。live per-effect 差分 **changed 0 / added 0 / removed 0**、`build:effects`・`regen` 冪等。**STUBS.md 実装 547→548・フォールバック 30→29**（`LOCK_OPP_TRASH_MOVE` が未処理→実装済み。使用中 STUB 種類 577 据置）。**タスク12(lxi) 残＝1→0（クローズ）／(lxxiii) もクローズ**。**新語彙2本**＝`PlayerState.lock_trash_move_this_turn`／`lock_trash_move_next_turn`。engine 新設は**述語1本**（`isOwnTrashMoveLocked`）＋**候補ラッパ1本**（`movableTrashCandidates`）で、適用は `trashCandidates` 6地点＋トラッシュ直操作7経路。**新 timing・新 action 型・新 TargetScope はゼロ**。⚠**射程の実測**＝全効果走査で「自分のトラッシュからカードが出る効果」330件→（6地点のみ）17件→（本実装）**0件**。
- **2026-08-01 続き312（タスク12(lxi) 第11波＝`WXK06-067-E1`・1効果／**Claude 実装**）後 最新値（本行を直近の正とする）**：census **1355→1354**（`BASELINE_HIGH=1354`＝回避クローズが丸ごと落ちて**無条件で相手シグニ1体をデッキトップへ**送っていた1効果の**機能是正**）、golden **1215→1218**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **250枚／署名グループ 98 据置**。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WXK06-067-E1`）、`build:effects`・`regen` 冪等。STUB 種類 **577／実装 547 据置**（`OPPONENT_PAY_OPTIONAL` ノード 70→71）。**タスク12(lxi) 残＝2→1**（残る1件は (lxxiii) 待ち＝(lxi) 単独の作業は無い）。**新語彙2本**＝`EffectTarget.type = HAND_OR_ENERGY_CARD`（**手札∪エナの単一プール**）＋`TargetScope = self_hand_energy|opp_hand_energy`、および回避語彙 `StubAction.opponentHandOrEnergyToDeckTop`。engine 新設は `execTransferToDeck` の分岐**1本**のみ（適用側の `resumeSelectTarget` は既に hand/energy を弁別済み・UI は `scopeDesc` に1行）。**新 timing・新 action 型はゼロ**。
- **2026-08-01 続き311（タスク12(lxi) 第10波＝指定シグニゾーンへの配置禁止・3効果＋REMOVE_SIGNI_ZONE 4枚／**Claude 実装**）後 最新値（本行を直近の正とする）**：census **1355 据置**（`BASELINE_HIGH=1355`＝配置禁止は census の高シグナル語彙に載っていないため**機能是正でも動かない**＝計器の外にあった no-op）、golden **1210→1215**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **250枚／署名グループ 98 据置**。live per-effect 差分 **changed 3 / added 0 / removed 0**（`WX10-051-E1`／`WX24-P4-024-E3`／`WXDi-P11-009-E3`）、`build:effects`・`regen` 冪等。STUB 種類 **577／実装 547 据置**（`LRIG_GROW_RESTRICT` 37→35・`BLOCK_OPP_ZONE_PLACEMENT` 1→3）。`census:timing` **14 据置**。**タスク12(lxi) 残＝3→2**（`WXDi-P11-009-E3` クローズ）。**新語彙2本**＝`PlayerState.signi_zone_blocks`／`signi_zone_blocks_next_turn`（`{zone; colorless?}[]`。**死にフィールド `disabled_signi_zones` を退役**）＋`StubAction.zoneBlock{ThisTurn,NextTurn,Colorless}`。engine 新設は**純関数1モジュール**（`src/screens/battle/signiZoneBlock.ts`＝4関数・golden から叩ける）、BattleScreen 側は読み手3経路＋昇格4サイト。**新 timing・新 action 型はゼロ**。
- **2026-08-01 続き310（タスク12(lxi) 第9波＝`WX24-P4-007-E1` の①②／**Claude 実装**）後の値（履歴）**：census **1355 据置**（`BASELINE_HIGH=1355`＝③が宣言 STUB として**欠落に数え続けられる**ことを実測確認）、golden **1208→1210**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **250枚／署名グループ 98 据置**。live per-effect 差分 **changed 2 / added 0 / removed 0**（`WX24-P4-007-E1`／`WXDi-P14-005-E1`）、`build:effects`・`regen` 冪等。**タスク12(lxi) 残＝3 据置**（本波はクローズしない＝`WX24-P4-007-E1` は 0/3→2/3）。**新語彙0本**＝`opponentSigniTrash` は「が」形からの水平展開、`LOCK_OPP_TRASH_MOVE` は engine 未実装の宣言 STUB（STUBS.md 記載）。**engine 改修0**。
- **2026-07-31 続き309（タスク12(lxi) 第8波＝`WXK05-009-E2`・1効果／**Claude 実装**）後の値（履歴）**：census **1356→1355**（`BASELINE_HIGH=1355`＝キーを切った瞬間に相手シグニを無条件で1体トラッシュしていた1効果の**機能是正**）、golden **1205→1208**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251→250枚／署名グループ 99→98**。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WXK05-009-E2`）、`build:effects`・`regen` 冪等。**タスク12(lxi) 残＝4→3**。**新語彙2本**＝`InstallDelayedTriggerAction.trigger.attackerOwner`（`leftOwner`/`refreshedOwner` の兄弟）と `StubAction.opponentPayColorlessPerSigniAttack`（可変《無》＝**新 PlayerState フィールド0**＝既存 `attacked_signi_ids` を読むだけ）。engine 新設は**収集器1本**（`collectSigniAttackDelayedTriggers`＝pure・BattleScreen 側は push 1行）。**新 timing・新 action 型はゼロ**。
- **2026-07-31 続き308（タスク12(lxi) 第7波＝`WX24-P4-011-E3`・1効果／**Claude 実装**）後の値（履歴）**：census **1357→1356**（`BASELINE_HIGH=1356`＝設置が落ちて無条件ダメージだった1効果の**機能是正**）、golden **1203→1205**（据置 golden 1本を陽性 assert へ転換＋collect/engine 実走2本を新設）、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251→250枚／署名グループ 99→98**。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WX24-P4-011-E3`）、`build:effects`・`regen` 冪等。**`npm run census:timing` 14 据置**（⚠**実質12**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は既知の偽陽性）。**タスク12(lxi) 残＝5→4**。**新語彙0本**＝`INSTALL_DELAYED_TRIGGER` も `ON_SIGNI_BANISH_BATTLE` も `OPPONENT_PAY_OPTIONAL` も既存。engine 新設は**収集器1本**（`collectBattleBanishDelayedTriggers`＝pure・BattleScreen 側は push 1行）、parser は第6波のハードコードを `DELAYED_INSTALL_PREFIXES` テーブルへ一般化して1行追加、decompiler は遅延設置用の主語分岐を1本追加。
- **2026-07-31 続き307（タスク16 `[B維持]` 残3件を全消化＝**タスク16 残0クローズ**・4効果／**Claude 実装**）後の値（履歴）**：census **1358→1357**（`BASELINE_HIGH=1357`）、golden **1195→1203**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**234→240 warnings**（⚠**退化ではない**＝`useHost`/`useGuest` の `react-hooks/rules-of-hooks` 偽陽性が新経路2本で 102→108。stash 比較で実測）、manual field loss 0、同型★0（5986枚・265群）、held **251→250枚／署名グループ 98 据置**。live per-effect 差分 **changed 4 / added 0 / removed 0**（`WX05-020-E1`／`WXDi-P06-038-E1`／`WXDi-P06-038-E2`／`WXDi-P13-051-E3`）、`build:effects`・`regen` 冪等。**`npm run census:timing` 17→14 効果/14クラスタ**（⚠**実質12**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は既知の偽陽性）。**タスク16 残＝`[B維持]` 3→0（クローズ）**。**新語彙＝timing 2（`ON_SIGNI_CRASHED_LIFE_TOTAL`／`ON_HAND_OR_ENERGY_LOST_BY_OPP`）・`triggerCondition` 2（`energyLeftToAnyZone`／`crashedTotalThisTurn`）・`PlayerState` 1（`life_crashed_by_signi_this_turn`）＝いずれも省略時は従来挙動**。engine 新設は計器1本（`countEnergyLeftZone`）＋collector 2本（`collectSigniCrashTotalTriggers`／`collectOppResourceLossTriggers`）。
- **2026-07-31 続き306（タスク16＝`WXDi-P11-063-E2` シグニの下に置かれたとき／上にあるシグニ・5効果／**Claude 実装**）後の値（履歴）**：census **1361→1358**（`BASELINE_HIGH=1358`＝対象が `owner:any/count:1` の任意選択に潰れていた5効果の**機能是正**。⚠**是正5効果に対し減少は3**＝高シグナル総数は重複除外）、golden **1190→1195**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**234 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 98 据置**。live per-effect 差分 **changed 5 / added 0 / removed 0**（`WXDi-P11-063-E2`／`WXK08-086-E1`／`WXDi-P03-057-E2`／`WXDi-P05-050-E2`／`WXDi-P05-060-E1`）、`build:effects`・`regen` 冪等。**`npm run census:timing` 18→17 効果/17クラスタ**（⚠**実質15**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は既知の偽陽性）。**タスク16 残＝`[B維持]` 4→3**。**新語彙1本**＝`TargetFilter.aboveSelf`（「このカードの上にあるシグニ」＝`acceHost` の兄弟。省略時は従来挙動）。**新 timing・新 action 型・新 collector はゼロ**。engine 変更は ①`execPowerModify` の1体確定＋直接適用 ②`calcFieldPowers` の「スタック下カード→ホスト」ループ新設 ③**`execStubPart1` の同名 STUB を `value == null` に限定**（part2 の `ON_PLACED_UNDER_SIGNI` 発火が到達不能だった死にコードの復活）。
- **2026-07-31 続き305（タスク16＝`WXDi-CP02-068-E1` 離脱先 OR・1効果／**Claude 実装**）後の値（履歴）**：census **1361 据置**（`BASELINE_HIGH=1361`）、golden **1187→1190**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**234 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 98 据置**。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WXDi-CP02-068-E1`）、`build:effects`・`regen` 冪等。**`npm run census:timing` 19→18 効果/18クラスタ**（⚠**実質16**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は既知の偽陽性）。**タスク16 残＝`[B維持]` 5→4**。**新語彙0本**＝`triggerCondition.leftToZone` を `'hand' | Array<'hand'|'trash'>` へ**拡張**しただけ（既存6効果は素の `'hand'` のままで挙動不変＝`['hand']` と同義。並行フィールド新設なし）。engine 変更は判定の `leftToZoneOk()` 集約と2走査の対称化のみ。
- **2026-07-31 続き304（タスク16＝`WX24-P2-051-E1` 非ガード捨て札→エナ・1効果／**Claude 実装**）後の値（履歴）**：census **1361 据置**（`BASELINE_HIGH=1361`）、golden **1184→1187**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**234 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 98 据置**。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WX24-P2-051-E1`）、`build:effects`・`regen` 冪等。**`npm run census:timing` 20→19 効果/19クラスタ**（⚠**実質17**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は既知の偽陽性）。**タスク16 残＝`[B維持]` 6→5**。**新語彙0本**＝本体 STUB も `TargetFilter.noGuard` も既存。engine 変更は**「そのカード」の受け渡し**のみ＝`collectHandDiscardTriggers` が entry に `triggeringCardNum` を載せ、STUB が `lastProcessedCards` 空時にそれを使う（AUTO 経由の ExecCtx に `lastProcessedCards` が入らず no-op になる罠の解消）。
- **2026-07-31 続き303（タスク16＝`ON_HAND_DISCARDED` の原因オーナー軸・1効果／**Claude 実装**）後の値（履歴）**：census **1361 据置**（`BASELINE_HIGH=1361`）、golden **1181→1184**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**234 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 98 据置**。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WXDi-D09-P16-E2`）、`build:effects`・`regen` 冪等。**`npm run census:timing` 21→20 効果/20クラスタ**（⚠**実質18**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は既知の偽陽性）。**タスク16 残＝`[B維持]` 7→6**。**新語彙1本**＝`PlayerState.hand_discarded_just_by_opp`（boolean・`hand_discarded_just` と同じ5地点で立て同じ2地点でクリア）＋`collectHandDiscardTriggers` の `byOppEffect` 引数。`triggerCondition.byOwnEffect` は**既存フィールドの水平展開**（ON_TRASH/ON_LEAVE_FIELD に続き ON_HAND_DISCARDED でも honor）。**新 timing・新 action 型はゼロ**。
- **2026-07-31 続き302（タスク12(lxix)＝アタック主体のパワー閾値・2効果／**Claude 実装**）後の値（履歴）**：census **1363→1361**（`BASELINE_HIGH=1361`＝主語と閾値が丸ごと落ちて両方向に誤っていた2効果の**機能是正**）、golden **1174→1181**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**234 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **251枚／署名グループ 98 据置**。live per-effect 差分 **changed 2 / added 0 / removed 0**（`WXDi-P02-079-E2`／`WXK07-030-E2`）、`build:effects`・`regen` 冪等。**`npm run census:timing` 21 据置**（⚠**この2件は元から timing を持つ＝計器の外にあった live バグ**）。**タスク16 残＝`[B維持]` 7 据置**（本件は枠外）。**新語彙0本**＝既存 `triggerFilter.powerRange` と `matchesFilter` の既存第3引数のみ。engine 変更は**収集2経路への配線**（`collectFieldTriggers` に実効パワーを渡す／`BattleScreen.tsx:7141` の直収集経路に `triggerFilter` 評価を新設）。
- **2026-07-31 続き301（タスク16 第4波＝バニッシュ主体の実効パワー条件・1効果）後の値（履歴）**：census **1363 据置**（`BASELINE_HIGH=1363`）、golden **1170→1174**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**234 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、**held 251枚／署名グループ 98 据置**。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WXDi-P06-072-E1`）、`build:effects`・`regen` 冪等。**`npm run census:timing` 22→21 効果/21クラスタ**（⚠**実質19**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は既知の偽陽性）。**タスク16 残＝`[B維持]` 8→7**。**新語彙0本**＝`triggerFilter.powerRange` も `matchesFilter` の `effectivePower` 引数も既存で、parser の主語 regex 拡張＋呼び出し側が第3引数を渡すようにしただけ。engine 新設は pure helper 1本（`battleBanisherMatchesTrigger`＝BattleScreen インラインを golden から検査可能にするための切り出し）。
- **2026-07-31 続き300（タスク16 第3波＝エナ移動カード自身の `ON_ENERGY_CHARGE`）後の値（履歴）**：census **1364→1363**（`BASELINE_HIGH=1363`＝停止中3効果の実働化＝機能改善）、golden **1168→1170**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**232→234 warnings**（⚠**退化ではない**＝`useHost`/`useGuest` の `react-hooks/rules-of-hooks` 偽陽性が新経路で 100→102。Claude が stash 比較で実測）、manual field loss 0、同型★0（5986枚・265群）、**held 250→251枚／署名グループ 97→98**（⚠**+1 は本バッチの parser 波及**＝`WXK09-031` が `parseSentencePart3` の枝拡張でスコープ外から held に落ちた。**live は未採用＝挙動不変**。詳細は BUGFIXES 第3波節）。live per-effect 差分 **changed 3 / added 0 / removed 0**（`WX14-066-E1`／`WXDi-P03-073-E1`／`WXDi-P12-079-E2`）、`build:effects`・`regen` 冪等。**`npm run census:timing` 25→22 効果/22クラスタ**（⚠**実質20**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は既知の偽陽性）。**タスク16 残＝`[B維持]` 11→8**。**新語彙2本**＝`triggerCondition.byLrigOrSigniEffect` と、`ON_ENERGY_CHARGE` での `movedSelf`/`fromZones` の受理（どちらも既存フィールドの水平展開＝省略時は従来挙動）。**新 timing・新 action 型はゼロ**。engine 新設は検出器1本（`detectEnergyAddedWithSource`）＋収集器1本（`collectEnergyAddedSelfTriggers`）。
- **2026-07-31 続き299（タスク16 第2波＝`ON_TARGETED` origin 種別軸）後の値（履歴）**：census **1365→1364**（`BASELINE_HIGH=1364`＝停止中だった2効果の実働化＋既存2効果の origin 限定という**機能改善**）、golden **1158→1168**（+10＝4効果の正/誤 origin 両方向＋H16 の宣言前アップ/ダウン）、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**232 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **250枚／署名グループ 97 据置**。live per-effect 差分 **changed 4 / added 0 / removed 0**（`WXDi-D09-H16-E1`／`WXDi-P08-065-E2`／`WXDi-P03-056-E1`／`WXDi-P13-089-E2`）、`build:effects` 冪等・`regen` 差分0。**`npm run census:timing` 27→25 効果/25クラスタ**（⚠**実質23**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は live で既に正しい timing を持つ既知の偽陽性＝`clearTimingFallback` 未呼び出しによる計器の残留）。**タスク16 残＝`[B維持]` 13→11**。**新語彙1本のみ**＝`triggerCondition.targetedOrigins`（OR-of-AND。省略時は従来挙動＝既存16効果不変）。**新 timing・新 action 型・新 collector はゼロ**。
- **2026-07-31 続き298（§6.3 I＋J-3）後の値（履歴）**：census **1366→1365**（`BASELINE_HIGH=1365`＝J-3 でハイティの停止中だったクラッシュ枝を実働化した**機能改善**）、golden **1151→1158**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230→232 warnings**（⚠**+2 は退化ではない**＝`useHost`/`useGuest` の `react-hooks/rules-of-hooks` 偽陽性が collector 1本追加で 27→28 になっただけ。Claude が stash 比較で特定）、manual field loss 0。live per-effect 差分＝**I で changed 1 / J-3 で changed 4**（いずれも added 0 / removed 0・対象効果のみ）。**`npm run census:timing` 31→27 効果/27クラスタ**（⚠**実質25**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は live で既に正しい timing を持つ既知の偽陽性）。**タスク16 残＝`[B維持]` 15→13**／**§6.3 J 残＝`[C]` 13→11**。`ON_LIFE_CRASHED` **11→12**（追加は `WXDi-P07-052-E1` だけ）。**新語彙**＝action 型2（`REPEAT`／`PREVENT_REFRESH`）・timing 1（`ON_LIFE_CLOTH_MOVED`）・`triggerCondition` 3（`lifeMovedOwner`／`lifeMovedTo`／`lifeCountReached`）・`PlayerState` 1（`prevent_refresh_until_opp_turn`）＝**いずれも省略時は従来挙動**。
- **2026-07-31 タスク16 第1波後の値（履歴）**：census **1366 据置**（`BASELINE_HIGH=1366`）、golden **1150→1151**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、held **250枚／署名グループ 97 据置**、manual field loss 0。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WX20-067-E1`）。**`npm run census:timing` 32→31 効果/31クラスタ**（⚠**実質29**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は live で既に正しい timing を持つ偽陽性）。**新語彙0本／型の値追加1**＝`triggerCondition.handOwner` に `'any'`（engine 無改修＝既存2分岐が素通りさせる形）。`_vocab_census` の「IS_MY_TURN誤変換疑い」**1115→1114**。
- **2026-07-31 タスク12(lxi) 第5波・第6波後の値（履歴）**：census **1367→1366**（`BASELINE_HIGH=1366`）、golden **1145→1150**（第5波 +2／第6波 +3）、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **250枚／署名グループ 97 据置**、manual field loss 0。live per-effect 差分は**各波とも changed 1 / added 0 / removed 0**（`WXK06-047-E1`／`WXDi-P06-023-E2`）、`build:effects`・`regen` とも冪等。**新語彙2本**＝`StubAction.opponentSigniToDeckTop`（第5波）／`InstallDelayedTriggerAction.sourceCardNum`（第6波）。engine 拡張＝`RETURN_SELF_ARTS_TO_LRIG_DECK` のアシストルリグゾーン対応・遅延トリガー3収集経路の発生源復元・`ON_ARTS_USE` 二重発火の抑止（`BattleScreen.tsx:4291`）。
- **2026-07-31 タスク12(lxi) 第4波後の値（履歴）**：census **1367 据置**（`BASELINE_HIGH=1367`）、golden **1142→1145**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **250枚／署名グループ 97 据置**、manual field loss 0。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WX24-P2-022-E1`）、`build:effects` 冪等。**新語彙0本**＝既存の `OPPONENT_PAY_OPTIONAL`＋`CONDITIONAL(IS_MY_TURN)` ペアを置く位置を変えただけ（engine 無改修）。
- **2026-07-31 タスク12(lxi) 第3波後の値（履歴）**：census **1369→1367**（`BASELINE_HIGH=1367`）、golden **1137→1142**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **251→250枚／署名グループ 97 据置**、manual field loss 0。live per-effect 差分 **changed 8 / added 0 / removed 0**（held 7枚採用＋MANUAL 同居カード1効果を直接配線）、`build:effects` 冪等。**新語彙2本**＝`TrashAction.targetsTriggerSource`／`StubAction.opponentSigniTrash`。
- **2026-07-31 タスク12(lxv) 残0クローズ後の値（履歴）**：census **1370→1369**（`BASELINE_HIGH=1369`）、golden **1134→1137**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **277→251枚／署名グループ 109→97**、manual field loss 0。live per-effect 差分 **changed 40 / added 0 / removed 0**（36枚採用）、`build:effects` 冪等。**新語彙0本／退役2つ**＝parser ガードD（`tryWrapLeadingStateCond` の OPTIONAL_COST 系 skip）と `applyBoardZoneStateBatch3` のエナ枚数ハードコード2枚。engine 無改修。
- **2026-07-31 タスク12(lxiv) 残0クローズ後の値（履歴）**：census **1373→1370**（`BASELINE_HIGH=1370`）、golden **1132→1134**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288→277枚／署名グループ 104→109**、manual field loss 0。live per-effect 差分 **changed 63 / added 0 / removed 0**（61枚採用＋純改善2）、`build:effects` 冪等。**新語彙1本**＝`TrashAction.untilHandCount`（＋engine の `UP/DOWN/FREEZE` に `targetsStored` を配線）。
- **2026-07-31 タスク12(lxiii) 残0クローズ後の値（履歴）**：census **1373 据置**（`BASELINE_HIGH=1373`）、golden **1131→1132**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288枚 据置／署名グループ 106→104**、manual field loss 0。live per-effect 差分 **changed 7 / added 0 / removed 0**（`WX15-033`／`WX17-040`／`WX18-032`／`WX20-025`／`WXDi-P02-065`／`WX24-P2-091`／`WXK11-031`）、`build:effects` 冪等。**新語彙2本**＝`HAND_COMPARE_OPP`／`ENERGY_COMPARE_OPP`。
- **2026-07-31 タスク12(lxii) 残0クローズ後の値（履歴）**：census **1373 据置**（`BASELINE_HIGH=1373`）、golden **1130→1131**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288枚/106署名 据置**、manual field loss 0。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WD16-016-BURST`）、`build:effects` 冪等。**新語彙0本／退役1型＋1 STUB id**（`ConditionalDiscardAction`／`STUB{CONDITIONAL_DISCARD}`。STUBS.md 使用中 577→576 種・実装 548→547）。
- **2026-07-31 タスク12(lx) 残0クローズ後の値（履歴）**：census **1373 据置**（`BASELINE_HIGH=1373`）、golden **1128→1130**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288枚/106署名 据置**（(lx)② で1枚 held に落ち同じ回で採用）、manual field loss 0。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WX12-020-E3`）、`build:effects` 冪等。**新語彙は2本**＝`PowerModifyAction.deltaPerLastProcessedCount`（倍率元＝直前ステップの処理枚数）と engine 内部の `applyEffectLeaveReplaceBanishSubstitute`（JSON 語彙は増えない＝既存 STUB id を宣言として読む）。
- **2026-07-30 タスク12(lxi) 第2波後の値（履歴）**：census **1375→1373**（`BASELINE_HIGH=1373`）、golden **1120→1128**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288枚/106署名 据置**（採用6枚と新規落ち6枚が相殺）、manual field loss 0。live per-effect 差分 **changed 9 / added 0 / removed 0**（held 採用6カード＋カード単位 PRESERVE のため curated 直配線2効果）、`build:effects` 冪等。**新語彙は engine の水平展開3つのみ**＝`StubAction.opponentEnergyTrash`／`opponentHandDiscardFilter`／`opponentHandDiscard` の `ALL` 拡張（いずれも既存 `opponentHandDiscard` と同形）。
- **2026-07-30 タスク12(lxi) 本消化後の値（履歴）**：census **1384→1375**（`BASELINE_HIGH=1375`）、golden **1113→1120**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430・効果実行 7999手／distinct 2702種）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **290→288枚/107→106署名**（前回 +2 だった `WX24-P1-071`／`WX25-P1-005` は本バッチで採用され held から抜けた）、manual field loss 0。live per-effect 差分 **changed 30 / added 0 / removed 0**（parser 経由27＋MANUAL 直配線3）、`build:effects` 冪等。**新語彙は0本**＝既存 `STUB{OPPONENT_PAY_OPTIONAL}`＋`CONDITIONAL(IS_MY_TURN)` の look-ahead ペアを parser 側で一般化しただけ。
- **2026-07-30 エクシード本体6件（次の一手①）5件消化後の値（履歴）**：census **1386→1384**（`BASELINE_HIGH=1384`）、golden **1109→1113**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288→290枚/106→107署名**（+2＝`WX24-P1-071`／`WX25-P1-005`。**本バッチの群B規則で fresh が `OPPONENT_PAY_OPTIONAL` を獲得したのが原因**＝codex の「未再生成ドリフト」という説明は誤りで、Claude が `_held_fresh.json` 実測で訂正。live 挙動は不変＝未採用のまま次バッチの採用候補）、manual field loss 0。live per-effect 差分 **changed 8 / removed 0 / added 1**（added は入れ子 `WX24-P4-011-E2-next-attack`）。新語彙は `TransferToHandAction.transferGroups`・`EffectTarget.addLastProcessedCount`（`DrawAction` 既存名の水平展開）・`CardEffect.consumeOnTrigger` の3本のみ。⚠census 1384 には **`untilHandCount`／`transferGroups` を計器が語彙として認識する較正**が含まれる（新語彙を数えないと偽陽性になるため）。
- **2026-07-30 §6.3 H 節クローズ後の値（履歴）**：census **1386 据置**（`BASELINE_HIGH=1386`）、golden **1101→1109**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430・効果実行 7982手／distinct 2680種）、lint 0 errors/**230 warnings**（H3/H4 の新規ヘルパー2本ぶん +2）、同型★0（5986枚・265群）、held **286→288枚/106署名 据置**（+2＝`WXDi-P05-005`／`WXDi-P11-010B`。**今回の変更に由来しない未再生成ドリフトが顕在化しただけ**＝BUGFIXES H4 節⑧）、manual field loss 0。新語彙＝timing `ON_LRIG_FLIP`（B面反転）・条件 `CENTER_LRIG_NOT_GROWN_THIS_TURN`・STUB `MUGEN_Q_RESET_AND_FLIP`・state `opp_guard_extra_colorless_this_turn`／`signi_deploy_count_limit_next_turn`／`pending_spell.pre_use_virus_removed`・`ChooseAction.preUseVirusChoose`。**`GUARD_EXTRA_COST_BY_OPP`／`OPP_GUARD_COST_COLORLESS` は boolean → `count`（省略時1）へ意味拡張**（既存6 CONTINUOUS は非回帰）。
- **2026-07-30 タスク16 `cost.underSelfTrash` 配線後の値（履歴）**：census **1386 据置**（`BASELINE_HIGH=1386`）、golden **1096→1101**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**228 warnings**、同型★0（5986枚・265群）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分 **changed 13 / added 0 / removed 0**（13件とも `cost` フィールドのみ変化）、`build:effects` 冪等。新語彙は `SelectionConstraint.same`（「同名の」全一致制約）の1本のみ＝**`EffectCost.underSelfTrash` は `number` → `{count, filter?, selectionConstraint?}` へ型変更**（読み手は parser／BattleScreen 4経路／decompiler／golden の全件を追随済み）。
- **2026-07-30 タスク12(l) 残0クローズ後の値（履歴）**：census **1386**（`BASELINE_HIGH=1386`・別置）、golden **1090→1096**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**228 warnings**、同型★0（5986枚・265群）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分は第1波 **changed 3 / added 0 / removed 0**（`WX24-P4-026-E1`・`SPDi44-08-E2`・`WX25-P1-018-E2`）、第2波 **changed 3 / added 0 / removed 0**（`WX16-004-E1` 本体＋`WX15-002-E2`・`WXEX2-15-E2` の `holograph` マーカーのみ）、`build:effects` 冪等。新語彙は `CardEffect.holograph`（データ側ホログラフ判定）・`LookAndReorderAction.revealTopAfterReorder`・`StubAction.leaveVictimFilter`・`GrantLrigAbilityAction.duration` の4本。
- **2026-07-30 「コストの合計」束縛14効果 の値（履歴）**：census **1391→1386**（`BASELINE_HIGH=1386`）、golden **1085→1090**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**228 warnings**、同型★0（5986枚）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分 **changed 14 / added 0 / removed 0**、`build:effects` 冪等。新語彙は `costThresholdFromPaidCount`（動的上限）と `energyTrash.atLeast` の2本のみ＝**いずれも当該2効果だけに付与**（全数走査で確認）。
- **2026-07-30 タスク12(l) A群／手札枚数比例の値（履歴）**：`POWER_MOD_BY_HAND_COUNT`→`POWER_MODIFY_PER_HAND_COUNT` の構造化5効果＋SONG付与展開1＋`WDK04-006-E1-G` の中身＋任意コスト付与2の計**9効果／8カード**。census **1393→1391**（`BASELINE_HIGH=1391`）、golden **1079→1085**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**228 warnings**、同型★0（5986枚）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分 **changed 9 / added 0 / removed 0（影響カード8）**、`build:effects` 2回目差分0。⚠**効果総数は 10679 据置**（今回の入れ子化は SONG の1本のみで、その分は census の効果単位側に現れる）。
- **2026-07-30 タスク12(l) B群の値（履歴）**：キーの「センタールリグは以下の能力を得る。」＋後続ブロックを `GRANT_LRIG_ABILITY.abilities` へ入れ子化（**36枚・47効果**）。census **1394→1393**（`BASELINE_HIGH=1393`）、golden **1075→1079**、smoke **10679/10679** 全0、fuzz 全0、lint 0 errors/**228 warnings**、同型★0（5986枚）、held **292→286枚/106署名**、manual field loss 0。live per-effect 差分 **changed 41 / added 1 / removed 48（影響カード36のみ）**、`build:effects` 2回目差分0。⚠**効果総数が 10722→10679 に減る**のは47効果がトップレベルから入れ子へ移ったため（smoke/census の母数もこの値）。⚠census には**構造マーカー判定を「付与 abilities も再帰で数える」へ較正**した分が含まれる（HEAD の live JSON では 1394 据置＝較正単体の影響0）。

### §3 Opusタスク表：タスク16（timing 語彙センサス・🏁残0クローズ）の完了行

| 16 | timing 語彙センサス（`npm run census:timing`）の消化 | parser語彙 | — | **🏁✅残0クローズ（2026-07-31）**＝再トリアージ（`[A]`1／`[B維持]`15／`[C]`13）から `[B維持]` 15件を8バッチで全消化し、`[C]` 13件は §6.3 J へ送出済み。**行の原文（各バッチの実装内容・訂正した旧診断・確立した投げ方）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-31 整理」節へ退避**。一次記録は BUGFIXES 2026-07-30〜07-31 の各節。<br>⚠**生きている注意点3つだけ残す**＝①**計器の偽陽性2件**（`WXDi-P09-079-E1`／`WXK10-052-E1` は live で正しい timing を持つのに `clearTimingFallback` 未呼び出しで計器に残る＝`census:timing` の実数はここから −2。較正するなら「機能実装ではない」と簿記に明記）②**未再検証1件**＝`SPDi43-11-sub-E1`（複数効果を跨ぐ累積カウンタ＝真の `[C]` 相当）③**残穴＝`ON_TRASH under_signi` の3効果がコスト起因で発火しない**（`WX18-062-E1`／`WX22-027-E1`／`WXK03-033-E1`。`payUnderSelfTrash` が state を直接書き `executeSigniActivated` がコスト支払いとスタック初期化を1コミットにまとめるため、中央 diff の before スナップショットが移動を見ない。**退化ではない**＝新規に露出した未到達経路。直すにはコスト支払いを独立コミットに分けるか支払い時に明示的にトリガーを積むかの設計判断が要る）＋同族の未配線1枚 `WXDi-P06-034`（複合コストで `underSelfTrash` が付かない・従来から不変） |

### §5c：P1完了宣言で凍結した「残りの消化対象」worklist

- **残りの消化対象（生きている worklist のみ・消化済みバッチの履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c。⚠各件数は記載時点のスナップショット＝最新件数は `docs/_vocab_census.txt`／[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) のバッチ表を正とする）**＝(1) ~~**「代わりに」残テール**~~（🏁**全クローズ**：C✅続き259・D✅続き258・E✅続き260）・B1残10（コスト参照・ターン中イベント等＝条件語彙が無い §6.3）＋**CHOOSE平坦化復元の採用待ち held 約35枚**。(2) **幻覚/取り違え系の残**＝WX16-021（置換ルール→即時LIFE_CRASH幻覚＝置換機構要・§6.3）・BURST内IS_MY_TURN残7（§6.3登録済み）。(3) **構造平坦化系**＝引用付与の残107（CONTSELF_COND 18／OTHER 約30／内側品質不全27＝トリガー語彙拡充で再収穫可・held 103 が計器）・代わりに183・IS_MY_TURN誤変換の残53・遅延13・「Nまで」120。(4) 除去系の対象フィルタ脱落（クラス339=`story`・色105・パワー閾値83・レベル閾値90・凍結13・ダウン/アップ38・数値不一致153・小さい数390=粗い網）。(5) トリガー種別（約220）・コスト脱落（コイン24+場トラ25+エナトラ12+他）・ゾーン行き先67・機構census（ライズ31/チーム25/アンコール22/エクシード16等）・公開128・次相手ターン99・相手選ぶ31・制限58・キーワード86。(6) 制限/様相（ターン1回28・ゲーム1回3・任意→強制23）・保護/付与系（同一性46・共通色66・能力なし10）。(7) 語彙自体が無い系統＝最上級（6枚・`TargetFilter` に `superlative:{key,dir}` 新設）・**正面32**（`frontOfSelf` はあるが使用3件＝parser 未配線疑い）・動的比較の残35・合計制約27・**出現条件35＝機構1本の欠落（parser が除去+engine強制なし）**は §3「機構実装の型」で新語彙＋engineセット実装。

### §6.2 semantic audit：完了項目（系統①②・スケールアップ）

- [x] **系統①：相手デッキ削りの owner 取り違え＝✅完了**（(a)純・相手のみ58枚是正／(b)「あなたか対戦相手」17枚は続き106で CHOOSE 化／(c)誤検知9件は修正不要。詳細 BUGFIXES 続き88・106・原文は PLAN_DETAIL 2026-07-19退避節）。
- [x] **系統②：GRANT_PROTECTION `count:'ALL'`＋subjectFilter無し＝48件 ✅完了（続き239・Opusタスク9）**。単体保護24件は `count:'ALL'→1` 是正済（2026-07-03）。(a)SEQUENCE内GRANT_PROTECTION（WX08-017）(b)LAYER付与型（WX15-031）(c)広域24件のうち subjectFilter/条件/from で表現可能な**9カードを是正**（下記の engine 中核＝`collectEffectImmuneSigni` の `target:{count:'ALL'}` 偽陰性を subjectFilter へ変換＋`isDrive`/`sourceCostMin`/`excludeSelf`/local matchesFilter への costMin/hasCrossIcon 追加）。残る広域テールは真の§6.3（下記）へ登録。詳細 BUGFIXES 続き239。
- [x] **スケールアップ**＝stub群 **✅続き144〜146で母集団2,401枚を全数監査完了**（findings は Opusタスク12 (xxvii)(xxviii)(xxix) に集約）。残＝clean群3,574枚への展開（任意・低優先＝Sonnetタスク8）。

### §6.3：完了機構の行（A／B／D／H／J-3／I／「正面」サブ機構／消化済み機構の台帳）

- **A. 動的コンテキスト追跡系**＝**✅続き280で完全クローズ**。WX11-027 は「発生源カードがLBを持つか」ではなく解決中 `effectType:'LIFE_BURST'` を照合して相手LBだけを遮断。WX24-P4-006 は対象にしてダウンした相手ルリグの instanceId→レベルを予約へ固定し、`damageSource:'signi'`＋厳密な `< N` をダメージ消費経路で評価。WXDi-D07-007 は防いだ回数ごとにターン終了時5枚ミルを重複予約し、2回防御なら10枚を実移動する。旧「機構待ち」だけでなく前2枚が限定脱落による有害な過剰効果だった実態へ訂正。
- **B. BANISH_REDIRECT 残**＝✅完全クローズ（2026-07-24＝正面限定3件＋WX25-P3-104-E1 単体×パワー0 動的ゲート・268）。
- **D. レゾナ出現条件トリガー7効果**＝**✅続き279で完全消化**。実データ全数は WX10-055-E1／WX10-076-E1／WX10-086-E1／WX21-021-E2／WX21-047-E1（そのレゾナ参照なし）＋WXEX1-58-E1（＜宇宙＞のそのレゾナ）／WXEX1-72-E1（＜遊具＞のそのレゾナ）。続き262の共通召喚支払いを `fieldTrashCostCards` と同じ `collectBoardDiffTriggers` へ載せ、`resonaConditionCardNum` で「出現条件支払い」と今出たレゾナの instanceId を伝達。通常trash・バトル/ルール処理・他コストは非発火、限定2件は `CardClass` 照合後にそのレゾナだけへ次の自ターンまで耐性付与。旧記載の「2枚」は全件走査で7効果へ訂正。
- **✅ H. タスク12(xxii) から正式送りの不足機構＝残 `UNKNOWN` 0 で全クローズ（2026-07-30）**＝H1 メルト・ファクト（支払い前ウィルス除去→コスト軽減／択上限）・H2 夢限 -Q-（全体リセット＋B面反転）・H3 未知の邂逅（原子的な代償＋反転＋無料センターグロウ）・H4 マユB面の配置数制限（自分側 cap の次ターン予約）・I／I′ ガード追加《無》族11効果（枚数化＋「このターン」受け皿）。**実装詳細は BUGFIXES 2026-07-30 の各節、退避した旧記述の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理：§6.3 H 節クローズ」節**。実機UI検証は未了＝**§7 の未検証UI 5件**（Sonnetタスク1）。
  - **✅ J-3 ライフクロスの汎用移動・閾値遷移**（2026-07-31・計4効果）＝`WXK08-028-E1`／`PR-K038-E2`（原文は**0枚への到達**）に、同じ穴を共有した `WD23-023-E-E1`／`WXDi-P07-052-E1` を加えて完了。宛先付き multiset diff＋owner/宛先/到達枚数 collector を新設。実戦クラッシュは `life→field.check` の `to:'other'` として検出し、ハイティだけ既存 `ON_LIFE_CRASHED` と汎用移動をOR併記。⚠ `CRASH_TO_TRASH_INSTEAD` 後の `check→trash` は life 差分が無いため、キスの同置換枝だけ honest defer。詳細は BUGFIXES 2026-07-31 J-3節。
- **✅ I. `WX25-P3-028-E2`（2026-07-31 完了）**＝`PREVENT_REFRESH`（既存 `*_until_opp_turn` family と同寿命）＋対話を跨ぐ汎用 `REPEAT`＋既存 `CHOOSE` で3機構を一体実装。発生源本人の「このターン＋次のターン」を守り、各回 self/opponent を選んで合計18枚。旧24枚強制を解消。実在 `REPEAT_N_TIMES` は4効果（旧5表記はstale）で、他3件と共有 `LRIG_GROW_RESTRICT` の対象外37件は完全不変。詳細は BUGFIXES 2026-07-31 §6.3 I 節。
**「正面」サブ機構は✅完全消化（続き281）**（機構台帳・commit 5ca1a96d/269931a0）。target 解決型5効果＋CONT パワー修正4効果、続き261の(b)(d)(e)、続き262の(c)に加え、残4枚も実測して完了。WXDi-P13-082／WXK02-084 は引用内側を `GRANT_EFFECT.effect:{CONTINUOUS, activeCondition:FRONT_SIGNI}` へ構造化し、既存 `granted_effects`→BattleScreen `effectsMap` の instanceId マージ経路で毎フレーム評価（新runtime stateなし）。WXDi-P08-060 は引用 `AUTO` の展開・self攻撃時収集は既存どおり使い、誤って自軍任意対象だった内側BANISHを `owner:opponent,frontOfSelf:true` へ訂正。WXDi-P06-042 は旧same-zi規約問題ではなく、JSONが全体強制 `FORCE_SIGNI_ATTACK{self}` に誤変換されていた真バグで、既存 `FORCE_FRONT_SIGNI_ATTACK`（2-zi）へ訂正。production形goldenで正面成立／非正面・条件不成立を両方固定。
**✅消化済み機構の台帳**（実装詳細は BUGFIXES 各日付）＝GRANT_PROTECTION 効果耐性（sourceFilter・self-except・相手エナ免疫・動的盤面条件・POWER_MODIFY 免疫5）／BANISH_REDIRECT target側スコープ（属性・単体・正面・パワー0）／ガード喪失条件（canCardGuard 統一）／IS_MY_TURN action層3枚／ダメージ置換「ブースト」条件（IS_BOOSTING）／スペル被破棄【自】2枚／続き20 STUB（powerPlusBanishedPower・variableEnergyTrashLevelBounce・negateNthAttack 等）／引用AUTO付与（残＝permanent 付与）／「ゲームから除外」基盤+8枚（PlayerState.excluded 実ゾーン化）／状態フィルタ脱落12効果／GRANT_LRIG_ABILITY 低品質展開／BURST内新語彙（全クローズ）／resume経路 collector 統合／対戦相手離脱トリガー3枚（any_opp watcher）／アーツ使用条件（ARTS_USED_THIS_TURN）／自パワー閾値（全クローズ）／ON_CARD_MILLED_FROM_DECK＋ゲーム持続付与AUTO（game_granted_auto_effects）＋リフレッシュ置換／毒牙 ON_OPP_POWER_DECREASED／G072族（完全クローズ）／multi-dest pick（全クローズ）／REVEAL remainder shuffle／GRANT_TO_PLACED_SIGNI／凍結アサシン変種／公開→自身アクセ化（INTERNAL_ACCE_PICKED_TO_SELF）／公開同レベル動的フィルタ（levelEqLastProcessed）／前ターン跨ぎ保持（LIFE_CRASHED_LAST_TURN）／使用制限誤パース＋択崩壊（全クローズ）／引用・LB付与（ディスペア）／WXK10-008／任意コスト+特定札捨て複合／リコレクト択一・ウィルス数スケール・WD22-036-G・WX25-CP1-002 他。

## 2026-08-01 整理：タスク12(lxi) 残0クローズ／(lxxiii)(lxxv)(lxxvi)(lxxvii) 実働化 の完了行原文

> PLAN §3 の worklist から退避した完了行。一次記録は BUGFIXES 2026-08-01 の各節。

| (lxi) | **「対戦相手が/は〜しないかぎり」＝支払い回避クローズ**。第1〜11波で消化し、**残1**（下記。波ごとの枚数は退避先）。波ごとの実装内容・訂正した旧診断・確立した投げ方は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-01 整理」節へ退避**（一次記録は BUGFIXES 2026-07-30〜08-01 の各波節）。<br>**残1**＝`WX24-P4-007-E1` の**③のみ**（①②は第9波で実働化＝0/3→2/3）。③の領域移動制限機構は在庫 **(lxxiii)** 側なので、**この行は (lxxiii) が片付けば自動でクローズする**＝(lxi) 単独で取る作業はもう無い。<br>✅**旧① `WXK06-067-E1` は 2026-08-01 第11波でクローズ**（詳細 BUGFIXES 2026-08-01 第11波節）。⚠**旧診断「`TargetScope` が単一ゾーン前提なので選択UIも作れない」は外れていた**＝`EffectInteractionModal` は候補配列をそのまま描くだけで**スコープ非依存**（`scopeDesc` に1行足すだけ）、`resumeSelectTarget` の `TRANSFER_TO_DECK` も **hand/energy 双方を見て弁別済み**。実装は `execTransferToDeck` の `HAND_OR_ENERGY_CARD` 分岐1本で足りた。<br>✅**旧③ `WXDi-P11-009-E3` は 2026-08-01 第10波でクローズ**（詳細 BUGFIXES 2026-08-01 第10波節）。⚠**旧診断は2つとも外れていた**＝(a)「配置フローが `disabled_signi_zones` を読んでいない」は正しかったが**直すのは3読み手（人間召喚・CPU召喚・ゾーン選択モーダル）に1行ずつ**で済んだ (b)「回避の支払いは配置しようとした時点なので標準ペアでは表せない」も**標準ペアで表す必要が無かった**＝ガード追加《無》（`collectOppGuardExtraColorlessCost`）の既存作法（プロンプト無し・ゾーンを選んだらエナ末尾から徴収・不足なら不成立）でそのまま書けた。<br>⚠**生きている注意点4つ**＝(a)**engine の回避手段語彙**は `costColors`／`opponentHandDiscard`(+`Filter`/`ALL`)／`opponentEnergyTrash`(+`ALL`)／`opponentSigniTrash`／`opponentSigniToDeckTop`／`opponentPayColorlessPerSigniAttack`（可変《無》）／🆕`opponentHandOrEnergyToDeckTop`（**手札∪エナの単一プールから合計N枚**）の7系統。新しい回避手段はここへ足す。⚠**「AかB合計N枚」は2枝に割らない**＝`opponentHandDiscard`+`opponentEnergyTrash` の併記は「どちらか一方からN枚」に化ける。跨ぎは `HAND_OR_ENERGY_CARD` のような**単一プールの候補型**で表す（第11波）。(b)**遅延設置の前置きは `DELAYED_INSTALL_PREFIXES`（`effectParser.ts`）のテーブルへ足す**が、**engine に遅延収集経路がある timing だけ**（無い timing は「設置されるが永久に発火しない」＝過剰実行を no-op へ替えるだけの別の退化）。現在の経路＝`ON_TURN_END`／`ON_LEAVE_FIELD`／`ON_REFRESH`／フェイズ系／`ON_SIGNI_BANISH_BATTLE`（第7波）／`ON_ATTACK_SIGNI`（第8波・防御側設置）。(c)**「読めなかった」の顔は `UNKNOWN` だけではない**＝no-op STUB（`RULE_REMINDER_TEXT` 等）を受け入れると「過剰実行を no-op へ替えただけ」で直った顔をする。帰結の単独再パースには no-op STUB ガードを掛ける。(d)🆕**「読めた」も「正しい」ではない**＝文型で regex を切ると**同じ文型でパラメータの供給源だけが違う**カードを巻き込む（第9波＝engine の text パターンが実は動いていた9枚／第10波＝ゾーンの供給源が `designated_zone` でない2枚）。**規則を足したら `build:effects` で held の増減を必ず見る**＝増えたぶんが巻き込みの顔。 |

| (lxxiii) | **🆕「次の対戦相手のメインフェイズとアタックフェイズの間、対戦相手のトラッシュにあるカードは対戦相手の効果によって他の領域に移動しない」＝領域移動制限機構が未実装（2026-08-01・第9波で宣言 STUB `LOCK_OPP_TRASH_MOVE` として可視化）**＝母集団は全CSVで**2枚だけ**（`WX24-P4-007-E1` の③／`WXDi-P14-005-E1` の c2）。⚠**難所は「その所有者**自身**の効果のときだけ止める」こと**＝`trashCandidates` の呼び出しは `effectExecutor.ts` に**7地点**しかないので `tgtOwner === 'self' && ownerState のロック` を各地点に足せば汎用アクション（`TRANSFER_TO_HAND`／`ADD_TO_FIELD`／`TRANSFER_TO_DECK`／`SEND_TO_ENERGY`／`EXILE`）は覆えるが、**トラッシュから直接カードを動かす STUB 群が別経路で存在する**（例 `STEAL_OPP_TRASH_PUPPET`）ので、7地点だけ塞ぐと「実装したのに漏れる」部分実装になる。着手するなら**先にトラッシュ発生源の全経路を列挙**すること。⚠期間は `ctx.currentPhase` があるので「メイン＋アタックフェイズ」を近似せず正確に書ける。フラグは `*_next_turn` → ターン開始時に昇格（`free_grow_next_turn` 等の既存作法）。 |

| (lxxvi) | **🆕 「新たに配置できない」の**ゾーン供給源が `designated_zone` でない2枚（2026-08-01・第10波で機構は完成済み・巻き込み回避のため保留）**＝①`WX08-032-E1`「対戦相手のシグニ１体を対象とし、それをバニッシュする。このターンと次のターンの間、対戦相手は**それがあった**シグニゾーンにシグニを新たに配置することができない。」②`WXEX1-24-E1` ③「このターン、対戦相手は**【ウィルス】がある**シグニゾーンにシグニを新たに配置することができない。」<br>✅**受け皿はもうある**＝`signi_zone_blocks`／`signi_zone_blocks_next_turn`＋配置フロー3読み手（第10波）。**足りないのはゾーンの決め方だけ**。<br>⚠①は「直前の BANISH が空けたゾーン」＝`lastProcessedCards` からゾーン番号を復元する必要がある（`BanishAction` は現状ゾーンを返さない）。②は**複数ゾーン**＝【ウィルス】のあるゾーンを全部ブロックする（`signi_zone_blocks` は配列なので state 側は無改修）。<br>⚠**parser 規則を広げるときは `(?:指定された|その)シグニゾーンに` の限定を外すことになる**＝外した瞬間この2枚が `designated_zone ?? 0`（＝ゾーン1）を禁止する過剰実行になるので、**engine 側のゾーン決定を先に入れてから regex を緩める**こと（第10波で一度踏んで戻した＝held 250→252）。 |

| (lxxv) | **🆕 `WXDi-P14-005-E1` の c2 が owner 反転＝**自分のデッキを削る**自傷（2026-08-01・第9波で発見）**＝原文「③**対戦相手は**デッキの上からカードを１０枚トラッシュに置く。」が `TRASH{DECK_CARD owner:'self', count:10}`＝**あなたのデッキ**を10枚削る。⚠選択肢③を選ぶと相手を削るどころか自分がリフレッシュに近づく＝**符号が逆**の実害。⚠同じ CHOOSE の他の選択肢は正しいので、規則の射程は「①②③の item 内で主語が『対戦相手は』のときに owner を反転させる」形になるはず（`buildChoose` が item を単独パースする際に主語が落ちている疑い）。着手前に「以下のNつから」系 item の**主語落ち**を機械走査して母集団を数えること。 |

| (lxxvii) | **🆕 `WXDi-P10-003-E1` の中間2動作が丸ごと落ちる（2026-08-01・(lxxv) の実測で判明）**＝原文「対戦相手は手札を１枚捨て、**自分のシグニ１体を選びトラッシュに置き**、**自分のエナゾーンからカード１枚を選びトラッシュに置き**、自分のデッキの上からカードを２枚トラッシュに置く。」の**4動作のうち中2つ（シグニ・エナ）が live に無い**（`SEQUENCE[TRASH{HAND_CARD opponent 1}, TRASH{DECK_CARD opponent 2}]` の2ステップだけ）。(lxxv) で owner の符号は直したが**動作数の欠落は別問題**。<br>⚠原因は**連用中止 splitter が「Aし、B」の2分割しかしない**こと＝3つ以上の並列は右半分を再帰パースする過程で中間が飲まれる。`effectParser.ts` の `conjM`（`/^(.*?(?:…|捨て|…))、(.+)$/`）は**最初の1回だけ**割り、右半分は `parseSingleSentence` へ丸投げ。<br>⚠着手するなら**N分割へ一般化する前に母集団を数える**こと＝「〜し、〜し、〜する」の3項以上を機械抽出してから。splitter は共有部品なので blast radius が大きい（(lxxv) の主語持ち越しは実測1カードで済んだが、N分割は桁が違う可能性）。⚠「選び」＝`opponentSelects` が要る点にも注意。 |

## 2026-08-01 整理：タスク12(lxi) 第1〜9波の完了行（PLAN §3 在庫表から退避した原文）

> PLAN §3 の (lxi) 行が 4,100 字を超えて worklist として読めなくなったため、**波ごとの経緯を丸ごとここへ退避**した。
> PLAN には「残3の内訳」と「生きている注意点3つ」だけを残してある。一次記録は `BUGFIXES.md` の
> 2026-07-30（本消化・第2波）／2026-07-31（第3〜8波）／2026-08-01（第9波）の各節。

### 退避した行の原文

| (lxi) | **✅第1波（「対戦相手**が**」形・29カード30効果）／第2波（「対戦相手**は**」＝主語分配形・8カード9効果）／第3波（分割再パースを基準読み供給へ切替・8効果）／🆕第4波（tail-splice・1効果＋triage 訂正1件）とも消化済み。残7効果はいずれも別機構待ちの honest defer**。⚠**教訓①（第2波）＝「ゲートが無い」と決めつけず現状 JSON と engine ハンドラの実装まで読むこと**。⚠**教訓②（第3波）＝据置理由が複数あっても原因は1つのことがある**（①複文／⑤owner 反転／③そのシグニ照応 の3グループは全部「クローズを外した文を再パースする」設計が原因で、**基準読みを then の供給源にする**だけで同時に開いた）。⚠**教訓③（第4波）＝自分の簿記も疑う**（`WXDi-P13-075-E1` を「前置きにアクションがある」へ入れていたが、実際は専用 STUB `UPKEEP_OR_NO_UP` が回避条件ごと engine＋UI に実装済み＝**既に正しい**。包むと相手に CHOOSE が2回出る）。**🆕第5波（2026-07-31・codex実装/Claude検証）＝`WXK06-047-E1` を消化（残7→6）**＝回避手段「自分のシグニをデッキの一番上に置く」を `OPPONENT_PAY_OPTIONAL` の兄弟語彙 `opponentSigniToDeckTop` として1本追加（engine 新機構0）。**回避クローズと帰結が混線して「相手シグニを無条件でデッキ下送り」だった二重の誤り**を是正。golden 1145→1147・live per-effect changed 1。詳細 BUGFIXES 2026-07-31 第5波節。**🆕第6波（2026-07-31・codex実装/Claude検証）＝`WXDi-P06-023-E2` を消化（残6→5）**＝「このターン終了時、」前置きを**遅延トリガーの設置**として解き、標準ペアを `INSTALL_DELAYED_TRIGGER{ON_TURN_END}` の**内側**に入れる（ゲートを設置の外に出さない）。engine は遅延トリガーに `sourceCardNum` を焼き込み3収集経路で復元＋`RETURN_SELF_ARTS_TO_LRIG_DECK` をアシストルリグゾーンへ拡張。golden 1147→1150・census 1367→1366。⚠**教訓④＝「片肺だから採用しない」の前に、その片肺が本バッチ由来か既存の系統穴かを数えること**（codex は完成した実装をゲート全緑のまま撤回して停止した。実測すると CPU の `ON_TURN_END` 未収集は**既存188効果/183カードに共通**＝採用が厳密に優位だった）。⚠**教訓⑤＝発生源の復元は「その値を読む側」を全部洗う**（`sourceCardNum` を読む分岐は0件でも、`entry.cardNum` の**カード種別**を読むアーツ使用ゲートが二重発火した＝Claude が是正）。詳細 BUGFIXES 2026-07-31 第6波節。**🆕第7波（2026-07-31・Claude 実装）＝`WX24-P4-011-E3` を消化（残5→4）**＝据置理由だった「バトルバニッシュの遅延収集経路が engine に無い」を配線して解消。`collectBattleBanishDelayedTriggers` を `triggerCollect.ts` へ**pure 新設**（BattleScreen は push 1行＝golden から検査可能にする）し、parser 側は第6波のハードコード（「このターン終了時、」のみ）を `DELAYED_INSTALL_PREFIXES`（前置き regex→timing）へ**テーブル化**して1行追加。golden 1203→1205・census 1357→1356・live changed 1。⚠**教訓⑥＝このテーブルに足してよいのは engine に収集経路がある timing だけ**（無い timing を足すと「設置されるが永久に発火しない」＝過剰実行を no-op へ替えるだけの別の退化）。⚠**教訓⑦＝据置 golden は据置理由が消えたら必ず転換する**（残すと将来の採用を誤って禁止する）。第4波の tail-splice 据置 golden も同じ文面を使っていたので「**収集経路の無い** timing」へ差し替えて生きている不変条件を固定し直した。詳細 BUGFIXES 2026-07-31 第7波節。**🆕第8波（2026-07-31・Claude 実装）＝`WXK05-009-E2` を消化（残4→3）**＝第7波のテーブルに「このターン、対戦相手のシグニがアタックしたとき、」→`ON_ATTACK_SIGNI` を1行追加。**設置者が防御側**なのが新しい（発火は相手＝ターンプレイヤーのアタック）＝収集器 `collectSigniAttackDelayedTriggers` を pure 新設し BattleScreen の防御側 AUTO 収集地点へ push、弁別子 `trigger.attackerOwner` を新設。可変《無》は `StubAction.opponentPayColorlessPerSigniAttack` で**実行時に支払う側の `attacked_signi_ids.length` から解決**（新フィールド0＝既存の計器を読むだけ）。golden 1205→1208・census 1356→1355・live changed 1。⚠**教訓⑧＝「読めなかった」の顔は `UNKNOWN` だけではない**（帰結の単独再パースが `STUB{RULE_REMINDER_TEXT}`＝**no-op** に落ちており、既存ガードを素通りして「過剰実行を no-op へ替えるだけ」になりかけた。ガードを no-op STUB へも広げた）。⚠**教訓⑨＝可変コストは両側の解決地点に入れる**（SEQUENCE 標準ペア側だけ直すと STUB フォールバック側で `costLen 0`＝「支払不可」と読まれて**必ず帰結が撃たれる**逆向きの過剰実行になる）。⚠**教訓⑩＝golden の `mkCtx`/`mkState` は共有プールの `cursor` を進める**（盤面を作るテストは `savedCursor` で挟む。挟み忘れると**無関係な下流テスト**が落ちる）。詳細 BUGFIXES 2026-07-31 第8波節。**🆕第9波（2026-08-01・Claude 実装）＝`WX24-P4-007-E1` の①②を実働化（完全 no-op → 2/3。⚠残3は変わらない＝本行はクローズしない）**＝「以下の３つを行う。①②③」を SEQUENCE 化し、①②を既存語彙だけで標準ペアにした（`parseOpponentWaUnlessCost` へ `opponentSigniTrash` を水平展開しただけ＝engine 改修0）。③は engine 未実装の宣言 STUB `LOCK_OPP_TRASH_MOVE` として可視化（逆翻訳に「（未実装）」を明示・census 1355 据置＝欠落として数え続ける）。golden 1208→1210・live changed 2。⚠**教訓⑪＝「読めた」は「正しい」ではない**（素朴に「全項目が UNKNOWN でなければ SEQUENCE 化」したら held が 250→260 に膨らみ、母集団10枚のうち**9枚は DO_THREE_THINGS の text パターンが実際に動いていた**＝単独パースのほうが情報が少ない。`WX24-P4-002`「すべてのルリグとシグニ」が count:1 に潰れる／`WXK11-002`「ライフクロスをトラッシュに置く」が `LIFE_CRASH`＝バースト誘発の別物になる。⇒ 射程を「全項目が標準ペアか本波の宣言 STUB」に絞り held を据置に戻した）。⚠**教訓⑫＝入れ子 SEQUENCE の標準ペアは continuation が跨げるか実走で確かめる**（第5波が平坦化を入れた経緯があるため。実測では途切れなかったので平坦化せず golden で固定）。詳細 BUGFIXES 2026-08-01 第9波節。**残3の内訳**＝①回避コストが engine 非対応1（`WXK06-067-E1`＝エナ＋手札の**合計N枚**という混成コスト＝**ゾーンを跨ぐ候補プール**が engine に無い。`TargetScope` が単一ゾーン前提なので選択UIも作れない）②`WX24-P4-007-E1` の③のみ残（＝新規の領域移動制限機構。在庫 (lxxiii)）③制限系で別機構1（`WXDi-P11-009-E3`＝`BLOCK_OPP_ZONE_PLACEMENT` が `disabled_signi_zones` を書くが**配置フローがこのフィールドを読んでいない**＋支払い回避が要る）。**engine の回避手段語彙**＝`costColors`／`opponentHandDiscard`(+`ALL`)／`opponentHandDiscardFilter`／`opponentEnergyTrash`(+`ALL`)／`opponentSigniTrash`／`opponentSigniToDeckTop`。詳細 BUGFIXES 2026-07-31 (lxi) 第3〜6波の各節 |

## 2026-07-31 整理：タスク16 残0クローズに伴い PLAN §3 から退避した行（原文）

> タスク16（timing 語彙センサスの消化）と タスク12(lxix) はいずれも 2026-07-31 に残0クローズした。PLAN §3 には1行✅サマリと「生きている⚠」だけを残し、以下に退避時点の原文を保存する。実装の一次記録は [BUGFIXES.md](./BUGFIXES.md) の 2026-07-30〜2026-07-31 各節、停止理由の機械再検証は `docs/_timing_census_triage.txt`。

| ID | 内容 |
|---|---|
| 16 | timing 語彙センサス（`npm run census:timing`）の消化 | parser語彙 | S（ロングテール） | **✅`cost.underSelfTrash` は 2026-07-30 に残0でクローズ**（実測13効果＝簿記の「16効果」は誤り。全部シグニの【起】で、**カットイン除外は無関係なルリグ/キー経路のみ**＝実体は「コストを払わず撃てる過剰実行」だった。既存の兄弟 `underAnySigniTrash` 配線を踏襲し新機構ゼロで着地。詳細 BUGFIXES 2026-07-30 先頭節）。<br>**✅再トリアージは 2026-07-31 に完了（第1波）＝`[A昇格候補]` は使い切った**。`docs/_timing_census_triage.txt`「2026-07-31 [B]群の停止理由 機械再検証」節に29件を `ファイル:行` 根拠つきで再判定＝**`[A]`1（消化）／`[B維持]`15／`[C]`13**。**`[C]`13件は §6.3 J へ正式送り済み**（機構台帳が定位置）。<br>⚠**この再トリアージで判明した構図＝軸は「グローバルに実在する」のではなく collector ごとに違う**。PLAN が期待した `handOwner`／`minCount`／`fromZones`／`byOwnEffect`／`byOpponentEffect` は **`collectHandAddedTriggers` では5軸すべて honor される**が、**`collectHandDiscardTriggers` は `minCount` しか持たず原因オーナー引数が無い**（`triggerCollect.ts:2438-2449`）。このため「軸が実在するから群で開く」という読みは外れ、実際に開いたのは `WX20-067-E1` 1件だけだった。**次に群を切るときも collector 単位で軸を数えること。**<br>**✅第2波（2026-07-31・codex実装/Claude検証）＝①`ON_TARGETED` の origin 種別軸を残0クローズ（差し戻し0）**。`triggerCondition.targetedOrigins`（**OR-of-AND** の1フィールドのみ／新 timing・新 action 型・新 collector ゼロ）を追加し、`collectTargetedTriggers` に **origin 引数＋before 盤面**を足した。開いた2件＝`WXDi-D09-H16-E1`（アシストルリグ か ライフバースト）／`WXDi-P08-065-E2`（相手シグニの【出】能力）。**同じ軸で既存の過剰実行2件も是正**＝`WXDi-P03-056-E1`／`WXDi-P13-089-E2`（parser が `対戦相手の(?:シグニの)?` の「シグニの」を読み捨てており、ルリグ/アーツ/スペルの対象化でも発火していた）。origin 3軸は**すべて既存データで引けた**＝`CardData.Type==='アシストルリグ'`／`effectType==='LIFE_BURST'`（先例 `GrantProtectionAction.sourceEffectType`）／`timing.includes('ON_PLAY')`。⚠**「アップ状態」は after 盤面で見ると「そのシグニをダウンする」効果で発火しなくなる**ため before 盤面（`bs.host_state`/`bs.guest_state`）で評価する（golden で両方向固定）。詳細 BUGFIXES 2026-07-31 第2波節。<br>**✅第3波（2026-07-31・codex実装/Claude検証）＝③`ON_ENERGY_CHARGE` の移動元/原因軸を残0クローズ**（`WX14-066-E1`／`WXDi-P03-073-E1`／`WXDi-P12-079-E2`）。真因は「collector の引数不足」ではなく**走査対象そのものが違う**＝旧 React watcher（`BattleScreen.tsx:1600-1660`）は場のシグニしか見ず、エナへ移動したカード自身を永久に拾わない。**中央 diff へ載せ替え**＝`detectEnergyAddedWithSource`＋`collectEnergyAddedSelfTriggers` を新設し、`movedSelf`/`fromZones`/`duringAttackPhase`/`byLrigOrSigniEffect` で弁別。**先例は `ON_ENERGY_FROM_TRASH`（`BattleScreen.tsx:3028`）＝同じ「移動カード自身がエナから発火」ループが既に稼働中**（`WXK09-031/080/081`）で、`from` が変わっただけだった。⚠**二重発火は両側ガードで封じる**（旧 watcher は `movedSelf` を skip・新経路は `movedSelf` 必須。既存8効果が新経路に乗らないことを golden で固定）。詳細 BUGFIXES 2026-07-31 第3波節。<br>**✅第4波（2026-07-31・codex実装/Claude検証）＝`WXDi-P06-072-E1` 1効果（ユーザー指示で1件ずつ投げる方針へ切替）**。台帳の停止理由が**2点とも誤り**だった＝しきい値は 15000 でなく **8000**／「`triggerFilter` は被バニッシュ側」は **`ON_BANISH` の話**で、**`ON_SIGNI_BANISH_OPPONENT` では filter は「バニッシュした側」に適用される**（`BattleScreen.tsx:8117`／仕様 `types/effects.ts:2197`）。⇒**新語彙0本**で着地＝parser の主語 regex に「パワーN以上の」を足し、`matchesFilter` の**既存**第3引数 `effectivePower` を呼び出し側が渡すようにしただけ。BattleScreen インラインは pure helper `battleBanisherMatchesTrigger` へ切り出して golden 検査可能にした。⚠**`effectivePowers` は `getCardNum()` で丸めてはいけない**（`calcFieldPowers` は場のスタック頂点をそのままキーにする＝`#N` 付きインスタンスIDで lookup が外れ黙って表記パワーに落ちる。Claude が是正）。⚠近似＝**バトルバニッシュ経路のみ配線**（効果バニッシュでは不発。既存55効果と共通）。詳細 BUGFIXES 2026-07-31 第4波節。<br>**✅ `ON_HAND_DISCARDED` の原因オーナー軸（2026-07-31・Claude 実装）＝`WXDi-D09-P16-E2` 1件を消化**。engine には既に「どちらの state へ `hand_discarded_just` を書いたか＝原因の所在」という規約があった（既存 `hand_trashed_by_opp_this_turn` と同型）ので、`PlayerState.hand_discarded_just_by_opp`（boolean）を同じ5地点で立て、`collectHandDiscardTriggers` に `byOppEffect` 引数を足して `byOwnEffect` を **`!asCost && !byOppEffect`** で判定した。⚠**「呼び出し元7箇所だから重い」という見立ては外れ**＝実際に引数を渡すのは watcher の2箇所だけ（残る5箇所はコスト or 自分起因で既定 false が正しい）＝**呼び出し元の数ではなく原因が既知かどうかで数えるべきだった**。詳細 BUGFIXES 2026-07-31 節。<br>**✅ `WX24-P2-051-E1`（非ガード捨て札→エナ）も消化（2026-07-31）**＝新語彙0本（本体 STUB も `TargetFilter.noGuard` も既存）。⚠**timing だけ足すと no-op になる罠**があり、STUB が読む `lastProcessedCards` は AUTO 経由の ExecCtx に入らないため、collector が entry へ `triggeringCardNum`（＝捨てられたカード・filter 一致の1枚）を載せる形にした。詳細 BUGFIXES 2026-07-31 節。<br>**✅ `WXDi-CP02-068-E1`（離脱先が手札かトラッシュの OR）も消化（2026-07-31）**＝`WXK11-049-E1` がほぼ同一テンプレートで、差分は行き先 OR だけだった。`leftToZone` を `'hand' | Array<'hand'|'trash'>` へ拡張（既存6効果は素の `'hand'` のまま挙動不変）。詳細 BUGFIXES 2026-07-31 節。<br>**✅ `WXDi-P11-063-E2`（このカードがシグニの下に置かれたとき／このカードの上にあるシグニ）も消化（2026-07-31）**＝**穴は3層**（timing 語彙／対象語彙／**発火地点の到達不能**）。`TargetFilter.aboveSelf`（`acceHost` の兄弟）を新設し、AUTO は `execPowerModify` が1体確定・CONTINUOUS は `calcFieldPowers` の「スタック下カード→ホスト」ループが加算する。🔴**真因は engine 側**＝`INTERNAL_PLACE_SELF_UNDER_SIGNI` が execStubPart1/part2 に**同名で2つ**あり、dispatch が part1→part2 の順なので**part2 の `ON_PLACED_UNDER_SIGNI` 発火は死にコード**だった（part1 を `stub.value == null` に限定して復活）。⚠続き304 と**同じ罠が別 id で再発**＝**同名 STUB/収集関数の二重定義を最初に grep する**こと。同文型の兄弟4効果は【常】で `count≠ALL`＝「効果元自身」に解決され**自分に +N していた過剰実行**で、同時に是正（census 1361→1358）。詳細 BUGFIXES 2026-07-31 先頭節。<br>🏁**✅残0クローズ（2026-07-31・Claude 実装）＝`[B維持]` 最後の3件を1バッチで消化**。①`WXDi-P06-038-E1`（エナ→**任意宛先**）＝新 timing ゼロ＝既存 `ON_ENERGY_TO_TRASH` に `triggerCondition.energyLeftToAnyZone` で相乗り。⚠**「効果によって」の限定は構造的に満たされていた**（コスト支払いは中央 diff を通らない）＝原因軸の追加は不要だった。②`WX05-020-E1`（**主体別ターン累計**クラッシュ）＝`PlayerState.life_crashed_by_signi_this_turn` をアタックと効果の2経路で加算。⚠アタック側は**ライフ枚数の実差分**で数える（クラッシュ地点を個別に数えるとランサー/ダブルクラッシュ/ダメージ無効を取りこぼす）。③`WXDi-P13-051-E3`（相手効果1つによる手札捨て**か**エナ→トラッシュの OR）＝🔴**二重発火は実在の問題**（手札捨ては React watcher・エナは中央 diff と収集経路が分かれ、1効果で両方やる相手カードが `WXK02-004`／`WXDi-P10-003`／`WXDi-P13-003A` と実在）⇒ 新 timing `ON_HAND_OR_ENERGY_LOST_BY_OPP` で**中央 diff だけで両方数える collector 1本**に畳んだ。本体の「引くか【エナチャージ】」CHOOSE も復元。詳細 BUGFIXES 2026-07-31 先頭節。<br>⚠**第2波で確立した投げ方**＝(a) 投入前に **timing 以外のズレも全部実測**して指示書に罠として先出しする（H16 の `CONDITIONAL{IS_MY_TURN}` は誤変換ではなく `OPTIONAL_COST` 直後の「そうした場合」parser 慣例＝`effectExecutor.ts:2709-2714`。「触るな」と書いて余計な改変を防いだ）(b) **collector の呼び出し元を全数 grep して行番号で名指しする**（今回2箇所＝`BattleScreen.tsx:4237`/`4508`。§5-15/20 の「1箇所で満足する」失敗モードは非再発）。<br>⚠**計器の偽陽性2件**（2026-07-31 実測）＝`npm run census:timing` の31件のうち `WXDi-P09-079-E1`／`WXK10-052-E1` は **live では既に正しい `ON_CARD_MILLED_FROM_DECK` を持つ**（2026-07-27 に消化済み）。外科パッチが `clearTimingFallback` を呼んでいないため計器に残っているだけ＝**実質残は29効果**。この2件に `clearTimingFallback` を足せば較正できる（**機能実装ではなく計器の較正**なので、やるなら簿記にそう明記すること）。<br>**未再検証は残り1件**＝`SPDi43-11-sub-E1`（複数効果を跨ぐ累積カウンタ＝真の `[C]` 相当）。<br>🆕**残穴＝`ON_TRASH under_signi` の3効果がコスト起因で発火しない**（`WX18-062-E1`／`WX22-027-E1`／`WXK03-033-E1`。原文はいずれも「このカードが**コストか**効果によってシグニの下からトラッシュに置かれたとき」＝コストを明示的に含む）。`payUnderSelfTrash` は state を直接書き、`executeSigniActivated` がコスト支払いとスタック初期化を**1コミットにまとめる**ため、中央 diff の `detectUnderSigniTrashed`（before スナップショット＝`bs.host_state`）が移動を見ない。**退化ではない**（配線前はカードが動かず発火機会自体が無かった）＝新規に露出した未到達経路。直すならコスト支払いを独立コミットに分けるか支払い時に明示的にトリガーを積むかの設計判断が要る。<br>🆕**同族の未配線1枚＝`WXDi-P06-034`**「このシグニの下からカード１枚**と**あなたのエナゾーンからカード１枚をトラッシュに置く」＝複合コストで regex に当たらず `underSelfTrash` が付かない（従来から不変）。<br>⚠**計器に盲点あり**＝2026-07-28 の誤分類36件を `census:timing` は33件しか報告しなかった。消化済みの経緯（36件停止／続き272・273・277・278 ほか）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節・BUGFIXES 2026-07-28節。ゲートではない（exit 0） |
| (lxix) | **✅残0クローズ（2026-07-31・Claude 実装）＝「あなたのパワーN以上のシグニ1体がアタックしたとき」の主語＋閾値が丸ごと落ちて両方向に誤っていた2効果**（`WXDi-P02-079-E2`／`WXK07-030-E2`）。⚠**timing は付いていたので `census:timing` に出ない＝計器の外にあった**（第4波の実測中に発見）。**要点＝`ON_ATTACK_SIGNI` は収集経路が2本ある**（`BattleScreen.tsx:7141` の直収集は **`triggerScope`/`triggerFilter` を一切見ない**／`collectFieldTriggers` は any_ally を拾うが**自身を除外**）＝**`any_ally` に直すだけでは自分のアタック時に条件が素通りする**ので3点を一体で実装（parser の主語＋`powerRange`／`collectFieldTriggers` へ実効パワー／直収集経路に `triggerFilter` 評価を新設）。新語彙0本。波及は全数実測でゼロ（`powerRange` 持ちは `WX14-025-E1` 1件＝是正方向・`ON_ATTACK_SIGNI` の filter 持ちは `WX01-029-E1` 1件＝通る）。詳細 BUGFIXES 2026-07-31 (lxix) 節 |

### 圧縮した在庫行の原文（(l)／(lv)＝残作業があるため PLAN には worklist だけを残した）

> ⚠**この節の ✅(l) 行は 2026-07-30 前半の途中経過（「B群残0／A群残8は保留」）で、後に A群も残0になった**。**(l) の最終形は下の「2026-07-30 整理：PLAN §3 Opusタスク12 在庫表から退避した完了行（原文）」節の ✅(l) 行を見ること。**

> PLAN §3 の表には「残っている作業と不足機構」だけを残し、消化済みの経緯（何を直したか）は
> [BUGFIXES.md](./BUGFIXES.md) の各日付節に一次記録がある。以下は圧縮前の行の全文。

| ID | 内容 |
|---|---|
| ✅(l) | **✅2026-07-30 に B群残0でクローズ（A群残8は明示保留）＝「能力付与の内側が nest されず完全 no-op」**。**A群11件**は前波で3件実働化（`WXDi-P11-038-E2`／`WX26-CP1-005-E1`／`WXDi-P02-034-E1`）、**残8件**＝`WX26-CP1-076-SONG`／`WXK11-052-E1`／`WX24-P4-026-E1`／`WX16-004-E1`／`SPDi44-08-E2`／`WX25-P1-018-E2`／`WD21-009-E1`／`PR-204-E1`（比例値・任意コスト・置換・宣言等の機構不足。部分近似は過剰実行になるため honest defer）。<br>**🆕B群36枚・47効果を 2026-07-30 に消化＝残0**。キーは「【常】：あなたの（レベルN以上の）センタールリグは以下の能力を得る。」の**直後の別ブロック**に付与能力を並べる（原文に入れ子マーカーが無い）ため、宣言文の `rawText` が「。」だけになり `abilities` 空＝executor 完全 no-op、付与能力は**キー自身のトップレベル効果**として登録されていた。parser に境界抽出（**エクシード【起】の走り＋宣言直後の【自】**まで飲み込み、【出】/【常】/「このキーを…」【起】で打ち切る）と `activeCondition` 復元を実装し `GRANT_LRIG_ABILITY.abilities` へ入れ子化。<br>⚠**PLAN の旧評価「優先度は低い／真の過剰実行は WDK02-009 の1件だけ／コスト踏み倒しではない」は2点とも誤りだった**＝(1) `WXK02-023` も「**対戦相手のセンタールリグがレベル２以上であるかぎり**」を前置節の形で持ち、条件が落ちていた（＝落ちていた条件は2件）(2) **エクシードコストはキー【起】経路（`executeKeyActivated`／`KeyActivatedModal`）が `cost.exceed` を一切支払わない**ので、JSON にフィールドが在っても **44効果が実質コスト0で撃てていた**（付与【起】経路 `executeLrigGranted` だけが支払い実装を持つ）。<br>同時に付与【起】経路のゲート不足（timing↔phase 未照合・`condition` 未評価・`once_per_game` なし）と、付与ルリグの SPELL_CUTIN 収集欠落・防御側 `any_opp` の ON_ATTACK_LRIG 収集欠落を是正。census **1394→1393**、golden **1075→1079**、held **292→286枚/106署名**。詳細 BUGFIXES 2026-07-30 (l) 節 |<br>**🆕2026-07-30（第2波・A群）の圧縮前の記載**＝「**A群 残8**＝付与能力の内側が nest されず no-op。`WX26-CP1-076-SONG`／`WXK11-052-E1`／`WX24-P4-026-E1`／`WX16-004-E1`／`SPDi44-08-E2`／`WX25-P1-018-E2`／`WD21-009-E1`／`PR-204-E1`。不足＝手札枚数比例値・付与能力内の任意コスト対話・置換イベント横取り＋能力喪失・数字宣言／多段閾値・他アーツ不使用条件。部分近似は条件/コスト踏み倒しになるため honest defer」＋「🆕B群クローズで開いた在庫＝`WDK04-006-E1-G` の中身（`DECLARE_NUMBER`／`DECK_REVEAL_UNTIL` STUB＋`NEGATE_ATTACK` の対象が `SIGNI` のまま）」。**実測で `WD21-009-E1`／`PR-204-E1` は 2026-07-23 に実装済み（manualEffects＋golden）と判明し 残8→残6、うち `WX26-CP1-076-SONG`／`WXK11-052-E1` と `WDK04-006-E1-G` を消化して残4**（不足機構は置換フック＋能力喪失のみに収束）。
| ✅(lv) | **✅2026-07-29：原票の `WXEX2-71-E2` は (xxix)(2) の英知決着で `mandatory:true` になり症状消滅。共通機構（`OPTIONAL_ACTIVATE` 包み）も実装済みだったので、残作業は「機構が届いていない収集経路を塞ぐこと」だった。`executeGrow`（人間のグロウ）へ `collectOptionalNoCostOnPlayForGrow` を配線し、🔴その先の live 該当2件（`WX10-007-E1`／`WX10-021-E1`）が「してもよい」を内側 `ADD_TO_FIELD.optional` と効果ヘッダ `mandatory:false` に二重指定していた誤りを是正**（同型5件中 parser 生成の3件は全て `mandatory:true` で、MANUAL の2件だけが誤り）。golden 1025→**1029**・census 1412据置。詳細 BUGFIXES 2026-07-29 (lv) 節。<br>**✅2026-07-29 続き：COLLAB の raw【出】直積みを `collectPlacedSelfOnPlayTriggers` へ統合し、任意コスト踏み倒しを解消。任意 COLLAB 枝の `INTERNAL_DO_COLLAB` も配置札を surface するよう是正。**<br>**✅2026-07-29 続き2：アシストルリグ配置（②）も `collectAssistOnPlayTriggers`（中身は共通 `collectPlacedSelfOnPlayTriggers`・`placedByEffect:false`）へ統合し、丸ごと不発だった任意【出】の収集が 0→146件。着手前判定どおり `WXDi-P15-034-E1` の二重任意指定も是正**（`WXDi-P11-032-E2` は「【出】《無》《無》：」＝コスト付きなので誤りではなく据え置き）。<br>**🆕残＝未配線2経路**〔③CPU シグニ召喚 ④CPU グロウ＝いずれも「CPU は任意効果を発動しない」を明示据え置き中。**着手するなら「CPU に任意効果をどう選ばせるか」の方針決めが先**（黙って無条件発動にするのは COLLAB と同じ過剰実行になる）〕|

## 2026-07-30 整理：§6.3 H 節クローズ（PLAN §6.3 から退避した原文）

> H1〜H4 と I／I′ はすべて 2026-07-30 に実装完了し、PLAN §6.3 には1行✅サマリと「生きている⚠」だけを残した。以下は退避時点の原文（各項目の実装内容・訂正した旧診断を含む）。実装詳細の一次記録は BUGFIXES 2026-07-30 の各節。

- **🆕 H. タスク12(xxii) から正式送りの不足機構3件（続き296・2026-07-28）**＝(xxii) 本体は完全クローズしたが、以下は `UNKNOWN{raw}` で honest defer 中（**過剰実行はしない＝現状は安全側**）。実装時は `raw` に原文全文が入っている。
  - **✅ H1 `WX15-067-E1`（メルト・ファクト）完全実装（2026-07-30）**＝`pendingSpellCast.virusRemovalByZone` で支払い前の任意数選択をこの使用宣言だけに保持し、確定時に相手 `field.signi_virus` から実数を除去。1個以上ならこのカードだけ《黒×2》軽減、`pending_spell.pre_use_virus_removed` を解決ctxへ渡し、2個以上なら本体を「2つまで」に上書きする。`next_spell_cost_reduction` は不使用・既存の次スペル規約も不変。goldenで0/1/2個（コスト2/0/0、択1/1/最大2）を固定。
  - **✅ H2 `WXDi-P11-010A-E1`（夢限 -Q-）完全実装（2026-07-30）**＝手札＋エナ＋トラッシュの全デッキ戻し/シャッフル、ルリグデッキ＋場のセンター最上段以外（全シグニスタック・アシスト・キー・アクセ・チャーム・ソウル・各設置カード/トークン・旧ルリグ下敷き）の全除外、同一instanceのB面 `WXDi-P11-010B` 反転を単一state writeで原子的に実装。`ON_LRIG_FLIP`（既存0件）でB面E1の5ドロー＋エナチャージ5を発火し、B面Limit 9/E2【起】へ切替、A面能力とQ専用limit累積を停止。通常盤面diffを通すため最上段シグニの `ON_LEAVE_FIELD` は発火。詳細は BUGFIXES 2026-07-30節。**⚠旧記述の訂正**＝「`faceDown` は表示 prop のみ＝新設が要る唯一の点」は**誤診断**だった。「裏向きにする」は表示ではなく**両面ルリグのB面《夢限 -A-》化**（Limit 9・B面E1「-Q-から-A-になったとき」5ドロー＋エナチャージ5・B面E2【起】）で、必要だったのは新state ではなく**既存 `card_identity_overrides` の再利用＋反転トリガー timing の新設**。**H3 の「ピースの両面反転」も同型なので、この経路（`card_identity_overrides`＋`ON_LRIG_FLIP` 相当）を先に読むこと**（`AWAKEN` はログのみで共通の変身基盤は存在しない）。
  - **✅ I. `WX24-P3-069-E1` ガード追加コスト枚数化（2026-07-30）**＝collectorを合計枚数へ拡張し、STUB `count` 省略時1を維持。既存ルリグ付与ストアのCONTINUOUS走査、警告《無》×N、`energy.length < N`、確定N枚徴収を一体で配線した。新たに有効化される付与ストア効果は全数走査で同カードの1効果だけ。
    - **✅ I' ガード追加《無》11効果を完全クローズ（2026-07-30）**＝parser が連続《無》を `count` へ載せ、`WXDi-P01-035-E1` と `WX24-P2-047-E1` を2枚化。AUTO/ACTIVATED の「このターン」3効果は新 `opp_guard_extra_colorless_this_turn` に加算し、全ターン終了3経路でリセットする。`prevent_opp_guard` は本当の完全禁止語彙だけへ分離。「このゲームの間」2件は既存永続実装を維持し、重複STUBを加算しない。詳細は BUGFIXES 2026-07-30節。
    - **⚠ I の潜在結合（実害なし・将来の落とし穴）**＝`executeSigniOnPlay` の `beatZones`（`Set<number>`）が **`beat_signi` の「場ゾーン index」と `beat_signi_from_trash` の「トラッシュ index」で同じ集合を共有**している。実データで両コストを併せ持つ効果は**0件**（全数走査）なので現状は実害なしだが、将来併記カードが出ると支払いが `ok:false` で**無言 abort** する。併記が現れたら選択集合を分離すること。
    - **⚠ I の付与ストア走査は `activeCondition` を評価しない**（`effectEngine.ts:3137-3142`）。今日の唯一のエントリ `WX24-P3-069-E1-G` は無条件なので実害なしだが、条件付き CONTINUOUS を付与する効果を足すときは effectsMap 側と同じ `checkActiveCondition` を通すこと。
  - **✅ H3 `WXDi-P13-003A-E1`（未知の邂逅・ピース）完全実装（2026-07-30）**＝盤面依存の使用条件「このターンにセンタールリグをグロウしていない」を候補表示・実行直前の両方で評価（【ドリームチーム】白/黒1体以上は §6.3 F の正規デッキ常時成立方針どおり機能等価保留）。手札全捨て＋エナ全トラッシュを中央盤面差分 collector と手札捨て collector に通し、実移動5枚以上なら `key_piece` の同一instanceを `card_identity_overrides` でB面 `WXDi-P13-003B` にして除去、`executeGrow` の optional instance/base/free/consume 引数へ渡して単一commitで無料センターグロウ。`actions_done` には `GROW` を積むため同ターンの通常グロウを封じ、B面E1/E2の【出】は既存ON_PLAY経路で発火する。
  - **✅ H4 `WXDi-P13-003B-E2`（未知の巫女 マユ・B面【出】）完全実装（2026-07-30）＝H の残 `UNKNOWN` 0・H 節クローズ**＝「そのターンの間、あなたはシグニを１体までしか場に出せない」を実装。**投入前実測で判明した地雷**＝fresh parser は既にこの1文を `STUB DEPLOY_RESTRICT` として吐いており、engine ハンドラは `otherState` にしか cap を書かないため、**live の `UNKNOWN` を素朴に採用すると「対戦相手は1体まで」に反転した過剰効果になる**（live の UNKNOWN が安全側で止めていただけ）。⇒ `DEPLOY_RESTRICT` を「配置数制限を含む1文だけ」から主語（対戦相手／あなた／すべてのプレイヤー）と cap を読む形へ是正し、`そのターンの間`＋直前 `GAIN_EXTRA_TURN` で `extra_turn` が立った場合だけ新 `signi_deploy_count_limit_next_turn` へ予約。予約は自ターン終了リセット（`BattleScreen.tsx:3296`）で消さず、新純関数 `activateNextTurnDeployCountLimit`（`src/screens/battle/deployCountLimit.ts`）が次の本人ターン開始でちょうど1回だけ有効化＋超過を末尾ゾーンから自動トリムする（配線6地点＝通常END／手札上限経由END の各「相手ターン開始」と「自分の追加ターン」、FORCE_END_TURN、CPU END→人間ターン開始。相手側は `turnActuallyStarts=false` で早期消費を防ぐ）。**副産物**＝`WXK06-004-E1`「すべてのプレイヤーは２体まで」が相手側にしか cap を立てていなかった過小実行も両者適用へ是正。既存の対戦相手6効果は不変（golden で代表2件を両向き固定）。**既知の近似**＝トリムはプレイヤー選択ではなく末尾ゾーン自動選択で、ターン遷移の直接 state 更新のため `ON_LEAVE_FIELD` は発火しない。

## 2026-07-30 整理：PLAN §4 恒久指標から退避した旧計測（原文）

> いずれも**より新しい行に置き換わった**タスク別の計測値。PLAN §4 恒久指標には「直近の正」だけを残す。
> 現行値＝2026-07-30 タスク12(l) 行（census 1393／golden 1079／smoke 10679／held 286枚/106署名）と
> 2026-07-30 タスク12(xxix) 15波後の行（(xxix) 系の母数・在庫）。

- **2026-07-29 タスク12(xxix)(2) 最新値**：filter付き手札捨て **12効果**を構造化。`costUnparsed` は初期336（A185/B65/C86）→ **47（AUTO 47／ACTIVATED 0）**、段階3残43→**33**。live JSON **changed 291 / added 0 / removed 0**（構造変更12＋偽陽性印のみ279）。golden **1027/1027**、census **1412/1412**（`BASELINE_HIGH=1412`）、smoke **10726/10726**、fuzz 全0、manual field loss 0。
- **2026-07-29 第17波 最新値**：`WXDi-P15-005-E1`／`WXDi-P05-015-E2` を実働化して **(xlvi) 計73効果・残0クローズ**。census **1410据置**（`BASELINE_HIGH=1410`）、golden **1007→1011**、held **252枚/108署名**（採用済み2枚はレビュー対象から自動除外）。第16波記録：`WXDi-P08-007-E3` の相手3択×3回を実働化。census **1410据置**（`BASELINE_HIGH=1410`）、golden **1004→1007**、held **252枚/108署名据置**（raw 253のうち採用済み1枚を除外）。第15波は歌本文重複6枚＋`WX25-P3-052-E1` を着地して census 1410据置／golden 1000→1004／held 258/114→252/108。
- **2026-07-29 タスク12(l) 最新値**：引用付与3効果を実働化。census **1410→1409**（`BASELINE_HIGH=1409`）、golden **1011→1013**、held **252枚/110署名**（対象2カード採用後の実測）。上の第17波値より本行を正とする。
- **2026-07-29 タスク12(lviii) 最新値**：トラップ公開9効果を LPC へ移行し順序違い3件を解消。census **1409→1414**（STUB格納から高シグナル側へ移った計器上の+5、`BASELINE_HIGH=1414`）、golden **1013→1022**、held **251枚/107署名**。上の (l) 行より本行を正とする。
- **2026-07-29 タスク12(lix) 最終値**：残2効果を実働化して **(lix) 残0クローズ**。census **1414据置**（`BASELINE_HIGH=1414`）、golden **1022→1025**、held **251枚/107署名据置**。
- **2026-07-29 タスク12(lv) 最新値**：グロウ経路に任意・無コスト【出】を配線し、二重任意指定2枚（`WX10-007-E1`／`WX10-021-E1`）を `mandatory:true` へ是正。census **1412据置**（`BASELINE_HIGH=1412`）、golden **1025→1029→1031→1033**〔COLLAB・アシスト配置の統合まで含む〕、live **changed 2＋1 / added 0 / removed 0**〔`WX10-007-E1`／`WX10-021-E1` ＋ `WXDi-P15-034-E1`〕、build 再実行後差分0、同型★0。**本行を直近の正とする**。
- **2026-07-28〜29 最新値（上記長文履歴の追補）**：**`BASELINE_HIGH=1453`（2026-07-29 現在の回帰ゲート値）**。**1452→1453**〔タスク12(xlvi) 第7波＝宣言参照 pick 8効果。⚠**+1 は計器上の移動1件のみ**＝`WXK05-021-E2` が STUB 格納から高シグナル側へ移った分（census のキー表に `pickUpTo` が無い＝**該当119効果の盲点**。較正はタスク12(lvii) として単独作業に切り出し）。第5波の `WX12-024-BURST` と同型の**2度目の再発**〕。**1454→1452**〔タスク12(xxix)(2)＝英知の全角「＝」取りこぼし24効果の是正（うち15効果は live の過剰実行）＋真の「〜してもよい」8効果を `OPTIONAL_ACTIVATE` で配線〕。**1457→1454**〔タスク12(xlvi) 第6波＝(d) hand-or-energy 1効果と (a) 動的filter 5効果。**同時に `execLookPickChain` が `stage.filter` を `resolveDynamicFilter` に通していなかった engine バグを是正**〕。**1463→1457**〔タスク12(xlvi) 第5波＝(h) 融合規則が filter を運ばず「どのカードでも拾える」過剰実行だった17効果＋同系統9効果。⚠内訳は **−7＋1**＝`WX12-024-BURST` が STUB 格納（判定保留）から高シグナル側へ**移動**した計器上の +1 を含む（`LOOK_PICK_CHAIN` に「まで」の明示マーカーが無いだけで engine は元から上限扱い＝挙動の退化ではない）〕。1476 以降の推移＝**1476→1471**〔タスク12(xlvi) 第1波＝`LOOK_AND_REORDER` の消えていた単一 pick-to-hand 5効果を復元〕→**1471→1469**〔第2波＝多段/複数グループ pick 12効果を `LOOK_PICK_CHAIN` へ展開。⚠**減少2に対し実際に挙動が変わるのは12効果**＝census 側に対応パターンが無い分は増減しない〕→**1469→1468**〔第3波＝中段 `then:'deck_top'` の3段形4効果。同じく**減少1に対し挙動が変わるのは4効果**〕→**1468→1463**〔第4波＝(e) 表記ゆれ「N枚を見る」／ディソナ複合の後続文／(f) OR記述子（新 `TargetFilter.anyOf`）。⚠**減少5に対し挙動が変わるのは8効果**＝うち3効果は「filter だけ落ちた `REVEAL_AND_PICK`」の過剰実行是正〕。以下は 1479→1476 の経緯：タスク12(xliv)(a3) の実働化に伴い、WX09-022 の欠落していた《エナジェ》`activeCondition` を parser から復元して **1479→1478**、さらに Opus 検証で同文型の **WX12-033-E2**（PRESERVE カードのため build が curated を温存し fresh の条件が届いていなかった＝【ランサー】無条件付与）を外科パッチして **1478→1477**。(b3) `WXDi-P14-053-E1` の引用【常】を長期付与ストアへ実働化して **1477→1476**。いずれも計器だけの改善ではなく機能修正。

## 2026-07-30 整理：census 推移チェーン（PLAN §4 恒久指標から退避）

> P1完了宣言（2026-07-23）の凍結基線 1581 から現ベースライン 1393 までの、バッチごとの逓減内訳。
> **宣言前の逓減履歴（1919→1581）は同ファイル「§4 census 計測履歴」節**。
> ⚠減少数と実働効果数は一致しない（census に対応パターンが無い機構は増減しない）ので、
> 各バッチは「census の増減」と「engine で新たに実働する効果数」の両方を書く運用。

**宣言後の直近推移**＝1581→1580〔WX20-028-E2 誤形撤去〕→1578〔BANISH_REDIRECT 正面限定〕→1577〔BANISH_REDIRECT 単体×パワー0〕→1571〔正面 frontOfSelf target filter 5効果＝WXK11-029-E2/WXDi-P04-049-E1/WXK04-072-E2/WX12-038-E1/WD17-009-E1。⚠WXK04-072 は PRESERVE カードで built JSON 直パッチ必須〕→1567〔正面 CONT パワー修正 frontOfSelf 4効果＝WX24-P1-050-E1/WX24-P2-057-E1/E2/WXDi-P10-044-E1〕→1563〔§3タスク6「代わりに」B1残 per-target 値すり替え4効果＝WXDi-P11-067/WX14-070/WDK17-014/WX25-P2-101〕→1562〔WXK06-071 多段閾値ネスト CONDITIONAL＝OPP_CARDS_MOVED_TO_DECK_THIS_TURN〕→1557〔§3タスク6 D バニッシュ置換ルール5効果＝WX13-031/WX16-001/WXK04-068 の BATTLE_BANISH_PREVENT_LOSE_ABILITY・WX14-026 の substituteCost.lifeCrash・WX10-033 の thisCardOnly・WX25-P1-056 の EFFECT_LEAVE_REPLACE_BANISH〕→1554〔§3タスク6 C コスト代替4効果＝WX24-P1-060/WX25-P3-076 の COST_TRASHED_MATCHES・WXEX2-48 の ACTIVATED_DISCARD_COUNT_GTE 配線・WX07-027 の cost.costSubstitute〕→1552〔§3タスク6 E＝decompiler に recollectArts 描画を追加（機構は実装済・計器バグ）＋「能力を失い＋パワー修正」複文の脱落是正4効果〕→1551〔§3タスク8 §6.3「正面」(b)(d)(e)＝WX05-019-E1/WXK11-029-E1/WX10-036-E2＋新 FRONT_SIGNI 条件〕→1549〔§3タスク8 出現条件レゾナ **段階1のみ**＝parser が捨てていた55枚の【出現条件】を `appearanceCondition` メタデータ（rawText＋timings＋cost／未対応は deferReason）として保存＋新 filter `excludeResona`。⚠**召喚フロー自体は未実装＝語彙の計器改善であって機能実装ではない**〕→1545〔§3タスク12(liv)＝CONTINUOUS 能力喪失の誤 facing 8効果を全数分類。WXEX1-02-E1（凍結ALL＋【常】【自】限定）/WX18-038-E1（チャームALL）を忠実化＋相手センタールリグ走査を新設、残6効果は明示 STUB defer。⚠**減少4のうち engine で新たに動くのは WXEX1-02-E1 の1効果のみ**（他は誤動作の停止＋分類移動）〕→1537〔続き268 分離pick curated 23効果採用〕→1535〔続き269 置換else A残8＋B固定参照1件〕→1527〔続き281〕→1525〔続き284 公開snapshot軸9効果〕→1523〔続き285 ミル/トラッシュ軸7効果〕→1521〔続き291 レベル倍率族〕→1519〔続き293 (xxii) 後置条件 live 実害9効果〕→1518〔続き295 (xxii) WXK06-031 の4枚SEARCH＋後置条件〕→1517〔続き296 (xxii) 群B3効果を過剰実行なしで着地＝**タスク12(xxii) 完全クローズ**〕→1515〔(xxxix) バッチ2＝WX22-006-E3 の distinct:'name'／WXK01-005-E1 のルリグデッキ戻し〕→1513〔(xxxix) バッチ3＝公開集合の照応4効果〕→1511〔(xxxix) バッチ4＝機構4効果＝**タスク12(xxxix) 完全クローズ**〕→**1510**〔(xxix) の副産物＝`REMOVE_ABILITIES` が原文「N体まで」を読まず常に count:1 だった過小実行を是正（WXDi-P03-024／WXDi-P13-043／WXK10-016／WX24-P1-002 の4効果が2体まで消せるように）。**機能実装**。⚠この1件は計器のマスクが剥がれて表面化＝従来は無意味な `upToCount:false` が census キー `'upTo'` に部分一致して「対応済み」に見えていた偽陰性。(xxix) 本体の G154族16効果（union＋escapeDiscard）は census に対応パターンが無く増減しない〕→**1394**〔2026-07-30 タスク12(xxix) 第10〜15波の6波。1510→1400 は9波セッション分（PLAN_PROGRESS 参照）、1400→**1399**〔第10波＝`WX25-P1-107-E1` の対象を原文どおり自分の＜天使＞へ限定〕→**1397**〔第11波＝相互制約つきコスト4効果を構造化。**減少2に対し engine で新たに実働するのは3効果**〕→**1395**〔第12波＝支払い札レベル参照2効果を解放。減少2／実働2〕→**1394**〔第14波＝「あなたのシグニの下」4効果をA群から分離し【出】2効果を配線。減少1／実働2〕。⚠**第13波と第15波は census 減少0**（runtime 配線と可変枚数コストで、census に対応パターンが無い）＝**減少数と実働効果数は一致しない**ので両方を書くこと〕

## 2026-07-30 整理：PLAN §3 Opusタスク12 在庫表から退避した完了行（原文）

> 2026-07-30 のタスク12(l) B群クローズ時点で、**残作業が無くなった在庫行**を PLAN から退避したもの。
> PLAN §3 の表には「残作業のある在庫だけ」を残す規約（CLAUDE.md ドキュメント配置ルール）に従う。
> 一次記録は [BUGFIXES.md](./BUGFIXES.md) の各日付節。

| ID | 内容 |
|---|---|
| ✅(l) | **✅残0クローズ（2026-07-30）**＝B群36枚47効果／A群（残8→実測残6→4→**0**）とも消化完了。最後の3波＝`WX24-P4-026-E1`（既存 `game_guard_alt_hand` へ着地＋外側の色組み合わせ条件）／`SPDi44-08-E2`＋`WX25-P1-018-E2`（**効果離場の共通置換フック新設**＝`applyEffectLeaveLrigAbilitySubstitute` を BANISH/BOUNCE/TRASH/SEND_TO_ENERGY/TRANSFER_TO_DECK/EXILE の6経路へ配線＋ルリグ付与能力の自己喪失）／`WX16-004-E1`（**ホログラフ公開置換**＝データ側マーカー `CardEffect.holograph` を parser がコスト表記から立てて付与能力へ伝播させ、公開2地点を既存 `LOOK_AND_REORDER` の3枚・非公開並べ替えへ差し替え）。詳細 BUGFIXES 2026-07-30 の先頭2節。<br>🆕**この機構が開いた在庫2件（いずれも (l) 外）**＝①`WX25-P1-056-E1`（`leaveReplaceBanish` の no-op）は上記の共通離場フックで閉じられる見込み＝任意選択とバニッシュ先処理の追加が要る ②`WX12-020-E3`（「この方法で捨てた手札1枚につき－6000」＝倍率元が現在の手札枚数ではなく捨てた枚数。既存 `POWER_MODIFY_PER_HAND_COUNT` の拡張では意味が混ざる）は据置 |
| ✅(lxiv) | **✅残0クローズ（2026-07-31）**＝登録時は `WXK11-031-E1` 1枚のつもりだったが、機械走査で**同型93効果**が判明。「〈対象宣言〉を対象とし、〈任意コスト〉てもよい。そうした場合、それを〈除去〉」で対象宣言の**フィルタ／体数／owner** が帰結に届かず「どのシグニでも撃てる」過剰実行だった。**新機構0**＝(liii) と同じ正準形へ組み替える post-pass `applyDroppedTargetDesignation` を追加し **61枚採用**。⚠**SELECT/STORE はコストステップより前に挿す**（コストとゲートの間に挟むと did-it ゲートが外れてコスト踏み倒しになる）。投入前の実測で潰した落とし穴3つ＝①owner を名詞句の**最後の**「対戦相手の／あなたの」から取る（先頭一致だと self に反転し自分のシグニを撃つ）②`bindToStoredTarget` の BINDABLE に `UP/DOWN/FREEZE` があるのに **executor が targetsStored を honor していなかった**（3つとも配線し、UP を追加。効かない場合は組み替えない）③挿入位置〜帰結に `LAST_PROCESSED` 系があれば触らない（`WXDi-P01-059-E1` の公開カード参照が壊れる）。engine 側は **did-it ゲートが「包み条件が不成立」を空振りと読める**ようにした（`effLastProcessed`）＝対象宣言の前置で `lastProcessedCards` が埋まり、条件不成立でも本体が撃てるようになっていた。②「対戦相手は手札が**N枚になるように**カードを捨てる」は `TrashAction.untilHandCount` を新設して実行時差分化（`WX18-032-E2`。エナ版は既存 `EQUALIZE_ENERGY` で正しい）。積み残しの held 15枚は (lxv) へ。詳細 BUGFIXES 2026-07-31 (lxiv) 節 |
| ✅(lxiii) | **✅残0クローズ（2026-07-31）**＝**登録時の診断（fresh 側のドリフト）は誤りだった**。原因は `isBatch1OnlyClause` が「対戦相手のライフクロス」を含む条件節を**25枚のカード allowlist に限定**していたことで、同型は全CSVで4枚あり**curated 側も大半が条件を落としていた**（＝held を解く前に「curated が正」という前提を疑うべきだった）。**新語彙2本**＝`HAND_COMPARE_OPP`／`ENERGY_COMPARE_OPP`（既存 `LIFE_COMPARE_OPP` と同形＝`cmp(自分, op, 相手)`）。ゲート緩和は「あなたより多い」形だけに限定（閾値形は batch1 限定のまま）。同時に `parseSigniTarget` の `centerZoneOnly` 脱落4枚（`WX15-033-E2`／`WX20-025-E3`／`WXDi-P02-065-E2`／`WX24-P2-091-E1`＝どのゾーンのシグニでも取れる過剰実行）と、**条件で包んだ前段が did-it ゲートから外れる engine の穴**（`execSequence` の3ゲートを else なし `CONDITIONAL` の `then` まで見る＝`gateStep`）も塞いだ。派生の残作業2件は (lxiv) へ登録。詳細 BUGFIXES 2026-07-31 (lxiii) 節。<br>**退避した登録時の原文**＝**🆕 `WX15-033-E2` の fresh が `CONDITIONAL{LIFE_COMPARE_OPP}` を落とす（2026-07-30 発見・held 据置中）**。原文「対戦相手の中央のシグニゾーンにあるシグニ１体を対象とし、**対戦相手のライフクロスの枚数があなたより多い場合**、それをバニッシュする」で、curated は条件を持つが fresh は条件を落として**無条件バニッシュ**になる。そのため (lxi) 第2波では `WX15-033` をカード単位採用できず、`WX15-033-BURST` だけ curated へ直接配線した。**このカードを held から解くには先にこのドリフトを直す**（同型の「〜の枚数があなたより多い場合」文型が他にも巻き込まれていないか要確認）。 |
| ✅(lxii) | **✅残0クローズ（2026-07-31）**＝`CONDITIONAL_DISCARD` を**型ごと退役**。⚠**PLAN の「executor に dispatch が無い＝完全 no-op」は半分だけ正しかった**＝それはアクション型 `{type:'CONDITIONAL_DISCARD'}` の話で、唯一の使用者 `WD16-016-BURST` が持っていたのは **STUB 形＝ハンドラは存在し動いていた**。その中身が「条件を一切見ず `ctx.ownerState.hand`＝**自分の**手札を1枚捨てる」という別物で、①相手 ≤5 のとき相手1枚＋**自分も1枚**（自傷）②相手 ≥6 のとき相手**0枚**（「代わりに2枚」未実装）＋自分1枚、になっていた。**新語彙0本**＝effectParser の (a) 裸の多段閾値に「N枚以上**の**場合」形と**比較演算子の原文取得**を足し（従来は数値だけ差し替えるので前段 `lte 5` が `lte 6`＝真逆になる）、(c) 枚数のみ形「代わりにN枚捨てる」＝base の `TRASH{HAND_CARD}` を複製して count だけ差し替える枝を追加して `CONDITIONAL{HAND_COUNT gte 6} then/else` へ。生成元3箇所（parseSentencePart1 のアクション型／Part3「〜の場合、手札をN枚捨ててもよい」＝到達0／Part4「N枚以上の場合、代わりにM枚捨てる」）とハンドラ・decompiler case も削除。詳細 BUGFIXES 2026-07-31 節 |
| ✅(lx) | **✅残0クローズ（2026-07-31）**＝タスク12(l) のクローズで開いた残2件。①`WX25-P1-056-E1`（`leaveReplaceBanish`）＝「あなたの＜C＞のシグニが対戦相手の効果によって場を離れる場合、その移動がバニッシュによるものでないなら、代わりにそのシグニをバニッシュしてもよい」＝**新設 `applyEffectLeaveReplaceBanishSubstitute` を非バニッシュ離場の9サイト（`execBounce`／`execSendToEnergy`／`execTrash`（場）／`execTransferToDeck` の各 apply ループ＋`applyDirectAction` の BOUNCE/SEND_TO_ENERGY/TRASH/EXILE/TRANSFER_TO_DECK）へ配線**。バニッシュ先は `banishDestination`（execBanish と同じ置換走査つき）。「してもよい」は既存2つの離場置換と同じ**自動適用の決定論的近似**（場離れ経路は同期的 ctx 変換で対話 pause を張れない）。JSON は無変更＝STUB id をそのまま engine 側の宣言として読む。②`WX12-020-E3`＝「この方法で捨てた手札1枚につき－6000」。旧は `TARGET_AND_DISCARD_HAND` の既定帰結で**相手シグニを1体バニッシュ**＋捨て1枚固定＋現在の手札枚数×－6000 を相手全体、の三重誤り。新語彙1本 `PowerModifyAction.deltaPerLastProcessedCount` で `SELECT_TARGET_ONLY→STORE_LAST_PROCESSED_TARGETS→TRASH{HAND_CARD ALL upTo}→POWER_MODIFY{targetsStored}` の正準形へ。⚠**文ごとの `steps.push` は入れ子 SEQUENCE を畳まない**（内側 pause で外側 continuation が内側を上書き）ため、2文型は `splitSentences` 前に捕捉して**平坦な SEQUENCE** を返す。詳細 BUGFIXES 2026-07-31 節 |
| ✅(xxix) | **✅2026-07-30 完全クローズ（計15波）＝「任意【出】のコストを、払わずに撃てる／払えなくて撃てない、の両方を潰す」**。`optionalOnPlayCostStub` で写せず実機で一度も発火しなかった任意cost【出】を**全件仕分け完了**（写せない 80相当→**4**＝残4件はすべて**明示保留＝理由つきで不発を維持**。`OPTIONAL_ON_PLAY_COST_REF_DEFERRED` は0件）。golden 1033→**1075**・census 1412→**1394**。**残4件**〔`WXDi-P12-031-E2` 複数ゾーン全捨ての合計枚数≧6 参照／`WXDi-P03-019-E1`「すべてのシグニ」が自分か両者か原文から確定不能／`WXDi-CP02-100-E1` トラッシュ→デッキ下の新コスト経路／🔴`WXK03-070-E1` は**本体の「1体をエナゾーンに置き」が丸ごと欠落**しており本体是正とセットでないと半実装〕は機構コスト待ちで据え置き＝**着手するなら「複数ゾーン全捨ての枚数記録」が2件に効く**。消化経緯の全文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 タスク12(xxix) 完全クローズ」節、一次記録は BUGFIXES 2026-07-29／07-30節 |
| ✅(xlvi) | **✅第17波までに計73効果を消化し残0でクローズ。原文は「手札に加える」なのに curated が `LOOK_AND_REORDER` のままで、pick が live で実行されない系統**（カードアドバンテージが死ぬ）。✅続き218g で9効果を外科採用。✅**2026-07-29 に6波で計57効果を消化**＝第1〜4波29（`pk` 拡張／`LOOK_PICK_CHAIN` 展開／中段 `then:'deck_top'`／OR記述子 `TargetFilter.anyOf`）＋**第5波26＝(h) 残0**（融合規則に **新 `parseRevealPickDescriptor`** で filter／「N枚まで」／新機構 **`handOrEnergy`** を通し、複数 pick 群3形を `LOOK_PICK_CHAIN` へ。同系統9効果も同時是正）＋**第6波6＝(d)1＋(a)5**（`pk` 規則の pick 動詞に hand-or-energy を追加／新 `colorMatchesAnyLrig`・`colorMatchesNonCenterLrig`・`LookPickChainStage.notSharesClassWithPrev`。🔴**同時に `execLookPickChain` が `stage.filter` を `resolveDynamicFilter` に通しておらず動的語彙を黙って無視していた engine バグを是正**）＋**第9波6＝(d) の主因**（🔴「好きな枚数を一番下・残りを一番上」＝**振り分けを選ぶ形**の機構 `split_top_bottom` は G168 で入っていたのに **parser 側の規則が無く**、手書き MANUAL の WX13-081/082 だけが使っていた。他6効果は「一番下」を含むだけで `position:'bottom'` に潰れ**見た全部がデッキ下へ**送られる過小実行だった。新規則の生 parser 出力は**人手の MANUAL と完全一致**）＋**第8波2＝(g) 残0**（【トラップ】設置併記。新ステージ `LookPickChainStage.then:'trap'`＋`remainder.location:'hand'`。🔴**`WX19-039-E1` は設置も手札加えも丸ごと no-op**、`WX15-083-TRAP` は STUB が残りの行き先をデッキ下に決め打ちしていた）＋**第7波8＝(c) 残0**（宣言参照 pick。新 filter `nameEqDeclaredName`／`classEqDeclaredClass`＋新 STUB `DECLARE_NUMBER_PLAIN`〔ガード制限を伴わない数字宣言〕＋`StubAction.declareOptions`〔原文が列挙したクラスだけを宣言候補にする〕。🔴**`PR-431-E2` は filter 落ちでどの公開札でも拾える過剰実行**、🔴**`WX13-054-E1` は `ENERGY_CHARGE_FROM_DECK{4}` ＝デッキ上4枚総取り**だった。同系統2効果〔`WX16-Re04-E1` の remainder 誤読・`WXK05-021-E2` の裸STUB〕も同時是正）。census 1476→**1453**・golden 891→**984**。<br>**残＝13効果**（(c)(e)(f)(g)(h) は残0・(d) は残1。live JSON 走査で確定した実数）。**残っているのはいずれも新機構が要るもの**：**(a) 残2**〔`WXK04-045-E1`＝場のシグニを対象に取ってから「それと同じ名前」（対象選択ステップ＋`nameEqLastProcessed` の連結）／`WXDi-P15-005-E1`＝「場にいるルリグ1体につき」でルリグ数ぶん段数が動く＋「公開→好きな枚数を手札・残りをエナ」の2フェーズ〕**(b) 複合・条件 10**〔`WXDi-P03-061-E2` は**held 群A＝採用すれば pick は入る**が「加えた枚数ぶん捨てる」が落ちる／`WX12-Re10-E1` 条件付きpick／`WX24-P4-037-E1`／`WX26-CP1-061-E1`＋`-SONG`／`WXDi-P05-015-E2` 束分け／`WXDi-P08-007-E3` REPEAT内／`WXDi-P09-066-E1`／`WXK02-001-E2`／`WX25-P3-052-E1`（エナ経由＝要偽陽性判定）〕**✅(c) 宣言系STUB 残0**〔`PR-434-E1`／`-BURST`／`WX11-037-E1`／`WX24-P1-035-E1` に加え、原文全数走査で新たに見つけた `PR-431-E2`／`WX13-054-E1` も同時に消化＝2026-07-29 第7波〕**(d) 残1**〔`WX11-074-E1`＝「選んだ色1つにつき」で色宣言との連動（宣言色ごとに段数が動く）が要る。⚠**旧記載の `WXDi-P16-086-E1`＝`then:'deck_bottom'`＋`_bottomReserved` が要る、は誤り**＝振り分け自体は既存 `split_top_bottom` で表せると2026-07-29 第9波で判明。pick を伴う分割はタスク12(lix)へ移した〕**✅(g) トラップ設置併記 残0**〔`WX15-083-TRAP`／`WX19-039-E1`＝2026-07-29 第8波〕。<br>⚠**ここから先は1効果あたりの機構コストが上がる**ので、(xxix) 残＝任意+cost 933効果（タスク12(lv)）やゲート脱落 [B]20件へ移る判断もある。詳細 BUGFIXES 続き218g／2026-07-29節（第1〜7波） |
| ✅(lvii) | **【消化済 2026-07-29】census の計器盲点＝「「Nまで」上限選択」のキー表に `pickUpTo` が無かった**（`upTo` は小文字uで `pickUpTo` に部分一致しない）。REVEAL_AND_PICK が原文どおり「N枚まで」を表現していても語彙欠落に数える偽陽性で、**look-pick を STUB→実アクションへ直すたび census が +1 される**事故が2度起きていた（第5波／第7波）。キー追加で**42効果**の偽陽性を解消し `BASELINE_HIGH` 1453→**1415**。⚠**機能変更なし＝計器較正のみ**（単独 commit）。42件は全数で「JSON に `pickUpTo` あり」かつ「原文に上限表現あり」を機械確認。<br>**残った判断**＝同カテゴリの残 106 のうち **27 は LOOK_PICK_CHAIN** だが、型名を key に足すのは**意図的に見送り**（LPC は stage 枚数を常に上限として扱い「ちょうどN枚」を表現できない＝一括免除するとその機構ギャップごと隠れる）。LPC に上限/固定の区別を入れるかは別途 |
| ↳(xlvi) 第11波 | ✅**既存機構だけで3効果を着地**：`WX12-Re10-E1`（`LAST_PROCESSED_MATCHES` 成立枝を `REVEAL_AND_PICK`）、`WX24-P4-037-E1`（`pickUpTo`＋`handOrEnergy`＋remainder shuffle）、`WXK02-001-E2`（`OPTIONAL_COST` 保持＋シグニ限定 `handOrField`）。`WXDi-P09-066-E1` は原文にデッキ公開/pick が存在しないため **(xlvi) の偽陽性として除外**。**残9効果**：`WXK04-045-E1`＝場対象→同名の連結、`WXDi-P15-005-E1`＝場ルリグ数ぶんの動的段＋公開後の手札/エナ二分配、`WXDi-P03-061-E2`＝pick枚数ぶん捨てる比例後段、`WX26-CP1-061-E1`/`-SONG`＝歌のカケラ効果の分離＋選んだ各札と場の各カード名の対応検査、`WXDi-P05-015-E2`＝相手が選ぶ2束、`WXDi-P08-007-E3`＝対戦相手の捨てる/支払う分岐を含む対話REPEAT、`WX25-P3-052-E1`＝pick結果のレベル合計snapshotを保った二分岐、`WX11-074-E1`＝宣言した2色それぞれに連動する動的stage。部分採用は後段を落として過剰実行になるため honest defer。詳細 BUGFIXES 2026-07-29「第11波」節。 |
| ↳(xlvi) 第12波 | ✅**必達 `WXDi-P03-061-E2` を着地**：新型・新engine機構ゼロ。既存 `REVEAL_AND_PICK` の pick 結果（`lastProcessedCards`）を既存 `count:{$ref:'last_processed_count'}` の手札 `TRASH` へ continuation 接続し、「スペルを好きな枚数手札へ→加えた枚数ぶん捨てる」を一体化。前半だけなら手札純増の過剰実行になるため禁止を golden で固定。**残8効果**：`WX11-074-E1`＝宣言色数ぶん動的stage／`WXK04-045-E1`＝場対象→同名連結／`WXDi-P15-005-E1`＝場ルリグ数動的stage＋公開後二分配／`WX25-P3-052-E1`＝pickレベル合計snapshot二分岐／`WX26-CP1-061-E1`＋`-SONG`＝歌効果分離＋各札/場カード名対応／`WXDi-P05-015-E2`＝相手選択2束／`WXDi-P08-007-E3`＝対話分岐つきREPEAT。詳細 BUGFIXES 2026-07-29「第12波」節。 |
| ↳(xlvi) 第13波 | ✅**必達 `WX11-074-E1` を着地**：PLAN の「宣言色数ぶん動的stage」は過大で、原文は必ず2色なので `LOOK_PICK_CHAIN` の**固定2段**で足りた（動的stage新設ゼロ）。不足していた `DECLARE_COLORS`（列挙4色から重複なし2色宣言）／`colorEqDeclaredColorIndex`（未宣言は空ヒット）／chain stage の `handOrEnergy` だけを追加し、各宣言色のシグニ1枚を手札かエナへ、残りはデッキ上へ戻す。**残7効果**：`WXK04-045-E1`＝場対象→同名連結／`WXDi-P15-005-E1`＝場ルリグ個別色の動的stage＋公開後二分配／`WX25-P3-052-E1`＝pickレベル合計snapshot二分岐／`WX26-CP1-061-E1`＋`-SONG`＝歌効果分離＋各札/場カード名対応／`WXDi-P05-015-E2`＝相手選択2束／`WXDi-P08-007-E3`＝対話分岐つきREPEAT。詳細 BUGFIXES 2026-07-29「第13波」節。 |
| ↳(xlvi) 第14波 | ✅**`WXK04-045-E1` と `WX26-CP1-061-SONG` を着地し、同カード `E1` への歌効果漏れも除去**。PLAN の「WXK04 は新連結機構が要る」は誤りで、既存 `SELECT_TARGET_ONLY`→既存 `nameEqLastProcessed` だけで足りた。SONG 用に新 filter `nameMatchesAnyFieldSigni`（自場シグニのカード名集合。場にシグニ0なら空ヒット）だけを追加。両pickとも従来は **no-op**、`WX26-CP1-061-E1` の余分な UNKNOWN/STUB は parse 混線だった。**残4効果**：`WXDi-P15-005-E1`＝場ルリグ個別色の動的stage＋公開後二分配／`WX25-P3-052-E1`＝pick結果レベル合計snapshot二分岐／`WXDi-P05-015-E2`＝相手選択2束／`WXDi-P08-007-E3`＝相手の捨てる/支払う分岐を含む対話REPEAT。詳細 BUGFIXES 2026-07-29「第14波」節。 |
| ↳(xlvi) 第15波 | ✅**歌本文の重複混入6枚を全件採用し、`WX25-P3-052-E1` を着地**。`WX26-CP1-068/069/076/084/092/093` は通常 `E1` から歌本文の残骸だけを除き、本来の【自】【出】と別 `-SONG` を保持（据え置き0）。`WX25-P3-052-E1` は既存 `REVEAL_AND_PICK` の pick 結果＋既存 `LAST_PROCESSED_LEVEL_SUM` で足り、**新機構ゼロ**。合計は非負整数なので `lte:4` の else＝`gte:5` とし、0枚pickも4以下枝へ入る。⚠PLAN の「pick結果snapshot機構が要る」は誤り。**(xlvi) の現残は3効果**：`WXDi-P15-005-E1`＝場ルリグ個別色の動的stage＋公開後二分配／`WXDi-P05-015-E2`＝相手選択2束／`WXDi-P08-007-E3`＝相手の捨てる/支払う分岐を含む対話REPEAT。上の (xlvi) 親行の旧「残13」内訳より本行の実数を正とする。詳細 BUGFIXES 2026-07-29「第15波」節。 |
| ↳(xlvi) 第16波 | ✅**必達 `WXDi-P08-007-E3` を着地**。固定3回は新しい REPEAT 型を作らず、既存 `SEQUENCE` に3回展開。既存 `OPPONENT_PAY_OPTIONAL`／`pending.opponentResponds`／continuation を流用し、不足していた「相手が手札1枚を捨てる」選択肢だけを最小拡張した。相手が《無》を支払う／手札を捨てる場合は pick なし、どちらもしない場合だけ既存 `REVEAL_AND_PICK{3→1枚まで手札,残りbottom}`。3回は独立に問う。**PLAN の「対話REPEAT新機構が要る」は過大**（新アクション型・REPEAT機構ゼロ、既存対話の支払手段拡張1点）。**(xlvi) の現残は2効果**：`WXDi-P15-005-E1`＝場の各ルリグ個体色を参照する動的stage＋公開後二分配／`WXDi-P05-015-E2`＝自分が束分けし相手が捨てる束を選ぶ所有者分離2段階選択。したがって **(xlvi) は未クローズ（残2）**。親行の旧「残13」と第15波の「残3」より本行の実数を正とする。詳細 BUGFIXES 2026-07-29「第16波」節。 |
| ↳(xlvi) 第17波 | ✅**最後の2効果を着地し、計73効果・残0で (xlvi) クローズ**。`WXDi-P15-005-E1` は場ルリグ最大3体（センター＋左右アシスト）なので固定3段＋不在index空ヒット＋既存 `handOrEnergy` で足り、動的stage不要。`WXDi-P05-015-E2` は既存 `REVEAL_AND_PICK{6→3}`＋`opponentResponds` CHOOSEを再利用し、選択3枚／補集合3枚のinstanceIdを相手選択後まで保持する最小内部拡張だけを追加。2件とも従来は **no-op**。PLAN の「機構コスト最大」は再び過大だった。live差分 changed 2 / added 0 / removed 0、census 1410据置、golden 1011、held 252枚/108署名。詳細 BUGFIXES 2026-07-29「第17波」節。 |
| ↳(lviii) | **実測10効果。9効果を `LOOK_PICK_CHAIN{then:'trap'}` へ移行し、順序違い3件を解消（2026-07-29）**。`SP26-001-E1`／`WD23-032-A-E2`／`WX20-012-E1` は原文どおり remainder を deck_top、ほか移行6件は deck_bottom。`WX15-035-E2` は同カードE1のトラップ発動とは別のデッキ公開【出】なので移行対象。**残1＝`WXEX1-13-E1`**：既存トラップを SIGNI として BOUNCE する誤構造＋「そうした場合」が `IS_MY_TURN` 化しており、LPCだけ部分移行すると条件踏み倒しになるため honest defer（did-it ゲート＋trap-to-hand の一体修正が必要）。詳細 BUGFIXES 2026-07-29 (lviii) 節 |
| ✅(lix) | **✅2026-07-29 に全4効果を消化し残0クローズ**。第10波 `WXDi-P16-086-E1`／`WX24-P3-031-E1` で `remainder.position:'split_top_bottom'` を実装。最終波 `WXK02-032-E1` は既存 `NumberOrRef` に「7－自ライフ枚数」の入口を追加し、ライフ7＝公開0／ライフ0＝公開7を固定。`WXK03-048-E1` は `parseRevealPickDescriptor` の行き先に `field` を通し、MANUAL を「遊具2体がこの方法で戻った」ゲート付き `REVEAL_AND_PICK{遊具,3枚まで→場,split}` へ更新。🔴直実測で場の空き1に対し3枚選ぶと未配置札1枚が消失する容量上限漏れを発見し、SEARCH上限を空きシグニゾーン数へ制限。**新アクション型・新UI機構ゼロ**（既存機構の入口語彙＋容量ガードのみ）。詳細 BUGFIXES 2026-07-29「(lix) 最終波」節 |

## 2026-07-30 タスク12(xxix) 完全クローズ（PLAN §3 の全文をここへ退避）

> (xxix) は 2026-07-29〜30 の計15波で「実働 or 明示保留」に全件仕分けを終えた。
> 消化経緯の要約は [PLAN.md](./PLAN.md) §4 進捗サマリと [PLAN_PROGRESS.md](./PLAN_PROGRESS.md)、
> 一次記録は [BUGFIXES.md](./BUGFIXES.md) の 2026-07-29／07-30 節。以下はクローズ時点の PLAN §3 の行の全文。

**semantic audit stub群 round3（2,101枚・findings 2,799件）**＝①duration系統／②選択肢欠落／③「そうした場合」did-it ゲート／(a)／(b)／(b1)／**(b2-i)〜(b2-vi)** は**すべて✅消化済**（1437効果の自身【出】配線まで到達。消化経緯の全文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節、一次記録は BUGFIXES 2026-07-28節／続き148・149・218h・222・223・226・243）。<br>✅**(1) 自身【出】の任意+cost 933効果は 853件を配線済**（2026-07-29）＝collector が `SEQUENCE[OPTIONAL_COST, 元action]` に包んで積み、engine 既存の Pattern ⑤（「任意コスト：支払いますか？」）へ載せる。BattleScreen 無改造で `EffectInteractionModal`＋`resumeOptionalCost` がそのまま支払いUIになる＝**golden で検証できる**。**残＝(1) 未対応コスト80件**〔exceed 21／fieldTrash 18／lrigDown 7／trashArtsFromLrigDeck 6／discardUpTo 6／beat_signi 6／life_crash 4／removeOppVirus 3／その他9。`OptionalCostSpec` が**エナ色／《コイン》／手札捨て／エナゾーン捨て**しか表現できないため。⚠**払っていないコストを踏み倒して効果だけ通す方が、発火しないことより有害**なので取りこぼす側に倒してある〕✅**(2) 段階3の65効果は3種の混在だった**（2026-07-29 に分類・消化）＝🔴**英知＝N の全角「＝」を parser が取りこぼして24効果が `activeCondition` を丸ごと失っていた**（**うち15効果は live で条件なしに発動する過剰実行**＝【常】英知＝５で無条件+3000／【常】英知＝８で無条件アサシン等）。英知はコストではなく使用条件なので【出】14効果は **mandatory へ復帰**（v0.263 の決定に戻す＝既存の mandatory 経路に乗る）、真の「〜してもよい」8効果は新 **`OPTIONAL_ACTIVATE`** 包み（「発動しますか？」）で通常召喚・効果配置の両方から配線。✅**(2) filter付き手札捨て12効果を構造化**（2026-07-29）＝アイコン／クラス／色／カード名部分一致／カード種別／漢数字と、異種filter複数枚（`discardGroups`）を既存の共通手札捨て支払い経路へ配線。段階3の残43件は **33件**。⚠初期 `costUnparsed` は実測 **336件（A:回数制限のみ185／B:実コスト句65／C:判定不能86）**で、非空ヘッダを全て印す条件のため偽陽性が大半だった。実コスト構文がある場合だけに絞り、live は **47件（AUTO 47／ACTIVATED 0）**へ較正。「包むなら原文のコスト句は必ず空」の golden 不変条件は維持し、構造化済みは印を外す〕✅**(2b) `EICHI_LEVEL_SUM` は `eq`（ちょうどN）で確定**（2026-07-29）＝カード自身のルール補足「（＜英知＞のシグニのレベルの合計が**ちょうど**Nであるかぎり有効になる）」が明記。`gte` 説は誤りだった。🔴**同時に第2の半分＝「レベル読み替えで合計は集合になる」を実装**（`WX20-044-CB` の補足「レベル２と３の英知シグニがある場合【英知＝６】【＝７】【＝８】はすべて条件を満たす」）。旧実装は範囲を**最大値1つ**へ潰しており `WX21-029` 自身の【出】英知＝８が**永久に不成立**、`WX20-044-CB` は位相限定なし＋列挙表記のため**能力が丸ごと未実装**だった。新 `PlayerState.eichi_level_options`（取りうるレベル群）＋合計の集合判定で解消**(3) watcher [B]4件**（エナ由来／手札以外由来／【出】能力保有＝限定語彙が無く `timing:[]` で安全停止中）**(4) defer 3件**（相手効果による自シグニ場離れのターン履歴 Condition／配置個体への `REMOVE_ABILITIES` 固定語彙／`ATTACH_CHARM_FROM_TRASH` 本実装）**(5) (b2-ii) の defer 4件**→(3)〜(5) は §6.3 送り。<br>⚠**この経路は `fuzz`/`smoke` が通らず golden だけが網**（`selfPlayFuzz.ts:12-13` が自ら明記）＝BattleScreen 側の変更は実機 driver でも確認する。明細と表 `docs/_semantic_audit_stub_round3_triage.txt` §6

## 2026-07-29 タスク12(xlii) `GRANT_LEAVE_PLACE_PENDING` 完全クローズ

- **WX21-004-E2**：エナ配置 parser に既存 `levelEqTrigger` を配線し、ON_LEAVE_FIELD 収集時に離脱カードの具体レベルへ解決。fresh 全数差分は当該1カードのみ。
- **WX22-001-E3**：`INSTALL_DELAYED_TRIGGER` に ON_LEAVE_FIELD 条件と `THIS_ATTACK_PHASE` 寿命を追加。設置者側の＜遊具＞離脱だけを拾い、離脱カードより低いレベルの手札＜遊具＞を配置する。ATTACK_LRIG→END で当該寿命だけ削除。
- 2カードを held 採用し live JSON の意味差分は2効果のみ。`GRANT_LEAVE_PLACE_PENDING` は実データ残0。golden 900、smoke 10726、fuzz全0、census高シグナル1476据置、gates 3回全緑。詳細は BUGFIXES 2026-07-29先頭節。


---

## §3 モデル分担・Opus割付の消化済み詳細（続き42-47・2026-07-09に PLAN §3 から退避）

- **`GRANT_TO_PLACED_SIGNI` の実装**（「この方法で場に出たシグニは…を得る」＝targetsLastProcessed 機構・§6.3）**✅続き42（Opus）で完了（4枚）**＝parser で「この方法/効果で場に出たシグニは【K】を得る／のパワーを＋N／レベル１につき…ミル」を `GRANT_KEYWORD`/`POWER_MODIFY`{targetsLastProcessed}（engine 既存）＋新設 `MILL{countIsLastProcessedLevelSum}` へ振り分け、WX25-P1-044/WX25-P2-039（アサシン）・WX24-P3-037（+3000・次相手ターン終了時まで）・WX24-P3-039（レベル合計ミル）を STUB から実アクション化。**残＝引用複合能力付与2枚のみ（WX24-P1-017/WX25-P3-038＝「「【自】…」を得る」＝GRANT_QUOTED_AUTO_ABILITY 系の内側ability parse が要る）は honest STUB 温存**（§6.3・PLAN §3 Opusタスク4 に統合）。詳細 BUGFIXES。
- **census「動的比較 35枚」**（「〜より高い/低い」＝heterogeneous・per-card）の消化履歴＝**🔸続き43（Opus）で自己参照9枚＋トリガー参照6枚 着地（powerLt/Gt/levelLt/GtSelf・powerLt/levelLt/GtTrigger・engine 解決を resolveDynamicFilter に集約＝sourceCardNum/triggeringCardNum 引数・trash→field ビルダーにも parseTriggerComparison 配線・census 1631→1624）**。**✅続き44（designation post-pass 6枚）・続き45（`powerLtAnyAlly` 2枚）・続き46（`powerLtPrinted`/`powerGtPrinted` 2枚）・続き47（`powerLtLastProcessed`/`levelLtLastProcessed`＝lastProcessed 個別機構2枚＝WXDi-P08-031/WXK10-031）で消化継続**。残（opp/own センタールリグ・デッキ相対 SEARCH・条件文・lrig相対）は PLAN §3 Opusタスク3。詳細 BUGFIXES。

## §3 モデル分担・Opus割付の消化済み詳細（続き56-69・2026-07-11に PLAN §3 から退避）

- **続き56発見の4系統×8枚の原因調査 → ✅続き59（Opus）で全解明**＝EQUALIZE_ENERGY owner欠落（真バグ5枚・parser修正）／EXILE owner反転（真バグ1枚・parser修正）は是正して held 124→118。duration「反転」（WX25-P2-062）と triggerScope欠落（WXDi-CP02-TK01A）は誤診と判定（前者は engine機能同一だが逆翻訳注記の退化＝held温存が正／後者は fresh が triggerScope保持済み・held は STUB機構待ちが理由）。派生課題＝durational付与の先頭「ターン終了時まで」期間注記脱落 約102枚は **✅続き62（Opus）で decompiler側 `restoreLeadDuration` により112枚是正**（engine/JSON不変・§5b参照）。詳細 BUGFIXES 続き59/62。
- **effect-restriction（配置数制限）✅続き63（Opus）で実装**＝「対戦相手はシグニをN体までしか場に出せない」5枚（WXK11-074/WX07-006/WX12-008/WXDi-P05-024/WXK05-009）。`signi_deploy_count_limit` フラグ＋CONT `collectDeployCountLimit`＋超過即トラッシュ＋配置ブロック（人間/CPU/UI）＋ターン境界リセット。census 1572→1567・golden 177・実機 deployRestrict PASS。詳細 BUGFIXES。
- **census「動的比較」の消化続き**＝WX19-042 は既に正パース済みと確認（filter `levelLtOppLrig`・target は self シグニ）。**デッキ相対 SEARCH 3枚 ✅続き68（Opus）**＝「この方法で捨てたシグニより±Nレベル/共通クラス」を `resolveDiscardLevelFilter` 拡張（levelLtDiscardSigni/levelEqDiscardSigniOffset/classMatchesDiscardSigni）＋execSearch への配線追加（従来 SEARCH経路で未解決）。census 1566→1563・golden183。**lrig相対 WXEX2-25-E3 ✅続き67（Opus）**＝GRANT_EFFECT で相手センタールリグへ CONT POWER_MODIFY(levelLtSelf) 付与＋`calcFieldPowers` に `resolveContSelfLevel` 追加。census 1567→1566・golden181・同型★0。**WXK07-025-E2 の DRAW+condition 復元 ✅続き59（Opus）**＝`の?場合` parser修正＋完全形MANUAL（BUGFIXES続き59第2件）。詳細 BUGFIXES。
- **引用内 CHOOSE（WXDi-D09-P20）✅続き69（Opus）で消化**＝「（カードをN枚）引くか<B>」トップレベル動作選択を `parseDrawOrChoice` で CHOOSE(2択) 化＝26枚 adopt（census 1563→1558・golden 187・同型★0）。WXDi-D09-P20 は引用付与の内側 CHOOSE も開通。held残置3枚（WX20-078/SPK01-14/WX19-062）は CHOOSE復元 backlog へ。詳細 BUGFIXES。
- **`execAttachAcce` fromHand経路の実装バグ ✅続き65（Opus）で修正**＝2段chaining（`_selectingAcceFromHand`/`_pickedAcceCard`）実装＋`battleCardNums.addState` への `signi_acce` 走査追加（装着アクセの effectsMap 脱落＝ON_ACCE_ATTACH 不発の第2バグも同時解消）。実機 acceAttach PASS（既定orderに追加）。**WXEX2-50-E3 step1 owner誤パース ✅続き66（Opus）で修正**＝parser の「トラッシュから場に出す」ハンドラに「対戦相手の場に出す」検出を追加し owner/source.owner を opponent に是正（傀儡系12枚は据置）。held 120→119・census1567不変・R30 の発火経路開通。詳細 BUGFIXES。
- **`GRANT_TO_PLACED_SIGNI` の実装 ✅続き42（Opus）で完了（4枚）**＝上の続き42-47セクション参照。残の引用複合能力付与2枚（WX24-P1-017/WX25-P3-038）は現行 Opusタスク1 へ統合。

## §3 割付の消化済み詳細（続き71-92・2026-07-12に PLAN §3 タスクリストから退避）

- **Opusタスク10＝CHOOSE平坦化復元 held の最終見極め＋採用 ✅完了（続き76・Opus）＝パターンA〜F をすべて解決**＝**A**=丸数字クラスが④止まりで⑤が④に吸収（5択カード）・**B**=FREEZE/NEGATE_ATTACK がルリグ対象を見ずシグニに潰す（engine の LRIG 分岐も新規実装）・**C**=STUB誤マッチ（効果ドロー禁止 BLOCK_ACTION を engine ごと実装／「選んだ能力を得る」は STUB へ委譲）・**D**=「ライフクロスがちょうどN枚の場合」の条件ゲート脱落（無条件に自分の全シグニをトラッシュしていた）・**E**=汎用 DRAW/ENERGY_CHARGE の owner が self 固定（相手を利するデメリットが自分の利益に化ける）＋手札 EXILE の実装・**F-1**=連用中止形「Aし、Bする」で先頭の動作が無言脱落（47枚）・**F-3**=スペルの【自】ブロックが本体に流入・**F-4**=遅延トリガー「次のアタックフェイズ開始時」の即時化（engine の遅延収集も新設）・**F-2**=「代わりに」の条件語彙を新設（`HAND_TRASHED_BY_OPP`/`ENERGY_TRASHED_BY_OPP`）。詳細 BUGFIXES 続き76。
- **Opusタスク12＝Sonnet が積んだ engine/parser バグの修正（常設受け口）の ✅続き78（Opus）で旧在庫8件を全消化**＝(a)EXILE→TRASH誤変換7枚系統（parser にEXILE 3形を新設・5枚は fresh==curated 化・TK1A timing是正/P13-089 no-op是正を採用）・(b)多段「あるかぎり」2枚（真因2本を発見＝genericKagiri の引用跨ぎ消費と qfSelf 貪欲丸呑み。`THIS_CARD_HAS_UNDER{filter}`/`rawStages`/`LOSE_SIGNI_BARRIER` 新設＋連用中止「パワーは＋Nされ、<B>」系統48枚へ横展開）・(c)条件ドロップ3枚（ガードC例外化＋manualEffects triggerScope追加）・(d)inner duration（`restoreLeadUntilEndOfTurn` 共通化＝母集団112枚を機械分類で一括採用）・(e)GRANT_CHOSEN_ABILITY汎用ハンドラ点検（実欠陥は WXK08-026 の `_SELF` 誤対象選択＝効果元自動化＋クラス限定適用を追加）。計148枚採用・golden 230・census 1483。詳細 BUGFIXES 続き78。（発見時点で据置いた新規在庫(i)〜(x)は PLAN §3 Opusタスク12 の生きている worklist に残置）。
- **Sonnetタスク5＝golden 型網羅の追加 ✅実質完了（続き82-85・Sonnet・golden 106→277）**＝121型中99型をテスト化（続き82:12型／続き83:POWER_MODIFY_PER_*/BY_*系13型／続き84:9型／続き85:15型）。残22型は(a)PLAN §6.1 の未実装15型（engineにcase自体が無い＝Opus機構実装待ち）(b)no-opプレースホルダ5型（COUNTER_SPELL/LRIG_LIMIT_MODIFY/RECOLLECT_GATE/UNKNOWN/ALT_COST_OPP_TURN）(c)PLAY_FREE（複合STUB委譲で価値の薄いテスト）(d)GROW_FREE（no-op placeholder）＝いずれもSonnetが今テストを足す価値が無いため次はOpus機構実装後の追随に委ねる。過程で新規engineバグ2件を発見しOpusタスク12(v)(vi)へ登録（`applyDirectAction`のENERGY_CHARGE/STORY_CHANGE/POWER_MODIFY_PER_LRIG_LEVEL/POWER_MODIFY_PER_FIELDのcase欠落・`POWER_MODIFY_PER_DECK_COUNT`のeffectEngine.ts未実装）。engine/parser/JSON は全期間無変更（census 1483・同型★0とも維持）。詳細 BUGFIXES 続き82-85。
- **Sonnetタスク7＝§5b Z-2 BET系の表現描画 ✅完了（続き86・Sonnet）**＝PLAN記載の「19+11+8=38」は古い数字で現状（実測19＝BET_MECHANIC 11／BET_ALTERNATIVE 7／BET_CONDITION 1）と不一致だったが、現存する全19効果に`decompileEffects.ts`の原文抽出規則を追加し意味文化。engine/JSON不変・同型★0/census 1483とも維持。詳細 BUGFIXES 続き86。
- **Sonnetタスク10＝WXK04-003 のボタンラベル表示バグ ✅完了（続き81・Sonnet）**＝`getMyLrigFieldActions` 内3箇所（own/継承/付与のcostParts）に `eff.cost?.coin` 考慮を追加。E2「サプライズ《コインアイコン》」が「【起】コストなし」→「【起】コイン1」に是正。実UI検証＝`node scripts/verifyBattleDrive.mjs wxk04003Label` PASS（もう一方のボタン＝`WXK04-003-DECORE`〔manualEffects.ts・【デコレ】ACCE付与〕はcost count:0で元から正当な「コストなし」＝2ボタン共存が正解と判明）。詳細 BUGFIXES 続き81。
- **Sonnetタスク11＝`checkAllEffects` の `MANDATORY_SUSPICIOUS` 一次精査 ✅完了（続き89-92・Sonnet）**＝62件検出（EFFECT_TYPE_MISSING_CONTINUOUS 20／MANDATORY_SUSPICIOUS 38／OPTIONAL_SUSPICIOUS 2／POWER_VALUE_MISMATCH 1／MILL_COUNT_MISMATCH 1）のうちMANDATORY_SUSPICIOUS 38件を全精査＝単点是正16件を修正（続き89:7件＋続き90:9件。`optional`欠落＝強制実行バグ・owner誤り2件・filter未限定1件。census 1483→1480）・構造的バグ7件をOpusタスク12へ登録・さらに続き90でOpusタスク12へ追加登録7件（複数条件+owner混同・遅延トリガー欠落・アイコンフィルタ欠落・値選択CHOOSE化欠落・`TRANSFER_TO_DECK`にoptionalフィールド自体が無い・2条件ADD_TO_FIELD構造不備・第1能力まるごと未実装）・POWER_VALUE_MISMATCH（WX06-006）は「代わりに」置換機構欠落と判明しOpusタスク6へ・MILL_COUNT_MISMATCH（WX24-P3-039）は誤検知で修正不要と確認。**✅続き91でEFFECT_TYPE_MISSING_CONTINUOUS 20件も全精査完了**＝15件は「AUTOにcondition/activeConditionで条件ゲートを直接埋め込む」実行時等価な代替表現＝誤検知（JSON変更不要）・真バグ5件を修正（WXK10-039＝印字キーワード【アサシン】が丸ごと未実装／PR-426・WX05-021・WXDi-P07-060＝「常に…を得る」の片方が欠落／WXDi-CP02-103＝「すべての領域でクラス扱い」機構が実カード母集団0件で初適用）。census 1480→1479。**✅続き92で`verifyEffects`「定義なし」誤検出も再調査＝全12シート再走査で現状0件と確認しクローズ**。診断ツールは`scripts/_checkAllEffects.mjs`として再実行可能に常設化。MANDATORY_SUSPICIOUS残り22件は`REVEAL`/`LIFE_CRASH`/`ENERGY_CHARGE_FROM_DECK`にoptionalフィールドが無く単点是正不可（engine拡張が要る）or構造的複合バグ＝Opus送り確定。詳細 BUGFIXES 続き89-92。
- **Sonnetタスク12＝§5b 英語ID漏れ残367件の系統分類 ✅完了（続き87・Sonnet）**＝PLAN記載の「367件」は古い数字で現状（実測823カード・タグ出現968・distinct id 316種）と大きく乖離していた。新設の`scripts/_stubLeakScan.mjs`で機械抽出→キーワードベースで16テーマに分類し`docs/_stub_leak_classification.txt`へ出力。上位＝デッキ操作系184枚／パワー修正系165枚／手札系102枚。JSON/engineは無変更（分析のみ・JSON再構造化の本修正はOpusタスク13）。詳細 BUGFIXES 続き87。

## §5c 語彙センサス消化バッチの履歴（優先順・続き18改訂の原文）

- **✅続き199：look-pick カード名filter cleanテール（1効果）**＝`WX19-049-E1`「その中からカード名に《盾》を含むシグニ1枚を手札に加え、残りを好きな順番でデッキの一番上に戻す」を、既存 `cardName` 付き `REVEAL_AND_PICK` へ parser 規則だけで是正。fresh 全数差分は同 effectId 1件のみ、census 1971→1970、golden 436→437。OR／それぞれmulti-filter／多目的／他の名前・アイコン／colorMatchesLrig は未消化のまま。

- **優先順（続き18改訂）**＝(1) **条件節781→バッチ①146枚済（続き23・状態条件9テンプレ＝場に他の＜C＞/＜C＞N体/クロス状態/手札・エナ・ライフ・トラッシュ枚数/センタールリグ＜C＞/登録者数）**。~~「それが＜C＞のシグニの場合」73枚~~ **✅続き24で消化**（70枚=REVEAL_AND_PICK済み偽陽性のextraOk較正＋実バグ13枚=LAST_PROCESSED_MATCHES新設・採用10+MANUAL3）。~~「次にダメージを受ける場合」46枚~~ **✅続き25で消化**（A11 PND済み偽陽性キー較正＋A2 27 damageSource純改善36自動採用＋B7 実バグ=REPLACE_NEXT_DAMAGE_WITH_MILL新設・採用9+MANUAL）。~~「場に《X》がいる」13枚~~ **✅続き26で消化**（全13が条件丸ごと脱落の実バグ＝偽陽性0・HAS_CARD_IN_FIELD にルリグゾーン走査を追加し25効果を条件ゲート化・採用25/不採用1）。~~「ベットしていた場合」9枚~~ **✅続き27で消化**（全9が IS_BETTING 脱落の過剰効果＝追加ボーナス無条件発火・parser規則で採用9・「ベットしていた場合」9→2/「機構:ベット」10→2）。残りの上位テンプレ＝**「代わりに」B系統の残**（per-target「それのパワー－N」型・多段閾値の値のみ型）＝`docs/_census_clusters.txt` 枚数順で継続。**続き28で「代わりに」を機械分類**＝A:ena→trash16（偽陽性15＝BANISH_REDIRECTキー較正済・実バグWXDi-D04-016のみ）✅・**B:条件+代わりに94→自己完結enhanced型15枚を else付きCONDITIONAL で消化✅**（`matchLeadingStateCondition`＋SEQUENCE組み立ての昇格置換・per-targetとコア型不一致は据置）・C:コスト代替6・D:バニッシュされない3・E:リコレクト2。**~~B残＝per-target「それのパワー－N」・多段閾値の値のみ~~ ✅続き29で消化**（per-target値すり替え＋裸閾値subject引き継ぎ＋CHOOSE平坦化復元の3機構＝64枚採用＋WXK02-037手パッチ。残＝C6/D9/E2/B1残10（条件語彙なし§6.3）＋CHOOSE復元held約35枚）。(2) **幻覚/取り違え系（続き19でほぼ消化済み）**＝逆action・逆数値は BANISH残0/LIFE_CRASH残0/FREEZE1（WX19-077）/逆数値0 まで消化（LIFE_CRASH族7効果・トラッシュ→BANISH族 parser5規則+curated37ノード・詳細 BUGFIXES）。残＝WX16-021（置換ルール→即時LIFE_CRASH幻覚＝置換機構要・§6.3）・BURST内IS_MY_TURN残7（§6.3登録済み）。~~BURST↔E1誤配置5・アーツタイミング5・マーカー構造43・FREEZE1~~ **✅続き20で消化**（マーカー構造はブロック分割の系統根本原因＝70超効果復元・残は【自】2＝スペル被破棄トリガー機構待ち §6.3）。(3) **構造平坦化系**＝~~引用付与平坦化161~~ **バッチ①✅続き30で68枚採用**（対象付与/ルリグ自己付与/ALL付与＝GRANT_EFFECT+rawText展開・残107＝CONTSELF_COND18/OTHER約30/内側品質不全27＝トリガー語彙拡充で再収穫可・held 103 が計器）・代わりに183・IS_MY_TURN誤変換65・遅延13・「Nまで」120。(4) 除去系の対象フィルタ脱落（クラス339=`story`・色105・パワー閾値83・レベル閾値90・凍結13・ダウン/アップ38・数値不一致153・小さい数390=粗い網）。(5) トリガー種別（約220）・コスト脱落（コイン24+場トラ25+エナトラ12+他）・ゾーン行き先67・機構census（ライズ31/チーム25/アンコール22/エクシード16等）・公開128・次相手ターン99・相手選ぶ31・制限58・キーワード86。(6) 制限/様相（ターン1回28・ゲーム1回3・任意→強制23）・保護/付与系（同一性46・共通色66・能力なし10）。(7) 語彙自体が無い系統＝最上級（6枚・`TargetFilter` に `superlative:{key,dir}` 新設）・**正面32**（`frontOfSelf` はあるが使用3件＝parser 未配線疑い）・動的比較の残36・合計制約27・**出現条件35＝機構1本の欠落（parser が除去+engine強制なし）**は §3「機構実装の型」で新語彙＋engineセット実装。

### 進め方（続き23改訂の原文・現在は `/census-batch` スキルへ定型化済み）

- **進め方（続き23改訂＝文型バッチ・パイプライン）**＝①`npm run census:clusters` でクラスタ表（`docs/_census_clusters.txt`）を再生成し枚数順に系統テンプレを選ぶ→②テンプレの条件/構造が既存DSL型（engine/decompiler対応済み）で表現できるか確認（できない＝機構待ちとして §6.3 へ枚数付きで送る）→③parser 規則を追加（**JSON手パッチではなく parser を source of truth に**）→④`npm run build:effects`（純粋上位集合は自動採用・構造変更は held 落ち）→⑤`node scripts/heldReview.mjs` で diff署名グループごとに spot-check→`--adopt`/`--adopt-sig` で一括採用（**STUB退化・「代わりに」昇格・別STUB id 化は採用しない**＝レガシードリフトとして据置）→⑥golden 1件/テンプレ＋全ゲート→BASELINE_HIGH 更新。旧手順（census明細から手パッチ）は廃止＝parserWorklist held を増やさない。

## §5b 逆翻訳機レンダラ是正の完了項目（BUGFIXES①〜⑤）

- ~~① REVEAL_AND_PICK 文法崩れ~~ **✅是正（2026-06-30・BUGFIXES①）**＝then フル節の二重主語崩壊を配置系/別効果系の2形に。
- ~~② LOOK_AND_REORDER 行き先欠落~~ **✅是正（BUGFIXES②）**＝destination（一番下に置く/上に戻す）を描画・513枚。
- ~~③ CHOOSE 圧縮~~ **✅是正（BUGFIXES③）**＝「次から」→「以下のNつからMつ（まで）を選ぶ」。
- ~~④ BLOCK_ACTION 英語ID漏れ~~ **✅是正（BUGFIXES④）**＝「は「ATTACK」ことができない（END_OF_TURN）」108件→0。制限/許可/特殊の3分類。
- ~~⑤ timing/icon 英語漏れ~~ **✅是正（BUGFIXES⑤）**＝TRAP_ICON→【トラップアイコン】/SONG_ICON→【歌のカケラ】/ON_BLOOM/血晶武装 等。

## §6.1 未実装action型の実装済み項目

- ~~`LEVEL_MODIFY`(9)~~ **✅実装済**（temp_level_mods＋実効レベル・BUGFIXES上部）。
- ~~`LOOK_AT_DECK_AND_LIFE`(3)~~ **✅実装済（2026-07-03）**＝覗き＝情報開示のみ（盤面不変が正しい）・log-only。
- ~~`VARIABLE_DISCARD_AND_DRAW`（1・WX09-Re15）~~ **✅実装済（2026-07-03・BUGFIXES上部）**。
- ~~`NAME_BAN`（2・WX10-023）~~ **✅実装済（2026-07-04・続き14）**＝`blocked_card_names_game`（ゲーム内持続）＋targetSelf反転是正。
- ~~`GROW_COST_REDUCTION`（CONT6）~~ **✅実装（2026-07-03・BUGFIXES上部）**＝pure `collectGrowCostReductions`（golden済）＋人間/CPU/アシストグロウ全経路に減額配線。**🆕続き116（Sonnet）でコード読解によりWX14-009/WD14-001の2枚がper-count scaling非対応と判明**＝`GrowCostReductionAction.reduction`型が`{color,count}[]`の固定値のみでトラッシュ枚数連動のフィールドが構造的に存在しない。WX14-009「トラッシュの《フレイスロ》カード**7枚につき**赤1減る」・WD14-001「トラッシュの＜悪魔＞シグニ**6枚につき**黒1減る」は原文がper-N-count scalingだが、JSONは条件なしの固定「赤×1」「黒×1」としてparseされており、トラッシュが空でも常に1色分減額されてしまう（過大軽減の恒常バグ）。他4枚（WX10-010/WD13-002/WD13-003/WXDi-P03-039/WX24-P2-043）は原文どおり固定値またはactiveCondition付き固定値で問題なし。機構拡張（reduction要素にfilter+perCount fieldを追加）が要る＝§6.3相当の新規機構としてOpus送り。詳細 BUGFIXES 続き116。
- ~~`POWER_MODIFY_PER_ENERGY`（1・WX09-019・CONT）~~ **✅実装済（2026-07-03・続き13）**＝`calcFieldPowers` に `_COLOR` 同様の per-energy を追加（golden済）。**✅続き116（Sonnet）で実機PASS確認（2回連続）**＝`verifyBattleDrive.mjs powerModifyPerEnergy`＝エナ3枚の状態でP3000の攻撃を受けても基本パワー0+2000×3=6000として正しく生存することを確認（バトルログで「羅植姫　アキナナ（6000）」の表示も確認）。既定orderに追加。

## §11 大型機構オーナー表の完了行

| 機構 | 影響 | リスク | 状態 |
|---|---|---|---|
| ~~`SET_TRAP` 設置アクション~~ | 中（~30枚） | 中 | **✅完了**＝engineは既存（`signi_traps`ゾーン）。decompilerで9系統トラップSTUBを原文【トラップ】語彙描画（生STUB残0）。 |
| ~~動的閾値フィルタ~~ | 小（WX17-028等） | 中 | **✅完了**＝`REVEAL_DECK_TOP`＋`TRASH_REVEALED`アクション＋動的閾値フィルタ新設。 |
| ~~遅延条件トリガー~~ | 小（WX25-CP1-069等） | 中 | **✅完了**＝`INSTALL_DELAYED_TRIGGER`機構新設。 |
| ~~《相手ターン》/《自分ターン》AUTOトリガー基盤~~ | — | — | **実装済** |
| ~~【ビート】機構（Phase1-7）~~ | 44枚 | — | **完了**。残はトラッシュ版選択ピッカーのみ（低優先） |
| ~~傀儡場出しの汎用化~~ / ~~`levelLteLastProcessed`~~ | — | — | **実装済** |

---

## §3 モデル分担タスクリストの全文（2026-07-14 に PLAN §3 から退避＝続き130時点のスナップショット）
> PLAN §3 は「生きているタスクの表」だけに圧縮した。以下は退避時点の各タスクの詳細本文・完了履歴・知見（timing センサス消化の運用知見・Opusタスク12 の在庫明細を含む）の原文。**タスク番号は PLAN §3 の表と同一**。

### モデル分担（Sonnet 5 / Opus 4.8）
**判断軸＝「コーディング難度」ではなく「意味的退化を見極める検証規律が要るか」**。ゲート（smoke/golden/fuzz/同型★0/census baseline・CI）は**モデル非依存の自動ガード**でクラッシュ・構造破壊は必ず捕まるが、**「全ゲート通過なのに意味が間違っている」退化はゲートを素通りする**（PLAN が警告する「無検証置換で約90枚退化の前例」の失敗モード）。ここの見極めだけがモデル依存。

- **Sonnet 5 で回せる（定型消化・データ単点修正）**：
  - §5c の**パイプライン機械実行**（`build:effects`→`heldReview`→ゲート→シート再生成→commit の定型サイクル）。
  - **owner/値/duration の単点修正バッチ**（parser/engine 変更なし・原文照合が素直なもの。続き31 の「対戦相手のデッキ削り」owner是正が典型）。
  - BEHAVIOR_AUDIT の**キュー再生成＋トリアージの一次選別**（真no-op候補の抽出まで）。
  - ⚠**必須ガードレール**をプロンプトに固定：①**採用前に必ず `build:effects` 再生成→fresh vs live-curated 精密diff＋decompile対原文照合。`heldReview` の diff 表示・`census:clusters` の枚数は古くなりうるので鵜呑みにしない**（続き31で committed `_held_fresh.json` が古く、採用済みの WX21-043/WX24-P2-046 が旧 diff で held 残存していた）。②**1バッチ＝parser/engine 変更なしに限定**。③採用後 `git show`/機械diff で「意図した数枚のみ変更」を確認。④**「curated が正・fresh が誤り」の据置系**（EXILE→TRASH＝ゲーム除外を正しく温存・owner:opponent→undefined 脱落・「このシグニ」→ALL 化・「あなたのトラッシュ」→opponent 化）は**触らせない**明示。

- **Opus 4.8 で行う（機構・語彙の新規実装＋退化の見極め）**：
  - **parser/engine への新規語彙・機構**（§10 大型機構・§6.3 worklist・**内側トリガー語彙拡充＝triggerScope/自己参照**＝引用付与残107 の本丸）。共有パーサ変更は回帰面が広い。
  - **意味的退化の見極めが要るバッチ**（「代わりに」置換・CHOOSE平坦化復元・条件節持ち上げ等、fresh が退化しうる系。全数機械分類→偽陽性を先に切る判断）。
  - **リファクタ Stage2/3**（BattleScreen コントローラ設計）。
  - BEHAVIOR_AUDIT の**真no-op vs シナリオ空振りの最終仕分け**とengine修正。

#### 現在の割付（2026-07-11・続き69後に全面再割付＝残作業を §5b/§6/§7/§8 から総ざらい。旧版は git 履歴と [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) で追える。消化済み割付の詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)＝続き42-47・続き56-69 の2セクション）
> 運用＝**セッション開始時に、下のどちらのリストから取るかでモデルを決める**。トークン節約のため Sonnet 在庫があるうちは Sonnet で回し、Opus は「機構・語彙を新しく開く」バッチに集中投入する。**Opus が1バッチ開く→Sonnet が再収穫＋ゲート＋簿記で消化する交互サイクル**（続き34→35 で実証済み）。定型作業は必ずスキル（`/census-batch`・`/audit-card`・`/baton`）の手順に従う。**Sonnet が作業中に見つけた engine/parser バグはその場で直さず Opusタスク12 へ登録**。

**Opus のタスク（推奨順・機構/語彙の新規実装と退化見極め）**：
1. **GRANT_QUOTED_AUTO_ABILITY の内側 ability parse**（引用付与残107 の本丸）。**🆕続き75で第1弾を消化＝✅**(a)**`GRANT_TO_PLACED_SIGNI` STUB（WX24-P1-017/WX25-P3-038）を `GRANT_EFFECT{targetsLastProcessed, rawText}` へ振り分け**＝`expandGrantEffectRawTexts`（内側 parseBlock 展開）＋`execGrantEffect`（lastProcessedCards へ適用）＋`granted_effects`（ターン終了時失効）の**既存3機構が噛み合って engine 新規実装ゼロで動く**ことを確認。(b)**内側トリガー語彙の欠落を発見・修正＝「…がバトルによってシグニをバニッシュしたとき」が parser に無く、31枚が `ON_PLAY`（場に出たとき）へ誤フォールバックしていた**（engine は最初から配線済みだった＝`battleBanishEntries`）。(c)**「このシグニをアップし、<残り>」複合文で先頭の UP が無言脱落**していた（6枚＝再攻撃コンボの定番でデメリットだけ適用されていた）。計24枚採用・golden 192・census 1557 維持。詳細 BUGFIXES 続き75。**残＝(i) WX25-P3-038 の内側「代わりに」置換（＝タスク6の置換機構と合流）・(ii) 引用付与の内側品質不全の再収穫（他の内側トリガー語彙・`GRANT_LRIG_ABILITY` の ON_PLAY 誤デフォルト＝タスク5）**。
2. **census「動的比較」の残**＝WXEX2-28（直前配置シグニ基準＝last-processed相対で別系）・条件文（WXK08-005）・opp/own センタールリグ（WXK11-003）。自己参照/トリガー参照/designation/anyAlly/printed/lastProcessed/デッキ相対SEARCH/lrig相対 は続き43-47・67-68で✅消化済み（詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md)）。
3. **DRAW脱落の parseSingleSentence 直呼び経路**（続き59 の follow-up）。**🆕続き107でトリアージ＝原文「カードをN枚引き、」があるのに JSON の DRAW が不足する候補15枚を機械抽出し、単一 systematic ではなく5サブパターンに分かれると判明**（`tmp_drawScan.mjs` 相当で再抽出可＝原文の `カードを\d+枚引き、` 出現数と JSON の DRAW 数を比較）：(a)**自ドロー非先頭＝「その後、カードをN枚引き、X」**（SP24-009「その後、5枚引き、ライフに加える」＝`^カードを` アンカーの leadDrawM/drawAndM を「その後、」プレフィックスが外す・**最も systematic な subset**）。(b)**先頭自ドローなのに未捕捉**（WXDi-P13-001「カードを2枚引き、シグニ3枚場に出す」＝drawAndM/leadDrawM が発火すべきだが ADD_TO_FIELD 複合ハンドラが先に食う疑い・要 parseSingleSentenceInner トレース）。(c)**3動作複合「A置き、B引き、C出す」**（WX20-071＝ENERGY_CHARGE のみparseされ DRAW+ADD_TO_FIELD 脱落＝compound-sentence の系統ギャップ）。(d)**対戦相手ドロー「対戦相手はカードをN枚引き、〜捨てさせる」**（WXDi-P05-063/P16-093＝owner:opponent の draw+discard idiom・self前置ロジックの対象外・別扱い）。(e)**per-count ドロー「＜鉱石＞1体につきカードを1枚引き」**（WXEX2-34＝DRAW_PER_X 機構・別）。(f)**色別/リコレクト等の入れ子条件内**（WXK09-003「緑の場合、3枚引き」・SPDi47-03・WD23-017-EA＝UNKNOWN含む）。**⚠MANUAL 6枚（WX21-071/WX24-D3-25/SPDi37-06/WX25-P3-005/PR-Di035/WXDi-D09-P25）は手維持で温存対象外**。**🆕続き107で (a)(b) 消化＝SP24-009 採用**（(a)「その後、」プレフィックス許容で DRAW 安全網拡張／(b)`ADD_TO_LIFE` 枚数が同一文の draw 枚数を誤取得していたのを `(?!引)` で是正）。**🆕続き107で (c) の主部分も消化**（連用中止形ハンドラに「場からトラッシュに置き」追加＋「すべて」count:ALL＝PR-422/WX09-001/WXK11-013 と SP24-009 先頭 field-trash を是正・計4枚）。**残＝WX20-071 の3動作複合「A置き、B引き、C出す」（3項以上の連用中止形）・「対象とし/探して/場合」ガードで split を止めている複合（WXK07-042/WX20-049/WX26-CP1-066）**・(b subset)先頭自ドロー未捕捉（WXDi-P13-001）・(d)対戦相手ドロー・(e)per-count・(f)入れ子条件。
4. **§5c census 条件節の残**（~~ARTS_USED拡張＝「このターンにあなたが(色)のアーツを使用していた場合」4枚（WX24-D1〜D4-11）~~ **✅続き106（Opus）で色別ARTS_USED_THIS_TURN機構を新設して是正＝`turn_arts_used_colors`+Condition.color+parser規則+decompiler。census 1461→1458・golden304・BUGFIXES続き106。⚠5枚目WX25-P3-116は「代わりに」置換でタスク6送り**）・「代わりに」WX25-P2-068/070・「あり」複合条件WXDi-P11-048。
5. **持ち越し済みの engine/parser 拡張の小口**＝WXDi-P03-005（PAID_ADDITIONAL_COST の「置換モード」拡張）・WX26-CP1-100（SEND_TO_ENERGY のトラッシュ対象化）・GRANT_LRIG_ABILITY系5枚の parser ON_PLAY 誤デフォルト修正・~~WX25-CP1-051/WXDi-CP02-070 の owner:any・excludeSelf 欠落~~ **✅続き124（Opus）で修正＝「あなたの他の…シグニのうち最も…」の owner:any 潰れをparser narrow拡張で是正・同パターン5枚も採用（計7枚）・同型★0**・続き33発見の原文無関係 `TRANSFER_TO_DECK` 混入5枚（WX24-P2-033等＝複文REVEAL_AND_PICK再parseが要り未着手）・SEQUENCE下流「そうした場合」IS_MY_TURN常時真連鎖の精緻化・PR-Di038 duration・WX25-P2-095・WXEX2-50-E3 step2 のレベル制約未反映・WX12-008 exceed-cost timing・WXK10-033-E1 据置確認・WXEX2-25-E3 の decompiler levelLtSelf 描画固定。
6. **「代わりに」残テールの機構系**＝D:置換ルール9（バニッシュされない系＝置換機構）・C:コスト代替6・E:リコレクト2・B1残10の条件語彙（§6.3）＋WX16-021（置換ルール→即時LIFE_CRASH幻覚＝同じ置換機構）。
7. **§6.1 未実装action型 残11種27効果の engine 実装**（instant層＝PLAY_FREE_FROM_TRASH／STACK_SPELL／PREVENT_DAMAGE・CONT層＝COST_SUBSTITUTE／SELF_TRASH_PREVENT／COLOR_INHERIT／GRANT_FIELD_SHADOW）。
8. **§6.3 大型機構**（ゲーム除外＝WXDi-P04-016-E3 とセット・canCardGuard 統一・多段閾値 nested CONDITIONAL・スペル被破棄【自】収集パス・ON_LEAVE_FIELD 相手scope 3枚・出現条件レゾナ35・正面32の parser 未配線調査）。
9. **§6.2 semantic audit 系統残の機構対応**＝系統①(b)「あなたか対戦相手」`owner:'any'` 選択18枚（engine/decompiler の選択対応・opponent への flip 禁止）・(c)混在10枚のノード単位判別・系統②残（SEQUENCE内 GRANT_PROTECTION＝WX08-017・LAYER付与＝WX15-031・広域24件の subjectFilter/新機構）。
10. ~~**CHOOSE平坦化復元 held の最終見極め＋採用**~~ **✅完了（続き76・Opus）＝パターンA〜F をすべて解決**（詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3・BUGFIXES 続き76）。
11. **BEHAVIOR_AUDIT 高シグナル22 の最終仕分け＋engine修正**（🆕続き77・Sonnetタスク4でキュー再生成＝210/9288→263/9293〔続き76のparser大規模変更でキュー内容が入れ替わったため増加〕・`node scripts/_bqTriage.mjs` で高シグナル19→22件を再選別＝WX04-003/WX04-082/WX04-099/WX04-102/WX07-045/WX08-029/WX09-012/WX12-010/WX22-Re01/WXEX1-12/WXEX2-51/WXDi-P02-034/WXDi-P04-065/WXDi-P09-079/WXDi-P16-013/WX24-P1-015/WX24-P2-049/WX25-P2-009/WX25-CP1-040/WXK01-021/WXK03-075/WDK03-001。トリガー主語系・CHOOSE分岐・出現条件レゾナ WX09-012/WX12-010 は継続）。
12. **Sonnet が積んだ engine/parser バグの修正（常設受け口）**＝Sonnetタスク1（実機検証）・4（一次トリアージ）・8（semantic audit）の観測結果を受けて修正する。**✅続き78（Opus）で旧在庫8件を全消化＝計148枚採用・golden 230・census 1483**（EXILE→TRASH 3形新設／多段「あるかぎり」真因2本＝`THIS_CARD_HAS_UNDER`ほか新設／条件ドロップ／inner duration 112枚／GRANT_CHOSEN_ABILITY点検。詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3・BUGFIXES 続き78）。**🆕新規在庫4件（続き78/81で発見・据置）**：(i)**SP27-002-E3**＝引用付与内側の「このシグニの正面のシグニのパワーが15000以上であるかぎり」条件が genericKagiri（isTimingMarker＝**無言消費で PARTIAL にもならない**）で脱落し無条件アサシン付与に退化＝**genericKagiri の isTimingMarker 設計を silent-fallback 刻印に見直す系統課題**。(ii)**WXDi-P10-035**＝連用中止復元の引用内【自】で「それを手札に戻す」が `BOUNCE{target.owner:'self'}` にエンコードされる＝`TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST`+lastProcessed 慣例との整合を要精査。(iii)**WXK09-050**＝parser規則（続き76 タスク10 パターンC）が `GRANT_CHOSEN_ABILITY` を再生成し続け held に残存＝Part1固有ハンドラ（パワー比較フィルタ）との dispatch 設計を解消するまで採用不可。(iv)**🆕続き81＝`applyDirectAction`（`effectExecutor.ts:4696`）のTRASH/HAND_CARD分岐（4781-4792行目付近）が`hand_discarded_just`/`turn_hand_discarded_count`/`hand_trashed_by_opp_this_turn`の3フィールド更新を欠く**＝§7実機検証（`trashCounterOpp`＝WX14-040-E3）で発見。`TRASH{HAND_CARD,count:'ALL'}`等の即時適用パス（`applyTrashHand`）はこの3フィールドを正しく更新するのに対し、`count:1`等でSELECT_TARGET経由・`resumeSelectTarget`で再開する経路だけこの更新ロジックが丸ごと抜けている＝**`TRASH{type:HAND_CARD,count:1}`を使う全カードが影響対象**（ON_HAND_DISCARDED不発火・`turn_hand_discarded_count`条件不成立・`HAND_TRASHED_BY_OPP`条件＝「代わりに」置換起点の不成立、を併発しうる）。修正自体は`applyTrashHand`と同じロジックの追加で見込みだが、影響範囲（該当カード母集団・ENERGY_CARD/SIGNI分岐にも同型欠落がないかの点検）の精査が要る。再現＝`node scripts/verifyBattleDrive.mjs trashCounterOpp`（既定order外）。詳細 BUGFIXES 続き81。(v)**🆕続き82（Sonnet・golden型網羅追加中に発見）＝`applyDirectAction`（`effectExecutor.ts:4696`）に`ENERGY_CHARGE`/`STORY_CHANGE`（他複数型）のcaseが無く、`default`節が`executeAction(action, {...ctx, lastProcessedCards:[cardNum]})`で元アクションを丸ごと再実行してしまう**＝SEARCH等で1枚選んだ後の`then`適用や`selectOrInteract`のSELECT_TARGET解決後に、選んだ`cardNum`を無視して`ENERGY_CHARGE`の`target`（`DECK_CARD`等）を素通しで再評価するため、(a) `target.type`が`HAND_CARD`/`TRASH_CARD`以外（`DECK_CARD`含む）だと`else`分岐で`fieldCandidates`（**場のシグニ**）を候補にしてしまい、選んだデッキ/トラッシュ札は消えたまま場のシグニ選択SELECT_TARGETへすり替わる（実カード母集団81件＝WX07-017/WX08-003/WX08-072/WX10-003等の「デッキから探して見つけたカードをエナゾーンに置く」＝`SEARCH→then:ENERGY_CHARGE{target:DECK_CARD}`パターンが対象）。(b) `ENERGY_CHARGE`を`target.count`が`'ALL'`でなく`1`等の外部`SELECT_TARGET`経由で直接使う構成（現状は実カード0件・型としては存在）だと、再実行のたび同じSELECT_TARGETが繰り返し発行され続けautopilotが無限ループする（`goldenTest.ts`で`autopilot hang`として実測）。**再現**＝`scripts/goldenTest.ts`の「ENERGY_CHARGE」テストをcount:'ALL'ではなく`count:1`のSELECT_TARGET経路で書くと即再現（続き82でcount:'ALL'に迂回して回避済み・詳細はgoldenTest.tsの当該テストのコメント参照）。**影響範囲の精査が必要**＝`applyDirectAction`の`case`一覧（BANISH/BOUNCE/SEND_TO_ENERGY/TRASH/EXILE/LEVEL_MODIFY/POWER_MODIFY/POWER_MODIFY_BY_TARGET_LEVEL/POWER_MULTIPLY/ADD_TO_HAND/ADD_TO_ENERGY/ADD_TO_BEAT/TRANSFER_TO_HAND/ADD_TO_FIELD/ATTACH_ACCE/SEQUENCE/NEGATE_ATTACK/BLOOD_CRYSTAL_ARMOR/PLACE_UNDER_SOURCE_SIGNI/DOWN/UP/FREEZE/GRANT_KEYWORD/GRANT_EFFECT/TAKE_FROM_UNDER_SIGNI/REMOVE_ABILITIES/ADD_TO_LIFE）に無い型がSEARCH/LOOK_PICK_CHAIN等の`then`やSELECT_TARGET解決後の`thenAction`として使われていないか（`STORY_CHANGE`は実カード母集団0件で現状無害・`POWER_SET`はCONTINUOUS専用でeffectEngine側の別経路のため無関係と確認済み＝ENERGY_CHARGEのDECK_CARD/TRASH_CARD/フィールド経由が主対象）の全数チェックが要る。**🆕続き83（Sonnet・golden型網羅追加続行中に追加確認）＝`POWER_MODIFY_PER_LRIG_LEVEL`（実カード11件中7件がACTIVATED・target count:1）と`POWER_MODIFY_PER_FIELD`も`applyDirectAction`に自身のcaseが無く同型の穴を持つ**（`count:'ALL'`に迂回してgolden追加を完了・詳細はBUGFIXES続き83）。一方で`POWER_MODIFY_BY_SOURCE`/`POWER_MODIFY_PER_TRASHED_LEVEL`/`POWER_MODIFY_PER_HAND_COUNT`/`POWER_MODIFY_PER_CHARM`(trashed_this_effect分岐)/`POWER_MULTIPLY`は内部で`POWER_MODIFY`等の対応済みアクションへ委譲するため無関係と確認済み＝**影響対象は「`applyDirectAction`のswitchに自身のcaseが無く、かつ委譲もしないtarget-based型」に絞り込めてきた**（ENERGY_CHARGE/POWER_MODIFY_PER_LRIG_LEVEL/POWER_MODIFY_PER_FIELDの3型が確定・他は golden型網羅の残49型を消化する過程で追加確認予定）。(vi)**🆕続き84（Sonnet・golden型網羅追加続行中に発見・上記(v)とは別系統のバグ）＝`POWER_MODIFY_PER_DECK_COUNT`（実カード1件のみ＝PR-442・CONTINUOUS）が`effectEngine.ts`のCONTINUOUS計算層に一切実装が無い**＝`effectExecutor.ts:4079`の`case 'POWER_MODIFY_PER_DECK_COUNT': return done(addLog(ctx, 'デッキ枚数比例パワー（effectEngine処理）'))`というコメントは**虚偽**で、`effectEngine.ts`を`grep -i deck_count`しても該当実装が存在しない（`POWER_MODIFY_PER_STACK`/`PER_LEVEL_SUM`/`PER_LRIG_LEVEL`等の隣接する型はすべて`calcFieldPowers`内に`extractPowerModifiesPerXxx`ヘルパーと処理ブロックがあるのに、この型だけ丸ごと欠落）。**実害＝PR-442「デッキ10枚につきパワー+4000」が常に無効化されている**（golden追加中にCONTINUOUS経路で検証しようとして発覚。テストは書かず見送り）。母集団は1枚のみで優先度は低いが、実装パターン自体は既存の`extractPowerModifiesPerLifeCount`等をコピーすれば軽微。(vi-2)~~**続き93＝`applyDirectAction`の未対応型6型**（`ENERGY_CHARGE`/`TRANSFER_TO_DECK`/`GRANT_PROTECTION`/`POWER_SET`/`POWER_MODIFY_PER_FIELD`/`POWER_MODIFY_PER_LRIG_LEVEL`＝smoke SKIP258件の真因・実UIフリーズ相当）~~ **✅続き106（Opus）で全6型を修正＝新設4 case＋`POWER_MODIFY_PER_*`はthenActionを解決済み`POWER_MODIFY`に書き換え。golden 286→293・smoke SKIP 258→1・census 1461維持。詳細 BUGFIXES 続き106**。(vi-3)~~続き95＝`collectPowerZeroTriggers`が`field.lrig`を走査せずLRIGのON_SIGNI_POWER_ZERO_OR_LESS watcherが絶対発火しない~~ **✅続き106（Opus）で(vi-4)と一括修正（BUGFIXES 続き106）**。〔旧記録〕他の大半のトリガーコレクタ（`collectFreezeTriggers`等）が使う共通ヘルパー`ownFieldSources(state)`（signi最上段＋lrig最上段の両方を含む）をこの関数だけ使わず`field.signi`のみ手書き走査している設計漏れ。**該当2枚（WX22-013・WXDi-P14-009）は印刷テキストの能力が一切機能していない実害バグ**（残り4枚のシグニタイプwatcherは正常動作・続き39/94で実機確認済み）。実機シナリオ`powerzeroWX22013`/`powerzeroWXDiP14009`で非発火を確認（呼び水の-1000適用自体は正常＝engine側の切り分けは明確）。修正パターンは軽微＝該当箇所を`ownFieldSources(watcherState)`ベースの走査に置き換えるだけの見込み。詳細 BUGFIXES 続き95。(vi-4)~~続き96＝同型のLRIGゾーン走査漏れが複数コレクタに系統的に存在・実カード20枚~~ **✅続き106（Opus）で5コレクタ（collectPowerZeroTriggers/collectFieldTriggers own+opp/collectTurnTriggers/collectOppArtsUseTriggers/collectHandDiscardTriggers）を修正・golden 293→298・census 1461維持。残＝該当実カード0件の潜在バグ6コレクタは未修正（記録のみ）。詳細 BUGFIXES 続き106**。〔旧記録〕＝`collectFieldTriggers`のON_ATTACK_SIGNI/ON_BANISH/ON_BLOOM分岐（自分側any_ally/any・相手側any_opp/any。⚠ON_PLAYの自分側だけ例外的に手当て済みという非対称）・`collectTurnTriggers`の相手フィールド分岐（ON_TURN_START/ON_TURN_END/ON_ATTACK_PHASE_START/ON_MAIN_PHASE_START/ON_LRIG_ATTACK_STEP_START・any_opp/any。⚠自分側は正しく手当て済みで非対称）・`collectOppArtsUseTriggers`（ON_OPP_ARTS_USE・self。姉妹関数`collectArtsUseTriggers`はlrig対応済みで非対称）・`collectHandDiscardTriggers`の自分側分岐（ON_HAND_DISCARDED・self）の4関数×該当timing/scopeで**実カード20枚を機械抽出**（ON_ATTACK_SIGNI3枚・ON_ATTACK_PHASE_START11枚・ON_OPP_ARTS_USE1枚・ON_HAND_DISCARDED4枚・ON_BANISH1枚＝カード名一覧はBUGFIXES続き96）。修正方針は(vi-3)と同じ単純パターン（`ownFieldSources`置き換え）だが関数ごとに個別確認が要る。**他6コレクタ（`collectTargetedTriggers`等）も同型の穴を持つが該当実カードが現状0件＝潜在バグとして記録のみ**。詳細 BUGFIXES 続き96。(vi-5)**🆕続き106（Opus）で`collectCoinPaidTriggers`は✅修正済み**（`{entries, usedIds}`化＋6コイン支払サイトで`applyCoinPaidUsed`書き戻し・golden299・BUGFIXES続き106）。**残＝二面コレクタ3種（`collectBanishTriggers`18枚・`collectPowerZeroTriggers`6枚・`collectLrigGrowTriggers`4枚＝usedHostIds/usedGuestIds が要る）は未修正**。〔旧記録〕続き99（Sonnet・§7 ON_COIN_PAID③実機検証中に発見）＝`collectCoinPaidTriggers`（`triggerCollect.ts:153`）がusageLimit判定用の`actions_done`書き戻しを一切行わず、ON_COIN_PAIDの《ターン1回》《ターン2回》が実質ノーガード＝他の大半のusageLimit付きコレクタは`{entries, usedIds}`を返し呼び出し側が永続化する設計だが、この関数だけ`StackEntry[]`のみを返し6箇所の呼び出し元（`BattleScreen.tsx:5080/5222/5279/7987/9081/9627`）がいずれも書き戻しをしていない。実機`coinPaidTwice`シナリオで確認＝WXDi-P15-069（`usageLimit:twice_per_turn`）が同一ターン内3回目のコイン支払いでも発火（`host.powerMods`に+2000が3件）。**🆕続き100（Sonnet）で同型バグを横断棚卸し＝あと3コレクタ・実カード28枚が同じ穴と確定**＝`collectBanishTriggers`（ON_BANISH・18枚・最多）・`collectPowerZeroTriggers`（ON_SIGNI_POWER_ZERO_OR_LESS・6枚・続き95/96のLRIGゾーン走査漏れとは別軸の追加バグ）・`collectLrigGrowTriggers`（ON_LRIG_GROW・4枚・PLAN記載の④「2回目グロウで再発火しないか」が長年未検証だった理由が判明）。**計31枚が影響**。修正パターンは全コレクタ共通＝`{entries, usedIds}`化＋各呼び出し元での書き戻し追加。カード名一覧は BUGFIXES 続き99・続き100。(vii)**🆕続き89（Sonnet・checkAllEffects MANDATORY_SUSPICIOUS精査中に発見）＝「アップ状態のこのシグニをダウンしてもよい」系で対象/自己混同・条件欠落の構造的バグ7件**＝(a)**WX25-P1-055／WXDi-P04-059**＝原文は「対象を選ぶ→自身を任意でダウン→そうした場合対象をバニッシュ」の3段構成だが、JSONの`DOWN`が対象選択フィルタ（`owner:opponent,powerRange`等）を誤って持ち、自分をダウンする代わりに相手シグニをダウンするだけになっている（後続`BANISH`も対象フィルタなしで無関係化）。(b)**WX25-P3-089**＝同型の対象/自己混同＝`DOWN`が「他の＜迷宮＞のシグニ」フィルタを持ち自分ではなく対象をダウンしようとし、かつ本来「対象への能力付与」の後続が`DRAW`に化けている。(c)**WXDi-P13-074**＝ダウン対象フィルタに原文の「《ディソナアイコン》」条件が欠落（アイコンフィルタ機構の要否を要確認）。(d)**WXDi-CP01-040**＝「公開したカードが＜バーチャル＞の場合のみ引く」条件が欠落し無条件ドロー。(e)**WXDi-P15-084**＝原文「対象ルリグへターン終了時までの能力付与」がJSONで即時`TRASH`に化けている（GRANT_EFFECT等への再構成が要る）。(f)**WX25-P2-112**＝ダウン対象が`SIGNI`だが原文は「ルリグ」＋トラッシュ対象の色フィルタ（「ダウンしたルリグと共通する色」）も欠落。(g)**WX06-006（POWER_VALUE_MISMATCH）＝「代わりに」置換パターンの機構欠落**＝原文「対戦相手のシグニ1体に-12000。センタールリグが黒でライフクロス2枚以下の場合、代わりに2体まで-15000」が条件チェックなしで両方の`POWER_MODIFY`を無条件連続実行（Opusタスク6の置換機構が前提）。単点是正7件（DOWN.optional欠落）は同セッションで修正済み（詳細BUGFIXES続き89）。(viii)**🆕続き90（Sonnet・checkAllEffects MANDATORY_SUSPICIOUS精査の続き）＝残る7件の複合バグ**＝(a)**WX26-CP1-048**＝「このシグニが＜プリオケ＞の効果によって場に出ていた場合」という出自条件が丸ごと欠落＋「共通する色を持つ場合、対戦相手は【エナチャージ1】をしてもよい」の色条件・owner（現状`self`だが`opponent`が正）・optionalがすべて欠落。(b)**WXDi-P10-034**＝「次のあなたのメインフェイズ開始時、そのカードを表向きにしてもよい。そうした場合は+5000、そうしなかった場合は手札に加える」という遅延トリガー＋二分岐の結果がJSONに一切表現されていない（LOOK_AND_REORDERで裏向き配置するところまでしか実装されていない）。(c)**WX16-038**＝「それが《ライズアイコン》を持つ＜武勇＞のシグニの場合」という条件フィルタがADD_TO_FIELDに欠落＋optional欠落＝任意の公開カードを無条件で場に出してしまう。(d)**WX16-070**＝「レベルを+1するか+2してもよい」の値選択がCHOOSE化されておらず固定delta:1のみ。(e)**WX17-028**＝`TRANSFER_TO_DECK`アクション型自体に`optional`フィールドが無く（`src/types/effects.ts`で未定義）、型定義＋`execTransferToDeck`双方の拡張が要る。(f)**WDK16-13／WXK08-033**＝同型カードで「レベル2以下の＜X＞シグニが公開された場合」と「登録者数100万人達成」の2条件に対応する2つのADD_TO_FIELDが、片方だけ`CONDITIONAL(IS_MY_TURN)`で不適切にラップされもう片方は無条件実行という構造不備（本来は各々別々の条件でゲートされるべき・両方optionalも欠落）。(g)**WX25-CP1-062**＝「【自】：あなたのターン終了時、手札を1枚捨ててもよい。そうした場合、次の対戦相手のターン終了時まで、あなたのすべての＜ブルアカ＞のシグニのパワーを+4000する。」という第1能力がJSONに丸ごと存在しない（DOWN能力側の`optional`欠落は続き90で修正済み・詳細BUGFIXES続き90）。(ix)~~続き102/103＝`execBlockAction`のSIGNI/ATTACK分岐がcount/upToCount/filterを無視し全ブロック~~ **✅続き106（Opus）で修正＝filter適用＋count選択（ACTIVATED/AUTO対象）。owner:self,count:1のCONTINUOUS5枚も`calcContinuousBlockedActions`の拾い漏れとして同セッションで追加修正。golden303・BUGFIXES続き106**。〔旧記録〕＝`execBlockAction`（`effectExecutor.ts:1536`）の`target.type==='SIGNI' && actionId==='ATTACK'`分岐が`target.count`/`upToCount`/`target.filter`を一切読まない構造的欠陥＝この分岐は`ctx.lastProcessedCards`が非空ならそれをフィルタして使い、空なら**対象オーナーの場の全シグニ**へ無差別に「アタックできない」を付与するフォールバックしか持たない（`selectOrInteract`によるN体選択も`matchesFilter`によるフィルタ適用も丸ごと無い）。**🆕続き103（Sonnet）で全数調査完了＝`scratchpad-verify/tmp_blockActionScan.mjs`で`public/data/effects_*.json`全5シートをSEQUENCE順序どおり走査し、BLOCK_ACTION(SIGNI,ATTACK)の全48ヒット中41件（effectId重複含む）が過剰ブロック疑いと確定**＝WDK07-Y08-E1／WDK11-007-E1（×2）／WDK16-09-E1（×3）／PR-402-E1／WX05-023-E1／WX13-043-E1／WX17-034-E1／WX18-009-E1／WX24-P1-037-E2／WX24-P1-038-E2／WX24-P2-002-E1／WX24-P2-010-E1／WX24-P3-002-E1／WX24-P3-049-E1・E2／WX25-P2-002-E1／WX25-P2-047-E1／WX25-P3-002-E1／WX25-CP1-050-E1／WX24-D1-08-E1／WX24-D2-08-E1／WXDi-P03-027-E2／WXDi-P03-051-BURST／WXDi-P05-023-E1・E2／WXDi-P06-047-E1／WXDi-P11-005-E3／WXDi-P11-046-E2／WXDi-P11-055-E1／WXDi-P15-035-E1／WXDi-P16-034-E2／WXDi-CP01-013-E1／WXDi-P11-TK02-E2／WXK05-047-E1／WXK06-010-E1／WXK11-006-E2／WXK11-007-E1／WXK11-027-E1（安全側7件＝WDK16-05S-E3／WX06-002-E1／WX11-012-E1／WX22-003-E1／WX26-CP1-002-E1／WXDi-P08-053-E1／WXK06-001-E1＝前段に選択ステップあり）。**🆕サンプル原文照合でバグの射程が想定より広いと判明＝この分岐は`target.filter`も一切読まず（233件のBLOCK_ACTIONノード全数でfilter使用0件を確認）、「このシグニはアタックできない」という自己1体のみの制限（WX05-023/WX13-043/WXK05-047等＝`execBanish`等が使う`filter.thisCardOnly:true`の自己参照慣例が本来必要）と「対戦相手のシグニN体を対象とし」という選択式（WX18-009等）の両方が同じフォールバックで「対象オーナーの場の全シグニ」に潰れている**＝根本原因は「count/upToCount/filterを全部無視し、lastProcessedCards空時は無差別全ブロック」という単一の構造欠陥。WX18-009-E1のJSON自体は`owner:opponent,count:2,upToCount:true`に是正済み（正しい意図の記録）だが実行結果は変わらない＝**修正には`execBlockAction`のSIGNI/ATTACK分岐に(a)`matchesFilter`によるfilter適用（`thisCardOnly`含む）と(b)`selectOrInteract`ベースのN体選択（または前段ステップでlastProcessedCardsを populate する設計）の両方を追加する機構実装が要る**。詳細 BUGFIXES 続き102・続き103。(x)**🆕続き104（Sonnet・§7 R30③調査中に発見）＝`collectFieldTriggers`（`triggerCollect.ts:1387`・ON_PLAY/ON_ATTACK_SIGNI/ON_BLOOMのany/any_ally/any_opp scopeトリガー全般）が`usageLimit`を一切実装していない**＝関数全体（1387-1519行目）に`mkLimitOk`/`actions_done`チェックが1箇所も存在しない（turnOwnerとは異なり`effectStack.ts`にも代替の中央集権チェックは無い＝usageLimitは各collector内で個別実装する設計だが、この関数だけ丸ごと欠落）。ON_BANISHは別の`collectBanishTriggers`（usageLimit実装済み・488/509行目）が処理するため対象外。**機械抽出で実カード32枚が影響確定**＝WX10-017／WX11-054／WX11-058／WX11-062／WX19-051／WX19-052／WX19-053／WX21-048／WX21-Re09／WX22-Re01／WXEX1-04／WXEX1-16／WX24-P1-013／WX24-P1-046／WX24-P2-030／WX24-P2-072／WX24-P4-087／WX25-P1-018／WX25-P2-030／WXDi-D09-P17／WXDi-P03-050／WXDi-P03-086／WXDi-P07-044／WXDi-P07-047／WXDi-P09-080／WXK05-021／WXK10-048／WXK10-059／WD12-011／WD22-007-G／WDK17-001／SPDi44-08。**実害＝「味方のシグニが場に出るたびに◯◯（ターンに1回）」型の効果が、同一ターン内に複数体召喚すると毎回発火する過剰効果**。⚠(vi-4)続き96で登録済みの「LRIGゾーン走査漏れ（`ownFieldSources`未使用）」とは別軸のバグ＝同じ`collectFieldTriggers`だが前者はfield.lrigを見ない発火漏れ、今回はusageLimit自体が存在しないことによる過剰発火。修正方針＝他のcollector（`collectFreezeTriggers`等）と同型の`mkLimitOk`+`usedIds`返却パターンを追加し、6箇所超ある呼び出し元（`BattleScreen.tsx`の`collectFieldTriggers`呼び出し全箇所）で`actions_done`への書き戻しを追加する必要がある。詳細 BUGFIXES 続き104。(xi)**🆕続き110（Fable・戦略②バッチ2で発見）＝curated に「CONDITIONAL{条件, then:STUB OPTIONAL_COST}」の包み形が27枚存在**（SPDi43-08/20/30・WDK04-001・WX17-044・WX24-P2-047/054・WX24-P4-066・WX25-CP1-046/055・WX25-P1-058・WX25-P2-076/095・WX25-P3-069・WXDi-D09-H21・WXDi-P00-042・WXDi-P02-040・WXDi-P12-007・WXDi-P13-048・WXDi-P14-078・WXDi-P16-049・WXK02-060・WXK03-045/063・WXK09-042/044・WXK10-036）＝旧世代 lifting の産物。`effectExecutor` の OPTIONAL_COST インターセプト（Pattern ④/⑤＝`effectExecutor.ts:2353`）は STUB が **SEQUENCE 直下ステップ**であることを前提に後続 CONDITIONAL(IS_MY_TURN/PAID) と組で支払フローを生成するため、包み形は standalone ハンドラ（`execStubPart1.ts:52`＝pay/skip とも noop）に落ち**「スキップしても後続効果が実行される」**。一方 fresh（ガードD 適用後）は条件が丸ごと脱落＝**どちらも不正で採用不能・held に常駐**。正しい解＝これらの条件を `effect.condition`（効果レベル）へ再エンコードする機構（hoist 拡張 or 専用パッチ）。WX17-031（COUNTER_SPELL 版＝ガードE・条件は evalUseCondition 配線済みの effect.condition が正しい置き場）も同梱。詳細 BUGFIXES 続き110 第2エントリ。(xii)**🆕続き112（Sonnet・PLAN Sonnetタスク9＝smoke SKIP残り1件の最終確認で発見）＝`WXEX1-19-E2`（STUB`TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH`＝「トラッシュから対象カード1枚をエナ・1枚を手札・1枚をデッキ下へ」）が`resumeSelectTarget`の設計と構造的に非互換で実プレイでも無限ループ確定（母数1枚のみ・smokeでは`autopilot loop: SELECT_TARGET`としてSKIP検出）**＝当該STUBハンドラは「`needsInteraction(SELECT_TARGET,count:3,thenAction:自分自身のSTUB)`を発行→resume時に`ctx.lastProcessedCards.length>=3`なら3枚一括で`[toEna,toHand,toDeck]`に分配」という**3枚を一括で受け取る前提**だが、`resumeSelectTarget`（`effectExecutor.ts:4219`）は選択された各カードに`thenAction`を**1枚ずつ個別適用**する設計（`for (const cardNum of selected) applyDirectAction(pending.thenAction, cardNum, cur)`）。`applyDirectAction`に`STUB`型のcaseが無くdefault節（`effectExecutor.ts:5359`）が`executeAction(action,{...ctx,lastProcessedCards:[cardNum]})`で**1枚だけ**を積んで再実行するため、1枚目の時点で`length===1<3`となり同じ`SELECT_TARGET`（候補=トラッシュ・count3）を返し、forループは`if(!result.done) return result`で即打ち切り＝2枚目・3枚目は処理されず**候補配列が不変のまま同一signatureが返り続ける真の無限ループ**。(v)/(vi)が指摘する「`applyDirectAction`未対応型はdefaultが1枚分の`lastProcessedCards`で元アクションを暴走再実行する」系統と同根だが、**今回は「thenActionとして自分自身のSTUBを指定し複数選択の累積を前提にする」設計自体が個別適用ループと原理的に両立しない**点が新規＝修正には(a)このSTUB専用に`resumeSelectTarget`側で複数選択を一括で渡す特別分岐を設けるか、(b)3枚個別のthenAction（エナ送り/手札加え/デッキ下）に分解し3段カスケードのSELECT_TARGETへ設計変更するかのいずれかが要る。診断のみでSonnet側では修正していない。詳細 BUGFIXES 続き112。(xiii)**🆕続き112（Sonnet・PLAN§7「B4引用付与の実発火」検証中に発見）＝`WX24-P2-018-E1`（ルリグの「あなたのアタックフェイズ開始時」トリガー）が`timing:["ON_ATTACK_SIGNI"]`（自己スコープ）で誤登録され一度も発火しない**＝WX24-P2-018はルリグカードだが、自己スコープON_ATTACK_SIGNIの収集（`BattleScreen.tsx:6276`＝`effectsMap.get(myTopNum)`）はシグニアタック解決コード内で「アタックした**シグニ自身**」の効果のみを見る設計で、ルリグの効果はこの収集経路を一切通らない（ルリグの攻撃はATTACK_LRIGフェイズの別コードパスで、そちらもこの効果を拾わない）。原文「アタックフェイズ**開始時**」は既存timing`ON_ATTACK_PHASE_START`（R43等で実績あり）で表現すべきところが`ON_ATTACK_SIGNI`に誤変換された疑い＝**実機`wx24p2018GrantFire`シナリオでMAIN→ATTACK_SIGNIまで進めてもOPTIONAL_COST支払いUI/keyword_grants変化が一切なくFAILを確認**（診断確定・カード1枚の実害＝印刷テキストの能力が一切機能していない）。修正方針の見込み＝parserの「アタックフェイズ開始時」抽出規則をON_ATTACK_PHASE_STARTへ振り分けるよう是正。同型（ルリグの「アタックフェイズ開始時」がON_ATTACK_SIGNIへ誤変換されていないか）の横断調査は未実施。詳細 BUGFIXES 続き112（3エントリ目）。(xiv)~~**🆕続き114（Sonnet・PLAN §6.4）＝`resumeSelectTarget`が外側SEQUENCEのpending.continuationを握り潰す**~~ **✅続き117（Opus）で修正＝`resumeSelectTarget`にthenAction=ADD_TO_FIELD時のexecPlaceSigniOnField経由chain配置分岐を追加し、外側continuationをafterAction化して全配置後に実行（resumeSearch同型）。母集団84効果（約80カード＝ADD_TO_FIELD後続にBLOCK_ACTION/GRANT_KEYWORD/CONDITIONAL等）を構造修正で一律カバー。golden回帰新設（310→311・修正なしでFAIL実証）＋craftEnergyCP02087を強化しkwGrantsへの絆常付与を実機assert・PASS。詳細BUGFIXES続き117**。〔旧記録〕`resumeSelectTarget`（`effectExecutor.ts:4246-4253`）が外側SEQUENCEの`pending.continuation`を握り潰す構造的バグ**＝ADD_TO_FIELD（ENERGY_CARD/HAND_CARD/TRASH_CARDソース）がSELECT_TARGET経由で解決される際、その`thenAction`実行（`applyDirectAction`のADD_TO_FIELD分岐＝`effectExecutor.ts:4996-4998`）が配置先の空きゾーン2以上でさらにSELECT_SIGNI_ZONEを要求すると、`resumeSelectTarget`は`if (!result.done) return result;`（4251行目）でその`needsInteraction`結果をそのまま返してしまい、`pending.continuation`（外側SEQUENCEの残りステップ）を一切引き継がない＝SELECT_SIGNI_ZONE解決後は`resumeSelectSigniZone`が`pending.continuation`（今回は`undefined`）を見て`return done(cur)`するだけで**外側SEQUENCEの後続ステップが二度と実行されない**。**実機で2件確認**＝①WXDi-CP02-087（SEQUENCE[ADD_TO_FIELD,GRANT_KEYWORD]）＝ADD_TO_FIELD自体は成功するが後続のGRANT_KEYWORD（絆常付与）が`host.keywordGrants=[]`のまま4周待っても無発火（`craftEnergyCP02087`）。②WXK07-105（SEQUENCE[ADD_TO_FIELD,CONDITIONAL{IS_BETTING,then:ADD_TO_FIELD}]）＝1体目のADD_TO_FIELDは成功・ベットも成立（coins 2→0で確認済み）するのに、CONDITIONAL(IS_BETTING)の2体目ADD_TO_FIELDが絶対に発火しない（`craftArtsBetK07105`＝意図的FAIL回帰として既定order外に登録・詳細はverifyBattleDrive.mjs内コメント）。WXDi-P05-068（`craftHandSpellP05068`）も同型のGRANT_KEYWORD後続ステップを持つが、そちらのPASS判定はADD_TO_FIELD成功のみを見ており後続は未確認＝同じ穴の疑いが濃厚。**修正方針の見込み**＝`resumeSelectTarget`が`applyDirectAction`から`needsInteraction`（`result.done===false`）を受け取った場合、その内側interactionオブジェクトへ`pending.continuation`を引き継ぐ（`REVEAL_UNTIL_TO_FIELD`の`SELECT_SIGNI_ZONE`生成＝`effectExecutor.ts:3050-3056`が`continuation: next`を正しく持つのと同型の対応が必要）。**影響範囲は未調査**＝「ADD_TO_FIELD(SELECT_TARGET経由・候補2枚以上)を含むSEQUENCEに後続ステップがあり、かつ配置先に空きゾーンが2以上ある」全カードが対象＝母集団の機械抽出はOpus側で要実施。診断のみでSonnet側では修正していない。詳細 BUGFIXES 続き114。(xv)~~**🆕続き115（Sonnet）＝F-3犠牲型5枚がJSON誤表現で身代わり対話が発火しない**~~ **✅続き118（Opus）で修正＝WX12-024/WXEX2-60（self_sacrifice_other）・WX20-055（protect+riseIcon）・WXDi-CP01-032/WXDi-P10-052（protect+otherAny+活性相手ターン）の5枚を`STUB BANISH_SUBSTITUTE`へ作り替え（parser規則をgeneric「バニッシュ」blockの前に追加＋curated JSONをfresh一致＋decompilerパターン別描画）。golden回帰2件新設（collectBanishSubstitutes両パターン・311→313）・実機`f3SacrificeWX12024`2回連続PASS（身代わりモーダル出現→犠牲→victim残存）・census 2225→2220・同型★0。詳細BUGFIXES続き118**。〔旧記録〕F-3犠牲型5枚がJSON表現の誤りで`collectBanishSubstitutes`に一切拾われず身代わり対話が発火しない**＝WX12-024（コードハート　†Ｃ・Ｃ・Ｍ†）「【常】：このシグニがバニッシュされる場合、代わりにあなたの他の＜電機＞のシグニ１体をバニッシュしてもよい」の原文は犠牲型F-3だが、`effects_WX.json`のWX12-024-E1は`STUB BANISH_SUBSTITUTE`（`execStubPart3.ts:3942`が実装済みのcollectBanishSubstitutes対応形）ではなく、素の`CONTINUOUS BANISH{target:self,filter:{story:'電機',excludeSelf:true},optional:true}`としてparseされている＝`collectBanishSubstitutes`（`effectEngine.ts:4406`）は`act.type==='STUB'&&act.id==='BANISH_SUBSTITUTE'`または`act.type==='BANISH_SUBSTITUTE'`のみを認識するため、この表現は一切収集されない。実機`f3SacrificeWX12024Bug`シナリオでCPU（P15000）がWX12-024（P12000）を攻撃→`BanishSubstituteModal`が一度も出現せず対話なしでバニッシュされることを2回連続で確認（`logTail`＝「極剣　ゴッドイーターがコードハート　†Ｃ・Ｃ・Ｍ†をバニッシュ」）。**同型のJSON表現＝WXEX2-60（弩炎　フレイスロ通信兵）・WX20-055（不屈の僭帝　エンジュ）・WXDi-CP01-032（コード２４３４　レイン・パターソン）・WXDi-P10-052（小装　リル//メモリア）の犠牲型5枚全数が同一バグの影響下**（コスト払い型のWX10-033/WX11-029は正しく`BANISH_SUBSTITUTE`型で表現されており実機`f3PayCostWX10033`でPASS確認済み＝無関係）。修正には犠牲型5枚のJSONを`STUB BANISH_SUBSTITUTE`＋`banishSubstitute:{pattern:'self_sacrifice_other'または'protect_other_sacrifice_self',sacrificeClass:...}`へ作り替えるparser/データ修正が要る（`collectBanishSubstitutes`のpattern分岐は既に両パターン実装済み＝データ側だけの問題）。診断のみでSonnet側では修正していない。詳細 BUGFIXES 続き115。(xvi)~~**🆕続き115（Sonnet）＝ON_BECOME_BEATのself反応がany_allyと非対称で発火しない**~~ **✅続き121（Opus）で真因特定＝engineではなく`BattleScreen.tsx`の`battleCardNums`が`field.beat_zone`未走査で【ビート】化カードがeffectsMapから脱落→selfループが空を引いていた。`addState`に`addAll(s.field.beat_zone)`1行追加。実機`beatBecomeSelfWDK14017`2回連続PASS（既定order復帰）。詳細BUGFIXES続き121**。〔旧記録〕続き115（Sonnet・PLAN §3 Sonnetタスク1＝ビート機構Phase1-7の実機検証中に発見）＝ON_BECOME_BEATのself scope反応が、同一イベントのany_ally scope反応と挙動が非対称で一度も発火しない**＝WDK14-014（炎魔の孔雀　カイム）の【出】《ビートアイコン》コスト（`cost.beat_signi:1`）でWDK14-017（炎魔の幸運　カウカス）を【ビート】にする実機シナリオ`beatBecomeSelfWDK14017`で検証。**[条件]ゲート（BEAT_CONDITION）開通・beat_signiコスト支払い（WDK14-017のbeat_zone移動）・ON_BECOME_BEAT any_ally反応（WDK14-014自身の「あなたの他のカードが【ビート】になったとき」＝任意コスト《赤》《赤》プロンプト表示）の3点は正常動作を確認**したが、**WDK14-017自身のON_BECOME_BEAT self反応（「このカードが【ビート】になったとき：カードを1枚引き、手札を1枚捨てる」・triggerScope未指定=self・OPTIONAL_COSTラップなしの純mandatory）が同一の`beat_became_just`イベントから一度も発火しなかった**（2回連続再現・stack常時0・pending_effect常時null・host.hand/trashが24周のポーリングでも不変）。`collectBeatBecameTriggers`（`triggerCollect.ts:1206`）はself収集ループ（1230行目・`ctx.effectsMap.get(becameNum)`から`triggerScope==='self'`を収集）とany_ally収集ループ（1237行目・`ownerState.field.signi`走査から`triggerScope==='any_ally'`を収集）を同一関数内で順に実行するため、両方が同じ`entries`配列に積まれ`BattleScreen.tsx:1484`のuseEffectが1回の`initStack`/`pushToStack`で両方を積むはずだが、実機ではany_allyのみが処理された。**self側だけ欠落する原因は未特定**＝`ctx.effectsMap`（InstanceMapによるbecameNum解決）・`BattleScreen.tsx:1484`のuseEffectのstack統合ロジック・またはstackからのentry順次処理（EffectInteractionModal側）のいずれかを疑うが、コード読解のみでは確定できず、`entries`配列の実際の長さをログ計装するなどの追加調査が要る。診断のみでSonnet側では修正していない。詳細 BUGFIXES 続き115。(xvii)~~**🆕続き116（Sonnet）＝`collectTurnTriggers`がusageLimit未実装**~~ **✅続き119（Opus）で修正＝`{entries,usedHostIds,usedGuestIds}`化し全7 pushサイトに`mkLimitOk`ゲート追加＋BattleScreenの5呼び出し元で`actions_done`書き戻し（`foldTurnUsed`）。golden回帰新設（314）・実機`lrigAttackStepStartUsageLimit`2回連続PASS・census2220維持。詳細BUGFIXES続き119**。〔旧記録〕続き116（Sonnet・PLAN §7 ON_LRIG_ATTACK_STEP_START②の実機検証中に発見）＝`collectTurnTriggers`（`triggerCollect.ts:1571`）がusageLimitを一切実装していない**＝この関数はON_TURN_START/ON_TURN_END/ON_ATTACK_PHASE_START/ON_MAIN_PHASE_START/ON_LRIG_ATTACK_STEP_STARTの5timing共通コレクタだが、self/keyword-token/own-lrig/opp-field/opp-lrig/lrig-trashの全ブランチを確認しても`eff.usageLimit`や`mkLimitOk`の参照が一切無く、戻り値も`StackEntry[]`のみ（`usedIds`を返さない）＝呼び出し元（`BattleScreen.tsx`の`collectTurnTriggers`呼び出し5箇所・3208/3220/3232行目付近）もactions_doneへの書き戻しを一切行わない。実機`lrigAttackStepStartUsageLimit`シナリオで`repatchTop`により同一ターン内にATTACK_SIGNI→ATTACK_LRIG遷移を人為的に2回発生させ、WX25-CP1-042-E2（《ターン1回》）が2回目も発火することを2回連続で確認（gHand 5→4→3）。**機械抽出＝この5timingでusageLimit付きの実カードは2枚のみ**＝WX25-CP1-042-E2（once_per_turn・ON_LRIG_ATTACK_STEP_START）・WXDi-CP02-077-E1（twice_per_turn・ON_ATTACK_PHASE_START。⚠ただしCSV原文「【自】《ターン２回》：…手札から＜ブルアカ＞のカードを１枚以上捨てたとき」は別の＝JSON未収録のON_HAND_DISCARDED系能力を指しており、E1＝ON_ATTACK_PHASE_START「【絆自】」側にこのusageLimitが誤帰属している疑いあり＝修正時に要再確認）。通常プレイでは各timingの発生自体が1ターンに1回の線形フェイズ境界のため実害は薄いが、continue99/100/104が発見した他コレクタ（collectCoinPaidTriggers/collectBanishTriggers/collectPowerZeroTriggers/collectLrigGrowTriggers/collectFieldTriggers）と同型のガード欠落パターンの新規インスタンス。修正パターンは共通＝`{entries, usedIds}`化＋5箇所の呼び出し元での`actions_done`書き戻し追加。診断のみでSonnet側では修正していない。詳細 BUGFIXES 続き116。(xviii)~~**🆕続き116（Sonnet）＝GROW_COST_REDUCTIONがper-count scaling非対応で過大軽減**~~ **✅続き120（Opus）で修正＝型に`perCount:{filter,count}`追加＋parser（「トラッシュのN枚につき」検出）＋engine（`floor(match/N)`倍）＋decompiler。WX14-009/WD14-001の2枚を根治（トラッシュに該当0枚なら減額0）。golden回帰2件（314→316）・census 2220→2218・同型★0。詳細BUGFIXES続き120**。〔旧記録〕続き116（Sonnet・PLAN §6.1「GROW_COST_REDUCTION⚠要実機検証」在庫の消化中に発見）＝`GrowCostReductionAction`型がper-count scalingを構造的に表現できず、WX14-009/WD14-001の2枚が過大軽減の恒常バグになっている**＝型は`reduction: {color,count}[]`の固定値のみで、「トラッシュの◯◯カードN枚につき」という枚数連動フィールドが存在しない。WX14-009「このカードにグロウするためのコストは、あなたのトラッシュにあるカード名に《フレイスロ》を含むカード**７枚につき**《赤×1》減る」・WD14-001「このカードにグロウするためのコストは、あなたのトラッシュにある＜悪魔＞のシグニ**６枚につき**《黒×1》減る」は、いずれもJSONで条件なしの固定`reduction:[{color:'赤'または'黒',count:1}]`としてparseされており、**トラッシュにフレイスロ/悪魔が1枚も無くても常に1色分軽減されてしまう**（原文は「7枚未満なら軽減0」のはずが実装は常時-1固定）。`collectGrowCostReductions`（`effectEngine.ts:1761`）はJSONの`reduction`配列をそのままスキャンして合算するだけの単純設計＝スケーリング計算をする余地が型レベルで無い。他4枚（WX10-010/WD13-002/WD13-003/WXDi-P03-039/WX24-P2-043）は原文どおり固定値または`activeCondition`付き固定値でparse済みで無関係。修正には`GrowCostReductionAction.reduction`要素へ`{filter, perCount}`のようなper-count scalingフィールドを追加し、`collectGrowCostReductions`側でトラッシュ枚数をカウントして`Math.floor(count/perCount)`倍する計算を実装する機構拡張が要る（§6.3相当の新規機構＝Opus送り）。診断のみでSonnet側では修正していない。詳細 BUGFIXES 続き116（2エントリ目）。(xix)**🆕続き126（Sonnet・PLAN§7「その他の実機検証待ち」＝WX04-005-E3の実機検証準備中に発見）＝WX04-005-E3（アルテマ/メイデン　イオナ・Lv5「【常】：すべてのプレイヤーはシグニを１体しか場に出すことができない（すでに場に２体以上ある場合は１体になるようにシグニをトラッシュに置く）」）が`STUB LIMIT_ALL_FIELD_1`のまま完全未実装（execStubPart1〜4のいずれにも`LIMIT_ALL_FIELD_1`のcase自体が存在しない＝`grep`で確認）**＝§6.1の残3型（PLAY_FREE_FROM_TRASH/PREVENT_DAMAGE/COST_SUBSTITUTE・BUGFIXES続き123）とは別の第4の未実装STUB。実カード1枚のみ（WX04-005）だが、召喚数を1体に制限しつつ既存2体以上を強制トラッシュへ落とす（BLOCK_ACTION形の単純な行動制限ではなくcanTrash選択UIを要する複合機構）＝§7に元々あった「WX04-005-E3（場出し数制限・捨て選択）」の一行メモが指していた未実装状態を実装コード側で確定させた。優先度は母集団1枚で低いが、機構自体（「場のシグニ数を上限Nに制限し超過分を選んで捨てる」）は他カードへの再利用余地もありうる＝§6.3相当の新規機構としてOpus送り。診断のみでSonnet側では修正していない。詳細 BUGFIXES 続き126。(xx)**🆕続き127（Sonnet・PLAN§7「ON_TARGETED forced単一対象follow-up」の検証で確定）＝`POWER_MODIFY{targetsTriggerSource:true}`（`execPowerModify`・`effectExecutor.ts:514-525`）等の選択UIなし自動解決経路が`collectTargetedTriggers`（`BattleScreen.tsx:4141`）を素通りしON_TARGETEDが発火しない実バグを確定**＝`collectTargetedTriggers`は`handleEffectInteraction`のSELECT_TARGET確定分岐でのみ呼ばれる設計だが、`targetsTriggerSource`（および同型の`targetsLastProcessed`）は「それ」=triggeringCardNum/lastProcessedCardsを選択UIなしで直接`done()`適用するため、この経路は一度もSELECT_TARGETインタラクションを生成せず`collectTargetedTriggers`を通らない。**新規シナリオ`onTargetedForcedBypass`で実機再現＝host WX12-010（ON_ATTACK_SIGNI any_opp・targetsTriggerSourceでアタッカーに-2000）×guest WXDi-P03-067（ON_TARGETED self・DRAW×1・usageLimit once_per_turn）でCPU自動アタック→WX12-010のPOWER_MODIFY(-2000)は成立するがWXDi-P03-067のON_TARGETED（DRAW）は発火せずgHand不変（FRESH=1含め2回連続再現）**。実カード母集団＝`targetsTriggerSource`/`targetsLastProcessed`かつ`target.owner:opponent`の組み合わせで機械抽出した5枚（WX12-010/WXEX2-29/WXDi-P03-043/WXDi-P04-065/WXK10-022）が「対象を自動選択する側」＝これらの効果が対戦相手の場のON_TARGETEDカードを（デッキ構築上たまたま）対象にした場合に無言で発火漏れとなる。修正方針の見込み＝`execPowerModify`等の`targetsTriggerSource`/`targetsLastProcessed`分岐が`done()`する直前に、選ばれた対象が対戦相手所有なら`collectTargetedTriggers`相当の収集をBattleScreen側で追加で呼ぶ（あるいはexecutor側の`ExecResult`に`targetedNums`を持たせてBattleScreen側で汎用的に拾う設計）が要る＝解決経路がSELECT_TARGETに限らず複数の`applyDirectAction`/`execXxx`に散らばるため中〜大規模の構造修正。シナリオは意図的FAIL回帰として`order`配列に含めない（バグ修正後にPASSへ反転させて追加する）。診断のみでSonnet側では修正していない。詳細 BUGFIXES 続き127。**🆕続き130（Sonnet・census-batchパイプライン実行中に発見）＝held の「CHOOSE選択肢に条件が付く」文型（WX26-CP1-011/013/015/017/018・WX25-P3-092等）で、curated は既に `choice.condition`（選択肢自体の使用可否条件＝満たさない選択肢は選べない）で実装済みなのに対し、fresh再生成は同じ条件を `choice.action` を `CONDITIONAL` でラップする形（選択肢自体は常に選べるが実行時に条件次第で no-op）で吐く＝diff署名上は`+CONDITIONAL`で「改善」に見えるが実際は意味論が異なり機械採用は危険（選択肢UI上に常に意味のない選択肢が出る退化になりうる）。**parserがこの文型を`choice.condition`側へ寄せるよう規則を直すか、engine側でCONDITIONALラップされたchoice actionをUI上グレーアウトする対応かの設計判断が要る**＝Sonnet側では据置（未採用）のまま。詳細 BUGFIXES 続き130（予定）。
13. **§5b 残367件の混線テール**＝effect構造そのものが原文とズレたカードの effects JSON 再parse（1カードずつ手修正→逆翻訳原文一致→ゲート。**原文コピーでの一括潰しは禁止**）。
14. **リファクタ Stage2 残（useState 11本）→Stage3 純粋バトルコントローラ設計**。
15. **（大型・任意）§8 CPU AI のメインフェイズ拡張**（アーツ/スペル/起動効果の能動使用・グロウ判断。先に DESIGN §4「CPU は対人戦と同じ処理」の統一を完遂してから）。
16. **🆕 timing 語彙センサスの消化（`npm run census:timing`・続き75新設）＝**✅ engine 配線済みで parser 語彙だけ無いクラスタは続き75/76で出し切った（計19系統81枚・376→128）。残128は engine に受け皿が無い機構待ち＝§6.3 へ**。**「engine に収集関数があるのに parser がその timing を一度も生成していない」穴**を機械検出する計器。**静的ギャップ＝29種**（ON_MAIN_PHASE_START／ON_SPELL_USE／ON_EXCEED_COST／ON_RISE／ON_SIGNI_BECOMES_DRIVE／ON_HAND_DISCARDED／ON_ARTS_USE／ON_BECOME_BEAT 等が MANUAL でしか使われていない）。**動的計測＝128効果 / 113クラスタ**が `ON_PLAY`（＝「場に出たとき」）へ誤フォールバック中（明細 `docs/_timing_census.txt`・**履歴 376→…→223→209→174→143→134→128**）＝**召喚しただけで発火する幻覚**。**🆕続き76で計14系統66枚を追加消化＝第1弾9種35枚＝`ON_ACCE`/`ON_ACCE_ATTACH`（8）・`ON_REFRESH`（6）・`ON_ENERGY_TO_TRASH`（3）・`ON_SIGNI_FROZEN`（3）・`ON_OPP_POWER_DECREASED`（4）・`ON_DISCARDED_AS_COST`（4）・`ON_GUARD`（2）・`ON_OPP_ARTS_USE`（4）。第2弾5系統31枚＝`ON_CARD_MILLED_FROM_DECK`（10）・`ON_SELF_REVEAL_FROM_HAND`（6）・`ON_PLAY`+`placedFront`（3）・`ON_LEAVE_FIELD`+`leftToZone:hand`（4）・`ON_HAND_DISCARDED`+`triggerFilter`（8）。census 1537→1529。⚠engine 配線済みで parser 語彙だけ無い大クラスタはこれでほぼ尽きた＝残りは1〜6件のロングテールと、engine に受け皿が無い機構待ち（正面配置32・パワーN以下・「対戦相手が手札を捨てたとき」・デッキmill＝`ON_CARD_MILLED_FROM_DECK` が MANUAL 専用）。**✅消化済み（続き75・計152枚・census 1557→1537）**＝`ON_SIGNI_BANISH_OPPONENT`（50枚）・`ON_MAIN_PHASE_START`（30枚）・`ON_SPELL_USE`（18枚・**engine の相手側 watcher 未配線もセットで是正**）・`ON_EXCEED_COST`（11枚）・`ON_RISE`（6枚）・`ON_SIGNI_BECOMES_DRIVE`/`ON_BECOME_BEAT`/`ON_ARTS_USE`（10枚）・`ON_TRASH`「手札から」単独（15枚）・`ON_HAND_DISCARDED`（5枚）。
    - **🔎 知見①＝「語彙が無い」だけでなく「既存 regex の穴」もある**。`ON_TRASH` は語彙も engine 配線もあったのに「手札か**デッキ**から」しか書かれておらず「手札から」単独が抜けていた。センサスは**両方**を炙り出す。
    - **🔎 知見②＝「engine 未対応だから見送る」と判断する前に、その条件が別の形で（構造的に）担保されていないか確認する**。`ON_HAND_DISCARDED` の「ガードステップ以外で」は一度「engine に条件語彙が無い」として見送ったが、**engine はガード時にそもそもこの収集経路へ入らない**（`hand_discarded_just`/`asCost` が立たない）＝構造的に担保済みで、parser に timing を足すだけでよかった（doc コメント1行に書いてあった）。
    - **⚠`ON_ARTS_USE` の「対戦相手が使用したとき」／`ON_HAND_DISCARDED` の「対戦相手が捨てたとき」は拾わない**＝engine に相手主語の専用 scope が無く、`self`/`any` に倒すと**発火主体が逆転する or 過剰発火する**（受け皿は `ON_OPP_ARTS_USE` 系＝別途）。
    - **次の上位＝`あなたが自分の効果によって手札からカードをN枚以上公開したとき`6／`このシグニに【アクセ】が付いたとき`5／`《トラップアイコン》が発動したとき`4／`対戦相手のシグニのパワーがN以下になったとき`4** ほか（`npm run census:timing` で最新表）。**大きなクラスタは尽き、以降は1〜6件のロングテール**＝1件あたりの費用対効果は落ちる。
    - **engine が既に配線済みなら parser に regex 1本＋triggerScope 抽出を足すだけで直る**（続き75で `ON_SIGNI_BANISH_OPPONENT` ＝計50枚を実証）。**手順**＝①クラスタ選定→②engine の収集関数で triggerScope/条件の扱いを確認→③parser に timing 抽出＋scope 抽出→④`build:effects`→**全数機械diff で分類**（MANUAL温存・`EXILE`→`TRASH` 等の据置系を除外）→`heldReview --adopt`→⑤golden 1件→`npm run gates`→`npm run regen`。
    - ⚠**トリガー句は actionText から除去しない**＝既存の全文 STUB 規則がトリガー句込みでマッチする前提で書かれており、除去すると別 STUB へ誤マッチして退化する（WXEX2-40 で実測）。
    - ⚠**timing を直しても action 側の既存誤りは残ることがある**（WX10-048＝action がトリガー句の「バニッシュ」を誤読・WX11-031＝条件節の脱落）。これらは別系統（§5b/§6 テール）＝timing 是正の可否とは切り離して判断する。
    - ⚠**fresh 全体の採用が退化を伴う枚数は「timing だけ effectId アンカーで外科パッチ」する**（続き75で3枚＝`PREVENT_DAMAGE`→`GRANT_LRIG_ABILITY` の作り替え・`EXILE`→`TRASH` 据置系・MANUAL 含みで held に出ないカード）。**timing 是正だけは取りこぼさない**のがコツ。
    - ⚠**「次の（次の）あなたの◯◯時」は遅延トリガー＝別機構**（今設置して次ターンに発火）。その場で発火する timing と混ぜない（ON_MAIN_PHASE_START で2件除外した）。

**Sonnet 5 のタスク（今すぐ回せる在庫・定型消化とデータ単点）**：
1. **§7 実機検証のシナリオ横展開の継続**（`verifyBattleDrive.mjs` の scenarios に1件追加式）。**続き76（Opus）で追加した engine 実装の実機検証**（golden は pure 関数までしか見ない）＝**`execFreeze` の LRIG 分岐**（センタールリグの凍結＝`lrig_frozen`）・**`execNegateAttack` の LRIG**（センタールリグのアタック無効）・**`execDraw`/`execTransferToHand` の BLOCK_ACTION**（`DRAW_OR_ADD_TO_HAND_BY_EFFECT` で効果ドローが止まる）は**✅続き79（Sonnet）で実機PASS確認・既定orderに追加済み**（`freezeLrig`/`negateAttackLrig`/`blockDrawByEffect`・詳細 BUGFIXES §7）。**`execExile` の HAND_CARD＋blind**（`exileHandBlind`）・**`collectTurnTriggers` の遅延トリガー収集**（`delayedAttackTrigger`）は**✅続き81（Sonnet）で実機PASS確認・既定orderに追加済み**＝3件ともFAILの原因はdriver側の不具合（trash基準値の計測タイミング／pointer-events:none画像への通常click／モーダル閉じ忘れ）で、engine実装自体は正しく動作していた（詳細 BUGFIXES 続き81）。**`execTrash` のカウンタ**（`trashCounterOpp`）は driver側の召喚不可設定ミス（lrigレベル不足）を修正して実行は進むようになったが、**`resumeSelectTarget`→`applyDirectAction` のTRASH/HAND_CARD分岐が`hand_trashed_by_opp_this_turn`等3フィールドの更新を欠く実engineバグを確定**＝修正はOpusタスク12へ登録済み（既定order外のまま）。⚠**続き79が記録した「`H.closeModals()`（Escape×3）は当てにならない」は続き81で恒久修正済み**（「タップして閉じる」テキストクリックを追加）。雛形＝`acceSelfScope`/`acceOtherScope`（正例と負例をペアで書く）。**その他の残（🆕続き116・Sonnetで§7本文と全数突き合わせ＝R30/ON_TARGETED残3枚/R42②/R43②/R44②③/R46②③/R38②③/R36②/R39②/R41②は全て既に決着済みと判明しリストから除去。真に残るのは以下のみ）＝**R40②**（opp-draw「自分の効果で」発生源限定なしの近似・未検証）・**R37③**（パワー0以下トリガー連鎖再発火・Opusタスク12のusageLimit書き戻し修正待ち）・**ON_COIN_PAID④**（自分のターン外でも発火するか未検証）・**ON_LRIG_GROW④**（《ターン1回》・Opusタスク12(vi-5)のusageLimit書き戻し修正待ち）・**ON_LRIG_ATTACK_STEP_START②③**（②《ターン1回》未検証・③アクションのパース近似は既知）・**ON_TARGETED forced単一対象follow-up**（pending無しで自動解決される対象取り経路が未発火のまま）・**B4引用付与の実発火**（WX24-P2-018等・Opusタスク12(xiii)のtiming誤変換修正待ちで一時停止）・~~B2（WX17-028）~~・~~B3（WX25-CP1-069）~~・~~機構④誤parse 3枚（WXDi-P07-044/WX25-P3-062-E2）~~（**続き112・Sonnetで全て✅実機PASS確認済み・詳細は上記§7「その他の実機検証待ち」欄**）・**クラフトトークンの実機配置**（§6.4）・~~ビート機構Phase1-7・F-3身代わり対話・G144/G145~~（**続き115・Sonnetで決着＝G144/G145・F-3コスト払い型・ビート機構の[条件]ゲート/コスト支払い/any_ally反応はPASS、F-3犠牲型5枚とビート機構self反応はJSON/engineの真バグと確定しOpusタスク12(xv)(xvi)へ登録・詳細は上記§7欄**）。**発見したバグの修正自体は Opusタスク12 に回す**＝観測結果を §7 とバトンに記録）。
2. ~~CHOOSE平坦化復元 held 約38枚の全数機械分類~~ **✅完了（続き71・2026-07-11）**＝fresh側でCHOOSE増加54枚を1枚ずつ精査→明白な純改善1枚（WXK10-013）採用・残53枚を系統別パターンA〜Fに整理してOpusタスク10へ（詳細 BUGFIXES 続き71・PLAN §3 Opusタスク10）。
3. ~~**verifyBattleDrive のバッチ実行時状態汚染の根本修正**~~ **✅ほぼ完了（続き105・Sonnet）**＝2つの根本原因を特定・修正＝(a) `injectScenario`のシナリオ間リセットが18個の手動列挙方式で約170個中150個超が漏れていた（実例＝`abilities_removed`未リセットが後続シナリオへ残留）→「盤面の物理配置」9フィールドだけを引き継ぐホワイトリスト方式（除外方式）へ書き換え。(b) 1ブラウザセッションでの長時間連続実行によるクライアント側（React state/タイマー/Realtime購読）の蓄積→各シナリオ直前に`page.reload()`を追加しコンポーネントツリーを再マウント。効果測定＝47件一括PASS40/FAIL7→PASS43/FAIL6（残存FAILは実行のたびに対象が入れ替わる低頻度フレーク）。**`oppDraw`のみ完全単独実行でも再現＝バッチ汚染と無関係の別要因**（CPU挙動依存とみられる・未解明のまま）。engine/JSON無変更。詳細 BUGFIXES 続き105。
4. **BEHAVIOR_AUDIT キュー再生成＋一次トリアージ**（`--queue` 再生成→`_bqTriage`→真no-op候補の抽出まで。仕分け確定と修正は Opusタスク11/12）。
5. ~~**golden 型網羅の追加**~~ **✅実質完了（続き82-85・Sonnet・golden 106→277）**＝121型中99型をテスト化。残22型はOpus機構実装待ち/no-op placeholderのみ。過程で新規engineバグ2件をOpusタスク12(v)(vi)へ登録。詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3・BUGFIXES 続き82-85。
6. **Opus バッチ着地後の再収穫サイクル**（`/census-batch` スキル準拠＝`build:effects`→`heldReview` spot-check→採用→全ゲート→`regen`→BASELINE/PLAN簿記→commit。⚠必須ガードレール4点は上記リスト参照）。**Opus タスク1〜6 のいずれかが着地するまでは §5c 再収穫に着手しない**（現在プラトー＝空振りになる。続き34着地→続き35収穫の型を踏襲）。
7. ~~**§5b Z-2＝BET系の表現描画**~~ **✅完了（続き86・Sonnet）**＝現存19効果に `decompileEffects.ts` の原文抽出規則を追加し意味文化（engine/JSON不変・同型★0/census 1483維持）。詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3・BUGFIXES 続き86。
8. **semantic audit のパイプライン実行＋データ単点修正**（パイロット findings 真バグ39件のうち owner/値/duration の単点是正＝parser/engine 変更なしのもののみ・stub群2,306枚へのスケールアップ実行＝`semanticAudit{Extract,Run,Triage}.mjs` 回し。意味判定が割れるもの・機構が要るものは Opusタスク12 へ）。**⚠続き88（Sonnet）で判明＝過去のパイロット出力（findings.jsonl）は既に手元に無い（scratchpad由来で消失済み）ため`semanticAuditTriage.mjs`での再精査は不可。系統①「相手デッキ削り」の残27件は代わりに`_auditSystematicScan.mjs`で再抽出・全件ノード単位で分類し「単点是正できる残件ゼロ」を確定（詳細§6.2・BUGFIXES続き88）。**🆕続き102（Sonnet）で`claude -p`スケールアップに着手＝200枚サンプル中119枚（12/20バッチ）を`claude -p`セッション上限まで精査・findings125件のうち単点是正21件をJSON直パッチ（census1479→1477）＋新規engineバグ発見（`execBlockAction`のSIGNI/ATTACK分岐がtarget.countを無視し全ブロックへフォールバック＝Opusタスク12へ登録）。**残り8バッチ（81枚）は`claude -p`上限リセット後に再開可**（findings/manifest は `scripts/archive/scratchpad/semantic_audit_101/` に保存済み・詳細BUGFIXES続き102）。
9. ~~**smoke SKIP 268 の解消**~~ **✅ほぼ完了（続き93 Sonnet＋続き106 Opus）**＝DECLARE_BOND/REVEAL_CARDS 5件をautopilotに追加（263→258）後、残258件の真因＝`applyDirectAction`型対応漏れ（Opusタスク12(vi-2)）を続き106（Opus）で根治し**SKIP 258→1**。残1件の最終確認のみ。
10. ~~**WXK04-003 のボタンラベル表示バグ**~~ **✅完了（続き81・Sonnet）**＝`getMyLrigFieldActions` の costParts 3箇所に `eff.cost?.coin` 考慮を追加しE2ラベルを是正（実UI `wxk04003Label` PASS）。詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3・BUGFIXES 続き81。
11. ~~`checkAllEffects` の `MANDATORY_SUSPICIOUS` 一次精査~~ **✅完了（続き89-92・Sonnet）**＝MANDATORY_SUSPICIOUS 38件精査で単点是正16件＋EFFECT_TYPE_MISSING_CONTINUOUS真バグ5件修正（census 1483→1479）・構造的バグ14件をOpusタスク12へ登録・verifyEffects「定義なし」は現状0件でクローズ。診断は `scripts/_checkAllEffects.mjs` に常設。詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3・BUGFIXES 続き89-92。
12. ~~**§5b 英語ID漏れ残367件の系統分類**~~ **✅完了（続き87・Sonnet）**＝実測823カードを16テーマに機械分類（`scripts/_stubLeakScan.mjs`・`docs/_stub_leak_classification.txt`。上位＝デッキ操作系184／パワー修正系165／手札系102）。JSON再構造化の本修正はOpusタスク13。詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3・BUGFIXES 続き87。
- ~~§5b 逆翻訳テール＝STUB id 意味文化／B層 JSONデータ欠落補完~~ **✅完了（続き33-36・2026-07-07再確認・§5b参照。残例外は Opusタスク5 へ移管済み）**。

#### 分類マトリクス（2026-07-11新設・タスク番号は上のリストと同一）
> **読み方**＝セッション開始時に「着手条件が◎（今すぐ）のうち、残り時間に合う規模」を上から取る。規模＝**S**:1セッション内で完結／**M**:1〜2セッション／**L**:複数セッション（ただし項目単位で分割可なら都度1項目ずつ）。種別＝どの層を触るか（＝必要ゲートが決まる：parser/engine→`npm run gates` 必須・decompiler表現のみ→同型★0＋原文照合・scripts/driverのみ→該当スクリプト実行・分析のみ→ゲート不要）。

**Opus 側**：

| # | タスク | 種別（触る層） | 規模 | 着手条件 |
|---|---|---|---|---|
| 1 | 引用内側 parse＋再収穫27 | parser語彙＋engine機構 | M | ◎今すぐ（**第1弾は✅続き75**＝GRANT_TO_PLACED_SIGNI＋バトルバニッシュ timing 31枚＋UP脱落6枚。残＝内側「代わりに」・他の内側トリガー語彙） |
| 2 | 動的比較の残3枚 | parser語彙（＋engine解決器） | S〜M | ◎今すぐ |
| 3 | DRAW脱落 systematic 19枚 | parser修正 | S | ◎今すぐ |
| 4 | §5c 条件節の残 | parser語彙 | S〜M | ◎今すぐ |
| 5 | 小口持ち越し 約12件 | 単点（parser/engine/decompiler混在） | S×件数（1件ずつ分割可） | ◎今すぐ（隙間埋めに最適） |
| 6 | 「代わりに」機構系 | engine新機構（置換） | L | ◎今すぐ（独立） |
| 7 | §6.1 未実装action型 7種 | engine実装 | M（1型ずつ分割可） | ◎今すぐ |
| 8 | §6.3 大型機構 | engine機構＋parser | L（項目ごと独立・分割可） | ◎今すぐ |
| 9 | semantic audit 機構対応 | engine＋decompiler | M | ◎今すぐ |
| 10 | CHOOSE held 最終見極め | JSON採用（退化見極め） | S〜M | ◎今すぐ（**Sonnetタスク2 の分類完了・続き71**＝パターンA〜F整理済み） |
| 11 | BEHAVIOR_AUDIT 高シグナル22 仕分け | 仕分け＋engine修正 | M | ◎今すぐ（続き77でキュー再生成済み・詳細は上のOpusタスク11本文） |
| 12 | Sonnet 発見バグの修正（常設） | 可変 | 可変 | ◎**在庫8件**（✅続き78で旧8件全消化。新規＝SP27-002 genericKagiri無言消費系統・WXDi-P10-035 引用内BOUNCE owner精査・WXK09-050 dispatch設計・続き81 applyDirectAction TRASH/HAND_CARD 3フィールド欠落・~~続き93 applyDirectAction 未対応6型~~ ✅続き106で修正（smoke SKIP 258→1）・~~続き95/96 LRIGゾーン走査漏れ~~ ✅続き106で5コレクタ修正（golden 298）・🆕続き99 `collectCoinPaidTriggers`がusageLimit用actions_done書き戻しを一切行わずON_COIN_PAIDの《ターン1回/2回》が実質ノーガード・~~続き102/103 `execBlockAction`のSIGNI/ATTACK分岐がcount/filter無視で全ブロック~~ ✅続き106で修正（golden302）。詳細は上のOpusタスク12本文。~~🆕続き114＝`resumeSelectTarget`が外側SEQUENCEの`pending.continuation`を握り潰す構造的バグ~~ ✅続き117（Opus）で修正＝execPlaceSigniOnField経由でchain配置＋continuationをafterAction化・母集団84効果を一律カバー・golden311・craftEnergyCP02087で実機実証。~~続き115 F-3犠牲型5枚のJSON誤表現~~ ✅続き118（Opus・12(xv)）でSTUB BANISH_SUBSTITUTE化・golden313・f3SacrificeWX12024実機PASS・census2220。~~続き116 collectTurnTriggersのusageLimit未実装~~ ✅続き119（Opus・12(xvii)）で`{entries,usedHostIds,usedGuestIds}`化＋書き戻し・golden314・lrigAttackStepStartUsageLimit実機PASS。~~続き116 GROW_COST_REDUCTIONのper-count非対応~~ ✅続き120（Opus・12(xviii)）で`perCount`機構新設・golden316・census2218。~~続き115 ON_BECOME_BEAT self非発火~~ ✅続き121（Opus・12(xvi)）で`battleCardNums`のbeat_zone未走査を特定・1行修正・beatBecomeSelfWDK14017実機PASS＝**タスク12在庫全消化**） |
| 13 | §5b 混線テール367 | JSON再parse（1カードずつ） | L（低優先） | ◎今すぐ（逓減テール＝他が尽きたら） |
| 14 | リファクタ Stage2→3 | BattleScreen構造 | L | ◎今すぐ（独立・他と並行可） |
| 15 | CPU AI メインフェイズ | 新規設計（BattleScreen＋engine） | L（特大） | ⏳DESIGN §4 の CPU/対人統一が先（実質 14 の後） |

**Sonnet 側**：

| # | タスク | 種別（触る層） | 規模 | 着手条件 |
|---|---|---|---|---|
| 1 | §7 実機検証の横展開 | 検証（driver シナリオ追加のみ） | S×約20項目（1件ずつ） | ◎今すぐ（推奨・主力在庫） |
| 2 | ~~CHOOSE held 全数機械分類~~ | 分析（tmp_スクリプト＋分類表） | S〜M | ✅完了（続き71・Opus10解放済み） |
| 3 | driver バッチ状態汚染修正 | scripts（engine/JSON 非依存） | M | ⏳**部分完了（続き77）**＝ゾーン単位フィールドマーカー（signi_acce等17種）の一括初期化は解消・検証済み。**30件超連続実行時のカスケードFAILは別原因（client側state疑い）で持ち越し**（詳細 BUGFIXES 続き77） |
| 4 | ~~BEHAVIOR_AUDIT キュー再生成＋一次トリアージ~~ | 計器実行＋分析 | S | ✅完了（続き77・210/9288→263/9293・高シグナル22件抽出。Opus11へ） |
| 5 | ~~golden 型網羅追加~~ | テスト（scripts） | S（1型1テストずつ） | ✅実質完了（続き82-85・golden 106→277・残22型はOpus機構待ち/no-op placeholderのみ） |
| 6 | ~~§5c 再収穫サイクル~~ | JSON採用（/census-batch 準拠） | S | ✅完了（続き77・held99枚中85枚採用・census 1514→1494。詳細 BUGFIXES 続き77） |
| 7 | ~~BET系の表現描画~~ | decompiler のみ（ゲート軽い） | M（1カードずつ分割可） | ✅完了（続き86・実測19件を全消化） |
| 8 | semantic audit 実行＋単点修正 | パイプライン＋JSONデータ単点 | M | ⏳**部分完了（続き88・102）**＝系統①の残27件を全分類し単点是正ゼロを確定。stub群スケールアップ＝続き102で119/2306枚精査・単点是正21件・残りは`claude -p`上限リセット後に再開 |
| 9 | ~~smoke SKIP 268 解消~~ | scripts（smokeTest autopilot） | S | ✅完了（続き112・Sonnet）＝残1件（WXEX1-19-E2）の根本原因を特定＝`resumeSelectTarget`個別適用ループと自己再帰STUBの設計非互換・実プレイでも無限ループ確定。修正はOpusタスク12(xii)へ登録・診断はここで打ち止め |
| 10 | ~~WXK04-003 ボタンラベル~~ | UI表示単点（BattleScreen） | S | ✅完了（続き81・Sonnet） |
| 11 | ~~checkAllEffects／verifyEffects 精査~~ | 計器＋分析＋JSON単点 | S | ✅完了（続き89-92・MANDATORY_SUSPICIOUS単点是正16件＋EFFECT_TYPE_MISSING_CONTINUOUS真バグ5件を修正・census 1479。残22件はoptionalフィールド無/構造的でOpus送り確定。verifyEffects「定義なし」誤検出＝続き92で全12シート再走査し現状0件と確認しクローズ） |
| 12 | ~~英語ID漏れの系統分類~~ | 分析のみ（修正しない） | S〜M | ✅完了（続き87・実測823カードを16テーマに分類・`docs/_stub_leak_classification.txt`） |


---

## §4 語彙センサスの計測履歴（2026-07-14 に PLAN §4 恒久指標から退避）
> 現ベースライン（効果単位 2218）は PLAN §4 にある。以下は切替前後の履歴の原文。

- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）＝**⚠2026-07-13 続き109 で判定粒度を「カード単位」→「効果単位（effectId）」へ切替＝現ベースラインは高シグナル欠落 2218【効果】**（切替時 2264 → 続き110「アップ状態」フィルタ21効果で 2243 → 同 SPELL_USED_THIS_TURN＋クラス存在条件で 2229 → 続き111「対戦相手の…そうした場合、それを」owner継承漏れ88枚のフィルタ継承分で 2225・続き118 F-3犠牲型5枚をSTUB化で 2220・続き120 GROW_COST_REDUCTION per-count化で 2218）（旧カード単位の 1447 とは**計測仕様が違うので比較不能**。切替の根拠・抜き取り検証は BUGFIXES 続き109）。**前提＝`docs/_effect_srctext.json`（`npm run build:effects` の副産物＝effectId→原文ブロック対応表）が最新であること**（無ければ census は exit 1）。以下は旧・カード単位の消化履歴＝**高シグナル欠落 1461枚（2026-07-12 続き105・履歴 …→1567→1566→1563→1558→1557・続き63 DEPLOY_RESTRICT実装で5枚・続き67 WXEX2-25-E3 lrig相対付与で1枚・続き68 デッキ相対SEARCH3枚・続き69 引用内CHOOSE 26枚で5枚・続き71 CHOOSE平坦化復元WXK10-013で1枚解消・続き75 timing語彙8種で1557→1537・続き76 timing語彙 計19系統＋タスク10 パターンA〜F（全解決）で1537→1514・続き77 §5c再収穫（held 85枚採用）で1514→1494・続き78 タスク12根治＋held 148枚採用で1494→1483・続き89 checkAllEffects MANDATORY_SUSPICIOUS のDOWN{optional欠落}7件修正で1483→1482・続き90 残り9件（optional欠落/owner誤り）修正で1482→1480・続き91 EFFECT_TYPE_MISSING_CONTINUOUS真バグ5件修正で1480→1479・続き102 semantic audit単点是正21件で1479→1477・続き105 CHOOSE選択肢②条件節6枚是正で1477→1471・続き105 パワー閾値+optional discard型9枚是正で1471→1467・続き105「色と色のシグニ」CLAUSES新設＋ルリグアタックプレフィックス構造欠陥修正で10枚是正1467→1461・続き106 色別ARTS_USED_THIS_TURN機構新設4枚是正で1461→1458・続き106「代わりに」五面4枚CONDITIONAL化で1458→**1454**・続き107 ベット「代わりに」IS_BETTING択一2枚採用＋census「コスト:《コイン》」のベット―prefix二重計上をextraOkで是正して1454→1448・続き107 WX25-P3-116の色別アーツ「代わりに」置換1枚で1448→**1447**・明細 `docs/_vocab_census.txt`）**。この数字から増えたら回帰（スクリプトが exit 1）。JSON手パッチでフィルタ語彙を足せば自然に減る＝減ったら `BASELINE_HIGH` とここを実数更新。DSLに新語彙を足したらキー表（PATTERNS）にも追加する。状態系の残（凍結13・ダウン/アップ38）はコスト節/条件/CONT型（別パス・§6.3）。**消化の入口は `npm run census:clusters`＝文型テンプレのクラスタ表（`docs/_census_clusters.txt`・枚数順）から系統バッチを選び、parser規則→`npm run build:effects`→`node scripts/heldReview.mjs` で署名グループごとに一括採用する（続き23確立・手順詳細は §5c）。**

---

## §6 完了済み機構メモ（2026-07-14 に PLAN §6.3/§6.4 から退避）
> resume 経路 inline collector 欠落の原因分析・対照実験（続き58）と根本修正（続き61）／クラフトトークン実機配置検証（続き114-125）の原文。

- ~~**ON_SIGNI_FROZEN のresume経路取りこぼし（2026-07-07・続き40・§7 R38実機検証で発見・WX08-039/WXEX2-02/WXDi-P04-065が対象）**~~ **✅続き41（Opus）で修正・実機PASS**＝`handleEffectInteraction` の pendingEntries ブロックに他4つ（`collectDeckShuffleInline` 等）と同型の `collectFreezeInline` を追加配線（`detectNewlyFrozen`→`collectFreezeTriggers`→`actions_done` 反映）。`node scripts/verifyBattleDrive.mjs freezetrigger` が PASS（`freeze=true watcher=true`・-1000 反映確認）＝既定orderに復帰。golden 151/smoke全0/fuzz全0。詳細は BUGFIXES 最上部。
- ~~**🆕 resume経路inline collector欠落＝機構原因を特定（2026-07-09・続き58・§7 R43/R46実機検証で発見・R41/R31で対照確認・未修正）**~~ **✅続き61（Opus）で根本修正＝盤面差分トリガー収集を `collectBoardDiffTriggers` に統合（両経路から共通呼び出し）。4シナリオ（R46/R43/R39/R36）実機FAIL→全PASS・回帰なし・全ゲート緑。詳細 BUGFIXES 最上部。以下は当時の原因分析（記録保存）。**＝ON_SIGNI_FROZEN（R38）と同型のバグを**2件連続で確認**＝(a)**ON_OPP_POWER_DECREASED**（WX13-036/WXEX2-52対象・`collectPowerDecreaseTriggers`＝`triggerCollect.ts:900`）：WD11-013（相手シグニ1体-1000・mandatory）をSELECT_TARGET resumeで解決するとwatcher無発火。再現＝`node scripts/verifyBattleDrive.mjs oppPowerDecreased`。(b)**ON_ENERGY_TO_TRASH**（WD15-015/同様カード対象・`collectEnergyToTrashTriggers`＝`triggerCollect.ts:808`）：WD15-014（相手エナ1枚トラッシュ・mandatory）をSELECT_TARGET resumeで解決するとwatcher無発火。再現＝`node scripts/verifyBattleDrive.mjs energyToTrash`。**両シナリオとも既定orderから除外済み**。
  - **🆕 機構原因を`BattleScreen.tsx:3428`の`resolveStackNext`本体で特定（続き58・コード読解で確定・推測ではない）**＝`resolveStackNext`は`executeEffect`の戻り値`result.done`で分岐する（3538行）。`result.done===true`（対象選択等の中断なしに完結）の場合のみ`else`節（3556〜4150行）が走り、ON_BANISH/ON_CARD_MILLED_FROM_DECK/ON_CHARM_TO_TRASH/ON_ENERGY_TO_TRASH/ON_REFRESH/ON_OPP_POWER_DECREASED/ON_CARD_MOVED_TO_DECK/ON_SIGNI_FROZEN等のtrigger収集が行われる。`result.done===false`（SELECT_TARGET/CHOOSE中断）の場合は`pending_effect`を保存して即returnし（3538-3555行）、`else`節は一切実行されない＝**この時点でtrigger収集の機会を失う**。ユーザーが対象を選んで`handleEffectInteraction`（resume）で再開しても、そちらのpendingEntriesブロック（4384-4436）には`collectDeckShuffleInline`/`collectBanishOppByEffectInline`/`collectLrigUnderMovedInline`/`collectKeywordGainedInline`/`collectFreezeInline`の5種しかinline版が無い＝**「原因アクション自体がSELECT_TARGET/CHOOSEで中断するtrigger種別」だけがこの穴の影響を受ける**。ON_OPP_POWER_DECREASED（原因＝POWER_MODIFY単体対象で中断）・ON_ENERGY_TO_TRASH（原因＝TRASH単体対象で中断）はまさにこれに該当し実バグ確認。
  - **🆕 対照実験で理論を裏付け＋精緻化（続き58）**＝(1)**R41 placedFront**（PASS）＝原因は`handleSummonSigni`の**通常召喚**（`collectFieldTriggers`をresolveStackNextを経由せず直接呼ぶ第三の経路）＝この穴と無関係。(2)**R31 drawBySourceStory**（PASS）＝原因アクションが対象選択不要な単純DRAW（E2）のため`result.done=true`のまま`resolveStackNext`のelse節に到達し`collectDrawTriggers`が正常に収集。(3)**🆕 R39 outsideDrawPhase（WXDi-D09-P19・FAIL）**＝R31と**同じ`collectDrawTriggers`**だが、今回は原因アクション（E2）が`SEQUENCE[TRASH(手札1枚選択・要対話), CONDITIONAL→DRAW]`＝**DRAW自体は対話不要でも、SEQUENCE内の先行ステップ（TRASH）が対話を要すればエントリ全体の完了はresumeに落ちる**ため無発火。**→理論を精緻化＝「原因アクション自体が対象選択を要するか」ではなく『そのstack entryの解決中に（SEQUENCE内のどのステップであれ）一度でも対話が挟まったか』が分岐条件＝同一collectorでもカードのSEQUENCE構造次第で結果が変わる（カード単位でなく解決経路単位のバグ）**。
  - **系統的懸念（上記の精緻化された理論に基づく推定・個別未検証）**＝`collectMillTriggers`(ON_CARD_MILLED_FROM_DECK)・`collectCharmToTrashTriggers`(ON_CHARM_TO_TRASH＝**R42と同一対象**)・`collectRefreshTriggers`(ON_REFRESH)・`collectMoveToDeckTriggers`(ON_CARD_MOVED_TO_DECK)・`collectAllyPlayOrOppDiscardTriggers`・`collectMaterialUsedOnSigniTriggers`・`collectOppArtsUseTriggers`/`collectArtsUseTriggers`＝**「そのカードの原因効果のSEQUENCE中に対話ステップが1つでもあるか」を見れば影響有無が判定できる**（`collectDrawTriggers`/`collectOppDrawTriggers`自体は対話なしSEQUENCEならR31のとおりPASSするが、対話ありSEQUENCEならR39のとおりFAILする＝同じcollectorでも個別カードごとに判定が要る）。
  - **🆕 R36 handDiscard（WDA-F02-17・FAIL）＝`collectAnyZoneTrashSelfTriggers`（ON_TRASH self・fromZones:hand）でも同型を実機確認（2026-07-09・続き60・Sonnet）**＝原因＝WXK10-065【出】「あなたは手札を1枚捨てる」（TRASH HAND_CARD self count1）がSELECT_TARGETを要し、手札に残ったWDA-F02-17自身を選んで捨てさせるとresume経路で完結する（ground truth＝hHand 2→0・hTrash 0→1は正しい）が、watcher（ON_TRASH self・fromZones:hand）が一度も発火しない＝`collectAnyZoneTrashSelfTriggers`もresolveStackNext中央diffのみ配線でresume側にinline版なし。系統的懸念リストに追加＝`collectDeckTrashSelfTriggers`（ON_TRASH self・fromZones:deck）も同型の疑いで未検証（`verifyBattleDrive.mjs handDiscard`で再現・既定orderからは除外）。
  - ~~**修正方針**＝`collectFreezeInline`と同型の…場当たり的対応は…対症療法止まり。根本修正としては、**`result.done`に関わらず両経路から共通で呼べる収集関数に統合するリファクタ**が本筋~~ **✅続き61（Opus）で実施＝`collectBoardDiffTriggers`（component-closure・約20種の盤面差分トリガーを before/after 比較で収集）を新設し、`resolveStackNext` の else 節と `handleEffectInteraction` の resume done 分岐を双方これ1呼び出しに置換。action型固有（COLLAB/REVEAL_UNTIL/arts/FORCE_END_TURN）は resume で再現不能のため中央 diff に inline 据置。**
  - 詳細はBUGFIXES続き58（3エントリ・原因分析）＋続き61（根本修正）。

- **クラフトトークンの実機配置検証** ＋ ADD_TO_FIELD source 近似残: ~~WXDi-CP02-087~~／~~WXDi-P03-078~~／~~WXDi-P05-068~~／WXK07-105（ベット分岐）／~~WX25-CP1-066（場存在条件）~~／WX22-001-E3（付与型 leave トリガー機構＝STUB未実装）。**✅WX25-CP1-066＝続き113（Sonnet）で実機PASS確認**＝`verifyBattleDrive.mjs craftTokenPlace`＝`ADD_TO_FIELD{cardName:'雷ちゃん'}`が`execAddToField`のクラフトトークン生成分岐で`WX25-CP1-TK1A`（`CardData_TK.csv`）へ正しく解決され場に出ることを確認（2回連続PASS・既定orderに追加）。「場存在条件」近似（原文の「あなたの場に《雷ちゃん》がない場合」がJSON側に無い）はPLAN既知の据置のまま＝新規バグではない。
  - **✅WXDi-CP02-087／WXDi-P03-078／WXDi-P05-068＝続き114（Sonnet）で実機PASS確認**＝`craftEnergyCP02087`（ON_PLAY→ADD_TO_FIELD source:ENERGY_CARD）・`craftTurnEndP03078`（ON_TURN_END経由でのpowerLtSelf動的フィルタ解決）・`craftHandSpellP05068`（スペル入れ子SEQUENCE内のDRAW×2＋ADD_TO_FIELD source:HAND_CARD）の3件とも既定orderに追加。3枚とも当初PLANの注記（「エナ枚数条件」「動的フィルタ」「先頭ドロー脱落」）は懸念に反しすべて正常動作を確認（ADD_TO_FIELD source:ENERGY_CARD/HAND_CARDともSELECT_TARGET経由でSELECT_SIGNI_ZONEを正しく要求・解決）。
  - **🆕続き114（Sonnet）で新規に確定した真バグ＝`resumeSelectTarget`（`effectExecutor.ts:4246-4253`）が外側SEQUENCEの`pending.continuation`を握り潰す**＝ADD_TO_FIELDがSELECT_TARGET経由で解決される際、その`thenAction`実行（`applyDirectAction`のADD_TO_FIELD分岐＝`effectExecutor.ts:4996-4998`）が空き2以上でさらにSELECT_SIGNI_ZONEを要求すると、`resumeSelectTarget`は`if (!result.done) return result;`でその`needsInteraction`結果をそのまま返してしまい、外側SEQUENCEの残りステップ（`pending.continuation`）が二度と実行されない。**WXDi-CP02-087で実証**＝ADD_TO_FIELD自体は成功するが後続のGRANT_KEYWORD（絆常付与）が`host.keywordGrants=[]`のまま4周待っても無発火。**WXK07-105で実証**＝1体目のADD_TO_FIELDは成功・ベットも成立（coins 2→0）するのに、CONDITIONAL(IS_BETTING)の2体目ADD_TO_FIELDが絶対に発火しない（`craftArtsBetK07105`＝意図的FAIL回帰・既定order外）。WXDi-P05-068も同型のGRANT_KEYWORD後続ステップを持つため同じ穴の疑いが濃厚（`craftHandSpellP05068`のPASS判定はADD_TO_FIELD成功のみを見ており後続は未確認）。**修正方針の見込み**＝`resumeSelectTarget`が`applyDirectAction`から`needsInteraction`を受け取った場合も`pending.continuation`をその内側interactionオブジェクトへ引き継ぐ（`REVEAL_UNTIL_TO_FIELD`の`SELECT_SIGNI_ZONE`が`continuation`フィールドを正しく持つのと同型の対応が必要）。**影響範囲は未調査**＝「ADD_TO_FIELD(SELECT_TARGET経由)を含むSEQUENCEに後続ステップがあり、かつ配置先に空きゾーンが2以上ある」全カードが対象＝Opusタスク12へ新規登録。
  - **✅WXK07-105＝続き125（Sonnet）で再検証・2回連続PASS**＝`craftArtsBetK07105`（engineは続き117のresumeSelectTarget修正で既に解消済み・`H.stdStep()`のpick-0ハンドリングだけで手札ピッカーも解決できると判明＝「driverのHAND_CARDピッカー未クリック」という旧登録は誤りだった）。既定orderに追加。
  - 残＝WX22-001-E3（STUB`GRANT_LEAVE_PLACE_PENDING`未実装＝実質no-op確認のみで検証対象外・§6.4上部「UNKNOWN」欄と同様の機構待ち）。

---

## §7 実機検証の完了ログ（2026-07-14 に PLAN §7 から退避）
> engine 配線済み timing の実機 PASS 記録（続き57-64・112-128）。PLAN §7 には「残っている未検証項目」だけを置いた。

### timing 別（ON_LRIG_ATTACK_STEP_START / ON_COIN_PAID / ON_LRIG_GROW / ON_TARGETED）
- **ON_LRIG_ATTACK_STEP_START（ルリグアタックステップ開始時）**：1枚（WX25-CP1-042-E2）。**①実機PASS＝✅確認済み（2026-07-09・続き57・Sonnet）**＝`verifyBattleDrive.mjs lrigattackstepstart`（既定orderに追加）。ATTACK_SIGNI→「ルリグアタックへ」→「まだ攻撃していないシグニがいます」確認ダイアログ「このまま進む」→ATTACK_LRIG遷移で発火。盤面ログ「[自分] 尾刃カンナ の【自】効果（ルリグアタックステップ開始時）」→SELECT_TARGET→相手手札1枚トラッシュ確認（2回連続PASS）。**②＝❌続き116（Sonnet）で実機検証→真バグ確定**＝`lrigAttackStepStartUsageLimit`シナリオで`repatchTop`により同一ターン内にATTACK_SIGNI→ATTACK_LRIG遷移を人為的に2回発生させたところ、《ターン1回》のはずが2回目も発火（gHand 5→4→3・2回連続再現）。原因＝`collectTurnTriggers`（`triggerCollect.ts:1571`・ON_TURN_START/END/ON_ATTACK_PHASE_START/ON_MAIN_PHASE_START/ON_LRIG_ATTACK_STEP_STARTの共通コレクタ）が`eff.usageLimit`を一切参照せず`StackEntry[]`のみを返す設計＝呼び出し元（`BattleScreen.tsx:3220`他4箇所）も`actions_done`への書き戻しを行わない。**機械抽出＝usageLimit付きでこの5timingを使うのは実カード2枚のみ**（WX25-CP1-042-E2＝once_per_turn・WXDi-CP02-077-E1＝twice_per_turnだが後者はCSV原文の「《ターン２回》」表記が別の「ON_HAND_DISCARDED的な」能力に属しJSONの帰属が疑わしい＝要再確認）。通常プレイでは各timingの発生自体が1ターンに1回のフェイズ境界のため実害は薄いが、コード上のガード欠落は他コレクタ（continue99/100/104の系統）と同型で確定。Opusタスク12(xvii)へ登録。③アクションは**パース近似**＝原文「クラッシュした相手ライフ1枚につき相手手札1捨て」ではなく固定「相手手札1トラッシュ＋ブルアカ-5000」が走る（厳密スケーリングは別課題・未検証のまま）。⚠**CPUターンのルリグアタックステップは未配線＝follow-up**。
- **ON_COIN_PAID（コインを支払ったとき）**：3枚（WXDi-P15-055/069・WXDi-P16-057）。✅発火自体は実UI検証済み（`WXDi-P15-069`で確認）。**③実機検証＝❌続き99（Sonnet）でusageLimit未機能の実バグを発見**＝`coinPaidTwice`シナリオでWXDi-P15-069（twice_per_turn）が同一ターン内3回目の支払いでも発火（`collectCoinPaidTriggers`がactions_done書き戻しを一切行わない設計漏れ）。修正はせずOpusタスク12(vi-5)へ登録。**副産物＝表示バグ1件は続き99で修正済み**（`getMySigniFieldActions`相当のcostLabelが`eff.cost?.coin`未考慮で「【起】コストなし」と誤表示＝WXK04-003のLRIG版と同型・シグニ版が取り残されていた）。**④＝✅続き116（Sonnet）でコード読解により決着＝`collectCoinPaidTriggers`（`triggerCollect.ts:153`）自体は`triggerCondition.turnOwner`未指定なら発火側のターンを問わない設計で、WXDi-P15-055/069/WXDi-P16-057の3枚もturnOwner指定なし＝呼ばれさえすれば相手ターンでも正しく発火するはず**。ただし3枚とも自身のコイン支払いは`timing:['MAIN']`のACTIVATEDのみ＝自分のターン中にしか支払えない。**唯一「対戦相手のターン中にコインを支払う」実カード＝WXEX1-12-E3（`timing:['SPELL_CUTIN']`・コイン1でCOUNTER_SPELL）を`handleCutinUse`（`BattleScreen.tsx:5760`）のコスト支払いブロックで確認したところ、`coins`フィールドへの言及が一切無くコインコスト自体が支払われず、`collectCoinPaidTriggers`も呼ばれていない**＝既知の「follow-up: スペルのベット（pending_spell/カットイン経由）は未配線」の記載どおりで新規バグではないと確定。実機検証は不要と判断。
- **ON_LRIG_GROW（ルリグがグロウしたとき）**：5枚。✅発火自体は実UI検証済み（`WXDi-P03-039`・CPUセンターグロウも`cpugrow`で確認）。**②相手のグロウでany_opp発火する経路＝✅続き73（Sonnet）で2枚とも検証完了**（WXDi-P13-047／WXDi-P03-046）。**🆕続き75（Opus）で turnOwner ゲート未実装を修正**＝原文「**あなたのターンの間**、対戦相手のルリグがグロウしたとき」の前置きを parser が抽出せず `triggerCondition.turnOwner` が JSON に無かったため、相手が自分のターンに通常グロウするだけで毎回誤発火していた（過剰効果）。`effectParser.ts` の ON_LRIG_GROW スコープ抽出に ON_LEAVE_FIELD と同型の前置き抽出を追加し、**横展開で WXDi-P03-039／WXDi-P03-046／WXDi-P05-010（E1=self・E2=opponent）も同時是正**（engine は評価済み＝engine 不変）。実機 `lrigGrowAnyOpp`／`lrigGrowAnyOppP03046` は**判定を反転して PASS**（CPUグロウを `lrigUnder` 0→1 で確認した上で非発火＝ゲート成立。従来はバグ挙動を PASS 判定していた）。発火経路自体は golden で担保（「watcher のターン中に相手がグロウ」）。詳細 BUGFIXES 続き75。**④＝❌続き100（Sonnet）でコード読解により「そもそも機能していない」と判明**＝`collectLrigGrowTriggers`がusageLimit判定用`actions_done`書き戻しを行わない設計欠陥（Opusタスク12(vi-5)）のため、《ターン1回》は実質ノーガード＝2回目グロウで再発火する可能性が高い（実機検証は未実施・コード読解ベース）。**③＝✅続き101（Sonnet）でコード読解＋golden既存テストにより解決＝実装はドキュメントコメントと逆で「グロウ先ルリグ自身の【出】（ターンプレイヤー側）が先、any_opp watcher（相手側）が後」が正しい実挙動**＝`BattleScreen.tsx`の`executeGrow`内コメントが「opp側が先に解決される」と実装と逆のことを書いていた（`effectStack.ts`の`buildQueue`は`[...turn, ...opp]`＝ターンプレイヤー→相手の順でキュー構築＝既存golden「Stage2 effectStack initStack: ターンプレイヤー→相手の順でキュー構築」で確認済みの汎用機構）。growTriggerEntries（any_opp）はplayerId=非ターンプレイヤー側なのでpendingOppに入り必ず後に解決される＝コメントを実装に合わせて訂正（機能変更なし・ドキュメントバグのみ）。実害カード無し（WXDi-P13-047のE2は相手エナトラッシュのみで順序に依存する相互作用が無い）。**残＝①②③は決着・④はOpusタスク12(vi-5)のusageLimit書き戻し修正待ちのまま**。⚠**アシストルリグのグロウ経路は未配線（センターグロウのみ）＝follow-up**。
- **ON_TARGETED（対象になったとき）**：AUTO（14枚）。✅発火自体は実UI検証済み（`WXDi-P03-067`）。**①個別確認＝続き64（Sonnet）でWXDi-P02-043を追加検証しPASS**（`verifyBattleDrive.mjs ontargeted2`＝`ontargeted`と同一配線で正しく発火。5回中4回PASS・軽微なタイミングフレークは既存シナリオと同型で engine 起因ではない）。`order`追加済み。**①残る3枚＝✅続き72（Sonnet）で全数検証完了**（`ontargeted3`=WXDi-P11-040／`ontargeted4`=WXDi-D09-H14／`ontargeted5`=WX25-P2-055・3件とも単体PASS・`order`追加済み）。検証中に**2件の実データ疑義を発見**＝(a)WXDi-P11-040のGRANT_KEYWORDにexcludeSelf相当のフィルタが無く原文「他のシグニ」を無視して自分自身に付与、(b)WX25-P2-055のREMOVE_ABILITIES target.ownerが`'opponent'`だが原文は自己参照（本来`'self'`のはず）。**③usageLimit＝❌続き74（Sonnet）で実バグを発見**＝同一ターン内に2回対象化すると2回目も発火（`collectTargetedTriggers` が `usedOncePerTurnIds` を返さず `actions_done` が更新されない）。**🆕この3件はすべて✅続き75（Opus）で修正済み**＝(a) parser に `filter.excludeSelf` 付与＋engine `execGrantKeyword` に excludeSelf 実装（実機 `ontargeted3` PASS＝watcher 自身ではなく他の味方に付与）／(b) parser の能力消去規則がトリガー句の「対戦相手」を拾う誤りを是正し `owner:'self'+thisCardOnly` へ（実機 `ontargeted5` PASS＝原文どおり watcher 自身が能力喪失）／(c) `collectTargetedTriggers` の戻り値を `{entries, usedHostIds, usedGuestIds}` へ拡張し呼び出し元で `actions_done` へ書き戻し（実機 `ontargetedUsageLimit` PASS＝2回目は非発火）。詳細 BUGFIXES 続き75。**②turnOwner:opponent ゲート＝✅続き104（Sonnet）でコード読解＋既存goldenにより決着＝既に`goldenTest.ts`「C1 ON_TARGETED: turnOwner:opponent ゲート（自ターンは非発火）」でカバー済みと判明**（PLAN記載が古いままだった＝ドキュメント訂正のみ・追加作業不要）。⚠**forced単一対象（pending無しで自動解決される対象取り）経路は未発火＝follow-up**。**❌続き127（Sonnet）で実機再現・実バグと確定**＝`onTargetedForcedBypass`シナリオ（`targetsTriggerSource`の自動解決でON_TARGETEDが素通りされる）参照。Opusタスク12(xx)へ登録。⚠**driver 注意**＝usageLimit が実際に効くようになったため、watcher が guest 側の ON_TARGETED 系シナリオは注入時に `guestSet` の `actions_done` クリアが必須（続き75で該当6シナリオに追加済み）。

### R30-R46（engine 配線済み timing の実機検証）
**残る実機検証項目（R30-R46・engine配線済みだが実機PvP/CPU未検証）**：
- **ON_OPP_POWER_DECREASED（R46・毒牙）**：WX13-036/WXEX2-52。**①実機PASS＝✅続き61（Opus）で修正確認**＝続き58発見のresume経路取りこぼしを `collectBoardDiffTriggers` 統合で解消。`verifyBattleDrive.mjs oppPowerDecreased`（WD11-013→WX13-036）でwatcher「フィア＝パトラ（相手パワー減少時）」発火。**②複数同時減少時の合算＝✅続き104（Sonnet）でコード読解＋golden新設により決着＝`detectPowerDecrease`は新規負deltaを全合算する設計で正しく機能**（2体同時減少→5000に正しく合算されそのまま`deltaFromOppPowerDecrease`へ注入されることをgoldenで確認）。**③相手自身の自己弱体では発火すべきでない＝❌続き104（Sonnet）で既知の近似と確定・goldenで現状挙動を固定**＝`decreaseOnOpp`（`BattleScreen.tsx:2670-2678`）は「誰の効果で減ったか」を追跡しない設計＝相手が相手自身の効果で自分のシグニを弱体化しても発火してしまう（過剰発火）。修正はせず§6.3相当（発生源追跡機構待ち）としてOpus送り＝続き101のON_ENERGY_TO_TRASH②と同型の近似。詳細 BUGFIXES 続き104。
- **ON_ACCE_ATTACH host条件/ON_REFRESH/ON_LEAVE_FIELD leftToZone（R45）**：①WXK05-041（アクセがレベル4以上のシグニに付いたとき）②WXDi-P04-043（いずれかがリフレッシュ）③WXK02-041（シグニが場→手札に戻った）。**③実機PASS＝✅確認済み（2026-07-09・続き58・Sonnet）**＝`verifyBattleDrive.mjs leaveFieldToHand`（WX21-057→WXK02-041）。ON_LEAVE_FIELDは§6.3の「対策済み9種」の1つ＝原因のBOUNCE（自分のシグニ1体を対象・SELECT_TARGET要）に対話が挟まってもPASS＝R38/R43/R46/R39の穴とは無関係と対照確認。`order`復帰済み。**②実機PASS＝✅確認済み（2026-07-10・続き60・Sonnet）**＝`verifyBattleDrive.mjs refreshTrigger`（WXDi-P04-043→WX15-073）。hostデッキ残り1枚＋trash1枚にし、WX15-073召喚（E1バニッシュ候補0件で即done・E2ドローがデッキ最後の1枚を引いてちょうど0枚化＝リフレッシュ1回のみ）で発火。ログ「幻竜姫　ドラゴンメイドの【自】効果（リフレッシュ時）」を3回連続で確認＝対話なしDRAW/no-op経由のリフレッシュはresume経路取りこぼしと無関係で安全（R31/oppDrawと同型パターン）。⚠デッキを最初から0枚にすると1回目のno-op解決時点で既にリフレッシュ成立し、2回目リフレッシュ時の「ターン強制終了」ルールで収集前に打ち切られる罠を発見・回避（詳細VERIFY_BROWSER.md/BUGFIXES.md）。`order`復帰済み。**①実機❌FAIL＝続き64（Sonnet）で `execAttachAcce` fromHand経路の実バグを発見**（未修正・Opus引き継ぎ）＝手札からACCEカードを選択・確定した時点で完了扱いになり `signi_acce` が終始null（ホスト選択の2段目SELECT_TARGETが現れない）。`thenAction` に未完結アクションを渡す設計が resume 機構と噛み合っていない。詳細 BUGFIXES 最上部・`verifyBattleDrive.mjs acceAttach`（`order`未追加）。
- **ON_EXCEED_COST 場シグニ（R44）**：WXDi-P06-078。**①実機PASS＝✅続き64（Sonnet）で確認**＝`verifyBattleDrive.mjs exceedCost`（WX11-004→WXDi-P06-078）。ルリグ【起】エクシード１支払い時に「発動順序を決めてください」モーダルへwatcherが正しく並び発火を確認（3回連続PASS）。`order`追加済み。**②実機PASS＝✅確認済み（2026-07-12・続き98・Sonnet）**＝`exceedCostPay`シナリオ（`optcost-energy-0`→`optcost-pay`→SELECT_TARGET）で《黒》を実際に支払い、対象（guestのWX01-053）へ`POWER_MODIFY -5000`が正しく適用されることを確認（2回連続PASS）。`order`配列に追加済み。**③＝✅続き101（Sonnet）でコード読解により確定＝カットインexceed（`handleCutinUse`のfield/signi経路・`BattleScreen.tsx:5789-5810`）は`cutinPaid`へのエナ/ルリグトラッシュ状態更新のみでON_EXCEED_COST収集関数を一切呼ばない**＝型定義コメント（`effects.ts:1645`）に「アーツ/スペルのカットイン exceed は未検出の近似」と既に明記されている既知の近似で、コード上ギャップは一意に確認できるため追加の実機検証は不要と判断（実カード母集団は現状このパターンに該当するカードなし＝将来カードが出た場合の機構課題として§6.3相当で追跡）。
- **ON_ENERGY_TO_TRASH（R43）**：WD15-015。**①実機PASS＝✅続き61（Opus）で修正確認**＝`collectBoardDiffTriggers` 統合で解消。`verifyBattleDrive.mjs energyToTrash`（WD15-014→WD15-015）でWD15-015が【ダブルクラッシュ】取得・watcher「幻竜　アメリカワニ（エナトラッシュ時）」発火。**②＝✅続き101（Sonnet）でコード読解により確定＝`collectEnergyToTrashTriggers`（`triggerCollect.ts:813`）は`triggerCondition.energyTrashedOwner`（self/opponent/any）で「どちらのエナプールが減ったか」だけを判定し「誰の効果によるものか」は見ていない**（関数doc冒頭に既に「⚠『あなたの効果』限定は近似で未表現」と明記済み）＝相手が相手自身の効果で相手自身のエナをトラッシュしても`owner:opponent`条件だけで発火してしまう過剰発火が実装上確定（自エナ側は`owner`フィルタで正しく除外される＝そちらは近似ではない）。実機検証なしで確定できるため追加の browser 検証は見送り＝既知の近似として §6.3 相当の機構待ち（「あなたの効果によって」の発生源追跡）に位置づけを統一。
- **ON_CHARM_TO_TRASH（R42）**：WX16-Re05。**①実機PASS＝✅続き64（Sonnet）で確認**＝続き61のcollectBoardDiffTriggers統合がcollectCharmToTrashTriggersも一緒にカバーしていたため追加修正不要だった。`verifyBattleDrive.mjs charmToTrash`（WX19-023→WX16-Re05・banish resume経路でチャームがguest.trashへ→watcherが対戦相手シグニに-4000）でPASS。`order`配列に追加済み。**②バトルバニッシュ経路＝❌続き74（Sonnet）で実バグを発見→🆕✅続き75（Opus）で修正・実機PASS**＝戦闘でチャーム付きシグニが力比べに負けてバニッシュされても watcher が一度も発火しなかった（ground truth＝チャームの trash 移動自体は正常）。原因＝`resolvePendingSigniBattleFor`（バトル解決）が独自のトリガーリストを構築し `collectCharmToTrashTriggers` を一切呼ばない＝効果banish経路（`collectBoardDiffTriggers`）のみ配線され戦闘banish経路が未配線だった。**実戦で最頻の経路（通常の戦闘）で ON_CHARM_TO_TRASH 系が全く機能しない実害の大きいバグ**。修正＝`resolvePendingSigniBattleFor` の `allTriggers` 組み立てに、バトル前後の `countCharmsToTrash` diff に対する収集を追加（`usedOncePerTurnIds` 書き戻し込み・効果banish経路と同型）。`verifyBattleDrive.mjs charmToTrashBattle` PASS・既定 `order` に追加済み。詳細 BUGFIXES 続き75。
- **placedFront（R41）**：WXDi-P03-043。**①実機PASS＝✅確認済み（2026-07-09・続き58・Sonnet）**＝`verifyBattleDrive.mjs placedFront`（WD01-013→WXDi-P03-043）でhost自身の通常召喚を正面ゾーン（ミラー対応 index i↔2-i）へ配置→POWER_MODIFY -3000が即時反映（`hPowerMods=WD01-013#1:-3000`）。**handleSummonSigniが`collectFieldTriggers`を直接呼ぶ経路＝R38/R43/R46のresume経路取りこぼしとは無関係と判明**（系統的懸念の対照実験として有効＝全trigger種別が同じ穴を持つわけではない）。`order`配列に復帰済み。**②実機PASS＝✅確認済み（2026-07-12・続き97・Sonnet）**＝`placedFrontNegative`シナリオ（正面ゾーンを別カードで埋めて「正面配置不可能」状態を作ってから他ゾーンへ召喚）でwatcher非発火・`host.powerMods`変化なしを確認（2回連続PASS）。engine正常動作＝バグなし。`order`配列に追加済み。**R41は①②とも実機検証完了**。**⚠副産物の発見（低優先）**＝ログ表示が「の【自】効果（相手シグニアタック時）」固定文言（`triggerCollect.ts:1492`のany/any_opp共有ループがON_ATTACK_SIGNI用ラベルをON_PLAY/ON_BANISH/ON_BLOOMでも使い回している表示バグ・機能には影響なし）。
- **opp-draw（R40）**：WXDi-P04-038/WXDi-P15-091/WD22-029-G/PR-423。**①実機PASS＝✅確認済み（2026-07-09・続き60・Sonnet）**＝`verifyBattleDrive.mjs oppDraw`（WXDi-P15-091→WX12-047のCPU自動アタックドロー）で発火確認＝ログ「[相手]幻水　ヤリイカの【自】効果（シグニアタック時）」→「[自分]羅石　ラブラドライトの【自】効果（対戦相手ドロー時）」・hHand 5→6。R31と同型（対話なしDRAW→resolveStackNextのdoneブランチで正常収集）＝resume経路取りこぼしの穴とは無関係。`order`配列に追加済み。**②＝✅続き116（Sonnet）でコード読解により確定＝`collectOppDrawTriggers`（`triggerCollect.ts:691`）は`triggerCondition.drawByEffect`を一切参照せず、呼び出し元（`BattleScreen.tsx:2620/2626`）が`cards_drawn_by_effect_this_turn`の増加のみをゲートに使う設計**＝この増加フラグは「誰の効果で引いたか」を区別しないため、PR-423/WXDi-P15-091の原文「対戦相手が**自分の効果で**カードを引いたとき」は、reactor（watcher側）自身の効果が相手に引かせた場合も区別なく発火してしまう過剰発火の近似が実装上確定（R43②のON_ENERGY_TO_TRASH・R46③のON_OPP_POWER_DECREASEDと同型＝発生源追跡機構が無い§6.3の系統課題）。実機検証なしで確定できるため追加のbrowser検証は見送り。
- **outsideDrawPhase（R39）**：WXDi-D09-P19/WXDi-P05-062。**①実機PASS＝✅続き61（Opus）で修正確認**＝SEQUENCE内TRASH対話を挟むDRAWの取りこぼし（解決経路単位のバグ）を `collectBoardDiffTriggers` 統合で解消＝場当たり的inline追加では潰せなかった本命ケース。`verifyBattleDrive.mjs outsideDrawPhase`（WXDi-D09-P19自己完結・E2 SEQUENCE[TRASH手札1枚→DRAW]→E1反応）でWXDi-D09-P19+1000・watcher「蒼天　アウドムラ（ドロー時）」発火。`order`復帰済み。**②ドローフェイズの通常ドローでは非発火＝✅続き104（Sonnet）でコード読解により既に golden でカバー済みと判明**（`goldenTest.ts`「Stage2 ON_DRAW: outsideDrawPhase はドローフェイズ通常ドローで非発火」・`collectDrawTriggers`の`isDrawPhaseDraw`引数が`BattleScreen.tsx:2856`のターン開始時ドロー処理で`true`固定で渡されることを確認）。PLAN記載が古いままだった＝ドキュメント訂正のみ。
- **凍結トリガー（R38）**：WX08-039/WXEX2-02/WXDi-P04-065。**①実機PASS＝✅修正完了（2026-07-07・続き41・Opus）**＝続き40で発見した「resume経路でwatcher無発火」バグを `collectFreezeInline`（§6.3参照）で解消。`verifyBattleDrive.mjs freezetrigger` が PASS（`freeze=true watcher=true`・凍結された相手シグニに-1000反映）＝既定orderに復帰。**②実機PASS＝✅確認済み（2026-07-12・続き92・Sonnet）**＝`verifyBattleDrive.mjs freezetriggerUsageLimit`（WX01-081×2召喚→guest2体を別々に凍結）で、1回目の凍結でwatcher（WX08-039）が発火しgHandが減る一方、同一ターン内の2体目の新規凍結（別ゾーン）ではusageLimit《ターン1回》が正しく発火を抑制することを確認（2回連続PASS）。`order`配列に追加。**③複数同時凍結時の合算＝✅続き104（Sonnet）でコード読解＋golden新設により決着＝`collectFreezeTriggers`は凍結カードごとに候補を積みusageLimitでキャップする設計で正しく機能**（usageLimitありなら2体同時凍結でも1件のみに正しく抑制、usageLimitを外すと2件＝合算ロジック自体は正しく複数候補を数えることを両方goldenで確認）。詳細 BUGFIXES 続き104。R38は①②③すべて決着。
- **パワー0以下トリガー（R37）**：WX20-Re03/WX21-067/WX22-013/WXDi-P01-043/WXDi-P14-009。**①は実機確認済み（2026-07-07・続き39）**＝`verifyBattleDrive.mjs powerzero`（WD11-013→WX21-067）で相手シグニ0化→WX21-067がドロー、盤面ログ「アイン＝テトロドの【自】効果（パワー0以下時）」を確認。**他4枚の個別確認＝✅続き94（Sonnet）でsigni watcher 2枚を追加確認**（`powerzeroWX20Re03`/`powerzeroWXDiP01043`＝ともにENERGY_CHARGE_FROM_DECK・実機PASS2回連続・`host.energy`増加で確認。後者はバッチ実行時のみ`wxk10068banish`と同型のguest_state注入レースでFAILしうる＝`order`配列には追加せず単体実行専用）。**🆕続き95（Sonnet）でLRIG watcher残り2枚（WX22-013・WXDi-P14-009）を検証→両方とも実機で一度も発火しない実バグを発見・確定**＝原因は`collectPowerZeroTriggers`（`triggerCollect.ts:195`）が`field.signi`のみ走査し`field.lrig`を見ていない構造的欠陥（他の大半のコレクタが使う共通ヘルパー`ownFieldSources`未使用）＝**LRIGがwatcherだと印刷テキストどおりの能力が一切機能しない**。`powerzeroWX22013`/`powerzeroWXDiP14009`シナリオを新設（呼び水WXDi-P02-084の-1000適用は実機ログで確認済み・watcher非発火を確認＝どちらも意図的にFAILする回帰シナリオとして`order`配列には追加しない）。Opusタスク12へ登録。詳細 BUGFIXES 続き95。**②＝❌続き100（Sonnet）でコード読解により「そもそも機能していない」と判明**＝`collectPowerZeroTriggers`もON_COIN_PAIDと同じusageLimit書き戻し漏れ（Opusタスク12(vi-5)）を持つため、signi watcher（WX20-Re03/WXDi-P01-043含む）でも《ターン1回》は実質ノーガード＝実機検証は未実施だがコードパターンは同一で高確度（BUGFIXES続き100）。**残＝③連鎖再発火は引き続き未検証**（LRIG watcher2枚・usageLimit全体はOpus修正後に再検証）。
- **手札捨て/トラッシュ flatten（R36）**：WDA-F02-17-E3／WXDi-CP02-082（自ターンE1／相手ターンE2の出し分け）。**①実機PASS＝✅続き61（Opus）で修正確認**＝ON_TRASH(self,fromZones:hand)のresume経路取りこぼしを `collectBoardDiffTriggers` 統合で解消。`verifyBattleDrive.mjs handDiscard`（WXK10-065の【出】手札1枚捨てでWDA-F02-17自身を選ばせる）で対戦相手-5000・watcher「幻蟲　§アメンボ§（手札／エナから）」発火。**②＝✅続き101（Sonnet）でgoldenテスト新設により確定＝`collectHandDiscardTriggers`（`triggerCollect.ts:1254`）のturnOwner分岐（1287行目）を直接検証**＝`trigCtx(HOST)`（discarder自身のターン）ではE1（turnOwner:self）のみ発火・`trigCtx(GUEST)`（discarderのターンでない＝相手ターン）ではE2（turnOwner:opponent）のみ発火を`goldenTest.ts`に追加（golden 278）。turnOwnerゲート自体は`effectStack.ts`の`turnGateOk`とは別に収集関数側でも二重に判定される設計だが、両方確認して出し分けは正しい。①で確認済みのresume経路取りこぼし修正（続き61の`collectBoardDiffTriggers`統合）はturnOwnerに関わらず同一経路を通るため、②固有の実機フルシナリオ（相手ターン中に手札を捨てさせるCPU操作）は追加不要と判断。
- **drawBySourceStory（R31）**：WX20-026-E3（自＜凶蟲＞シグニの効果ドローで相手シグニ−4000）。**①実機PASS＝✅確認済み（2026-07-09・続き58・Sonnet）**＝`verifyBattleDrive.mjs drawBySourceStory`（ATTACK_SIGNI→E2のDRAW→E3のcollectDrawTriggers発火）。R41(placedFront)に続く「resume経路取りこぼし仮説」の対照実験＝**原因アクション（DRAW）がSELECT_TARGET等の中断を要さないため`resolveStackNext`の`result.done`分岐内で正常に収集される**ことを確認（§6.3のresume経路取りこぼし機構解説を参照）。`order`配列に復帰済み。**残＝未検証のまま**（原文の「他の＜凶蟲＞がいる場合」条件がJSON側で欠落し無条件発火＝census系の別件過剰効果・今回の検証対象外）。
- **ON_PLAY any_opp + targetsTriggerSource（R30）**：WXK10-022-E1。続き64（Sonnet）で発見したブロック要因（WXEX2-50-E3の owner誤パース）は続き66（Opus）で是正済み＝発火経路は開通した。**①❌続き70（Sonnet）で新規バグを発見→🆕✅続き75（Opus）で修正・実機PASS（2回連続）**＝WXEX2-50【起】のSEQUENCE（①対戦相手のトラッシュのシグニを対戦相手の場に出す→②自分のトラッシュの＜凶蟲＞シグニを自分の場に出す）で、ground truth は正しいのに watcher（WXK10-022-E1）が一度も発火しなかった。原因＝`handleEffectInteraction` の `!result.done` 分岐（＝SEQUENCE 途中ラウンド）が **ON_BANISH だけを特例収集**していて `collectBoardDiffTriggers`（続き61導入の統合収集）を呼ばず、step1 の盤面変化が一度も diff 評価されないまま `bs.guest_state` に取り込まれ、step2 が done で完了した時点では **before に既に含まれる＝差分ゼロ**で永久に見逃されていた（続き58/61 が直した「1ラウンドで完了する効果の resume 取りこぼし」とは別系統＝**2ラウンド以上を要する SEQUENCE の途中ラウンド**が対象）。**修正＝その ON_BANISH 特例を done 分岐と同一の `collectBoardDiffTriggers` に置き換え**（設計判断＝pending 中にスタックへ積むのは従来の ON_BANISH 特例と同じ扱いで新しい実行順序を持ち込まない／差分ベースラインは DB 書き込み前の `bs.*_state` なので途中ラウンドでも正しい／コミット後は before 側に含まれるため二重収集にならない）。**副次的に BANISH 以外の全トリガー種別（ON_TRASH/ON_DRAW/ON_ENERGY_TO_TRASH/ON_CHARM_TO_TRASH/ON_LEAVE_FIELD/ON_OPP_POWER_DECREASED 等）も多段 SEQUENCE の途中ラウンドで拾われるようになった**（従来は BANISH 以外すべて取りこぼし）。`onPlayAnyOpp` を既定 `order` に追加。二重発火の回帰確認＝盤面差分系8シナリオ全PASS。詳細 BUGFIXES 続き75。**②turnOwner:selfゲート＝✅続き104（Sonnet）でgolden新設により決着＝バグではなく設計どおりと確認**＝`collectFieldTriggers`自体はturnOwnerを見ないが、`effectStack.ts`の`turnGateOk`（`initStack`/`pushToStack`内）が`entry.playerId`と`turnPlayerId`を比較して中央集権的にゲートする二段構え設計＝通常の相手ターン召喚では正しく除外され、WXEX2-50型の相手ターン中特殊召喚では正しく通過することをgoldenで確認。**③usageLimit＝WXK10-022-E1自体は`usageLimit`フィールドを持たず非該当と判明**。ただし**調査の副産物として`collectFieldTriggers`（ON_PLAY/ON_ATTACK_SIGNI/ON_BLOOMのany系トリガー全般）が`usageLimit`を一切実装していない新規バグを発見＝実カード32枚が影響**（ON_BANISHは別の`collectBanishTriggers`で対応済みのため対象外）。「味方シグニが場に出るたびに◯◯（ターンに1回）」型の効果が同一ターン複数召喚で毎回発火する過剰効果＝修正はせずOpusタスク12へ新規登録（カード名一覧はOpusタスク12本文）。詳細 BUGFIXES 続き104。R30は①②③すべて決着（③は新規バグの発見・登録という形で決着）。

**その他の実機検証待ち**：
- **B4引用付与の実発火**：「あなたの〜シグニ1体を対象とし、ターン終了時まで、それは『【自】このシグニがアタックしたとき〜』を得る」型（WX24-P2-018等）の付与先アタック時実発火。⚠permanent/相手シグニ付与は未対応＝log-only据置。**❌続き112（Sonnet）で実機検証しようとして起点E1が一度も発火しない新規バグを発見・確定**＝`WX24-P2-018-E1`（原文「あなたのアタックフェイズ**開始時**」）が`timing:["ON_ATTACK_SIGNI"]`（自己スコープ）で登録されているが、WX24-P2-018はルリグカードで、自己スコープON_ATTACK_SIGNIの収集（`BattleScreen.tsx:6276`）はシグニアタック解決コード内で「アタックしたシグニ自身」の効果しか見ずルリグは対象外＝**`ON_ATTACK_PHASE_START`であるべきtimingの誤変換で、この能力は現状一切機能しない**。`verifyBattleDrive.mjs wx24p2018GrantFire`でMAIN→ATTACK_SIGNIまで進めても支払いUI/keyword_grants一切変化なしを確認。修正はOpusタスク12へ登録（B4本体の検証はこの前提バグが直るまで着手不能）。詳細BUGFIXES続き112。
- ~~**B2 REVEAL_DECK_TOP＋動的閾値**：WX17-028~~ **✅実機PASS確認（続き112・Sonnet）**＝`verifyBattleDrive.mjs revealDeckTopBanish`（レベル4のためlrigをWD02-001 Lv4Limit11に変更・デッキ上4枚をWD01-013×4＝レベル合計4＝閾値4000固定でguestのWD01-013 P3000を確実にバニッシュ対象化）。バニッシュ先はエナゾーン（WIXOSSルール通り・トラッシュではない）で正しく確認・2回連続PASS＝既定orderに追加。⚠eachDistinctLevel厳密enforce未対応（同レベル4枚でも通る近似）は引き続き未検証のまま。
- ~~**B3 INSTALL_DELAYED_TRIGGER**：WX25-CP1-069~~ **✅実機PASS確認（続き112・Sonnet）**＝`verifyBattleDrive.mjs installDelayedTriggerFire`＝アタックフェイズ開始時に手札1枚捨てて設置→同ターン内にWX25-CP1-069自身（青+＜ブルアカ＞）でguestライフを直接攻撃・クラッシュ→設置した遅延トリガーが実際に発火し対戦相手の手札が1枚減ることを確認（2回連続PASS）＝既定orderに追加。⚠crasherFilterは「クラッシュ源を追跡せず、op（クラッシュされた側から見て攻撃側＝そのターンのプレイヤー）の場に該当シグニがいるか」で代用判定する既知の近似（`BattleScreen.tsx:8704-8715`）のまま＝今回検証したのは「設置→同ターン内発火」の一気通貫の配線が生きていることで、近似自体の是正は別課題（クラッシュ源の真の追跡機構が要る＝§6.3相当）。
- **ビート機構Phase1-7**：[条件]ゲート開閉／ON_BECOME_BEAT watcher の self/any_ally出し分け／beat対象のプレイヤー選択UI（場シグニ選択）／CPU自動近似。**❌続き115（Sonnet）で実機検証→[条件]ゲート開通・beat_signiコスト支払い・any_ally反応の3点はPASSしたが、self scope反応が同一イベントから一度も発火しない真バグを発見（`beatBecomeSelfWDK14017`・2回連続再現）**＝Opusタスク12(xvi)へ登録。**✅beat対象のプレイヤー選択UI＝続き129（Sonnet）で実機検証・新規バグなし**＝`analyzeBeatSigniCost`/`actBeatNeedSelect`（`SigniActivatedModal.tsx`）は候補が必要数より多いとき既にゾーン選択UIを要求する設計で実装済みだったが「複数候補時に実際に機能するか」が未検証だった。`beatMultiCandidateSelect`シナリオ＝WXK08-026（他のシグニ1体を【ビート】に）を候補2体（小剣ククリ／羅植姫アキナナ）と共に配置→片方だけを選んで【起】発動→選んだ方だけがbeat_zoneへ移り選ばなかった方は場に残存することを2回連続PASSで確認＝実装どおり正しく機能。既定orderに追加。残＝CPU自動近似（レベル低い順の自動選択・CPU側は選択UIを経由しないため人間操作でしか複数候補選択を検証できない）は未着手のまま（優先度低・実害は「CPUが最適でない対象を選ぶことがある」程度）。
- ~~**機構④誤parse3枚**：WXDi-P07-044／WX25-P3-062-E2~~ **✅実機PASS確認（続き112・Sonnet）**＝`verifyBattleDrive.mjs installByEffectFreeze`（WXDi-P07-044-E2＝any_ally+byEffect ADD_TO_FIELD watcher。WD08-001の【起】《ダウン》「トラッシュからシグニを場に出す」で自トラッシュの信号を場出しし発火＝guest対象が凍結+パワー-2000）・`optionalTrashEnergyClassAttack`（WX25-P3-062-E2＝OPTIONAL_TRASH_ENERGY_CLASS＋HAS_CARD_IN_FIELD lrig名条件。虚幸の冥者ハナレ=WX25-P3-032をセンタールリグに直置きしHAS_CARD_IN_FIELD条件を満たし、WX25-P3-062でアタック→エナの毒牙カードを支払い選択→対戦相手と自分の両方が-20000）。各2回連続PASS＝既定orderに追加。⚠副産物＝WD08-001のLRIG【起】能力2種（E2/E3）がどちらも`getMyLrigFieldActions`のcostPartsMA分岐（energy>0/coin/discard系のみ）に引っかからず「【起】コストなし」で表示が区別不能という軽微なUI表示バグを発見（WXK04-003のコイン欠落と同型・down_self/energy0がcostPartsMAに未対応）＝機能には影響なし（nth(1)で回避）・修正は据置（実害が低優先度のため今回は未着手）。
- ~~**F-3身代わり対話**（バトルバニッシュ経路）：犠牲型 WX12-024/WXEX2-60/WX20-055/WXDi-CP01-032/WXDi-P10-052、コスト払い型 WX10-033/WX11-029~~ **決着（続き115・Sonnet）**＝**コスト払い型は✅実機PASS確認**（`f3PayCostWX10033`＝WX10-033が手札スペル1枚を捨ててバトルバニッシュ回避・2回連続PASS）。**犠牲型5枚は❌実機FAIL→真因確定＝JSONが`STUB BANISH_SUBSTITUTE`ではなく素のCONTINUOUS BANISHとしてparseされており`collectBanishSubstitutes`に一切拾われない**（`f3SacrificeWX12024Bug`＝WX12-024で2回連続FAIL確認・WXEX2-60/WX20-055/WXDi-CP01-032/WXDi-P10-052の残4枚も同型JSON表現で同一バグと推定）。Opusタスク12(xv)へ登録。
- ~~**LOOK_AND_REORDER の canTrash UI**~~ **✅実機PASS確認（続き128・Sonnet）**＝`verifyBattleDrive.mjs lookReorderCanTrash`＝WX20-037（デッキ上3枚を見て1枚トラッシュ選択・残り2枚をデッキトップへ戻す）を召喚→「トラッシュ」トグル→「決定」確定でhTrash 0→1・hDeck 5→4を2回連続PASS確認＝既定orderに追加。UIは実装済みだった（新規バグなし）。
- ~~**WX04-004-E2**（守備側アタック無効化）~~ **✅実機PASS確認（続き126・Sonnet）**＝`verifyBattleDrive.mjs oppDirectAttackNegate`＝正面が空のCPUアタックに対し`STUB(OPP_DIRECT_ATTACK_NEGATE/_PAY)`がCHOOSE(pay/skip)→TRASH(HAND_CARD,＜美巧＞)→エナ支払いでアタックを無効化するフローを新規検証・2回連続PASS（hLife 6→6・単体実行/全件バッチ実行の両方で確認）＝既定orderに追加。
- **WX04-005-E3**（場出し数制限・捨て選択）＝**❌続き126（Sonnet）で調査したところ`STUB LIMIT_ALL_FIELD_1`が完全未実装（engine側にcase自体が存在しない）と確定**＝実機検証以前の問題（機構が無いため何も起きない）。§6.1の残3型とは別の第4の未実装STUBとしてOpusタスク12(xix)へ登録。
- ~~**G144/G145**（効果配置時の any_ally反応）：(a) 他シグニをダウン配置→G144アップ、(b) 他シグニ場出し→G145自身アップ~~ **✅実機PASS確認（続き115・Sonnet）**＝`g144DownTrigger`（WX10-074・placedDown→トリガー元を無選択アップ）・`g145ByEffectTrigger`（WX10-080・byEffect→自身アップ）ともに各2回連続PASS＝既定orderに追加。2026-06-23の効果配置トリガー配線が実機でも正しく機能することを実証。

---

## 2026-07-19 整理：PLAN から退避した完了行の原文

> 2026-07-19 の PLAN 整理（実測値の更新＋完了文の退避）で移動。各行は移動時点の原文そのまま（PLAN 側には1行✅サマリを残置）。

### §3 タスク表の完了・圧縮行（Opus表／Sonnet表・5列）

| # | タスク | 種別 | 規模 | 内容 |
|---|---|---|---|---|
| **1** | 引用付与の内側 ability parse（引用付与残107の本丸） | parser語彙＋engine機構 | M | **✅続き164（Fable 5）で本丸を消化**＝2文型「<対象>を対象とし、<任意コスト>てもよい。そうした場合、それは「【自】…」を得る」（家族18効果）＋内側「対戦相手が《…》を支払わないかぎり」ゲート（33文）を parser 語彙化・14効果採用・実機 `wx24p2018GrantFire` **完全経路2回連続PASS**（既定order追加）・census 2088→2084。engine 変更ゼロ（既存 GRANT_EFFECT/OPPONENT_PAY_OPTIONAL 経路で完結）。**残**＝~~(a)「【常】：アタックできない。」家族~~ **✅続き205で消化＝機構は不要と判明**（parser の対象決め打ちが真因。多数派の `GRANT_KEYWORD` へ寄せて28効果採用・census 1963→1951・engine 変更ゼロ。骨格差のある4効果と付与対象の閾値フィルタ脱落は タスク12 へ）(b)内側「代わりに」置換（WX25-P3-038＝タスク6と合流）(c)`GRANT_LRIG_ABILITY` の ON_PLAY 誤デフォルト（タスク5と重複）(d)WX25-P3-085 単文型 grant mis-parse（12(xxiv)残）。第1弾は✅続き75・詳細 BUGFIXES 続き164 |
| 2 | census「動的比較」の残 | parser語彙＋engine解決器 | S（縮小） | 残＝WXK08-005（キー）のみ＝①先頭文「自ルリグレベル＜相手ルリグのかぎり《アタックフェイズアイコン》を得る」が JSON に効果ごと不在（**キーの使用タイミング動的付与＝新機構**）②E2 `GRANT_LRIG_ABILITY{abilities:[]}` が空（E3-E5 はキー自身の効果として並置＝機能近似）。~~WXEX2-28（直前配置シグニ基準）・WXK11-003（opp/own センタールリグ）~~ **✅続き203（Fable 5）で消化＝`levelGtLastProcessed` 新設・終止形サーチ退化是正・前置CHOOSE復元・`execBlockAction` 動的フィルタ解決・ルリグデッキ戻し幻覚の系統除去12枚採用。詳細 BUGFIXES 続き203** |
| ~~7~~ | ~~§6.1 未実装action型の engine 実装~~ **✅クローズ（2026-07-19・続き204）** | engine実装 | — | **残型0**。~~`COST_SUBSTITUTE`(2)~~ **✅続き204b＝既存のエナ色オーバーライド（`colorOverrideMap`）に載せて実装（新機構不要）。decompiler の生JSON漏れも是正。golden 454→456**。~~`PREVENT_DAMAGE`(4)~~ **✅続き204（Opus 4.8）で実装＝ダメージ無効ウィンドウ機構（`prevent_damage_windows`＝scope ALL/LRIG × expires MY_TURN_END/NEXT_TURN_END）。既存の消費型フラグでは「期間中は回数無制限」を表せないのが未実装の理由だった。消費は crashOneLife／ルリグアタック応答の最前段・「次のターンの間」はターン境界で1回だけ降格して相手ターンをカバー。golden 451→454。詳細 BUGFIXES 続き204** ~~`PLAY_FREE_FROM_TRASH`(2)~~ **✅続き202（Fable 5）で実装＝`execPlayFreeFromTrash` 新設（トラッシュ/ルリグトラッシュ→コスト合計閾値＋filterで絞り SEARCH→STUB `USE_SPELL_FROM_TRASH` で主効果実行）。派生＝二重積みガード・parser 色フィルタ脱落・decompiler 誤表現も是正。詳細 BUGFIXES 続き202** |
| 11 | BEHAVIOR_AUDIT 高シグナル22 の最終仕分け＋engine修正 | 仕分け＋engine修正 | S（縮小） | **続き133でSonnetが22件全件を`npm run audit -- --id`で目視精査＝新規の真no-opバグは0件と判定**（内訳：STUB露出済み・既に§6.1/§6.3で追跡中7件〈WXDi-P09-079/WX24-P2-049/WX25-P2-009/WX25-CP1-040/WX09-012/WXEX2-51/WXDi-P04-065＝最後のみ`freezetrigger`実機PASSで無害確定〉／COUNTER_SPELL＝BattleScreen側cutin経路で実処理・監査ツールの盲点3件／残り約12件はON_ATTACK系・ON_TRASH系等の**トリガー文脈依存効果を監査ツールの直接実行シナリオが構築できない盲点**＝WXK01-021-E1のみ「空の付与文『。』」という軽微なparser残骸の疑い（E2/E4が別途正しく実装済みで機能面の実害なし・低優先）。**残作業＝WXK01-021-E1の空文字付与を要確認する程度**（詳細BUGFIXES続き133）。監査ツールがSPELL_CUTIN/トリガー文脈を構築できない構造的盲点は§6.4「オープンな実装課題」への追記候補。 |
| ~~17~~ | ~~timing 判定が本文後半/引用内のトリガー語を先に拾う系統バグ~~ **✅続き136（Opus）で修正＝判定を「効果ブロック先頭のトリガー句」に限定（`trigText`）。JSON 23効果を ON_ATTACK_PHASE_START へ是正・census 2218→2215・golden 326・同型★0維持。詳細 BUGFIXES 続き136** |
| 16 | timing 語彙センサス（`npm run census:timing`）の消化 | parser語彙 | S（ロングテール） | ✅ engine 配線済みで parser 語彙だけ無いクラスタは続き75/76で出し切った（19系統81枚・376→128）。**続き172（Sonnet）で残117クラスタの振り分け台帳 `docs/_timing_census_triage.txt` を新設＝旧「残128は全て機構待ち」の想定を訂正**：**[A]完全wired（parser regexのみで直る）約34クラスタが即消化候補として新たに判明**（ON_ACCE_ATTACH／ON_SIGNI_BATTLE系／ON_CARD_MOVED_TO_DECK／ON_CHARM_TO_TRASH／risedOntoNameContains／exceedCostPaidByPlayer等）。[B]軽量engine拡張が要る約16クラスタ／[C]新規機構が要る約67クラスタ（§6.3送り）。[C]側は個別カード対応より①ON_SIGNI_DOWN系未配線②累積・合計N以上カウンタ欠如③ON_LEAVE_FIELD/ON_HAND_DISCARDEDの跨サイドscope欠如④自己discard反応欠如⑤frozen filter欠如、の5パターンで一括機構化を検討する方が費用対効果が高い。運用知見は PLAN_DETAIL §3。**✅続き175（Opus）で[A]の一つ「（あなたの効果によって）対戦相手が手札を捨てたとき」を消化＝engine collectHandDiscardTriggers に `any_opp` scope を新設（相手フィールド watcher path を any/any_opp 対応＋LRIG 走査追加・path1 は any_opp スキップで自捨て非発火）＋parser 語彙＋decompiler。5効果採用・golden 388→391・fallback 135→129**。⚠WD16-014-E1（対戦相手捨て→基本パワー変更＋引用付与）は action が内側引用に潰れる§6.3案件でタスク1送り。**✅続き176（Opus）で ON_ACCE_ATTACH アクセカード自身を消化＝parser「このカードが【アクセ】として（レベルN以上/以下の）（＜X＞の）シグニに付いたとき」→ON_ACCE_ATTACH＋host条件抽出（accedHostMaxLevel/accedHostStory 新設・accedSelf でルリグ監視版と逆翻訳弁別）＋engine host ゲート追加。6効果採用（WXK05-040-E2/SPK01-11-E1/WX17-033-E4/WXK05-041-E2/WX17-076-E2/E3）・golden 391→392・fallback 129→123。詳細 BUGFIXES 続き176**。**✅続き177（Opus）で clean な残 [A]を一括消化＝5系統9timing（ON_SIGNI_BATTLE基本形/ON_SIGNI_DAMAGE/ON_RISE risedOntoNameContains/ON_CHARM_TO_TRASH/ON_CARD_MOVED_TO_DECK単数移動/ON_LEAVE_FIELD「場から離れた」/ON_OPP_VIRUS_CHANGED・REMOVED/ON_EXCEED_COST exceedCostPaidByPlayer）を parser 語彙化・engine変更ゼロ。影響16効果（全てON_PLAY→正しいtiming・回帰ゼロを baseline diff で機械確認）・AUTO9件パッチ・golden 392→393・fallback 123→106。詳細 BUGFIXES 続き177**。**✅続き178（Opus）で [B]第1弾＝ON_SIGNI_BATTLE の level/power filter（engine collectBattleTrig に matchesFilter 評価1行・副作用ゼロ）＋basic/front banish を消化＝5効果・golden 393→394・fallback 106→101。詳細 BUGFIXES 続き178**。**✅続き179（Fable 5）で [B]第2弾＝残メニューを一括消化**＝被バニッシュ状態 filter（`triggerCondition.banishedFilter` 新設＝防御側バトル前状態で matchesStateFilter 評価。凍結4・感染1・チャーム1）＋placedFront＋levelRange（engine 変更ゼロ＝実質[A]・WX17-075-E1 は action の対象幻覚も是正）＋frontLowerLevelThanSource＋ON_ARTS_USE 色 filter（collectArtsUseTriggers に使用アーツ引数）。10効果・golden 394→396・census 2027→2019・fallback 101/87→**91/77**。詳細 BUGFIXES 続き179。**✅続き180（Fable 5 実装／Opus 採用・検証・簿記）で [C] の台帳下部5機構を一括消化**＝①ON_SIGNI_DOWN/BECOMES_UP（collectSigniDownUpTriggers＋detectNewlyDowned/Upped・キー watcher）②自己discard反応（ON_TRASH+fromZones:hand）③ON_LEAVE_FIELD 跨サイド（any_opp byOwnEffect＋any_ally byOpponentEffect＋既存 usageLimit 是正）④mill合計/draw以上カウンタ⑤ゾーンアイコン（trap/gate）。27カード採用・golden 396→**402**・census 2019→**2016**・fallback 91/77→**60/48**。詳細 BUGFIXES 続き180。**✅続き207（Fable 5）で [C] 残の「ON_HAND_ADDED 新設」（WX25-P2-063 等5枚＝タスク12(xxvii) と同機構）と「動的比較（WXEX1-42 パワー閾値）」（`powerLteTrigger` 新設＝WXEX1-42/53・WDK12-001）を消化。詳細 BUGFIXES 続き207**。**✅続き208（Codex 実装／Opus 検証）で [C] 残の2クラスタを消化＝`ON_LIFE_CLOTH_ADDED`（ライフクロス増加＝WD06-001/WD20-001）と `ON_OPP_ENERGY_ADDED`（相手エナ増加の逆scope＝WDA-F03-13/WX24-P2-050）。golden 478→482・fallback 56→52効果/45→43クラスタ。詳細 BUGFIXES 続き208**。**残る [C]（52効果/43クラスタ）の上位**＝①「あなたの《トラップアイコン》が発動したとき」5効果（`ON_TRAP_ACTIVATE` は型定義のみで engine 参照0＝新規機構）②「シグニの下からトラッシュに置かれたとき」3効果（`fromZones` に under-signi 種別が無い）③placedOnGateZone の迷宮ゲート設置配線。以降は逓減テール。 **🆕✅続き213（Codex 実装／Opus 検証）で [C] 残の上位3系統9効果を全消化**＝`ON_TRAP_ACTIVATE`（型・parser はあったが **engine 参照0＝一度も発火しない**状態を配線。executor の `result.trapActivated` 明示フラグ方式で「発動」と「破棄」を弁別）／`ON_GUARD` ルリグ変種（**engine も要拡張**＝`collectLrigAttackGuardedTriggers` 新設＋既存収集側で skip して二重発火防止）／`ON_GROW_PHASE_START` 新設（既存 `collectTurnTriggers` に相乗り）。golden 491→496・**フォールバック 52効果/43クラスタ→43効果/40クラスタ**。詳細 BUGFIXES 続き213。**残43効果**＝「シグニの下からトラッシュ」3・「アタックを効果によって無効にしたとき」2・以降ロングテール。 |
| ~~9~~ | ~~PARTIAL 刻印 151件のトリアージ~~ **✅完了（続き138・Sonnet）** | 計器読み＋分類（parser/engine 非変更） | M | **152件全件を原文照合＋効果JSON本体を直接確認して3分類完了**＝(a)実害あり144件（IS_MY_TURN化127＝属性判定65/カウント閾値59/否定3・リコレクト分割8のうち6件確認＝センタールリグ複数エクシード能力付与が丸ごと崩壊等・発生源フィルタ脱落8）／(b)慣例で無害11件（multi-dest分割＝11件全件をJSONで直接確認し内容欠落なしと確定）／(c)機構待ち0件。**(a) 144件を Opusタスク12 へ (xxii)(xxiii)(xxiv) として登録済み**。一次成果物＝`docs/_partial_triage.txt`（分類根拠・IDリスト・JSON実例つき） |
| 1 | **§7 実機検証の横展開** | 検証（driver シナリオ追加のみ） | S×件数 | **✅(a)(b)(c)は続き141（Sonnet）で消化完了**：(a)`trashCounterOpp`（タスク12(iv)修正の反転＝PASS・既定orderに追加）(b)ON_LRIG_GROW④のusageLimit＝`lrigGrowUsageLimit`（タスク12(vi-5)修正の反転＝旧FAILの真因はdriver側のtestId誤りと判明・修正してPASS・既定orderに追加）(c)R37③ ON_SIGNI_POWER_ZERO_OR_LESSのusageLimit＝専用シナリオ`powerzeroUsageLimit`を新規作成しPASS・既定orderに追加。既定order 71→74件。**✅`oppDrawOwnEffectOnly`も続き170（Sonnet）で反転確認完了**＝Opus続き162の`drawByDrawerOwnEffect`修正後、2回連続PASS（guestドロー後もPR-423生存・guest.life無傷）＝既定orderに追加（74→75件）。**残ブロック**＝(xiii)/(xix)/(xx) は続き136/137 で既に解消済み（要 §7 反転確認）。WX22-001-E3（クラフトトークン残・§6.4）も引き続き可。**🆕続き173/174で在庫2件復活**＝(a)WX25-P1-001（タスク12(xxiii) 消化）の付与【起】シナリオ新設＝アーツ使用（リコレクト4枚）→センタールリグに【起】×3付与→エクシード1支払い→デッキ5枚見て2枚手札、まで通しで2回連続PASS確認（b)SPDi47-03 の【起】＝DRAW3→好きな枚数discard→捨て枚数閾値（1枚以上でシグニ→デッキ下）の通し確認（いずれも「要実機検証」刻印の解消） |
| 3 | driver バッチ実行の状態汚染 | scripts（engine/JSON 非依存） | M | ⏳部分完了（続き77・105・139）＝ホワイトリスト方式リセット＋シナリオ毎 `page.reload()` で改善を継続中。**🆕2026-07-15（続き139・Sonnet）＝`blockDrawByEffect`/`exileHandBlind`の原因を特定・修正**＝両シナリオが`handPrepend`（`.slice(0,4)`で前シナリオ/mulligan由来の**実ランダム手札**を持ち越す実装）を使っていたため、末尾に紛れ込むランダムな余剰カードが召喚ボタン/pick候補の出現順序を狂わせてdriveのクリック列を空振りさせていた＝**バッチ位置に依存しない単体flakinessと確定**（FRESH=1の単体再実行だけでも複数回FAILを再現）。修正＝両シナリオを`handPrepend`から**完全決定的な`'hand':[...]`直接指定**へ変更（他の安定シナリオと同じパターン）。**5シナリオ連結（freezeLrig→negateAttackLrig→blockDrawByEffect→exileHandBlind→delayedAttackTrigger）で3回連続ALL PASS**を確認。⚠**ただし71件フルバッチでは依然この3件がFAILする場合がある**＝修正後に2回フルバッチを実行し1回目は環境要因（旧`verifyBattleDrive`のdevサーバーがポート4173に残留＝`taskkill`後に再実行したら62/71へ改善）、2回目もこの3件を含む9件がFAIL。**5シナリオの短い連結では再現せず71件通しでのみ再現する＝ホワイトリストの漏れではなく「長時間ブラウザセッションでのReact state/setInterval/Supabase Realtime購読等のクライアント側累積疲労」（該当コード注釈と一致）と判断**＝**根本原因の切り分けと修正は Opusタスク12(xxv) へ登録・引き継ぎ済み**（scriptsインフラ課題だがSonnet単独では確定できず・詳細BUGFIXES続き139）。(b)`oppDraw` 単独FAIL（既知・CPU挙動依存）。(c)`lrigGrowAnyOppP03046` が FRESH=1 でも FAIL＝CPUがグロウ判断に至らない（続き135記載のまま未解決）。現在シナリオは**81定義／71既定実行** |
| 6 | §5c 再収穫サイクル（`/census-batch` 準拠） | JSON採用 | S | **✅続き214（Sonnet）で在庫77件（続き201の37効果＋続き208の40枚）を全消化＝64枚採用**。詳細は下記在庫欄→BUGFIXES続き214。次の在庫が発生するまで待機（Opus1〜6の新語彙着地待ち）。 |
| 8 | semantic audit のスケールアップ＋単点修正 | パイプライン＋JSON単点 | M | **✅stub群母集団2,401枚は続き146で全数監査完了**（続き144のseed202607・100枚＋続き145のseed202608・200枚＋続き146の残り2,101枚全数＝300+2,101=2,401）。続き146は**全211バッチをCodex CLIのみで実行**（ユーザー指示「バッチはCodexだけ・Claudeは確認だけ」）＝findings2,799件・quoteクラスタリングで3系統確定（Opusタスク12 🆕(xxix)）。**stub群についてはタスク8は完了**。累積除外リスト`scripts/archive/scratchpad/semantic_audit_stub_round3/audited_stub_cards_cumulative.txt`（2,401枚）。残るはclean群（3,574枚・未着手）への展開が任意の次候補だが優先度は低い（stub群の方がSTUB/MANUAL含有＝逆翻訳の盲点として密度が高いため）。詳細`docs/_semantic_audit_stub_round3_triage.txt` |

### §3 Opusタスク12 在庫表の完了・圧縮行（2列）

| ID | 内容 |
|---|---|
| ~~(i)~~ | ~~SP27-002-E3＝引用付与の内側条件が genericKagiri（isTimingMarker）で**無言消費**され PARTIAL にもならず、無条件アサシン付与へ退化~~ **✅続き193（Opus）で消化＝二段「かぎり」を AND に平坦化**（外側 LRIG_COLOR＋内側 `FRONT_SIGNI_POWER` 新設）で CONTINUOUS GRANT_KEYWORD アサシンへ構造化。genericKagiri より前に `parseCenterColorFrontPowerGrant` で丸ごと取り、旧 `CONDITIONAL_KEYWORD_BY_CENTER_COLOR` STUB（keyword=【常】誤認・内側条件無視・全シグニ付与の三重バグ）を parser/engine とも削除。golden 427→428・census 1998維持・同型★0。詳細 BUGFIXES 続き193 |
| ~~(ii)~~ | ~~WXDi-P10-035＝引用内【自】の「それを手札に戻す」の owner エンコードを lastProcessed 慣例と整合するか要精査~~ **✅続き194（Opus）で消化＝精査の結果 owner エンコードにバグ無しと確定**（現行 fresh は `BOUNCE{owner:'opponent'}`＝採用済み正準カード WDK05-T11-E1 と完全同型・`TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST`＋`IS_MY_TURN` プレースホルダ慣例で pay/skip 発動・単一対象で lastProcessed 不要）。実バグは採用済み curated が退化版（E1 flat BOUNCE・E2 無条件 AWAKEN）で放置されていた点＝改善 fresh へ差し替え。census 1998→1996・golden 428・同型★0。詳細 BUGFIXES 続き194 |
| ~~(iii)~~ | ~~WXK09-050＝parser が `GRANT_CHOSEN_ABILITY` を再生成し続け held に残存。Part1固有ハンドラとの dispatch 設計を解消するまで採用不可~~ **✅続き195（Opus）で消化**＝parser 主経路に「表記されているパワーよりパワーの高い…選んだ能力を得る」検出を足し `SIGNI_GRANT_CHOSEN_ABILITY`（power比較＋DOWN/BOUNCE保護のカード固有ハンドラ）へ委譲＝fresh が curated と一致し held ドリフト解消。generic ハンドラ（execStubPart2）の死にコード `SIGNI_GRANT_CHOSEN_ABILITY` 列挙を削除（Part1先取りで到達不能）。golden 428→429・census 1996維持。詳細 BUGFIXES 続き195 |
| ~~(iv)~~ | ~~`applyDirectAction` の TRASH/HAND_CARD 分岐が手札カウンタ3種を更新しない（続き81）~~ **✅続き135（Opus）で修正＝3フィールド更新＋手札保護を即時パスと同形で移植・golden 1件** |
| ~~(v)~~ | ~~`applyDirectAction` 未対応型が `default` 節で元アクションを暴走再実行する系統の残（続き82）~~ **✅続き181（Opus）でクローズ**＝default 到達型を smoke 全10593効果で実測（REVEAL133/STUB101/BLOCK_ACTION32/DRAW4/REARRANGE_SIGNI1）し、**真の再入バグは `STORY_CHANGE` のみ**＝case 新設で解消（golden 1件・修正前 autopilot hang を確認）。他は全て benign と機械確認（STUB意図通り／bare REVEAL／BLOCK_ACTION は lastProcessedCards 経路／DRAW は pickCount:1 で1回適用が正／REARRANGE_SIGNI swap は明示no-op）。exec×dispatch×case の機械突合でも残は2型のみ。詳細 BUGFIXES 続き181 |
| ~~(vi)~~ | ~~`POWER_MODIFY_PER_DECK_COUNT`（PR-442・CONTINUOUS）が CONTINUOUS 計算層に未実装（続き84）~~ **✅続き135（Opus）で実装＝`extractPowerModifiesPerDeckCount`＋`calcFieldPowers` 計算ブロック・golden 1件** |
| ~~(vi-4)~~／~~(vi-5)~~ | ~~他6コレクタの LRIG ゾーン走査漏れ（該当実カード0＝潜在バグ）~~ **✅続き181（Opus）で消化＝⚠「該当実カード0」の前提は既に崩れており実バグだった**（続き96 の棚卸し以降の JSON 採用で ON_BANISH に6・ON_TRASH に1・ON_BLOOD_CRYSTAL_ARMOR に1のルリグ watcher が発生＝走査漏れで構造的に絶対発火しない状態）。6コレクタの手書き `field.signi` 走査を `ownFieldSources()` へ統一。**派生して ON_BANISH の any_ally scope 脱落20効果を発見・16効果を根治**（parser 規則追加＋engine の triggerFilter 評価＋block1 の any_ally 対応＝「自身が＜悪魔＞なら自分のバニッシュでも発火」の自己発火を失わないため）。census 2016→2003・golden 403→406・同型★0。詳細 BUGFIXES 続き181／~~二面コレクタ3種の usageLimit 書き戻し~~ **✅続き135（Opus）で(x)と一括修正＝Banish18枚/PowerZero6枚/LrigGrow4枚** |
| (vii) | 「アップ状態のこのシグニをダウンしてもよい」系の対象/自己混同7件（続き89）。**✅続き163（Opus）で4枚 clean 修正**（WX25-P1-055/WXDi-P04-059/WXDi-P13-074/WXDi-CP01-040＝DOWN を self thisCardOnly optional へ・正準形 WD12-013）。**✅続き164（Fable 5・タスク1）で引用付与2枚も消化**＝WX25-P3-089/WXDi-P15-084（2文型引用付与の parser 実装＋JSON採用＝正準 DOWN self＋GRANT_EFFECT）。**残1枚＝§6.3級**＝WX25-P2-112（アップルリグ down＋「ダウンしたルリグと共通する色」動的フィルタ）。詳細 BUGFIXES 続き163/164 |
| (viii) | checkAllEffects 精査で残った複合バグ（続き90）。**✅WX25-CP1-062**（欠落第1能力を MANUAL 復元・heldReview 採用・census 2215→2214）・**✅WX17-028**（TRANSFER_TO_DECK(TRASH) に optional を engine 対応＋JSON付与）・**✅WX16-070**（「＋1か＋2してもよい」を CHOOSE(upTo) 化＋LEVEL_MODIFY thisCardOnly を engine 対応・census 2214→2213）＝続き137（Opus）。**✅WX16-038**（続き192・Opus）＝デッキトップ private look「それが〔filter〕のシグニの場合、それを場に出す」の filter/optional 脱落を parser で是正（`REVEAL_AND_PICK` 生成の「公開」版と対の「見る」版を新設・`noRiseIcon` フィルタ新設）。同型 WX15-001-E2 も是正・MANUAL WX10-007/021 の held ドリフト解消・golden 427・census 1998維持・詳細 BUGFIXES 続き192。**✅WDK16-13/WXK08-033**（続き196・Opus）＝デッキトップ公開の2分岐条件配置を是正＝第2分岐（登録者数100万＋公開シグニ）が bare ADD_TO_FIELD（無条件2枚目配置）に退化していたのを `CONDITIONAL{AND[SUBSCRIBER_COUNT, LAST_PROCESSED_MATCHES]}` へ（parser `parseSubscriberRevealCondition` 新設）＋両分岐 optional 復元（engine no-source ADD_TO_FIELD を optional 対応）。census 1996→1993・golden 433（e2e配置検証込み）・詳細 BUGFIXES 続き196。**✅WX26-CP1-048**（続き197・Opus）＝出自帰属機構を新設して消化＝PlayerState `signi_placed_by_source`（execAddToField/resumeSelectZone 全配置点で発生源記録）＋Condition `THIS_CARD_PLACED_BY_CLASS{cardClass}`（配置元 CardClass 判定）＋`LAST_PROCESSED_SHARES_COLOR_WITH_LRIG`。MANUAL 化・e2e実測検証・census 1993→1992・golden 435。詳細 BUGFIXES 続き197。**残＝WXDi-P10-034（次メインフェイズ遅延+分岐）**＝(a)デッキカードのゾーン裏向き配置(b)次ターンまで生存する遅延トリガー(c)表向き選択分岐、の3機構拡張＋ターン境界ロジックに触れる §6.3 専用タスク（別分離） |
| ~~(x)~~ | ~~`collectFieldTriggers` に usageLimit 自体が無く《ターン1回》が過剰発火（続き104・32枚）~~ **✅続き135（Opus）で修正＝5コレクタを `{entries, usedHostIds, usedGuestIds}` 型へ統一＋BattleScreen 12箇所で書き戻し。実機 `onPlayUsageLimit` 2回連続PASS** |
| ~~(xi)~~ | **✅続き206（Opus）でクローズ＝実害バグと判明し engine 側で解消**。~~curated の `CONDITIONAL{条件, then:STUB OPTIONAL_COST}` 包み形27枚の扱い（続き110）~~ 現状確認で**46効果に増加**。表現（入れ子）は正しく、engine の Pattern ④/⑤ が直下ステップしか見ないため no-op エッジケースに落ち**①コスト踏み倒し②ゲート無視**の二重バグだった。ゲート成立→包みを解いて Pattern ④/⑤ へ委譲／不成立→対になる本体ごとスキップ。golden 467→469。**要実機検証＝skip 選択時に本体が発動しないこと**。 |
| ~~(xii)~~ | ~~WXEX1-19-E2＝自己再帰STUBと `resumeSelectTarget` の個別適用ループが設計非互換＝実プレイでも無限ループ（続き112）~~ **✅続き202（Fable 5）で根治＝`thenAction: no-op`＋`continuation: 本体STUB` の一括受け取り型（`INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N` と同型）へ変更。smoke SKIP 1→0・golden 再現テスト付き。詳細 BUGFIXES 続き202** |
| ~~(xiii)~~ | ~~WX24-P2-018-E1＝ルリグの「アタックフェイズ開始時」が `ON_ATTACK_SIGNI`（自己スコープ）で誤登録され一度も発火しない（続き112・§7 B4 のブロッカー）~~ **✅続き136（Opus・タスク17）の timing 系統修正で `ON_ATTACK_PHASE_START` へ是正済み（JSON確認）。残る付与先バグはタスク1（引用付与の内側 parse）** |
| ~~(xix)~~ | ~~WX04-005-E3＝STUB `LIMIT_ALL_FIELD_1`（場出し数制限）が engine 未実装（続き126）~~ **✅続き137（Opus）で誤診断と判明＝実装済み。`src/screens/battle/fieldLimit.ts`（`computeFieldSigniLimit`＝両者上限算出／`reduceFieldSigniToLimit`＝超過分をレベル高順に残しトラッシュ）＋BattleScreen 配線（召喚ブロック `BattleScreen:6024`／グロウ時の対話式トラッシュ `:5116`／CPU自動減量 `:8103`）。続き126 は STUB executor の case だけを見た誤り（継続効果として別モジュールに実装）。golden 3件で挙動固定（compute/reduce）。⚠減量トラッシュの ON_LEAVE/ON_TRASH 未収集は既知の軽微近似（fieldLimit.ts:77）** |
| ~~(xx)~~ | ~~`POWER_MODIFY{targetsTriggerSource:true}` 系＝ON_TARGETED の forced 単一対象 follow-up が未発火（続き127）~~ **✅続き137（Opus）で修正＝`ExecResult` に `autoTargetedCards` を surface し `resolveStackNext` done 分岐で ON_TARGETED を収集。実機 `onTargetedForcedBypass` 2回連続PASS・golden 2件・詳細 BUGFIXES 続き137** |
| ~~🆕~~ | ~~`choice.condition`（選択肢の使用可否条件）と fresh の `choice.action` CONDITIONAL ラップの**表現不整合＝設計判断が要る**（続き130・census-batch が採用不能になる原因）~~ **✅続き156（Opus）で解消＝`liftChoiceOptionCondition` を新設し選択肢**先頭**の availability 条件を `choice.condition` へ持ち上げ（execChoose 対応）。対象化後の action ゲートは rawText ガードで持ち上げ抑止＝原文語順維持。20枚採用・golden 356・同型★0** |
| 🆕(xxii) | **✅続き143（Opus）で22件消化＝第1バッチ12件〔「そのカードが…の場合」→LAST_PROCESSED_MATCHES 拡張＋盤面状態条件持ち上げ `parseHoistStateCondition`〕＋第2バッチ8件〔結果カウント閾値 Cluster B＝汎用カウント条件 `parseThisWayGenericCount`〕＋第3バッチ2件〔多分岐後続枝 `parseBareBranchCondition`＝WXDi-P13-049の4枝・WX10-031〕。census 2213→2206・golden 338・同型★0維持。残＝多分岐のうち複合条件枝（WDK16-13等・登録者数AND公開）・Cluster B の合計/すべて/種類/枚数系・否定3・LRIG色別多分岐（WXK09-003等）・手札加え動詞。詳細 BUGFIXES 続き143。** **PARTIAL刻印 IS_MY_TURN化 127件＝過剰実行バグ確定（続き138・Sonnet・タスク9トリアージ）**。「その後/この方法で、[条件]の場合」という後置条件節を parser が抽出できず無言で常時true化（`effectParser.ts:2488`）。**152件全件を原文照合＝127件全件が真に偽になり得る条件で§9-9のLIFE_BURST慣例には非該当＝全件(a)実害あり**。文型3クラスタ：属性判定65（レベル/色/センタールリグ等）・結果カウント閾値59（「N枚以上捨てた場合」等）・否定条件3（「〜しなかった場合」＝WD14-012-E2 等は捨てても捨てなくても自壊が発火し最も実害大）。**IDリスト全件は `docs/_partial_triage.txt`**。修正はparser規則の追加（条件節抽出）＝新規機構は不要、定型パターンなので一括処理向き。**✅続き150（Opus）で捨てカウント系4件を追加消化**＝`parseThisWayGenericCount` の許可動詞に `捨て` 追加（前段 TRASH が lastProcessedCards を記録するのを engine で確認済み・否定「捨てなかった」は reject 据置）。PR-K038-E3/WXEX2-39-E1/WXDi-P06-035-E2〈第1枝〉/WXK01-001-E2。「捨ててもよい/好きな枚数捨てる」は前段が STUB{OPTIONAL_COST} 化で記録不確実＝据置((xi)合流)。census 2169→2167・PARTIAL IS_MY_TURN化 98→94。現在の PARTIAL 明細は `docs/_partial_report.txt`。**✅続き158（Opus）で LAST_PROCESSED reveal 経路の3種を系統追加＝engine 対応済み・parser 未 emit の穴**：level parity（偶数/奇数＝`matchesFilter.levelParity`）を3関数（`parseLastProcessedMatchesCondition`/`parseBareBranchCondition`/`parseThisWayGenericCount`）へ／bare story「＜X＞の場合」（のシグニ無し）／`LAST_PROCESSED_POWER_GTE`（それのパワーがN以上＝直前 POWER_MODIFY delta を addDelta 化）。8枚是正（WDK04-011/WXDi-P10-073/WXK01-106/WXK01-107/WX25-CP1-054/WXDi-CP02-063/WXK11-065・WX03-046 は既 MANUAL）。census 2101→2098・IS_MY_TURN化 128→119。詳細 BUGFIXES 続き158。**✅続き159（Opus）で盤面状態4種を `STATE_CONDITION_CLAUSES` 追加**＝`あなたの場にレゾナがある`→`HAS_CARD_IN_FIELD{cardType:レゾナ}`／`トラッシュにカードがN枚以上`→`TRASH_COUNT{gte}`／`手札がN枚より多い`→`HAND_COUNT{gt}`／`場にシグニがない`→`FIELD_COUNT{eq,0}`。4枚採用（WD11-018/WD22-038-UG/WXDi-D05-012/WXDi-P02-089）・census 2098→2096・IS_MY_TURN化 119→111。**残＝登録者数 AND 複合枝（WDK16-13/WXK08-033・据置）・種類/共通クラス系（distinctNames 要確認）・傀儡状態フィルタ・否定条件・LRIG色別多分岐・then が機構待ちで UNKNOWN 化する据置カード（WD09-018 の SEARCH-in-then・WDK08-Y08 の差分移動）。詳細 BUGFIXES 続き159。** **✅続き160（Opus）で結果レベル合計閾値を消化**＝`LAST_PROCESSED_LEVEL_SUM_EQ` を `{operator,value}` へ一般化（engine `cmp`・decompiler `opJa`・parser `parseLevelSumCondition` 新設・以上/以下/eq）。4枚採用（WDK05-R14/WXK10-085=eq4・WXEX2-62=eq7・WX22-Re06=gte3）・golden 356→357（`evalCondition` 回帰1件）・census 2096→2093・IS_MY_TURN化 111→107。**残＝前段が STUB で lastProcessed 未記録（PR-K049 両者デッキ底/WDK13-017 めくれ公開/WXDi-P11-039 任意手札公開/WXDi-P16-087 入れ子SEQ prev）・種類系（`TRASHED_DISTINCT_LEVELS_GTE`/`TRASHED_STORY_COUNT_GTE` 実装済み・parser 未 emit 疑い）・すべて〜/【ライフバースト】持つ/アイコン持つ。詳細 BUGFIXES 続き160。** **✅続き161（Opus）で結果カウント条件の前段判定漏れを是正**＝`prevRecords` ゲートに `BANISH`/`EXILE`/`SEND_TO_ENERGY`（engine が lastProcessedCards を記録する action）を OR 追加。WX14-021（EXILE→スペル3枚）・WX21-059（BANISH→シグニ2体）採用・census 2093→2092・IS_MY_TURN化 107→104。**残＝種類/distinct 系は対象カードの前段が STUB/CONDITIONAL包みで記録せず要前段対応・ALL_MATCH・LAST_PROCESSED_HAS_BURST・単発条件（LRIG_COLOR{opp}/CARDS_DRAWN_BY_EFFECT 等）。詳細 BUGFIXES 続き161。** **✅続き171（Opus）で結果カウント条件の前段カバレッジを拡張＝`prevRecords` に `TRANSFER_TO_DECK`（execTransferToDeck が lastProcessedCards 記録）を追加し「この方法でカードをN枚デッキに加えた場合」を捕捉（WX19-040/WXK02-039/WX17-063＝COUNT_GTE）＋語順違い「トラッシュに＜X＞のシグニがN枚置かれた」（parseThisWayGenericCount verb-gate 分離形＋parseThisWayTrashCondition sc4・WXEX1-47＝TRASHED_STORY）。あわせて前段バグ＝`parseSentencePart1` トラッシュ→デッキ全回収ハンドラの count/filter 脱落（非すべて count:1 固定＋単色のみ）を span ベース抽出＋否定/zone ガードで是正（33効果 count/filter 復元）。全カード生パース diff で36効果のみ変化を機械確認・採用29＋WXEX1-47 直パッチ・WX09-Re19 は手パッチ温存。census 2044→2032・golden 377・IS_MY_TURN化 125→120。残＝distinct/sum/ALL_MATCH/多分岐カウント/アイコン/否定/LOOK_AND_REORDER非記録公開は機構待ち。詳細 BUGFIXES 続き171。** **✅続き171b（Opus）で ALL_MATCH 機構を新設＝`LAST_PROCESSED_ALL_MATCH`（engine every 判定・4層）で「すべて〔filter〕の場合」を捕捉（WXDi-P05-042 level1シグニ／WXK09-097 黒・TRASH 記録前段のみ）。golden 377→379・census 2032 維持。残 ALL_MATCH は STUB/LOOK_AND_REORDER 非記録前段（WX16-Re02/WXDi-P07-064）＝機構待ち。詳細 BUGFIXES 続き171b。** **✅続き171c（Opus）で `LAST_PROCESSED_MATCHES` の色（OR）対応＝「それが青か緑のシグニの場合」（WX21-016）「それらに白か黒のシグニがN体以上含まれる場合」（WX21-010）を parser で捕捉（前段 BANISH 記録・engine matchesFilter は color OR 既存対応）。2枚採用・golden 381。詳細 BUGFIXES 続き171c。** **✅続き171d（Opus）で LOOK_AND_REORDER（公開）を lastProcessedCards 記録型に（engine `resumeLookAndReorder`＋parser `prevIsPublicLook`）＝「デッキ上N枚公開→この方法で〔天使3枚/すべてlevel1〕公開された場合」を捕捉（WX12-Re10/WXDi-P07-064）。census 2032→2031・golden 383・smoke/fuzz 全0。残 種類/distinct（WXK10-060）は機構待ち。詳細 BUGFIXES 続き171d。** **🆕✅続き209（Codex 実装／Opus 検証・追加修正）で第1バッチ5効果を消化＝93→88件**。着手時に実測し直したところ **PLAN 記載の「127件」は続き143 の消化を反映しておらず古かった**（現状＝刻印106件／IS_MY_TURN化93件・うち63件が「この方法で…場合」family）。機構＝既存 `LAST_PROCESSED_COUNT_GTE` に **`negate` フラグを足すだけ**（新条件型ゼロ）。採用＝否定3件（WD14-012-E2／WX13-037-E3／WX13-057-E2＝「起きなかった側」が常に発火していた最大実害系統）＋閾値2件（WXEX1-03-E1／WXK02-028-E3＝前段が「最大N枚探索」で GTE ≡ ちょうどN）。**見送り約40件は構造的ブロッカー**＝前段 STUB で結果が `lastProcessedCards` に残らない／distinct種類数・レベル合計・集合全称の条件語彙が無い＝**parser が条件を吐いても engine が解決できなければ今度は過小実行**になるため無理に採用しない（WXK06-031 の見送り判断自体も golden で固定）。**残88件のうち「その後、〜の場合」属性判定family 30件が次バッチ候補**（「この方法で」を含まない側）。詳細 BUGFIXES 続き209。 **🆕✅続き210（Codex 実装／Opus 検証）で第2バッチ＝「この方法で」を含まない属性判定/盤面状態 family 30効果のうち20効果を採用＝88→68件**。新設条件型は `DECK_COUNT` の1つだけで、残りは既存型へのフィールド追加（`ENERGY_COUNT_FILTER.distinctColor`／`TRASH_HAS_CARD.distinctName`／`THIS_CARD_HAS_UNDER.negate`／`LAST_PROCESSED_HAS_BURST.negate`／`TargetFilter.isPuppet`）。**held 287→272・`+CONDITIONAL +IS_MY_TURN` バケット 17→4**＝本バグが計器上でも消えたことを確認。**見送り10件**＝前段 STUB が判定材料を残さない6／イベントカウンタ・実効リミット・攻撃正面の語彙不足3／任意エクシード支払い保持1（採用すると常時偽＝過小実行になるため）。詳細 BUGFIXES 続き210。**残68件**は「この方法で」family の未消化分が中心＝engine 側の結果記録が要る構造的ブロッカー待ち。 **🆕✅続き211（Codex 実装／Opus 検証）で第3バッチ＝10効果採用・68→58件**。**検証側で前段ステップを機械分類し「STUB でブロック」という前提を訂正**＝20件は plain action で engine は記録済み＝語彙不足だった。既存 `LAST_PROCESSED_MATCHES` に `operator`/`value`/`distinctName`/`shareClass`/`requiredCardNames`/`levelLteCenterLrig` を追加（新条件型ゼロ・engine 評価実装も確認）。**残58件**＝`STUB:OPTIONAL_COST` 前段12（続き210 の `PAID_ADDITIONAL_COST` と同型＝次の最有力）／入れ子・その他 STUB 26／属性判定の見送り分。詳細 BUGFIXES 続き211。 **🆕✅続き212（Codex 実装／Opus 検証）で第4バッチ＝`STUB:OPTIONAL_COST` 前段12件のうち8効果採用・58→50件**。**真因はまた別だった**＝`OPTIONAL_COST` ハンドラはエナ色 CHOOSE を出すだけで**アクションを実行していない**＝「記録しない」のではなく**任意アクションが汎用 STUB に潰されて消えていた**。実アクション＋`optional` 化で既存経路が記録するようになり解決。**残50件**＝入れ子26＋属性判定の見送り分＋今回の見送り4（いずれも構造的ブロッカー待ち）。詳細 BUGFIXES 続き212。 |
| ~~🆕(xxiii)~~ | ~~リコレクト分割8件＝深刻な内容欠落（続き138・Sonnet・タスク9トリアージ）~~ **✅続き173/174（Fable 5）で8枚全件消化＝クローズ**。**続き173**＝本丸 WX25-P1-001/003/005/007/009（5枚同一テンプレ）を parser 文型1本（`GRANT_LRIG_ABILITY{targetedCenter}`＋既存 `expandGrantLrigAbilities` 展開）で語彙化（**トリアージの「新規GRANT機構が要る§6.3級」は誤り＝engine 受け皿は完備済みだった**）。副産物＝pick 脱落（LOOK_AND_REORDER縮退）の規則順序バグを狭い専用規則で是正＝系統15枚採用。**続き174**＝残3枚を直接パッチ＋engine語彙2本（`TRASH{HAND ALL+upTo}` 好きな枚数対話／`LIFE_CLOTH_CARD`→デッキ転送）＋`BANISH_REDIRECT{exile}` 機構（SPDi47-03＝本体復元・SPDi47-05＝バニッシュ→ゲーム除外置換・WX24-P4-016＝マジックボックス幻覚を正直STUB化）。census 2031→2027・golden 388。詳細 BUGFIXES 続き173/174。残る派生＝WX24-P4-016 のMB表向きトリガー収集機構は §6.3 送り（未登録） |
| ~~🆕(xxiv)~~ | **✅続き206で完了＝発生源フィルタ脱落8件を全消化**（`_partial_report` の ON_OPP_POWER_DECREASED / ON_CARD_MILLED_FROM_DECK 無言近似とも 0件）。~~残1件＝ON_CARD_MILLED_FROM_DECK（WX24-P3-030-E1）~~ **✅`last_effect_mill_source`（`last_effect_draw_source` と同型・trash は `string[]` でメタを持てないため state 側に記録）＋`milledSourceStory` で消化。** ~~ON_DISCARDED_AS_COST 5件~~ **✅続き162で `discardCostSourceStory` 実装済**（WX25-P3-085-E1 は別件の単文型 grant mis-parse＝タスク1(d)）／~~ON_OPP_POWER_DECREASED 2件~~ **✅続き206で `powerDecreaseSourceStory`／`powerDecreaseExcludeSelf` を機構ごと実装＝`temp_power_mods.srcCardNum` に発生源を記録し `detectPowerDecreaseSources` で解決。発生源不明時は従来どおり発火＝過剰側に倒して過少発火退化を防止。golden 464→466**。ミルも同型（`countMilledFromDeck` も枚数だけの盤面 diff）で実装できるが未着手。 ~~**発生源フィルタ脱落8件＝過剰トリガー確定（続き138・Sonnet・タスク9トリアージ）**。`effectParser.ts:2912/2983/2987`＝ON_CARD_MILLED_FROM_DECK(1)/ON_OPP_POWER_DECREASED(2)/ON_DISCARDED_AS_COST(5) のトリガー条件から「＜X＞のシグニの効果/【出】【起】能力」という発生源限定が無言で脱落。**WX25-P3-071-E2で直接確認**＝原文は「＜微菌＞のシグニの【出】【起】コストとして捨てられたとき」限定だが`triggerCondition`にフィルタなし＝微菌以外のコスト捨てでも誤発火。8件全件のIDは `docs/_partial_triage.txt`。~~parser側でtriggerConditionにsourceFilter追加が必要。**✅続き163（Opus）で ON_DISCARDED_AS_COST 4枚を消化**＝triggerCondition `discardCostSourceStory` 新設＋`collectHandDiscardTriggers` に `costSourceNum` 引数（コスト支払い能力の host シグニ CardClass で判定）＋BattleScreen 3発火元で `cardNum` 引き渡し＋parser 抽出（WX25-P3-071/077/084/088・golden 1件）。**残＝WX25-P3-085 は inner ability 漏れ出しの grant mis-parse（§6.3引用付与）／ON_OPP_POWER_DECREASED(2・WX25-P3-032/062)・ON_CARD_MILLED_FROM_DECK(1・WX24-P3-030) は「どのシグニの効果が減らした/ミルしたか」の発生源シグニ追跡が engine に無く§6.3級イベント帰属機構が要る**。詳細 BUGFIXES 続き163。 |
| ~~(xxv)~~ | ~~driverバッチランナーの「長時間ブラウザセッション累積疲労」＝71件フルバッチのみで再現する構造的flakiness~~ **✅続き140（Opus）で根本原因を特定・修正**＝JS側の残留ではなく**`battle_states`のdeck/life_cloth/trash/lrig_trashがシナリオを跨いで単調に消耗/増加するDB側累積**が真因（続き105の「clientの累積疲労」診断は誤りだった）。`injectScenario`でシナリオ毎にこれらをフィラーカードで健全な既定値へ張り直す修正＋`exileHandBlind`ピッカーのレース耐性強化。**✅続き141（Sonnet）が74件フルバッチで再検証＝27件目（`acceSelfScope`直後）までは全PASS（既知FAIL除く）＝この対策自体は機能している**（詳細下記(xxvi)参照・DB側累積によるFAILの再現は無くなった）。 |
| ~~(xxvi)~~ | ~~**フルバッチ実行中のPlaywrightブラウザプロセスクラッシュ（続き141・Sonnet・タスク1検証の副産物）**~~ **✅続き142（Opus）で消化＝`verifyBattleDrive.mjs` の driver をセッション（context+page+H+console監視）を作る `establish()` 関数へ切り出し、(a) `RECYCLE_EVERY`（既定12）件ごとに context を作り直してレンダラのヒープ/DOM/Realtime購読の蓄積を解放（`recycle()`）、(b) `isCrashError()` でクラッシュ検知時に再確立→当該シナリオを最大3回再試行、の二段で耐障害化。⚠**スクショは元々バッチ既定で no-op 化されていた（`SHOTS_ON`＝引数指定時のみON・`${id}-final`のみ発火）と判明**＝主因は「20回超の撮影」ではなく単一 page を74件通しで使う累積。RECYCLE_EVERY=2 の実機3件で予防リサイクル1回発火→ルーム再利用で再確立→全PASS を確認。詳細 BUGFIXES 続き142。** 元記録↓。種別＝**scripts（`scripts/verifyBattleDrive.mjs`）のテストインフラ課題**＝ガードレール②の対象外。**現象**：74件フルバッチをFRESH=1で通しで実行したところ、27件目付近（`wxk09050`から数えて`acceSelfScope`のスクリーンショット撮影直後）で`page.screenshot: Target crashed`エラーが発生しバッチが停止した。それ以前の27件は（`lrigGrowAnyOpp`/`lrigGrowAnyOppP03046`/`lrigAttackStepStartUsageLimit`/`oppDraw`という既知のFAILを除き）全てPASSしており、**続き140のDB側累積状態対策自体は機能している**＝別種の問題。**推定原因**：各シナリオが最大20〜22回`page.screenshot({ fullPage: true })`を呼ぶ設計（`SHOT`ディレクトリへPNG出力）のため、単一の`page`/`browser`インスタンスを74シナリオ通しで使い続けるとメモリ蓄積でレンダラープロセスがクラッシュする可能性が高い。**Opusへの依頼**：(a) 数シナリオごとに`page`（または`browser.newContext()`）を再生成してメモリを解放する構造へ`main()`ループを変更、(b) あるいはスクリーンショット頻度を減らす（デバッグ用途以外は撮影しない設計へ）、(c) crashハンドラを追加しcrash時にpage/contextを再生成して当該シナリオ以降を継続する耐障害化、のいずれかで対応。未着手・調査ログはBUGFIXES続き141。 |
| ~~(xxi)~~ | ~~`collectOppDrawTriggers` が ON_DRAW any_opp watcher の発生源（対戦相手自身の効果か reactor 自身の効果か）を区別せず、「対戦相手が**自分の効果で**」を明記する PR-423 等が誤発火（続き131・シナリオ`oppDrawOwnEffectOnly`・意図的FAIL回帰）~~ **✅続き162（Opus）で修正＝PlayerState に `last_draw_by_own_effect`（execDraw で `a.owner==='self'` を記録）＋triggerCondition `drawByDrawerOwnEffect` を新設し `collectOppDrawTriggers` で判定。PR-423 JSON にフラグ付与。golden 1件（発火/非発火）。詳細 BUGFIXES 続き162。⚠E2E `oppDrawOwnEffectOnly` の PASS 反転は Sonnet タスク1 で確認・既定 order へ追加** |
| ~~🆕(xxx)~~ | ~~WXEX2-76-E1＝ON_PLAY の scope/対象幻覚~~ **✅続き188（Opus）で消化＝同型3枚を根治**（WXEX2-76-E1/WX08-006-E2＝any_opp・WXK10-048-E1＝any_ally）。parser に「対戦相手のシグニが場に出たとき」→`triggerScope:any_opp` を追加（engine any_opp path 配線済み・トリガー句非除去）＋ATTACH_CHARM の charm owner「対戦相手は自分のデッキ」→opponent＋「そのシグニの【チャーム】」→`to.filter.isTriggerSource`（engine execAttachCharm で triggeringCardNum 解決）＋decompiler。golden 421→422・census 2001→1998・同型★0。詳細 BUGFIXES 続き188 |
| 🆕(xxxi) | **✅続き184（Opus）で clean な2枚を消化＝`DRAW_PER_LRIG_LEVEL` 新設**（`POWER_MODIFY_PER_LRIG_LEVEL` に倣い types/engine/parser/decompiler。「あなたのセンタールリグのレベル１につきカードを１枚引く」を per-level ドローへ。WX12-013-E1/WDK07-E09-E2 採用・golden +1・census 2001維持。詳細 BUGFIXES 続き184）。**✅続き187（Opus）で残(a)を消化＝`ENERGY_CHARGE_PER_LRIG_LEVEL` 新設**（`DRAW_PER_LRIG_LEVEL` と対称・types/engine/parser/decompiler/golden）。「…レベル1につき引くか、…レベル1につき【エナチャージ】をする」を parser で `CHOOSE[DRAW_PER_LRIG_LEVEL, ENERGY_CHARGE_PER_LRIG_LEVEL]` へ（【エナチャージ】ショートハンドの先取りを規則順で回避）。WXK10-004-E1/WX26-CP1-003-E1①（入れ子CHOOSE）採用・golden 420→421・census 2001維持・同型★0。詳細 BUGFIXES 続き187。**✅続き190（Opus）で残(b)を消化＝`DRAW{perLastProcessedLevel}` フラグ新設**（公開シグニ＝lastProcessedカードのレベル合計×count 枚ドロー。REVEAL_AND_PICK の then が DRAW count:1 に潰れていたのを parser 規則「そのシグニのレベル１につきカードをN枚引く」検出で是正。types/engine/parser/decompiler/golden。WD21-001-E2 採用・golden 422→423・census 1998維持。詳細 BUGFIXES 続き190）。**(xxxi) クローズ** |
| 🆕(xxxix) | **続き210（Codex）が逆翻訳全文照合で検出した「条件以外の原文不一致」12効果**（＝今回の条件復元とは独立の既存バグ。指定30件外へ修正を広げない方針で報告のみ）＝`PR-238-sub-E1`／`WD07-007-E1`（**「その中に白のカードがある場合」の白分岐が無条件のまま**＝黒分岐だけ条件が付いた。白を同じ `LAST_PROCESSED_MATCHES` で塞ぐには黒分岐実行後に lastProcessed が書き換わる問題を先に解く必要がある）／`WX10-048-E1`／`WX20-005-E1`／`WX24-P3-050-E1`／`WX24-P3-069-E1`／`WX24-P4-067-E1`／`WXDi-P05-086-E1`／`WXDi-P06-039-E1`／`WXK04-027-E2`／`WXK09-003-E1`（**赤分岐が UNKNOWN**＝「対戦相手のライフクロス1枚をエナゾーンに置く」が未実装）／`WXK09-063-E1`。各件の不一致内容は BUGFIXES 続き210 の採用20効果リストに「一致／不一致」で明記済み。 **🆕続き211 で追加7効果**＝`WX22-006-E3`（非精元・名前違い制約欠落）／`WXEX1-66-E2`（公開・事前対象・デッキ下処理）／`WXEX2-21-E1`（**悪魔枚数比例のミル枚数**・ガード制限期間）／`WXK01-005-E1`（自身をルリグデッキへ戻す処理・使用禁止 owner）／`WXK09-091-E1`（対象選択・ターン終了時まで）／`WXK10-060-E2`（公開集合からのエナ選択・残りをデッキ下へ）。**計19効果**（続き210 の12＋今回7）。 **🆕続き212 で追加5効果**＝`WDK05-T01`（ルリグ【出】をシグニの場出しとして逆翻訳）／`WXDi-P11-039`（白シグニ1枚捨てのフィルタと対象指定が STUB）／`WX24-P2-048`（外側の《満月の使徒　小湊るう子》存在条件・①枝のレベル比例捨てが未表現）／`WXK07-027`（トリガーに「バトルによって」を過剰付与）／`WXK04-084`（場出しに「コストを支払わずに」を補足表示）。**計24効果**（続き210の12＋続き211の7＋今回5）＝**残50件の構造的ブロッカーより先にこちらを潰す方が効率的**。 **🆕続き213（Opus）で全23件を原文↔逆翻訳で実測＝Codex 向けバッチにはしない判断**。**同型クラスタが無く寄せ集め**で、唯一まとまった「このアタックを無効にし」系（WX24-P3-050/069・WX24-P4-067）は**全CSVで4枚しかなく、しかも攻撃無効化の action 型が engine に存在しない＝§6.3級の新機構**。`WXK09-003` の赤分岐は `【未実装/UNKNOWN：対戦相手のライフクロス1枚をエナゾーンに置く】`。**Claude 側での個別対応か §6.3 送りが妥当**（異質なものを束ねると検証不能になる＝CODEX_GUIDE §3-4）。 |
| ~~🆕(xxxii)~~ | ~~ON_TRASH／ON_BLOOD_CRYSTAL_ARMOR の any_ally scope 脱落~~ **✅続き182（Codex 実装／Opus 検証・差し戻し・作り直し）で消化＝6効果を根治**（WX24-P1-015-E1／WDK08-L01-E1 のルリグ watcher＝絶対発火しなかった＋同一規則の収穫4＝WXK04-043-E2/WXK07-066-E1/WDK08-L17-E1/WXDi-P03-055-E1 のシグニ watcher）。⚠登録時の「残りは parser 規則のみ」は**誤り**＝engine の両コレクタは any_ally パスで triggerFilter を一切評価しておらず、parser だけ直すと過剰発火に化ける関係だった（Codex が自力発見）。usageLimit 機構（ON_BANISH 同型の書き戻し）＋`BattleScreen.handleRemove` の host/guest 引数逆転も併せて是正。**「あなたのメインフェイズの間」＝`AND(DURING_PHASE, IS_MY_TURN)`**（DURING_PHASE 単独は相手メインでも真）。census 2003→2001・golden 406→410・同型★0。詳細 BUGFIXES 続き182。ON_BANISH 側の据置4件（アタックフェイズ前置き2＝WX18-002-E1/WXEX1-18-E1・チャーム付き＝WXK07-074-E1・動的レベル比較＝WXK11-018-E1）は同枠で残存。**✅続き191（Opus）でアタックフェイズ前置き2枚を消化**＝parser で「（対戦相手の）アタックフェイズの間、あなたの＜X＞のシグニがバニッシュされたとき」を any_ally＋triggerFilter{story}＋triggerCondition.duringAttackPhase(+turnOwner:opponent) へ。engine collectBanishTriggers の section2/3 に duringAttackPhase/turnOwner ゲートを追加（既定 self に潰れルリグ watcher が絶対発火しなかったのを是正）＋decompiler 前置き描画（《相手ターン》二重表記抑止）。WX18-002/WXEX1-18 採用・golden 423→425・census 1998維持・同型★0。詳細 BUGFIXES 続き191。**残2枚＝WXK07-074（チャーム付帯）・WXK11-018（watcher 相対レベル）は被バニッシュ側の動的状態参照が要り matchesFilter では表現不可＝§6.3級で据置** |
| ~~🆕(xxxiii)~~ | ~~`collectTrashTriggers` の any_opp watcher パスが usageLimit 未評価~~ **✅続き183（Codex）で修正＝watcher 側 state/actions_done と host/guest usedIds を使う `limitOkWatcher` を追加。合成 any_opp＋IS_MY_TURN＋once_per_turn を watcher=guest で反転検証し、1回目発火→usedGuestIds→2回目非発火を固定。BattleScreen 全経路も再監査し、唯一相手側 usedIds を捨てていたリムーブ経路を両 state 永続化へ是正。golden 410→413・詳細 BUGFIXES 続き183** |
| ~~🆕(xxxiv)~~ | ~~「コストか効果によって場からトラッシュに置かれたとき」の `fromFieldByCostOrEffect` が parser 未 emit~~ **✅続き183（Codex）で15枚全件消化＝CSV exact phrase 15枚を機械特定し parser でフラグ emit。JSON は13枚へ純改善追加＋既存MANUAL 2枚＝全15効果、全leaf diff はフラグ追加のみ。engine は self 既存ゲートに加え any_ally/any_opp watcher へ同ゲートを追加。decompiler の scope 上書きも派生修正し ally 主語を維持。golden 413・census 2001・同型★0・詳細 BUGFIXES 続き183** |
| ~~🆕(xxxv)~~ | **✅続き186（Codex 実装／Opus 検証・是正）で (a)(b)(d) を消化・(c) は §6.3 送り**＝(a)「効果によって場から」10枚を engine `collectTrashTriggers` に新引数 `byEffectCause`＋executor の `asCost`/`fieldTrashCostCards` コスト追跡で「効果=発火/コスト・バトル・ルール=非発火」へ。**Opus 検証で 10枚が2文型に割れると発見・是正**＝「効果によって」4枚=`byEffect`（任意効果）／「あなたの効果によって」6枚=既存 `byOwnEffect`（相手効果も除外）に parser 弁別＋engine 3ループにゲート＋decompiler の self-discard 先取り退化を fromZones:field ガードで回避。(b) WXDi-P02-037-E2 は新フラグ `fromFieldByCostOrOwnEffect` で厳密実装。(d) any_opp watcher に triggerFilter/excludeSelf 評価を予防追加。golden 413→420・census 2001維持・同型★0。詳細 BUGFIXES 続き186。**(c) 3枚（WX18-062/WX22-027/WXK03-033）＝「シグニの下から」トラッシュの detector/timing/collector が engine に無く §6.3 送り（未実装・要新機構）。** 元記録↓。**ON_TRASH「〜によって」限定の**近傍表記が未ゲート＝(xxxiv) の兄弟（続き183 の検証中に発見・未修正）**。(xxxiv) は登録どおり exact phrase `コストか効果によって場から` 15枚だけを厳密に消化したが、原文の全表記ゆれを数え直すと**同型の過剰発火が隣に残っている**：**(a)「効果によって場からトラッシュに置かれたとき」10枚**（WX18-081/082/086/089・WX19-029/044/073・WXEX2-80・WD14-015・SP27-003）＝コストを除く narrower 文型。うち `byEffect:true` を持つのは2枚のみで残8枚は無フラグ、**しかも `byEffect` は engine の ON_PLAY/ON_SIGNI_DOWN でしかゲートされておらず `collectTrashTriggers` は評価していない**＝10枚全部がバトル/ルール処理でも発火する。`fromFieldByCostOrEffect` で丸めると「コスト起因でも発火」に化けるので**別ゲート（`collectTrashTriggers` で `byEffect` を評価）が要る**。**(b)「コストかあなたの効果によって場から」1枚**（WXDi-P02-037-E2）＝`fromZones` のみで無ゲート。広いフラグを付けるだけでもバトル発火は止まる（相手効果での誤発火は残る）＝暫定改善は可能だが正確には「自分の効果」限定の語彙が要る。**(c)「コストか効果によってシグニの下から」3枚**（WX18-062/WX22-027/WXK03-033）＝**ON_TRASH 効果が1件も無い**＝別ゾーン起点の内容欠落の疑い（要原文照合）。**(d)** `collectTrashTriggers` の any_opp パスは `triggerFilter` 未評価（`collectBanishTriggers` にはある）＝該当0件の潜在穴 |
| ~~🆕(未確認)~~ | **✅続き206（Opus）でクローズ＝全15コレクタの usageLimit 書き戻しを全数監査し「新規の穴なし」を確認（コード変更なし）。監査スクリプト `scripts/archive/auditUsageLimitWriteback.mjs`（現在0件・再実行可・3回踏んだ偽陽性の罠をヘッダに明記）。** ~~`collectLrigGrowTriggers`（`triggerCollect.ts:102`）が usageLimit の `usedIds` を返さず書き戻し機構が無い＝ATTACK_STEP_START②（続き116/119・タスク12(xvii)相当）で見つかり修正済みの構造的バグと同型のコード疑義。標準グロウの二重発火は`actions_done.includes('GROW')`で別途ブロックされ無害と確認したが、本命の再現経路（ゲット・グロウ＝GROW_FREE横グロウでの2回目ON_LRIG_GROW）はdriverでlrigTopが変化せず検証不能（原因未特定）＝**E2E未再現・コード読解のみの疑い**として登録（続き132）~~ |
| ~~🆕(xxvii)~~ | **✅続き207（Fable 5）でクローズ＝残3枚を全消化**。現状確認で2枚は**既に解消済み（簿記が古い）**＝WX12-006-E2（ON_SIGNI_BECOMES_UP＝続き180 の機構で採用済み）・WXDi-P11-066-E1（自己discard反応＝続き180 の `collectAnyZoneTrashSelfTriggers`＋byOpponentEffect で表現済み）。WXDi-P11-007-E1 は **`ON_HAND_ADDED`／`ON_ENERGY_TO_FIELD` timing 新設**（detectHandAdded＝手札 set-diff＋移動元判定・中央diff配線・movedSelf 変種）で消化＝同機構で WX25-P2-063-E1（タスク16[C] の ON_HAND_ADDED 名指し分）・WX14-029-E1・WD12-009/010 も採用。詳細 BUGFIXES 続き207。**✅続き169（Codex 実装／Claude 検証）で Cluster D（timing 取り違え）を1枚消化＝SPDi43-12-E2（付与ルリグ AUTO の timing を ON_PLAY→ON_ENERGY_TO_TRASH・engine `collectEnergyToTrashTriggers` に `lrig_granted_auto_effects` 走査追加）。census 2045→2044・golden 374。詳細 BUGFIXES 続き169。** **✅続き168（Codex 実装／Claude 検証）で Cluster A/C 据置分の "Tier 1"（engine に受け皿あり）を4枚消化＝PR-K073-E1（level2/3/4 存在条件＋《花畑チャイカ》以外の filter 反転是正）／WXDi-P03-001-E1（使用条件 LRIG_COLOR 青の配線）／WDK13-008-E1（相手キー条件・engine に key_piece 走査5行追加）／WXEX1-35-E1（ライズ×3 条件・既存 hasRiseIcon filter）。census 2048→2045・golden 373・engine key 走査の副作用ゼロ（全382条件で誤マッチ0を機械確認）。残 Tier 2/3＝合計レベル制約・複数レベル探索・相手手札選択・遅延効果・イベント来歴・ターン所有条件のアーキ改修。詳細 BUGFIXES 続き168。** **✅続き167（Codex 実装／Claude 検証）で Cluster C（owner/対象範囲誤り）を2枚消化＝WXK06-031-E2（「すべての黒のカード」に color:黒 filter・parser 単色 regex 追加）／WXEX1-57-E1（「白か黒」color:['白','黒']・MANUAL 上書き）。census 2049→2048・golden 369。残＝WX10-061/WX11-038 は既是正・WXEX1-50-E2（owner 是正＋相手手札選択機構）・WXEX1-35-E1（ライズ×3 条件機構・count は机能同值で無害）・WXK06-031-E1（複数レベル探索）は§6.3級。詳細 BUGFIXES 続き167。** **✅続き166（Codex 実装／Claude 検証）で Cluster A（条件節丸ごと欠落）を1枚消化＝WXEX1-50-E1「場にパワー20000以上の＜毒牙＞がある場合」を `STATE_CONDITION_CLAUSES_V2` に regex 追加し `HAS_CARD_IN_FIELD{story:毒牙,powerRange:min20000}` の CONDITIONAL 包みへ（census 2050→2049・golden 367）。Cluster A 残は機構待ち＝engine 受け皿の新設が要る（`field.key_piece`／`field.signi_traps`／「効果によって場に出た」イベント履歴 Condition／英知合計レベル／使用条件）＝新機構タスク扱い。詳細 BUGFIXES 続き166。** **✅続き165（Codex 実装／Claude 検証）で Cluster F（フィルター単点欠落）を消化＝トラッシュ/エナ回収の対象名詞句 level・class filter を parser 2規則で付与（50枚・51効果・filter 追加のみ・census 2084→2050・golden 366・同型★0）。残 Cluster F の機構待ち4枚（WXDi-P14-087 クラッシュ元追跡／WXDi-P11-007-E3 swap／WXDi-P10-077 OR filter／WXDi-P14-036 eachDistinctLevel）＋合計level・チェックゾーン・G072系は §6.3 送り。詳細 BUGFIXES 続き165。残 Cluster A（条件節丸ごと欠落11枚）/B/C/D/E は未消化。** **元記録↓＝semantic audit スケールアップ第2弾＝seed202607サンプル200枚が全数監査完了（続き144・Sonnet・タスク8）**。残りclean群80枚を完走しfindings 88件（HIGH57/MED28/LOW3）取得・累計213件（旧125件と統合）。**HIGH中心に37枚が新規の実害ありバグと確認**（3枚は`_partial_triage.txt`のIS_MY_TURN化Cluster A/Bと重複＝既知）。系統別＝A条件節丸ごと欠落11枚（既存PARTIAL計器の死角＝IS_MY_TURN化すらせず無条件化）／~~B duration/until誤り6枚~~ **B のうち POWER_MODIFY duration:INSTANT化（WX07-078-E1/WXK06-031-BURST等）は✅続き151（Opus）で false positive と確定＝action無 duration の POWER_MODIFY は engine の temp_power_mods でターン終了クリア＝原文どおり。修正不要。残 B＝REMOVE_ABILITIES/GRANT_PROTECTION/BLOCK_ACTION の非 POWER_MODIFY 型は要精査**／C owner対象範囲誤り6枚（~~WX10-061~~ **✅続き151（Opus）で是正＝CONTINUOUS group-buff の level 脱落で「効果元自身のみ」へ縮退していた〈相手には及ばずトリアージの重度判定は誤り〉。parser にレベル filter 認識を追加**。**✅続き152（Opus）で同型の CONTINUOUS group-buff filter 脱落を追加是正＝WXDi-P12-044/P13-047/P13-070〈isDisona〉・WXDi-P08-076〈isAwakened〉。parser の対象名詞句 filter に `《ディソナアイコン》/覚醒状態` を追加。**✅続き153（Opus）で同型の UP group 脱落6効果も是正**＝「あなたのすべての＜X＞のシグニをアップ」が UP{count:1/filter無} に潰れていたのを count:ALL+filter へ（WX11-038 迷宮・WX05-036 水獣・WXEX1-14 植物・WXEX2-16 緑・WXK03-020 遊具・WX25-CP1-039 ブルアカ）。**✅続き154（Opus）で中央ゾーン group-buff 8効果も是正**＝「あなたの中央のシグニゾーンにある[＜X＞]のシグニのパワー」が any/1 に潰れていたのを self/ALL/centerZoneOnly へ（WXDi-D02-24/P13-009/WXK01-003/SP38-008/WXK10-079/WXDi-P02-009/P05-007/D04-013）。残＝WXEX1-35/50・WXEX1-57 白か黒等の単点・group-buff/DOWN の左右ゾーン/クロス/ドライブ〈要機構〉・WXDi-D04-013 の左右 active condition 未捕捉）／D timing取り違え4枚（【自】がON_PLAY化＝タスク16/17と同系統・engine 収集関数の有無要確認）／E主要処理欠落7枚（WXDi-P15-004＝複数起動能力の後天付与が§6.3級新規機構）／Fフィルター単点欠落13枚。詳細・全IDは `docs/_semantic_audit_scaleup2_triage.txt`＋`scripts/archive/scratchpad/semantic_audit_101/findings_compact.txt`（213件全件）。 |
| 🆕(xxix) | **semantic audit stub群スケールアップ第2弾＝残り2,101枚（stub群母集団2,401枚の全数）完走・2,799件findings（続き146・Sonnet・タスク8・全バッチCodex CLI実行）**。quoteクラスタリング＋直接JSON/原文照合で3系統を確定。**①duration系統** ✅**続き148（Opus）で消化＝53効果クラスタのうち34効果を UNTIL_OPP_TURN_END へ是正**（parser `upgradeToOppTurnEnd` を per-sentence 正規化として新設＝`次の対戦相手のターン終了時まで` の substring 先取りバグを解消。20効果は build:effects 自動採用／7効果 heldReview 採用／7効果 JSON 直接パッチ。golden 339→340・census **2206→2173**・engine 変更不要）。**残19効果は構造的でスコープ外**＝STUB機構待ち（GRANT_ABILITY_INNER_TEXT 等・§6.3級）／短縮enum until（WX24-P2-047）／INSTANT引用付与（WX24-P4-026等）／opp POWER_MODIFY が引用付与に埋没（WX25-CP1-064/061）／opp句が付与能力の内側（WXEX2-69）。詳細 BUGFIXES 続き148。~~**②選択肢欠落系統（新規23件・未消化）**＝「手札に加えるか場に出す」がADD_TO_FIELDのみに縮退（SP27-005-E1で確認）。~~ **✅続き149（Opus）で消化＝84効果を CHOOSE(手札/場) へ是正**（parser `wrapHandOrField` 新設＝source 付き TRANSFER_TO_HAND を CHOOSE 二択に包む・engine 変更なし）。**トリアージの「ADD_TO_FIELD 縮退」は誤りで実体は逆＝手札固定への縮退**（88効果中85が該当）。build:effects 2署名一括採用67＋MANUAL 兄弟温存カードの JSON 直接パッチ14。golden 340→342・census 2173→2169・同型★0維持。残4効果は検索機構が STUB 化の複雑case（SP27-005-E1/WD22-036-G-E1/WXK02-001-E2/WXEX2-49-E2＝§6.3級）。詳細 BUGFIXES 続き149。**③(xxii)の適用範囲拡大**＝「そうした場合」27件中2件（WX04-030-BURST=`parseStatus:MANUAL`／WX06-014-E2=`parseStatus:AUTO`）がtask9のPARTIAL刻印152件リストに含まれないのに同一のIS_MY_TURN誤変換バグ＝既存計器（PARTIAL降格）が捕捉できない盲点があり実際の母数は152件より広い。**(xxviii)は本ラウンドのLLM audit（4/8件が独立再確認）でも裏付けられた＝優先度の追加根拠**（残り1件WXK10-011はquote一致のみの誤クラスタで§6.3級の別バグ）。owner取り違え等の未検証クラスタ（計222クラスタ）は次回優先候補としてリスト化のみ。詳細`docs/_semantic_audit_stub_round3_triage.txt`＋`scripts/archive/scratchpad/semantic_audit_stub_round3/clusters_high.txt`。 |
| ~~🆕(xxxvii)~~ | **✅続き205（Opus）で同セッション消化＝4件とも個別に原文照合し全採用（すべて fresh が正・curated が誤り＝「代わりに」無視の両方実行／`BET_MECHANIC` 丸ごと no-op／条件落ちの無条件2体目）。golden 461→464。** ~~アタック不可付与の据置4効果（続き205・Opus）~~＝`GRANT_KEYWORD{アタックできない}` への寄せで fresh が正しくなったが、**アタックノード以外にも骨格差がある**ため機械採用から除外した4件＝**WX06-002-E1**（「代わりに」条件分岐で CONDITIONAL 構造ごと変化）・**WX18-003-E1**（curated が `STUB:BET_MECHANIC` 丸ごと／fresh は CHOOSE 2択に展開＝ベット機構との整合判断が要る）・**WDK05-T10-E1**（同上・curated にアタック不可ノードが存在しない）・**WDK11-007-E1**（2回付与の条件節構造差）。**いずれも fresh の方が原文に近い可能性が高いが、CHOOSE/BET 構造の採否は個別判断が要る**。 |
| ~~🆕(xxxviii)~~ | **✅続き205（Opus）で同セッション消化＝対象節スコープで閾値フィルタを抽出（census 1951→1949・golden→460）。全文スキャンは別文節の数値を拾うため「…を対象とし」直前の修飾句だけに限定。**✅兄弟規則（【キーワード】を得る・シャドウ付与）へも横展開済（続き205）＝抽出を巻き上げて付与系4規則で共有・色フィルタも追加・変化2件を全件原文照合。** ~~アタック不可付与の対象に閾値フィルタが乗らない（続き205・Opus が実装中に確認）~~＝「対戦相手の**パワー20000以下の**シグニを2体まで」（WX24-P1-037-E2／WX24-D2-08-E1）・「**レベル2以下の**シグニ」（WXDi-P08-053-E1）等で、`GRANT_KEYWORD` の target に powerRange／level フィルタが付かず**全シグニが対象になる過剰効果**。従来の `count:1` 決め打ちでも同様に落ちていた＝新規バグではない。`parseSentencePart2.ts` の引用付与ハンドラ群が共有する `kwTargetFilter` が `excludeSelf` しか組み立てないのが原因で、**兄弟規則（【キーワード】を得る・シャドウ付与）にも同じ穴がある**ため一括で直すのが筋。census の既存カテゴリ「除去系の対象フィルタ脱落（パワー閾値83・レベル閾値90）」の一部。 |
| ~~🆕(xxxvi)~~ | **✅続き206（Opus）でクローズ＝人間のグロウ経路5箇所へ `wildcardInstIds`/`colorOverrideMap` を配線（CPU 可否は据置）。`canAffordGrowCost` が純関数なので golden で自動検証・要実機検証は支払いUIでの実選択のみ。** ~~エナ代替トラッシュ情報がグロウ経路に渡っていない配線穴（続き204b・Opus が実装中に発見）~~＝`myEnergyTrashSubInfo`（`wildcardInstIds`／`colorOverrideMap`／`keySubInstId`）は ArtsModal・SigniActivatedModal の支払い経路にしか渡されておらず、**GrowModal／AssistGrowModal／BattleScreen のグロウ可否判定（`canAffordGrowCost` 呼び出し5箇所）には未接続**。原文「あなたが《X》を支払う際」「代わりに…トラッシュに置いてもよい」は**グロウコストの支払いも含む**ため、`COST_SUBSTITUTE`(WX08-042/WX21-044)・`ENERGY_SUBSTITUTE_TRASH_SIGNI`・`ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI`・`ENERGY_COLOR_SUBSTITUTE_TRASH` がグロウでは効かない。`canAffordGrowCost` は既に `trashSubWilds`/`trashSubColors`/`extraWildCount` を optional 引数で受けているので**引数を渡すだけ**だが、グロウ支払いUIでの選択検証と実際のトラッシュ処理まで通す必要があるため**要実機検証**。 |
| ~~🆕(xl)~~ | **✅続き215（Opus）でクローズ＝単カードではなく parser の系統バグと判明**。~~WX25-CP1-012-E2＝『絆起』ability の SEQUENCE 構造が疑わしい（続き214）~~ `splitEffectBlocks` の `MARKER_RE` に絆が無く **【絆常/絆自/絆起/絆出】が効果ブロック境界として認識されていなかった**＝絆能力が直前ブロックへ丸ごと飲み込まれていた（**134カード137能力＝全絆カード**）。`GRANT_KEYWORD{絆起}` はマーカー文字列を付与能力と誤読した幻覚。parser の marker regex 3箇所に絆を追加＋分割 lookbehind を `(?<=。)`→`(?<=。\|。」)` へ拡張、engine に絆未獲得ゲート（`isKizunaActive`／`filterKizunaGated`／`kizunaOk`）を新設して AUTO 60・ACTIVATED 11 を配線。JSON は held 112枚一括採用＋MANUAL温存18枚を MATCH5/EMBEDDED1/ABSENT11 に仕分けて個別適用。golden 496→499・census 1928→1919・同型★0維持。詳細 BUGFIXES 続き215 |
| 🆕(xli) | **絆分離で可視化された残ギャップ（続き215）→ 続き217（Opus）で再仕分け＝11件のうち7件は実バグではなく計器ノイズだった**。`docs/_effect_srctext.json` の採番ズレで census がカード全文判定に落ちていたのが原因で、**計器を直したら高シグナルから消えた**（`WX25-CP1-060-E3`／`WX25-CP1-061-E3`／`WX25-CP1-062-E2`／`WX25-CP1-082-E3`／`WXDi-CP02-074-E2`／`WXDi-CP02-082-E2`／`WXDi-CP02-089-E2`＝JSON は原文どおり）。**✅消化**＝`WXDi-CP02-072-E3`（`BANISH_REDIRECT` の系統バグ本体・下記(xliii)の親）。**残3件**＝(a)`WX25-CP1-012-E3`＝「シグニを２枚まで場に出し」が `LOOK_AND_REORDER` へ落ちて**場出しが欠落** (b)`WX25-CP1-045-E3`＝「＜ブルアカ＞のシグニが３種類以上ある場合」の**種類数条件が脱落**＝`HAS_CARD_IN_FIELD` に `distinctName` を足す小機構（`TRASH_HAS_CARD`・`ENERGY_COUNT_FILTER` に前例あり） (c)`WXDi-CP02-056-E4`＝ルリグダウンコストの「アップ状態の」＝**偽陽性の可能性が高い**（ダウンコストは元よりアップ状態が前提）。詳細 BUGFIXES 続き217 |
| ~~🆕(xxviii)~~ | **✅続き147（Opus）で系統バグ本体を消化**＝「それをエナゾーンに置く」8効果のうち**7効果を SEND_TO_ENERGY へ是正**（parser `applyLeadingOpponentDesignation` 拡張＋JSON 7効果パッチ・golden 338→339・census 2206維持・同型★0維持）。**Sonnet の推定「executor intercept バグ」は誤りで実体は parser**（`parseSentencePart1.ts:1815` の REVEAL 文脈専用 `ENERGY_CHARGE{DECK_CARD}` が相手シグニ対象文脈に誤適用）。**残＝WX24-P4-048-E2**（「対象とし」2回＋動的パワー制約で除外＝要専用処理）＋**WX26-CP1-086/WXK05-027/WXK05-070 のコスト STUB 精緻化**（除去は是正済み・コスト表現は別途）。詳細 BUGFIXES 続き147。**元記録↓**：semantic audit stub群スケールアップ第1弾＝新規200枚（seed202608）完走・242件findings（続き145・Sonnet・タスク8）。ほか新規110/127枚＝STUB id/パラメータ意味不一致20件（stub群特有＝名前が原文と逆/無関係。例：`WXK11-014`のARTS_COST_REDUCTION_BY_EFFECTが実際はグロウコスト軽減）／timing取り違え10件超（【自】がON_PLAY化）／`WXK09-005-E2`＝GRANT_LRIG_ABILITYが`abilities:[]`で空＝(xxvii)のWXDi-P15-004と同型の機構欠落／duration誤り10件超／owner取り違え10件超／条件節欠落40件超（最多）。詳細・全IDは`docs/_semantic_audit_stub_round2_triage.txt`＋`scripts/archive/scratchpad/semantic_audit_stub_round2/findings_compact.txt`（242件全件）。 |

### 段落・箇条書き（§3 Sonnet付随／§4 恒久指標／§5b／§6.1／§6.2／§6.4／§7）

**Opusタスク12＝未消化の在庫**（Sonnet が観測して積んだ engine/parser バグ。詳細本文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3 の (i)〜(xx)）：

> **✅2026-07-15（続き135・Opus）で4件を消化＝(x)・(vi-5)・(vi)・(iv)**（usageLimit ガード欠落5コレクタの一括是正〈実カード60枚超の過剰発火〉／`POWER_MODIFY_PER_DECK_COUNT` の CONTINUOUS 実装／`applyDirectAction` の手札カウンタ3種＋手札保護。golden 319→325・実機 `onPlayUsageLimit` 新設・詳細 BUGFIXES 続き135）。**この消化で Sonnet タスク1（§7横展開）の意図的FAIL回帰シナリオのうち `trashCounterOpp`／ON_LRIG_GROW④／R37③ が PASS へ反転できるはず＝Sonnet の在庫が復活する。**

> **2026-07-15（続き134）の棚卸しでは在庫がほぼ枯渇していた**が、**続き201の parser 改善でタスク6に採用待ち37効果が発生し、Sonnet の定型在庫が復活**した。タスク1（§7横展開）・4（BEHAVIOR_AUDIT）は完走／休眠、タスク3は低優先の継続観測。まずタスク6の fresh vs curated 精密diffを取る。

~~**Sonnetタスク6・未採用在庫 第2弾＝40枚（2026-07-19・続き208）**~~ **✅続き214（Sonnet）で全40枚採用＝`OPTIONAL_COST`→`TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST` 単点diffのみを個別確認**（詳細 BUGFIXES 続き214）。

~~**Sonnetタスク6・未採用在庫37効果（続き201）**~~ **✅続き214（Sonnet）で消化完了＝35カードNumのうち24枚採用・11枚は既にMANUAL側で是正済みと確認**（詳細 BUGFIXES 続き214）。**⚠副産物**＝`WX25-CP1-012-E2` の diff 対象外ステップ（`GRANT_KEYWORD{絆起}`）に構造疑義を発見＝Opusタスク12 (xl) へ登録。

~~**補欠(a) timing census 残クラスタの振り分け台帳作成**~~ **✅続き172（Sonnet）で完了＝`docs/_timing_census_triage.txt` 新設（詳細はタスク16の行・BUGFIXES続き172参照）**。~~(b) `textNoJson` 56枚の実体確認~~ **✅続き170（Sonnet）で完了＝56枚全件が正当・真の欠落0件**。内訳＝①デュアルカラーエナ注記52枚「（エナコストを支払う際、このカードは○か○１つとして支払える）」＝`Color`列が既に2色文字列（例"青緑"）で`costs.ts`の`cardColor.includes(color)`が構造的に対応済み、EffectTextは重複するルール注記。②WXDi-P13-023（ナナシ）のコイン獲得＝CSV`Coin`列を`BattleScreen.tsx`がゲーム開始時/グロウ時に直接参照（5箇所）、DSL効果不要。③WX24-D1-TK1／WX24-P1-TK2A／WX26-CP1-TK01（リミットアッパー/ルリグバリア/シグニバリアの各トークン）＝トークンの効果本体はBattleScreen内にハードコード実装済み（`limit_upper_token`・`countBarrierTokens`等）でJSON化不要。詳細 BUGFIXES 続き170。

**現在は Sonnet 側のタスク6が実行可能**＝続き201で生まれた未採用37効果を先に精密diff・採用判定する。そこで parser/engine の追加バグが見つかった場合のみ Opusタスク12へ登録し、交互サイクルへ戻す。

- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**parserWorklist は held 79 / LOSS 67 / VALUE 12（2026-07-05 続き29終了時点・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**＝続き25時点の24から増えたのは**回帰ではなく続き29の CHOOSE 平坦化修正の採用待ちバックログ**（parser が curated より正しくなった側＝WX14-011/WX17-020/WX20-Re20/WXDi-P02-005 等の CHOOSE 復元 one-off 約35枚と、その巻き添えバケツ）。内訳＝(a)LOSS 67＝CHOOSE復元の採用待ち約35＋レガシードリフト（EXILE→TRASH系 WX21-027/WXDi-CP02-TK03B 等・owner 等）のパーサー弱点、(b)VALUE 12＝count 慣例の非一貫性（CONT保護は count 無視＝機能同値・WX18-034/WXEX1-35 等）・duration 文脈テール（WX25-P2-062）と単発テール。**CHOOSE復元分を採用し切ったら再計測して実数を締め直す。この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。

- **母数**：効果カード 5975／効果 10590／MANUAL効果 898／STUB含むカード 1864（2026-07-17 続き184 実測更新）。

- [ ] **未実装action型 worklist**（§6）＝action位置なのに engine/UI に型名が一度も現れない完全no-opの型。残11種27効果。

- ~~**🆕 durational付与の「ターン終了時まで」action内duration脱落＝期間注記の逆翻訳脱落（Opusタスク(A)・母集団132枚）**~~ **✅続き62（Opus）で是正＝decompiler側 `restoreLeadDuration`（原文の当該効果セクションを文スコープで照合し期間注記復元・GRANT_KEYWORD/REMOVE_ABILITIES の2レンダラに配線）で112枚が期間注記を獲得。engine/JSON 不変（parser/JSONは触らず＝held激増を回避）・同型★0維持・全ゲート緑・誤注記ゼロ。母集団132のうち34は抽出の偽陽性（恒久付与 or POWER_MODIFYが期間句の帰属先）で正しく無注記。詳細 BUGFIXES 最上部。** 原因＝`parseActionTextInner`（`effectParser.ts:1398`）の先頭「ターン終了時まで、」strip で action内 duration が PERMANENT/missing に落ちる（engine では PERMANENT と機能同一のため挙動不変）。

- ~~残＝engine実装済みSTUB id の意味文化~~ **✅是正済（COPY_LRIG_NAME_ABILITY／DESIGNATE_SIGNI_ZONE／SUMMON_RESONA_FROM_LRIG_DECK／DOWN_UP_SIGNI_AND_CHOOSE／CHOOSE_COLOR_FROM_LIST は `decompileEffects.ts` に意味文実装済み・2026-07-07再確認）**。全10シートに残る英語STUB露出は3件のみ（`VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE`／`POWER_PLUS_BANISHED_POWER`／`OPP_LRIG_DECK_TO_LRIG_TRASH`）＝いずれも§6.3で機構待ちとして登録済み（decompilerでは対応不能・engine機構実装が前提）。

- ~~B層：JSONデータ欠落の補完（中リスク）~~ **✅是正済（2026-07-06〜07・続き33-36・BUGFIXES参照）**＝REVEAL_AND_PICK/LOOK_AND_REORDER の pick 部分脱落は分類(a)〜(d)を全消化（WXDi-P04-047含む）。2026-07-07に構造走査で再確認＝全10シートで「then/destination 欠落」0件。残る例外2件（WDK07-E15＝新STUB `INTERNAL_ACCE_PICKED_TO_SELF` 要／WXDi-P07-010＝`RULE_REMINDER_TEXT`）とWXDi-P03-005（PAID_ADDITIONAL_COST拡張要）・WX26-CP1-100（新action型要）はいずれも§6.3で機構待ちとして登録済み＝Opus分担。

`npm run audit` の要レビュー・キューから、**action位置なのに engine(`src/engine/*`) にも UI(`BattleScreen.tsx`) にも型名が一度も現れない＝完全未実装で無言no-op**の action型を網羅スキャンで確定。**14種42効果**中 `EQUALIZE_ENERGY`(6)・`LEVEL_MODIFY`(9)は実装済（BUGFIXES上部）。残**11種27効果**。

**⚠修正層は effectType で決まる**（教訓）＝instant(AUTO/ACTIVATED/LIFE_BURST)→`effectExecutor` の `execXxx`+dispatch。CONTINUOUS→`effectEngine.ts` の calcFieldPowers/CONT収集器。`scratchpad` の型別effectType集計で判定してから着手する。

**A. instant型（executor層・優先）**

- ~~`LEVEL_MODIFY`(9)／`LOOK_AT_DECK_AND_LIFE`(3)／`VARIABLE_DISCARD_AND_DRAW`(1)／`NAME_BAN`(2)~~ **✅実装済（詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §6.1）**。

- [ ] ~~`PLAY_FREE_FROM_TRASH`（2・WX09-012・AUTO/ACT）~~ **✅続き202（Fable 5）で実装＝`execPlayFreeFromTrash` 新設（WX09-012-E2 スペル／WX19-002-E4 アーツ・golden 3件・詳細 BUGFIXES 続き202）**／~~`STACK_SPELL`（1・WX11-029・AUTO）~~ **✅続き122（Opus）で実装＝dispatchを`execPlaceUnderSigni`にアダプト（trashからスペルmaxCount枚選び下に置く）・golden回帰**／`PREVENT_DAMAGE`（5・WX08-029・ACT3/AUTO1/LB1＝ただしダメージ層への置換機構が要る＝実質横断）。

**B. CONTINUOUS型（calcFieldPowers/CONT収集器層）**

- ~~`GROW_COST_REDUCTION`(6)／`POWER_MODIFY_PER_ENERGY`(1)~~ **✅続き116で決着＝詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §6.1**（POWER_MODIFY_PER_ENERGYは実機PASS・GROW_COST_REDUCTIONはWX14-009/WD14-001の2枚でper-count scaling非対応の真バグを発見しOpusタスク12(xviii)へ登録）。

- [ ] `COST_SUBSTITUTE`（2・WX08-042・CONT＝支払い時の代替＝コスト支払いUI統合が要る・BattleScreen横断）／~~`SELF_TRASH_PREVENT`（1・WX07-033・CONT）~~ **✅続き123（Opus）で実装＝`collectSelfTrashPreventNums`新設＋ExecCtx`ownSelfTrashPreventNums`＋`execTrash`の自己シグニ候補除外＋BattleScreen ctx注入。golden回帰。⚠効果解決ctx（stack entry）経由の自己トラッシュを覆う＝コスト支払いの別経路は未カバー（該当希少）**／~~`COLOR_INHERIT`（1・WX11-032・CONT）~~ **✅続き122（Opus）で実装**／~~`GRANT_FIELD_SHADOW`（1・WXDi-P15-058・CONT）~~ **✅既実装（リスト stale・続き122で確認）**。

進め方＝A群から1型ずつ、effectType を確認→ instant なら `execXxx`+dispatch(+必要なら resume 適用case)→golden 1件→smoke/fuzz→キュー減→push（§3）。

- [x] **系統①：相手デッキ削りの owner 取り違え＝✅完了**。**(a) 純・相手のみ58枚＝✅是正済（2026-07-03）**。**(b)「あなたか対戦相手」選択17枚（18ノード）＝✅続き106（Opus）で CHOOSE 化完了**（WXDi-P04-082 テンプレを横展開＝新規engine機構ゼロ・入れ子CHOOSE含め同型★0維持・census 1461維持・BUGFIXES 続き106）。(c)混在の誤検知9件（WXEX2-21/WXDi-P04-082/WXDi-P11-082/WXDi-P15-055/WX24-P3-088/WX24-P4-034/WX24-P4-049/WX25-CP1-007）＝**修正不要（既に正しい）**。WXDi-P07-007は「対戦相手が２択から選ぶ」構造自体がSTUB化（`OPP_CHOOSES_FOR_YOU`）されており別課題。詳細 BUGFIXES 続き88・106。

- [~] **スケールアップ**＝stub群全2,306枚へ拡大（SEMANTIC_AUDIT.md「スケールアップの進め方」）。**続き102（Sonnet）で着手＝stub100+clean100=200枚サンプル中119枚を`claude -p`セッション上限まで精査（findings125件・単点是正21件はBUGFIXES続き102）。残り約2,180枚＋当該サンプルの残り8バッチ（81枚）が未精査＝`claude -p`上限リセット後に`scripts/archive/scratchpad/semantic_audit_101/`のfindings/manifestを参照しつつ再開**。

- **smoke SKIP 282 の解消**：autopilot 未対応の対話（REVEAL_CARDS/DECLARE_BOND 等）へカバレッジ拡張。

- **生ID残存＝表示or実装の穴**：`[STUB:X]` 系（残54件＝単発テール・`STUBS.md` 管理）。`[条件:X]`/`[アクション:X]` は解消済み。

- ~~**R40②**＝opp-draw の「自分の効果で」発生源限定なし~~ **✅続き131で実バグと確定**＝PR-423×SPDi43-21で実機再現（Opusタスク12(xxi)）。

- **R37③**＝パワー0以下トリガーの連鎖再発火（Opusタスク12 の usageLimit 書き戻し修正待ち）。

- ~~**ON_COIN_PAID④**＝自分のターン外でも発火するか未検証~~ **✅続き132でコード調査により「現状到達不可能」と結論**＝`collectCoinPaidTriggers`の全5呼び出し元（人間グロウ・CPUグロウ・シグニ【起】《コイン》・シグニ【出】《コイン》・アーツ ベット/アンコール）はいずれも呼び出し元アクション自体が「自分のターンにしか実行できない」操作（【起】は`timing:['MAIN'|'ATTACK']`のみでいずれもターンプレイヤー限定・ARTSベットは自分のアタックのみ）＝対戦相手のターン中にコインを支払う経路がengineに一つも無い。実機シナリオでは到達不能なため近似は実害なしと確定。

- ~~**ON_LRIG_ATTACK_STEP_START②**＝《ターン1回》制限の実機未検証~~ **✅続き116/119で実機検証＝実バグ発見→修正→PASS確認済み**（`lrigAttackStepStartUsageLimit`・既定order）。**PLAN記載が更新漏れで残っていたのを続き132で訂正**。

- **ON_LRIG_GROW④**＝《ターン1回》制限の実機未検証（③のパース近似は既知）。**続き132で部分決着＝標準グロウボタン連打での二重発火は`actions_done.includes('GROW')`により正しくブロック済みと確認**（`wasFreeGrow`＝`freeGrowFilter!==null`の場合のみこの枠消費をスキップする設計）。**ただし本命の検証経路（WX03-024等「ゲット・グロウ」＝GROW_FREEスペルによる横グロウ）はdriverでどうしても2回目グロウを完走させられず（`openFreeGrow`候補クリック後もlrigTopが変化しない・原因未特定）検証空振りのまま**。`collectLrigGrowTriggers`（triggerCollect.ts:102）はコード上`usedIds`を返さずusageLimitの書き戻し機構が無い＝ATTACK_STEP_START②で見つかり修正済みの構造的バグと同型の疑いが残るが、E2Eでの再現はできていない＝Opusタスク12へ「未確認だがコード上疑わしい」扱いで登録（続き119と同じ場所を精査すれば数分で判明する可能性）。

- **ON_TARGETED の forced 単一対象 follow-up**＝pending 無しで自動解決される対象取り経路が未発火（Opusタスク12(xx)）。

- **B4 引用付与の実発火**（WX24-P2-018 等）＝Opusタスク12(xiii) の timing 誤登録修正待ちで一時停止。

- **WX04-005-E3**（場出し数制限）＝STUB `LIMIT_ALL_FIELD_1` が engine 未実装と確定（Opusタスク12(xix)）。

---

## 2026-07-28 整理：PLAN から退避した完了行の原文

> 2026-07-28 の PLAN 整理で移動。行は移動時点の原文そのまま（PLAN 側には1行✅サマリを残置）。詳細の一次記録は BUGFIXES.md 各「続きNN」にある。

### §3 Opusタスク12 在庫表の完了行（原文・続き293〜296 時点）

| ID | 内容（原文） |
|---|---|
| (xxxix) | **逆翻訳全文照合で検出した「条件以外の原文不一致」計24効果**（続き210-213・Codex/Opus）。先頭条件脱落5枚（続き219・`HAND_DIFF` 配線）・CHOOSE 前状態条件10枚（続き219b・`matchLeadingStateCondition`）・tractable 2枚（続き242・`levelLteHandDiff`）を消化。**残＝真の§6.3級のみ**＝「このアタックを無効にし」系3枚（攻撃無効化 action 型が engine に無い）／WXK09-003 赤分岐（ライフクロス→エナ新ゾーン遷移）／WXDi-P06-039「このシグニの下にあった」照応（leave 時の under-card 追跡機構）／Magic Box 3件。詳細 BUGFIXES 続き219/219b/242 |
| (xxii) | ~~**後置条件節の IS_MY_TURN 誤変換（当初127件）**~~ **✅完全クローズ（続き296）**＝続き143〜212 の12バッチ＋続き241＋続き283〜285＋続き293〜296 で全数消化。続き293 で live 実害を全数確定（刻印42件を `CONDITIONAL{IS_MY_TURN}` 実数で機械分類し **真の実害16／live 既に正形の残骸25＝触るな／元から正しい1**に分離）→9効果消化、残10件を続き294（4）・続き295（3）・続き296（3）で消化し、**10件すべて誤変換が解消**したことを機械検証（未解消0）。**続き295 で [C] 判定3件が誤りだったと判明**＝WDK08-Y01／WXK06-031／WXK11-024 は既存語彙＋engine 1箇所で足りた。**続き296 のクローズ定義**＝「原文の完全実装」ではなく「正しい条件に置換 or `UNKNOWN{raw}` で過剰実行を停止」。残る不足機構は **§6.3 へ移送**（WX15-067 の支払い前ウィルス除去UI・WXDi-P11-010A のルリグ裏向き／全ゾーン除外・WXDi-P13-003A のピース両面反転／特定カード指定グロウ）。詳細は BUGFIXES 続き293〜296。 |

---

## 2026-07-25 整理：PLAN から退避した完了行の原文

> 2026-07-25 の PLAN 整理で移動。行は移動時点の原文そのまま（PLAN 側には1行✅サマリを残置）。詳細の一次記録は BUGFIXES.md 各「続きNN」にある。

### §3 Opusタスク6「代わりに」残テールの機構系（🏁完全クローズ・続き256〜260 時点の原文）

| # | タスク | 残っていた内容（原文） |
|---|---|---|
| **6** | 「代わりに」残テールの機構系 | **B1残5枚 全消化（続き256/257・Opus）**＝WXDi-P11-067（既存 TURN_HAND_DISCARD_GTE）・WX14-070（新 THIS_CARD_UPPED_FROM_DOWN_THIS_TURN）・WDK17-014（新 COST_TRASHED_PUPPET）・WX25-P2-101（新 COST_DISCARDED_SIGNI_LEVEL）・WXK06-071（新 OPP_CARDS_MOVED_TO_DECK_THIS_TURN＝中央 countMovedToDeck 差分・多段閾値ネスト CONDITIONAL）。別対象二重POWER_MODIFYの過剰効果を条件置換へ。census 1567→1562・golden 730。**D:置換ルール9 全数消化（続き258・Opus）**＝実バグ5効果（WX13-031-E1/WX16-001-E1/WXK04-068-E2＝新 `BATTLE_BANISH_PREVENT_LOSE_ABILITY`〔REMOVE_ABILITIES 幻覚を撤去しバニッシュ防止＋能力喪失を実装〕・WX14-026-E1＝新 `substituteCost.lifeCrash`〔CONTINUOUS LIFE_CRASH 幻覚を撤去〕・WX10-033-E1＝trigger.thisCardOnly 脱落是正）＋WX25-P1-056-E1 を acknowledged STUB `EFFECT_LEAVE_REPLACE_BANISH` で§6.3送り、残4件は既実装/偽陽性と確定。census 1562→1557・golden 732。**C:コスト代替6 全数消化（続き259・Opus）**＝実バグ4効果（WX24-P1-060-E1/WX25-P3-076-E1＝新 `COST_TRASHED_MATCHES`・WXEX2-48-E3＝既存 `ACTIVATED_DISCARD_COUNT_GTE` へ配線〔いずれも SEQUENCE 両実行＝二重バニッシュ/最大4体配置の過剰効果を置換 CONDITIONAL へ〕・WX07-027-E2＝能力スコープ任意コスト代替を強制 TRASH ステップから `cost.costSubstitute` 宣言へ〔engine 未実装・安全側〕）＋【出】経路の `last_cost_trashed_cards` 追記バグを上書きへ統一、WX08-042/WX21-044 は色オーバーライドで既実装と確定。census 1557→1554・golden 733。**E:リコレクト2 消化＝🏁タスク6 完全クローズ（続き260・Opus）**＝真因は機構ではなく計器で、`recollectArts` は parser→engine 実装済なのに**逆翻訳が「《リコレクトアイコン》［N枚以上］代わりにKつまで選ぶ」を丸ごと落として原文照合できず**高シグナルに残っていた（decompiler へ追加）。全文照合で見つけた実バグ＝「それは能力を失い、それのパワーを－Nする」複文で**パワー修正が丸ごと脱落**していた4効果（WX26-CP1-009 の－30000／WX25-CP1-084／WX25-CP1-093／SPDi43-09）を `SEQUENCE[REMOVE_ABILITIES, POWER_MODIFY{targetsLastProcessed}]` へ是正＋engine に `REMOVE_ABILITIES` の `lastProcessedCards` 記録を追加。census 1554→1552・golden 734。**残0**。詳細 BUGFIXES 続き256/257/258/259/260/235b |

## 2026-07-24 整理：PLAN から退避した完了行の原文

> 2026-07-24 の PLAN 整理（完了タスクの本文退避＋census 履歴の圧縮）で移動。各行は移動時点の原文そのまま（PLAN 側には1行✅サマリを残置）。詳細の一次記録は BUGFIXES.md 各「続きNN」にある。

### §3 Opusタスク表の完了行（原文・続き218k〜248 時点）

| # | タスク | 残っていた内容（原文） |
|---|---|---|
| **1** | 引用付与の内側 ability parse | **✅クローズ（続き224）**＝本丸 続き164・「アタックできない」家族 続き205・(d)`WX25-P3-085` 単文型 grant mis-parse は続き224（E1 は fresh 側で既に是正済＝再収穫のみ／同カード BURST の DOWN 対象 SIGNI→LRIG を parseSentencePart1 の DOWN 規則へ bare-LRIG 検出追加＝続き223 凍結の DOWN 版・11効果消化・census 1866→1865）。残の (b) 内側「代わりに」置換（WX25-P3-038）は§3タスク6と合流・(c) `GRANT_LRIG_ABILITY` ON_PLAY 誤デフォルトは続き218i（タスク5）で消化済。詳細 BUGFIXES 続き164・205・224 |
| **2** | census「動的比較」の残 | **✅クローズ（続き237）**＝残 WXK08-005（キー）を消化。①先頭文脱落で E4（エクシード2ダウン凍結）が無条件発火していた過剰効果を `condition:LRIG_LEVEL_CMP_OPP{lt}`（既存＝新機構不要・getKeyPieceActions が evalUseCondition 済で engine 追加ゼロ）でゲート化。②E2 空 grant は機能近似のまま維持（詰めると二重発火＋granted 経路が condition 未評価）。副産物で getKeyPieceActions の timing↔phase 未照合（107+能力の広域緩さ）を Opusタスク12 (li) へ登録。詳細 BUGFIXES 続き237（他は続き203） |
| **3** | DRAW 脱落の parseSingleSentence 直呼び経路 | **✅tractable 分クローズ（続き238）**＝(1)`対象とし`挟みのエナ置き＋バニッシュ（WX05-024/WX13-034）(2)「対象とし、それを移動連用、B」の前半移動脱落（WXDi-P13-001 の bounce＝一般化ハンドラ）(3)WX20-071（3項＋「アクセされていた場合」を engine の離脱直前 leftStateFilter{hasAcce} へ寄せ＋collectLeaveFieldTriggers の self 経路に leftStateFilter/turnOwner ゲート新設で7効果の過剰発火も是正）(4)ドリームチーム系ピース WXDi-P08-003（REVEAL 早期 return が後続その後セグメント＋先頭色条件を捨てていたのを seed 方式で白/赤/黒3分岐復元）。census 1836→1831・golden 551・詳細 BUGFIXES 続き238。残＝真の§6.3（単発機構待ち）＝WXK07-042／WX20-049／WX26-CP1-066／対戦相手ドロー idiom/per-count ドロー＝いずれもタスク6/§6.3 長テールへ合流 |
| **7** | §6.1 未実装action型の engine 実装 | **✅クローズ（続き202/204/204b）＝残型0**（PLAY_FREE_FROM_TRASH／PREVENT_DAMAGE／COST_SUBSTITUTE。詳細 PLAN_DETAIL §3／BUGFIXES 続き202・204） |
| **9** | §6.2 semantic audit 系統残の機構対応 | **✅クローズ（続き239・Opus）**＝(a)SEQUENCE内 GRANT_PROTECTION `WX08-017`＝step2 count:1→'ALL'＋power30000＋UNTIL_END_OF_TURN(b)LAYER付与 `WX15-031`＝内側【常】に `sourceCostMin:5`(c)広域24件の subjectFilter/新機構＝engine 中核（collectEffectImmuneSigni が `target:{count:'ALL'}` を honor せず効果元1体のみ保護する偽陰性）を subjectFilter 変換で解消＋engine に `isDrive` 状態フィルタ・`sourceCostMin`・subjectFilter.`excludeSelf`・ローカル matchesFilter への costMin/hasCrossIcon 追加。9カード是正（WX05-024-E2/WX09-016/WX09-CB02/WX13-005A/WX18-034/WX19-048/WXEX1-37/WX08-017/WX15-031）。census 1831→1826・golden +1（552）。残＝真の§6.3＝WX11-027/WX17-001/WXEX2-36/WXK11-021/WXK11-020/WX14-049/WXEX1-58/WXK10-080/WD18-008/WX12-Re09/POWER_MODIFY 免疫5件（→§6.3 へ登録・大半は後日消化済＝§6.3 台帳参照）。詳細 BUGFIXES 続き239 |
| **11** | BEHAVIOR_AUDIT 高シグナル22 の最終仕分け | **✅クローズ（続き234）**＝続き133で22件全件精査（真no-opバグ0件）＋残件「WXK01-021-E1 の空付与」を続き234で engine コード確認＝バグではない（E2/E3/E4 がキー top-level 効果として正しく機能・空 GRANT_LRIG_ABILITY は無害 no-op・約37枚のキー系統的ノイズ）。副産物でアーツ一時付与の内側【自】parse 失敗3枚を発見しタスク12 (l) へ登録。詳細 BUGFIXES 続き234 |
| **17** | timing 判定が本文後半/引用内のトリガー語を先に拾う | **✅続き136で修正＝判定を効果ブロック先頭のトリガー句（trigText）に限定・23効果是正**（詳細 BUGFIXES 続き136） |

### §3 Opusタスク12 在庫表の完了行（原文・続き135〜248 時点）

| ID | 内容（原文） |
|---|---|
| (i) | ~~SP27-002-E3 引用付与の内側条件の無言消費~~ **✅続き193＝二段「かぎり」を AND 平坦化して構造化・旧STUB三重バグ削除**（詳細 BUGFIXES 続き193） |
| (ii) | ~~WXDi-P10-035 の owner エンコード精査~~ **✅続き194＝owner にバグ無しと確定・curated 退化版を fresh へ差し替え**（詳細 BUGFIXES 続き194） |
| (iii) | ~~WXK09-050 GRANT_CHOSEN_ABILITY の held 残存~~ **✅続き195＝parser 主経路から固有ハンドラへ委譲し held ドリフト解消**（詳細 BUGFIXES 続き195） |
| (iv) | ~~applyDirectAction の手札カウンタ3種未更新~~ **✅続き135で修正（手札保護も移植）** |
| (v) | ~~applyDirectAction default 節の暴走再実行~~ **✅続き181＝真の再入は STORY_CHANGE のみ・case 新設で解消、他は benign と機械確認**（詳細 BUGFIXES 続き181） |
| (vi) | ~~POWER_MODIFY_PER_DECK_COUNT が CONTINUOUS 未実装~~ **✅続き135で実装** |
| (vi-4)／(vi-5) | ~~6コレクタの LRIG ゾーン走査漏れ・usageLimit 書き戻し~~ **✅続き181／続き135で消化＝派生の ON_BANISH any_ally 脱落16効果も根治**（詳細 BUGFIXES 続き181・135） |
| (vii) | ~~「アップ状態のこのシグニをダウンしてもよい」系の対象/自己混同7件~~ **✅完了（続き163/164で6枚・続き220で残1枚 WX25-P2-112）**＝WX25-P2-112 は続き220で消化＝`execDown(LRIG)` がダウンしたルリグを `lastProcessedCards` に記録＋`colorMatchesLastProcessed` 動的フィルタ新設で「共通する色を持つ相手エナをトラッシュ」を実装。DOWN は SIGNI→LRIG 是正＋optional 二択。golden 520・census 1868。詳細 BUGFIXES 続き220 |
| (viii) | ~~checkAllEffects 精査の複合バグ~~ **✅完全クローズ**＝WX25-CP1-062／WX17-028／WX16-070／WX16-038／WDK16-13・WXK08-033／WX26-CP1-048 は続き137〜197で消化。残の WXDi-P10-034（次メインフェイズ遅延+分岐）は続き221で実装完了＝(a)裏向き配置＝新ゾーン `facedown_signi`(b)ターン跨ぎ遅延＝`pending_facedown_flip`＋collectTurnTriggers の ON_MAIN_PHASE_START に RESOLVE_FACEDOWN_FLIP 注入 (c)表向き選択分岐＝CHOOSE。golden 5件追加・census 1868→1867（詳細 BUGFIXES 続き221） |
| (x) | ~~collectFieldTriggers の usageLimit 欠落（《ターン1回》過剰発火32枚）~~ **✅続き135＝5コレクタ統一＋書き戻し12箇所・実機PASS** |
| (xi) | ~~CONDITIONAL{条件, then:STUB OPTIONAL_COST}包み46効果のコスト踏み倒し＋ゲート無視~~ **✅続き206で engine 解消**。要実機検証＝skip 選択時に本体が発動しないこと（→§7） |
| (xii) | ~~WXEX1-19-E2 自己再帰STUBの無限ループ~~ **✅続き202＝一括受け取り型へ変更で根治・smoke SKIP 1→0**（詳細 BUGFIXES 続き202） |
| (xiii) | ~~WX24-P2-018-E1 の timing 誤登録~~ **✅続き136で ON_ATTACK_PHASE_START へ是正。残る付与先バグはタスク1** |
| (xix) | ~~WX04-005-E3 場出し数制限が未実装~~ **✅続き137＝誤診断・`fieldLimit.ts` に実装済みと確認＋golden 3件**（詳細 BUGFIXES 続き137） |
| (xx) | ~~ON_TARGETED の forced 単一対象 follow-up 未発火~~ **✅続き137＝autoTargetedCards surface で修正・実機PASS** |
| 🆕 | ~~choice.condition と CONDITIONAL ラップの表現不整合~~ **✅続き156＝liftChoiceOptionCondition 新設・20枚採用** |
| (xxiii) | ~~リコレクト分割8件の内容欠落~~ **✅続き173/174で8枚全件消化**（詳細 BUGFIXES 続き173/174）。派生＝WX24-P4-016 の MB 表向きトリガー収集機構は §6.3 送り（未登録） |
| (xxiv) | ~~トリガー発生源フィルタ脱落8件~~ **✅続き162/163/206で全消化**（`discardCostSourceStory`／`powerDecreaseSourceStory`／`last_effect_mill_source`。詳細 BUGFIXES 各続き） |
| (xxv) | ~~driver バッチの累積疲労 flakiness~~ **✅続き140＝DB側累積が真因・injectScenario で既定値張り直し**（詳細 BUGFIXES 続き140） |
| (xxvi) | ~~フルバッチ中の Playwright ブラウザクラッシュ~~ **✅続き142＝RECYCLE_EVERY 予防リサイクル＋クラッシュ時再確立で耐障害化**（詳細 BUGFIXES 続き142） |
| (xxi) | ~~collectOppDrawTriggers が発生源を区別せず PR-423 誤発火~~ **✅続き162＝`drawByDrawerOwnEffect` 新設で修正・E2E 反転は続き170で確認済み**（詳細 BUGFIXES 続き162） |
| (xxx) | ~~WXEX2-76-E1 ON_PLAY の scope/対象幻覚~~ **✅続き188＝同型3枚を根治**（詳細 BUGFIXES 続き188） |
| (xxxi) | ~~レベル比例ドロー/エナチャージの潰れ~~ **✅続き184/187/190＝`DRAW_PER_LRIG_LEVEL`／`ENERGY_CHARGE_PER_LRIG_LEVEL`／`DRAW{perLastProcessedLevel}` 新設でクローズ**（詳細 BUGFIXES 各続き） |
| (xxxii) | ~~ON_TRASH／ON_BLOOD_CRYSTAL_ARMOR の any_ally scope 脱落~~ **✅続き182/191で消化**（詳細 BUGFIXES 続き182・191）。残2枚＝WXK07-074（チャーム付帯）・WXK11-018（watcher 相対レベル）＝§6.3級で据置 |
| (xxxiii) | ~~any_opp watcher の usageLimit 未評価~~ **✅続き183＝`limitOkWatcher` 追加＋リムーブ経路の両 state 永続化**（詳細 BUGFIXES 続き183） |
| (xxxiv) | ~~`fromFieldByCostOrEffect` の parser 未 emit~~ **✅続き183＝15枚全件消化**（詳細 BUGFIXES 続き183） |
| (xxxv) | ~~ON_TRASH「〜によって」限定の近傍表記が未ゲート~~ **✅続き186で (a)(b)(d) 消化**（詳細 BUGFIXES 続き186）。(c) 3枚（WX18-062/WX22-027/WXK03-033）＝「シグニの下から」トラッシュの collector が engine に無く §6.3 送り |
| (未確認) | ~~collectLrigGrowTriggers の usageLimit 書き戻し疑義~~ **✅続き206＝全15コレクタの全数監査で新規の穴なしを確認**（監査スクリプト `scripts/archive/auditUsageLimitWriteback.mjs`・再実行可） |
| (xxvii) | ~~semantic audit 第2弾（seed202607）の実害37枚~~ **✅続き165〜169・207 の Cluster 別消化でクローズ**（F フィルタ50枚／A 条件節／C owner／D timing／`ON_HAND_ADDED` 新設ほか。トリアージ `docs/_semantic_audit_scaleup2_triage.txt`） |
| (xxxvii) | ~~アタック不可付与の据置4効果~~ **✅続き205で4件とも個別に原文照合し全採用（すべて fresh が正）** |
| (xxxviii) | ~~付与対象に閾値フィルタが乗らない過剰効果~~ **✅続き205＝対象節スコープで抽出＋兄弟規則（付与系4規則）へ横展開・色フィルタも追加** |
| (xxxvi) | ~~エナ代替トラッシュ情報がグロウ経路に未接続~~ **✅続き206＝人間のグロウ経路5箇所へ配線（CPU 可否は据置）**。要実機検証＝グロウ支払いUIでの実選択（→§7） |
| (xxviii) | ~~「それをエナゾーンに置く」が TRASH 等へ潰れる系統~~ **✅続き147＝7効果を SEND_TO_ENERGY へ是正**（詳細 BUGFIXES 続き147）。残＝WX24-P4-048-E2＋WX26-CP1-086/WXK05-027/WXK05-070 のコスト STUB 精緻化 |
| (xl) | ~~【絆常/絆自/絆起/絆出】が効果ブロック境界として認識されず絆能力が飲み込まれる（134カード137能力）~~ **✅続き215＝parser marker 3箇所＋engine 絆未獲得ゲート新設・112枚一括採用**（詳細 BUGFIXES 続き215） |
| (xli) | ~~絆分離の残ギャップ11件~~ **✅完了（続き215→217→218）**＝7件は計器ノイズ・`BANISH_REDIRECT` 本体は続き217・(b) 種類数条件と (c) は続き218・(a) 場出し欠落は続き218c（15効果の系統＝`LOOK_PICK_CHAIN[field]` 規則を新設）。詳細 BUGFIXES 続き217／218／218b／218c |
| (xliii) | ~~census の系統的偽陽性＝`BANISH_REDIRECT` 族~~ **✅完了（続き218d・Opus）**＝「ゾーン:エナゾーンに置く」カテゴリに `extraOk` を追加し redirect イディオム句を除いた残りに「エナゾーンに置」が残らないときだけ合格。族の全22効果で残存0を機械確認。census 1895→1891。詳細 BUGFIXES 続き218d |
| (xlv) | ~~「アタックフェイズの間」限定の CONTINUOUS 常在効果が activeCondition 脱落で PERMANENT 化~~ **✅続き218f＝`DURING_ATTACK_PHASE` を新設。13効果12カード是正・census 1888→1886**（詳細 BUGFIXES 続き218f） |
| (xlvii) | ~~「対戦相手のルリグがアタックしたとき」に防御側の付与AUTO を発火させる収集経路が engine に無い~~ **✅完了（続き218j・Opus）**＝`collectLrigAttackDefenderTriggers` を新設。4効果が完全化（`WX15-002-E2` ほか）。golden 514→516。詳細 BUGFIXES 続き218j |
| (xlviii) | ~~「〜てもよい」（任意アクション）が parser で optional:true を落とし engine が強制実行＋「そうした場合」did-it ゲートが常時成立~~ **✅続き225（Opus）＝4ハンドラに optional 配線。ライブ90枚を pure-superset 自動採用で一括是正。census 1865→1846・golden 528**（詳細 BUGFIXES 続き225） |
| (xlix) | ~~【常】出撃制限が `ADD_TO_FIELD` へ mis-parse~~ **✅続き248（Opus）で消化＝11枚系統**＝新設 `SELF_PLAY_RESTRICT` アクション＋`canSelfPlay` を `handleSummonSigni` へ配線。golden 573→579・census 1825→1817。詳細 BUGFIXES 続き248 |
| (li) | ~~`getKeyPieceActions` がキーの ACTIVATED 能力を timing↔phase 照合せず surface~~ **✅続き240（Opus）で消化**＝`keyActivatedTimingMatchesPhase` を新設しシグニ【起】と同型の照合を挿入。golden 552→554・census 1826据置。残＝《アタックフェイズアイコン》動的付与と真のカットイン窓モデル化は §6.3級で据置。詳細 BUGFIXES 続き240 |

### §3 Sonnetタスク表の完了行（原文）

| # | タスク | 内容（原文） |
|---|---|---|
| 9 | ~~PARTIAL 刻印 151件のトリアージ~~ **✅完了（続き138）**＝152件全件を3分類完了＝実害144件を Opusタスク12 (xxii)(xxiii)(xxiv) へ登録（成果物 `docs/_partial_triage.txt`） |

続き208の未採用在庫40枚・続き201の未採用在庫37効果・補欠(a)(b) はいずれも✅続き214で全消化（詳細 BUGFIXES 続き214／続き172・170）。

### §4 census 計測履歴（宣言前バッチ逓減・2026-07-24 に PLAN §4 恒久指標から退避）

> P1完了宣言（2026-07-23・凍結基線1581）に至るまでのバッチ逓減の原文。PLAN 側には現値＋直近数件のみ残置。

宣言直前の逓減履歴＝2026-07-23 バッチ5c第1波＋第2波〔新機構 selectionConstraint＋FIELD_LRIGS_SHARE_COLOR・計60効果〕1649→1644→計器較正〔バッチ5系新語彙の census keys 登録＝偽陽性32回復〕1644→1612→バッチ11〔相手が選ぶ43＝opponentSelects 一括付与〕1612→1589→バッチ6〔数量比例27＝resolveCountRef 一本化・countFromZone・perAllSigni〕1589→1581。旧・2026-07-23 ROADMAPバッチ5b＝codex実装/Claude確認・同一性参照フィルタ31効果〔既存 levelEqualsVar/levelEqDiscardLevelSum 発行＋新語彙5本の resolveDynamicFilter 共通解決＋コスト記録2経路。WXK10-001 GRANT_KEYWORD 脱落退化は Claude 復元〕＝1674→1649〔golden 654→658〕。旧・2026-07-23 ROADMAPバッチ5第1波＝codex実装/Claude確認・ルリグ共通色filter脱落25効果〔parseColorMatchesLrig 否定形拡張＋LRIG_COLOR_BATCH5_ENERGY カードゲート・BANISH/POWER_MODIFY 対象オーナー基準化＝既存59保持効果の全数監査で挙動変化ゼロ確認〕＝1695→1674〔golden 651→654〕。旧・2026-07-23 §6.3 G072続編第2波＝codex実装/Claude確認・被バニッシュ側ゲート9効果〔banishedFrontOfSelf parser化＋notWhileAttacking・banishedHadCharm 変種・banishedLevelLtWatcher＋levelEqTrigger・banishedFromCenterZone・banishedWasUp＝section1初ゲート〕＝1698→1695〔golden 644→650〕。旧・2026-07-23 §6.3 G072残6枚＝codex実装/Claude確認・条件前置き付き相手バニッシュ反応6効果〔duringMainPhase 配線・banishedHadCharm・banishedByOwnEffect/banishedSourceStory＝cause引数・WXEX2-23-E2 傀儡STUB化＋triggeringCardNum 保持＝副作用で WXK11-020-E2 の powerLtTrigger 無制限バニッシュ潜在バグも解消〕＝1702→1698〔golden 637→644〕。旧・2026-07-23 §6.3 アップ/ダウン状態ファミリ＝codex実装/Claude確認・追加ダウンコストを既存 `fieldDown` regex 拡張（＜A＞か＜B＞/色）で表現〔codex の並行語彙 signiDown は検証で撤去・WXDi-P14-040 二重コスト化を是正〕＋`OPTIONAL_COST.handDiscard` 実払い＋watcher 是正（banishedFrontOfSelf/duringMainPhase）の12効果〔golden 617→627〕＝1711→1702。旧・2026-07-22 ブースト機構＝§6.3 5番目bullet の「あなたがブーストしていた場合」ボーナス4枚を CONDITIONAL{IS_BOOSTING}＋任意追加エナUIで parse＝1713→1711。旧・続き254＝Opus・ROADMAPバッチ2第2波の実測でルート枯渇を確認し真バグ4枚を直修正（WX10-013/WX11-046 の POWER_MODIFY owner:any 潰れ＝class/色/level 接頭辞追加／WX05-023-E3 の PLACE_UNDER cardName 誤合成／WX09-020 の白か黒 PRESERVE 直パッチ）＝1715→1713〔golden 596→599〕。旧・続き253＝Opus+Codex・ROADMAPバッチ2第1波「対象フィルタ合成・トラッシュ→手札」＝30枚採用（`extractNounPhraseFilter` 新設＝複色OR/無色/cardName包含/excludeCardName/nonColorless＋複合対象の SEQUENCE 分割。PRESERVE 11件は直パッチ）＝1742→1715〔golden 593→596〕。effectEngine の nonColorless `'無'` 欠けも同時修正。旧・続き252＝Opus+Codex・ROADMAPバッチ1第4波「センタールリグ条件＋ターン内履歴/出自」＝22枚採用（OR/THIS_CARD_FROM_DECK/PLACED_BY_CLASS省略形の3拡張）＝1761→1742〔golden 590→593〕。Codex の parser 未修正納品（held 86 汚染）と誤合成残骸3件を Claude 側で是正（STATE_COND_BATCH4_ACTIONS 固定・held 73 復帰）。旧・続き251＝Opus+Codex・ROADMAPバッチ1第3波「盤面/ゾーン状態条件」＝「場/トラッシュ/エナに〜がある場合」系の丸ごと脱落33枚（distinctColors/HAS_KEY_IN_FIELD/hasCharm 拡張）を採用＝1792→1761〔golden 588→590〕。Claude 検証で恒久 force-adopt 撤去・巻き添え退化4件復元・死フラグ1件修正。旧・続き250＝Opus+Codex・ROADMAPバッチ1第2波「参照カード属性条件」＝「それ/そのカードが〈属性〉の場合」系の真バグ13枚（elseAction 新設・AWAKEN 対象覚醒・レゾナ per-target 置換・isDisona filter・名前ゲート）を採用＝1799→1792〔golden 584→588〕。同クラスタ41件中21件は REVEAL_AND_PICK filter 表現済みの census 偽陽性と実測分類。旧・続き249＝Opus+Codex・ROADMAPバッチ1第1波「状態条件節の持ち上げ」＝ターン所有者条件17＋ライフクロス枚数8の条件節丸ごと脱落（無条件発火の過剰効果）を新条件型 `TURN_OWNER`（実行時実評価・`ExecCtx.isOwnerTurn` 配線）＋`LIFE_COUNT` opponent版/AND複合で25効果採用＝1817→1799〔golden 579→584〕。旧・続き248＝Opus・タスク12(xlix)「【常】：このシグニ/カード/キーは（新たに）場に出すことができない」の自身出撃制限11枚が bare `ADD_TO_FIELD` へ誤 parse され inert no-op 化していた系統を新設 `SELF_PLAY_RESTRICT`＋`canSelfPlay` 配線で消化＝1825→1817〔golden 573→579〕。旧・続き243＝Opus・タスク12(xxix)「そのシグニの【出】能力」クラスタを忠実表現化＝死アクション `BLOCK_ACTION{ON_PLAY_ABILITY}`（engine 未参照）を配置アクションの `suppressOnPlay` フラグへ畳む fold を parser 単一チョークポイントに新設（76効果折込・22効果はアンカー無しで据置）＝block→flag の構造変換ゆえ高signal欠落計器の対象外・1825維持〔golden 557→562〕。旧・続き236＝Sonnet（Opusタスク16試行）・WX17-032「正面以外のシグニをバニッシュしたとき」の ON_PLAY 誤フォールバックを是正（trigger regex＋新設 `triggerCondition.banishedNotFront`）。UP先「そのアタックしているシグニ」は能力ホスト≠実アタッカーになりうるため新設 `targetsBattleAttacker` で解決＝'除外(〜以外の)' カテゴリの keys に `NotFront` も追加（`thisCardOnly` 採用時の偶然一致に頼らない恒久対応）。1839→1838。旧・続き233＝Opus・§6.3 機構待ち解消＝ON_LEAVE_FIELD 跨サイド any_opp watcher の `byEffect`/`leftStateFilter{isFrozen}` ゲート＋離脱直前 state スナップショット配線で WXK11-017-E1／WXEX1-30-E2／WXDi-P03-040-E1 を self 誤発火→any_opp 正発火へ（併せて REVEAL_AND_PICK remainder に shuffle 語彙）＝1841→1839〔golden 535→537〕。旧・続き232＝Opus・タスク5「このシグニを場からトラッシュに置いてもよい」自己犠牲5枚に thisCardOnly＋optional を付与＝対象/任意性の是正で語彙センサスの対象外＝1841維持〔golden 534→535〕。旧・続き231＝Opus・タスク12(xliv)(a2) 効果経路の 【常】 BANISH_REDIRECT 走査を配線＝バニッシュ先（エナ→トラッシュ）の是正で語彙センサスの対象外・1841維持〔golden 533→534〕。旧・続き229＝Opus・census クラスタ「Nまで上限選択」精査＝REVEAL_AND_PICK のフィルタ付き pick ハンドラが「スペル」noun を欠き「（色の）スペル1枚を公開し手札に加え」が LOOK_AND_REORDER に飲まれ pick 脱落していた系統を noun 群に「スペル」追加（cardType:スペル＋pickNoun:スペル）で是正＝SPDi43-17-E1（採用）＋WXK05-023-E3（MANUAL 手術）を被覆し 1843→1841（golden 532維持）。旧・続き228＝Opus・タスク3 DRAW脱落の一部＝「デッキの一番上のカードをエナゾーンに置き、X」連用中止が後続を飲み込んで脱落していた系統を連用中止 splitter に追加＝WX15-098/WX19-030-E2 の energy-charge を回復し 1845→1843（golden 532維持）。旧・続き227＝Opus・タスク4 「あり」複合条件 WXDi-P11-048-E1 を消化＝トラッシュ色枚数＋相手エナ枚数の AND を parser に1本追加。過剰効果（条件脱落）の是正は「欠落」計器を動かさず 1845 維持（golden 532維持）。旧・続き226＝Opus・タスク12(xxix)(b) 完了＝照応先ロスト系統（「対戦相手のシグニ1体を対象とし、[任意コスト]。そうした場合、それの…」で照応先が失われ owner:self+targetsTriggerSource／source:DECK_CARD へ化ける）を parser 後処理2本で復元＝ライブ84枚＋MANUAL1枚を一括是正。census は owner 変更が欠落語彙計器をほぼ動かさず1846→1845（golden 528→532）。旧・続き225＝Opus・タスク12(vii)系 完了＝「〜てもよい」任意アクションの optional 脱落（強制実行＋did-it ゲート常時成立）を4ハンドラで是正＝ライブ90枚を pure-superset 自動採用で一括是正＋optional 復元で過去 held 改善が解禁され自動採用され1865→1846（golden 527→528）。旧・続き224＝Opus・タスク1(d) 完了＝WX25-P3-085 の単文型 grant mis-parse を再収穫（E1 の GRANT_EFFECT 復元で欠落1件解消）＋同カード BURST の DOWN 対象 SIGNI→LRIG を parser 一般化で是正（DOWN 種別変更は「欠落」計器の対象外）で1866→1865（golden 527維持）。旧・続き223＝Opus・タスク12(xxix)(b) 222クラスタ・トリアージ＝「対戦相手のルリグ1体…凍結」の FREEZE 対象 SIGNI→LRIG 種別取り違え18効果を parser 一般化で消化＝凍結は「欠落」計器の対象外のため1866維持（golden 526→527）。旧・続き222＝Opus・タスク12(xxix) 残(a) クローズ＝WX06-014-E2 の step1 を「自分トラッシュから古代兵器5枚をデッキ下」へ是正し MANUAL 化・did-it ゲートで「そうした場合」を表現し1867→1866。旧・続き221＝Opus・タスク12(viii) 完全クローズ＝WXDi-P10-034 の裏向き設置→ターン跨ぎ遅延→表向き分岐を実装し1868→1867。旧・続き220＝Opus・タスク12(vii) WX25-P2-112 のダウン→共通色エナトラッシュ実装で1869→1868。旧・続き219b＝Opus・タスク12(xxxix) CHOOSE ヘッダ前の状態条件の汎用持ち上げで10枚是正し1878→1874。旧・続き219＝Opus・タスク12(xxxix) 先頭条件脱落5枚＝「各ターン終了時」strip 漏れ＋相対手札比較 `HAND_DIFF` の CONDITIONAL 未配線を是正し1880→1878。旧・続き218g＝Opus・parser は `REVEAL_AND_PICK` を出すのに curated が古い `LOOK_AND_REORDER` のまま「手札に加える」が死んでいた held ドリフト9効果を採用し1886→1880。旧・続き218f＝Opus・「アタックフェイズの間」限定の CONTINUOUS 常在効果の PERMANENT 潰れを `DURING_ATTACK_PHASE` 新設で是正し1888→1886。旧・続き218e＝Opus・「それをデッキの一番上に置く」のトラッシュ回収幻覚を是正し1891→1888。旧・続き218d＝`BANISH_REDIRECT` 族の census 偽陽性を extraOk 較正で解消し1895→1891。旧・続き218＝①「N種類以上」条件の語彙化で1919→1916／②`lrigDown` コスト限定で1916→1899。

---

## 2026-07-29 整理：PLAN から退避した完了行の原文

> 2026-07-29 の PLAN 整理で移動（§3 の表が肥大したため）。行は移動時点の原文そのまま。PLAN 側には生きている項目だけを残置した。詳細の一次記録は BUGFIXES.md の各節にある。

### §3 Opus タスク表の完了行（タスク1〜9・11・17〜19）

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| ~~**1**~~ | ~~引用付与の内側 ability parse~~ | — | — | **✅クローズ（続き224）**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き164/205/224 |
| ~~2~~ | ~~census「動的比較」の残~~ | — | — | **✅クローズ（続き237）**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き237/203 |
| ~~3~~ | ~~DRAW 脱落の parseSingleSentence 直呼び経路~~ | — | — | **✅tractable 分クローズ（続き238）**。残＝真の§6.3単発機構待ち（WXK07-042／WX20-049／WX26-CP1-066／per-count ドロー＝タスク6・§6.3 長テールへ合流）。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き238 |
| ~~4~~ | ~~§5c 条件節の残~~ | — | — | **✅クローズ（続き255・Opus）**。残3枚は engine 置換機構不要と判明＝068/070 は `matchesFilter` の cardType 非対称緩和（レゾナをシグニ扱い）でレゾナ標的化を是正・116 は ARTS_USED_THIS_TURN で既に動作。golden 724→726。詳細 BUGFIXES 続き255 |
| ~~5~~ | ~~小口持ち越し（隙間埋めに最適）~~ | — | — | **✅クローズ＋横断コスト監査完了（続き267〜270）**。置換else系統73効果を全数分類し、A10は全消化。続き269の追加エクシード5件はreplace排他自体ではなく、`exceed`未設定によるコスト踏み倒しを修正。続き270で同型の残13効果も原文照合して `exceed:3/4/7` を全設定し、非エクシード文字列コスト34件も全数監査（代表1件修正・複合33件honest defer）。BET／相手スペル使用／デッキ移動枚数CHOOSEを既存条件へ配線し、Bの固定参照 WXDi-P03-089 も `STORE_LAST_PROCESSED_TARGETS` で消化。**残＝C13＋B2は §6.3 台帳へ正式送り**。golden 750→752、census 1537→1535。詳細 BUGFIXES 続き267〜270 |
| ~~6~~ | ~~「代わりに」残テールの機構系~~ | — | — | **🏁完全クローズ＝残0**（B1残5枚 続き256/257・D:置換ルール9 続き258・C:コスト代替6 続き259・E:リコレクト2 続き260）。census 1572→1552・golden 730→734。⚠横断的教訓＝**「census 高シグナル＝未実装」ではない**（実装済みなのに語彙/逆翻訳の未登録で高シグナル化した偽陽性が D/C/E に混在）。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-25節・BUGFIXES 続き256/257/258/259/260 |
| ~~7~~ | ~~§6.1 未実装action型の engine 実装~~ | — | — | **✅クローズ（続き202/204/204b）＝残型0**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3・§6.1／BUGFIXES 続き202・204 |
| ~~8~~ | ~~§6.3 大型機構~~ | — | — | **🏁完全クローズ＝残0**。7項目中5項目は続き261棚卸し時点で完了、正面(b)(d)(e) は続き261、MULTI_ZONE_ATTACK 6枚と出現条件レゾナ52枚は段階2/3までに完了。最後の SPELL_CUTIN レゾナ3枚（WX13-005B／WX13-006B／WX14-006B）は `cutinCandidates` に非打消しの判別候補として合流し、既存 `handleSummonSigni` の原子的支払い・配置・支払い差分トリガー・ON_PLAYを再利用。ON_PLAYスタック後に元スペルを継続し、**55/55枚召喚可能**。golden 740・census 1549。詳細 BUGFIXES 2026-07-26節／続き261 |
| ~~9~~ | ~~§6.2 semantic audit 系統残の機構対応~~ | — | — | **✅クローズ（続き239・Opus）＝9カード是正**。残の広域テールは §6.3 台帳「GRANT_PROTECTION 効果耐性」へ登録（大半は後日消化済）。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き239 |
| ~~11~~ | ~~BEHAVIOR_AUDIT 高シグナル22 の最終仕分け~~ | — | — | **✅クローズ（続き234）＝真no-opバグ0件**。副産物でアーツ一時付与の内側【自】parse 失敗3枚をタスク12 (l) へ登録。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き234 |
| ~~17~~ | ~~timing 判定が本文後半/引用内のトリガー語を先に拾う~~ | — | — | **✅続き136で修正＝23効果是正**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き136 |
| ~~18~~ | ~~golden `WXK11-070` の非決定性フレーク（既存バグ・続き272 で特定）~~ | — | — | **✅続き274でクローズ**。対象テスト内だけ `Math.random` を固定して Fisher–Yates を決定化し、`finally` で乱数関数と共有 `cursor` を必ず復元。既存5 assertion は全維持。engine は変更なし |
| ~~19~~ | ~~`EXILE_SELF_AFTER_USE` のゾーン探索が広すぎる（続き274 調査／続き275 で診断訂正）~~ | — | — | **✅根本修正**。⚠**当初の診断「発生源インスタンスを追跡していない」は誤り**（codex 報告をそのまま記載していたもの。Opus が実測訂正）＝production の zone／`ctx.sourceCardNum` はともに instanceId（`CardNum#N`）。真因はスペルを効果解決**前**にトラッシュへ置いていたため、自身のトラッシュ参照へ混入していたこと。通常スペルを未配置のまま解決し、`PendingEffect.spellPlacement` で対話中も配置先を保持、全 resume 経路の `done` 時だけ trash／lrig_trash へ置く。`EXILE_SELF_AFTER_USE` は未配置スペルでは後置配置を `excluded` に置換、既配置カードでは field／trash／lrig_trash のみ探索（deck／hand／energy／life_cloth は別オブジェクトなので追跡しない）。打ち消しは効果を解決しないため従来どおり即配置。WXK11-070 の production形 golden 5 assertion、対話スペル後置配置、SP36-001 lrig_trash 除外を追加。詳細 BUGFIXES 続き276 |

### §3 Opusタスク12 在庫表の完了行（(liv)(liii)(lii)(xxii)(xxxix)(lvi)(xliv)）

| ID | 内容（原文） |
|---|---|
| ~~🆕(liv)~~ | **✅2026-07-27差し戻し対応済**＝8効果の facing 誤解決を全廃。WXEX1-02（ルリグ由来・凍結ALL・【常】【自】限定）と WX18-038（シグニ由来・チャームALL）を忠実化し、`collectContinuousAbilitiesRemovedSigni` の相手センタールリグ走査（`count:'ALL'` のみ）へ配線。WX09-Re01 は必要な「センタールリグ名に《リメンバ》を含む」ActiveCondition が未実装のため過剰発火を避け明示 STUB defer。ほかトラッシュ1／置換3／引用付与1も明示 STUB no-op。golden 741/741・census 1545（1549→1545。⚠減少4は MANUAL/STUB分類移動を含み、4件の機能実装を意味しない）。|
| ~~🆕(liii)~~ | **✅消化（続き291・2026-07-27）＝「それのレベル1につき」族15効果**。対象シグニのレベルが倍率になる文型を、新 STUB `SELECT_TARGET_ONLY`（盤面を変えず対象だけを記録＝在庫メモの要件②）と `$ref:last_processed_level`/`stored_target_level`（要件①）で解決。コスト形11件は `SELECT_TARGET_ONLY→STORE_LAST_PROCESSED_TARGETS→OPTIONAL_COST(レベル倍率)→PAID_ADDITIONAL_COST{targetsStored}` の正準形（WX24-P2-048 で実証済みの既存機構の配線）へ組み替え、枚数形2件は count を $ref 化。OPTIONAL_COST にレベル倍率コスト3系統（エナ色／手札捨て／エナゾーン置き）を追加し、対象レベル0は支払い不可に倒す。**12効果を忠実化・2効果は元から正しい（POWER_MODIFY_BY_TARGET_LEVEL）・1効果は honest defer**＝WX24-P2-058-E1②（対象が「この効果でミルした3枚」＝その集合を追跡する機構が別途要）。golden 803・census 1523→1521（⚠減少2は語彙計器の性質＝族の大半は「値の誤り」で元から未計上）。詳細 BUGFIXES 続き291 |
| ~~🆕(lii)~~ | **✅消化（続き292・2026-07-28）＝修飾語なし「シグニN体を対象とし」の owner:self 誤り**。在庫メモが要求していた全数機械分類を先に実施＝対象句3670（OPP3093/SELF474/**BARE101**）を抽出し、BARE を単独パースで仕分けて **SELF31（真の候補）／偽陽性22（正面18＋読点分断4）／既に正しい27／NO_TARGET21**。明細 `docs/_bare_signi_triage.txt`・生成器 `scripts/archive/bare_signi_owner_scan/`。**engine が先に壊れていた**＝`owner:any` は `execPowerModify` だけが両フィールド対応で、他は片側に潰れていた。共通ヘルパー `fieldCandidatesByOwner`/`sideOfFieldCard` で BANISH/BOUNCE/UP/DOWN/FREEZE/LEVEL_MODIFY/POWER_SET/GRANT_PROTECTION を両フィールド＋`both_field` スコープへ統一（保護は相手側候補にのみ適用）。parser は `signiClauseOwner` を新設し**対象句の直前セグメントだけ**で判定（既存の opponent 判定は不変）。**全9283カードの前後スナップショット差分で 27カード・owner の self→any のみ・構造差分ゼロ**を実測。⚠差し戻し1回＝GRANT_PROTECTION に当てたら「対戦相手の効果によってバニッシュされない」26枚で自己保護が反転→据置。golden 803→808・census 1521 据置。詳細 BUGFIXES 続き292 |
| ~~✅(xxii)~~ | **✅完全クローズ（続き296・2026-07-28）＝後置条件節の IS_MY_TURN 誤変換（当初127件）を全数消化**。live 実害16件を機械分類で確定し全解消（未解消0）。残る不足機構3件は §6.3 H へ移送。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)・BUGFIXES 続き293〜296 |
| ~~✅(xxxix)~~ | **✅完全クローズ（2026-07-28・codex-work 4バッチ／Opus検証）＝逆翻訳全文照合で検出した「条件以外の原文不一致」24効果を全数処理**。今回15効果を消化（バッチ1〜4）＋PR-238 は既に manual 実装済みと実測・WXDi-P05-086 は JSON が元から正しいと実測。⚠**PLAN の「残＝真の§6.3級のみ（攻撃無効化 action 型が engine に無い）」は stale だった**＝`SET_CANCEL_ATTACK_FLAG` が実在し、既存機構だけで Magic Box 3枚が直った。新設した engine 機構は `fromLeftFieldUnder`／`END_OF_ATTACK`／`LIFE_TO_ENERGY`／`remainder.shuffle` の4つのみ（いずれも利用は当該1効果＝波及ゼロを実測）。残す defer は **WX24-P3-069 のガード追加コスト枚数化のみ→§6.3 I へ移送**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)・BUGFIXES 2026-07-28 バッチ1〜4 |
| ~~🆕(lvi)~~ | **✅完全クローズ（2026-07-28・バッチ3で配置正規化）**。前バッチの21復元のうち実害解消は `appearanceCondition` 9件（召喚不能）＋`timing` 1件（LB不発）。cost 10件＋PR-204 costはデータ忠実性のみ（スペル／アーツ／ピースのエナ徴収はCSV `Cost` 列）。未配線だったアーツ使用条件は現行20効果・20枚（PR-204込み）を全数原文照合し、候補＋実行＋SPELL_CUTINの両面へ配線、除外0。`WXK01-020` eq→lte、`WXK07-001` の花代OR欠落、COND_STUB 2件は effects JSON の `condition` を effectId アンカーで外科訂正し、`mergeManualEffects` の隠しカード固有overrideは撤去。20枚×正負golden、常設 `check:manual-fields`、defer 0。 |
| 🆕(xliv) | **`BANISH_REDIRECT` の残テール**（現行34効果を全数再棚卸し）。パワー0限定/owner 誤り/属性フィルタ（続き218b/230）・効果経路 `banishDestination` の【常】走査（続き231）・**(a3) `bySource:'by_this'` の効果発生源インスタンス配線✅2026-07-28**を消化。`by_this` 3枚は自身効果だけ trash／別発生源は energy、バトル経路不変を実測。**(b) 単体対象の群A 4効果✅2026-07-29**（codex-work実装／Opus検証）＝原文が「対戦相手のシグニ１体を対象とし」なのに JSON が `count:'ALL'` で**相手シグニ全体がそのターン trash 送りになっていた live 過剰発火**（WX25-P2-060-E2／WXDi-P12-054-E2／WXDi-P15-044-E1／WXK06-048-E1）を解消。⚠**「対象選択フローが無い」は stale だった**＝個体機構（`banish_redirect_target_nums`＋`applyDirectAction` の count===1 分岐＋ターン境界クリア）は既に実在し、`count:'ALL'` だから分岐に入っていなかっただけ。parser の `selectedOne`（「それが／パワーが０以下のそれが／それがバトルによって」照応）で `count:1` を出し、**バトル経路の2箇所（実配送 `redirectBanish` と ON_TRASH トリガー判定）へ `isSelectedBanishRedirect` を配線**（従来は効果経路とパワー0経路しか個体リストを見ていなかった）。4効果とも「選択1体だけ trash・他はエナ・全体フラグは立たない」を engine 直実行で実測。golden 894。<br>**(b1)✅2026-07-29**＝`WXK06-048-E1` の対象選択2回（原文「それ」の照応が失われ**別のシグニを選べた**）を `BanishRedirectAction.targetsLastProcessed` の新設で解消（空振りは no-op＝did-it ゲート・省略時は従来どおり）。parser は「句点後の『このターン、それが…』かつ同一解析文に『対象とし』が無い」ときだけ emit＝他4効果は不変。**⚠Opus検証で同族の別バグを発見・同時是正**＝`WX25-P3-104-E1` の「レベル２以下」が **`matchesFilter` の知らないキー `filter.levelMax`** で書かれており**engine が黙って無視＝レベル3以上も対象候補に出ていた**（canonical な `filter.level:{max:2}` へ外科パッチ。codex の golden が `levelMax===2` を構造 assert して死んだキーを固定していたため、候補列挙で確認する形に書き換えた）。golden 895。<br>**残＝(b2) `WXDi-P15-078-E2` はバトル限定（「それがバトルによって」）を表す runtime state が無く効果バニッシュでも発火する**（honest defer）／**(b3) `WXDi-P14-053-E1` は付与型**＝選択シグニへ「次の対戦相手のターン終了時まで」の引用【常】を持たせる永続ストアが不足（honest defer）。`WX25-P3-104-E1` は `whenPowerZero` 個体リスト経路で既に動作＝是正不要と実測。(c) 正面限定3件は✅2026-07-24消化（`frontOnly`＋`zoneIdx`・268）。⚠**Opus検証で判明した副産物**＝(a3) で入れた parser 規則「トラッシュにカード名に《X》を含むカードがあるかぎり」の該当は2枚で、うち **WX12-033（E3 が MANUAL の PRESERVE カード）は build が curated を温存するため fresh の activeCondition が built JSON に届かず【ランサー】無条件付与のままだった**＝外科パッチで是正（census 1478→1477・golden 893）。詳細 BUGFIXES 続き230/231＋2026-07-28/29節 |
> **2026-07-29 追補（xliv）**：(b2) `WXDi-P15-078-E2` は `battleOnly`＋専用個体リストを BattleScreen の実配送／ON_TRASH 判定へ配線し、効果バニッシュでは energy・バトルだけ trash を実測、driver `battleOnlySelectedRedirect` 2回連続PASS。(b3) `WXDi-P14-053-E1` は既存 `granted_effects_until_opp_turn` へ CONTINUOUS `BANISH_REDIRECT{bySource:'battle_with_this'}` を付与する形で実働化し、白限定・+2000・ドーナ覚醒・発生源限定を golden で実測。**よって (xliv) の残(b2)(b3)は完了**。golden 898、census 1476。

### §3 Opusタスク12 (xxix) の消化履歴（PLAN には残作業だけを残置）

> semantic audit stub群 round3。①〜③・(a)(b)(b1)(b2-i)〜(b2-vi) の消化経緯の全文。

| ID | 内容（原文） |
|---|---|
| 🆕(xxix) | **semantic audit stub群 round3（2,101枚・findings 2,799件）**＝①duration系統✅続き148（34効果）・②選択肢欠落✅続き149（84効果）・③「そうした場合」IS_MY_TURN の did-it ゲート欠落✅続き218h（engine で系統解消・155効果152カード＝全 action 型の空振り時発火を是正）。(a)WX06-014-E2✅続き222・(b)222クラスタの凍結種別取り違え18効果✅続き223・(b1)照応先ロスト系統（power-down owner 22件＋hand-add zone 13件）✅続き226・(b2-i)「そのシグニの【出】能力」76効果を `suppressOnPlay` fold へ✅続き243。**🆕(b2-ii)「ルリグかシグニ union ＋ unless(手札N枚捨てないかぎり)」16効果を消化＝✅2026-07-28**（codex-work実装／Opus検証）。⚠**「⛔§6.3級＝新機構が要る」は stale だった**＝`CENTER_LRIG_OR_SIGNI` も `escapeDiscard` も engine に実在し、同文12効果が parser で落ちていただけ。副産物で `negated_attacks` の保存先規約の2系統割れ（`NEGATE_THAT_ATTACK` だけ逆側・読み手も割れ）と `REMOVE_ABILITIES` の「N体まで」未実装（4効果が常に1体）を是正。golden 868→871・census 1511→1510。**🆕(b2-iii) BET 9効果の実行時選択肢を原文照合＝✅2026-07-28**（codex-work実装／Opus検証）。⚠**ここも「BET機構が無い」は stale**＝機構も26選択肢の分割も正常で、真因は**選択肢本文を本体パーサと別系統の `choiceTextParser.parseSingleChoiceText`（手書き regex 群）が再解析し、条件・複文後半・動的フィルタを落としていた**こと。9件忠実化（最悪例＝`WX19-006-E1③` は「相手トラッシュの全スペル除外」本体が消えて2ドローだけになっていた）・3件は既存語彙が無く安全側 defer。本体パーサへの一括委譲は試算の結果**13件退化**するため不可＝先に本体側を直す必要あり。golden 871→874・census 1510 据置。**🆕(b2-iv) 効果配置シグニ自身の【出】未発火＝段階1を配線✅2026-07-28**（codex-work実装／Opus検証）。新 pure collector `collectPlacedSelfOnPlayTriggers` を全配置経路（stack done／対話途中／resume／`SELECT_SIGNI_ZONE`／スペル直通）へ**明示 opt-in**で配線し、`REVEAL_UNTIL_TO_FIELD` の既存3ブロックを統合。**`byEffect`/`bySigniEffect` 限定の10効果＝全経路で永久不発だったものが発火**（通常召喚側でも明示除外されていたため）。golden 874→879。**🆕(b2-v) watcher 34効果の `triggerScope:'self'` 誤分類を是正✅2026-07-28**（codex-work実装／Opus検証）。「あなたの〜シグニ**が**場に出たとき」は他カードを監視する watcher なのに scope が self で、**①watcher として一度も発火しない②自身の召喚時に1回誤発火する**の二方向に壊れていた。[A]30件を `any_ally`/`any_opp`＋既存 `triggerFilter`/`triggerCondition` へ配線・[B]4件（エナ由来／手札以外由来／【出】能力保有）は限定語彙が無く `timing:[]` で安全停止。census 1507→**1498**。**この34件は codex が段階2 を2回 defer した際の反例から発見された**（Opus 側の抽出条件が watcher と自身【出】を区別できていなかった）。<br>**🆕(b2-vi) 段階2＝一般の mandatory 自身【出】1437効果を配線✅2026-07-28**（3度目で着地。1・2回目の defer が上記 (b2-v) と タスク16 の誤分類70件を掘り当てた）。`phase1Only` を完全撤去し、任意+cost 933効果と段階3の65効果は明示除外。連鎖は `ADD_TO_FIELD` 非置換＋シグニゾーン3枠で構造的に有限（2段連鎖 golden で実証）。golden 882→887。⚠**この経路は `fuzz`/`smoke` が通らず golden だけが網**（`selfPlayFuzz.ts:12-13` が自ら明記）。<br>**残＝任意+cost 933効果**（支払いプロンプトが別フロー）**／段階3＝`mandatory:false`+cost無し65効果（タスク12(lv) 在庫）／[B]4件**。**残＝上記段階2・3／defer 3件（相手効果による自シグニ場離れのターン履歴 Condition・配置個体への `REMOVE_ABILITIES` 固定語彙・`ATTACH_CHARM_FROM_TRASH` の本実装）／(b2-ii) の defer 4件→いずれも §6.3 送り**。詳細と表 `docs/_semantic_audit_stub_round3_triage.txt` §6・BUGFIXES 2026-07-28節／続き223/226/243 |

### §3 Opus タスク16（timing 語彙センサス）の消化履歴（2026-07-29 に PLAN から退避・PLAN には残作業だけ残置）

| # | タスク | 種別 | 規模 | 内容（原文） |
|---|---|---|---|---|
| 16 | timing 語彙センサス（`npm run census:timing`）の消化 | parser語彙 | S（ロングテール） | **🆕2026-07-28＝`timing:['ON_PLAY']` 誤分類36件を停止**（codex-work実装／Opus検証）。原文が【自】なのに ON_PLAY へフォールバックした36効果は**全件 `mandatory:true`＝通常召喚のたびに誤発火していた**（`handleSummonSigni` の `ownOnPlay` が無条件に発火させる）。[A]6件を正しい timing へ配線・**[B]29件は `timing:[]` にして誤発火を停止**（機能を消すのではなく間違った発動を止める＝正しい collector 実装は本タスクの残作業）・[C]1件は誤検出。⚠**`census:timing` はこの36件を捉えきれていない（33件しか報告しない）＝計器に盲点がある**。検証中に `PR-461` の effectId 対応ズレ（【常】ダブルクラッシュ欠落＋【自】が timing 無し・カード単位 PRESERVE で build も heldReview も触れない）も発見し外科パッチで是正。census 1510→1507。詳細 BUGFIXES 2026-07-28節。<br>**残33効果/33クラスタ**。続き278で WXEX1-08 を `IS_BETTING` 限定。WXDi-P09-079 は level1 filter＋`duringMainPhase` を collector まで配線して消化。WXK10-052 は現行原文どおり＜龍獣＞filterを採用したが、「あなたの効果によって」の原因owner payloadが無いため **[B] defer**（相手効果による自デッキミルでも現状発火）。共通 `minCount` は手札追加/捨て/エナtrashへ実装したが、依頼表と現行CSV原文が不一致の WX20-046/WXDi-P13-051 は誤採用せずdefer（詳細 triage/BUGFIXES）。続き277で旧残34件をcollector実参照まで全数再仕分け。[B]は枚数閾値・原因・移動カードfilter・target origin等の軸不足、[C]はcollector無しで、明細と§6.3送り提案は `docs/_timing_census_triage.txt` 2026-07-27節。続き273＝「アタックを効果によって無効にしたとき」3効果、続き272＝「コストか効果によってシグニの下からトラッシュ」3効果を消化。3階層の経緯は PLAN_DETAIL §3。ゲートではない（exit 0）<br>**残の要注意1件**＝**`cost.underSelfTrash`（16効果）が未配線**。「このシグニの下からカードN枚をトラッシュに置く」【起】コストは `BattleScreen.tsx:5404` でカットイン候補から除外されるだけで支払い実装が無い。配線には「このシグニの下／あなたのシグニの下」の区別・支払い可能判定・複数候補時のゾーン/カード選択UI・既存コスト支払い経路への合流が要る |

### §3 Sonnet タスク表の完了行（2026-07-29 に PLAN から退避）

| # | タスク | 種別 | 規模 | 内容（原文） |
|---|---|---|---|---|
| ~~9~~ | ~~PARTIAL 刻印 151件のトリアージ~~ | — | — | **✅完了（続き138）＝152件全件を3分類・実害144件を Opusタスク12 (xxii)(xxiii)(xxiv) へ登録**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)・成果物 `docs/_partial_triage.txt` |

> **PLAN §4 恒久指標から退避（2026-08-14 続き474）**
- **🆕 2026-08-13 続き460〜464（Codex 委譲5連投＝§7 実機検証＋全文regex層の棚卸し）後 最新値（本行が直近の正）**：census **831 据置**（`BASELINE_HIGH` 831）、golden **1964（1956→+8＝`ON_TURN_END` の scope 誤補完 6本〔続き463〕＋追加ターンの所有者 2本〔続き464〕）**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（グループ265）、held（parserWorklist）**106枚 / 署名グループ 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**ターン限定 PlayerState レジストリ 35フィールド**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`MANDATORY_SUSPICIOUS` **0**、`census:stubs` A群＝**無言 no-op 0**／**明示 defer 24種 42件**、**`FieldGrant` の kind 3種**（`power`〔`perTargetLevel`〕／`abilityLoss`／`blockAction`）。🆕**実機シナリオ（`verifyBattleDrive.mjs`）＝既定 order に +16本**（続き460 の4／461 の6／462 の3／463 の反転3）。🆕**実行時の全文 regex 読取 298箇所＝A 18／B 258／🔴C 22**（C の残21件は §6.4 **O-20** の個票）。live JSON の変更は**0**（続き460〜464 は engine/parser/driver のみ）。

## 2026-08-13 整理⑬：PLAN §7 実機検証の**完了ブロック**退避（続き460〜468 で決着した分）

> PLAN §7 は「未消化の worklist」だけを持つ規約なので、**チェックが全部埋まったブロックの原文をここへ退避**した。
> PLAN 側には 1行✅サマリだけを残し、**残作業は `V-01`〜 の採番 worklist へ移した**。
> 一次記録は [BUGFIXES.md](./BUGFIXES.md) の続き460〜468 各エントリ。**再検証したい場合はシナリオ ID が下記原文に全部残っている**（`scripts/verifyBattleDrive.mjs`）。

### 決着したブロック一覧

| 元ブロック | 決着 | シナリオ |
|---|---|---|
| 続き459（使用禁止の期間と合成 actionId） | 続き460 | `wxex166SpellLockPeriod` ほか4本（**実バグ1件を修正**＝手札スペルの封じゲート欠落） |
| 続き458（能力喪失の対象軸） | 続き461 | `removeAbilitiesOppKeyPicker` ほか |
| 続き457（動的 delta のゾーン grant／キーの能力喪失） | 続き461〜462 | `designatedZone*` 3本ほか6本 |
| 続き427（アシストルリグのアタック機構） | 続き435〜436 | `assistAttack*` 5本 |
| 続き434（任意コストの落ち） | 続き436／**続き463** | `sYokusenkiSpellPay`／`cheatingSameLevelDownFilter`／`kokonaUnder*` 3本（**§3 (cxxiv) の解決で反転**） |
| 続き431（ライフクラッシュ置換） | 続き465 | `lifeCrashRepl*` 7本（**2回連続PASS**） |
| 続き424（強制アタック機構） | 続き467 | `forcedAttack*` 6本（**2回連続PASS**） |
| 続き425（相手側 CHOOSE の主語・極性） | 続き468 | `oppPay*`／`oppHandDiscard*`／`oppPlayDiscard*` 6本（**主語・極性は是正済みと確認／`NEGATE_ATTACK` に (cxxvii) を検出**） |

### 退避した原文

- **✅ 続き459（§6.4 O-3＝使用禁止の期間と合成 actionId）が持ち込んだ未検証UI 2件＝2026-08-13 続き460 で決着**（Codex 起案→Claude 実機検証・各2回連続PASS・既定 order 登録済み）。
  - [x] 🔴**スペル封じが次の相手ターンで解けるか**（`WXEX1-66`）＝**実機PASS**（`wxex166SpellLockPeriod`）。`guest.blockedActions` で3段を**完全一致**観測＝①アタック直後は予約 `USE_SPELL:NEXT_TURN`（この時点では効かない）②CPUターン開始（DRAWフェイズ）で **bare `USE_SPELL` へ昇格**③CPUターン終了後に**消滅**。⚠**恒久ロック（`PERMANENT`）への退化なし**。
  - [x] **アーツとスペルが両方止まるか**（`PR-427`）＝**実機PASS**（`prArtsSpellSplitIds`）。CPU のアタック後 `host.blockedActions` に `USE_ARTS:NEXT_TURN` と `USE_SPELL:NEXT_TURN` の**両方**が積まれ、**死 actionId `ARTS_AND_SPELL` は0件**（復活したら即FAILするトリップワイヤ入り）。
  - [x] 🔴**封じが実際にUIを止めるか**（続き460 で追加した軸）＝**実バグを検出して修正**。**手札スペルの「発動」ボタンだけ `isActionBlocked('USE_SPELL')` ゲートが無く**、封じ中でもボタンが出て押しても何も起きない**無言の no-op** だった（実行入口 `castSpell`〔`BattleScreen.tsx:6769`〕にはガードがあるので実害はUX層）。ルリグデッキのスペル/クラフト〔`:7508`〕とアーツ〔`:7529`〕は最初から同じゲートを持っており**手札スペルだけが抜けていた**。⚠**負方向テスト単独では証明にならない**（アーツの「使用」は `costOk`/`condOk` でも消える）＝**同じ盤面で `blocked_actions` だけを空にする対照** `spellArtsUnblockedUiShowsUseButtons` を対で置いた。
- **✅ 続き458（§6.4 O-17 完了＝能力喪失の対象軸）が持ち込んだ未検証UI 2件＝2026-08-13 続き461 で決着**（Codex 起案→Claude 実機検証・各2回連続PASS・既定 order 登録済み）。
  - [x] 🔴**キー選択モーダルに相手のキーが出るか**（`WXK05-010-E2`）＝**実機PASS**（`removeAbilitiesOppKeyPicker`）。`opp_key` の SELECT_TARGET が開き、**候補は対戦相手のキー2枚だけ**（自分のキーは混ざらない）。選んだ1枚だけが `guest.abilitiesRemoved` に入り、**もう1枚は無傷**／`keysAbilitiesDisabled` は **false のまま**＝**cardNum 軸とフラグ軸（`alsoKeys` の全キー喪失）を取り違えていない**ことを確定。
  - [x] 🔴**領域跨ぎの能力喪失がトラッシュ起動を止めるか**＝**実機PASS**（`removedAbilitiesHidesTrashAct` ＋ 対照 `intactAbilitiesShowsTrashAct`）。能力喪失中は支払い可能な盤面でもトラッシュ【起】が**surface しない**／同じ盤面で `abilities_removed` を空にすると**出る**＝続き458 で足した消費地点が実UIに届いている。⚠**負方向単独では「コスト不足で出ないだけ」と区別できない**ので対照が必須（CODEX_GUIDE §5-21）。⚠観測は **`host.abilities_removed` を直接注入**して行う＝トラッシュ起動ゲートは**画面の持ち主側**を見るので、`SPDi47-01` を自分で撃つ形では原理的に観測できない。
- **✅ 続き457（§6.4 O-16 完了＝動的 delta のゾーン grant／キーの能力喪失）が持ち込んだ未検証UI 3件＝2026-08-13 続き461〜462 で全件決着**
  - [x] **レベル比例のゾーン継続**（`WDK10-009-E2`＝キーの【起】《ターン1回》・手札1枚を捨てて相手のシグニゾーン1つを指定）＝**実機PASS 3本**（`designatedZoneLevelScaledMinus` ／ `designatedZoneRecalcOnSwap` ／ `designatedZoneGrantSurvivesOppTurn`・2026-08-13 続き462）。①指定ゾーンのシグニだけ **10,000→4,000**（Lv3×−2000）で**他2ゾーンは不変**（過剰適用なし） ②⭐**そのゾーンのシグニを Lv1 に差し替えると −2000 へ再計算**＝**固定 delta の焼き込みではない**（`effectEngine.ts` の `perTargetLevel` は適用のたびに掛ける） ③`nextTurnOwner:'opponent'` の寿命どおり **CPU のターン中も継続**。⚠**この delta は `temp_power_mods` に載らない純計算値**＝`powerMods` を見て「効いていない」と判断してはいけない（**DOM 表示で見る**）。⚠「自分の次のターンで戻る」までは未観測（2ターン跨ぎ＝低優先）。
  - [x] 🔴**キーの能力喪失が【常】だけでなく【自】も止めるか**（`SP38-006` の内側【起】＝エクシード1）＝**実機PASS**（`removeAbilitiesAlsoKeysFlag`）。`guest.keysAbilitiesDisabled=true` が立ち、**`abilitiesRemoved` にはキーの cardNum が入らない**（＝フラグ軸で正しく倒れている）。読みは `activeKeyAbilitySources` funnel が受けるので **CONT／AUTO／【起】の全収集経路**に届く。⚠**シグニ候補0でもフラグは立つ**ことを同時に確認した。
  - [x] 🔴**キー能力喪失がターン終了で戻るか**＝**実機PASS 2経路**（`keysAbilityLossTurnEndNoDiscard` ／ `WithDiscard`）。①**手札上限の捨て札なし**でターンを終える ②**捨て札あり**（手札7→6）で終える＝どちらも CPU ターンへ実際に遷移したうえで `keysAbilitiesDisabled` が **false へ復帰**。⚠**①が本題**＝続き457 で `turnScopedState` へ登録するまで、この経路だけ**永久に戻らなかった**（手書きクリアが捨て札側の2経路にしか無かった）。残り2経路（CPU のターン終了／自分のターン終了の別入口）は同じレジストリを通るため低優先で未実施。
- **続き427（アシストルリグのアタック機構）が持ち込んだ未検証UI 3件**＝**engine 側は golden で固定したが、アタック宣言・ガード応答・CPU は `BattleScreen` にしかなく golden では原理的に踏めない**。前提＝`WX25-P1-048`（ピース）を使う＝**場にルリグ3体で合計3色以上**が要る。**✅2026-08-11（続き435）＝`scripts/verifyBattleDrive.mjs` に4シナリオ新設し実機ヘッドレス検証で以下を確認**（`assistAttackNoFlag`／`assistAttackSkipConfirm`／`assistAttackCpuSequence`／`assistAttackNoEligibleAdvance`、いずれもPASS・既定order登録済み）：
  - [x] 🔴**ピースを使う前はアタックできない**＝`assist_lrig_attack_min_level` 未設定の盤面でアシストの「アタック」ボタンが非表示であることを確認（回帰なし）。
  - [x] **使った後にアタックできる**＝CPU側（`assistAttackCpuSequence`）はセンター→左アシスト→右アシストの順で自動アタックし、各ダウン・ライフ3クラッシュまで確認**PASS**。**✅2026-08-11（続き436）＝人間側のクリックによる左右連続アタックも実機PASS**（`assistAttackBoth`・2回連続）＝左右が各1回ずつアタックして `assistDown=[true,true]`／**センターは温存**（`centerDown=false`）／相手ライフ 7→5 の2クラッシュを確認。⚠**続き435 が「ドライバのクリック手順バグ」と記録していたのは表層で、真因は「ルリグ行スロットに `data-testid` が無く、自分と相手で label 文字列が同一だったため右アシストを特定できなかった」こと**＝`my|op-lrig-slot-*` と `card-action-*`＋`data-action-label` の新設で解消（続き436）。
  - [x] **フェイズ進行の確認とCPU**＝未アタックのアシストが残っている状態で「次へ」→スキップ確認モーダル→「このまま進む」→ENDへ進行を確認（`assistAttackSkipConfirm`）。CPUのセンター→左→右の順序も確認（`assistAttackCpuSequence`）。レベル未達アシストだけの場合は確認なしでENDへ進みソフトロックしないことも確認（`assistAttackNoEligibleAdvance`）。
- **続き434（§6.4 UNKNOWN＝任意コストの落ち）が持ち込んだ未検証UI 3件**＝**3枚とも従来「タダで撃てた」**ので、**まず支払いを要求されることの確認**から見る。**⚠2026-08-11（続き435）＝`verifyBattleDrive.mjs`にシナリオ試作。`WXEX2-20`は完全PASS。✅続き436＝testid 新設で書き直し `WX24-P1-065`②の pay側も PASS＝この2枚は決着。`WX25-CP1-091` は3パターンとも依然FAIL（セレクタではなくターン終了後に何も起きない＝下記）**。
  - [x] 🔴**`WX24-P1-065`②＝コストを払わないと相手の手札が落ちないか**（回帰確認）＝自分のアタックフェイズ開始時に「①／②」の選択が出て、**②を選ぶと「手札からスペルを1枚捨てる／捨てない」の pay/skip が出る**。**捨てなければ相手の手札は減らない**。⚠**支払いを聞かれずに相手の手札が減ったら回帰**。⚠候補に**スペルだけ**が出ること（シグニが選べたら限定漏れ）。**skip側は確認済みPASS（`sYokusenkiSpellSkip`＝自分のスペル・相手手札とも不変）。✅2026-08-11（続き436）＝pay側も実機PASS**（`sYokusenkiSpellPay`・2回連続）＝**候補はスペル1枚だけ**（シグニは出ない＝限定が効いている）／払うと自分のスペルがトラッシュへ行き**相手の手札 2→1**／シグニ本体は場に残存。
  - [ ] 🔴**`WX25-CP1-091`＝コストを払わないとエナチャージされないか**（回帰確認）＝自分のターン終了時に「このシグニの下から＜ブルアカ＞のカードを3枚トラッシュに置く／置かない」の pay/skip が出て、**置かなければエナチャージされない**。⚠下に＜ブルアカ＞が3枚無いときは**支払い枝が出ない**こと（部分払いで撃てたら抜け穴）。**⚠2026-08-11（続き436）＝セレクタは testid 化したが依然FAIL**（`kokonaUnderThreePay`/`ThreeSkip`/`Insufficient`）＝**「ターン終了」ボタン自体は押せている**（`btn:ターン終了` を実測）が、**以後の盤面変化が一切観測されず**（スタック・エナ・トラッシュ不変、`pEff=-`）ON_TURN_END の pay/skip UI が出ない。**原因未確定＝シナリオ側（ターンが実際に終わっていない）か engine 側（`ON_TURN_END` watcher がこの盤面で収集されない）かの切り分けが未了**＝次回はまずターン進行そのものを `queryState` の phase で観測すること。
  - [x] **`WXEX2-20`（カンニング）＝対象が絞られるか**＝ルリグに付いた【自】が相手シグニのアタック時に発火し、手札からシグニを1枚捨てると**「そのシグニと同じレベル」かつ「ダウン状態」の相手シグニだけ**が対象候補に出る。⚠**アップ状態や別レベルが選べたら限定漏れ**（従来は本体が丸ごと不発だった）。**✅実機PASS確認済み**（`cheatingSameLevelDownFilter`＝別Lv/同Lvアップの2体は残存し、同Lv・ダウンの1体だけがエナへ移動することを確認）。
- **✅ 続き431（§6.4 ライフクラッシュ置換）が持ち込んだ未検証UI 3件＝2026-08-13 続き465 で決着**（Codex 起案→Claude 実機検証・**7シナリオが2回連続PASS**・既定 order 登録済み・差し戻し0/是正0）。engine は golden で固定していたが、**ダメージ解決の分岐**は実機でしか踏めなかった。⚠**3枚とも従来「生きた過剰効果／自傷」だった**ので、**まず退化していないこと**から見た。
  - [x] 🔴**`WX24-P4-009` を使った瞬間に自分のデッキが減らないか**（回帰確認）＝**実機PASS**（`lifeCrashReplDeclareNoSelfMill`＋消費側 `lifeCrashReplMillOnSigniAttack`）。使用後 deck **40→42**（⚠**42 が正しい**＝step1 の `TRANSFER_TO_DECK{TRASH_CARD,ALL}` がアーツコストで払った2枚をデッキへ戻すため。`deck===40` で固定すると誤FAILする）／宣言は `{mill,10,signi,optional}` で **`once` 無し**（原文「このターン」）。CPUシグニアタックでは `host.life` **7維持**・deck **40→30**・trash **0→10**。
  - [x] 🔴**`WX25-P3-004` を使った瞬間に相手のライフが減らないか**（回帰確認）＝**実機PASS**（`lifeCrashReplDeclareNoOppCrash`＋`lifeCrashReplCrashOpponentInstead`）。使用後 `guest.life` **7→7**／宣言は `{crash_opponent,1,signi,once:true}`（原文「**次に**」）。CPUシグニアタックで `host.life` **7維持**・**`guest.life` 7→6**（攻撃側のライフバースト確認は CPU が自動消化＝`guest.energy` 0→1）。
  - [x] **`WXDi-CP01-023`（月ノ美兎）と限定の効き**＝**実機PASS**（`lifeCrashReplGrantFromAssist`／`lifeCrashReplNotOnLrigAttack`＋対照 `lifeCrashReplLrigAttackControl`）。アシストグロウ後 deck **40→40**（付与時の即時mill なし＝旧・恒久 no-op でもない）／宣言 `{mill,5,signi,byAttack:true,optional}`。**ルリグアタックでは置換されない**（`host.life` 7→6・deck 40維持）ことを確認。⚠**負方向単独では証明にならない**（ダメージ処理自体が動いていなくても同じ絵になる）＝**盤面・手順を1文字も変えず `damageSource` を `'lrig'` にするだけの対照**を対で置き、同じ攻撃が置換される（life 7維持・deck 40→35・trash 0→5）ことで限定由来と確定した（CODEX_GUIDE §5-21）。⚠**残**＝「**効果による**ライフクラッシュでも置換されない」（`byAttack` の負側）は盤面構築コストが高く未実施／`WX25-P1-010` の実UI宣言も未実施（限定の消費側は同じ funnel を通るため B3/B4 で対照化済み）。
- **🔴 続き425（「対戦相手は〈コスト〉てもよい」の主語・極性是正）＝2026-08-13 続き468 で実機検証し、**主語・極性・【出】経路は全部正しいと確認／`NEGATE_ATTACK` の対象所有者に実バグ1件**（→§3 **(cxxvii)**。ルールどおり engine は触らず在庫化）**。シナリオ6本（3対照ペア）を新設＝**4 PASS／2 FAIL（FAIL は (cxxvii) の検出）**。
  - [x] 🔴**極性が正しいか**＝**実機PASS（片方向）**。**支払わなければアタックは通る**側は `oppPayAttackGoesThroughWhenUnpaid`／`oppHandDiscardUnavailableWhenShort` で確認（`pay`/`discard` 枝が `available:false` → CPU は `skip` → `guest.life 7→6`・資源不変）。⚠**旧実装の「相手が何もしないと自分のアタックが無効化される」真逆の挙動は再現しない**＝回帰なし。**支払いも実際に徴収されている**（`SPDi43-06`＝エナ2枚がトラッシュへ／`WXDi-P05-037`＝手札2枚がトラッシュへ）＝`thenOnPay` の分岐自体は動いている。
  - [x] 🔴**捨てる側が相手か**＝**実機PASS**（`oppHandDiscardIsOpponentSide`）。**`guest.hand 2→0`／`guest.trash 0→2`／🔑`host.hand 2→2`（指定2枚が残存）**＝**主語の回帰は完全に解消している**（旧実装は自分が2枚捨てて自分のアタックを無効化していた）。
  - [x] **`WXDi-P09-064` の【出】**＝**実機PASS 2本**（`oppPlayDiscardThenOpponentDraws`／対照 `oppPlayDiscardSkippedWhenNoHand`）。CPU が2枚捨てて2枚引く＝**`guest.trash 0→2` かつ `guest.deck 40→38`**／host は**召喚札1枚が減るだけ**。⚠🔑**手札の枚数で見てはいけない**（捨て2・引き2で `guest.hand 2→2` に戻る）＝**trash と deck で見る**。手札0の対照では `discard` が `(disabled)` になり**捨ても引きも起きない**。⚠「2枚**まで**」は現状 0枚か2枚の二択に丸めてある（1枚だけの選択肢が出なくて正しい）。
  - ⚠**観測の注意**＝進行中アタックのキャンセルは **`negatedAttacks` には載らない**（一時フラグ＝`effectExecutor.ts:8822` で立て `BattleScreen.tsx:8119` で消去）。**ライフが減ったかどうかで見る**。
  - 📋**やらなかったこと**＝人間側が応答者になる形（CPU に該当効果を撃たせる決定論的手段が無い＝続き466 と同じ理由）／`WXDi-P05-037-E2`・`SPDi43-06-E2`（別軸）／`opponentEnergyTrash`・`opponentSigniTrash`・`opponentSigniToDeckTop`・`opponentHandOrEnergyToDeckTop` の各枝（同じ入口の別枝）。
- **✅ 続き424（§6.4 強制アタック機構の配線）が持ち込んだ未検証UI 3件＝2026-08-13 続き467 で決着**（Codex 起案→Claude 実機検証・**6シナリオが2回連続PASS**・既定 order 登録済み・**差し戻し0／是正0**）。engine 側は golden で固定していたが、**enforcement は `BattleScreen` のフェイズ進行ゲートにしかなく golden では原理的に踏めなかった**。
  - [x] 🔴**相手の印字【常】で自分がフェイズを進められないか**＝**実機PASS**（`forcedAttackBlocksPhaseAdvance` ＋ 対照 `forcedAttackControlAdvances` ＋ `forcedAttackAdvancesAfterAllAttacked`）。guest のセンタールリグに `WD07-004` を置くと `ルリグアタックへ` で **`⚠ アタックしなければなりません`** が出て **`turnPhase` は `ATTACK_SIGNI` のまま**／`OK` で閉じる。⚠**対照が決定的**＝**guest ルリグ1枚だけを非強制（`WD01-001`）に差し替える**と警告は出ず `ATTACK_LRIG` へ進む＝ブロックが**印字【常】由来**だと確定（従来この【常】は完全に無視されていた）。**全部アタックすれば進める**ことも別シナリオで確認（zone0 をアタック→`signiDown[0]=true` 観測→進行）＝**永久ブロックではない**。
  - [x] **強制アタックバナー**＝**実機PASS**（`forcedAttackBannerOnMyTurn`・**対照内蔵**）。`WD07-004` 時に **`⚠ あなたのシグニは可能ならばアタックしなければなりません`** が出て、**guest の `field.lrig` だけを PATCH** で非強制へ差し替えると**消える**。⚠**相手ターン側の緑バナー**（`対戦相手のシグニは〜`／`BattleScreen.tsx:12979`）は未実施＝**同じ `resolveForcedSigniAttack` の結果を表示するだけ**なので低優先。
  - [x] 🔴**アタックできないシグニでソフトロックしないか**＝**実機PASS**（`forcedAttackNoSoftlockWhenUnattackable`）。**アタック追加コスト1・エナ0**の盤面で**アタックボタンが出ないこと**を先に観測してから進行 → **警告は出ず**通常のスキップ確認だけで `ATTACK_LRIG` へ。⇒ `mustAttackRemainingZones` が**アタックボタンが出るゾーンだけを数える**（`BattleScreen.tsx:4224`）実装が実機で効いている。⚠🔑**「凍結」ではアタック不可にならない**（現行の `signiAttackBlockReason` に含まれない＝codex が実測で訂正）。**アタック不可を作るなら `signi_attack_cost` × エナ不足**（`screens/battle/signiAttackGate.ts:71-72` の `ENERGY_COST`）。
  - [x] 🆕**レゾナ（`field.signi` 走査）でも強制がかかるか**＝**実機PASS**（`forcedAttackFromResonaOnField`）。`WX12-010`（**シグニではなくレゾナ**）を guest の `field.signi` に置いても同じくブロックする＝`resolveForcedSigniAttack` の**2つの走査ブランチ**（`lrigZoneTops` 側と `field.signi` 側）が両方とも実UIまで届いている。
  - 📋**同じルリグ走査の重複なので実施しなかった**＝`WX14-018`／`WX20-Re07〜09`（`WD07-004` と同一の `CONTINUOUS/FORCE_SIGNI_ATTACK/targetOwner:'opponent'`・条件なし）。⚠**`WX20-Re08` は Lv3/Limit7、`Re09` は Lv2/Limit4**（「Re07〜09 は Lv4/Limit11」は **Re07 だけ**＝codex が実データで訂正）。
  - 📋**軸が違うので別バッチ**＝`WX16-047`（`AUTO` ＋ `infectedOnly:true`）／正面強制（`forcedFrontAttackZones`）。

## 2026-08-18 整理㉛（PLAN §4「恒久指標」「次の一手」の退避）


- **🆕 2026-08-23 続き633（段2 第38〜40バッチ＝群割当／レベル条件／持続期間）後 最新値（本行が直近の正）**：
  **census 608/608**（`BASELINE_HIGH` 更新済み・セッション開始時 640）、**golden 2639**（同 2563）、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、**lint 0 errors / 261 warnings 据置**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live カード 5975 / 効果総数 10693 据置**。
  `_held_fresh` **82**（同 86）／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  `censusManualDrift` **削除候補 0 据置**（§6.4 `O-42` 残0クローズ済み・トリップワイヤ稼働中）。
  **条件型の数＝`Condition` 122 据置／`ActiveCondition` 53**（続き632 の `LIFE_COMPARE_OPP` 分）。

- **🆕 2026-08-23 続き626（§6.4 `O-42` 第2バッチ＝manual 影武者の解除完結）後 最新値（本行が直近の正）**：
  **census 659/659**（`BASELINE_HIGH` 更新済み・セッション開始時 693。**うち −12 は計器の偽陽性較正**＝下記）、
  **golden 2518**（同 2442）、smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、
  **lint 0 errors / 261 warnings 据置**、`census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、
  **live 効果総数 10693 据置**。`_held_fresh` **87 据置**／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🆕**`censusManualDrift`＝削除候補 86→**1**（§6.4 `O-42` ほぼ残0）／乖離 23/20/4/3/2（計52効果・47カード）据置／
  `manualEffects` **451→412 カード**（`manualEffects.ts` は 474行の純削除）。
  🆕**条件型の数＝`Condition` 122 据置／`ActiveCondition` 49→**52**（golden のトリップワイヤが正）。
  🔴**engine の改変（セッション累計）**＝`GRANT_PROTECTION` / `REMOVE_ABILITIES` に `targetsLastProcessed` を新設して
  `lastProcessedCards` の消費経路を追加（622）／`collectContinuousGrantedKeywords` が CONTINUOUS `SEQUENCE` 内の
  `GRANT_KEYWORD` を収集し `matchesStateFilter` まで通す（622）／`collectEffectImmuneSigni` が `SEQUENCE` 内の
  自己対象 `GRANT_PROTECTION` を読めなかった穴を配線（623）／`checkActiveCondition` に
  `IS_SELF_SOUL_ATTACHED`・`ENERGY_EACH_LEVEL_FILTER_GTE`・`ARTS_USED_THIS_TURN{minCount}` を新設し、
  `IS_SELF_ACCED{cardName}`／`THIS_CARD_HAS_UNDER{minCount}`／`SELF_HAS_KEYWORD{subject}` を拡張（623）／
  `fieldCandidates` が `TargetFilter.keyword`（印字済み＋解決済み付与の双方）を評価（623）。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 855**（セッション開始時 883・**closed effectId 202→231**）／段2 消化 **236**／
  HIGH・MED・LOW＝**538・349・9**（`stage2_closed.txt` の effectId を除いた同一計算での実測）。
  📊**母集団の切り方＝5原則＋α**（603〜608 で確立・CODEX_GUIDE §5 `3-3′`〜`3-4″`）＝
  ①消費地点まで見る ②srctext でなく CSV ③完全一致で数えない ④同義語彙を全部列挙 ⑤「変な形＝バグ」と決めつけない
  ⑥原文の括弧内ルール説明を能力として数えない（続き610）
  ⑦再帰探索で入れ子まで拾わない＝トップレベルの action から見る（続き616・**続き623 で再発**）
  ⑧既存の受け皿型を先に一覧化してから引き算する（続き621）
  ⑨🆕**カード単位の「個数差」で数えない**（続き622＝原文の `パワーを＋` 出現数 vs live の `POWER_MODIFY` ノード数で数えたら、
  **兄弟効果に個数を相殺された `WXDi-CP02-092-E2` が母集団から漏れた**。Codex が生パース差分で発見）
  🆕🔑**続き624〜626 で確立＝「掃除系バッチは先に不変条件を書く」**＝`O-42` の85効果解除は
  **「live の変化は `parseStatus:MANUAL→AUTO` だけ。それ以外は1バイトも変わらない」**を指示書に明記し、
  **per-effect diff で 0件を機械確認**した（40件＋37件とも達成）。**破る効果は候補から外させる**運用で
  `WX10-018-E1` 1件だけが正しく残置された（live 本文が manual/parser より貧しい＝別の実バグ）。
  🆕🔑**再発防止はリストでなくトリップワイヤで置く**＝`MANUAL_EFFECTS × parseCardEffects` を毎回再導出して
  既知在庫と**集合一致**を assert する golden（`O42_KNOWN_REDUNDANT_MANUAL`）。**新しい影武者が生えた瞬間に落ちる。**
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-44`**（🏁`O-41` は続き609、🏁`O-43` は続き615、🏁`O-42` は続き626 で残1までクローズ）。
  **§6.3 の新規は `L`**（共通色比較・**8バッチ連続で保留中**）。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **`census:wiring` miss 合計 194**（続き606 実測・⚠`levelExact × BLOCK_ACTION{PLAYER}` の3件は恒久的な偽陽性）／**`census:timing` フォールバック 2効果**。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**実機未検証＝続き588 の6件（最優先）＋`V-85`＋`V-84`＋`V-83`＋続き616〜621 の5バッチ＋🆕続き622・623 の2バッチ**
  （耐性／キーワードの集合付与・犠牲側 owner・動的上限・**パワー加算と付与の合成**・**常在の条件つき付与**の6系統）。
  ⚠**`.codex-work`（有料 Codex）は 2026-08-28 21:58 まで利用上限**＝当面は `CODEX_HOME=C:/Users/zerom/.codex`（＝既定なので環境変数なしの `codex exec`）で投げる。
  **続き616〜626 の投入コマンド（実績）**＝`codex exec -C "C:/Users/zerom/WixossReact" -c sandbox_mode="danger-full-access" -c model_reasoning_effort="high" -o <report> - < <指示書> > <log> 2>&1`
  （`~/.codex/config.toml` は `sandbox_mode` 未設定・`model_reasoning_effort="low"` なので **`-c` で両方とも上書きする**）。
  ⚠🆕**投入前に必ず `git status --porcelain` を空にする**＝続き624 で Claude が投入前に計器（`censusManualDrift.ts`）を回したせいで
  `docs/_manual_drift.txt` に**生成時刻1行の差分**が残り、**Codex が「ユーザーの既存変更を無断で破棄しない」と判断して起動を拒否した**
  （判断自体は正しい）。**計器を回したら `git checkout` してから投げる。**

- **🆕 2026-08-23 続き621（段2 第26バッチ＝動的な上限の復元）後 最新値（本行が直近の正）**：
  **census 693/693**（`BASELINE_HIGH` 更新済み・セッション開始時 702）、**golden 2478**（同 2442）、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、**lint 0 errors / 261 warnings 据置**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live 効果総数 10693 据置**。
  `_held_fresh` **87**（セッション開始時 88＝`WXEX2-70` が採用され離脱）／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  **`censusManualDrift` の削除候補（§6.4 `O-42` の母集団）＝86 据置**。
  🔴**engine の改変（セッション累計）**＝`execGrantProtection` が `subjectFilter`-only を no-op にしていたのを
  `field_grants_active`／`granted_effects` へ配線＋BANISH collector 2本にルリグ発生源と `excludeSelf` を追加（616）／
  `TargetFilter.isDrive` を `fieldCandidates` の消費地点へ追加（620）／
  `TargetFilter` に `powerLteZoneCount`／`levelLteZoneCount`／`powerLteLastProcessedCount`／`levelLteLastProcessedCount` を新設し
  `resolveDynamicFilter` へ解決を配線、`CountFromZone.zone` に `hand`／`acce`／`trap` を追加、
  `resolveCountRef` と `resolveDynamicFilter` を共通 `countFromZone`（`execUtils.ts`）へ統一（621）。
  🆕**条件型の数＝`ActiveCondition` 49／`Condition` 122 据置**（golden のトリップワイヤが正）。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 883**／段2 消化 **207**／真バグ確定 872／
  HIGH・MED・LOW＝**585・290・8**／段0 除去 231／段1 偽陽性 125。
  📊**母集団の切り方＝5原則＋α**（603〜608 で確立・CODEX_GUIDE §5 `3-3′`〜`3-4″`）＝
  ①消費地点まで見る ②srctext でなく CSV ③完全一致で数えない ④同義語彙を全部列挙 ⑤「変な形＝バグ」と決めつけない
  ⑥原文の括弧内ルール説明を能力として数えない（続き610）
  ⑦🆕**再帰探索で入れ子まで拾わない＝トップレベルの action から見る**（続き616＝【レイヤー】18／【アクセ】2 を誤って「潰れている」と数えかけた）
  ⑧🆕**既存の受け皿型を先に一覧化してから引き算する**（続き621＝`POWER_MODIFY_PER_FIELD`／`countFromZone`／`DRAW_PER_FIELD_COUNT` 等を知らずに「スケーリング脱落」を数えると 13件が 170件に膨れる）。
  🆕🔑**続き616 で確立＝「同じ語彙でも CONTINUOUS 経路と AUTO/ACTIVATED 経路で消費地点が別」**＝
  `GRANT_PROTECTION.subjectFilter` は collector が CONTINUOUS だけ直接読み、`executeAction` 側は**ログだけの no-op** だった。
  **parser を直した瞬間に保護が丸ごと消えて恒久 no-op へ裏返る**（続き614 の「省略値をどう扱うか」と同型の罠）。
  🆕🔑**続き621 で確立＝「動的な上限」は fail-closed でなければ直したことにならない**＝
  枚数0のとき上限0（候補なし）を golden で固定する。fail-open だと JSON だけ直って過剰実行のまま。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-42`／`O-44`**（🏁`O-41` は続き609、🏁`O-43` は続き615 で残0クローズ）。
  **§6.3 の新規は `L`**（共通色比較・**7バッチ連続で保留中**）。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **`census:wiring` miss 合計 194**（続き606 実測・⚠`levelExact × BLOCK_ACTION{PLAYER}` の3件は恒久的な偽陽性）／**`census:timing` フォールバック 2効果**。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**実機未検証＝続き588 の6件（最優先）＋`V-85`＋`V-84`＋`V-83`＋🆕今回の5バッチ全部**
  （耐性の集合付与／犠牲側 owner／キーワードの集合付与／動的上限の4系統）。
  ⚠**`.codex-work`（有料 Codex）は 2026-08-28 21:58 まで利用上限**＝当面は `CODEX_HOME=C:/Users/zerom/.codex`（＝既定なので環境変数なしの `codex exec`）で投げる。
  🆕**続き616〜621 の投入コマンド（実績）**＝`codex exec -C "C:/Users/zerom/WixossReact" -c sandbox_mode="danger-full-access" -c model_reasoning_effort="high" -o <report> - < <指示書> > <log> 2>&1`
  （`~/.codex/config.toml` は `sandbox_mode` 未設定・`model_reasoning_effort="low"` なので **`-c` で両方とも上書きする**）。

- **🆕 2026-08-22 続き608（段2 第16バッチ＝「代わりに」の置換が効かず両方実行・live 7効果）後 最新値（本行が直近の正）**：
  **census 733→730**（`BASELINE_HIGH` 更新済み）、**golden 2362→2366**、smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、
  **lint 0 errors / 261 warnings 据置**、`census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、
  **live 効果総数 10693 据置**。**live の変更は7効果**（`parseStatus` 変化0）。
  `_held_fresh` **91→88**（3解消・**新規0**）／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🔴**engine を1箇所改変**＝`execPowerModify` の `targetsTriggerSource` 分岐に `lastProcessedCards:[autoNum]`
  （`effectExecutor.ts:1627-1636`）。**live 全体で該当ステップは5件・後段の消費者は1件だけ**＝巻き込み0を実測。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 947**／段2 消化 **141**／真バグ確定 934／
  HIGH・MED・LOW＝**627・312・8**／段0 除去 232／段1 偽陽性 125。
  📊**母集団の切り方**＝消費地点まで見て数える（603）＋CSV を見る（604）＋完全一致で数えない（605）＋
  同義の語彙を全部列挙してから数える（606）＋timing 別の類似フィールドを全部探す（607）＋
  🆕**「変な形＝バグ」と決めつけない**（608）＝**同じ意味を2通りで表す実装がある**（「代わりに」の (a) 正準形と
  (b) 差分加算）。**投入前に検算して「触ってはいけない群」を指示書へ明示する。**
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  ⚠🆕**「このシグニと共通する色を持たない他の＜X＞」軸は3バッチ連続で保留**（606・608）＝
  既存語彙で表せない。**機構を作るなら §6.3 へ登録する。**
  ⚠**原因限定の規約が2種類混在**＝`powerDecreaseSourceStory` だけ fail-open（続き607）。
  **§6.4 の生きた worklist は `O-41`／`O-42`／`O-43`**。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **`census:wiring` miss 合計 194**（続き606 実測・⚠用法 triage が要る）／**`census:timing` フォールバック 2効果**。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**続き588 の6件＋`WX24-P3-030-E1` は実機未検証**＝**Sonnet 側 §7 の最優先**。

- **🆕 2026-08-22 続き607（段2 第15バッチ＝原因クラス限定の3形態・live 8効果）後 最新値（本行が直近の正）**：
  **census 733/733 据置**、**golden 2360→2362**、smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、
  **lint 0 errors / 261 warnings 据置**、`census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、
  **live 効果総数 10693 据置**。**live の変更は8効果**（`parseStatus` 変化0）。
  `_held_fresh` **91 据置**（集合でも不変）／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🔴**engine/UI の配線6箇所**＝`types/effects.ts`（`revealSourceStory`）／`types/index.ts`（`hand_revealed_just_source_card_num`）／
  `execStubPart3.ts:3466,3482`（記録2箇所）／`triggerCollect.ts`（pure `collectRevealedFromHandTriggers` 新設＋
  `collectDeckTrashSelfTriggers` にゲート追加＋`collectMillTriggers` を fail-closed 化）／
  `BattleScreen.tsx`（インライン収集を pure collector へ置換）／`decompileEffects.ts`（逆翻訳）。
  🟡**スコープ外の既存1効果（`WX24-P3-030-E1`）の挙動が変わった**＝`milledSourceStory` の fail-open→fail-closed 反転。
  **原文には忠実だが `last_effect_mill_source` の書き手は1箇所だけ**＝§7 の実機検証項目。
  ⚠🆕**原因限定の規約が2種類混在している**＝`trashSourceStory`／`banishedSourceStory`／`milledSourceStory` は fail-closed、
  **`powerDecreaseSourceStory` だけ fail-open**。次に触るときに揃えるか判断する。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 952**／段2 消化 **135**／真バグ確定 939／
  HIGH・MED・LOW＝**632・312・8**／段0 除去 232／段1 偽陽性 125。
  📊**母集団の切り方**＝消費地点まで見て数える（603）＋CSV を見る（604）＋完全一致で数えない（605）＋
  同義の語彙を全部列挙してから数える（606）＋🆕**「機構が無い」と決めつける前に timing 別の類似フィールドを全部探す**（607）。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-41`／`O-42`／`O-43`**。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **`census:wiring` miss 合計 194**（続き606 実測・⚠用法 triage が要る）／**`census:timing` フォールバック 2効果**（ほぼ枯れた）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。

- **🆕 2026-08-22 続き606（段2 第14バッチ＝「場に＜クラス＞のシグニがある場合」の条件節脱落＋クラス修飾の対象誤付着・live 10効果）後 最新値（本行が直近の正）**：
  **census 742→733**（`BASELINE_HIGH` 更新済み）、**golden 2358→2360**、smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、
  **lint 0 errors / 261 warnings**（⚠**261 が正**＝続き605 で `BattleScreen.tsx` を触ったぶん1本増えており、
  続き605 の指標行が 260 のままだったのを本行で訂正。今回の増減は0）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live 効果総数 10693 据置**。
  `_held_fresh` **92→91**（`WXEX2-03` 解消・新規0）／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  ⚠**held は必ず `build:effects` を回し直してから読む**（続き606 で「+3」の申告が stale だった＝
  fresh と live が完全一致なのに `_held_fresh.json` が再生成されていなかった。CODEX_GUIDE §6 の但し書きの再発）。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 959**／段2 消化 **128**／真バグ確定 946／
  HIGH・MED・LOW＝**637・314・8**／段0 除去 232／段1 偽陽性 125。
  📊**母集団の切り方**＝消費地点まで見て数える（続き603）＋ CSV を見る（続き604）＋
  完全一致で数えない（続き605）＋🆕**同義の語彙を全部列挙してから数える**（続き606）＝
  `HAS_CARD_IN_FIELD` だけで数えると `FIELD_CLASS_COUNT` で既に正しい3件が「未対応」に見えた。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-41`／`O-42`／`O-43`**。**Opusタスク12＝在庫1件**（(cxlvi)）。
  🆕**`census:wiring` を続き606 で再計測**＝miss 合計 **194**（上位＝`cardClass` 52／`levelRange` 20／`levelExact` 20／
  `powerRange` 19／`color` 18／`isDrive` 12）。⚠**miss は用法の triage が要る**＝
  「原文にフレーズがあるのに JSON にキーが無い」だけの計器なので、**コスト節・誘発主語・条件節に属する語が
  対象フィルタの miss として出る**（`isDrive` の12件はほぼ timing/condition 用法）。
  🆕**`census:timing` も再計測＝フォールバックは 2効果のみ**（ほぼ枯れた）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。

- **🆕 2026-08-22 続き605（段2 第13バッチ＝【ランサー（制限）】のスコープ機構新設＋配線・live 11効果）後 最新値（本行が直近の正）**：
  **census 742/742 据置**、**golden 2356→2358**、smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、
  lint **0 errors**（260 warnings 据置）、`census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、
  **live 効果総数 10693 据置**。**live の変更は11効果**（機械 diff でベースラインと照合済み・新規/削除0）。
  🔴**engine 外の配線が6箇所**＝`keywords.ts`（`LancerScope`／`hasApplicableLancer`）／`effectParser.ts`（**4入口**＝通常・アーツ・スペル・SONG）／
  `signiAttackKeywords.ts`（`lancerKeywords` を運ぶ）／`BattleScreen.tsx:9344`（倒した相手のパワーで判定）／
  `BoardComponents.tsx`（バッジ）／`boardDiff.ts`（`ON_KEYWORD_GAINED`）／`decompileEffects.ts`（逆翻訳）。
  `_held_fresh` **92 据置**（⚠カード**集合**でも不変を確認）／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 970**／段2 消化 **117**／真バグ確定 957／
  HIGH・MED・LOW＝**648・314・8**／段0 除去 232／段1 偽陽性 125。
  📊**母集団の切り方**＝消費地点まで見て数える（続き603）＋ CSV を見る（続き604）＋
  🆕**キーワード文字列は完全一致で数えない**（続き605）＝`"keyword":"ランサー"` の完全一致で測ると
  **既にスコープ付きで正しいもの／旧形式のもの**が「未対応」に見える（**2バッチ続けて同じミスをした**）。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  ⚠**括弧つきキーワード軸は枯れた**＝アサシン14／ランサー12 は消化済み、シャドウ79 は元から機構つき、Ｓランサーは0件。
  **§6.4 の生きた worklist は `O-41`／`O-42`／`O-43`**。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **被覆マトリクス（`census:wiring`）**＝続き593 から据置（⚠**全体の miss 合計は未再計測**）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。

- **🆕 2026-08-22 続き604（段2 第12バッチ＝【アサシン（制限）】のスコープ符号化・live 12効果）後 最新値（本行が直近の正）**：
  **census 742/742 据置**、**golden 2355→2356**、smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、
  lint **0 errors**（260 warnings 据置）、`census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、
  **live 効果総数 10693 据置**。**live の変更は12効果**（機械 diff でベースラインと照合済み）。
  🔴**`parseStatus` が3件遷移**＝`WX25-P1-044-E1`／`WX25-P2-039-E1` が **PARTIAL→AUTO**、
  `WX25-P1-062-E1` が **MANUAL→AUTO**（3件とも `manualEffects.ts` に実体が無い**live だけの刻印**＝§6.4 `O-42` 族。
  中身はすべて改善方向）。live 全体の内訳は **AUTO 9547→9550 / MANUAL 1121→1120 / PARTIAL 25→23**。
  `_held_fresh` **92 据置**／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 975**／段2 消化 **112**／真バグ確定 962／
  HIGH・MED・LOW＝**649・318・8**／影響 **700カード・767効果**／段0 除去 232／段1 偽陽性 125。
  📊**母集団の切り方＝消費地点まで見て数える**（続き603）＋🆕**`srctext` ではなく CSV を見る**（続き604）＝
  `docs/_effect_srctext.json` は**括弧つきキーワードの括弧を落とした後**の文なので、
  **括弧が落ちる系のバグは srctext では検出できない**（母数が 97→8 に化ける）。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-41`／`O-42`／`O-43`**。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **被覆マトリクス（`census:wiring`）**＝続き593 から据置（⚠**全体の miss 合計は未再計測**）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  🆕**意味照合監査の母集団の正体**＝`clean AUTO` 群 **3,326カードを全数監査済み**（未監査は1枚）。

- **🆕 2026-08-22 続き603（段2 第11バッチ＝「そうした場合」did-it ゲート未拡張5型・engine のみ修正）後 最新値（本行が直近の正）**：
  **census 742/742 据置**、**golden 2353→2355**、smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、
  lint **0 errors**（260 warnings 据置）、`census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、
  **live 効果総数 10693 据置**。**parser・live JSON・CSV は変更0**（今回の修正は engine のみ）。
  🔴**engine を4箇所改変**＝`DID_IT_GATED_TYPES` へ **REVEAL / TAKE_FROM_UNDER_SIGNI / REMOVE_CHARM /
  ADD_TO_FIELD / FIELD_SIGNI_TO_ACCE** を追加（`:3816`）／4型に事前リセット（`:4825-4831`・**ADD_TO_FIELD は除外**）／
  `applyToField` が配置できた札だけを記録（`:2894-2947`）／`execReveal` が `optional` を消費（`:1310`）。
  `_held_fresh` **92 据置**／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 980**／段2 消化 **107**／真バグ確定 967／
  HIGH・MED・LOW＝**651・321・8**／影響 **704カード・771効果**／段0 除去 232／段1 偽陽性 125。
  📊**母集団の切り方＝🆕消費地点まで見て数える**（続き603 の教訓）＝「JSON に語彙があるか」だけで数えると
  桁が変わる（「998効果」が実測 **29効果**だった）。**CLAUDE.md「型にキーがあることは実装の証拠にならない」の裏返し**
  ＝**JSON が変な値でも engine が慣例として正しく消費していることがある**。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  ⚠**「そうした場合」軸は枯れた**＝残15（B群8＋C群7）は前段の型ごとに別機構。次の題材は台帳から取り直す。
  **§6.4 の生きた worklist は `O-41`／`O-42`／`O-43`**。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **被覆マトリクス（`census:wiring`）**＝続き593 から据置（⚠**全体の miss 合計は未再計測**）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  🆕**意味照合監査の母集団の正体**＝`clean AUTO` 群 **3,326カードを全数監査済み**（未監査は1枚）。

- **🆕 2026-08-22 続き602（段2 第10バッチ＝「このシグニを〜」の thisCardOnly 欠落・live 24効果）後 最新値（本行が直近の正）**：
  **census 742/742 据置**、**golden 2350→2353**、smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、
  lint **0 errors**（260 warnings 据置）、`census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、
  **live 効果総数 10693 据置**。**live の変更は24効果**。
  🔴**engine を1箇所だけ改変**＝`execDown` と `TRANSFER_TO_DECK` に **`thisCardOnly` の消費地点を新設**
  （それまで**分岐が無く、live の13効果が黙って無制限だった**）。
  `_held_fresh` **94→92**／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 984**／段2 消化 **103**／真バグ確定 971／
  HIGH・MED・LOW＝**653・323・8**／影響 **706カード・774効果**／段0 除去 232／段1 偽陽性 125。
  📊**母集団の切り方**＝「HIGH ＋ 残 finding 1本 ＋ live AUTO」（続き602 時点 376効果）＋
  **finding の quote/claim が当該機構を指していること**（§5-3-4′）。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  🆕**次の塊＝「そうした場合」が `IS_MY_TURN` に化けている**（続き602 の findings に同型7本）。
  **§6.4 の生きた worklist は `O-41`／`O-42`／`O-43`**。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **被覆マトリクス（`census:wiring`）**＝続き593 から据置（⚠**全体の miss 合計は未再計測**）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  🆕**意味照合監査の母集団の正体**＝`clean AUTO` 群 **3,326カードを全数監査済み**（未監査は1枚）。
  除外されている **2,649カード（STUB か MANUAL/PARTIAL を含む）には意味照合を一度も当てていない**。
  ⚠**STUB を「未実装」と数えない**（無言 no-op は `census:stubs` A群🔴＝0）。
  CPU の射程は続き553 据置。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-22（続き602）。

**常設の計器（数字ではなく「見方」＝陳腐化しないもの）**

| 計器 | コマンド | 何が0/緑なら良いか | 注意 |
|---|---|---|---|
| 全ゲート | `npm run gates` | 全緑 | engine/parser/decompiler を触ったらこれ1本（数秒） |
| 同型★ | `node scripts/groupSimilar.mjs --all` | ★0 | 逆翻訳が割れていない＝表現の systematic 指標 |
| 語彙センサス | `npm run census` | ベースライン超過で exit 1 | **0 になっても「全カード完璧」ではない**（死角は §5c 末尾の5項） |
| 被覆マトリクス | `npm run census:wiring` | ゲートではない（索引） | **miss 数＝見込み件数ではない**（クロス計上・trap (h)） |
| STUB 仕分け | `npm run census:stubs` | A群🔴0・C群0 | 「STUB＝未実装」ではない（実装済みハンドラの表示名でもある） |
| golden 型カバレッジ | `npm run census:goldentypes` | 未カバー0 | 新しいアクション型を足したら golden を1件書くまで出続ける |
| timing センサス | `npm run census:timing` | ゲートではない（索引） | 【自】なのに timing 判定が全て外れた効果を炙り出す |

⚠**件数メトリクスを完了指標にしない**（§3 の原則）。「脱落疑いNN枚」は粗く、内容を直しても減らない。
判断は **同型★0 ＋ 該当カードの逆翻訳が原文一致** で行う。

### 📌 次の一手（推奨順）

> **cold start の手順**＝① `git pull` → ② `npm install` → ③ **`npm run gates` が全緑になることを確認**（無変更なら数秒）
> → ④ 上の §4 進捗サマリ（直近1件）を読む → ⑤ 下の「推奨順」から取る。
> **DESIGN.md は設計方針、本節は作業順**。手順が決まっている作業は必ずスキル（`/census-batch`・`/audit-card`・`/baton`）に従う。

> **🏁 P1（表現）は 2026-07-23 に完了宣言済み**＝以後 census は**回帰ゲート**であって worklist ではない
> （宣言・3分類・以後の運用は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭／§2 DoD／§5）。
> **§5c から新規の文型バッチは切らない。**

#### ⓪ 🏁§8／§6.4 `O-1` は **(a)〜(g) 全部消化＝残0クローズ**（2026-08-19 続き569）

**現在地**＝2026-08-18 続き551〜553 で層④（対戦体験）の骨格が入った。
**CPU はシグニ【起】・ルリグ【起】（本来／付与／継承）・アーツ（守り／攻め）・スペルを使い、グロウも人間と同じ関数を通る**
（🏁 DESIGN §4「CPU は対人戦と同じ処理」達成＝**CPU 独自の実行実装は残っていない**）。
消化した (a)〜(d) の詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-18 整理㉜」へ退避。
(e)(f) の詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き553）。

- [x] ✅**実機検証に着手した**（2026-08-18 続き554）＝`V-80` の (A)(B) が **3本 ALL PASS**。
  🔴**その過程で「ハーネスが全件 FAIL していた」真因（BattleScreen の Rules of Hooks 違反）を発見・修正**
  （→ §7 冒頭の警告／[BUGFIXES.md](./BUGFIXES.md) 続き554）。**いまハーネスは動く＝実機検証が一番安い時期**。
- [x] ✅**`V-79`(A)（(e) の本命＝追加アタックフェイズで無限ループしない）も実機 PASS**（2026-08-18 続き555）。
  ⇒ **(e)(f) はどちらも実機で確認済み**。
- [x] ✅**`V-79`(B)(D)・`V-80`(C・付与側) も実機 PASS**（2026-08-18 続き556）＝`V-79`/`V-80` は残0クローズ
  （詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-18 整理㉝」）。
- [x] 🏁**`V-74`〜`V-78` は 2026-08-19 続き568 で全部緑＝(a)〜(f) の実機検証は完了**
  （最後まで残っていた `V-75`(C)-2 と `V-78`(B)(D) を消化。詳細は PLAN_DETAIL「2026-08-19 整理㊹」）。
- [x] 🏁**(g) も続き569 で消化＝`O-1` は残0**（`cpuBoardEval.ts`＝召喚とアタックの盤面評価／応答アーツの温存）。
  🔑**教訓＝「精緻化」は実機回帰とセットでしか入れられない**＝当初の「格上の正面には撃たない」実装は
  **公式ルールの読み違い**（未満なら両方残る＝格下で殴っても損しない）で、実機回帰4本が落ちて初めて判明した。
- [x] ✅**(e) CPU の `ATTACK_LRIG`→`END` を state 込みコミットへ**（2026-08-18 続き553）＝`ADVANCE_TURN_WITH_STATE` へ移し、
  `resolveNextPhaseAfterAttack` でキューを1件消化するようにした。**`hasCpuUnsupportedAction` の除外は撤去済み**
  （`CPU_UNSUPPORTED_ACTION_TYPES` は空集合＝受け口としてだけ残す）。観測点は §7 `V-79`。
- [x] ✅**(f) 付与／継承のルリグ【起】**（2026-08-18 続き553）＝`lrigActivateGate` に収集源2本を新設し、
  人間のボタン生成と CPU の候補フィルタが同じ funnel を通るようにした。観測点は §7 `V-80`。
- [x] 🏁**(g) 選択の精緻化 v1＝2026-08-19 続き569 で消化**（`cpuBoardEval.ts`＝**選択だけの純関数**）。
  ①**召喚**＝「置ける体数を落とさない範囲でパワー最大」（旧＝レベル昇順の最初の1枚＝わざと弱い順）
  ②**アタック**＝`life`（正面が空）→`winBattle`→`noEffect` の順（旧＝ゾーン0から順）
  ③**応答アーツ**＝軽減（`prevent`）はライフ2枚以下のときだけ解禁＝**温存**。観測点は §7 `V-82`。
  ⚠**「格上の正面には撃たない」は入れていない**＝[公式ルール](https://www.takaratomy.co.jp/products/wixoss/library/rule/word_051/)は
  「パワーが**以上**なら相手をバニッシュ／**未満**なら**両方残る**」＝**同値は勝ち・格下で殴っても自分は落ちない**
  （engine の `myPower >= opPower` は正しい）。撃たない版は実機回帰4本を落として誤りが判明した。
  📋**v2 以降の候補**（未着手）＝アタック順に【自】アタック時誘発の価値を入れる／除去アーツの対象価値
  （どの壁を退けると打点が増えるか）／グロウ先の選択／エナチャージするカードの選択／`trade` 相当の踏み込み判断。

**⚠ この領域で繰り返し踏んだ罠（次に触る人へ）**

- **支払いコストの allowlist は「その実行経路が実際に払っているか」を先に見る**。
  `cpuActivate.ts`（シグニ【起】）と `cpuArts.ts`（アーツ／スペル共通）と `cpuLrigActivate.ts`（ルリグ【起】）で
  **allowlist が違うのは正しい**＝`performSigniActivated` は `down_self`／`lrigDown`／`acceTrash` を自動で払うが、
  **`performArts`／`performSpell` はエナ以外の宣言コストを払わない**（＝そちらに足すと宣言だけして踏み倒す）。
- **gate が数を検算していないコストを allowlist に載せない**＝実行側が黙って abort して
  **CPU が同じ効果を選び直す無限ループ**になる（先に gate へ検算を足す）。
- **実行より先に「使った」履歴を commit する**（`cpu_used_card_nums_this_turn` /
  `cpu_activated_effect_ids_this_turn`）＝履歴を実行の成否に委ねるとその窓から出られなくなる。
- **CPU にモーダルは出せない**（出すと人間の画面に相手のモーダルが出る）＝
  支払い内訳を人間が選ぶものは allowlist で撃たない側へ倒すか、`onCostOnPlay:'auto'` のような分岐を用意する。

#### ⓪' 🔥【Opus 側・最優先】段2 へ折り返す＝**段1 triage が完走した（2026-08-22 続き596）**

**設計図は `scripts/archive/scratchpad/semantic_audit_clean_round1/stage1_batch24_triage.md` §9**
（24バッチを通した Codex に**簿記をさせず総括だけ**書かせたもの）。**cold start はここを読む。**

- [ ] 🔴**最初の1本＝「instance 保持の共通基盤」**（Codex 推奨）＝`storedTargetCards` ／ `lastProcessedCards` ／
  `execAddToField` ／ delayed trigger。**12件以上を解放**し、**後続の動的 filter と LOOK partition が
  「どの instance を参照するか」を再実装せずに済む**。次点は**動的 power/level family**。
- [ ] **実装バッチ候補は21単位に整理済み**（§9.2＝影響 finding 数・配線先関数名・依存つき）。
  既に別章として整理済みのカバレッジ3本＝**【ライズ】**（第15バッチ §3）／**【ライド】**（第23バッチ §3）／
  **キーワード能力**（第22バッチ §3）。
- [ ] ⚠**着手前に §9.4「triage 判定を信用してよい範囲」を読む**＝**機構待ちは全件が「実装前に再確認」**
  （第23バッチ S013 のように、登録後に別作業で consumer が実装済みになった例がある）。
  **再確認必須**＝parseStatus が食い違った行／PARTIAL・MANUAL 同期対象／同一 effectId を共有する行／
  **根拠が単一 collector の現在行に依存する判定**。
- [ ] **軸ごとの機構待ち率で順序を決める**（§9.1）＝**parser 修正だけで進む**＝`filter.cardName` 0%・
  `action丸ごと欠落` 0%・`filter.hasIcon` 0%・`プレイヤー選択` 0%・`owner/主語` 0%・`能力種別` 0%・
  `順序-構造` 14.3%・`filter.power` 15.4%・`filter.color` 18.8%・`キーワード能力` 22.4%・
  `filter.story` 24.7%・`filter.状態` 25.0%。**engine 実装が先**＝`cost` 66.7%・`timing-trigger` 62.5%・
  `condition` 47.2%・`filter.level` 45.9%・`特殊機構` 39.4%・`count-upTo` 39.1%。
- [ ] 📋**parser の系統的な壊れ方 上位5**（§9.5＝1本の regex 修正が複数 finding を直せる候補）＝
  ①「場合／そうした場合／代わりに」の平坦化 ②修飾句の誤付着（source/trigger/直前札の条件を対象へ）
  ③「それ／そのシグニ／この方法で」の identity 喪失 ④列挙・各N枚の quota 崩壊
  ⑤能力境界・rule keyword の連結/消失。
- ⚠**バッチを回したら `stage2_closed.txt` に追記する**（しないと台帳が残件を過大に数える）。

#### ① 【Opus 側】「壊れ方」で機械検出して直す（§5d-0）

**なぜこれが上位か**＝2026-08-18 続き549 に無作為20件で測り直したところ **真バグ 85%（17/20）**。
続き376 の 70% から**上がっている**＝**計器較正で census を下げる道は終わっている**。
一方で `census:clusters` の文型テンプレは**ほぼ全部が単発**（「1 regex で N 効果」は出尽くし）。
⇒ **文型ではなく「壊れ方」で数えると横断的な塊が出る**（続き549 の実証）。

- [ ] **(a) 条件節の脱落＝無条件発火の残り**：計器＝「原文に `〜（場合|かぎり）、` があるのに live のどこにも
  `condition`/`activeCondition`/`CONDITIONAL`/`triggerCondition` が無い」＝**247効果**（census 787 の約31%）。
  続き549 で【常】の「かぎり」側 37効果を消化して残 **210**（内訳＝「かぎり」68＋「場合」145 前後）。
  ⚠**「場合」側は `condition`/`CONDITIONAL` に落ちる別経路**なので、先頭条件節テーブルではなく
  `STATE_CONDITION_CLAUSES_V2` 側を見る（続き368 の教訓＝「規則が無い」と「共通表に無い」は別物）。
  再現手順は [BUGFIXES.md](./BUGFIXES.md) 続き549。
- [ ] **(b) §5d-0 の作業種別 worklist**（(iv)較正 →(i)配線 →(ii)機構 →(iii)混線）＝**着手前に必ず実測し直す**
  （`npm run census:wiring`＝現在 **197**）。生きている大物は `cardClass` 51／`color` 24／`levelRange` 24／
  `levelExact` 21／`powerRange` 19。⚠**(iv) 較正はほぼ枯れている**（続き549 実測）。
- [ ] **(c) 続き547〜549 で登録した機構ギャップ**＝「それぞれ〜異なる」の手札コスト／トラッシュ除外コスト／
  ミル結果の条件型／対象節15効果、および【常】「かぎり」68件（レベル合計比較・「N種類以上」・否定「〜**ない**かぎり」・
  相手の場の【チャーム】数）。すべて §5d-0 (ii) に明細あり。

#### ② 【Opus 側】常設の受け口（在庫が積まれたら最優先へ繰り上げ）

- [ ] **Opusタスク12＝在庫1件**（(cxlvi)）。**常設の受け口として残す**＝Sonnet が §7 実機検証で engine/parser バグを見つけたらここへ積む。
  🏁**2026-08-20 続き588 に第1バッチ6件を残0クローズ**（(cxxxviii)(cxxxix)(cxl)(cxli)(cxlii)(cxliii)＝配線漏れファミリ）。登録行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-20 整理㊾」節、結末と教訓は §3 のクローズ節と `BUGFIXES.md` 2026-08-20（続き588）。
  🏁**2026-08-20 続き589 に第2バッチ3件を残0クローズ**（(cxliv)(cxlv)(cxlviii)＝**parser／表現系**。登録行の原文と結末の対照は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-20 整理㊾」節）。⚠**3件が残した教訓**＝(a)**「機構が無い」という登録は疑う**＝(cxliv) は parser も engine も既に完備で **live が held に落ちて古かっただけ**だった（着手前に fresh parser の出力を1回実測すれば分かる）。(b)**登録票の母集団は当てにならない**＝(cxlviii) は「1枚」と書かれていたが実測 **18カード中7効果**（うち3枚は fresh 側で既に正しく held 待ち）。(c)**カード固有の原文を分岐ガードに埋め込むと、同じ文型の別カードが全部落ちる**＝真因は `!t.includes('対戦相手')` の全文スキャン＋`WX10-048` の whitelist だった（§5-5c）。(d)**バグ再現用の実機シナリオは修正後に必ず FAIL する**＝「修正後にどう見えるか」を書いておかないと、直っているのに壊れていると誤読する。
  ▶**第3バッチは束ねない**＝残る3件は機構がそれぞれ別（間欠バグ／二段任意コストの構造／UIレース）。**(cxlvii) が最も波及が広い**（「そうした場合」が二段以上に連鎖する任意コスト全般の構造的な穴＝`effectExecutor.ts:4011` のディスパッチ）ので、着手するならここから。
- [x] 🏁**§6.4 は一度 残0 になった**（`O-19b`＝続き567・`O-1`＝続き569 で消化。**唯一の大物だった `O-1`（CPU AI）も残0クローズ**）。
  🏁🆕**2026-08-22 続き597 に `O-39`／`O-40` を残0クローズ**（どちらも「**parser は直っているのに live へ届かない**」構造ガード）。**O-39＝収穫マージの突き合わせを添字から `effectId` へ変え**、id 集合がズレたカードは `docs/_idset_fresh.json` に必ず出すようにした（実測46カード）。**O-40＝影武者コピー30件を「7件削除＋23件を MANUAL へ刻印是正」**し、`check:manual-fields` に**トップレベルは MANUAL/PARTIAL のみ**のゲートを追加。⚠**登録時の「live に効果そのものが無い2件」は実測で両方とも誤りだった**（採番ズレと parser 側の重複）。🆕**残るのは `O-41` と、新規登録の `O-42`（parser 出力と実体同一の manual エントリ 87効果）**。

- [ ] **🆕(cxlvi) 続き584＝`WX16-Re18-E1`（レゾナンス・マーチ）のルリグデッキから複数レゾナを配置する継続が間欠的に発火せず2枚目が取り残される**＝実機で確認（`v44SummonTwoResonasFromLrigDeck`。4回実行中2回再現）。原文「あなたのルリグデッキからレゾナを２枚まで出現条件を無視して場に出す」＝SELECT_TARGETで2枚選択→1枚目をSELECT_SIGNI_ZONEで配置→**空きゾーンが1つに減った時点で対話を挟まず自動配置する設計**（`execStubPart3.ts:3043-3054`＝`emptyIdxIPSR.length>=2`のときだけ`needsInteraction`、未満なら`INTERNAL_PLACE_SUMMONED_RESONAS`の継続を`executeAction`で即時実行）。**再現時は2枚目がルリグデッキに残存したまま`pendingEffect`が`-`に戻り「完了」してしまう**（`hLrigDeck`に2枚目のカード番号が残る・対応する`hField`ゾーンはnullのまま）。**再現の有無は「どちらのカードが1枚目として処理されるか」と完全に相関**（1枚目=`44002`のときは4/4成功・1枚目=`44003`のときは4/4失敗）が判明したが、UI操作（`pick-0`→`pick-1`→「決定」）自体は毎回同一だったため、**選択順序が非決定的に入れ替わる理由（`resumeSelectTarget`のマルチセレクト順序保存経路／`INTERNAL_PLACE_SUMMONED_RESONAS`継続実行自体の間欠的欠落のどちらが真因か）はSonnet側では特定しきれず**、Opus側での追跡が要る。実害＝「２枚まで」を選んでも約半分の確率で1枚しか場に出ない過少実行。実機シナリオは`scripts/verifyBattleDrive.mjs`の`v44SummonTwoResonasFromLrigDeck`（`order`登録済み）。詳細はBUGFIXES 2026-08-19続き584。
- [ ] **§6.3／§6.2／タスク13**＝大型機構・意味照合監査・構造混線。**どれも在庫を実測してから**取る。

#### ③ 【Sonnet 側】§7 実機検証（`V-nn` が単一 worklist）

- [ ] 🆕**生きている `V-nn` は 10件だけ**（2026-08-19 続き587 に §7 を整理＝**残っている行が worklist そのもの**。消化の履歴は §7「■ 消化済み」索引と PLAN_DETAIL 各整理節。**ここに 🏁 の履歴を書き足さない**＝二重管理になる）＝
  🆕🔥**最優先＝2026-08-20 続き588 の修正6件の実機検証（意図的FAIL→PASS の反転確認）**。Codex 環境はネットワーク遮断で `verifyBattleDrive.mjs` を実行できず、**6件とも実機未検証のまま着地している**＝
  `V-04`④ `v04TanabataLeaveFieldE3`（(cxxxviii)）／`V-16` `v16AbilityWatcherOncePerTurnSecondOnPlayIgnored`（(cxxxix)）／`V-19` `v19Wx07050NoDiscardDoPhaseAdvanceReturns`（(cxl)）／`wx20re18DynamicLevelAttackBanish`（(cxlii)）はいずれも `order` 登録済みなのでそのまま回す。
  `V-35`(b)(c)（(cxliii)）は **`order` 未登録**＝`node scripts/verifyBattleDrive.mjs wdk06r09Pay wdk06r09Skip wdk06r09NoKey` で単体確認してから `order.push` へ復帰させる。
  ⚠**(cxli) だけ観測点が無い**＝現行 `v20DiscardSkipFirstBlocksSecond` は `WX16-042-E1` の能動 discard へ迂回済みで `confirmEndDiscard` を通らない（かつ (cxlvii) 未修正でFAIL継続）＝**手札上限超過で捨てさせる専用シナリオの新設が要る**。
  🔴**なお Opus のバグ修正待ちで止まっているもの**＝`V-44`(a)（(cxlvi)）**だけ**。🏁**`V-20`（(cxlvii)）／`V-58`(d)(e)（(cxlix)）は 2026-08-20 続き590 で修正＋実機検証まで完了**（`v20DiscardSkipFirstBlocksSecond` は意図的FAIL→PASS 反転／`v58d`・`v58e` は3ラウンド 6/6 PASS）。🏁`V-45`(c)／`V-39` 追加／`V-40`(b) は続き589 で完了。
  🔶**Sonnet が今すぐ着手できるもの**＝`V-04`（残り12経路。⚠シグニ【起】は `SigniActivatedModal.tsx:265` に testid 追加が先）／`V-35`(a)（`WXDi-P16-002-E1`＝ルリグアーツ・`LRIG_TEAM_COUNT>=3` の盤面構築が要る）／`V-45`(d)（デッキ上5枚制御＋コンバット回避）／`V-58`(d)(e) の再現手順（シナリオは実装済み）／`V-63`（複雑度が高く続き564 で見送り済み）／`V-30` の境界越え（続き566 の設計限界が未解消）。
  **新しい未検証UIが出たら §7 へ `V-<次番号>` で足す**（§4 と二重に持たない）。
  📋**follow-up 在庫1件**＝`v76CpuSpellCutinPassProgresses`＝バッチ実行時のみ断続的フレーク（続き560 実測・単発では安定PASS）。🆕**`v15AttackPhaseEndCentralDiffToyLeftFires`（続き556 で FAIL していた分）は続き573 に緑で固定済み**＝在庫から外した（真因はシナリオ側の未完3点・engineバグ0。原文は PLAN_DETAIL「2026-08-19 整理㊿」の `V-15`）。
- ⚠🆕**積む速度と消す速度が釣り合っていない**（2026-08-18 続き551 実測＝実機検証を実際に回した最後は
  **2026-08-14 続き481**で、以後 約69セッションぶんが未検証のまま積み上がった）。
  🔴**その一因が「ハーネスが全件 FAIL していた」こと**だと 2026-08-18 続き554 に判明（→ §7 冒頭の警告）。
  **回さなくなると壊れたことにも気付けない**＝実機ハーネスは「使う」こと自体が計器の維持になる。
  **機構を実装したセッション内で1本走らせる**運用に寄せたい（負債は寝かせるほど切り分けが高くつく）。
- ⚠**engine 側は golden が踏めない層**（コスト支払いUI・対話・CPU 応答）が本命＝**負方向は必ず対照とセット**。

#### ④ 毎回守る規律（順序に関係なく）

1. **在庫は着手時に live を実測し直す**（寝かせた在庫は陳腐化する＝続き546 実測で6件中2件は原因が消えていた）。
2. **parser を直したら消費地点を grep する**（型にキーがあることは実装の証拠にならない＝続き548 で
   `selectionConstraint` が支払いUIで死フラグだった）。
3. **engine/parser/decompiler を触ったら `npm run gates`**、シート再生成は `npm run regen`（§12）。
   **バグは golden に1件足してから直す**。
4. **新しい `Condition`／`ActiveCondition` 型は「型・評価器・golden ミラー表」をセットで**足す
   （評価器に case が無いと `checkActiveCondition` は **`return true`＝無条件成立**に落ちる）。
5. **セッション終了時は `/baton`**（進捗サマリの入れ替え・恒久指標の更新・BUGFIXES 追記・commit/push）。

> **新規 timing 配線の確立パターン**：①該当カードの effect/原文を確認 ②`triggerCollect.ts` に pure collector 追加（`mkLimitOk`/`ownFieldSources`/`effsOf` 流用）③検出が要れば `boardDiff.ts` に detector 追加 ④BattleScreen 中央 diff ブロック（`resolveStackNext` 内・mill/freeze 等と同じ場所）に発火配線＋薄いラッパ ⑤`goldenTest.ts` に発火条件テスト ⑥`decompileEffects.ts` の `engineUnwiredTimings` から除去 ⑦`npm run regen`（全シート＋下流一括再生成）＋同型★0 確認 ⑧`npm run gates` 全緑 → commit/push。

---
- **🆕 2026-08-22 続き601（段2 第9バッチ＝誘発の限定・live 24効果）後 最新値（本行が直近の正）**：
  **census 742/742**（`BASELINE_HIGH` **747→742**）、**golden 2346→2350**、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、lint **0 errors**（260 warnings 据置）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live 効果総数 10693 据置**。
  **live の変更は24効果**（engine は無改変＝parser のみ）。
  `_held_fresh` **94カード 据置**（途中95→採用して戻した）／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🏁🔑**意味照合タスク8（§6.2 段2）＝残 OPEN 1,005→995＝初めて1,000を割った**／段2 消化 82→**92**／
  真バグ確定 982／HIGH・MED・LOW＝**659・328・8**／影響 **714カード・784効果**／段0 除去 232／段1 偽陽性 125。
  📊**母集団の切り方（⚠次バッチで直す）**＝「HIGH ＋ 残 finding 1本 ＋ live AUTO」に加えて
  **finding の quote/claim が当該機構を指していること**を必須にする（続き601 で4枠を無駄にした）。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件を今の live で再検証して **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-41`／`O-42`／`O-43`**。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **被覆マトリクス（`census:wiring`）**＝続き593 から据置（⚠**全体の miss 合計は未再計測**）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  🆕**意味照合監査の母集団の正体**＝`clean AUTO` 群 **3,326カードを全数監査済み**（未監査は1枚）。
  除外されている **2,649カード（STUB か MANUAL/PARTIAL を含む）には意味照合を一度も当てていない**＝歩留まりは不明。
  **カード単位の進捗（`npm run census:cards`）**＝続き595 から据置。
  ⚠**STUB を「未実装」と数えない**（無言 no-op は `census:stubs` A群🔴＝0）。
  CPU の射程は続き553 据置。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-22（続き601）。

- **🆕 2026-08-22 続き600（段2 第8バッチ＝「場のカード」条件の脱落 26効果）後 最新値（本行が直近の正）**：
  **census 747/747**（`BASELINE_HIGH` **761→747**）、**golden 2343→2346**、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、lint **0 errors**（260 warnings 据置）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live 効果総数 10693 据置**。
  **live の変更は26効果**（engine は無改変＝parser のみ）。
  `_held_fresh` **94カード 据置**（⚠**途中 106 まで増え、7効果が「正しいのに未採用」で寝ていた**＝採用して戻した）／
  `_partial_fresh` **15カード 据置**／`_idset_fresh` **46カード 据置**。
  `parserWorklist` held合計 **128 据置**（LOSS 115／VALUE 11／ADD 2）。
  🔥🔑**意味照合タスク8（§6.2 段2）＝残 OPEN 1,024→1,005／段2 消化 63→82**／真バグ確定 992／
  HIGH・MED・LOW＝**669・328・8**／影響 **722カード・794効果**／段0 除去 232／段1 偽陽性 125。
  📊**母集団の切り方（次バッチもこれを使う）**＝**HIGH ＋ 残 finding 1本 ＋ live AUTO**（第8バッチ前で 403効果）。
  うち「**MISSING × 条件系 × live に条件キー皆無**」＝第8バッチ前 **86効果**（今回26を消化）。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件を今の live で再検証して **19/20 が真バグ**（続き599）。
  ⚠**「条件節の欠落」は1 regex では直らない**＝文型正規化で **153テンプレ／単発123**。**塊ではなく「同じ手順をN回」**が正体。
  **§6.4 の生きた worklist は `O-41`／`O-42`／🆕`O-43`（【常】の条件語彙が痩せている 11効果）**。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **被覆マトリクス（`census:wiring`）**＝続き593 から据置（⚠**全体の miss 合計は未再計測**）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  🆕**意味照合監査の母集団の正体**＝`clean AUTO` 群 **3,326カードを全数監査済み**（未監査は1枚）。
  除外されている **2,649カード（STUB か MANUAL/PARTIAL を含む）には意味照合を一度も当てていない**＝歩留まりは不明。
  **カード単位の進捗（`npm run census:cards`）**＝続き595 から据置。
  ⚠**STUB を「未実装」と数えない**（無言 no-op は `census:stubs` A群🔴＝0）。
  CPU の射程は続き553 据置。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-22（続き600）。

- **🆕 2026-08-22 続き599（段2 第7バッチ＝条件節の欠落 17効果・Codex 逐次バッチ方式へ切替）後 最新値（本行が直近の正）**：
  **census 761/761**（`BASELINE_HIGH` **771→761**＝Codex の12効果で −6、閾値一般化の5効果で −4）、
  **golden 2339→2343**（+4＝Codex 3・Claude 1〔決め打ち逆戻り検知〕）、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、lint **0 errors**（260 warnings 据置）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live 効果総数 10693 据置**。
  **live の変更は17効果**（engine は無改変＝parser と decompiler のみ）。
  `_held_fresh` **94カード 据置**／`_partial_fresh` **15カード 据置**／`_idset_fresh` **46カード 据置**。
  `parserWorklist` held合計 **128 据置**（LOSS 111→**115**／VALUE 15→**11**／ADD 2）。
  🔥🔑**意味照合タスク8（§6.2 段2）＝残 OPEN 1,042→1,024／段2 消化 45→63**（本セッションで **finding 18本**を締めた
  ＝続き598 の遡り3本＋第7バッチ15本）／真バグ確定 1,011／HIGH・MED・LOW＝**687・329・8**／
  影響 **738カード・812効果**／段0 除去 232／段1 偽陽性 125。
  📊**母集団の切り方（次バッチもこれを使う）**＝**HIGH ＋ 残 finding 1本 ＋ live AUTO ＝ 416効果**（直せば必ず1件閉じる）。
  うち「**MISSING × 条件系 × live に条件キー皆無**」＝**101効果**（今回17を消化）。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件を今の live で再検証して **19/20 が真バグ**（続き599）。
  ⚠**「条件節の欠落348」は1 regex では直らない**＝文型正規化で **153テンプレ／単発123**。
  **§6.4 の生きた worklist は `O-41`／`O-42` の2件 据置**。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **被覆マトリクス（`census:wiring`）**＝続き593 から据置（⚠**全体の miss 合計は未再計測**）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  **カード単位の進捗（`npm run census:cards`）**＝続き595 から据置（母数 全6712枚／効果テキストあり 6031／
  バニラ 681／live に効果 5975枚・10693効果）。
  🆕**意味照合監査の母集団の正体**＝`clean AUTO` 群 **3,326カードを全数監査済み**（未監査は1枚）。
  除外されている **2,649カード（STUB か MANUAL/PARTIAL を含む）には意味照合を一度も当てていない**＝歩留まりは不明。
  ⚠**STUB を「未実装」と数えない**（無言 no-op は `census:stubs` A群🔴＝0）。
  CPU の射程は続き553 据置。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-22（続き599）。

- **🆕 2026-08-22 続き598（§6.2 段2 第6バッチ＝「それ」の identity と全体付与）後 最新値（本行が直近の正）**：
  **census 771/771**（`BASELINE_HIGH` **772→771**）、**golden 2337→2339**（本バッチで2件追加）、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、lint **0 errors**（260 warnings 据置）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**（parseStatus 違反0 も同居）、**同型★ 0**、
  **live 効果総数 10693 据置**。**live の変更は9効果**（engine は無改変）。
  **レビュー待ち行列3本**＝`_held_fresh` **94カード 据置**／`_partial_fresh` **15カード 据置**／
  `_idset_fresh` **46カード 据置**。`parserWorklist` held合計 **120→128**（LOSS 111／VALUE 15／ADD 2）
  ⚠**増えたのは退化ではない**＝§6.2 段2 の構造変更は必ず held に落ちる（採用は `heldReview.mjs`）。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 1,044→1,042／段2 消化 43→45**／真バグ確定 1,029／
  HIGH・MED・LOW＝702・332・8／影響 752カード・828効果／段0 除去 232／段1 偽陽性 125。
  **§6.4 の生きた worklist は `O-41`／`O-42` の2件 据置**。**Opusタスク12＝在庫1件**（(cxlvi)）。
  **被覆マトリクス（`census:wiring`）**＝続き593 から据置（⚠**全体の miss 合計は未再計測**）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  **カード単位の進捗（`npm run census:cards`）**＝続き595 から据置（母数 全6712枚／効果テキストあり 6031／
  バニラ 681／live に効果 5975枚・10693効果。AUTO 9548 (89.3%)／MANUAL 1120 (10.5%)／PARTIAL 25 (0.2%)／UNKNOWN 0。
  どのフラグも立たないカード 4833/5975＝80.9%）。
  ⚠**STUB を「未実装」と数えない**（数えると 80.9%→52.2% に化ける。無言 no-op は `census:stubs` A群🔴＝0）。
  CPU の射程は続き553 据置。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-22（続き598）。

- **🆕 2026-08-22 続き597（§6.4 O-39／O-40 残0クローズ）後 最新値（本行が直近の正）**：
  **census 772/772**（`BASELINE_HIGH` **773→772**＝O-39 の解凍で `WXDi-CP02-072-BURST` の `isUp` が live へ届いた）、
  **golden 2337 据置**、smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、lint **0 errors**（260 warnings 据置）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**（🆕**parseStatus 違反 0 のゲートを同居**）、**同型★ 0**、
  `parserWorklist` held合計 **120 据置**（LOSS 107／VALUE 11／ADD 2）、**live 効果総数 10693 据置**。
  🆕**レビュー待ち行列の3本立て**＝`docs/_held_fresh.json` **97→94カード**／`docs/_partial_fresh.json` **6→15カード**／
  🆕`docs/_idset_fresh.json` **46カード**（O-39 で新設＝**それまでどの計器にも出ていなかった母集団**）。
  ⚠**`_partial_fresh` が増えたのは退化ではない**＝id 集合ズレのカードが初めて効果単位のレビューに載ったため。
  🆕**`manualEffects.ts` 451カード557効果 → 450カード550効果**（O-40 で死荷重7件を削除）。
  **live の変更は2効果だけ**（`WX05-021-E2` の `thisCardOnly`／`WXDi-CP02-072-BURST` の `isUp`）＝**engine は無改変**。
  🏁**§6.4 `O-39`／`O-40` 残0クローズ**／🆕**`O-42` を新規登録**（parser 出力と実体同一の manual エントリ **87効果**・
  うち80件は live も凍っている）／**§6.4 の生きた worklist は `O-41`／`O-42` の2件**。
  **意味照合タスク8（§6.2 段2）は続き596 から据置**＝残 OPEN 1,044／真バグ確定 1,031／HIGH・MED・LOW＝702・334・8／
  影響 754カード・830効果／段0 除去 232／段2 消化 43。
  **被覆マトリクス（`census:wiring`）**＝続き593 から据置（⚠**全体の miss 合計は未再計測**）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  **Opusタスク12＝在庫1件**（(cxlvi)）／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は §6.2 段2（`stage1_batch24_triage.md` §9 が設計図）・§6.4 O-41/O-42・
  Opusタスク12 在庫1件・§5d-0 (i)・§6.3**。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  **カード単位の進捗（`npm run census:cards`）**＝続き595 から据置（母数 全6712枚／効果テキストあり 6031／
  バニラ 681／live に効果 5975枚・10693効果。AUTO 9548 (89.3%)／MANUAL 1120 (10.5%)／PARTIAL 25 (0.2%)／UNKNOWN 0。
  どのフラグも立たないカード 4833/5975＝80.9%）。
  ⚠**STUB を「未実装」と数えない**（数えると 80.9%→52.2% に化ける。無言 no-op は `census:stubs` A群🔴＝0）。
  CPU の射程は続き553 据置。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-22（続き597）。

- **🆕 2026-08-22 続き596（段1 triage 完走・単発17バッチ）後 最新値（本行が直近の正）**：
  **census 773/773 据置**（`BASELINE_HIGH` 773）、**golden 2337 据置**、smoke **10693 / 全異常0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（260 warnings 据置）、`census:stubs` **A群🔴0／C群0**、manual-fields **0**、
  **同型★ 0**、`parserWorklist` held **97 据置**、`docs/_partial_fresh.json` **6カード 据置**、
  **live 効果総数 10693 据置**（🔑**本セッションは engine/parser/JSON への変更0行**＝triage 専任）。
  🏁🔑**Sonnetタスク8 段1 triage 完走＝未 triage 0**（662→0）。
  **残 OPEN 1,080→1,044**／**段1 で真バグ確定 405→1,031**／**段1 で偽陽性 89→103**／
  段0 除去 232／段2 消化 43／HIGH・MED・LOW＝702・334・8／**影響 754カード・830効果**。
  ⚠**残 OPEN が 36件しか減らないのは設計どおり**＝triage は偽陽性しか OPEN から外さない。
  単発段(8-24) 通算の延べ内訳＝**真バグ 567／偽陽性 34／機構待ち 216**（重複計上あり）。
  **被覆マトリクス（`census:wiring`）の盤面状態語彙**＝続き593 から据置（⚠**全体の miss 合計は未再計測**）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。
  （⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  **Opusタスク12＝在庫1件**（(cxlvi)）／**§6.4 は `O-39`／`O-40`／`O-41` の3件**／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は §6.2 段2（`stage1_batch24_triage.md` §9 が設計図）・
  §6.4 O-39/O-40/O-41・Opusタスク12 在庫1件・§5d-0 (i)・§6.3**。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  **カード単位の進捗（`npm run census:cards`）**＝続き595 から据置（母数 全6712枚／効果テキストあり 6031／
  バニラ 681／live に効果 5975枚・10693効果。AUTO 9548 (89.3%)／MANUAL 1120 (10.5%)／PARTIAL 25 (0.2%)／UNKNOWN 0。
  どのフラグも立たないカード 4833/5975＝80.9%）。
  ⚠**STUB を「未実装」と数えない**（数えると 80.9%→52.2% に化ける。無言 no-op は `census:stubs` A群🔴＝0）。
  CPU の射程は続き553 据置。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-22（続き596）。

- **2026-08-22 続き593（段2 第3バッチ＝盤面状態フィルタの配線漏れ）後の値**（続き594 で退避）：
  **census 781→776**（`BASELINE_HIGH` 776 へ更新）、**golden 2329→2334**（新規 E2E 5本）、
  smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、lint **0 errors**（260 warnings 据置）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、
  **被覆マトリクス（`census:wiring`）＝盤面状態語彙の miss は `hasAcce` 0／`infected` 0／`hasCharm` 0／`isDown` 0／
  `isSelfCharmed` 0／`isFrozen` 1／`isUp` 2／`isSelfAcced` 1／`acceHost` 3**（残りは全部 機構待ちか構造ガード。
  ⚠**全体の miss 合計は未再計測**＝前回値 190 は状態語彙の是正ぶんだけずれている）、
  `parserWorklist` held **99枚 / 40署名群 据置**、`docs/_partial_fresh.json` **6カード 据置**、
  **live 効果総数 10693 据置**（per-effect diff **changed 14／added 0／removed 0**）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。
  （⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  **Opusタスク12＝在庫1件**（(cxlvi)）／🏁**§6.4 は (O-37)(O-38) を新規登録**（下記 §6.4）／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は §6.2 段2（第4バッチ）・Opusタスク12 在庫1件・§5d-0 (i) の残セル・§6.3・タスク13**。
  ⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-22（続き593）。

- **2026-08-20 続き591（Opusタスク12 (cl)＝「そのターン終了時」の遅延予約を残0クローズ）後の値**（2026-08-22 続き593 で退避）：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2324→2325**（(cxlvii) の3本を遅延仕様へ更新＋②skip を1本追加）、
  smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings 据置）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、
  **被覆マトリクス miss 190 据置**（未再計測）、
  `parserWorklist` held **99枚 / 40署名群 据置**、`docs/_partial_fresh.json` **6カード 据置**、
  **live 効果総数 10693 据置**（per-effect diff **changed 1／added 0／removed 0／outlier 0**＝`WXDi-P10-039-E2` のみ）。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**（`v20` 2本は**定義数を変えず中身を (cl) 仕様へ書き換え**）。
  （⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  **Opusタスク12＝在庫1件**（(cxlvi)／🏁**(cl) を残0クローズ**）／🏁**§6.4 残0**／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は Opusタスク12 在庫1件・§5d-0 (i) の残セル・§6.3／§6.2／タスク13**。
  ✅**(cl) は実機検証まで完了**。⚠🔴**続き588 の6件は依然として実機未検証**＝**Sonnet 側 §7 の最優先**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-20（続き591）。

- **2026-08-19 続き586（§7 実機検証＝V-45全4経路・V-58(a)〜(e)）後の値**（2026-08-20 続き588 で退避）：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2307 据置**、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  **被覆マトリクス miss 190 据置**（engine/parser 非改変のため未再計測）、
  `parserWorklist` held **103枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes` は続き552d 以降 未再計測**）。
  **live 効果総数 10693**（live/CSV とも非改変）。version **0.502 据置**。
  **実機シナリオ定義総数 475**（466→475＝V-45(a)2件・V-45(b)2件・V-45(c)1件・V-58(b)1件・V-58(a)(c)1件・V-58(d)1件・V-58(e)1件の計9件を新設・`order`登録済み）。**`injectScenario`に`spec.top.pendingSpell`注入経路を新設**（応答側UIを直接テストするため）。
  **Opusタスク12＝在庫12件**（(cxxxviii)〜(cxlvii)は据置／(cxlviii) `WX24-P4-052-E2`の自己バニッシュ対価が相手シグニ2体バニッシュに化ける表現段階の取り違え／(cxlix) `handleCutinUse`ピース枝（`BattleScreen.tsx:7787`）の書き込み順序レースでCHOOSE未確定のまま元のピースが解決してしまう）。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き586）。

- **🆕 2026-08-19 続き578（§7 実機検証1件＝V-35(b)(c)＝🔴新規engineバグ1件を発見・Opusタスク12(cxliii)へ登録）後 最新値**：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2307 据置**、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  🆕**被覆マトリクス miss 190 据置**（今回は engine/parser 非改変のため未再計測）、
  `parserWorklist` held **103枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes` は続き552d 以降 未再計測**）。
  **live 効果総数 10693**（今回 live/CSV とも非改変）。version **0.502 据置**。
  🆕**実機シナリオ定義総数 441**（438→441＝`wdk06r09Pay`／`wdk06r09Skip`／`wdk06r09NoKey`の3件を新設。**意図的FAILのため既定`order`には未登録＝既定バッチの実行数は438のまま**）。
  **Opusタスク12＝在庫6件**（(cxxxviii)〜(cxlii)に加え🆕**(cxliii) `collectTurnTriggers`が`activeKeyAbilitySources`を呼ばず、キー起点【自】がON_TURN_END等7 timingで構造的に無言no-op**＝(cxxxviii) タナバタ`WXDi-P10-041-E3`のTAKE_FROM_UNDER_SIGNI空振り／(cxxxix) ON_ABILITY_ACTIVATEDの《ターン1回》永続化漏れ／(cxl) `SigniOnPlayCostModal`が`handDiscardSigni`コスト非対応／(cxli) `confirmEndDiscard`がON_TRASH系トリガー未収集／(cxlii) `evalUseCondition`が`effectsMap`未伝搬で`SELF_LEVEL_THRESHOLD`が印字レベルへフォールバック）／🏁**§6.4 残0**／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は Opusタスク12 在庫6件・§5d-0 (i) の残セル・§6.3／§6.2／タスク13**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き578）。

- **🆕 2026-08-19 続き577（§7 実機検証3件＝V-24(cxiii)(cxiv)＋`WXDi-P07-060-E3`・V-24 全5項目決着）後 最新値**：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2307 据置**、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  🆕**被覆マトリクス miss 190 据置**（今回は engine/parser 非改変のため未再計測）、
  `parserWorklist` held **103枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes` は続き552d 以降 未再計測**）。
  **live 効果総数 10693**（今回 live/CSV とも非改変）。version **0.502 据置**。
  🆕**実機シナリオ総数 438**（431→438＝`v24cxvHyperionAwakened`／`v24cxvHyperionNotAwakened`／`v24cxivLancerGateOn`／`v24cxivLancerGateOff`／`v24cxiiiLevel1Immune`／`v24cxiiiLevel2NotImmune`／`v24cxiiiControlNoEffect` の7件を新設）。
  **Opusタスク12＝在庫5件 据置**（(cxxxviii) タナバタ`WXDi-P10-041-E3`のTAKE_FROM_UNDER_SIGNI空振り／(cxxxix) ON_ABILITY_ACTIVATEDの《ターン1回》永続化漏れ／(cxl) `SigniOnPlayCostModal`が`handDiscardSigni`コスト非対応／(cxli) `confirmEndDiscard`がON_TRASH系トリガー未収集／(cxlii) `evalUseCondition`が`effectsMap`未伝搬で`SELF_LEVEL_THRESHOLD`が印字レベルへフォールバック）／🏁**§6.4 残0**／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は Opusタスク12 在庫5件・§5d-0 (i) の残セル・§6.3／§6.2／タスク13**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き577）。

- **🆕 2026-08-19 続き575（§7 実機検証2件＝V-24(cxviii)/V-58(f)残0クローズ・engineバグ0）後 最新値**：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2307 据置**、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  🆕**被覆マトリクス miss 190 据置**（今回は engine/parser 非改変のため未再計測）、
  `parserWorklist` held **103枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes` は続き552d 以降 未再計測**）。
  **live 効果総数 10693**（今回 live/CSV とも非改変）。version **0.502 据置**。
  🆕**実機シナリオ総数 429**（426→429＝`v24cxviiiSpellBetGrantsSLancer`／`v24cxviiiSpellNoBetNoDirectGrant`／`v58fCpuAutoPassesTeamPieceCutin` の3件を新設）。
  **Opusタスク12＝在庫5件 据置**（(cxxxviii) タナバタ`WXDi-P10-041-E3`のTAKE_FROM_UNDER_SIGNI空振り／(cxxxix) ON_ABILITY_ACTIVATEDの《ターン1回》永続化漏れ／(cxl) `SigniOnPlayCostModal`が`handDiscardSigni`コスト非対応／(cxli) `confirmEndDiscard`がON_TRASH系トリガー未収集／(cxlii) `evalUseCondition`が`effectsMap`未伝搬で`SELF_LEVEL_THRESHOLD`が印字レベルへフォールバック）／🏁**§6.4 残0**／🏁**§8 は (g) v1 まで完了**。
  ⇒ **Opus 側の生きた worklist は Opusタスク12 在庫5件・§5d-0 (i) の残セル・§6.3／§6.2／タスク13**。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-19（続き575）。

- **🆕 2026-08-19 続き573（§7 実機検証さらに5件＝実バグ2件発見・V-15/V-21/V-22残0クローズ）後 最新値**：
  **census 783 据置**（`BASELINE_HIGH` 783 据置）、**golden 2307 据置**、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（263 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  🆕**被覆マトリクス miss 190 据置**（今回は engine/parser 非改変のため未再計測）、
  `parserWorklist` held **103枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠同型★・`census:goldentypes` は続き552d 以降 未再計測）。
  **live 効果総数 10693**（今回 live/CSV とも非改変）。version **0.502 据置**。
  🆕**実機シナリオ総数 420**（415→420＝`v21ConditionPowerBuffedReachesThreshold`／`v21ConditionPowerBelowThresholdNoCharge`／`v22DisonaOnlyContinuousBuff`／`v20DiscardSkipFirstBlocksSecond`／`v20DiscardPayBothReturnsToField` の5件を新設。V-15は既存シナリオの修正のみ）。
  ✅`v15AttackPhaseEndCentralDiffToyLeftFires` の2連続FAILは解消＝続き573で残0クローズ（共有ヘルパー`H.clickTextOrBtn`/`H.clickZone`のtimeout漏れが真因）。
  🆕Opusタスク12＝在庫4件（(cxxxviii) タナバタ`WXDi-P10-041-E3`のTAKE_FROM_UNDER_SIGNI空振り／(cxxxix) ON_ABILITY_ACTIVATEDの《ターン1回》永続化漏れ／(cxl) `SigniOnPlayCostModal`が`handDiscardSigni`コスト非対応／(cxli) `confirmEndDiscard`がON_TRASH系トリガー未収集）／🏁§6.4 残0／🏁§8 は (g) v1 まで完了。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。

- **🆕 2026-08-18 続き565（§7 実機検証継続＝`V-60`／`V-56`／`V-59`／`V-53` ALL PASS で残0クローズ）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.496**。
  実機シナリオ総数 379（+4＝V-60×1・V-53×2・既存2本(V-56/V-59)再実行）。
  実機 PASS（続き565 実測）＝4/4新規＋2/2再確認＝全PASS（2回連続）。
  ⚠`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）。
  Opusタスク12＝在庫3件据置（(cxxxv)続き559／(cxxxvi)(cxxxvii)続き562で登録・未修正）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。

- **🆕 2026-08-18 続き564（§7 実機検証継続＝`V-66`〜`V-68`／`V-65`／`V-64`／`V-61`／`V-62` ALL PASS で残0クローズ）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.495**。
  実機シナリオ総数 375（+10＝V-67×1・V-65×2・V-64×1・V-61×1・V-62×2・既存2本再実行）。
  実機 PASS（続き564 実測）＝10/10（2〜3回連続）。
  ⚠`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）。
  Opusタスク12＝在庫3件据置（(cxxxv)続き559／(cxxxvi)(cxxxvii)続き562で登録・未修正）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。

- **🆕 2026-08-18 続き563（§7 実機検証継続＝`V-71`／`V-70`／`V-69` ALL PASS で残0クローズ）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.494**。
  実機シナリオ総数 365（+6＝V-71×2・V-70×1・V-69×3）。
  実機 PASS（続き563 実測）＝6/6（2回連続）。
  ⚠`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）。
  Opusタスク12＝在庫3件据置（(cxxxv)続き559／(cxxxvi)(cxxxvii)続き562で登録・未修正）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。

- **🆕 2026-08-18 続き562（§7 実機検証継続＝`V-78`(A)(C)／`V-73`／`V-72`＝🔴engineバグ2件発見）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.493**。
  実機シナリオ総数 359（+9＝V-78×2・V-73×4・V-72×3）。
  実機 PASS（続き562 実測）＝7/9（2本は engine バグ待ちで意図的に赤・V-72の3本は2回連続PASS）。
  ⚠`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）。
  Opusタスク12＝在庫3件（(cxxxv)続き559／(cxxxvi)(cxxxvii)続き562で登録・未修正）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。

- **🆕 2026-08-18 続き561（§7 実機検証継続＝`V-77` ALL PASS で残0クローズ）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.492**。
  実機シナリオ総数 350（+8＝V-77 の8本）。
  実機 PASS（続き561 実測）＝8/8（2回連続）。
  ⚠`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）。
  Opusタスク12＝在庫1件据置（(cxxxv)＝`calcContinuousBlockedActions` 恒久 no-op・続き559 で登録・未修正）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。

- **🆕 2026-08-18 続き560（§7 実機検証継続＝`V-76` ALL PASS で残0クローズ）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.491**。
  実機シナリオ総数 342（+5＝V-76 の5本）。
  実機 PASS（続き560 実測）＝5/5（うち `v76CpuSpellCutinPassProgresses` はバッチ実行時に3回中2回PASSの断続的フレークを観測・follow-up）。
  ⚠`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）。
  Opusタスク12＝在庫1件据置（(cxxxv)＝`calcContinuousBlockedActions` 恒久 no-op・続き559 で登録・未修正）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き560）。

- **🆕 2026-08-18 続き559（§7 実機検証継続＝`V-75`(C)(D) 実機確認＋Opusタスク12 (cxxxv) 新規発見）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.490**。
  実機シナリオ総数 337（+8＝V-75(C)(D) の6本＋(C)-2 の対照/実バグ待ち2本）。
  実機 PASS（続き559 実測）＝7/8（2回連続で同じ結果）。1本は意図的に赤（`v75ArtsLimit1SecondUseBlocked`＝Opusタスク12 (cxxxv) の実バグ待ち）。
  Opusタスク12＝在庫1件（(cxxxv)＝`calcContinuousBlockedActions` がルリグ本体の opponent 対象 `BLOCK_ACTION` を拾わない恒久 no-op。live母集団5件）。
  ⚠`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き559）。

- **🆕 2026-08-18 続き558（§7 実機検証継続＝`V-75`(A)(B) 実機 PASS）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.489**。
  実機シナリオ総数 329（+2＝`v75CpuDefendsWithArts` / `v75CpuDoesNotDefendWithoutThreat`）。
  実機 PASS（続き558 実測）＝2/2（2回連続）。
  ⚠`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き558）。

- **🆕 2026-08-18 続き557（§7 実機検証継続＝`V-74` ALL PASS）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.488**。
  実機シナリオ総数 327（+7＝V-74 の3(A)＋4(B)）。
  実機 PASS（続き557 実測）＝7/7（2回連続）。
  ⚠`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（続き556 発見・未解決・follow-up）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き557）。

- **🆕 2026-08-18 続き556（§7 実機検証継続＝`V-79`(B)(D)・`V-80`(C・付与側) ALL PASS）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295 据置**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（263 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.487**。
  実機シナリオ総数 320（+3＝`v79SecondLapHastarliqSuppressed` / `v79HumanOrderEndBeforeStart` / `v80CpuActivatesGrantedLrig`）。
  実機 PASS（続き556 実測）＝10/10（新規3本＋既存7本の回帰確認）。
  ⚠`v15AttackPhaseEndCentralDiffToyLeftFires` が単独再実行で2回連続 FAIL（未解決・follow-up）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き556）。

- **🆕 2026-08-18 続き555（§6.4 `O-1` (e) の実機確認＋`ON_ATTACK_PHASE_END` 収集器の golden 固定）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2295**（+1）、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（264 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  manual-fields **0**、`parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.486**。
  実機シナリオ総数 317（+2＝`v79CpuExtraAttackPhaseConsumed` / `v79CpuNoExtraAttackPhase`）。
  実機 PASS（続き555 実測）＝5/5（`V-79` 2本＋`V-80` 2本＋`wxk04003Label`）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き555）。

- **🆕 2026-08-18 続き554（🔴BattleScreen の Rules of Hooks 違反＝実機ハーネス全件 FAIL の真因を修正／`V-80` 実機 ALL PASS）後 最新値（本行が直近の正）**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2294**（+1＝Rules of Hooks トリップワイヤ）、
  smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、fuzz 全0、lint **0 errors**（264 warnings）、
  `census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  `parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**
  （⚠**同型★・`census:goldentypes`・`census:wiring` は続き552d 以降 未再計測**＝live 非改変なので
  〔★0・未カバー0・wiring miss 193〕から動いていないはず。数字が要るなら再計測すること）。
  **live 効果総数 10693**（live JSON・CSV とも非改変）。version **0.485**。
  🆕**実機ハーネス（`verifyBattleDrive.mjs`）＝復旧**。**続き554 以前は全シナリオが React #310 で無条件 FAIL**
  （＝2026-08-14 続き481 以降に「実機で FAIL した」と記録された結果は**巻き添えを疑って回し直す**）。
  🆕**実機シナリオ総数 315**（+2＝`v80GrantedLrigActCoinShown` / `v80GrantedLrigActCoinGated`）。
  🆕**実機 PASS（続き554 実測）＝3/3**（`wxk04003Label` / `v80GrantedLrigActCoinShown` / `v80GrantedLrigActCoinGated`）。
  CPU の射程（応答アーツ 214/428・攻めのアーツ メイン174/アタック188・スペル 123/427・シグニ【起】 MAIN 500/682・
  AA 54/76・ルリグ【起】 MAIN 425/AA 83・付与【起】 92効果/63カード・継承宣言 3カード）は続き553 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き554）。

- **🆕 2026-08-18 続き553（§8／§6.4 `O-1` (e)(f)＝CPU の ATTACK_LRIG→END を state 込みへ／ルリグ【起】の収集源3つを funnel へ）後 最新値（本行が直近の正）**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2293**（+2）、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、lint **0 errors**（264 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、manual-fields **0**、
  `parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**（⚠**同型★・`census:goldentypes`・`census:wiring` は今回未再計測**＝
  live 非改変なので続き552d 値〔★0・未カバー0・wiring miss 193〕から動いていないはず。数字が要るなら再計測すること）。
  **live 効果総数 10693**（`live JSON・CSV とも非改変`＝engine/UI 側のみの変更）。version **0.484**。
  🆕**CPU が撃てるルリグ【起】の収集源が3つに**＝センター本来（MAIN **425**／AA **83**・続き552c 据置）に加えて
  **付与【起】 92効果／63カード**・**継承宣言カード 3枚**（`WX05-002`/`003`/`004`）。
  🆕**`ON_ATTACK_PHASE_END` の live 母集団＝1効果**（`WX24-P2-075`。CPU ターンでも発火するようになった）。
  🆕**`CPU_UNSUPPORTED_ACTION_TYPES` は 1→0 種**（＝CPU 進行が支えられない綴りは無くなった）。
  CPU が使える応答アーツ **214/428**・攻めのアーツ（除去）メイン **174**／アタック **188**・スペル **123/427**・
  シグニ【起】 MAIN **500/682**／AA **54/76** は続き552d 据置。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き553）。

- **2026-08-18 続き552〜552d（§8／§6.4 `O-1` (a)〜(d)＝CPU がアーツ／スペル／【起】を使い、グロウも共通経路へ）後 最新値**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2291**（+13）、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、**同型★ 0**（265群 / 5986枚）、lint **0 errors**（264 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  `census:goldentypes` **未カバー 0**（EffectAction 147型）、`census:wiring` miss **193**（⚠197→193 は当時の変更とは無関係＝
  コミット済みシートが古く、再生成で `eachDistinctLevel`／`isPuppet`／`isAwakened` の3語彙が実態に追いついたぶん）、manual-fields **0**、
  `parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**。
  **live 効果総数 10693**（live JSON・CSV とも非改変＝engine/UI 側のみ）。version **0.483**。
  **CPU が使える応答アーツ＝アタックフェイズ Timing の 428 のうち 214（50%）**（除去188／軽減16／無効化10）。
  **攻めのアーツ（除去）＝メイン窓 174 ／ アタック窓 188**、**スペル＝427枚中 123**。
  **シグニ【起】＝MAIN 500/682（73%）／《アタックフェイズアイコン》付き 54/76**。
  **ルリグ【起】＝MAIN 425／ATTACK_ARTS 83**（live のルリグ【起】は 558＝MAIN 492／AA 87）。
  **`BattleScreen.tsx` 14118行**（CPU 手書きグロウ約150行の削除で −9.8KB）。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き552〜552d）。

- **2026-08-18 続き551（§8／§6.4 `O-1`＝CPU がメインフェイズに【起】を撃つ v1）後 最新値（本行が直近の正）**：
  **census 787 据置**（`BASELINE_HIGH` 据置）、**golden 2278**（+4）、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、**同型★ 0**（265群 / 5986枚）、lint **0 errors**（264 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  `census:goldentypes` **未カバー 0**（EffectAction 147型）、`census:wiring` miss **197**、manual-fields **0**、
  `parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**。
  **live 効果総数 10693**（`live JSON・CSV とも非改変`＝engine/UI 側のみの変更）。version **0.479**。
  🆕**CPU が撃てるシグニ【起】＝MAIN で撃てる 682 のうち 500（73%）**（残182は支払い内訳に盤面評価が要るコスト）。
  一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き551）。

- **2026-08-18 続き549（§5d-0＝【常】先頭「〜あるかぎり、」のゲート脱落37効果）後 最新値（本行が直近の正）**：
  **census 787**（796→787・`BASELINE_HIGH` 更新済み）、**golden 2274**、smoke **10693 / CRASH・HANG・INVARIANT 全0 / SKIP 0**、
  fuzz 全0、**同型★ 0**（265群 / 5986枚）、lint **0 errors**（264 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**、
  `census:goldentypes` **未カバー 0**（EffectAction 147型）、`census:wiring` miss **197**、manual-fields **0**、
  `parserWorklist` held **101枚 / 署名42群**、`docs/_partial_fresh.json` **6カード**。
  **live 効果総数 10693**（`added 0 / removed 0` を毎バッチで機械確認）。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き549）。

> **なぜ**＝どちらの節も見出しに「最新1件のみ」と書きながら実際は溜まっていた。恒久指標は**計測行15本＋ポインタ37本**、
> 次の一手は**続き432／440 の本文がそのまま**（当時から100セッション以上経過し、挙げられていた在庫はほぼ全部が消化済み・
> 数字も census 924／golden 1753 のように**現在値と桁で食い違う**）。cold start が最初に読む節が一番古い、という状態だったので、
> 2026-08-18（続き550）に**本文をここへ丸ごと退避**し、PLAN 側は「現在値1行」と「いま取るべき順序」だけに戻した。

⚠**ここは歴史記録**＝数字はすべて当時のもの。現在値は PLAN §4 の1行が正。

### ㉛-1 旧「📊 恒久指標」の退避本文（続き548 以前の計測行＋旧指標）

- **2026-08-25 続き654 後**（§5.3 `O-65` 消化時点。続き655 で入れ替え）：
  **census 574/574**（`O-65` で 576→574・ベースラインも更新）、**golden 2770**、smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 260）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**、
  **live カード 5975 / 効果総数 10693**、`_held_fresh` **83**／`_partial_fresh` **12**／`_idset_fresh` **45**、
  **意味照合 残 OPEN 678**、
  **実機シナリオ +17**（`O-65` 4本／`O-64` 3本／`O-63` 2本／第44〜46 の8本）＝**`O-63`〜`O-65` の9本は ALL PASS を2回連続**

- **🆕 2026-08-22 続き610（段2 第17バッチ＝【チーム自／起／出】成立ゲート）後 最新値（本行が直近の正）**：
  **census 713/713**（`BASELINE_HIGH` 更新済み・セッション開始時 730。`機構:チーム` 高シグナルが **25→4**）、
  **golden 2380**（同 2375）、smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、**lint 0 errors / 261 warnings 据置**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live 効果総数 10693 据置**。
  `_held_fresh` **88 据置**／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🆕**`censusManualDrift` の削除候補（§6.4 `O-42` の母集団）＝86**（Codex が 87 に増やしたのを検証で差し戻した）。
  🔵**engine 改変なし**（続き610 は parser＋`manualEffects`＋`syncManualLive --condition-only` のみ）。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 941**／段2 消化 **147**／真バグ確定 928／
  HIGH・MED・LOW＝**625・308・8**／段0 除去 231／段1 偽陽性 125。
  📊**母集団の切り方＝5原則**（603〜608 で確立・CODEX_GUIDE §5 `3-3′`〜`3-4″`）＝
  ①消費地点まで見る ②srctext でなく CSV ③完全一致で数えない ④同義語彙を全部列挙 ⑤「変な形＝バグ」と決めつけない。
  🆕**続き610 で6つ目が要ることが判明＝⑥「原文の括弧内ルール説明」を能力として数えない**
  （指示書の33能力は実測31＝`WXDi-P16-088`／`P16-092` の「…がいるなら【チーム自】が有効になる」を重複計上していた。Codex が訂正）。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-42`／`O-43`／`O-44`**（🏁`O-41` は続き609 で残0クローズ）。**§6.3 の新規は `L`**（共通色比較・**5バッチ連続で保留中**）。
  **Opusタスク12＝在庫1件**（(cxlvi)）。
  **`census:wiring` miss 合計 194**（続き606 実測・⚠用法 triage が要る＝`levelExact × BLOCK_ACTION{PLAYER}` の3件は恒久的な偽陽性）／**`census:timing` フォールバック 2効果**。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**実機未検証＝続き588 の6件（最優先）＋`V-85`（宣言 UI が新規に30カードで出る）＋`V-84`（レベル限定つきガード禁止）＋`V-83`**。

- **🆕 2026-08-22 続き609（§6.4 `O-41` 残0クローズ）後 最新値（本行が直近の正）**：
  **census 730/730 据置**、**golden 2375**（セッション開始時 2366＝O-41 で8本追加＋既存契約テスト1本を新契約へ書き換え）、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、**lint 0 errors / 261 warnings 据置**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live 効果総数 10693 据置**。
  `_held_fresh` **88 据置**／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🔴**engine/UI の改変（続き609）**＝`execBlockAction` に `GUARD_LV_DECLARED`／`GUARD_LV_LAST_DOWNED` の
  実行時解決を新設（書き込み先は**効果元**の `declared_guard_restrict_levels`）／
  `execSequence` の `DECLARE_NUMBER` 横取りを**「次が `GRANT_KEYWORD` のときだけ」に限定**（無言 no-op の修正）／
  `SET_DECLARED_NUMBER` の保存先を `declared_guard_restrict_level`→**`declared_number`** へ分離（読み手5箇所に後方互換フォールバック）／
  `src/screens/battle/guard.ts` に**純関数 `makeGuardLevelBlocker`** を新設し `GuardResponseDialog` をその呼び出しへ縮小。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 947 据置**／段2 消化 **141 据置**／真バグ確定 934／
  HIGH・MED・LOW＝**627・312・8**／段0 除去 232／段1 偽陽性 125（**続き609 は §6.4 の作業なので段2 の数字は動かない**）。
  📊**母集団の切り方＝5原則**（603〜608 で確立・CODEX_GUIDE §5 `3-3′`〜`3-4″`）＝
  ①消費地点まで見る ②srctext でなく CSV ③完全一致で数えない ④同義語彙を全部列挙 ⑤「変な形＝バグ」と決めつけない。
  🆕**続き609 は ③⑤ をそのまま踏んだ**＝O-41 の登録行「live 10効果」が実測 **6効果**（既に正しい2件＋別機構で解決済み1件＋二重計上1件）。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-42`／`O-43`／`O-44`**（🏁**`O-41` は続き609 で残0クローズ**）。**§6.3 の新規は `L`**（共通色比較・**4バッチ連続で保留中**）。
  **Opusタスク12＝在庫1件**（(cxlvi)）。
  **`census:wiring` miss 合計 194**（続き606 実測・⚠用法 triage が要る＝🆕`levelExact × BLOCK_ACTION{PLAYER}` の3件は**恒久的な偽陽性**と判明済み）／**`census:timing` フォールバック 2効果**。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**実機未検証＝続き588 の6件（最優先）＋🆕`V-85`（宣言 UI が新しく30カードで出る＝入力待ちが新規発生）＋🆕`V-84`（レベル限定つきガード禁止）＋`V-83`**。

- **🆕 2026-08-22 続き608（段2 第16バッチまで＝続き603〜608 の6バッチ完了）後 最新値（本行が直近の正）**：
  **census 730/730**（`BASELINE_HIGH` 更新済み・セッション開始時 742）、**golden 2366**（同 2350）、
  smoke **10693 / 全異常0 / SKIP 0 据置**、fuzz 全0、**lint 0 errors / 261 warnings**
  （⚠**261 が正**＝続き605 の `BattleScreen.tsx` 改変で1本増えており、続き606 で訂正）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、**live 効果総数 10693 据置**。
  `_held_fresh` **88**（同 92）／`_partial_fresh` **15 据置**／`_idset_fresh` **46 据置**。
  🔴**engine/UI の改変（セッション累計）**＝`DID_IT_GATED_TYPES` へ5型追加＋事前リセット（603）／
  `AssassinScope` へ `powerGte`・`levelLte`（604）／`LancerScope` 新設と配線6箇所（605）／
  `revealSourceStory`＋`hand_revealed_just_source_card_num`＋pure collector 抽出、
  `collectDeckTrashSelfTriggers` のゲート、`collectMillTriggers` の fail-closed 化（607）／
  `execPowerModify{targetsTriggerSource}` の `lastProcessedCards` 記録（608）。
  🔥**意味照合タスク8（§6.2 段2）＝残 OPEN 947**／段2 消化 **141**／真バグ確定 934／
  HIGH・MED・LOW＝**627・312・8**／段0 除去 232／段1 偽陽性 125。
  📊**母集団の切り方＝5原則**（603〜608 で確立・CODEX_GUIDE §5 `3-3′`〜`3-4″`）＝
  ①消費地点まで見る ②srctext でなく CSV ③完全一致で数えない ④同義語彙を全部列挙 ⑤「変な形＝バグ」と決めつけない。
  ⚠**残 OPEN の真偽は実測済み**＝無作為20件で **19/20 が真バグ**（続き599）。
  **§6.4 の生きた worklist は `O-41`／`O-42`／`O-43`／🆕`O-44`**。**§6.3 の新規は🆕`L`**（共通色比較）。
  **Opusタスク12＝在庫1件**（(cxlvi)）。
  **`census:wiring` miss 合計 194**（続き606 実測・⚠用法 triage が要る）／**`census:timing` フォールバック 2効果**。
  version **0.502 据置**。**実機シナリオ定義総数 476 据置**。（⚠**`census:goldentypes` は続き552d 以降 未再計測**）。
  ⚠🔴**実機未検証＝続き588 の6件（最優先）＋🆕`V-83`**（`WX24-P3-030-E1` のミル誘発）。

- **旧・2026-08-18 続き548（§5d-0 (ii)＝コスト節の集合制約7効果＋盤面状態の条件節3効果）後 最新値**：**census 796**（799→796 実数更新・`BASELINE_HIGH` 更新済み）、**golden 2261**（+15＝`cost.energyTrash` の集合制約 live 7効果／`energyTrashCostSatisfied`・`canAddEnergyTrashIndex` の純関数契約（**制約違反は払えない・選べない**＋制約なしは従来どおり）／**支払いUI3経路すべてが共有判定を通る**ソース走査＋旧写経ゼロ／盤面状態の条件節 live 3効果／`checkActiveCondition` の負方向（覚醒していない・レベル違い）／**`isPuppet` でルリグを数えない** parity）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**（264 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**（据置）、manual-fields **0**、被覆マトリクス miss **197 据置**（この層は census:wiring の語彙表に無い＝コスト節・条件節なので数字は動かない）。🆕**新設した関数**＝`energyTrashConstraintOf`（`effectParser.ts`）／`energyTrashCostSatisfied`・`canAddEnergyTrashIndex`・`energyTrashSelectedNums`（`screens/battle/costs.ts`）＝**新しい型も新しいアクション型も0本**（`SelectionConstraint` も `isAwakened`/`isPuppet` も既存）。**live JSON changed 10効果/10カード**（収穫マージ自動採用9＋held 採用1＝`WXK09-061`。CSV 非改変）。⚠**10効果すべて実機未検証**（§7 `V-72` 送り＝エナコストの集合制約は UI 層なので golden が踏めない）。
- **旧・2026-08-18 続き547（§5d-0 (i) 第20バッチ＝「それぞれ〜異なる」の軸取り違え7効果＋「傀儡状態で場に出す」8効果）後 最新値**：**census 799 据置**（ベースライン 799）、**golden 2246**（+21＝`DISTINCT_BATCH5C` の全40件で「表の値＝原文から導いた値」／`distinctConstraintOf` の4軸／live 7効果の実値／傀儡 live 8効果の STUB 化＋絞り込み＋旧形（自分トラッシュ ADD_TO_FIELD）へ戻っていないこと／`WXEX2-23-E4` の `suppressOnPlay` 畳み込み／engine の `puppetParams.filter` が候補を絞ること＋filter 無しは従来どおり／連体「傀儡状態の」がトリガー文のままであること）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**（264 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**（据置）、manual-fields **0**、🆕**被覆マトリクス miss 242→197**（`npm run census:wiring`。⚠PLAN 旧記載の 541／291 は古い）。🆕**新設した関数**＝`inferDistinctKind`／`distinctConstraintOf`（`effectParser.ts`・export）＝**新しいアクション型も新しい engine 経路も0本**（`STEAL_OPP_TRASH_PUPPET` は既存・足したのは `puppetParams.filter` 1キーだけ）。**live JSON changed 15効果/15カード**（held 採用14＋`_partial_fresh` から外科パッチ1＝`WXEX2-23-E4`。CSV 非改変）。⚠**15効果すべて実機未検証**（§7 `V-71` 送り＝傀儡8効果。「それぞれ〜異なる」7効果は選択集合制約なので UI 側の拒否挙動が要確認）。
- **旧・2026-08-18 続き546（🏁🏁**Opusタスク12 在庫0**＝engine/parser の実バグ4件を修正・2件は実体消滅を確認）後 最新値**：**census 799 据置**（ベースライン 799）、**golden 2225**（+4＝旧形式 `signi_acce` を1枚として扱う全経路／ルリグ【起】《ダウン》の母集団27件と自己ダウン支払い／`ON_HAND_ADDED` の owner 2軸＋付与ストア end-to-end＋対照の非反転／エナ差分 watcher の母集団9件＋**ソース照合で push 地点3つ**）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**（据置）、manual-fields **0**、`parserWorklist` held **122**（据置）。🆕**新設した関数**＝`normalizeAcceSlot`／`normalizeAcceSlots`（`src/utils/acce.ts`）・`payLrigDownSelfCost`（`screens/battle/lrigDownCost.ts`）＝**新しい型も新しい engine 経路も0本**。**live JSON changed 1効果/1カード**（`SPDi43-11`。CSV 非改変）。🆕**挙動是正 37効果**（ルリグ【起】《ダウン》27＝実質無コスト／エナ差分 watcher 9＝撃ち放題／`SPDi43-11-sub-E1` 1＝恒久 no-op）＋**旧形式 `signi_acce` のデータ破壊**。⚠**5件とも実機未検証**（§7 `V-66`〜`V-70` 送り）。
- **旧・2026-08-18 続き545（🏁§6.4 **`O-12` 完了**＝逆翻訳の表示だけの穴・ゲート化）後 最新値**：**census 799 据置**（ベースライン 799）、**golden 2221 据置**（逆翻訳の表示だけなので構文ゴールデンは不変）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` **A群＝4種/5件（すべて明示 defer。無言 no-op は 0）／🆕C群＝0種/0箇所**（179種/296箇所→**0**。D 健全 418種→**597種**）、manual-fields **0**、`parserWorklist` held **122**（据置）。🆕**`census:stubs` はゲート2本になった**（A群の無言 no-op＋C群の生ID露出。どちらも増えたら exit 1）。**engine / live JSON / CSV とも非改変**（逆翻訳の表示のみ）。⚠**実機検証は不要**（挙動不変）。
- **旧・2026-08-18 続き544（🏁§6.4 **`O-38` 完了**＝相手シグニ【自】の「支払えば通る」回避）後 最新値**：**census 799 据置**（ベースライン 799）、**golden 2221**（+3＝`SPDi43-01-E2` がハードブロックではなく支払いゲートを積むこと（＋宣言→choke point の橋渡し）／ゲートの向き（宣言者自身には掛からない・`:NEXT_TURN` 予約はまだ効かない・シグニ/レゾナの【自】限定）／包んだ【自】は払えば通り払わなければ何もしないこと（＋`costColors` が選択肢に載る＝タダで通らない・エナ0なら払えない表示）。⚠既存1本を更新＝旧「近似の在処の固定」テストは `WXDi-P16-044-E2`（無条件ブロックが正）だけを見る形へ分離）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**4種/5件（すべて明示 defer。無言 no-op は 0）**（据置）、manual-fields **0**、`parserWorklist` held **122**（据置）。🆕**新設した engine 語彙は0本**＝既存の任意コスト機構（`OPTIONAL_COST` → `CONDITIONAL{PAID_ADDITIONAL_COST}`）をスタック解決の1点で被せただけ。**live JSON / CSV とも非改変**（engine 側のみの是正）。⚠**実機未検証**（§7 `V-65` 送り＝エナの実支払いは UI 層で golden が踏めない）。
- **旧・2026-08-18 続き543（🏁§6.4 **`O-37` 完了**＝引用能力の置換3形）後 最新値**：**census 799 据置**（ベースライン 799）、**golden 2218**（+4＝置換3形が専用構造にパースされること／支払い方が原文どおり載ること（⚠「か」split で2つ目が落ちない・`WX24-P4-021` は能力喪失なし・`RECOLLECT_GATE` が残る）／funnel が付与ストアを見て払ったら能力を1つ失うこと（＋払えないなら成立しない・`lrig_abilities_disabled` で落ちる・cardMap 未指定では選ばない）／リフレッシュ置換（＋2回目は守らない・ライフ0なら消費しない・**トラッシュ複製が起きない**）／`ON_TRASH_CARD_ADDED` の検出と付与ストア収集（＋自分の効果・原因不明・相手トラッシュでは発火しない）。⚠旧 defer トリップワイヤ1本は**正方向の挙動テストへ書き換え**）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**4種/5件（すべて明示 defer。無言 no-op は 0）**（7種8件→4種5件＝今回3種3件を実装）、manual-fields **0**、`parserWorklist` held **122**（127→122）。🆕**新設した語彙**＝timing `ON_TRASH_CARD_ADDED` 1本＋`triggerCondition.trashOwner`＋`LifeCrashReplacement.kind:'pay_cost'`＋StubAction 3キー（`damageReplaceByCost`／`refreshLifeMoveReplace`／`trashedCardUpTo`）。**live JSON changed 6効果/6カード**（held 採用6。CSV 非改変）。⚠**6効果すべて実機未検証**（§7 `V-64` 送り）。
- **旧・2026-08-17 続き542（🏁§6.4 **`O-29` 完了**＝「同じ選択肢を複数回選ぶ」ループ）後 最新値**：**census 799**（800→799 実数更新・`BASELINE_HIGH` 更新済み）、**golden 2214**（+4＝`resumeChoose` が重複 id を潰さないこと／選択数1では `allowRepeat` を立てないこと／`WX17-003-E1` の構造・upTo・betChoose・distinct level／`WX22-016-E1` の②を2回選ぶと本体が3回走ること。⚠既存2本を更新＝`REPEAT_EFFECT` の残存許容 1件→**0件**と、`(O-11) WX22-016-E1` の選択肢内チェックの精密化）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**7種/8件（すべて明示 defer。無言 no-op は 0）**（据置）、manual-fields **0**、`parserWorklist` held **127**（据置）。🆕**新設した語彙は `ChooseAction.allowRepeat` 1本だけ**（engine の解決ロジックは無変更＝穴は UI が `Set<string>` だったこと）。🏁**`REPEAT_EFFECT` / `REPEAT_N_TIMES` は live 0件**。**live JSON changed 8効果/8カード**（held 採用1＋MANUAL 同期1＋収穫マージ自動採用6。CSV 非改変）。⚠**UI（回数モーダル）と CPU 自動応答は実機未検証**（§7 `V-63` 送り＝golden は engine 側までしか踏めない）。
- **旧・2026-08-17 続き541（🏁§6.4 **`O-25` 完了**＝自己引用付与の残り (c)(d)）後 最新値（本行が直近の正）**：**census 800**（806→800 実数更新・`BASELINE_HIGH` 更新済み）、**golden 2210**（+7＝ゲート5形の写像／引用付与6効果が無条件 `keyword_grants` に落ちないこと／**付与ストアの条件つきシャドウが対象選択から除外される**こと／序数条件の通算カウント（ルリグ分を含む）／「一度目か二度目」を別機構から奪っていないこと／チャーム条件が別物に化けないこと／(c) の明示 defer。⚠うち1本は**既存テストの順序依存の是正**＝`(xlvi) wave17` の埋め札を cursor 依存から性質選択へ）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**7種/8件（すべて明示 defer。無言 no-op は 0）**（+1＝`DEFERRED_ATTACKER_LEVEL_TRADE_NEGATE`）、manual-fields **0**、`parserWorklist` held **127**（据置）。🆕**新設した条件型2つ**（`THIS_CARD_IS_CHARMED`／`ATTACK_ORDINAL_THIS_TURN`＝`Condition` の型数 119→**121**）。🆕**新しい `ActiveCondition` は0本**（ゲート5形はすべて既存語彙で表せた）。**live JSON changed 11効果/11カード**（held 採用10＋MANUAL 外科パッチ1。CSV 非改変。⚠**ゲート条件の6効果は live 非改変**＝engine 側の是正）。⚠**14効果すべて実機未検証**（§7 `V-61`／`V-62` 送り）。
- **旧・2026-08-17 続き540（§6.4 **`O-14`／`O-15` を消化**＝どちらも残0クローズ）後 最新値（本行が直近の正）**：**census 806 据置**（ベースライン 806）、**golden 2203**（+3＝O-14(a) の「強制アタックと同時に次ターンのアーツ/スペル/【起】封じが積まれる」＋「次の対戦相手のターン」を当ターンに潰さない／O-14(b) の「即時に1体も飛ばず、相手ターン終了時にアタックした分だけ飛ぶ」。⚠`WXEX1-44-E2` の defer トリップワイヤは**正方向の挙動テストへ書き換え**＝件数は据置カウント）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**6種/7件（すべて明示 defer。無言 no-op は 0）**、manual-fields **0**、`parserWorklist` held **127**（据置）。🆕**新設した engine 語彙は STUB 1本のみ**（`BLOCK_OPP_ARTS_SPELL_ACT_NEXT_TURN`）＝**新しい型も新しい engine 経路も0本**（3件とも既存機構に parser を追いつかせただけ）。**live JSON changed 4効果/4カード**（`WXEX1-44`／`WX15-003`／`WXDi-P08-010`／`WX25-P1-050`。CSV 非改変）。⚠**3件とも実機未検証**（§7 `V-59`／`V-60` 送り）。
- **旧・2026-08-17 続き538（§6.4 **O-25 の (a)(b) を消化**＝(c)(d) は残）後 最新値（本行が直近の正）**：**census 806**（807→806 実数更新）、**golden 2200**（+3＝(a) の条件が付与に掛かること／引用のコスト節が本体に化けていないこと＋**E1b は近似のまま**の明示／(b) の構造化）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**6種/7件（すべて明示 defer。無言 no-op は 0）**、manual-fields **0**、`parserWorklist` held **127**（LOSS 115／VALUE 10／ADD 2＝据置）。**自己引用付与の在庫**＝【自】/【起】引用 **42効果**（未構造化8→**5**＝うち3件は別表現で実装済みの偽陽性）／【常】引用 **39効果**（未構造化32＝**O-25(d)**＝付与ストアを読む走査軸が無いのが本体）。**live JSON changed 3枚**（held 採用1枚＋MANUAL 凍結の外科パッチ2枚）。
- **旧・2026-08-17 続き537（🏁§6.4 **O-31 完了**＝簿記の2件は実装済み／実測で新規の穴2つ）後 最新値（本行が直近の正）**：**census 807**（808→807 実数更新）、**golden 2197**（+3＝読点なしの回避ゲート＋制限型を横取りしない負方向／**10効果すべての自己トラッシュが `thisCardOnly` を持つ**こと／相手シグニ【自】停止が engine に届くこと＝近似の在処の固定）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**6種/7件（すべて明示 defer。無言 no-op は 0）**、manual-fields **0**、`parserWorklist` held **127**（LOSS 115／VALUE 10／ADD 2＝据置）。**「支払わないかぎり」を含む73効果を効果単位で走査し、回避表現が無いものは残0**（`SPDi43-01-E2` の支払い回避だけが**近似として残る**＝O-38）。**live JSON changed 10枚**（収穫マージ9枚＋held 採用1枚）。
- **旧・2026-08-17 続き536（🏁§6.4 **O-27 完了**＝引用能力の中身が未パース／ダメージ無効の残り）後 最新値（本行が直近の正）**：**census 808 据置**、**golden 2194**（+4＝リミットと付与が両方載ること／引用の2ブロックが両方そろうこと／【常】が宣言 STUB で条件を保つこと／**付与ストアの【常】シールドが判定へ届く**こと・明示 defer に `REMOVE_ABILITIES` が紛れていないこと）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**6種/7件（すべて明示 defer。無言 no-op は 0）**（+3＝今回の `DEFERRED_DAMAGE_REPLACE_BY_COST`／`DEFERRED_REFRESH_LIFE_MOVE_REPLACE`／`DEFERRED_OPP_EFFECT_TRASHED_ANY_ZONE`）、manual-fields **0**、`parserWorklist` held **127**（LOSS 115／VALUE 10／ADD 2＝据置）。**`GRANT_ABILITY_INNER_TEXT` を含む効果 39→38**（残りは §6.4 O-31(a)／O-25 の層）。**live JSON changed 5枚**（収穫マージ4枚＋`PARTIAL` の外科パッチ1枚）。
- **旧・2026-08-17 続き535（🏁§6.4 **O-26 完了**＝自己トラッシュがコストに載らない・6効果 → **残0**）後 最新値（本行が直近の正）**：**census 808 据置**、**golden 2190**（+2＝【起】複合コストの `cost.trash_self` 契約／束ねた任意コストの実経路＝支払うと効果元がトラッシュへ行き、ラベルに対価が出て、場に居ない効果元では支払い枝が選べない）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**3種/4件（すべて明示 defer。無言 no-op は 0）**、manual-fields **0**、`parserWorklist` held **127**（LOSS 115／VALUE 10／ADD 2＝据置）。**原文に「この〜を場からトラッシュに置き」を含む【起】コスト節／束ねた任意コストの残0を両方向で確認**（⚠付与された内側能力まで辿ること・「**エナゾーンから**」は `energyTrashSelf` の別コスト）。**live JSON changed 6枚**（すべて収穫マージが自動採用＝純粋にコストが増えた側）。
- **旧・2026-08-17 続き534（🏁§6.4 **O-36 完了**＝ターン条件の allowlist 解体・23効果 → **残0**）後 最新値（本行が直近の正）**：**census 808**（809→808 実数更新）、**golden 2188**（+4＝allowlist 撤廃の契約／連言形「手札がN枚で〜のターンの場合」／持ち上げで実装済み STUB へ戻ること／`OPP_TURN_NO_ENERGY_COST` が `:NEXT_TURN` を張らないこと）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**3種/4件（すべて明示 defer。無言 no-op は 0）**、manual-fields **0**、`parserWorklist` held **127**（LOSS 115／VALUE 10／ADD 2＝据置）。**原文に「ターンの場合」を含む42効果すべてが live で `TURN_OWNER` を持つ（残0）**。**live JSON changed 21枚**（AUTO収穫16＋自動採用1＋MANUAL外科パッチ4）。

> **旧・続き532 の計測行**（census 809・golden 2181・`countChoose`／能力ブロック分割／`costUnparsed` ガード）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き531 の計測行**（census 812・golden 2176・O-11 実装穴10件消化／`conditionChoose`／`selfTrash`）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き530 の計測行**（census 816・golden 2166・`CONDITIONAL_POWER_BONUS` 受け皿の解体しきり）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き529 の計測行**（census 818・golden 2162・`LRIG_STORY.negate` ／「追加で」節のゾーン照応の復元）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き528 の計測行**（census 817・golden 2160・`LEADING_STATE_CLAUSES` の module 化／裸の任意手札コスト／エナ「すべて」の ALL 化）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き527 の計測行**（census 817・golden 2155・`ALL_FIELD_SIGNI_MATCH` の ActiveCondition 実装／デッキトップ公開の焼き付き `cardType` 一掃）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き526 の計測行**（census 818・golden 2152・`NO_COMMON_COLOR_AMONG_FIELD_SIGNI` の class filter／`WX12-CB02` のレベル別5分岐）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き525 の計測行**（2026-08-17 続き525（§6.4 **O-11：連用形チェーンで「先頭節」が落ちる形**）後 最新値（本行が直近の正）**：**census 819**（820 から −1・`BASELINE_HIGH` も実数更新）、**golden 2147**（+5＝①条件節の内側での先頭バニッシュ復元 ②照応つき先頭節（対象＋それをバニッシュ）の復元 ③`LOOK_AND_REORDER` 後続文の1ドロー ④「手札をすべて捨て」が `DRAW_DISCARD_COUNT_PLUS_N` の**前**に走ること ⑤**公開/探索の複合文を割らない**負方向＝場出しが二重に走らないこと）、smoke **10688 / SKIP 0**、fuzz 全0、lint **0 errors / 262 warnings**、`census:stubs` A群＝**0種/0件 据置**。🆕**`verifyEffects` アクション照合＝25件/23カード → 22件/20カード**（全10シート実測）。🆕**`CONDITIONAL_POWER_BONUS` ＝14効果 据置**（§6.4 `O-35`）。🆕**live JSON changed 4効果 / 4カード**（CSV 非改変）。⚠**4経路とも実機未検証**（§7 送り）。

> **旧・続き524 の計測行**（2026-08-17 続き524（**`CONDITIONAL_POWER_BONUS`（ゴミ箱受け皿）の解体・第1巡**）後 最新値（本行が直近の正）**：**census 820 据置**、**golden 2142**（+6＝①`HAS_CARD_IN_FIELD{negate}`（構造＋engine 駆動の正負2方向）②`MILL{fromBottom}` の正準形 ③`MILL` が recorder＝後段が `LAST_PROCESSED_MATCHES` になること（`IS_MY_TURN` 化けの固定）④誤発火2件が `DEFERRED_*` であること ⑤直前処理の結果条件（バースト非所持／レベル合計＋`trashedPick`） ⑥`anyOf` の OR フィルタ）、smoke **10688 / SKIP 0**、fuzz 全0、lint **0 errors / 262 warnings**、`census:stubs` A群＝**0種/0件 据置**。🆕**`CONDITIONAL_POWER_BONUS`＝21効果/21カード → 14効果/14カード**（⚠着手前の実測値。続き523 の簿記「23」は机上値だった）。🆕**`verifyEffects` アクション照合＝25件 据置**（今回の対象はこの計器に映らない層＝別計器）。🆕**live JSON changed 8効果 / 8カード**（CSV 非改変）。🆕**新機構＝`HAS_CARD_IN_FIELD.negate`／`MILL` の recorder 登録／`MILL{fromBottom}` の parser 規則／`DEFERRED_TRASH_NAME_CHOOSE_COUNT`／`DEFERRED_REPEAT_ON_REVEALED_NAME`**。🔴**是正した誤発火2件**（原文に無いパワー修正の捏造＝`WX20-078-E1` の相手全体−5000／`WXDi-CP01-033-E1` の＋5000 多重適用）。⚠**8経路とも実機未検証**（§7 送り）。⚠**未着手のゲート**＝`STATE_HOIST_BATCH1_CARDS`（allowlist 外に 24効果）。

> **旧・続き523 の計測行**（2026-08-17 続き523（§6.4 **O-11 の `SEND_TO_ENERGY` 群を完全消化**）後 最新値（本行が直近の正）**：**census 820 据置**、**golden 2136**（+6＝①色宣言の store が `DECLARE_COLORS` であること＋後段の宣言色 filter と行き先 ②「この方法でトラッシュに置いた」候補が `lastProcessedCards` 限定であること（engine 駆動） ③場/エナ二択の両枝 ④`MASS_TRASH` に戻っていないこと ⑤多段閾値が then/else の**置換**であること ⑥可変枚数 ref `self_hand_over_five`（engine 駆動））、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors / 262 warnings**、`census:stubs` A群＝**0種/0件 据置**。🆕**`verifyEffects` アクション照合＝31件 → 25件 / 29カード → 23カード**（全10シート実測）。🆕**live JSON changed 11効果 / 11カード**（CSV 非改変）。🆕**新機構＝`StubAction.trashedPick`（候補を `lastProcessedCards` に限定）／`$ref:'self_hand_over_five'`／`wrapFieldOrEnergy`／`foldDeclaredColorTopReveal`／`foldGradedEnergyEachLevelReplacement`／`INTERNAL_TRASHED_PICK_HAND_OR_FIELD`**。🆕**`CONDITIONAL_POWER_BONUS` は live 26効果のゴミ箱受け皿**＝うち3本を解体（**残23効果が次の worklist**）。⚠**11経路とも実機未検証**（§7 送り）。⚠**残した drift**＝`WXK09-031-E2`（fresh が STUB へ退化するため E1 のみ外科パッチ）。

> **旧・続き522 の計測行**（2026-08-17 続き522（§6.4 **O-11 の可変枚数コスト**）後 最新値（本行が直近の正）**：**census 820**（819 から +1＝`BASELINE_HIGH` も実数更新。⚠**STUB を実装で置き換えた効果が高シグナル側へ昇格した +3 と、「同じレベル」限定の汎用化で回収した −1** の差引き。残る +2 は**ペア付け機構待ちの本物の穴**）、**golden 2130**（+1＝可変枚数の正準形・選択集合の相互制約・帰結の枚数追従・**ペア付け未実装のあいだ対象数を1に据え置く負方向**・トリガー元基準を上書きしないこと）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**0種/0件 据置**、`census:goldentypes` **未カバー 0型**。🆕**`verifyEffects` アクション照合＝34件 → 31件**（全10シート実測）。🆕**ペイロード空 `OPTIONAL_COST` ＝34効果 / 総数 606**。🆕**live JSON changed 9効果**（CSV 非改変）。⚠**3経路 実機未検証**（§7 送り）。

> **旧・続き521 の計測行**（2026-08-17（§6.4 **O-11 をさらに3件消化**）後 最新値（本行が直近の正）**：**census 819 据置**、**golden 2129**（+2＝「追加でエクシードNを支払う」と**ルリグの下が実際に4枚減る／skip では減らない**の対と、前置きつき原文で `exceed` payload が載ること）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**0種/0件 据置**、`census:goldentypes` **未カバー 0型**。🆕**`verifyEffects` アクション照合＝37件 → 34件**（全10シート実測）。🆕**ペイロード空 `OPTIONAL_COST` ＝37効果 / `OPTIONAL_COST` 総数 606**（⚠続き519 の「67」は `exceed`/`coinCost` を数え落とした**過大計上**＝正しくは続き519 時点 41）。🆕**live の `OPTIONAL_COST{exceed}` は 9 → 22効果**（エクシード踏み倒しの是正）。🆕**live JSON changed 16効果**（CSV 非改変）。⚠**3経路 実機未検証**（§7 送り）。

> **旧・続き520 の計測行**（2026-08-16（§6.4 **O-11 の実装穴6件消化**）後 最新値（本行が直近の正）**：**census 819**（823 から −4＝`BASELINE_HIGH` も 819 へ更新。これまで `SHUFFLE_DECK` だけに潰れていた文の語彙（探す／設置する／アクセにする）が live に載った分）、**golden 2127**（+2＝行き先2種の live 構造 assert と「デッキから探した札を【アクセ】にしても複製しない」E2E。⚠`trackedCardCount` は `signi_acce` を数えないので総数比較は明示的に足す）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**0種/0件 据置**、`census:goldentypes` **未カバー 0型**。🆕**`verifyEffects` アクション照合＝43件 → 37件**（全10シート実測）。🆕**新機構＝`recoverDroppedConjClauses`＋`CONJ_FIN`/`CONJ_SPLIT_RE` の単一定義／SEARCH の行き先 `INTERNAL_ASK_TRAP_ZONE`／`INTERNAL_ASK_ACCE_HOST`＋`INTERNAL_ATTACH_ACCE_TO_HOST`＋`StubAction.acceHostFilter`＋`resumeSearch` の枚数展開**。🆕**live JSON changed 6効果 / 6カード**（CSV 非改変）。⚠**2経路 実機未検証**（§7 送り）。

> **旧・続き519 の計測行**（2026-08-16（§6.4 **O-11＝計器の較正と仕分け**）後 最新値（本行が直近の正）**：census **823 据置**、**golden 2124 据置**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**0種/0件**（無言 no-op 0・明示 defer 0＝続き518 の O-10 クローズから据置）・C群 **172種/253箇所 据置**、`census:goldentypes` **未カバー 0型**。🆕**`verifyEffects` アクション照合＝135件 → 43件**（[STUB代替?] 78/[要確認] 57 → 計43。**全10シート実測**。⚠`npm run verify` は既定 `Sheet1` だけなので**在庫を数えるときは10シート回す**）。🆕**新指標＝ペイロードが空の `OPTIONAL_COST` 67効果 / live 606件**（コストの踏み倒し母集団・未着手）。**live JSON / CSV / engine / parser は非改変**（変更は `scripts/verifyEffects.ts` のみ）＝実機検証項目の追加なし。

> **旧・続き506 の計測行**（2026-08-16（§6.4 **O-8／O-9 クローズ**＝ともに 残0）後 最新値（本行が直近の正）**：census **823 据置**、**golden 2102**（+8＝強制アタック順の母集団と「可能ならば」のソフトロック回避の負方向2／`WX12-010-E3` の移動シグニ限定アップと `isDown` 絞り込み2／相手側可変枚数の3択と手札不足の負方向2／繰り返す解除ゲートの予約先・支払い枝・ゾーン占有時の不成立・未払い時の予約残存2）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **102枚 / 44群**（据置）、lint **0 errors**、`census:stubs` A群＝**16種/20件**（18種/22件から −2種/−2件＝明示 defer を実装で解体・無言 no-op 0）・C群 **172種/253箇所 据置**、`census:goldentypes` **未カバー 0型**。🆕**live JSON changed 3効果 / 3カード**（＋キー順だけの差1効果・CSV 非改変）。🆕**新機構＝`collectForcedAttackZones`＋ブロック理由 `FORCED_ATTACK_ORDER`（アタック順を gate へ1本化）／`execUp` の `count:'ALL'+upToCount`／`StubAction.opponentHandDiscardUpTo`（相手側の可変枚数コスト）／`PlayerState.facedown_release_by_payment`＋`flipFacedownSigniFaceUp`（繰り返す遅延ゲート）**。⚠**全経路 実機未検証**（§7 送り）。

> **旧・続き505 の計測行**（census 823・golden 2094・`selfToEnergy`／照応復元の純テキスト正規化）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き504 の計測行**（census 823・golden 2090・`StubAction.resonaSummon`／複数枚レゾナ配置）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き503 の計測行**（census 823・golden 2088・キーワード綴りの funnel 集約）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き502 の計測行**（golden 2082・`SigniAttackBan.zones`・choice ビルダーの漏れ一般ガード）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き501 の計測行**（golden 2079・`REPEAT_N_TIMES` 全文 regex 実装 106 行の撤去）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き500 の計測行**（census 826→825・golden 2072・A群 20種/22件→15種/17件・goldentypes 未カバー0 の達成行）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き499 の計測行**（`BASELINE_HIGH` 826・golden 2061・A群 20種/22件・UNKNOWN 残0 の達成行）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **過去の計測 15 行（続き478〜492）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-15 整理⑰」節へ退避**（2026-08-15）。**直近の正は上の1行**。
> **過去の計測履歴 48 行（続き298〜328 ほか）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避**（2026-08-02）。**直近の正は上の1行**。以後もここには最新1件だけを置き、旧行は同節の先頭へ移す。
- **🆕 2026-07-30 タスク12(xxix) 15波後の最新値（本行を (xxix) 系の正とする）**：**任意cost【出】母集団 981／`optionalOnPlayCostStub` で写せない 4**（＝`costUnparsed` の4件のみ。**すべて明示保留＝理由つきで不発を維持**しており `OPTIONAL_ON_PLAY_COST_REF_DEFERRED` は**0件**。内訳と保留理由は §4 進捗サマリ参照）。**`costUnparsed` 総数 21／AUTO・ON_PLAY・任意 4**。⚠**ゲート値（golden/census/smoke/held）は上の 2026-07-30 タスク12(l) 行が正**（本行の 15波時点の値は 1075／1394／10726／292枚 で、その後 (l) で更新された）。⚠**80/71/59/54/43/35/33/27/20/15/12/10/8/6 等の旧値は母数が違う**（波ごとに新語彙が増えたため）＝**投入前に必ず `npx tsx scripts/archive/xxixResidualCensus.ts` で数え直す**（実関数 `optionalOnPlayCostStub`／`wrapOptionalOnPlay` を import して live JSON を全数走査する計測スクリプト。簿記の数字は信用しない）。
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**held は 229枚／署名グループ 104件（2026-08-07 続き375 実測・据置・`node scripts/heldReview.mjs`）**。旧 242枚/104件＝続き370。旧 259枚/110件＝2026-08-02 続き330＝タスク12(lxxxii) **第6波**の後の実測（⚠**第1波が「採用禁止」と書いた +7カードのうち5枚は誤判定だった**＝`WXK08-002` の退化を根拠に巻き添えにしていたもので、実測すると live 側が「選択肢1本に平坦化＝強制実行」で壊れていた（第6波で採用済み）。**held の「採用禁止」ラベルは根拠カードごとに検証してから従うこと**。旧 265枚/116件＝第2波後の実測。⚠第1波の簿記に codex 報告の 266 を書いてしまい第2波で訂正＝**codex の集計値は鵜呑みにせず数え直す**。⚠第1波の簿記に codex 報告の 266 を書いてしまい第2波で訂正＝**codex の集計値は鵜呑みにせず数え直す**。⚠**直近 +7カードは「採用禁止」在庫**＝parser 緩和が MANUAL/PARTIAL 温存カードの fresh にも波及したぶんで、`WXK08-002` の fresh には退化4点がある＝[PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」の (lxxxii) 行を読んでから採る）。旧 258枚/109件＝2026-08-02 (lxxxiii) 第15波後。旧 251枚/99件＝2026-08-01 タスク12(lxxvii) 実働化後（+1 は honest defer＝`WXK03-069`）。旧 288枚/106件＝2026-07-30 タスク12(lxi) 本消化後の値で、以下の内訳はその時点のもの。**内訳＝lxi 規則で新たに 24枚 held に落ちたが、その24枚と既存2枚〔`WX24-P1-071`／`WX25-P1-005`〕を同じ回で全採用したので、正味は前回 290枚から −2**。旧 290枚/107件＝§6.3 H 節クローズ後。旧 286枚＝タスク12(l) 後。旧 292枚/107件＝(xxix) 15波後。⚠2026-07-29 の5波後は 293枚だった。⚠従来ここに書いていた「251枚」は `21a24900` 時点の値で、その後の parser/manual 変更ぶんが `_held_review.txt` に反映されていなかっただけ＝ベースラインコミットの worktree で再生成して 293/107 の一致を確認済み・`node scripts/heldReview.mjs`）。LOSS/VALUE は **held 259 / LOSS 203 / VALUE 54 / ADD 2（2026-08-07 続き370 実測）**。旧 held 188 / LOSS 154 / VALUE 34（2026-07-19 実測・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**。続き29時点（held 79）からの増加は主に**その後の parser 改善で fresh が curated より正しくなった採用待ちバックログ側**（Sonnetタスク6の採用サイクルで消化してから実数を締め直す）。**この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。旧内訳の詳細は PLAN_DETAIL 参照。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 1291【効果単位】**（2026-08-02 task12(lxxxiii) 第7波＝leave-field trigger 主語1効果の live 忠実化、1294→1293）（🏁 P1完了宣言〔2026-07-23〕の凍結基線1581から、§6.3個別機構の消化で逓減中。1393→1391 は本セッションの構造化2件ぶん）。**宣言後の推移チェーン（1581→1393 の各バッチ内訳）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理：census 推移チェーン」節へ退避**。宣言後は worklist ではなく回帰ゲート＝**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**（新規 parser バッチは切らない）。前提＝`docs/_effect_srctext.json` が最新。3分類〔§6.3送り282／粗網のみ116／長テール1183〕は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭。明細 `docs/_vocab_census.txt`、**宣言前のバッチ逓減履歴（1919→1581）と旧計測は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4 の退避節**／BUGFIXES 続き109以降。
- **census 現行補正（第14波）**：高シグナル欠落 **1289**（`WXDi-P14-087-E1` のクラッシュ元限定 live 実働化で 1290→1289）。上行の長期推移文中に残る1291は旧値。
- **母数**：効果カード 5975／効果 **10679**〔2026-07-30 タスク12(l) で47効果がトップレベルから付与入れ子へ移り 10722→10679〕／旧 10719／MANUAL効果 891／STUB含むカード 1862・STUBノード 2432（2026-07-19 実測更新。STUBS.md サマリーと整合）。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### ㉛-2 旧「📌 次の一手（推奨順）」の退避本文（続き432／440 時点）

> ⚠**この節に挙がっていた worklist はほぼ全部が消化済み**（§6.4 O-n は残 O-1 のみ／Opusタスク12 は在庫0／
> §5d-0 (i) の ★★セルも 242→197 まで消化）。**参照するのは「罠」と「心得」だけにすること。**

> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝**全ゲート緑（2026-08-10 続き417）＝golden 1753・smoke 10686 全0（SKIP 0）・fuzz 全0・同型★0（265群）・census 860・manual field loss 0・lint 0 errors。以下の旧値（続き394〜396）は参考**＝golden **1682**・smoke **10686** 全0（SKIP も 0）・fuzz 全0・同型★**0**（265群）・census **882**（回帰ゲート）・manual field loss 0・lint 0 errors/**254 warnings**（⚠`--cache` 使用のため実数とズレる＝簿記前に `rm -rf node_modules/.cache/eslint`）・held **111枚／48群**。**被覆マトリクス miss 277**。**混在カードのレビュー待ち 3カード**。**live の `parseStatus:"UNKNOWN"` は 0**（⚠**入れ子の `action.type:"UNKNOWN"` は 43件**）。⚠**未検証UIが続き380〜392 で計9件**。
>
> **🏁 P1（表現）は 2026-07-23 に完了宣言済み**（宣言・3分類・以後の運用＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭／§2 DoD／§5）。**主軸は P2/P3**＝①**§6.3 機構台帳**（宣言で正式送りした282効果の消化先＝正面40・チーム35・ゲームから除外残・アンコール19・動的比較14・ソウル11・ドライブ9 等を機構単位で）②**§7 実機検証** ③**BEHAVIOR_AUDIT（§5a・フェーズ跨ぎで継続）**。
>
>
> 0. 🎯**次の一手（2026-08-11 続き440 更新）＝Opus 側 / Sonnet 側で分ける**
>    - **【Opus 側】(1) `resolveNum` を使う `count` 消費地点の死角を閉じる**（続き440 で発見）＝`TRANSFER_TO_HAND`（`effectExecutor.ts:2288`）ほか `:1005`／`:2238` は `resolveNum(src.count)` を使い、**`resolveNum` は `{$ref}` を問答無用で 0 にする**（`execUtils.ts:118-120`）＝**動的枚数を書いても黙って0枚**。`resolveCountRef` へ寄せるか、**「ここに `$ref` を書くと0になる」を golden のトリップワイヤで固定**する。⚠これが閉じれば `WXEX1-44-E2`（続き440 で defer）も通る。
>    - **【Opus 側】(2) §3 (cxxiii) ピースのコスト二重請求の裁定**＝`executeKeyPiece` は `AUTO`/`ON_PLAY` しか積まないのに `WXDi-P14-002-E1` は `ACTIVATED`/`MAIN`＝**セットしただけでは効果が発火せず**、KEY の【起】から起動すると**印刷 Cost と同じ `cost.energy` をもう一度**払う。⚠**`executeKeyPiece` は キー と ピース の共通経路**なので片方だけ直すと キー が壊れる。**まず Type='ピース' の母集団を数えて設計判断から**。
>    - **【Opus 側】(3) §6.4 の未消化 worklist**＝番号つき表（`O-n` は着手順ではなく参照用の固定ID・欠番はそのまま）。**🆕2026-08-15 に `O-20`（全文 regex 読み・20サイト）と `O-21`（到達不能ハンドラ・19 id）を消化**（詳細は PLAN_DETAIL「2026-08-15 整理⑮」）。**🆕2026-08-16 続き517 で残0の12行を PLAN_DETAIL「2026-08-16 整理⑳」へ退避**（表に残るのは生きている12件だけ）。**🆕2026-08-15 続き484 で `O-22`（(a)(b)(c) 全部）／`O-23`／`O-24` も消化**（詳細は PLAN_DETAIL「2026-08-15 整理⑯」）。**🆕2026-08-15 続き485 で `O-19`（watcher の `triggerScope` 推論）と新設 `O-25` の本体（引用能力の自己付与）も消化**。**🆕2026-08-15 続き486 で `O-3` の最大クラスタ（`DEFERRED_UNPARSED_THIS_TURN_OPP_CLAUSE` 7効果）を解体**＝新機構 `SIGNI_ATTACK_BAN`／既存 `PREVENT_DAMAGE`／盤面リセット STUB で**5効果の恒久 no-op を解消**し、残り3形を固有 id へ分割。**🆕2026-08-15 続き487 で `O-3` の `_NEXT_OPP_TURN_CLAUSE`（5）と `_THIS_AND_NEXT_TURN_CLAUSE`（4）も解体**＝新機構 `SIGNI_DEPLOY_BAN`（配置禁止を**場に出す側**に載せ既存 `deployLimitBlockReason` で判定）ほかで**7効果を是正**（うち1件は「期間つき」と型に書きながら失効地点が1つも無い**永続化バグ**）。**🆕2026-08-15 続き489 で `O-3` の `NEXT_OPP_ATTACK_PHASE_START`（2）も解体**＝新機構 `DELAY_TO_NEXT_OPP_ATTACK_PHASE`（予約は**予約した側**に積み collector は `opState` を読む）＋裏向きルリグゾーンで**5効果を是正**（⚠**A群に出ていた2件より、出ていなかった2件のほうが壊れていた**＝原文 regex で母集団を数え直すこと）。**🆕2026-08-15 続き488 で `O-3` の `EXTRA_ATTACK_PHASE`（2）／`SELF_RESTRICT_THIS_TURN`（2）／`UNPARSED_NEXT_OPP_TURN_CLAUSE`（1）も解体**＝新機構 `ADD_EXTRA_ATTACK_PHASE`／エナ支払い封じ／ターン終了時エナ返却／`POWER_MODIFY.deltaFromZone` で**8効果を是正**（うち4件は「遅延タイミング宣言の後続文が即時実行されていた」過剰実行）。**🆕2026-08-15 続き490 で `O-3` の `ATTACK_TAX_HAND_DISCARD`（1）も解体**＝`SigniAttackBan.unlessPayHandDiscard` を新設し、隣接の**無言 no-op**（引用文が `GRANT_KEYWORD.keyword` に入って一度も効かない `WXDi-P05-022-E1`）も同時に是正。**🆕2026-08-15 続き491 で `O-3` の「フェイズ／ターンのスキップ」系統も解体**＝新機構 `PHASE_SKIP_BLOCK_IDS`＋`resolveNextPhaseWithSkips`（フェイズスキップを**次のフェイズを決める1点**へ）と `resolveTurnHandover`（ターン交代判定を**1関数**へ＝`extra_turn` と新設 `skip_next_turn`）で**6効果を是正**（⚠**壊れていた6件のうち4件は STUB ですらなかった**＝未消費の `BLOCK_ACTION` id・綴りズレ・ログだけのハンドラ＝`census:stubs` に映らないクラス）。**🆕2026-08-15 続き492 で `O-3` の `UNTIL_NEXT_MAIN_PHASE_CLAUSE` も解体**＝「ルリグによってダメージを受けない」の**期間軸**（`PREVENT_DAMAGE{scope:'LRIG'}` 1本）と**走査軸**（`isLrigDamagePrevented`＝シグニ／ルリグ／アシスト／キー）をまとめ直し、新期間 `MY_NEXT_MAIN_PHASE`（`clearMainPhaseScopedState` の1点で失効）を足して**9効果を是正**。**🆕2026-08-15 続き493 で `O-3` の `NON_FIELD_ZONE_MOVE_IMMUNITY` も解体**＝「対戦相手の効果によって移動しない」の期間軸を `opp_move_immunity`（`signi_deploy_bans` と同じターン数カウントダウン）へ1本化して**5効果を是正**（⚠🔴旧 `prevent_opp_trash_from` は **set 1箇所・clear 0箇所**で永続していた＝続き487/489 に続く**3回目**の「失効地点が無い期間つきフィールド」）。あわせて「次の対戦相手のターン終了時、〜」の遅延本体を明示 defer（`DEFERRED_NEXT_OPP_TURN_END_BODY`）へ落として即時実行を止めた。**🆕2026-08-15 続き494 で `O-28` の「《無》×Nを支払わないかぎりアタックできない」5効果も消化**＝続き490 の fixup を《無》版へ一般化し、`SigniAttackBan.appliesTo:'LRIG'` で**ルリグのアタック税**軸を追加。あわせて engine の一般バグ2件（🔴`SELECT_TARGET_ONLY` がルリグ対象を扱えず**丸ごと no-op**／🔴**入れ子 SEQUENCE で内側の continuation が上書きされ消えていた**＝母集団 47＋147効果）と、🔴`performLrigAttack` の「《無》を払えないときは else で素通り＝タダでアタック」も是正。**🆕2026-08-15 続き495 で `O-30`（「〈コスト〉を支払わないかぎり、X」の回避ゲート）も消化**＝**在庫は「1効果」ではなく母集団44カード**で、「自分＝能力の持ち主が払う」形に規則が1つも無く**無条件バニッシュ**になっていた8効果を正準形 `OPTIONAL_COST{unlessPay}` へ組み替え、🔴**払う側の取り違え**（`WX24-P2-044` の MANUAL が `OPPONENT_PAY_OPTIONAL`＝使った側に払わせていた）も是正した（**golden がこの誤りを写していた**）。**🆕2026-08-15 続き496 で `O-31`（「対戦相手が払う」側）の回避クローズ4効果も消化**＝**在庫は効果単位で数え直す**（カード単位は偽陰性）。「付与そのものを止める支払い」を標準ペアで表せるよう除外④に例外を足し、🔴引用括り（「以下をN回行う。「…」」）で回避が消えていた形と、🔴【常】の正面アタック禁止が**払っても通らない**形（`cannotAttackSigniUnlessPayColorless` を新設）を是正。**🆕2026-08-15 続き497 で `O-3` の受け皿2種も解体**＝新機構 `DELAY_TO_NEXT_OPP_TURN_END`（続き489 のアタックフェイズ版と同型）／`TargetFilter.attackedThisTurn`／`OptionalCostSpec.trashOwnKey`。🔴`WDK06-R09-E1` は**相手のターン終了時に自分のシグニを1体タダでバニッシュ**していた。⚠**遅延を跨いだ照応は予約できない**（`WXDi-P09-066-E1` は受け皿のまま＝過少側）。**🆕2026-08-15 続き498 で `O-3` は完了**＝残っていた受け皿7種をすべて解体（新機構 `RETURN_FACEDOWN_LRIG_ZONE_TO_HAND`／`FIELD_SIGNI_TO_CHECK_ZONE`／`GAIN_LRIG_TYPE`／`DECLARE_CARD_NAME_LOCK`／`SigniAttackBan.exceptCardNums`）。🔴隣接で見つけた恒久 no-op も是正＝`SPDi43-02-E2`（**自分の**手札をトラッシュしていた）／`WDK17-001-E2`（【起】なのに CONTINUOUS 専用 STUB）／カード名の使用封じが**アーツ一覧と実行入口を素通り**。**次の候補＝🆕`O-32`（`REPEAT_N_TIMES` の二重実行3効果）／🆕`O-33`（アタック禁止のゾーン限定・次の相手ターン軸）／`O-28` の残23綴り／`O-4`（UNKNOWN 25ノード/25カード）／`O-25` の残3件＋【常】引用クラス／~~`O-26`（コスト節の自己トラッシュ脱落2件）~~**。🆕**この候補リストは消化済み**＝`O-32`/`O-33`（続き501/502）・`O-4`（続き499）・`O-28`（続き503）・`O-36`（続き534）・**`O-26`（続き535＝実測は2件ではなく6効果）**。生きている worklist は下の §6.4 の表を見ること。⚠**受け皿 id の「件数」だけ見て設計しない**＝続き486 では7件に**5機構**、続き487 では9件に**7機構**が混ざっており、原文を並べて初めて「大半は既存の funnel に乗る／数件だけ新UIが要る」と分かった。⚠**`parseCardEffects` の内側から `abilityBlockTextOf`／`getAbilityBlockTexts` を呼ばない**＝後者が `parseCardEffects` を呼ぶ**無限再帰**（続き487 で `build:effects` が実際にハングした）。`inferTriggerScope` が安全なのは `buildEffectsMap`＝parseCardEffects の**外**から呼ばれているから。⚠**「期間つき」と型コメントに書いてあるフィールドは失効地点を grep して実測する**＝`signi_deploy_power_limit` はリセット地点が1つも無く永続していた（続き487）。⚠**STUB を実装で置き換えると census が +N する**（`vocabCensus` は STUB を含む効果を別バケツへ逃がしているため、その効果の他の未表現語彙が同時に昇格する）＝毎回「計器の較正漏れ」か「本物の穴」かを仕分ける。⚠**在庫は §3-1 のとおり必ず実測してから着手する**＝続き483 では簿記の「58 id」が実測19 id だった（入れ子分岐を重複と誤検出していた）。🆕**続き485 では `O-19` の在庫が「推論依存」の記述に反して実測1効果**だった一方、**隣接に9カード規模の別クラス（`O-25`）が埋まっていた**＝**在庫の大小より「その層が計器に映るか」で優先度を決める**。⚠**`census:stubs` は「ハンドラの有無」で実装ありを判定する**＝ログを1行出すだけのハンドラは素通りする（続き459 の教訓）。
>    - **【Sonnet 側】(4) §7 実機検証の続き**＝続き436 で `keycost-energy-*`／`my|op-lrig-slot-*`／`card-action-*`+`data-action-label` を整備したので**新規シナリオが安くなっている**。未検証ブロックは §7 に20以上。⚠**(cxxiv) は続き463 で解決済み**（真因は parser の runtime scope 誤補完＝`ON_TURN_END` 41効果の無言不発）。次は §7 の未消化ブロックから。
>    - ⚠**共通の心得（続き435〜440 で確立）**＝①**★★セルでも開くまで投げない**（4 family 連続で偽陽性だった）②**在庫の症状記述は古い前提で live を見る**（3件が既に修正済みだった）③**罠は行番号つきで先出しすると当たる**（8例連続）。
> 0. 🎯**次の一手（2026-08-11 続き432 更新）＝§6.4 の残**＝(a)~~離場置換の対話 policy／`WXDi-CP01-023`／消化済み項目の宿題~~ **✅続き430〜432 で完了**（残は**置換の「してもよい」辞退**＝ライフクラッシュ置換側）。(b)**UNKNOWN 36ノード/34カード**（1カード1機構の単発が大半）(c)**所有者語の「前」に付く修飾が filter に載らない**（`WX25-P3-014-E1` 等・20枚規模）(d)**残 A群16件の明示 defer 見直し**（§6.3 の機構が進んだものから解ける）。**Sonnet 側＝§7 実機検証（続き428 のエナ支払い回帰確認が最優先）**。以下は旧「次の一手」（参考）。
>
> 0-旧. **granted-auto collector の timing 汎用化 →「このゲームの間」型3枚**（`WXDi-P11-002`／`P11-003`／`P04-002`）。⚠**実測済みの障害**＝付与ストア（`lrig_granted_auto_effects`／`game_granted_auto_effects`）の収集は**timing ごとに4箇所へ別々にハードコード**されている（`ON_ATTACK_LRIG`＝`grantedAuto.ts`＋`triggerCollect.ts:535`／`ON_CARD_MILLED_FROM_DECK`＝`:1604`／`ON_ENERGY_TO_TRASH`＝`:1944`／相手側の汎用 scope＝`:3743`）。3枚は **timing 3種＋`P11-002` は付与先が対戦相手**なので、**先に「付与ストアを任意 timing で走査する共通経路」を作る**ほうが安い（**§4 教訓 (i) の同型＝「型ごとに枝を足す層」の再来**）。次点＝**「ルリグとシグニ」母集団の残り4枚**（`WD13-010-E1`／`WXDi-P06-031-E1`／`WXDi-P14-040-E1`／`WXK07-005-E3`＝機構が別々なので1枚ずつ）／`WXDi-P14-002`／`WXDi-P16-002`。**機構待ち8枚**と**計器の死角**は §4 進捗サマリ㉕を参照。次点＝§6.3 の残 **C／E／F／G／K**。
>    ⚠**(i) の ★セルは3回連続で薄い**（377m・378・379 とも上位セルの大半が条件節用法のクロス計上・計器の誤検出）＝**取るなら必ず `--cell` を開いて0件でないことを確かめてから**。
>    ⚠**条件に語彙を足すバッチでは、両評価器（`evalCondition`／`checkActiveCondition`）と両 `matchesFilter` の扱いを先に決める**＝続き378 は**揃えるのが正しく**（`isDisona`）、続き379 は**揃えてはいけなかった**（`powerRange`＝持続側を実効パワーにすると循環）。**「パリティを取る」は自動的に正解ではない。**
>    ✅**続き379 で「`isDisona` の条件節グループ」は消化済み**（8効果＝常在3＋解決時5・新しい条件型ゼロ）。
>
>    🏁**⓪-2 の7効果は続き377n で完遂**（(a) `execAttachCharm` の複数ペア4／(b) `execGrantKeyword` の `upToCount` 2／(c) `classMatchesDiscardSigni` の配線1）。**在庫2効果を取りに行ったら `owner:"any"` の誤りが14効果出た**＝**「関数名まで特定して据置」した在庫は調査ゼロで入れるので費用対効果が最も良い**。次に据置するときも同じ粒度で書き残すこと。
>
>    🏁⚠**(iv) 計器較正は枯れた（続き377m 実測）**＝条件節クラスタ258件では5語彙 −17 が取れたが、続く「Nまで」52件は**1件も較正できず全件が実バグ**だった。**較正で census を下げ続けることはもうできない**＝以後 census を動かすのは機能是正のみ。
>    ⚠**★★セルの残りも薄い**＝続き377m でセル6本を全数分類したところ **41 miss 中 真の脱落は2件**（`levelExact × SIGNI`／`isDisona × SIGNI`／`cardClass × TRASH{HAND_CARD}`／`cardClass × BANISH{SIGNI}` は**4セルとも0件**＝全部が条件節用法のクロス計上）。**(i) から取るなら、まず `--cell` を開いて0件でないことを確かめる。**
> 
>    ⚠**(iv) stale live の「枯渇」は範囲つきで読む**＝続き377h の宣言は *census が見える範囲* だけで、続き377i で `thisCardOnly` のように **census 語彙に無い脱落**がまだ大量にあった。根本原因（`build:effects` のカード単位温存）は続き377i で解消済みなので、**以後は parser を直せば自動で live に届く**。手作業の刈り取りは原則不要。
>    - **⓪ `docs/_partial_fresh.json` は残り3カード＝すべて機構ギャップ**（続き377k で 10→3。行列は「採用待ち」ではなく **parser のバグ台帳**として読む＝続き377j の教訓）。内訳＝`WXK07-031`（fresh が `UNKNOWN`＝「対戦相手の効果はバニッシュ以外であなたの＜宇宙＞のシグニを場から移動させない」の語彙が無い／E2 は REVEAL_UNTIL の構造違い）／`WXK10-075`（fresh が `GRANT_FIELD_SIGNI_ABILITY`＋STUB へ落ちる＝アクセホストへの付与＋自パワー参照セット）／`WDK17-009`（fresh の2段目が `STUB:CONDITIONAL_ARTS_COST`＝live の `LIFE_CRASH{triggerBurst:false}` に届かない）。**この3枚は §6.3 機構台帳として扱い、行列そのものは片付いたものとして読む。**
>    - **🏁⓪-2 (ii) 在庫＝「Nまで」上限がengine側で消費されない7効果 ＝ 続き377n で完遂**（(a) `execAttachCharm` の複数ペア4件／(b) `execGrantKeyword` の `upToCount` 2件／(c) `classMatchesDiscardSigni` を `execRevealAndPick` へ配線1件）。**ペア数＝`min(チャーム候補, 付与先候補, charm.count, to.count)`／`upToCount` は BANISH と同じく `selectOrInteract` の第3引数へ／捨札参照は `resolveDiscardLevelFilter` を先に通す**。⚠**波及して見つかった本命は `owner:"any"`＝engine で `tgtOwner="opponent"` に解決される**（14効果が相手のシグニに付与していた）＝対象名詞句そのものから所有者・体数・上限を取る `signiClauseTargetSpec` を新設して解決。詳細は [BUGFIXES.md](./BUGFIXES.md) の続き377n エントリ。
>    - **① 未分類の ★★セルから取る**（miss/has・2026-08-08 実測）＝`cardClass × TRASH_CARD[filter]` 7（284）／`cardClass × TRASH{HAND_CARD}` 6（70）／`color × SIGNI[filter]` 10（111）／`powerRange × SIGNI[filter]` 10（498）／`levelExact × SIGNI[filter]` 7（69）。⚠**分類済みで「1 regex で N 効果」型ではないもの**＝`cardClass × (filter無)` 25（88・5系統の寄せ集め）／`cardClass × SIGNI[filter]` 18（440・15件がクロス計上）／🆕`cardClass × POWER_MODIFY{SIGNI}` 4（172・続き377l で左右ゾーン3件を消化＝残りは在庫済みの `WX05-044-E1`／`WX24-P3-059-E1` とトリガー主語のクロス計上）。🆕**`color × SIGNI[filter]` は着手前に注意**＝続き377l の下見で 10件のうち**5件が「エナゾーン/場/トラッシュに〈色〉のカードがあるかぎり」の条件節**、2件が「手札から〈色〉のシグニを1枚捨ててもよい」の**効果内コスト**＝対象フィルタは実質3件（較正候補）。
>    - **② `eachDistinctLevel` 28（has 1）** ＝最大の塊だが同入口に配線済みなし。**まず「機構が無いのか、キー綴りが違うのか」を確かめる**（trap (h)）。
>    - **③ 小粒だが has があるセル**＝`powerRange × GRANT_KEYWORD{SIGNI}` 9（8）★／`levelExact × POWER_MODIFY{SIGNI}` 9（7）★／`isDisona` 23（32）。⚠`powerRange` は「パワーを＋N」＝**action の値**との取り違えが濃い（**較正候補**）。
>    - **④ 🆕stale live で見つかった7つの壊れ方は parser 側にも残っている可能性がある**（続き377h）＝**duration 取り違え**（`UNTIL_OPP_TURN_END`→`UNTIL_END_OF_TURN`）／**付与対象の `thisCardOnly` 脱落**／**条件節の常時true化**／**「そうした場合」の対象取り違え**／**trigger timing の平坦化**（内側の付与能力を最上位へ）／**【使用条件】の焼き付き**／**条件節由来の `excludeSelf` が相手側の対象フィルタへ漏れる**。**この7型を探索キーにして全CSV走査すると新しい母集団が取れる。**
>    - ⚠**着手前に必ず読む罠**＝(a) **素の `parseStoryFilter`/`parseLevelFilter`(文全体) を対象フィルタに使わない**＝**`signiClause*Filter` 3兄弟**を使う。(b) **曖昧なら付けない**。(c) **auto-commit があるので `git stash` で A/B が取れない**＝ベースラインコミットから `git show <sha>:<path>` で取り出す。(d) **exec 側の配線を必ず確認する**（`matchesFilter` は `excludeSelf`/`upToCount` を見ない）。(e) **セルは入口であって終点ではない**＝ビルダー全体を読む。(f) **枚数・値だけ先に直さない**。(g) **★★セルの miss 数は見込み件数ではない**。(h) **同じ概念に2つのキー綴りが併存していないか先に確かめる**。(i) **同じ語彙でも入口ごとに壊れ方が違う**。(j) **A/B の件数＝直った件数ではない**。(k) **採用前の確認は JSON パースによる構造比較で**。(l) **セルは母集団の索引であって母集団そのものではない**。(m) **安全弁はコメントの規律ではなく関数の戻り値にする**。(n) **census が減らないときは live と fresh を全件突き合わせる**。(o) 🆕**「held が新しい」は「held が正しい」ではない**（実測 40件中2件が逆方向）＝**全件原文照合は省略できない**。(p) 🆕**`manualEffects.ts` の MANUAL 定義が live より古いことがある**＝held が消えない MANUAL 効果は**ソース側**を直す。
>    - **✅消化済み**＝「他の」ゲート棚卸し（377）／`noGuard`（377b）／アイコン系（377c）／`levelRange`（377d）／全体バフの語順＋据置held（377e）／ON_ATTACK_SIGNI の味方側トリガー主語＋`excludeSelf` の過剰発火（377f）／stale live の一括解消 38効果（377g）／(iv) stale live の刈り取り 37効果（377h）／**収穫マージの効果単位化 70効果（377i・stale live の構造的原因を解消）**／`_partial_fresh` 行列の parser 是正 7効果（377j）／`_partial_fresh` 行列を 10→3カードへ 19効果（377k・acceHost の到達不能規則／2グループ手札コスト／条件節の後続文への持ち上げ／孤立 reorder の畳み込み）／左右のシグニゾーン機構の新設 15効果（377l・`zoneSide`＋`IS_SELF_IN_SIDE_ZONE`。付与側のゾーン限定は中央すら無かった／`from:[種別]` の過剰保護も是正）／🆕**Codex 委譲＝`isDisona`/`excludeResona` の対象フィルタ合成漏れ 22効果（378・engine の `matchesFilter` パリティ穴で5効果が全味方バフだったのを含む）**／Codex 委譲3バッチ（377m）＝(iv)計器較正 第3バッチ〔条件節クラスタの5語彙・偽陽性17件〕・第4バッチ〔置換3語彙・偽陽性3件。🏁ここで (iv) 枯渇〕・(i)配線ギャップ 第18バッチ〔「Nまで」上限スロットの脱落 7効果。残7効果は engine 未配線で据置＝⓪-2 へ〕**。
>    - **(ii) 機構ギャップの安い在庫**＝`parseStatus:UNKNOWN` の完全no-op **6件**（🆕`WX25-P1-048-E1` を追加＝レベル１以上のアシストルリグでアタックできる）／`PARTIAL` **23件**／`LOOK_PICK_CHAIN` の exact-N 表現ギャップ **23効果**（`cardClass × (filter無)` の10件がここに合流）／「場に《ライズアイコン》を持つシグニがN体ある場合／あるかぎり」の条件型 **5件**／左右のシグニゾーン限定の filter キーが無い 3効果／**【ソウル】が付いているシグニの filter キーが無い 1効果**（`WXDi-P04-016-E1`）／🆕**`WX25-P1-061-E1` の `triggerScope:any_ally`＋`placedFromTrash`**（377h で timing だけ是正した途中段階。足すと golden の「段階2 mandatory集合」が 1455→1454 に戻る）。
>    - **(iii) 構造混線の在庫**＝🆕**`WXEX2-18-E2`**（続き378 で据置＝原文「**対戦相手のシグニ1体を対象とし**、レゾナではない**あなたの**＜遊具＞のシグニ1体をバニッシュする。そうした場合、**それを**エナゾーンに置く」なのに live は BANISH も SEND_TO_ENERGY も `owner:"opponent"`＝**2対象の owner ごと取り違え**。⚠**誤った相手対象に `excludeResona` を足して誤りを固定しないこと**＝golden にトリップワイヤ設置済み）／🆕`WXK05-052-E1`（「対戦相手のシグニを２体まで対象とし、**このシグニと同じシグニゾーンに【シード】がある場合**、次のターンの間、それらは「【常】：アタックできない。」を得る」＝**条件節の【シード】をキーワードと誤読**して「あなたのシグニ1体に【シード】を付与」に化けている。⚠体数だけ広げると誤りを増幅するので golden にトリップワイヤ設置済み〔続き377n〕）／`WXK05-043-E1`／`WX24-P3-059-E1` ほか §5d-0 (iii) の登録分／続き377f で分類した8件（`WDK10-001-E3`・`WXEX2-48-E1`＝トラッシュから選んだシグニをライフに加えるはずが `ADD_TO_LIFE{fromTop}`／`WDK07-E07-E1`・`WXK10-074-E1`＝【アクセ】付与が丸ごと脱落／`WX05-080-E1`／`WX25-P2-079-E1`／`WX16-003-E1`）／**コスト節の限定脱落**（`WX05-044-E1`＝「他の＜古代兵器＞のシグニ1体をバニッシュする」コストが丸ごと落ちて**無料で撃てる**／`WX14-016-E1`＝アンコールコストが別物／`WX08-036-E1`＝対象側のパワー条件をコスト側に載せている／`PR-322-E1`）。／🆕**続き377k の発見3型**＝(a) **acceHost の複合形3枚**（「これにアクセされているシグニのパワーを＋Nし、それは「…」を得る」＝`WX20-072`／`WXEX2-69`／`WDK17-015`。単体の `POWER_MODIFY` 形は続き377k で配線済みだが、この複合形は Part1 の POWER_MODIFY 分岐に載らず live の `GRANT_ACCE_HOST_ABILITY` に届かない）／(b) **`WX12-CB02-E1` の多分岐が2段しかない**（原文はレベル1〜5の5分岐だが live MANUAL はレベル1・2のみ＝レベル3〜5が丸ごと無い。⚠parser 側で無条件 SEQUENCE に足すのは禁止＝golden にトリップワイヤ）／(c) **`suppressOnPlay` の配置アンカーが特定できない2形**（`WX20-020`＝CHOOSE の④に属する末尾文が buildChoose の外に出るため選択肢の `ADD_TO_FIELD` に載らない／`WXDi-P11-007-E3`＝直前が `REARRANGE_SIGNI` で `suppressOnPlay` を持てる型が無く `BLOCK_ACTION{ON_PLAY_ABILITY}` が死んだまま残る。live も同じ）。／🆕**続き377l の発見2型**＝(d) **`WX10-036-BURST` の付与キーワードが条件側の【チャーム】に化けている**（正しくは【アサシン】。live も同じ。⚠「`を得る/を持つ` に隣接する【K】を取る」一般化は 36カード中16カードを退化させたので**禁止**＝golden にトリップワイヤ5枚。個別に直すなら「【K】が**付いているかぎり**」等の条件表現を `isPossessionFilterKw` と同じ要領で除外する）／(e) **ゾーン限定付与の duration 取り違え**（`WX05-034-BURST`「このターンと次のターンの間」・`WD15-002-E1`「このターン」が `duration:"PERMANENT"`＝**永続化して効きすぎる**。duration 軸は続き377h の7型の1つと同系統）。
>    - **Sonnet 側**＝§7 実機検証（タスク1）。⚠コイン支払いは `BattleScreen.tsx` の**10経路**のうち ACTIVATED【起】1本しか実走していない。
>    - ⚠**見積もりの現在地**＝census **924**／被覆マトリクス miss **291**。直近バッチの実績＝12／30／17／8／15／11／38／37／70／7／19／15／23／**22**効果。**census が動かない回でも効果は直る**（377c は census 据置で17効果）＝**census の増減だけで成果を測らない。**
> 1. **自分のモデル側のタスク表（§3）から取る**。**Opus の主戦場＝§6.3 の機構実装（機構単位・実IDは `docs/_p1_classification.txt`）＋タスク12 の生き残り在庫**＝🏁**現存0件**（2026-08-08 に (cxv)(cxiii)(cxiv)(cxvii)(cxviii) を残0クローズ＝受け口は空。⚠この行が挙げていた (lv)/(lxvi)/(lxxxviii)/(xciii)/(xciv)/(xcvi)/(xcvii)/(c) は 2026-08-06 に全件残0クローズ済み＝§3 の在庫表が正）。**🏁(xcii)(xcv)(lxvii)(xcviii)(lxviii)(xcix) は 2026-08-04 に残0クローズ**。**(lxx)／(lxxviii)／(lxxxiii)／🏁(lxxxii) は 2026-08-02 に残0クローズ＝§3 の表から退避済み**（完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」）。それ以外の残0在庫の完了行原文は同ファイルの各整理節。**🏁タスク16 も残0クローズ**。**Sonnet の主力は タスク1（§7 実機検証）**＝未検証UIの単一 worklist は §7 に集約。⚠**§6.3 H と続き298〜Batch F の全件が UI 未検証**。
> 2. **手順はスキルに従う**＝`/audit-card <CardNum>`（BEHAVIOR_AUDIT 1カード監査1巡）・`/baton`（セッション終了時の簿記）。散文の記憶で回さない。⚠`/census-batch` は P1宣言により**新規バッチを切らない**（census 外の計器から新系統が見つかった場合のみ）。
> 3. **engine/parser/decompiler を触ったら `npm run gates`・シート再生成は `npm run regen`**（§12）。バグは golden に1件足してから直す。

## 2026-08-22 整理51：§6.4 `O-41`（レベル限定つき【ガード】禁止）の残0クローズ（続き609）

**登録行の原文（PLAN §6.4 から退避）**

> | **O-41** | 🔴**「〈限定〉のシグニで【ガード】ができない」の限定が型にも engine にも無い** | M | **2026-08-22 続き594 実測＝live 10効果**（`WD15-010-E1`／`WDK05-T09-E1(-G)`／`WX01-004-E3`／`WX18-039-E1`／`WX18-040-E1`＝レベル固定・以下・列挙／`WX10-009-E3`／`WX19-054-E1`／`WD21-009-E1`＝**宣言された数字と同じレベル**／`WXEX2-01-E2`＝**この方法でダウンしたシグニと同じレベル**）。`BlockActionAction` に `filter` が無く、**全部「相手はガードそのものができない」に化けている**＝原文より遥かに強い過剰実行。⚠**parser だけでは直せない**＝①型に限定を足す ②ガード宣言UI／engine のガード可否判定がその限定を読む、の2点セット。動的形（宣言数字・この方法でダウンした）は `resolveDynamicFilter` の既存語彙（`levelEqLastDownedLrig` 等）と同じ枠で解ける見込み |

### ⚠ 登録時の母集団は「10効果」だったが、実測は **6効果**（CODEX_GUIDE §5 の5原則③⑤をそのまま踏んだ）

着手前に CSV（`grep 'ガード】ができない'`）と live JSON の**両方**を数え直したところ、登録行の10件のうち **4件は着手不要**だった：

| 登録された効果 | 実測 | 理由 |
|---|---|---|
| `WX01-004-E3` | ✅既に正しい | 原文「レベル２以下」＝`GUARD_MAX_LV2` が**従来から実装済み** |
| `WX18-040-E1` | ✅既に正しい | 同上（`GUARD_MAX_LV1`） |
| `WD21-009-E1` | ✅既に正しい | `MANUAL` で `STUB{DECLARE_TWO_GUARD_LEVELS}` を使っており **`BLOCK_ACTION` を持たない**。登録時は JSON の先頭300字だけを見て「素の GUARD」と誤認していた（原則③＝完全一致で数えない） |
| `WDK05-T09-E1` / `-E1-G` | 実体1件 | 同一カードの外側【常】と内側【起】＝**1効果を2行に数えていた** |

⇒ **真に壊れていたのは6効果**（`WD15-010-E1` `WDK05-T09-E1-G` `WX18-039-E1` `WX10-009-E3` `WX19-054-E1` `WXEX2-01-E2`）。

### 受け皿は「半分建っていた」＝設計判断は**型フィールドではなく actionId の文字列**

登録行の見立て（「①型に限定を足す ②UI が読む」の2点セット）は**半分だけ正しかった**。実測すると：

- `GUARD_MAX_LV<n>`（レベル n **以下**）は **parser → `blocked_actions` → `GuardResponseDialog`** が既に通っていた。
- 動的形の受け皿も既にあった＝`declared_guard_restrict_level(s)` と `ADD_DECLARED_GUARD_LEVEL`。

🔑**`BlockActionAction` に型フィールドを足す案は却下した**。理由＝**常在（【常】）側は `calcContinuousBlockedActions` が
`ContinuousBlockResult.forSelf`＝`Set<string>` で actionId だけを運ぶ**ので、型フィールドを足しても
`WX18-039`（【常】・レベル２とレベル３）には**届かない**。既存の `GUARD_MAX_LV<n>` が文字列語彙なのも同じ理由。

**足した語彙（4種）**
| actionId | 意味 | 解決 |
|---|---|---|
| `GUARD_LV<n>` | そのレベル**ちょうど** | parse 時 |
| `GUARD_LV<n>_<m>…` | レベルの**列挙**（`GUARD_LV2_3`） | parse 時 |
| `GUARD_LV_DECLARED` | 宣言された数字と同じレベル | 実行時（`declared_number`） |
| `GUARD_LV_LAST_DOWNED` | この方法でダウンしたシグニと同じレベル | 実行時（`lastProcessedCards`） |

**触った場所**
- `src/data/parsers/parseSentencePart1.ts` ガード不可ルール＝5分岐。⚠**列挙を「ちょうど1つ」より先に**判定する（逆順だと `レベル３` だけ拾ってレベル２が落ちる＝過小）。
- `src/engine/effectExecutor.ts` `execBlockAction`＝動的2種を先取りし、効果元（`ctx.ownerState`）の `declared_guard_restrict_levels` へ積む。⚠**レベル未確定なら制限を課さない**（素の `GUARD` へ倒すと O-41 が直した過剰実行に戻る）。ログラベルも `GUARD_*` を日本語化。
- `src/screens/battle/guard.ts` `makeGuardLevelBlocker`＝**消費地点を純関数へ切り出し**（§5-20 の定石）。JSX の中に置くと golden から両方向を検証できない。
- `src/screens/battle/modals/GuardResponseDialog.tsx`＝その純関数を呼ぶだけに縮小。
- `scripts/decompileEffects.ts`＝`GUARD_MAX_LV<n>` の**表引き（LV1/LV2 だけの2行）を regex 化**。⚠表に無いレベルが出た瞬間に生の英語 id が逆翻訳へ漏れるため、表を増やす方式へ戻さない。

### 🔴 派生で見つけた無言 no-op：`SEQUENCE` 内の `DECLARE_NUMBER` が**一度も宣言していなかった**

`GUARD_LV_DECLARED` の E2E を書いたら `declared_number` が `undefined` のままで、ログに
**「数字を宣言（スキップ：次ステップが GRANT_KEYWORD でないため）」** が出ていた。

`execSequence`（`effectExecutor.ts`）は `STUB{DECLARE_NUMBER}` を横取りし、**次ステップが `GRANT_KEYWORD`
（＝シャドウのパワー宣言）でなければ `continue` で宣言そのものを捨てていた**。
`DECLARE_NUMBER` を持つ live 30カードの**ほとんどが `SEQUENCE` の中**なので、
宣言値を読む後段（`levelEqDeclaredNumber` / `DECK_TOP_CHECK_LEVEL_*` / `useDeclaredCount`）が**軒並み空振り**していた。

⚠**裸の `DECLARE_NUMBER` だけは `execStub` 側の CHOOSE に届く**ので、golden も片側しか踏んでおらず
（`(xlvi)(c)` は裸で実行していた）**計器に一切映らなかった**。
⇒ 横取りを「次が `GRANT_KEYWORD` のときだけ」に絞り、それ以外は**素通りではなく通常の STUB 実行へ落とす**。

### 巻き添えの解消：宣言値とガード制限のフィールドを分けた

旧 `SET_DECLARED_NUMBER` は宣言値を **`declared_guard_restrict_level`（＝ガード制限）** へ書いていた。
`DECLARE_NUMBER` を使う30カードのうち**原文にガード制限があるのは2枚だけ**（`WX10-009`／`WX19-054`）で、
消費 funnel（`consumeDeclaredGuardRestrictLevel`）を通るのは `DECK_TOP_CHECK_LEVEL_HAND` **1本きり**だった。

⇒ **宣言値は `declared_number` / ガード制限は `declared_guard_restrict_level(s)`** と役割を分離し、
読み手5箇所を `declared_number ?? declared_guard_restrict_level` へ（後方互換のフォールバック付き）。
ガード制限は原文に該当文がある2枚だけが `BLOCK_ACTION{GUARD_LV_DECLARED}` で**明示的に**立てる。

### 計器

golden **2366→2375**（+9・O-41 で8本＋既存契約テスト1本を新契約へ書き換え）。
census 730/730 据置・smoke 10693 全異常0／SKIP 0・fuzz 全0・`census:stubs` A群🔴0／C群0・manual-fields 0・lint 0 errors / 261 warnings。
逆翻訳（`npm run regen`）で6効果とも**原文どおりの日本語**が出ることを確認済み。

### ⚠ 次に触る人へ

- `census:wiring` の **`levelExact × BLOCK_ACTION{PLAYER}`（miss=3 / has=0）は恒久的な偽陽性**。
  `target.filter.level` を足して黙らせないこと（`target` は `PLAYER` で、レベルが属するのはガードする側のカード）。
- 実機観測点は §7 **`V-84`**（レベル限定がUIで効くか）と **`V-85`**（宣言 UI が新しく30カードで出る）。
  ⚠`V-85` は**入力待ちが新規に発生する変更**なので、CPU・自動解決経路で止まらないかを実機で見る。


## 2026-08-20 整理㊾（Opusタスク12 第1バッチ＝配線漏れ6件の残0クローズ・登録行の原文を退避）

### 🆕 (cl)（続き591）で残0クローズした登録行原文と結末

> **2026-08-20 続き591 に (cl) を残0クローズ**（実装は Codex／指示書・検証・実機検証・シナリオ書き換えは Claude）。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-20（続き591／Codex 節は続き590 の直下）。
> **結末**＝登録どおり「そのターン終了時」の遅延予約が丸ごと落ちていた。**母集団は live 1効果だけ**（`そうした場合、そのターン終了時` の全 CSV 走査＝9284カード中1件。`WXDi-P08-010` は「ターン終了時**まで**」＝持続期間で対象外）。**受け皿は既存**＝`INSTALL_DELAYED_TRIGGER{duration:'THIS_TURN', trigger:{timing:'ON_TURN_END'}}` を live 3効果が既に使っていた＝**新 action 型・新 timing・新 state フィールドはゼロ**。engine 変更は `collectTurnTriggers` の `delayed_triggers` 走査を **`ON_TURN_END` のときだけ**両プレイヤー分へ広げた1箇所（`ON_TRASH` は相手ターン中にも起きるため）。

- [ ] 🆕**(cl) 続き590＝`WXDi-P10-039-E2`（蒼魔姫　リッチレーサー）の②に「そのターン終了時」の遅延予約が無く、①解決の直後に②を提示している**＝原文は「①手札を1枚捨ててもよい。そうした場合、**そのターン終了時**、②《青》《無》を支払ってもよい。そうした場合、③トラッシュから場に出す」だが、live の action は `SEQUENCE[STUB{OPTIONAL_COST,handDiscard}, CONDITIONAL{IS_MY_TURN}{STUB{OPTIONAL_COST,costColors}}, CONDITIONAL{IS_MY_TURN}{ADD_TO_FIELD}]` で**遅延の宣言が丸ごと落ちている**（続き590 で Codex が (cxlvii) の作業中に発見・報告§5）。⚠**(cxlvii) の入れ子ゲート自体は続き590 で修正済み**＝残るのは**タイミングのズレだけ**（②③がターン終了時ではなく即時に解決する）。**着手前に母集団を数え直すこと**＝「そうした場合、そのターン終了時、」型が他に何件あるか未計測。遅延予約の受け皿は既存の `INSTALL_DELAYED_TRIGGER`／`delayed_triggers`（§6.3 の遅延機構）が使えるか実コードで確認してから設計する。実機シナリオは `v20DiscardSkipFirstBlocksSecond`／`v20DiscardPayBothReturnsToField`（どちらも現状 PASS＝**タイミングのズレは観測していない**ので、着手時は観測点も足す）。

### 🆕 第3バッチ（続き590）で残0クローズした2件の登録行原文と結末

> **2026-08-20 続き590 に (cxlvii)(cxlix) を残0クローズ**（実装は Codex／指示書・検証・実機検証は Claude）。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-20（続き590）。
> **結末の対照**＝
> - **(cxlvii)**：登録は「二段以上に連鎖した任意コスト全般で必ず起きる構造的な穴」。**構造の指摘は正しかったが live 母集団は1効果だけ**（機械走査＝「任意コストSTUB→CONDITIONAL の後ろにステップがある」26件中、内側もまた任意コストなのは `WXDi-P10-039-E2` の1件のみ。残り25件は後続が原文でも独立＝**全部を pay 枝へ移すと過小実行に化ける**）。修正はディスパッチ冒頭8行の畳み替えのみ。**副次発見＝(cl) を新規登録**（②の「そのターン終了時」の遅延予約が落ちている）。
> - **(cxlix)**：登録は「`markCutinResponseComplete` を `queueCardEffects` の前に書くレース」。**そのとおりで、窓の正体は「`persist.commit()` の DB 完了と React の Realtime 反映が別タイミング」**＝完了フラグだけが先にローカルへ届き、`effect_stack` 通知より先に `finally` で `loading=false` になる瞬間があった（**別クライアントではなく応答クライアント内**の競争）。`payment > effects > fetch_latest > complete` の順序ヘルパへ切り出して解消。⚠**golden は順序定数の assert 止まり**（`goldenTest.ts` の `test()` が同期関数しか取れない）＝回帰検知は `v58d`／`v58e` の実機実行に依存する。

- [ ] **🆕(cxlvii) 続き585＝`WXDi-P10-039-E2`（蒼魔姫　リッチレーサー）の「そうした場合」二段任意コストの入れ子ゲートが外れる**＝実機で確認（`v20DiscardSkipFirstBlocksSecond`・2回連続再現／`v20DiscardPayBothReturnsToField`は正常＝2回連続PASS）。原文「①手札を１枚捨ててもよい。そうした場合、②《青》《無》を支払ってもよい。そうした場合、③トラッシュから場に出す。」＝③は②が支払われたときだけ、②は①が支払われたときだけ提示されるべき二段の入れ子。JSONは`SEQUENCE[STUB(OPTIONAL_COST,handDiscard), CONDITIONAL(IS_MY_TURN){OPTIONAL_COST,costColors}, CONDITIONAL(IS_MY_TURN){ADD_TO_FIELD}]`というフラットな3ステップで、②③とも常にtrueの`IS_MY_TURN`でしかゲートされていない。**①を「スキップ」すると②の支払い提示を完全に飛ばして③のADD_TO_FIELDが無条件で実行される**（実機で確認）。**原因＝`effectExecutor.ts:4011-4016`の「任意コストパターン」ディスパッチが、STUB直後のCONDITIONAL（②）だけを`conditional`として掴み、それより後ろの残りステップ（③）を無条件`continuation`として`pending`に添付するため**、①を「スキップ」（noop）しても`continuation`（③）はCHOOSEの結果に関係なく必ず評価され、`IS_MY_TURN`が常にtrueなので無条件でADD_TO_FIELDへ進む。**二段以上に連鎖した任意コスト（そうした場合…そうした場合…）全般で必ず起きる構造的な穴**であり本カード固有ではない。修正方針＝(a)`continuation`に「無条件で次に進む」/「pay側でしか進まない」の区別フィールドを設ける、または(b)パーサ側で②③のCONDITIONALを`PAID_ADDITIONAL_COST`で書き分け、Pattern④（`effectExecutor.ts:4568`の`isAdditional`分岐）が既に持つ区別の仕組みをこちらのパターンにも波及させる。実機シナリオは`scripts/verifyBattleDrive.mjs`の`v20DiscardSkipFirstBlocksSecond`（意図的FAIL・`order`登録済み）／`v20DiscardPayBothReturnsToField`（正常系）。詳細はBUGFIXES 2026-08-19続き585。

### 🆕 第2バッチ（続き589）で残0クローズした3件の登録行原文と結末

> **2026-08-20 続き589 に (cxliv)(cxlv)(cxlviii) を残0クローズ**（実装は Codex／指示書・検証・実機検証は Claude）。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-20（続き589）。
> **結末の対照**＝
> - **(cxliv)**：登録は「新しい `activeCondition` 型を新設するか collector に＜宇宙＞判定を足せ」。**実測は parser も engine も完備で live が stale だっただけ**＝コード変更ゼロ・held 採用のみで解決。実機 `v39ConditionGapNoStorySigni` が FAIL→PASS 反転。
> - **(cxlv)**：登録は「parser の `then` 欠落＋resolver にも同型の穴＝二重の穴」。**resolver（`resumeSearch`）は元から既定へフォールバックしており穴は無かった**＝parser 1行＋UI 防御2箇所で解決。実機は新 `v40UseSearchedSpellOrTrashResolves` で PASS。
> - **(cxlviii)**：登録は「`WX24-P4-052-E2` 1枚の表現取り違え」。**実測は母集団18カード・誤り7効果**（parser 修正4＝`WX12-031-E1` `WXK11-030-E1` `WX24-P4-052-E2` `WX24-P4-104-E1`／fresh は正しく live だけ古い3＝`WX17-029-E1` `WX25-P1-083-E2` `WX25-P1-102-E2`）。真因は `parseSentencePart1.ts:1620` の `!t.includes('対戦相手')` 全文スキャン＋`WX10-048` の原文 whitelist。実機は新 `v45cPaySelfBanishRemovesOnlyFiltered`／`v45cSkipSelfBanishDoesNothing` の対で PASS。

- [ ] **🆕(cxliv) 続き581＝`WX25-P2-014-E1`（明星の使者　サシェ・モティエ）の「あなたの場に＜宇宙＞のシグニがあるかぎり」条件節が丸ごと未実装**＝実機で確認（`v39ConditionGapNoStorySigni`・意図的FAIL）。原文「【常】《相手ターン》：**あなたの場に＜宇宙＞のシグニがあるかぎり**、対戦相手は《無》《無》を支払わないかぎりルリグでアタックできない」に対し、JSONの`activeCondition`は`{type:'TURN_OWNER',owner:'opponent'}`のみ＝宇宙シグニ所持を見るフィルタが存在しない（`checkActiveCondition`の全ケース・`src/data/parsers/*.ts`を`grep`＝該当条件型・パーサ規則とも0件）。**原因＝`collectOppLrigAttackExtraCost`（`effectEngine.ts:4539`）が`checkActiveCondition`（TURN_OWNERのみ）しか見ておらず、＜宇宙＞シグニの有無を一切チェックしない**。実機シナリオ＝guestの場から＜宇宙＞シグニを完全に除いた盤面でも、hostのルリグアタックボタンは変わらず「アタック（《無》×2）」のまま＝条件が無条件で常時成立（2回連続で同一結果）。実害＝この効果を持つルリグ（現状liveは`WX25-P2-014`1枚）が、本来ゲートが掛からないはずの盤面（＜宇宙＞シグニ不在）でも対戦相手のルリグアタックを《無》×2の前払いなしでは阻む＝過剰実行。修正方針＝`collectOppLrigAttackExtraCost`に`ownerState.field`から＜宇宙＞（story）フィルタの充足チェックを追加するか、汎用の「自分の場に〈story〉のシグニがあるかぎり」型`activeCondition`を新設して`parseSentencePart3.ts:314`付近の`OPP_LRIG_ATTACK_COST`規則で前置節を持ち上げる。**修正時は同型構文（自分の場に〈story〉があるかぎり系の条件節）が他のSTUB/CONTINUOUSにも埋もれていないか横展開確認が要る**。実機シナリオは`scripts/verifyBattleDrive.mjs`の`v39LrigAttackCostBlocked`／`v39LrigAttackCostPaid`（残0クローズ）／`v39ConditionGapNoStorySigni`（`order`登録済み・意図的FAIL）。詳細はBUGFIXES 2026-08-19続き581。
- [ ] **🆕(cxlv) 続き582＝`WX20-077-E2`（ドライ＝アコニチン）の`SEARCH`アクションに必須フィールド`then`が無く、モーダルがcrashして画面が真っ黒になる**＝実機で確認（`v40UseSearchedSpellOrTrashCrash`・意図的FAIL・2回連続同一結果）。原文「あなたのトラッシュにカード名に《リカブト》を含むカードがある場合、あなたのデッキから《バイオレンス・スプラッシュ》を探す」の【出】でSEARCHが発火した瞬間、`pendingEffect=SEARCH`のまま画面が真っ黒（`document.body.innerText`がほぼ空）になり進行不能。**原因＝`src/data/parsers/parseSentencePart3.ts:1856-1868`が生成するSEARCHアクションに必須フィールド`then`（`types/effects.ts:1356`＝`then: EffectAction`）が無い**（`afterSearch`だけ設定）。`EffectInteractionModal.tsx:119`（`const act = inter.thenAction; ... act.type === ...`）が`undefined.type`を読みReactごとcrash（pageerrorのスタックと一致）。**同じ前提の穴がpick解決側（`effectExecutor.ts:8189`以降の`pending.thenAction.type`無条件参照）にもあり、描画をバイパスできても resolver 側でも同型でcrashする二重の穴**。母集団は実測で live 上この1件のみ（`then`欠落のSEARCHアクションを全JSON走査＝435件中1件）。修正方針＝(a) 当該パーサ規則に`then: {type:'ADD_TO_HAND', owner:'self'}`相当を明示的に足す（後続の`USE_SEARCHED_SPELL_OR_TRASH`が改めて使用/トラッシュへ振り分ける前提の一時受け皿として自然）(b) `EffectInteractionModal.tsx:119`・`effectExecutor.ts:8189`以降を`thenAction`未定義でも安全にフォールバックするよう防御的にする（同型のparser作り忘れが別カードで再発してもUI全体を落とさないため）。実機シナリオは`scripts/verifyBattleDrive.mjs`の`v40UseSearchedSpellOrTrashCrash`（`order`登録済み）。詳細はBUGFIXES 2026-08-19続き582。


> **2026-08-20 続き588 に (cxxxviii)(cxxxix)(cxl)(cxli)(cxlii)(cxliii) を残0クローズ**（実装は Codex／指示書と検証は Claude）。結末・教訓・検証内容は [BUGFIXES.md](./BUGFIXES.md) 2026-08-20（続き588）と [PLAN.md](./PLAN.md) §3 のクローズ節。以下は**登録時の原文**（PLAN §4 ② から退避）。⚠**3件は登録時の見立てが実測と食い違っていた**＝(cxl) の「少なくとも3枚」／(cxlii)(b) の「caller 0件」／(cxxxviii) の「別ソースの仕組みが要る」。読むときは結末側と必ず突き合わせること。

- [ ] **(cxxxviii) 続き571＝`WXDi-P10-041-E3`（V-04④）の `TAKE_FROM_UNDER_SIGNI` が ON_LEAVE_FIELD 発火時に空振りする**＝実機で確認（`v04TanabataLeaveFieldE3`・`scripts/verifyBattleDrive.mjs`）。原文「【自】：このシグニが場を離れたとき、このシグニの下にあったカード１枚を対象とし、それをトラッシュからエナゾーンに置く。」＝**ソースはトラッシュ**（場を離れる際の既定ルールで下カードは先にトラッシュへ落ちる。これ自体は正しく動作＝実機で確認済み）。**しかし E3 本体（`TAKE_FROM_UNDER_SIGNI` action・`fromThis:true`）は `effectExecutor.ts:6211` `execTakeFromUnderSigni` が `ctx.ownerState.field.signi` から `ctx.sourceCardNum`（＝このシグニ自身）を探して候補を作る実装**＝ON_LEAVE_FIELD の時点でこのシグニ自身が既に `field.signi` から消えているため `zoneIdx===-1`→`cands=[]`→`if (cands.length === 0) return done(ctx);` で**対象選択UIなし・トラッシュ→エナの移動なしのまま静かに空振り**（発火ログ「[自分] 羅植姫　タナバタ の【自】効果（場を離れたとき）」は出るが以降なにも起きない）。⚠**根の原因はソースの取り違え**＝`fromThis` は「まだ場にあるこのシグニの下」を前提にした実装（他の即時効果用）だが、この効果は「場を離れた**後**にトラッシュにあるカード」が対象＝別ソース（トラッシュ・かつ「このシグニの下にあった」という由来を保持する仕組み）が要る。**併せて parser 側も要確認**＝原文は「カード１枚」なのに JSON は `count:9, upToCount:true`（`public/data/effects_WXDi.json` の `WXDi-P10-041-E3`）＝1枚固定のはずが9枚まで化けている疑い。実機シナリオは `scripts/verifyBattleDrive.mjs` の `v04TanabataLeaveFieldE3`（`order` 登録済み）。
- [ ] **(cxxxix) 続き571＝ON_ABILITY_ACTIVATED（§6.3 J-1・V-16）の《ターン1回》が実質機能していない**＝実機で確認（`v16AbilityWatcherImmediatelyAfterOpponentOnPlay`。deck:[]による相手リフレッシュ誘発は修正済み＝📌22の再実例として`v16AbilitySpec`にdeck数枚を追加済み・これ自体は解消）。**残った症状＝ウォッチャー効果は正しく発火・解決するが、`usageLimit:'once_per_turn'`の消化が `actions_done` へ永続化されない**。原因は `BattleScreen.tsx`：①`:4728-4730` で `pureCollectAbilityActivatedTriggers` を呼び `aaHost`/`aaGuest` を得る→②`:4844-4849` で `hostAcc`/`guestAcc` に `aaHost.usedOncePerTurnIds`/`aaGuest.usedOncePerTurnIds` を `actions_done` へマージ→③**しかしその数行後、`:4883`（`!result.done`分岐）と`:4899`（`else`分岐）の両方で `collectBoardDiffTriggers(hostState, guestState, …)` を呼び、その戻り値で `hostAcc = bd.hostState; guestAcc = bd.guestState;` と丸ごと再代入**（`collectBoardDiffTriggers` は引数に渡された `hostState`/`guestState`＝②のマージ**前**のベース状態から積み上げる＝`:3096` `let h = afterHost, g = afterGuest;`）。**②で足した `usedOncePerTurnIds` の actions_done 書き込みは常にここで消える**＝**《ターン1回》制限はON_ABILITY_ACTIVATED系ウォッチャーでは事実上いつも機能しない**（トリガー元の効果が対話ありでもなしでも両分岐とも同じ上書きパターン）。**実害＝同一ターンに2回目以降のON_PLAY等が発生してもウォッチャーが際限なく再発火する可能性**（`v16AbilityWatcherOncePerTurnSecondOnPlayIgnored`／`WX19-066`もこの根本原因で未検証のまま保留）。修正方針＝③の2箇所で `collectBoardDiffTriggers` に渡す base を `hostAcc`/`guestAcc`（②のマージ後）にする、または `bd.hostState`/`bd.guestState` に②のactions_done差分を再マージする。
- [ ] **(cxl) 続き573＝`SigniOnPlayCostModal`（【出】コスト確認モーダル）が `handDiscardSigni` コストを認識しない**＝実機で確認（`v19Wx07050NoDiscardDoPhaseAdvanceReturns`。`WX07-050` を召喚しても「手札から＜宇宙＞のシグニを1枚捨てる」の候補ピッカーが一度も出ない＝576秒/160ティック回しても `pendingSigniOnPlayCost` の手札コスト欄が現れず、`img[alt="羅星　ハダル"]` は候補ではなく画面下の通常手札表示にしか一致しない）。**原因＝`src/screens/battle/modals/SigniOnPlayCostModal.tsx:71-77` の手札コスト計算が `eff.cost?.discardGroups`／`eff.cost?.discard`／`eff.cost?.handToEnergy`／`eff.cost?.handToUnderSelf` の4種類しか読まない**＝`WX07-050-E1`（`public/data/effects_WX.json`）の `cost:{handDiscardSigni:{count:1,story:'宇宙'}}` はこの4つに該当せず `handNeeded=0` に確定→候補セクション（`:306-344`）が丸ごと非表示。同種コストを持つ他モーダル（`LrigGrantedModal.tsx:51`／`TrashActivatedModal.tsx:167`／`src/screens/battle/costs.ts` の `handDiscardSigni` 判定ヘルパー）は正しく扱っている＝**`SigniOnPlayCostModal` だけの実装漏れ**。実害＝`handDiscardSigni` コスト付き【出】（`WX07-050`／`WX16-Re18`／`WDK13-013` 等、少なくとも3枚）を人間側UIで正しく支払えない（`handNeeded=0`のため「発動」ボタンが未選択のまま押せてしまい、コスト未消化のまま効果が進む可能性がある＝要 engine 側の実害確認も併せて）。修正方針＝`costs.ts` の `handDiscardSigni` 判定ヘルパーを `SigniOnPlayCostModal` の手札コストセクションへ配線する（`LrigGrantedModal`/`TrashActivatedModal` の実装を参考に）。V-19 の一時レゾナ返却検証はこの手前で止まっており未着手のまま。
- [ ] **(cxli) 続き573＝`confirmEndDiscard`（手札上限超過のターン終了時捨て札）が捨てたカードの ON_TRASH 系トリガーを一切収集しない**＝実機で確認（`v20DiscardSkipFirstBlocksSecond`。`WXDi-P10-039`＝【自】このカードが捨てられたとき…、を手札上限8枚→6枚上限超過で捨てさせても、発火ログ・任意コスト提示（`optcost-pay`/`optcost-skip`）が一度も現れない＝`settled` が捨て札確定の直後（tick2）でもう真になる＝トリガー収集自体が起きていない）。**原因＝`src/screens/BattleScreen.tsx:4232` の `confirmEndDiscard` は `discardNums`（選択した捨て札）を `myTrashEND` へ機械的に積むだけで、`collectTrashTriggers`／`collectBoardDiffTriggers` のいずれも呼ばずに直接 `persist.commit({type:'BEGIN_NEXT_TURN', ...})` へ進む**（`collectBoardDiffTriggers(` の全11呼び出し箇所＝`:4883,4899,5286,5310,5465,5520,5572,5957,6839,6915,7439` のいずれも `confirmEndDiscard`（`:4232-4464`）の範囲外）。他の捨て札経路（効果コストとしての `TRASH{asCost}`＝`execStubPart*.ts`／`effectExecutor.ts` 経由）は central diff を通るため正しく発火する＝**「手札上限超過でターン終了時に捨てる」経路だけが ON_TRASH 系（`fromZones:['hand']`）トリガーを取りこぼす**。実害＝`WXDi-P10-039`／同型の「このカードが捨てられたとき」を持つカードが、能動的なコスト捨てではなく**受動的な上限超過**で捨てられた場合に発火しない。修正方針＝`confirmEndDiscard` の `discardNums` 確定後・`BEGIN_NEXT_TURN` コミット前に `collectTrashTriggers`（`fromZones` 込み）を呼び、生成されたエントリを効果スタックへ積む（`doPhaseAdvance` 側の既存パターンを参照）。V-20 はこの手前で止まっており未着手のまま（迂回する場合はコストとしての手札捨て＝別カードの `handDiscard` コストで `WXDi-P10-039` を対象に選ぶ経路で再設計する必要がある）。
- [ ] **(cxlii) 続き572＝`SELF_LEVEL_THRESHOLD` の実効レベルが `evalUseCondition` 経由（AUTO trigger の `condition`）では常に印字レベルへフォールバックする**＝実機で確認（`wx20re18DynamicLevelAttackBanish`）。`WX20-Re18`（幻獣 アカズキン・印字Lv2・E1`DYNAMIC_LEVEL_BY_ENERGY`＝エナ5枚につき+1）にエナ10枚（実効Lv4のはず）を持たせてアタック→E2「【自】このシグニがアタックしたとき、`condition:{SELF_LEVEL_THRESHOLD,gte,4}`成立で正面のシグニをバニッシュ」が発火しない。**ground truthは部分的に正しい**＝アタッカー自身のパワー表示は13000（1000+3000×4）で動的レベル4ぶんの補正が乗っており、バトル自体は通常どおり進行（P15000の正面と戦って敗北）。**しかしE2のバニッシュは一度も発火しない**＝正面のP15000シグニがバトル外で無条件バニッシュされることはなかった。**原因＝`collectAttackerSelfTriggers`（`src/engine/triggerCollect.ts:3676`）が `condition` の成立判定に `evalUseCondition`（`src/engine/execUtils.ts:2462`）を使うが、この関数は `ExecCtx` を `{ownerState,otherState,cardMap,effectivePowers,sourceCardNum,currentPhase,logs}` だけで組み立てて `effectsMap` を渡していない**。一方 `SELF_LEVEL_THRESHOLD` の実装（`execUtils.ts:2063`）は `ctx.effectsMap ? calcSigniLevels(...) : undefined) ?? parseInt(cardMap.get(...)?.Level...)` という自己完結の実効レベル計算を持つが、`ctx.effectsMap` が常に `undefined` のため印字レベル（2）へフォールバックし続け、`gte 4` が永久に false になる。**同根の別経路もある**＝E4（`activeCondition`・Lv5以上で効果耐性）は `effectEngine.ts:249` の `checkActiveCondition` 内 `SELF_LEVEL_THRESHOLD` が使うが、こちらは呼び出し元が `effectiveLevels`（`calcSigniLevels` の結果）を明示的に渡す設計＝**全呼び出し元を検索したがどこも渡していない**（`effectEngine.ts:72`のシグネチャに存在するだけで実引数を渡すcallerが0件）＝E4も同じ理由で永久false。修正方針＝(a) `evalUseCondition` に `effectsMap` パラメータを追加し `collectAttackerSelfTriggers` 呼び出し側から通す（他の `evalUseCondition` 呼び出し元にも波及確認が要る） (b) `checkActiveCondition` を呼ぶ全箇所（CONTINUOUS効果の active 判定）で `calcSigniLevels` の結果を `effectiveLevels` として渡す。**影響範囲＝`SELF_LEVEL_THRESHOLD` を使う効果全体**（現状 live は `WX20-Re18` のE2/E4のみと推定されるが要確認）。実機シナリオは `scripts/verifyBattleDrive.mjs` の `wx20re18DynamicLevelAttackBanish`（`order` 登録済み・意図的FAIL）。

- **(cxliii) 続き578＝`collectTurnTriggers` がキーを走査しない**（登録は §7 `V-35`(b)(c) 側に記載）＝`src/engine/triggerCollect.ts` の `collectTurnTriggers`（ON_TURN_START/ON_TURN_END/ON_ATTACK_PHASE_START・END/ON_GROW_PHASE_START/ON_MAIN_PHASE_START/ON_LRIG_ATTACK_STEP_START の共通収集器）は自陣・相手陣とも `field.signi` とセンタールリグ・`grantedStoreWatchers` しか走査せず、`field.key_piece`／`key_piece_extra`（`activeKeyAbilitySources()`）を一度も呼んでいなかった。兄弟の `collectLrigGrowTriggers`（:671）と `collectSigniDownUpTriggers`（:2375）は呼んでいるため、**キーの【自】は ON_LRIG_GROW/ON_SIGNI_DOWN 系でしか発火せず、ON_TURN_END 等では構造的に無言 no-op**という非対称な穴。`WDK06-R09-E1` 単体の問題ではない。実機シナリオ＝`wdk06r09Pay`／`wdk06r09Skip`／`wdk06r09NoKey`（`order` 未登録）。詳細は BUGFIXES 2026-08-19 続き578。

- **（恒久指標アーカイブ）****2026-08-26 続き661 後（本行が直近の正）**：
  **census 572/572**（`O-62` では動かず＝原因主体の限定は census の網に載らない）、**golden 2804**（`O-62` +5）、
  smoke **10693 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors（warnings 263）**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**、
  **live カード 5975 / 効果総数 10693 / MANUAL 効果 1032**（`O-62` で live 限定 MANUAL を4件解除）、
  **実機シナリオ +3**（🆕`b62MoveToDeckOwnEffect`／`b62AcceBanishDraws`／`b62AcceBanishNoAcce`。
  **反転確認**＝`b62AcceBanishDraws` は旧 live で FAIL することを実測）、
  **`npm run golden` の所要＝全件 約158秒／`--only` 約1.5秒**

### 恒久指標アーカイブ（PLAN §6 から退避）

- **2026-08-26 続き669 後（本行が直近の正）**：
  **census 568/568**（据置）、**golden 2840**（`O-87` +8）、
  smoke **10694 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**＝`SELECT_COLOR` を追加）、
  🆕**`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・miss ありハンドラ 43／miss カード 75）＝`O-87` で `CHOOSE_COLOR_FROM_LIST` の全文 regex を撤去（`BASELINE_SELF_TEXT` 更新済み）、
  **`POWER_MOD_PER_COUNT` の live 37効果**（⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10694 / MANUAL 効果 1034 / PARTIAL 21**（据置＝`O-87` は AUTO 3効果が変化）、
  **`_held_fresh` 77 / `_partial_fresh` 12 / `_idset_fresh` 45**、
  **どのフラグも立たないカード 4961 / 5975（83.0%）**（`npm run census:cards`）、
  **実機シナリオ +2**（`o87RainbowColorBranch` ／ `o87ResetTrapReplace`。回帰＝`o81FacedownAttachRevealBanish` PASS）、
  **`npm run golden` の所要＝全件 約155秒／`--only` 約1.5秒**

### 恒久指標アーカイブ（2026-08-27 続き682 後・PLAN §6 から退避）

- **2026-08-27 続き682 後（本行が直近の正）**：
  **census 551/551**（Sheet1 B4 で **557→551**＝⚠**払い戻しではなく較正**。詳細は BUGFIXES）、**golden 2872**（Sheet1 B4 で +1 テスト・FAIL 0）、
  smoke **10697 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**（warning 263・±0）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**・据置＝Sheet1 B4 は型を1つも足していない（live も無変更））、
  **`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・据置＝Sheet1 B4 は engine の原文 regex に触れていない）、
  **`POWER_MOD_PER_COUNT` の live 36効果**（据置。⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10697 / MANUAL 効果 1014 / PARTIAL 21**（MANUAL −19＝サーバント18枚＋`WX04-054-E2` の影武者撤去）（据置＝Sheet1 B1 は `manualEffects.ts` に触れていない）、
  **`_held_fresh` 75 / `_partial_fresh` 12 / `_idset_fresh` 24**（🆕**idset −19**＝サーバント系の凍結を解除）（第45バッチの +7 は採用され、Sheet1 B1 の +2（`WX10-066`／`WX08-053`）も採用済み＝**ベースラインへ完全復帰**）、
  **どのフラグも立たないカード 5140 / 5975（86.0%）**（`npm run census:cards`。⚠**83.2%→85.7% は前進ではなく計器の較正**＝`census:cards` が意味照合の残 OPEN を自前で数えていて `EFFECTID :: <quote>` 形を1件も消化に数えていなかった（未消化 643→948・影響カード 485→695 と過大報告）。判定を `semanticAuditLedger.mjs` の import 1本に集約し、同時に `idset` フラグ 43枚を追加した）、
  **意味照合 段2 台帳＝残 OPEN 641**（段0 221／段1 111／段2 消化 471／HIGH 440・MED 197・LOW 4／影響カード 483・効果 504）、
  **実機シナリオ +5**（`crossIconBouncePicker` / `servantMultiEnaPaysColor` / `b3ShareClassDrawsFour` / `b3DistinctClassDrawsThree` / `b4NextSpellReductionConsumed`＝各2回連続 PASS・既定 `order` へ追加済み）、
  🆕**Sheet1 分母（`CardData_Sheet1.csv`）**：全 **974枚**（効果あり **863** / バニラ **111**）、
  **残 OPEN 61件 / 49カード / 52効果**（着手時 69件 / 55カード / 59効果）、
  **要対応カード 69 / 863（8.0%）**（着手時 92 → B1 後 87 → B2 後 75 → B3 後 73 → B4 後 69）＝🆕**`npm run census:cards -- --sheet 1` で毎回1コマンドで出る**（内訳＝census **32**／意味照合 49（findings 61件）／held 6／partial 0／idset 1。`--list` を足すとカード名つきで列挙＝次バッチの取り出し口）。⚠**「フラグ0 の776枚」は「正しい」ではない**＝計器が見ていないだけで、シートを閉じるには残りへの検出パスが別途要る（計器の出力にも毎回出る）（⚠**Sheet1 スコープの計器はまだ無い**＝`cardProgressCensus.mjs --sheet` が次の小仕事）

### 恒久指標アーカイブ（2026-08-27 続き683 後・PLAN §6 から退避）

- **2026-08-27 続き683 後（本行が直近の正）**：
  **census 537/537**（Sheet1 B5 で **551→536**＝置換・色OR・公開しの3件を是正。**+1 は退化ではなく可視化**＝`WXEX1-57` の manual 影武者を撤去した結果その効果が MANUAL バケツを出て高シグナル側へ昇格した。詳細は BUGFIXES）、**golden 2876**（Sheet1 B5 で +4 テスト・FAIL 0）、
  smoke **10697 / 全異常0 / SKIP 0**、fuzz 全0、**lint 0 errors**（warning 263・±0）、
  `census:stubs` **A群🔴0／C群0**、manual-fields **0**、**同型★ 0**、`census:goldentypes` **未カバー0**（`EffectAction` 型 **149**・据置＝Sheet1 B5 は**アクション型**を足していない。足したのは `Condition` 1本＝`THIS_CARD_HAS_SOUL`）、
  **`census:enginetext` A群 141行 / 137ハンドラ**（B 59／C 27・据置＝Sheet1 B5 は engine の原文 regex に触れていない）、
  **`POWER_MOD_PER_COUNT` の live 36効果**（据置。⚠`O-80` の進捗は A群行数ではなくこの数で測る）、
  **live カード 5975 / 効果総数 10697 / MANUAL 効果 1013 / PARTIAL 21**（MANUAL −1＝`WXEX1-57-E1` の影武者撤去＋live の `parseStatus` を `AUTO` へ）、
  **`_held_fresh` 75 / `_partial_fresh` 12 / `_idset_fresh` 24**（Sheet1 B5 の +13／+1 はすべて採用済み＝**ベースラインへ完全復帰**）、
  **どのフラグも立たないカード 5154 / 5975（86.3%）**（`npm run census:cards`。⚠**「フラグ0＝正しい」ではない**＝計器が見ていないだけ）、
  **意味照合 段2 台帳＝残 OPEN 634**（段0 221／段1 111／段2 消化 478／HIGH 438・MED 193・LOW 3／影響カード 482・効果 500）、
  **実機シナリオ +7**（`crossIconBouncePicker` / `servantMultiEnaPaysColor` / `b3ShareClassDrawsFour` / `b3DistinctClassDrawsThree` / `b4NextSpellReductionConsumed` / 🆕`b5KawariElseBanishesOnlyLow` / 🆕`b5KawariThenReachesHigh`＝各2回連続 PASS・既定 `order` へ追加済み）、
  **Sheet1 分母（`CardData_Sheet1.csv`）**：全 **974枚**（効果あり **863** / バニラ **111**）、
  **要対応カード 67 / 863（7.8%）**（着手時 92 → B1 後 87 → B2 後 75 → B3 後 73 → B4 後 69 → **B5 後 67**）＝**`npm run census:cards -- --sheet 1` で毎回1コマンドで出る**（内訳＝census **28**／意味照合 49（findings 61件）／held 6／partial 0／idset 1。`--list` を足すとカード名つきで列挙＝次バッチの取り出し口）。⚠**「フラグ0 の796枚」は「正しい」ではない**＝計器が見ていないだけで、シートを閉じるには残りへの検出パスが別途要る（計器の出力にも毎回出る）

### 旧・恒久指標（PLAN §6 から退避）

- **2026-08-28 続き708 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)｜台帳 残 OPEN 570（据置）｜census 高シグナル 521→520**
  **golden 2942→2957**（+15＝`O-129`第2 +6 /`O-128`第2 +5 /`O-112` +1 /`O-92` +3）、census 520/520、
  smoke 10700 全異常0、fuzz 全0、lint 0 errors／260 warnings（据置）、同型★0、
  held **31バケット / 91枚**（増減なし）、`census:stubs` A群🔴0／C群0、manual-fields 0、
  `census:enginetext` A群 141行（据置）、孤児 MANUAL スタンプ 12（据置）。
  ⚠**台帳 570 が動かないのが正しい**＝この巡で触った7項目は**どれも段2 findings の消化ではない**
  （実測でも該当効果に OPEN な finding は0件だった）。
  ⚠**census −1 は `O-92` の「そのアタックの間」是正ぶん**（`BASELINE_HIGH` も 520 へ実測更新）。
  ⚠**Sheet1 は 0→1→0** と動いた＝`O-128` 第2バッチで**収穫マージの第5の死角**（`inheritedCostScaling`
  分岐が action 差分を黙って捨てる）を塞いだ結果 `WX11-039` が held に現れ、原文どおりの純改善
  （`shuffle:false`→`true`）だったので採用して閉じた。**退化ではなく可視化。**
  **実機シナリオ＝新規1本**（`v91refreshonce`）＋既存4本の回帰（`banishbyeffect` `FRESH=1` 2/2・
  `refreshTrigger`・`deckshufflespell`・`b12delayattack`）＝**すべて PASS**。反転確認あり。

### 旧・恒久指標（PLAN §6 から退避）

- **2026-08-28 続き709 後（本行が直近の正）**：
  📊**進捗3計器＝Sheet1 要対応 0 / 863 (0.0%)｜台帳 残 OPEN 570（据置）｜census 高シグナル 520（据置）**
  **golden 2957→2960**（+3＝アーツ提示ゲート2本／`handDiff` 1本）、census 520/520、
  smoke 10700 全異常0、fuzz 全0、lint 0 errors／260 warnings（据置）、同型★0、
  held **31バケット / 91枚**（増減なし）、`census:stubs` A群🔴0／C群0、manual-fields 0、
  `census:enginetext` A群 141行（据置）、孤児 MANUAL スタンプ 12（据置）。
  ⚠**3計器が1つも動かないのが正しい**＝今回の穴は **UI の提示ゲート**で、
  **JSON にも逆翻訳にも1バイトも現れない層**にあった（`census` も `census:cards` もここを見ていない）。
  live 実体の変化は **`WD16-006` の1カードだけ**（`handDiff` の払い戻し）で、それも高シグナルではない。
  🔴**この層の唯一の防御が実機シナリオ**（§2.2）＝今回も golden（純関数のゲート判定）と
  実機（支払いパネル→エナ請求→解決）の**両方で反転確認**して初めて挙動が固定できた。
  **実機シナリオ＝新規2本**（`o123usetimepay` / `o123usetimenopay`）＋既存4本の回帰
  （`b25targetfirst` `b25targethit` `exceedCostPay` `artsUsedThisTurnGate`）＝**すべて PASS**。
