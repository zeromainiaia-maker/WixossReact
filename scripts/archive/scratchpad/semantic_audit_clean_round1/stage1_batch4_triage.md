# 意味照合監査 clean群 round1 — 段1 第4バッチ triage

対象は E001〜E020 の40 findings（39カード）。分類は finding 単位で行い、実装はしていない。`parseStatus` は40件すべて `AUTO` で、MANUAL/PARTIAL の `syncManualLive.ts` 経路に該当するものはない。

## 1. サマリ

| cluster | quote | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---|---:|---:|---:|---:|
| E001 | あなたのレゾナ１体 | 2 | 0 | 0 | 0 |
| E002 | あなたの他のシグニ１体 | 2 | 0 | 0 | 0 |
| E003 | エナゾーンからシグニを１枚まで | 2 | 0 | 0 | 0 |
| E004 | エナゾーンにカードがない場合 | 2 | 0 | 0 | 0 |
| E005 | カード１枚をデッキの一番上に戻し | 2 | 0 | 2 | 0 |
| E006 | カード１枚をトラッシュに置き | 2 | 0 | 2 | 0 |
| E007 | カード１枚を対象とし | 2 | 0 | 0 | 0 |
| E008 | ガードステップ以外で | 2 | 0 | 2 | 0 |
| E009 | カードを１枚以上捨てていた場合 | 2 | 0 | 1 | 0 |
| E010 | カードを２枚まで探して | 0 | 2 | 0 | 0 |
| E011 | このカードを手札に加える | 2 | 0 | 0 | 0 |
| E012 | このシグニ | 0 | 2 | 0 | 0 |
| E013 | このシグニが…クラッシュ | 2 | 0 | 2 | 0 |
| E014 | このシグニと他のシグニ１体 | 0 | 2 | 0 | 0 |
| E015 | このシグニと同じパワー | 2 | 0 | 2 | 0 |
| E016 | このシグニのパワーは | 0 | 2 | 0 | 0 |
| E017 | このシグニのパワー以下 | 2 | 0 | 0 | 0 |
| E018 | このシグニの下にあった | 2 | 0 | 2 | 0 |
| E019 | このシグニの基本パワーは8000 | 0 | 2 | 0 | 0 |
| E020 | このシグニはバニッシュされない | 2 | 0 | 2 | 0 |
| **合計** |  | **30** | **10** | **15** | **0** |

注: 機構待ち15件はすべて真バグとの重複計上。

## 2. finding 全40件の分類

