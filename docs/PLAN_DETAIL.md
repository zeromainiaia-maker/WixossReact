# PLAN_DETAIL — 消化済みバッチ・完了項目の詳細台帳

> [PLAN.md](./PLAN.md)（現在地・生きている worklist）から 2026-07-07 に追い出した歴史記録。**cold start で読む必要はない**（PLAN §4 → DESIGN.md の順でよい）。過去セッションの要約は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md)、個別修正は [BUGFIXES.md](./BUGFIXES.md)。

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

## §5c 語彙センサス消化バッチの履歴（優先順・続き18改訂の原文）

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
- ~~`GROW_COST_REDUCTION`（CONT6）~~ **✅実装（2026-07-03・BUGFIXES上部）**＝pure `collectGrowCostReductions`（golden済）＋人間/CPU/アシストグロウ全経路に減額配線。⚠要実機検証(C2)。
- ~~`POWER_MODIFY_PER_ENERGY`（1・WX09-019・CONT）~~ **✅実装済（2026-07-03・続き13）**＝`calcFieldPowers` に `_COLOR` 同様の per-energy を追加（golden済・⚠要実機検証）。

## §11 大型機構オーナー表の完了行

| 機構 | 影響 | リスク | 状態 |
|---|---|---|---|
| ~~`SET_TRAP` 設置アクション~~ | 中（~30枚） | 中 | **✅完了**＝engineは既存（`signi_traps`ゾーン）。decompilerで9系統トラップSTUBを原文【トラップ】語彙描画（生STUB残0）。 |
| ~~動的閾値フィルタ~~ | 小（WX17-028等） | 中 | **✅完了**＝`REVEAL_DECK_TOP`＋`TRASH_REVEALED`アクション＋動的閾値フィルタ新設。 |
| ~~遅延条件トリガー~~ | 小（WX25-CP1-069等） | 中 | **✅完了**＝`INSTALL_DELAYED_TRIGGER`機構新設。 |
| ~~《相手ターン》/《自分ターン》AUTOトリガー基盤~~ | — | — | **実装済** |
| ~~【ビート】機構（Phase1-7）~~ | 44枚 | — | **完了**。残はトラッシュ版選択ピッカーのみ（低優先） |
| ~~傀儡場出しの汎用化~~ / ~~`levelLteLastProcessed`~~ | — | — | **実装済** |
