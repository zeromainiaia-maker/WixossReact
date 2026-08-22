# §6.2 段2 第22バッチ報告 — §6.4 O-43

## 結論

指定16効果を CSV 原文から再実測し、16/16を採用、見送り0。`FIELD_LEVEL_SUM` を両 union／両評価器へ新設し、`LRIG_TEAM_COUNT` を ActiveCondition／評価器へ追加した。`WX09-Re08-E1` は既存 `HAS_CARD_IN_FIELD`、`WXK05-047-E1` は既存 `HAS_KEY_IN_FIELD` の後方互換な枚数比較拡張で表現できた。未知型の fail-open は成立・不成立の両方向 golden で遮断した。

## 変更ファイル

- `src/types/effects.ts` — 2 union と実行時許可表へ条件語彙を追加。
- `src/engine/effectEngine.ts` — ActiveCondition のレベル合計、チーム数、キー枚数を評価。
- `src/engine/execUtils.ts` — Condition のレベル合計を評価。
- `src/data/effectParser.ts` — 16効果へ条件を付与し、既存条件2件は AND 合成。
- `scripts/goldenTest.ts` — 型数トリップワイヤ、旧契約、16効果の成立／不成立を更新。
- `scripts/decompileEffects.ts` — FIELD_LEVEL_SUM とキー枚数比較を日本語へ逆翻訳。
- `scripts/vocabCensus.ts` — 改善実測 708→702 を baseline に反映。
- `public/data/effects_*.json` — build/adopt 後の live JSON。
- `docs/decompile_sheet*.txt`、`docs/_vocab_census.txt`、`docs/_census_stubs.txt`、`docs/_manual_drift.txt` —規定再生成物。

## 型・評価器・golden の3点

| 条件 | 型宣言 | 評価器 case | golden |
|---|---:|---:|---:|
| `FIELD_LEVEL_SUM` ActiveCondition | `effects.ts:185` | `effectEngine.ts:192` | `goldenTest.ts:41654` |
| `FIELD_LEVEL_SUM` Condition | `effects.ts:309` | `execUtils.ts:1865` | `goldenTest.ts:41654` |
| `LRIG_TEAM_COUNT` ActiveCondition | `effects.ts:186` | `effectEngine.ts:207` | `goldenTest.ts:41643,41654` |
| `HAS_KEY_IN_FIELD` 枚数比較拡張 | `effects.ts:184` | `effectEngine.ts:187` | `goldenTest.ts:41654` |

## 16件の原文再実測と採用 JSON／逆翻訳

以下の JSON は既存 action を省略せず意味要約し、条件部分は live JSON をそのまま記載する。全件で action 本体は旧 live から維持された。