| effectId | parseStatus | 分類 | 根拠（live JSON と原文の個別照合） | consumer | 原文の該当句 |
|---|---|---|---|---|---|
| WX07-023-E2 | AUTO | 真バグ | live は `GRANT_PROTECTION.target={type:SIGNI,owner:self,count:1}` だけで `filter.cardType:'レゾナ'` がない。原文は付与先を「あなたのレゾナ1体」に限定するため、通常シグニも候補になる現状は過剰。 | `execGrantProtection` (`effectExecutor.ts:5347`, 候補生成は:5380付近); `matchesFilter` | あなたのレゾナ１体を対象とし |
| WXEX2-05-E2 | AUTO | 真バグ | live の `ON_LEAVE_FIELD` には `triggerScope` と `triggerFilter` がともに無く、原文の「あなたのレゾナ1体が場を離れたとき」に対するカード種別制約がJSON上に存在しない。 | `collectLeaveFieldTriggers`（`triggerCollect.ts:1344`、any_ally の triggerFilter 評価経路） | あなたのレゾナ１体が場を離れたとき |
| WX14-033-E2 | AUTO | 真バグ | 第1 step は `BANISH target.owner:'opponent', filter.excludeSelf:true` だが、原文の任意コストは「あなたの他のシグニ1体」。`optional:true` はあるものの owner が逆で、相手盤面を減らして自己アップできる。 | `execBanish` (`effectExecutor.ts:1068`付近); 後続did-itは `execSequence` の `DID_IT_GATED_TYPES` (`:3798`) | あなたの他のシグニ１体をバニッシュしてもよい |
| WXK09-084-E1 | AUTO | 真バグ | live は `GRANT_KEYWORD.target.owner:'any'`、`triggerScope:'any_ally'`、`triggerFilter.excludeSelf:true`。原文では素材が使われた「あなたの他のシグニ」そのものが付与先であり、`targetsTriggerSource` も無い現状は両陣営から再選択できる。 | `collectMaterialUsedTriggers`; `execGrantKeyword` (`effectExecutor.ts:3509`, `targetsTriggerSource` は:3532) | あなたの他のシグニ１体に《改造素材》が使用されたとき、そのシグニは【ランサー】を得る |
| WXDi-P03-030-E1 | AUTO | 真バグ | live action は `ENERGY_CHARGE_FROM_DECK{count:1}` だけ。原文の後段「エナゾーンからシグニを1枚まで手札に加える」に対応する `TRANSFER_TO_HAND{ENERGY_CARD,filter.cardType:'シグニ',upToCount:true}` が丸ごと無い。 | `execEnergyChargeFromDeck`; `execTransferToHand` (`effectExecutor.ts:2580`付近) | その後、あなたのエナゾーンからシグニを１枚まで対象とし、それを手札に加える |
| WXDi-P13-009-E2 | AUTO | 真バグ | live は `CONDITIONAL HAS_CARD_IN_FIELD(minCount:2,isDisona:true)` の then がエナチャージ1で終了する。原文は条件成立時にさらにエナのシグニを最大1枚回収するので SEQUENCE の第2 action が欠落。 | `execConditional`; `execTransferToHand` の ENERGY_CARD 分岐 (`effectExecutor.ts:2611`) | 【エナチャージ１】をし、その後、あなたのエナゾーンからシグニを１枚まで対象とし |
| WX14-022-E1 | AUTO | 真バグ | 3-step SEQUENCE の第2 step が無条件 `ENERGY_CHARGE_FROM_DECK{count:2}`。第1 step には `HAND_COUNT eq 0` がある一方、原文第2文に必要な `ENERGY_COUNT self eq 0` の包みが無い。 | `evalCondition` の `ENERGY_COUNT` (`execUtils.ts:1634`); `execSequence` | あなたのエナゾーンにカードがない場合、あなたのデッキの上からカードを２枚エナゾーンに置く |
| WXDi-P16-012-E2 | AUTO | 真バグ | choice c0 は `HAND_COUNT eq 0` を保持するが、c1 `ENERGY_CHARGE_FROM_DECK{count:2}` には condition が無い。したがってエナ1枚以上でも原文の選択肢②を選べる。 | CHOOSE availability の `evalCondition`; `ENERGY_COUNT` reader (`execUtils.ts:1634`) | ②あなたのエナゾーンにカードがない場合、【エナチャージ２】をする |
| SPDi01-133-E1（E005） | AUTO | 真バグかつ機構待ち | live は `LOOK_AND_REORDER{count:3,canTrash:true,destination:{deck,bottom}}` の単一行先だけ。原文で別枠の「1枚をデッキ一番上」に戻す情報がなく、上1・下残余・trash1の三分岐を保持できない。 | `execLookAndReorder` (`effectExecutor.ts:5026`) → `resumeLookAndReorder`; 珵行 pending は `canTrash` と単一 `destPosition` のみ | カード１枚をデッキの一番上に戻し、残りを好きな順番でデッキの一番下に置く |
| WX24-P3-078-E1 | AUTO | 真バグかつ機構待ち | live の `LOOK_AND_REORDER` は `canTrash:false,destination.position:'bottom'` で、見た3枚すべてを下へ返すUIになる。原文の「1枚だけtop、残りbottom」を表す分割指定がactionに無い。 | `execLookAndReorder` (`effectExecutor.ts:5040-5058`) → `resumeLookAndReorder` | その中からカード１枚をデッキの一番上に戻し、残りを好きな順番でデッキの一番下に置く |
| SPDi01-133-E1（E006） | AUTO | 真バグかつ機構待ち | 同じ live の `canTrash:true` は pending に任意可否の真偽だけを渡す。原文は「カード1枚をトラッシュに置き」と必須・ちょうど1枚だが、trash最小/最大枚数の値がJSONに無い。 | `execLookAndReorder` (`effectExecutor.ts:5052` の `canTrash`) と `EffectInteractionModal` | その中からカード１枚をトラッシュに置き |
| WXDi-P15-073-E2 | AUTO | 真バグかつ機構待ち | live は `LOOK_AND_REORDER{count:5,canTrash:true,destination.bottom}`。コイン1枚のcostとターン2回は正しいが、見た5枚から必ず1枚trashという原文に対し `canTrash` は枚数・必須性を符号化しない。 | `execLookAndReorder` → `resumeLookAndReorder`; 必須trash枚数を読むconsumerは無し | その中からカード１枚をトラッシュに置き、残りを好きな順番でデッキの一番下に置く |
| WX25-P3-080-E1 | AUTO | 真バグ | choice c0 は色不一致filter自体は正しい一方、`TRASH.opponentSelects:true` が付く。原文①の対象選択主語は効果の使用者であり、相手選択なのは条件付きchoice c1だけ。 | `execTrash` と `opponentSelects` interaction 分岐 (`effectExecutor.ts:1718`付近) | ①対戦相手のエナゾーンから…カード１枚を対象とし、それをトラッシュに置く |
| WXDi-P08-009-E2 | AUTO | 真バグ | live は `GRANT_KEYWORD target={ENERGY_CARD,self,count:'ALL'}` でエナ全体へマルチエナを付ける。原文は「カード1枚を対象」と単数なので `count:1` との差が直接存在する。 | `execGrantKeyword` の ENERGY_CARD/非field対象経路（`effectExecutor.ts` action dispatch） | あなたのエナゾーンにあるカード１枚を対象とし、ターン終了時まで、それは【マルチエナ】を得る |
| WXK09-069-E2 | AUTO | 真バグかつ機構待ち | live は裸の `ON_HAND_DISCARDED` で `condition`/`triggerCondition` が無い。原文の否定条件は「ガードステップ以外」だが、通常の phase 列挙だけでは ATTACK 中の guard substep を区別できない。 | `collectHandDiscardTriggers` (`triggerCollect.ts:3424`); guard-substep否定を読むconsumerは無し | ガードステップ以外であなたが手札を１枚捨てたとき |
| WXK09-073-E2 | AUTO | 真バグかつ機構待ち | live trigger は前件同様 `ON_HAND_DISCARDED` と once-per-turn のみで、guard中除外フラグが0。原文ではガード支払い等の捨て札では凍結してはならない。 | `collectHandDiscardTriggers`; `ON_GUARD` collector (`triggerCollect.ts:3016`) は別イベントで除外ゲートにはならない | ガードステップ以外であなたが手札を１枚捨てたとき |
| WXDi-CP02-055-E2 | AUTO | 真バグかつ機構待ち | live の `ON_ATTACK_SIGNI` は直ちに `TRASH{HAND_CARD,owner:opponent,count:1}` を実行し、原文の「このターンに手札から＜ブルアカ＞を1枚以上捨てた」条件が皆無。既存 `turn_hand_discarded_count` は属性別履歴を保持しない。 | `evalCondition` の `TURN_HAND_DISCARD_GTE` (`execUtils.ts:1968`) は総数のみ; クラス別turn履歴consumerは無し | このターンにあなたが手札から＜ブルアカ＞のカードを１枚以上捨てていた場合 |
| WXDi-D07-017-E1 | AUTO | 真バグ | live はアタックフェイズ開始時に無条件 `TRASH{ENERGY_CARD,owner:opponent,count:1,opponentSelects:true}`。原文の捨て札1枚以上条件には既存 `TURN_HAND_DISCARD_GTE{value:1}` を消費する経路があるが未設定で、エナ2枚以上条件も脱落。 | `evalCondition` (`execUtils.ts:1968` と `ENERGY_COUNT` :1634); `execTrash` | 対戦相手のエナゾーンにカードが２枚以上ありこのターンにあなたがカードを１枚以上捨てていた場合 |
| PR-242-E1 | AUTO | 偽陽性 | live は SEARCH 自体が `maxCount:2`。後続 `ENERGY_CHARGE.target.count:1` は選択1枚ごとの適用形で、`resumeSearch` が picked 配列を処理するため、2枚選択時も両方がエナへ移る。原文の「2枚まで」と一致する。 | `execSearch` (`effectExecutor.ts:3718`, maxPick) → `resumeSearch` (`:8370`, picked展開) | デッキからカードを２枚まで探してエナゾーンに置き |
| WD18-001-E1 | AUTO | 偽陽性 | live の探索上限は `maxCount:2`、`filter.hasIcon:'アクセ'`、`afterSearch:SHUFFLE_DECK`。then の count 1 は各pickedカードへの処理指定であり、探索総数を1へ縮める値ではない。 | `resumeSearch` (`effectExecutor.ts:8370`); SEARCH modal は `maxPick` を選択上限に使用 | 《アクセアイコン》を持つカードを２枚まで探してエナゾーンに置き |
| WX10-096-E1 | AUTO | 真バグ | live SEQUENCE 第2回収は `TRASH_CARD count:1 filter:{}`。原文の起動能力はトラッシュにあるスペル自身を指すため `filter.thisCardOnly:true` が必要で、現状は任意カードを選択可能。 | `execTransferToHand` の TRASH_CARD `thisCardOnly` 即時経路 (`effectExecutor.ts:2598,2644`) | あなたのトラッシュからこのカードを手札に加える |
| WXDi-P06-077-E1 | AUTO | 真バグ | live 第2 step は `TRANSFER_TO_HAND source={ENERGY_CARD,self,count:1}` でfilterなし。原文はエナにある当該スペル自身だけを回収するため、別カードを取れる構造は不一致。 | `execTransferToHand` ENERGY_CARD の `thisCardOnly` 分岐 (`effectExecutor.ts:2611`) | あなたのエナゾーンからこのカードを手札に加える |
| WX25-CP1-050-E2 | AUTO | 偽陽性 | live の絆常は `CONTINUOUS`、`activeCondition TURN_OWNER opponent`、`GRANT_KEYWORD target self count:1`。filter無し単体付与は `execGrantKeyword` が `sourceCardNum` を自動選択するため、任意の味方を選ばない。 | `execGrantKeyword` (`effectExecutor.ts:3629-3632`) | 【絆常】《相手ターン》：【シャドウ（レベル２以下）】 |
| WX25-CP1-051-E2 | AUTO | 偽陽性 | live は前件と同じ自己常在形で、相手ターン条件とシャドウlevelLte 2も保持する。`target.filter.thisCardOnly` が無くても source が候補なら自動付与され、原文の「このシグニ」に一致。 | `execGrantKeyword` の source自動適用 (`effectExecutor.ts:3629`) | 【絆常】《相手ターン》：【シャドウ（レベル２以下）】 |
| WX05-027-E1 | AUTO | 真バグかつ機構待ち | live は `ON_OPP_LIFE_CRASHED` だが `triggerScope` が無い。collector は場の全watcherを列挙し、self scopeで `crashSourceCardNum===watcher` を検査しないため、別シグニがクラッシュしても本効果が積まれる。 | `collectOppLifeCrashedTriggers` (`triggerCollect.ts:3391-3421`); self-source一致ゲートは無し | このシグニが対戦相手のライフクロス１枚をクラッシュしたとき |
| WX18-032-E1 | AUTO | 真バグかつ機構待ち | live は life枚数比較と `UP.thisCardOnly` は正しいが、発火源限定が無い。`ON_OPP_LIFE_CRASHED` collector の比較は `triggerScope:'any_ally'` にしかなく、既定selfが実際のcrasherである保証を作らない。 | `collectOppLifeCrashedTriggers` (`triggerCollect.ts:3410-3417`); self watcher対crashSource照合無し | このシグニが対戦相手のライフクロス１枚をクラッシュしたとき |
| WDK14-012-E1 | AUTO | 偽陽性 | live cost は `beat_signi:1` だけに見えるが、支払い解析は EffectText の「このシグニと他のシグニ1体」を読み `includeSelf:true,otherPart:1` とし、実際に2体をbeat_zoneへ移す。 | `analyzeBeatSigniCost` / `payBeatSigniCost` (`execUtils.ts:1007-1074`) | このシグニと他のシグニ１体を【ビート】にする |
| WXK08-068-E1 | AUTO | 偽陽性 | `cost.beat_signi:1` は他1体だけの総数ではない。共通cost consumerがカード原文から自己分を加算し、self zoneとother zoneの双方を必須にするため指摘の欠落は実行時に補われる。 | `analyzeBeatSigniCost` (`execUtils.ts:1015`) と不足判定 (`:1056`) | このシグニと他のシグニ１体を【ビート】にする |
| WX17-046-E3 | AUTO | 真バグかつ機構待ち | live BANISH は `owner:any,count:'ALL',filter:{cardType:'シグニ',excludeSelf:true}` だけで、原文のsourceとのパワー等値が無い。既存動的filterは `powerLteSelf` 等で、等値キー/readerは見当たらない。 | `resolveDynamicFilter` (`effectExecutor.ts:2341`); powerEqSelf consumerは無し | このシグニと同じパワーを持つ他のすべてのシグニをバニッシュする |
| WXK07-052-E1 | AUTO | 真バグかつ機構待ち | live は相手シグニ1体を無条件候補にする `filter.cardType:'シグニ'`。原文の「このシグニと同じパワー」を表す比較値がなく、現行 `powerLteSelf` では等値条件へ代用できない。 | `resolveDynamicFilter`; source実効powerとの equality filter consumerは無し | このシグニと同じパワーの対戦相手のシグニ１体 |
| WX12-CB01-E1 | AUTO | 偽陽性 | live は `CONTINUOUS POWER_MODIFY_PER_TRASH_COUNT`、龍獣シグニ1枚ごと+1000、attack phase条件を保持する。continuous計算は target単体なら効果ホスト `topNum` に直接加算し、選択UIへ行かない。 | `calcFieldPowers` の PER_TRASH_COUNT (`effectEngine.ts:2076-2104`) | あなたのアタックフェイズの間、このシグニのパワーは…１枚につき＋1000 |
| WXDi-P06-051-E1 | AUTO | 偽陽性 | live は `CONTINUOUS POWER_MODIFY_PER_FIELD`、`countOwner:any`、`excludeSelf:true`。continuous reader は countがALLでない場合ホスト `topNum` にdeltaを適用するので、target filter欠落による他シグニ選択は起きない。 | `calcFieldPowers` の PER_FIELD (`effectEngine.ts:2017-2055`) | このシグニのパワーは他のシグニ１体につき＋1000 |
| WX15-032-E2 | AUTO | 真バグ | live の BANISH filter は `cardType:'シグニ'` のみで、原文の動的上限が欠落。既存 `powerLteSelf:true` は効果元の実効powerを `powerRange.max` に解決できるためJSON/parser側で表現可能。 | `resolveDynamicFilter` の `powerLteSelf` (`effectExecutor.ts:2341-2350`) → `execBanish` | このシグニのパワー以下の対戦相手のシグニ１体 |
| WX25-P3-056-sub-E1 | AUTO | 真バグ | 付与内側effectの BANISH は `filter:{cardType:'シグニ'}` だけ。holderが source として実行されるため `powerLteSelf:true` を読めるが、live にそのキーが無く任意powerを対象化する。 | `resolveDynamicFilter` (`effectExecutor.ts:2341`); `execBanish` | このシグニのパワー以下の対戦相手のシグニ１体 |
| WX17-055-E1 | AUTO | 真バグかつ機構待ち | live は `ADD_TO_FIELD source.TRASH_CARD.filter.thisCardOnly:true` で、場を離れた本体を戻す。原文は離場前にその下にあった非ライズシグニであり、離場後もunder集合を関連付ける情報がeffect/entryに無い。 | `collectLeaveFieldTriggers`; `execAddToField`; 離場直前under snapshot consumerは無し | このシグニの下にあった《ライズアイコン》を持たないシグニ１枚 |
| WXK10-054-E1 | AUTO | 真バグかつ機構待ち | live はトラッシュ全体から `story:'ウェポン'` 1枚を回収するだけ。原文が要求する「バニッシュされたこのシグニの下にあった」集合を限定するfilter/履歴参照が存在せず、無関係なウェポンも取れる。 | `collectBanishTriggers`; `execTransferToHand`; banish前stack-under保持consumerは無し | このシグニの下にあった＜ウェポン＞のシグニ１枚 |
| WX03-023-E1 | AUTO | 偽陽性 | live は activeConditionの相方名と `POWER_SET value:8000,target self count:1` を保持する。continuous POWER_SET readerは単体targetを効果ホストへ適用し、別の自シグニを選ばない。 | `calcFieldPowers` の POWER_SET (`effectEngine.ts:1849`); executor側もsource自動適用 (`effectExecutor.ts:1701`) | このシグニの基本パワーは8000になる |
| WX03-026-E1 | AUTO | 偽陽性 | live の条件は `HAS_CARD_IN_FIELD cardName:'手剣 カクマル'`、設定値は8000。`target.count:1` のcontinuous POWER_SETは `topNum` 自身のbaseを置換する正準形である。 | `calcFieldPowers` POWER_SET (`effectEngine.ts:1849`); `execPowerSet` (`effectExecutor.ts:1677-1710`) | このシグニの基本パワーは8000になる |
| WX25-P2-055-E1 | AUTO | 真バグかつ機構待ち | live は `GRANT_PROTECTION from:['BANISH'],sourceOwner:'opponent'`。continuous collectorは相手効果由来だけを保護する明示実装で、原文の原因無限定「バニッシュされない」より狭く、自分の効果由来を覆えない。 | `collectBanishEffectProtectedSigni` (`effectEngine.ts:4885-4925`); 全source BANISH耐性consumerは無し | このシグニはバニッシュされない |
| WXEX2-38-E1 | AUTO | 真バグかつ機構待ち | live は drive条件を保持するが、耐性payloadは同じく `sourceOwner:'opponent'`。原文はドライブ中のバニッシュ全般を否定し、発生源ownerを限定していないため自己効果バニッシュ経路が残る。 | `collectBanishEffectProtectedSigni` (`effectEngine.ts:4912` の opponent必須ゲート); owner:anyを読む全般耐性配線は無し | 【ドライブ常】：このシグニはバニッシュされない |

