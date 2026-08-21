# clean群 round1 段1 batch2 triage

判定日: 2026-08-21。対象は B001〜B020 の101 findings（97カード）。原文、live JSON、消費側コードを1件ずつ照合した。通常 finding は全件 `parseStatus:AUTO`。B013の4件は effect 自体が欠落しているため `N/A (effect欠落)`、`WX16-024-LAYER-E2` と `WXDi-P09-069-sub-E1` は親効果内の付与 effect で親の `AUTO` を記した。MANUAL/PARTIAL は0件。

## 1. サマリ

| cluster | quote | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---|---:|---:|---:|---:|
| B001 | 残りをシャッフルして | 7 | 0 | 0 | 0 |
| B002 | 対戦相手のシグニ１体 | 7 | 0 | 0 | 0 |
| B003 | あなたの効果によって | 6 | 0 | 0 | 0 |
| B004 | センタールリグ１体 | 3 | 3 | 0 | 0 |
| B005 | 残りを好きな順番で | 6 | 0 | 0 | 0 |
| B006 | 手札に加えるか場に出し | 6 | 0 | 0 | 0 |
| B007 | 対戦相手の、能力か効果の対象 | 0 | 6 | 0 | 0 |
| B008 | あなたのメインフェイズの間 | 5 | 0 | 0 | 0 |
| B009 | このシグニがアタックしたとき | 5 | 0 | 0 | 0 |
| B010 | このターン | 5 | 0 | 0 | 0 |
| B011 | 一番下に置いてもよい | 5 | 0 | 0 | 0 |
| B012 | 対戦相手の効果によって | 5 | 0 | 0 | 0 |
| B013 | 【ライド】 | 4 | 0 | 0 | 0 |
| B014 | アタックフェイズの間 | 4 | 0 | 0 | 0 |
| B015 | アップするかダウンする | 4 | 0 | 0 | 0 |
| B016 | あなたのトラッシュから | 4 | 0 | 0 | 0 |
| B017 | エナゾーンにカードが２枚以上 | 4 | 0 | 0 | 0 |
| B018 | このシグニをダウン | 4 | 0 | 0 | 0 |
| B019 | パワーを＋3000し | 4 | 0 | 0 | 0 |
| B020 | 次にスペルを使用する場合 | 0 | 4 | 0 | 0 |
| **計** |  | **88** | **13** | **0** | **0** |

## 2. finding 全101件

根拠略記: **TARGETED-OPP**=対象確定側が効果元の相手場だけを抽出してから collector を呼ぶ（`src/screens/BattleScreen.tsx:4978-4989,5264-5282`）。**NEXT-SPELL**=`COST_REDUCTION` は `next_spell_cost_reduction` へ積まれ（`src/engine/effectExecutor.ts:7329-7336`）、次のスペル使用時に消費される（`src/screens/BattleScreen.tsx:7394,7410`）。**LRIG-CENTER**=素の LRIG action はセンタートップだけを処理する（FREEZE `src/engine/effectExecutor.ts:3069-3079`、DOWN `:3124-3137`、GRANT `:3563-3567`）。