| effectId | CSV 原文（能力全体） | 生成 JSON（条件＋action） | regen 後の逆翻訳文全体 | 一致 |
|---|---|---|---|---|
| WXK07-084-E1 | 自場シグニ合計≦相手場合計の間、+5000し相手効果バニッシュ耐性 | `activeCondition:{FIELD_LEVEL_SUM,self,signi,lte,compareTo:opponent}; action:SEQUENCE[POWER_MODIFY +5000, GRANT_FIELD_SIGNI_ABILITY(GRANT_PROTECTION BANISH/sourceOwner opponent)]` | 【常】《あなたの場にあるシグニのレベルの合計が対戦相手の場にあるシグニのレベルの合計以下であるかぎり》このシグニのパワーを＋5000する。そしてこのシグニは『【常】このシグニは対戦相手の効果によってバニッシュされない』を得る | ○ |
| WXK07-087-E1 | 同条件で+5000 | 同条件; `POWER_MODIFY +5000 thisCardOnly` | 【常】《あなたの場にあるシグニのレベルの合計が対戦相手の場にあるシグニのレベルの合計以下であるかぎり》このシグニのパワーを＋5000する | ○ |
| WXK07-090-E1 | 同条件で+3000 | 同条件; `POWER_MODIFY +3000 thisCardOnly` | 【常】《あなたの場にあるシグニのレベルの合計が対戦相手の場にあるシグニのレベルの合計以下であるかぎり》このシグニのパワーを＋3000する | ○ |
| WXDi-P13-076-E1 | 自場ルリグ合計=3の間、+5000 | `activeCondition:{FIELD_LEVEL_SUM,self,lrig,eq,value:3}; POWER_MODIFY +5000` | 【常】《あなたの場にあるルリグのレベルの合計が3と同じであるかぎり》このシグニのパワーを＋5000する | ○ |
| WXDi-P13-076-E2 | 自場ルリグ合計=7の間、+7000 | `activeCondition:{FIELD_LEVEL_SUM,self,lrig,eq,value:7}; POWER_MODIFY +7000` | 【常】《あなたの場にあるルリグのレベルの合計が7と同じであるかぎり》このシグニのパワーを＋7000する | ○ |
| WXK07-053-E1 | アタック時、双方場シグニ合計が同じなら1ドロー | `condition:{FIELD_LEVEL_SUM,self,signi,eq,compareTo:opponent}; DRAW 1` | 【自】このシグニがアタックしたとき：あなたの場にあるシグニのレベルの合計が対戦相手の場にあるシグニのレベルの合計と同じ場合、あなたのカードを1枚引く | ○ |
| WDK13-015-E1 | アタック時、自場合計≦相手場合計なら相手1体-3000 | `condition:{FIELD_LEVEL_SUM,self,signi,lte,compareTo:opponent}; POWER_MODIFY -3000 opponent` | 【自】このシグニがアタックしたとき：あなたの場にあるシグニのレベルの合計が対戦相手の場にあるシグニのレベルの合計以下の場合、対戦相手のシグニ1体のパワーを－3000する | ○ |
| WXK07-088-E1 | 出《黒》、自場シグニ合計=5なら相手1体-3000 | `condition:{FIELD_LEVEL_SUM,self,signi,eq,value:5}; cost:black1; POWER_MODIFY -3000` | 【自】このシグニが場に出たとき：〈《黒×1》〉あなたの場にあるシグニのレベルの合計が5と同じ場合、対戦相手のシグニ1体のパワーを－3000する | ○ |
| WXDi-D03-004-E1 | 【チーム】NoLimit、アタック中の自シグニ+2000 | `activeCondition:{LRIG_TEAM_COUNT,self,NoLimit,gte,3}; POWER_MODIFY +2000` | 【常】《あなたの場に＜NoLimit＞のルリグが3体以上であるかぎり》あなたのすべてのシグニのパワーを＋2000する | 条件一致。本体の「アタック中」限定は既存表現の課題（下記） |
| WXDi-D06-004-E1 | 【チーム】DIAGRAMかつ自ターン、相手中央-2000 | `activeCondition:AND[LRIG_TEAM_COUNT(DIAGRAM,gte3),TURN_OWNER(self)]; POWER_MODIFY -2000` | 【常】《あなたの場に＜DIAGRAM＞のルリグが3体以上かつ自分のターンの間》自分または対戦相手のシグニ1体のパワーを－2000する | 条件一致。本体 target は既存課題 |
| WXDi-P00-041-E1 | 【チーム】さんばか、リフレッシュでライフをトラッシュへ移さない | `activeCondition:{LRIG_TEAM_COUNT,self,さんばか,gte,3}; STUB PREVENT_LIFE_REFRESH_TRASH` | 【常】《あなたの場に＜さんばか＞のルリグが3体以上であるかぎり》あなたのライフクロスはリフレッシュによってトラッシュに移動しない | ○（本体は既存 STUB） |
| WXDi-P01-035-E1 | 【チーム】CardJockey、相手ガード追加無無 | `activeCondition:{LRIG_TEAM_COUNT,self,CardJockey,gte,3}; STUB GUARD_EXTRA_COST_BY_OPP count2` | 【常】《あなたの場に＜CardJockey＞のルリグが3体以上であるかぎり》対戦相手が【ガード】する際に追加コスト（無色エナ）を要求する | ○（本体は既存 STUB） |
| WXDi-P02-009-E1 | 【チーム】NoLimitかつ相手ターン、自中央+2000 | `activeCondition:AND[LRIG_TEAM_COUNT(NoLimit,gte3),TURN_OWNER(opponent)]; POWER_MODIFY +2000 centerZoneOnly` | 【常】《あなたの場に＜NoLimit＞のルリグが3体以上かつ対戦相手のターンの間》あなたのすべての中央ゾーンのシグニのパワーを＋2000する | ○ |
| WXDi-P16-090-E1 | 【チーム】うちゅうのはじまり、ルリグレベル合計比例+1000、合計7ならシャドウ | `activeCondition:{LRIG_TEAM_COUNT,self,うちゅうのはじまり,gte,3}; SEQUENCE[STUB POWER_MOD_PER_COUNT,GRANT_KEYWORD shadow levelLte2]` | 【常】《あなたの場に＜うちゅうのはじまり＞のルリグが3体以上であるかぎり》[STUB:動的パワー修正（COUNT依存）]。そしてこのシグニは【シャドウ:{levelLte:2}】を持つ | チーム条件一致。本体は既存 STUB/合計7条件欠落（下記） |
| WX09-Re08-E1 | 場にレベル4＜タマ＞がいる間、基本パワー10000 | `activeCondition:{HAS_CARD_IN_FIELD,self,filter:{cardType:[lrig,assist],story:タマ,level:4}}; POWER_SET 10000` | 【常】《あなたの場に＜タマ＞のレベル4のルリグがいるかぎり》このシグニの基本パワーを10000にする | ○ |
| WXK05-047-E1 | キーが2枚以上ない間、このシグニはアタック不可 | `activeCondition:{HAS_KEY_IN_FIELD,self,lte,1}; BLOCK_ACTION ATTACK` | 【常】《あなたの場にキーが1枚以下であるかぎり》あなたのシグニはアタックできない | ○（否定を operator 反転で表現） |