## 3. クラスタ所見

- **E001**: 1件目はaction対象のレゾナfilter、2件目はleave-field発火源のレゾナfilterで修正面が異なるが、どちらもレゾナ限定がliveから脱落した真バグ。
- **E002**: WX14は任意コストのowner逆転、WXK09はイベント発生源への照応欠落。共通語「他の」だけで束ねず個別のconsumerへ分けた。
- **E003**: 2件ともエナチャージ後の任意回収actionが完全欠落し、既存ENERGY_CARD回収語彙で表現できる。
- **E004**: 一方はSEQUENCE stepの包み忘れ、他方はchoice availability条件の欠落。`ENERGY_COUNT eq 0` は既存consumerがある。
- **E005**: 2件ともtop/bottom分割を現行LOOK_AND_REORDERが表せず、真バグかつ機構待ち。
- **E006**: `canTrash` は必須1枚を意味しない。SPDiはさらにE005の三分岐も同時に抱え、WXDiはtrash1/down残余の二分岐不足。
- **E007**: WX25は選択主語、WXDiは対象枚数の誤り。どちらもaction固有の既存fieldで直せる。
- **E008**: guardはATTACK phase内のsubstepであり、通常phase条件の否定へ安易に置換できないため両件を機構待ちにした。
- **E009**: WXDi-CP02は捨てたカードのクラス別turn履歴が不足して機構待ち。WXDi-D07は総捨て枚数と相手エナ枚数の既存条件で足りるため分岐した。
- **E010**: 2件とも `SEARCH.maxCount:2` が真の総選択上限で、then actionのcount 1を総数と誤読した偽陽性。
- **E011**: zoneはtrash/energyで別だが、各TRANSFER_TO_HAND分岐に `thisCardOnly` の明示consumerがある真バグ。
- **E012**: 連続GRANT_KEYWORDのfilter無し単体はsourceへ自動適用されるため、2件とも偽陽性。
- **E013**: actionの自己適用（UP.thisCardOnly）とは別にtrigger collectorがcrasher同一性を見ない。両件ともcollector配線待ち。
- **E014**: `beat_signi:1` の表面値ではなくEffectText駆動cost consumerがself+other1を復元しており、2件とも偽陽性。
- **E015**: power以下の既存語彙はあるがpower等値は無い。2件とも同じdynamic equality機構待ち。
- **E016**: runtime executorを類推せずcontinuous計算側を確認した結果、PER_TRASH/PER_FIELDはいずれもhostへ直接適用される偽陽性。
- **E017**: E015と似るがこちらは既存 `powerLteSelf` consumerがあるため、2件とも機構待ちではない真バグ。
- **E018**: 離場/バニッシュ前のstack under集合をイベントentryへ保存する必要があり、単なるtrash filterでは直らない。
- **E019**: POWER_SETの単体continuous正準形がhost自動適用されるため、2件とも偽陽性。
- **E020**: target自己適用自体は成立するが、`sourceOwner:'opponent'` が原文より狭い。全発生源耐性を読む配線が無いため両件を機構待ちとした。