| effectId | parseStatus | 分類 | 根拠／直す場所 | 原文の該当句 |
|---|---|---|---|---|
| WX21-037-E2 | AUTO | 真バグ | `REVEAL_AND_PICK.remainder.shuffle:true`へ。現SEQUENCE末尾のSHUFFLE_DECKは残りでなく全デッキを混ぜる。 | 残りをシャッフルしてデッキの一番下 |
| WX25-P2-045-E1 | AUTO | 真バグ | `REVEAL_AND_PICK.remainder.shuffle:true`。 | 残りをシャッフルして一番下 |
| WXDi-CP02-026-E3 | AUTO | 真バグ | 同上。 | 残りをシャッフルして一番下 |
| WXDi-CP02-027-E3 | AUTO | 真バグ | 同上。 | 残りをシャッフルして一番下 |
| WXDi-CP02-028-E2 | AUTO | 真バグ | 同上。 | 残りをシャッフルして一番下 |
| WXDi-CP02-029-E2 | AUTO | 真バグ | 同上。 | 残りをシャッフルして一番下 |
| WXDi-D01-011-E1 | AUTO | 真バグ | `LOOK_AND_REORDER`へshuffle指定（またはREVEAL系正準形）。 | 残りをシャッフルして一番下 |
| WX09-021-BURST | AUTO | 真バグ | `parseTargetFilter`で誤った`story:毒牙`を除く。 | 対戦相手のシグニ1体 |
| WXDi-CP02-094-E1 | AUTO | 真バグ | 誤った`story:ブルアカ`を除く。 | 対戦相手のシグニ1体 |
| WXDi-P02-004-E1 | AUTO | 真バグ | 誤った`story:天使`を除く。 | 対戦相手のシグニ1体 |
| WXDi-P02-049-E1 | AUTO | 真バグ | ON_TRASHの移動カードownerをopponentへ限定するtrigger fieldを生成。 | 対戦相手のシグニ1体がトラッシュに |
| WXEX1-03-E2 | AUTO | 真バグ | TRASH target.ownerをopponentへ。 | 対戦相手のシグニ1体 |
| WXEX1-28-E1 | AUTO | 真バグ | ATTACH_CHARM.charm.ownerをopponentへ。 | 対戦相手のシグニ1体をチャームに |
| WXEX1-29-E1 | AUTO | 真バグ | ON_TRASHの移動カードownerをopponentへ限定。 | 対戦相手のシグニ1体が場からトラッシュに |
| WD15-013-E1 | AUTO | 真バグ | ON_ENERGY_TO_TRASHに原因owner=selfを表す条件を追加。 | あなたの効果によって対戦相手のエナから |
| WX11-002-E1 | AUTO | 真バグ | ON_ZONE_MOVEDに`byOwnEffect:true`相当を生成。 | あなたの効果によってシグニが移動 |
| WX24-P2-064-E1 | AUTO | 真バグ | `THIS_CARD_PLACED_BY_CLASS`を「自分の効果で出た」条件へ置換。 | あなたの効果によってこのシグニが場に出た |
| WXDi-D05-013-E1 | AUTO | 真バグ | ON_TRASHへ原因owner=self条件を追加（turnOwnerでは代替不可）。 | あなたの効果によってデッキからトラッシュに |
| WXDi-P00-059-E1 | AUTO | 真バグ | ON_ZONE_MOVEDへ原因owner=self条件。 | あなたの効果によって移動 |
| WXK06-042-E1 | AUTO | 真バグ | ON_CARD_MOVED_TO_DECKへ`byOwnEffect:true`相当。 | あなたの効果によって対戦相手のカードがデッキに |
| WDK16-09-E1 | AUTO | 偽陽性 | LRIG-CENTER（GRANT）。liveは`target.type:LRIG`。 | 対戦相手のセンタールリグ1体 |
| WX05-022-BURST | AUTO | 真バグ | FREEZE targetをSIGNI→LRIG。 | 対戦相手のセンタールリグ1体 |
| WX14-030-BURST | AUTO | 真バグ | FREEZE targetをSIGNI→LRIG。 | 対戦相手のセンタールリグ1体 |
| WX17-003-E1 | AUTO | 偽陽性 | LRIG-CENTER（GRANT）。choice②は`target.type:LRIG`。 | 対戦相手のセンタールリグ1体 |
| WX17-020-E1 | AUTO | 偽陽性 | LRIG-CENTER（FREEZE）。choice③は`target.type:LRIG`。 | 対戦相手のセンタールリグ1体 |
| WXK10-104-E1 | AUTO | 真バグ | choice② GRANT_PROTECTION targetをSIGNI→LRIG。 | あなたのセンタールリグ1体 |
| WX24-D4-06-E1 | AUTO | 真バグ | 残りを対話整列するLOOK/REVEAL語彙へ。 | 残りを好きな順番で一番下 |
| WX25-P3-109-BURST | AUTO | 真バグ | 同上。 | 残りを好きな順番で一番下 |
| WX26-CP1-060-E1 | AUTO | 真バグ | 同上。 | 残りを好きな順番で一番下 |
| WXDi-P01-047-E1 | AUTO | 真バグ | 同上。 | 残りを好きな順番で一番下 |
| WXDi-P05-052-E1 | AUTO | 真バグ | 同上。 | 残りを好きな順番で一番下 |
| WXDi-P10-005-E2 | AUTO | 真バグ | 同上。 | 残りを好きな順番で一番下 |
| WX07-023-BURST | AUTO | 真バグ | SEARCHに`handOrField:true`相当を生成。 | 手札に加えるか場に出す |
| WX16-024-BURST | AUTO | 真バグ | 同上。 | 手札に加えるか場に出す |
| WX17-Re01-E1 | AUTO | 真バグ | 同上（did-it後のSEARCH内）。 | 手札に加えるか場に出す |
| WX20-050-E2 | AUTO | 真バグ | 同上。 | 手札に加えるか場に出す |
| WXK08-040-BURST | AUTO | 真バグ | 同上。 | 手札に加えるか場に出す |
| WXK11-022-BURST | AUTO | 真バグ | 同上。 | 手札に加えるか場に出す |
| WX24-P1-045-E1 | AUTO | 偽陽性 | TARGETED-OPP。live `ON_TARGETED`/any_ally。 | 対戦相手の能力か効果の対象になったとき |
| WX24-P3-051-E1 | AUTO | 偽陽性 | TARGETED-OPP。 | 対戦相手の能力か効果の対象になったとき |
| WXDi-P03-067-E1 | AUTO | 偽陽性 | TARGETED-OPP。 | 対戦相手の能力か効果の対象になったとき |
| WXDi-P09-069-sub-E1 | AUTO | 偽陽性 | TARGETED-OPP。付与effectも同collector。 | 対戦相手の能力か効果の対象になったとき |
| WXDi-P12-074-E1 | AUTO | 偽陽性 | TARGETED-OPP＋turnOwner:opponent。 | 対戦相手の能力か効果の対象になったとき |
| WXDi-P14-057-E1 | AUTO | 偽陽性 | TARGETED-OPP。内包付与effectも同collector。 | 対戦相手の能力か効果の対象になったとき |
| WX18-077-E1 | AUTO | 真バグ | triggerCondition.duringMainPhase=true。 | あなたのメインフェイズの間 |
| WX18-078-E1 | AUTO | 真バグ | 同上。 | あなたのメインフェイズの間 |
| WX25-P1-099-E1 | AUTO | 真バグ | 同上（ON_TRASH collectorは同fieldを消費）。 | あなたのメインフェイズの間 |
| WX25-P1-104-E1 | AUTO | 真バグ | 同上。 | あなたのメインフェイズの間 |
| WXDi-D02-25-E1 | AUTO | 真バグ | 同上（ON_LEAVE_FIELD）。 | あなたのメインフェイズの間 |
| WX10-029-E2 | AUTO | 真バグ | CONTINUOUS BOUNCEをON_ATTACK_SIGNI AUTOへ。 | このシグニがアタックしたとき |
| WX24-P2-001-E1 | AUTO | 真バグ | 対象シグニへのGRANT_EFFECT（ON_ATTACK_SIGNI）を生成。 | このシグニがアタックしたときアップし能力を失う |
| WXDi-P04-014-E1 | AUTO | 真バグ | ソウル先へのON_ATTACK_SIGNI付与へ。 | このシグニがアタックしたとき |
| WXDi-P11-078-E3 | AUTO | 真バグ | CONTINUOUS POWER_MODIFYをON_ATTACK_SIGNI付与へ。 | このシグニがアタックしたとき |
| WXEX1-31-E1 | AUTO | 真バグ | 天使ALLへのON_ATTACK_SIGNI付与を生成。 | このシグニがアタックしたとき |
| WD15-002-E1 | AUTO | 真バグ | GRANT_KEYWORD.durationをUNTIL_END_OF_TURN。 | このターン、ダブルクラッシュ |
| WD15-007-E1 | AUTO | 真バグ | 同上（アサシン）。 | このターン、アサシン |
| WX05-014-E1 | AUTO | 真バグ | GRANT_PROTECTION.durationをUNTIL_END_OF_TURN。 | このターン、効果を受けない |
| WX09-Re05-E1 | AUTO | 真バグ | 両COST_INCREASE.durationをUNTIL_END_OF_TURN。 | このターン、使用コストを増やす |
| WXDi-P05-008-E3 | AUTO | 真バグ | GRANT_KEYWORD.durationをUNTIL_END_OF_TURN。 | このターン、マルチエナ |
| WDK04-014-E1 | AUTO | 真バグ | LOOK_AND_REORDERを任意下送り（skip可）へ。 | 一番下に置いてもよい |
| WXDi-CP01-025-E2 | AUTO | 真バグ | 強制2段LOOKを任意下送り1対話へ（private:falseも除去）。 | 一番下に置いてもよい |
| WXDi-P06-071-E1 | AUTO | 真バグ | 任意下送りへ。 | 一番下に置いてもよい |
| WXDi-P08-062-E1 | AUTO | 真バグ | 強制2段LOOKを任意下送りへ。 | 一番下に置いてもよい |
| WXK03-050-E1 | AUTO | 真バグ | remainder top固定でなく任意bottom分岐を生成。 | 一番下に置いてもよい |
| WX06-016-E2 | AUTO | 真バグ | ON_LEAVE_FIELDに`byOpponentEffect:true`。 | 対戦相手の効果によって場を離れた |
| WX13-051-E2 | AUTO | 真バグ | ON_TRASHに`byOpponentEffect:true`。 | 対戦相手の効果によって手札からトラッシュに |
| WX16-024-LAYER-E2 | AUTO | 真バグ | 付与ON_LEAVE_FIELDに`byOpponentEffect:true`。 | 対戦相手の効果によって場を離れた |
| WX25-P1-060-E2 | AUTO | 真バグ | ON_TRASHに`byOpponentEffect:true`。 | 対戦相手の効果によってトラッシュに |
| WXK11-023-E1 | AUTO | 真バグ | ON_LEAVE_FIELDに`byOpponentEffect:true`。 | 対戦相手の効果によって場を離れた |
| WDK01-001 (missing ride effect) | N/A (effect欠落) | 真バグ | parserの【ライド】抽出でACTIVATED `STUB:RIDE_ON`を追加。既存実装は`src/engine/execStubPart2.ts:4806-4825`。 | 【ライド】 |
| WDK01-002 (missing ride effect) | N/A (effect欠落) | 真バグ | 同上。 | 【ライド】 |
| WDK01-003 (missing ride effect) | N/A (effect欠落) | 真バグ | 同上。 | 【ライド】 |
| WDK01-004 (missing ride effect) | N/A (effect欠落) | 真バグ | 同上。 | 【ライド】 |
| SP27-003-E1 | AUTO | 真バグ | triggerCondition.duringAttackPhase=true。`byOwnEffect`は別軸で代替不可。 | アタックフェイズの間 |
| WX09-013-E1 | AUTO | 真バグ | phase限定のactiveCondition/期間表現を追加。 | アタックフェイズの間、バニッシュされない |
| WX19-029-E1 | AUTO | 真バグ | triggerCondition.duringAttackPhase=true。 | アタックフェイズの間 |
| WXK11-039-E2 | AUTO | 真バグ | 同上。 | アタックフェイズの間 |
| WD23-032-A-E1 | AUTO | 真バグ | UP/DOWN二択CHOOSEへ。 | アップするかダウンする |
| WX11-030-E2 | AUTO | 真バグ | 同上。 | アップするかダウンする |
| WX19-029-E1 | AUTO | 真バグ | 同上（B014のphase条件も必要）。 | アップするかダウンする |
| WXK11-039-E2 | AUTO | 真バグ | 同上（B014のphase条件も必要）。 | アップするかダウンする |
| WXDi-CP02-049-E1 | AUTO | 真バグ | ADD_TO_LIFE.fromTopをtrash source＋noLifeBurst filterへ。 | あなたのトラッシュからLBを持たないカード |
| WXDi-CP02-049-E2 | AUTO | 真バグ | 同上。 | あなたのトラッシュからLBを持たないカード |
| WXDi-P11-003-E1 | AUTO | 真バグ | choice③ TRANSFER_TO_DECK.sourceをTRASH_CARDへ。 | あなたのトラッシュからシグニ1体 |
| WXDi-P13-037-E2 | AUTO | 真バグ | ADD_TO_LIFE.fromTopをtrash sourceへ。 | あなたのトラッシュからカード |
| WX25-P2-054-E2 | AUTO | 真バグ | action前にENERGY_COUNT opponent gte 2条件。 | 対戦相手のエナゾーンに2枚以上 |
| WX25-P3-080-E1 | AUTO | 真バグ | choice② availability/CONDITIONALへ同条件。 | 対戦相手のエナゾーンに2枚以上 |
| WXDi-D07-017-E1 | AUTO | 真バグ | action前に同条件。 | 対戦相手のエナゾーンに2枚以上 |
| WXDi-P04-034-E1 | AUTO | 真バグ | action前に同条件。 | 対戦相手のエナゾーンに2枚以上 |
| WX24-P1-069-E1 | AUTO | 真バグ | DOWN target.filter.thisCardOnly=true（did-it隣接構造は成立）。 | このシグニをダウンしてもよい |
| WX25-P2-085-E1 | AUTO | 真バグ | choice② DOWNへthisCardOnly=true。 | このシグニをダウンしてもよい |
| WXDi-P15-092-E1 | AUTO | 真バグ | DOWNへthisCardOnly=true。 | このシグニをダウンしてもよい |
| WXDi-P16-078-E1 | AUTO | 真バグ | DOWNへthisCardOnly=true。 | このシグニをダウンしてもよい |
| WX16-Re09-E1 | AUTO | 真バグ | POWER_MODIFY +3000 UNTIL_END_OF_TURNを保護前に追加。 | パワーを＋3000し |
| WX24-D4-04-E1 | AUTO | 真バグ | GRANT_KEYWORD前に対象同一のPOWER_MODIFY +3000。 | パワーを＋3000し |
| WX25-CP1-078-E1 | AUTO | 真バグ | GRANT_KEYWORD前にPOWER_MODIFY +3000。 | パワーを＋3000し |
| WXK07-028-E1 | AUTO | 真バグ | choice①にPOWER_MODIFY +3000を追加。 | パワーを＋3000し |
| WX06-012-E1 | AUTO | 偽陽性 | NEXT-SPELL。liveはCOST_REDUCTION/スペル。 | 次にスペルを使用する場合 |
| WX09-018-E3 | AUTO | 偽陽性 | NEXT-SPELL。duration表記に関係なく専用stateへ積み次回使用で消費。 | 次にスペルを使用する場合 |
| WX10-073-E1 | AUTO | 偽陽性 | NEXT-SPELL。 | 次にスペルを使用する場合 |
| WXK11-035-E2 | AUTO | 偽陽性 | NEXT-SPELL。 | 次にスペルを使用する場合 |