## 不成立側の実行証拠

`goldenTest.ts:41654` で全16効果を live JSON から取得して評価した。3つのシグニ合計比較は各 effectId ごとに `1≦2=true / 3≦2=false`、ルリグ合計は `3=true/1=false` と `7=true/3=false`、自動条件3件は同値/非同値・以下/超過・合計5/4を固定。タマは level4タマ=true／非タマlevel3=false、キーは0枚=true／2枚=false。チーム6件は各印刷チームの3体=true／2体=false。全 assert が PASS し、未知型の `return true` では通らない。

## 見送り

0件。C群は `HAS_CARD_IN_FIELD` の既存ルリグ走査が level と class を同時評価できた。D群は `HAS_KEY_IN_FIELD` の個数比較拡張で書けたため、新型は増やしていない。

## 既存 golden の書き換え（#17′）

- 型数トリップワイヤは AC 47→49（FIELD_LEVEL_SUM／LRIG_TEAM_COUNT）、Condition 121→122（FIELD_LEVEL_SUM）へ更新し、許可表の live 全走査は維持した。削除・弱体化していない。
- 第17バッチ契約は「未実装なので載せない」という当時正しい負の契約から、「許可表に実装済みかつ6効果すべてに載る」正の契約へ置換。D06/P02 の AND 子まで再帰確認するため空振りしない。

## 条件以外で見つけた原文との食い違い

3効果に既存課題を確認した（今回の条件ゲート外）：`WXDi-D03-004-E1` の「アタックしている」限定が target に無い、`WXDi-D06-004-E1` の「相手中央」target が owner:any/count1、`WXDi-P16-090-E1` の動的パワーが STUB かつシャドウの「合計7」条件が無い。条件語彙 O-43 の採用は妨げないが、「能力全体が完全一致」とは申告しない。

## 慣例エンコードの検討と棄却（#25）

- レベル合計8件：`EICHI_LEVEL_SUM` は＜英知＞だけ、`LAST_PROCESSED_LEVEL_SUM` は直前処理札、`LRIG_LEVEL` はセンター1体なので全て棄却。FIELD_LEVEL_SUM を新設。
- チーム6件：`HAS_CARD_IN_FIELD` は Team を照合できず棄却。Condition の LRIG_TEAM_COUNT と同一意味を ActiveCondition に実装。
- WX09-Re08：`LRIG_NAME_CONTAINS` はセンター限定かつ ActiveCondition に無いので棄却。既存 HAS_CARD_IN_FIELD の全ルリグゾーン走査を採用。
- WXK05-047：単純 HAS_KEY_IN_FIELD は1枚以上の真偽だけ、`negate` は ActiveCondition に無いため棄却。枚数 `lte:1` を採用。

## ゲート・計器

- golden 2442/FAIL0（2441→+1テスト、内部は16効果の両方向 assert）
- census 702/baseline702（708→-6、baseline更新）
- smoke 10693/CRASH0/HANG0/INVARIANT0/SKIP0
- fuzz 全0
- census:stubs A群0/C群0
- manual-fields 0
- lint 0 errors/261 warnings（増減0）
- 同型★ 0
- held 88（開始88→途中90＝AND2件→個別採用後88）/ partial 15 / idset 46
- censusManualDrift 削除候補86（増減0）
- 生パース diff の変化集合：指定16効果のみ。自動純改善14＋held個別採用2。対象外 outlier 0。