## 4. 機構待ち一覧

- **E005/E006（3 findings・2 effect）**: `LOOK_AND_REORDER` pending/resume に、trash必須最小/最大枚数と、同一公開集合を top / bottom / trash へ分配する配線が必要（`execLookAndReorder` / `resumeLookAndReorder`）。
- **E008（2件）**: `collectHandDiscardTriggers` へ「現在guard substepではない」を判定できるイベント文脈または明示triggerConditionを渡す必要。
- **E009（WXDi-CP02-055-E2）**: `turn_hand_discarded_count` だけでなく、ターン中に捨てたカードのfilter適合（＜ブルアカ＞）を評価する履歴と `evalCondition` consumerが必要。
- **E013（2件）**: `collectOppLifeCrashedTriggers` のself scopeに `watcher === crashSourceCardNum` ゲートを配線する必要。
- **E015（2件）**: `TargetFilter` / `resolveDynamicFilter` に効果元の実効powerとの等値（例 `powerEqSelf`）を追加し、BANISH候補へ適用する必要。
- **E018（2件）**: `collectLeaveFieldTriggers` / banish collector が離場直前stackのunder cardsをsnapshotし、後続TRASH_CARD選択がその集合だけを参照する配線が必要。
- **E020（2件）**: `collectBanishEffectProtectedSigni` と各banish経路へ、`sourceOwner` 無限定の「全原因バニッシュ耐性」を一貫して読む配線が必要。