## 3. クラスタ所見

- **B001**: 6件は remainder の `shuffle:true` で束ねられる。WX21-037だけ末尾SHUFFLE_DECKという異構造だが、残り札限定ではないため真バグのまま個別に組み替える。
- **B002**: owner誤り3件、過剰story filter3件、移動イベントowner欠落2件（うち分類上の重複なし）で入口が割れる。単一規則では不可。
- **B003**: 原因owner=selfを各 timing の triggerConditionへ渡す意味は共通だが、ON_ZONE_MOVED/ON_TRASH/ON_ENERGY_TO_TRASH/ON_CARD_MOVED_TO_DECKのparser入口別。`byOwnEffect`の名前だけで横展開しない。
- **B004**: 結論が3/3に割れた。`type:LRIG` 3件はexecutorがセンターだけを取る一方、`type:SIGNI` 3件には救済が成立しない。
- **B005**: 6件ともREVEAL_AND_PICK remainderが順序選択を持たない。同文型を対話整列語彙へ束ねられる。
- **B006**: 6件ともSEARCHの`then:ADD_TO_FIELD`だけで`handOrField`が無い。文型規則1本で束ねられる。
- **B007**: 6件とも修正不要。collector単体でなく、実呼出側が効果元の相手場だけを抽出していることを確認した。
- **B008**: 5件とも`duringMainPhase:true`欠落。timing別parser出口はあるが条件生成は共通化可能。
- **B009**: 5件とも攻撃時能力の木自体が欠落/常時化。付与先（自身・対象・ソウル先・クラスALL）が違い、単一規則は危険。
- **B010**: 5件ともPERMANENT誤生成。期間prefixをgrant/protection/cost increaseへ伝播する共通規則候補だがaction別に確認が必要。
- **B011**: 5件とも任意性欠落。LOOK_AND_REORDER/REVEALの任意bottom語彙へ束ねるが、WXK03-050は条件else側の個別構造。
- **B012**: 5件とも原因限定欠落。B003と対照し、こちらは`byOpponentEffect`。ON_LEAVE_FIELD/ON_TRASHの各collectorが実際に同fieldを消費する。
- **B013**: 4件ともeffect丸ごと欠落。RIDE_ON機構は既存なので機構待ちではなくparser抽出バグ。effectが無いためparseStatusも存在しない。
- **B014**: 4件ともphase条件欠落。SP27の`byOwnEffect:true`は原因軸でありphase軸を救済しない。
- **B015**: 4件ともDOWN単独への退化。UP/DOWN CHOOSEの文型1本で束ねられる。
- **B016**: trash source欠落で共通だが、ADD_TO_LIFE 3件とTRANSFER_TO_DECK 1件に出口が割れる。
- **B017**: 4件ともopponent ENERGY_COUNT gte 2欠落。通常action3件とCHOOSE option1件に分ける。
- **B018**: 4件ともDOWNのthisCardOnly欠落。後続did-it gateの隣接構造は各件で成立しているが、対象誤りは救済しない。
- **B019**: 4件とも+3000 action欠落。後続actionが異なるため同一対象の保持方法を確認して追加する。
- **B020**: 4件とも修正不要。liveが全件COST_REDUCTION/スペルで、専用stateへの格納と次のスペル使用時消費が成立。