## 5. 偽陽性件数の自己評価

偽陽性は **10/40 = 25%**、真バグprecision換算は **75%**。パイロットの precision 78〜84%（偽陽性16〜22%）より偽陽性が3〜9ポイント多いが、小標本40件では大きな乖離ではない。内訳も根拠が明確で、SEARCH continuation 2件、BEATのEffectText駆動cost 2件、continuous自己適用6件（GRANT_KEYWORD/PER_POWER/POWER_SET各2件）である。前回の0件とは違い、actionごとの非対称を読んだ結果として慣例エンコード由来の反証が実測できており、偽陽性を無理に作った数字ではない。

## 6. 条件以外で見つけた原文との食い違い

**1件。** `WXDi-D07-017-E1` はfindingが指摘した「このターンにカードを1枚以上捨てていた場合」に加え、同じ原文条件の前半「対戦相手のエナゾーンにカードが2枚以上」もlive JSONから欠落している。ほかは0件。

## 7. ゲート・差分・報告書実読

`npm run gates` は全緑（exit 0）。実測は typecheck PASS / golden **2325/0** / smoke **10693 OK・CRASH 0・HANG 0・INVARIANT 0・SKIP 0** / fuzz **200ゲーム・異常0** / census **783/783** / census:stubs **無言no-op 0・明示defer 0** / manual-fields **0** / lint **0 errors / 260 warnings**。

`git status --short` は作業開始前から指定された `docs/CODEX_GUIDE.md`、`docs/PLAN.md`、`docs/_census_stubs.txt`、`docs/_vocab_census.txt` の M と、既存の未追跡監査成果物群を表示し、今回追加したのは `stage1_batch4_triage.md` だけ。`git diff --stat` は既存tracked差分の **2 files changed, 26 insertions(+), 2 deletions(-)** のままで、新しいtrackedファイルは現れていない。既存ファイルは1文字も編集していない。

報告書を書き終えた後の `wc -c` 実測は **28254 bytes**。その後、先頭20行と末尾20行を `Get-Content -TotalCount 20` / `Get-Content -Tail 20` で実読し、先頭が本見出し・サマリ表、末尾が本節後の§8一覧まで存在しており、`undefined` 1行化や途中欠落がないことを確認した。

## 8. ガードレール2・3・5で当初見立てから変えた件

- **E010 2件**: `ENERGY_CHARGE.count:1` だけなら枚数不足に見えたが、`SEARCH.maxCount:2` と `resumeSearch(picked[])` のconsumerを読んで偽陽性へ変更。
- **E012 2件**: `thisCardOnly` 欠落を真バグとする初見から、`execGrantKeyword` のfilter無しsource自動適用を確認して偽陽性へ変更。
- **E014 2件**: JSONの `beat_signi:1` を額面比較せず、`analyzeBeatSigniCost` が原文からself+otherを復元するため偽陽性へ変更。
- **E016 2件**: runtimeのPER_* executorでは選択が生じ得るが、対象はCONTINUOUSであり `calcFieldPowers` の別consumerがhostへ直適用するため偽陽性へ変更。
- **E019 2件**: `POWER_SET` 固有のsource自動適用を確認し、対象filter不足という当初見立てを反証。
- **E013 2件**: action側の `UP.thisCardOnly` が正しくてもtrigger側self scopeはcrasher照合をしないため、JSON単点修正候補からcollector機構待ちへ変更。
- **E017 2件**: E015のpower等値機構待ちを横展開せず、個別liveが要求する「以下」には `powerLteSelf` consumerがあるため通常の真バグに留めた。