## 4. 機構待ち

0件。今回必要なRIDE_ON、handOrField、remainder shuffle、phase/cause条件、UP/DOWN、次回スペル軽減消費はいずれも既存語彙・消費経路がある。

## 5. 段0判定への反証

0件。今回の101残存finding以外（段0除去232件・B021以降）は禁止スコープのため再展開していない。

## 6. 条件以外で見つけた原文との食い違い

1件。`WX21-037-E2` は指摘対象の「残りをシャッフル」が欠けるだけでなく、代わりに後段 `SHUFFLE_DECK` があり、**残り札ではなくデッキ全体をシャッフルする過剰処理**になっている。B001の他6件にはこの追加差分はない。

## 7. ゲート・差分

`npm run gates` 全緑。投入前ベースラインと一致:

- typecheck PASS
- golden PASS 2325 / FAIL 0
- smoke 10693効果、OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0
- fuzz CRASH/HANG/INVARIANT/EXPLOSION 0
- census 高シグナル 783 / ベースライン 783
- census:stubs 無言no-op 0（🔴0 / C群0）
- manual-fields 0 effects
- lint 0 errors / 260 warnings

`git status --short` は開始前から指定された4本のM（`docs/CODEX_GUIDE.md`、`docs/PLAN.md`、`docs/_census_stubs.txt`、`docs/_vocab_census.txt`）を維持した。開始前から同ディレクトリ等にあった未追跡の段0/第1/第2バッチ入力・既報告ファイルも維持し、今回新規は許可された本報告書1本だけ。`git diff --stat` は tracked 差分として `docs/CODEX_GUIDE.md` 3行、`docs/PLAN.md` 11行（計2 files, 12 insertions, 2 deletions）のみを表示し、今回の作業による新規tracked差分は0。計器2本はstatus上Mだが内容diff statは0（改行警告のみ）。parser/engine/live JSONは変更していない。