---

# 【Claude 検証】2026-08-21（CODEX_GUIDE §7）

## 🟢 品質が第1・第2バッチ水準へ回復
- **成果物が正常に着地**（28,254 bytes）。ガードレール24（`wc -c` と読み返しの自己申告）が効いた。
- **根拠列がテンプレートでない**＝1行ごとに live JSON の実際のキーと値・原文の該当句・engine の `ファイル:行` が入っている。
- **偽陽性 10/40＝25%**（precision 75%）＝パイロット 78〜84% と同水準。**§5 の自己評価も具体的で、無理に作った数字ではない。**
- ガードレール8 の「当初の見立てから変えた件」が4件申告されている（E015→偽陽性／E019 反証／E013→機構待ち／E017 は真バグに留置）＝**1件ずつ判断している証拠。**

## ゲート独立実行＝ベースライン一致・全緑
golden 2325/0・smoke 10693 OK・fuzz 0・census 783/783・census:stubs 0・manual-fields 0・lint 0 err/260 warn。既存ファイル変更0。

## 偽陽性のサンプリング裏取り＝**2件とも実コードで一致・引用行も正確**
- `WX25-CP1-050-E2`／`-051-E2`（E016 系）＝`execGrantKeyword` の
  `if ((!tgt.filter || tgt.filter.thisCardOnly) && ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) return done(applyGrant([ctx.sourceCardNum], ctx));`
  （`effectExecutor.ts:3629-3631`）を確認。**filter なし単体付与は source 自動適用**＝指摘は誤読。✅
- `WDK14-012-E1`／`WXK08-068-E1`（E014）＝`analyzeBeatSigniCost`（`execUtils.ts:1012-1013`）が
  **`cardMap.get(srcNum)?.EffectText` を regex `/このシグニ(を|と他のシグニ[０-９0-9]*体)[^。：]*【ビート】に/` で読んで `includeSelf` を立てる**ことを確認。
  `cost.beat_signi:1` は「他1体ぶん」で、自分ぶんは実行時に原文から加算される。✅
  ⚠**この機構は JSON を見るだけでは絶対に分からない**（コストが原文駆動）。第3バッチのテンプレ根拠では出てこなかった種類の発見。

## 🔑 3バッチ跨ぎで同じ collector に収束している
**`collectLeaveFieldTriggers` が3回連続で不足配線として挙がった**：
- 第2バッチ＝self スコープループが cause ゲート（`byOpponentEffect`／`byOwnEffect`／`byEffect`）を評価しない → **Opusタスク12 (clii)**
- 第3バッチ D014＝`duringMainPhase` の否定（outsideMainPhase）ゲートが無い
- 第4バッチ E018＝離場直前 stack の under cards を snapshot する配線が無い

⇒ **(clii) は単発ではなく「この collector の self スコープループにゲート群が面で欠けている」課題**として起票し直す。
ソース内コメントが `turnOwner`・`leftStateFilter` でも同じ穴を出した実績を記録しており、**通算5系統目**。

## 🔑 E020「全原因バニッシュ耐性」は第1バッチ C010 と同一課題
`collectBanishEffectProtectedSigni` が `sourceOwner:'opponent'` を必須にする件（`effectEngine.ts:4912`）。
**第1バッチ7件＋第4バッチ2件＝計9件**が同じ表現の正準化待ち。**段2 の前に表現を決める**（PLAN §6.2 既記載）。