## 8. ガードレール1の適用結果

共通根拠から外した件:

- B001 `WX21-037-E2`: 他6件の「shuffle field欠落」と異なり末尾SHUFFLE_DECKが存在。ただし要求構造は「公開した残りだけのshuffle」で、全デッキshuffleは同値でないため偽陽性へは外さなかった。
- B004 `WDK16-09-E1` / `WX17-003-E1` / `WX17-020-E1`: liveが`target.type:LRIG`で、各executorのセンタートップ正規化が成立するため偽陽性。`WX05-022-BURST` / `WX14-030-BURST` / `WXK10-104-E1`は`SIGNI`で同じ救済が成立せず真バグ。
- B018 4件: did-it gateの隣接構造は成立するが、それは後続抑止だけでDOWN対象をこのカードへ狭めないため、共通救済を対象条件へ流用せず真バグ。

上記以外も全findingで、引用した機構が要求するtype/owner/filter/隣接fieldをlive JSON上で確認した。

---

# 【Claude 検証】2026-08-21（CODEX_GUIDE §7）

## ゲート独立実行＝ベースライン一致・全緑
golden PASS 2325/FAIL 0／smoke 10693 OK 10693・異常0／fuzz 0／census 783（baseline 783）／census:stubs 0／manual-fields 0／lint 0 errors・260 warnings。
新規 tracked 差分0（M は Claude の簿記4本のみ）＝**既存ファイル変更0**は申告どおり。

## 真バグ88／偽陽性13 という比率の反転について
第1バッチは 36/65 だったので**ガードレール1 への過剰反応で真バグを過大申告した疑い**を持ち、真バグ側を重点サンプリングした。
結論＝**過大申告ではない**。第1バッチは「engine の慣例エンコード（did-it ゲート／`temp_power_mods`／`POWER_SET` 自動適用）」に
ぶつかるクラスタが大半だったのに対し、**第2バッチは「条件・フィルタが live JSON から単純に脱落している」ファミリが大半**で、母集団の性質が違う。
- `WX06-016-E2`／`WXK11-023-E1`（ON_LEAVE_FIELD）＝`triggerCondition` が**丸ごと不在**を確認。
- `WXEX1-29-E1`／`-E2`（B002）＝原文の「センタールリグと共通する色」フィルタが action target に不在を確認。
- ガードレール1 の適用報告（§8）も具体的＝B004 で `target.type:LRIG` の3件だけを偽陽性へ分け、`SIGNI` の3件は真バグに残している＝**構造で割った**。

## 🔴 Codex の見落とし＝「機構待ち0」は誤り（最低2件は engine 配線が要る）
`byOpponentEffect` の消費地点を実コードで洗った結果：

| collector | self スコープで `byOpponentEffect` を読むか |
|---|---|
| `collectTrashTriggers`（`triggerCollect.ts:931`） | ✅**読む**（`:954-955` で self/any_ally/any を通し `:970` でゲート）→ `WX13-051-E2`／`WX25-P1-060-E2` は Codex の見立てどおり **JSON/parser 修正で足りる** |
| `collectLeaveFieldTriggers`（`:1344`） | 🔴**読まない**。cause ゲートは **any_ally ループ（`:1433-1435`）と opponent ループ（`:1476-1480`）にしか無く、self スコープループ（`:1375-1398`）は `duringAttackPhase`／`turnOwner`／`leftStateFilter`／`condition` しか評価しない** |

⇒ **`WX06-016-E2`／`WXK11-023-E1`（どちらも `triggerScope` 省略＝self の ON_LEAVE_FIELD）に
`byOpponentEffect:true` を足しても self スコープループが無視する＝恒久 no-op で、条件は永久に効かない。**
＝この2件は**真バグ かつ 機構待ち**（self スコープループへの cause ゲート配線が先）。
⚠**同じ collector は過去2回まったく同じ穴を出している**＝ソース内のコメントが
「従来は self スコープ経路が `turnOwner` を評価せず過剰発火していた」「従来は self スコープ経路が `leftStateFilter` 未評価で無条件発火していた」
と記録している。**`byOpponentEffect` はその系列の3件目**＝**単発ではなく系統**として直すべき。
これは CODEX_GUIDE §5-2（engine が本当に評価できるか）／§5-15（配線が複数箇所に跨るとき1箇所で満足する）の型。

## 段2 着手前の必読メモ
- **B003／B012 の「原因オーナー」系11件は、timing ごとに consumer の有無が違う。**
  JSON へ条件を足す前に**その timing の collector が self スコープでそのフィールドを読むか**を必ず確認する
  （読まないなら過小実行ではなく**条件が効かない＝過剰実行のまま**になり、ゲートにも計器にも一切映らない）。
- Codex の**修正提案（「◯◯に `byOwnEffect:true` 相当を生成」）は分類の根拠ではない**＝分類（条件が脱落している＝真バグ）は正しいが、
  **提案どおりに実装すると no-op になる件が混じっている。**段2 では提案をそのまま採用しない。
