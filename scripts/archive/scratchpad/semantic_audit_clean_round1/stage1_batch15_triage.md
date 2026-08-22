# 意味照合監査 clean群 round1 段1 第15バッチ triage（軸「特殊機構」）

## 1. サマリ

### S001〜S016：出現条件群

| 分類 | 件数 | finding |
|---|---:|---|
| 偽陽性（`getRiseFilter` が既に拾う） | 4 | S003, S005, S007, S012 |
| 真バグ（regex が狭い／入口形式を拾わない） | 3 | S008, S013, S014 |
| 機構待ち（複数素材・他ゾーン素材・ハーモニー） | 9 | S001, S002, S004, S006, S009, S010, S011, S015, S016 |

出現条件群は **真バグ12（うち機構待ち9）／偽陽性4／要追調査0**。parser が効果JSONから意図的に除去すること自体は全16件で設計どおりだが、別経路の召喚制約が実際に原文を強制できるかで分類した。

### S017〜S033：通常効果群

| 分類 | 件数 | finding |
|---|---:|---|
| 真バグ | 15 | S018〜S023, S025〜S033 |
| 偽陽性 | 2 | S017, S024 |
| 機構待ち（真バグにも計上） | 4 | S018, S019, S027, S030 |
| 要追調査 | 0 | — |

通常効果群は **真バグ15（うち機構待ち4 findings・3登録単位）／偽陽性2／要追調査0**。全33件の合計は **真バグ27（うち機構待ち13 findings）／偽陽性6／要追調査0**。

## 2. finding 全33件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠（各行固有） | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WXDi-P04-034 | (live無) | 真バグ＋機構待ち | 黒ルリグをダウンしない場合に登場シグニ自身をダウンする二者択一を召喚時に行う経路がなく、`ハーモニー`検索は出現条件アイコン判定とparser除去しかない。 | 無し。必要配線は召喚確定前のHarmony支払い選択→ルリグDOWNまたは登場シグニDOWN。 | `noDeployConditionIcon`はカードの有無を絞るだけで、ハーモニー支払いを実行しない。 | 【ハーモニー】黒のルリグ１体 |
| S002 | WXDi-D09-P16 | (live無) | 真バグ＋機構待ち | 白ルリグ限定のアップ確認・ダウン支払い・不払い時のホタルイカDOWNを処理するconsumerが存在せず、S001と色も対象カードも異なる。 | 無し。Harmony機構に`lrigColor:'白'`と登場カードinstanceを渡す必要がある。 | `EffectCost.lrigDown`は効果発動コスト用で、場出し直後の「しないかぎり」分岐には接続されない。 | 【ハーモニー】白のルリグ１体 |
| S003 | WXDi-P07-091 | (live無) | 偽陽性 | 括弧「（この条件…）」があり、`getRiseFilter`の＜クラス＞regexが`武勇`を`story`へ入れ、召喚先トップ1体を`matchesRiseFilter`で拒否できる。 | `execUtils.ts:2739-2787`→`BattleScreen.tsx:5840-5848`。 | effects JSON不在は`effectParser.ts:11838-11847`の意図的除去であり欠落判定に使えない。 | あなたの＜武勇＞のシグニ１体の上に置く（この条件を満たさなければ場に出せない） |
| S004 | WXK05-035 | (live無) | 真バグ＋機構待ち | 場のアーム1体に加え、エナとトラッシュからアームを各1枚重ねる3素材・3ゾーン条件であり、単一`existingCardNum`しか受けない`matchesRiseFilter`では素材取得も積層も不能。 | 無し。Rise素材選択にfield/energy/trash各sourceとzone別quotaを配線する。 | `energyTrashGroups`や`PLACE_UNDER_SIGNI`は効果解決用で、召喚可否・素材支払いの原子性を保証しない。 | ＜アーム＞のシグニ１体にエナゾーンとトラッシュにある＜アーム＞のシグニ１枚ずつを重ね |
| S005 | WXDi-P11-061 | (live無) | 偽陽性 | 「この条件」括弧までを切り出せ、＜原子＞がclass規則に一致するため、原子でない既存トップへの配置は`matchesFilter(story:'原子')`で弾かれる。 | `getRiseFilter:2745-2747`、`matchesRiseFilter:2776-2787`、召喚側`:5843-5848`。 | ライズを通常actionにする必要はなく、召喚経路が既に制約を消費する。 | あなたの＜原子＞のシグニ１体の上に置く（この条件を満たさなければ場に出せない） |
| S006 | WX16-027 | (live無) | 真バグ＋機構待ち | 武勇2体を同時素材にし一方のゾーンへ出す指定は、候補トップ1枚だけを検査して既存stackを残す現召喚処理では2体目を下敷きへ移せない。 | 無し。複数field zone選択、出現先指定、両stack結合をRise確定処理へ追加する。 | `SelectionConstraint`は通常選択の集合制約で、召喚処理がそれを開始・確定する入口を持たない。 | あなたの＜武勇＞のシグニ２体の上に置く |
| S007 | WXDi-D06-017 | (live無) | 偽陽性 | 括弧形式に一致し、属性指定が無いので`{cardType:'シグニ'}`だけを返すが、空きゾーンを禁止して任意の既存シグニ1体の上だけを許す原文と一致する。 | `BattleScreen.tsx:5843-5848`のexistingTop必須判定。 | filterが属性を持たないことは無制約ではなく「任意のシグニ1体」という正しい制約。 | あなたのシグニ１体の上に置く（この条件を満たさなければ場に出せない） |
| S008 | WX21-Re05 | (live無) | 真バグ | レベル1かつ赤を要求するが「（この条件…）」が無いため先頭regex自体が不一致となり、levelちょうどを評価する前に`null`へ落ち通常シグニとして空きゾーンへ出せる。 | `getRiseFilter:2740-2742`→`BattleScreen.tsx:5849-5852`。 | 色規則は`^あなたの赤の`しか拾わず、本件の語順「あなたのレベル１の赤」には適用されない。 | あなたのレベル１の赤のシグニの上に置く |
| S009 | WXK11-038 | (live無) | 真バグ＋機構待ち | 2素材間で「共通色なし」を比較し両方を下敷きにする必要があるが、現関数は1枚だけを引数にし、隣接`eachDistinctColor`も単体filterでは厳密enforceしない旨が宣言されている。 | 無し。複数Rise選択＋pairwise color constraint＋stack mergeが必要。 | `TargetFilter.eachDistinctColor`は通常選択補助で、現Rise呼出しにはSelectionConstraintも複数candidate確定もない。 | 共通する色を持たないあなたのシグニ２体の上に置く |
| S010 | WXDi-P15-048 | (live無) | 真バグ＋機構待ち | フィールド上の既存トップではなくトラッシュの解放派1枚を選び、空きゾーンで新カードの下へ置く指定なので`existingTop`必須のRise分岐と正反対。 | 無し。trash素材選択→空きzoneへの新stack生成をRise経路へ配線する。 | `PLAY_FREE_FROM_TRASH`は素材自身を場に出す作用であり、新たなライズカードの下へ移す処理ではない。 | トラッシュにある＜解放派＞のシグニ１枚を下に重ねて場に出す |
| S011 | WXK08-031 | (live無) | 真バグ＋機構待ち | 無属性のシグニ2体を要求し、どちらかのゾーンへ両stackをまとめるが、現行はクリックした1zoneのトップしか読まず他zoneの素材を除去しない。 | 無し。2zone素材の選択と選択zoneへのstack統合が必要。 | 空きゾーン禁止だけでは素材数2を保証せず、1体の上へ不正に出せてしまう。 | あなたのシグニ２体の上に置く |
| S012 | WDK06-R11 | (live無) | 偽陽性 | 括弧形式に一致し、条件文先頭が「あなたの赤の」なので色regexが赤を設定し、赤以外の既存シグニを召喚候補から除外する。 | `getRiseFilter:2752-2754`→`matchesFilter`→`BattleScreen:5848`。 | クラス指定が無いのは欠落ではなく、赤であれば種類を問わない原文どおり。 | あなたの赤のシグニ１体の上に置く（この条件を満たさなければ場に出せない） |
| S013 | WX16-059 | (live無) | 真バグ | 「レベル1ちょうど」かつ赤だが括弧がなく`null`になり、さらに実装済みlevel regexは「N以上」専用なので入口を広げるだけでもちょうど条件は生成されない。 | `getRiseFilter:2740,2756-2761`と通常召喚fallback`:5849-5852`。 | `TargetFilter.level:{min,max}`自体は既存なので新機構ではなく、Rise parserのeq生成不足。 | レベル１の赤のシグニ１体の上 |
| S014 | WX18-061 | (live無) | 真バグ | ライズアイコンかつレベル2以下を要求するが括弧無しで全体が`null`、隣接する`__requiresRiseIcon`もlevelは「以上」だけでmaxを作れない。 | `getRiseFilter:2740-2767`、`matchesRiseFilter:2783-2786`。 | `hasRiseIcon/noRiseIcon`は一般filterに存在するが、本カードの召喚入口までfilterが生成されない。 | 《ライズアイコン》を持つあなたのレベル２以下のシグニ１体の上 |
| S015 | WXK11-053 | (live無) | 真バグ＋機構待ち | 赤3体を取り、全素材のlevelが相互に異なることを検査して一stackへ畳む必要があり、単体引数では体数・pairwise level・3zone移動の全てを表せない。 | 無し。3素材Rise選択にcolor赤とdistinct-level constraintを配線する。 | 隣接`eachDistinctLevel`はTODOで厳密enforceされず、そもそもRise召喚が複数選択を作らない。 | それぞれレベルの異なるあなたの赤のシグニ３体の上 |
| S016 | WX20-037 | (live無) | 真バグ＋機構待ち | 赤2体を下敷きにする条件なのに、現経路は1zoneトップの赤判定すら括弧形式不一致で開始せず、2体目のstackを移す処理もない。 | 無し。2素材Rise機構へcolor赤filterを渡して統合する。 | S012の単体色regexは括弧と単一existingTopを前提とするため、本件へ横展開できない。 | あなたの赤のシグニ２体の上に置く |
| S017 | WXDi-P03-085-E1 | AUTO | 偽陽性 | 効果JSONは【出】だけだがカード原文全体を召喚側が読み、括弧付き＜悪魔＞条件を`story:'悪魔'`として強制するため指摘箇所は欠けていない。 | `BattleScreen.tsx:5840-5848`＋`getRiseFilter:2740-2747`。 | action BANISHにRiseを内包させる必要はなく、出現条件は効果と別consumerである。 | 【ライズ】あなたの＜悪魔＞のシグニ１体の上に置く |
| S018 | WX10-001-E2 | AUTO | 真バグ＋機構待ち | `EffectCost.exceed`は枚数numberだけで、支払いUIはセンター・両assist下の全カードを候補にし赤限定を検査する隣接filterが無い。 | `EffectCost`→各Exceed選択UI（例`LrigGrantedModal.tsx:50`、BattleScreen支払い経路）。 | energy/discardの`TargetFilter.color`は別zoneのコストで、exceed素材へは読まれない。 | エクシード１（赤のカード） |
| S019 | WX10-001-E1 | AUTO | 真バグ＋機構待ち | 同じカードの白側能力も`cost:{exceed:1}`のみで、選択したルリグ下カードが白かを確定時に照合するフィールドが存在しない。 | 無し。`exceedFilter`相当を型・全Exceed modal・支払い確定へ共通配線する。 | E2の赤条件と別findingであり、白を能力actionのBOUNCE対象色と解釈する慣例はない。 | エクシード１（白のカード） |
| S020 | SP23-009-E1 | AUTO | 真バグ | choice①は`owner:any,count:1`で、既存`hasIcon:'ライズ'`を付けずself ALLにもしていないため、相手や非Rise1体だけへの付与を許す。 | `GRANT_KEYWORD`候補生成→`matchesFilter`の`hasIcon` (`execUtils.ts:853-860`)。 | choice②の`countOwner:self`はchoice①へowner/count/filterを継承しない。 | 《ライズアイコン》を持つあなたのすべてのシグニ |
| S021 | SP23-009-E1 | AUTO | 真バグ | choice②の`DRAW_PER_FIELD_COUNT.countFilter`はcardTypeだけで、consumerはそのfilterを各場トップへそのまま適用するため非Riseも全て数える。 | `execDrawPerFieldCount` (`effectExecutor.ts:6303-6313`)＋`hasRiseIcon`/`hasIcon` filter。 | choice①側に仮にRise filterを足しても独立choiceのcountFilterへは伝播しない。 | 場にある《ライズアイコン》を持つシグニ１体につき |
| S022 | WD17-018-E1 | AUTO | 真バグ | choice①先頭BANISHはstory武勇だけで、一般filterに既存の`noRiseIcon`があるのに未設定のためRise武勇も支払対象になる。 | `execBanish`候補→`matchesFilter` (`execUtils.ts:786-789`)。 | 後続SEARCHの`hasIcon:'ライズ'`は検索対象専用で、先行BANISHの否定条件にはならない。 | 《ライズアイコン》を持たないあなたの＜武勇＞のシグニ１体 |
| S023 | WD17-018-E1 | AUTO | 真バグ | choice②で自分の武勇をバニッシュするtargetに`hasRiseIcon:true`がなく、原文のRise素材限定を消したまま任意武勇を選べる。 | CHOOSE choice②のBANISH target→`matchesFilter.hasRiseIcon`。 | choice①SEARCHにあるRise条件は別分岐かつdeck sourceで、choice②へ共有されない。 | あなたの《ライズアイコン》を持つ＜武勇＞のシグニ１体 |
| S024 | WX24-P3-054-E1 | AUTO | 偽陽性 | 原文末尾の公式注記はリコレクト4を「ルリグトラッシュに4枚以上のアーツ」と定義し、liveの`cardType:'アーツ',gte:4,excludeSource:true`と一致する。 | `evalCondition LRIG_TRASH_COUNT` (`execUtils.ts:2027-2037`)。 | findingの「カード全般を数える」は注記と矛盾し、filter省略へ直すと非アーツを過剰計数する。 | （リコレクト定義）あなたのルリグトラッシュに４枚以上のアーツ |
| S025 | WX24-D5-07-E1 | AUTO | 真バグ | thenは`owner:self`で、`targetsTriggerSource`はtriggeringCardNumまたはsourceCardNum（使用中アーツ）を解決するだけなので、先に選んだ相手シグニを保持せず自分側候補へ落ちる。 | `execPowerModify:1621-1629`。既存`STORE_LAST_PROCESSED_TARGETS`/`targetsStored`で同一対象を保持可能。 | 起動効果のsourceCardNumは対象シグニではなくアーツであり、「それ」の自動対象慣例は成立しない。 | 代わりにターン終了時まで、それのパワーを－20000する |
| S026 | WXDi-P00-009-E1 | AUTO | 真バグ | 【チーム起】なのに無条件ACTIVATEDで、既存`LRIG_TEAM_COUNT`をactiveConditionへ付けていないためチーム不成立でも赤2枚捨ててドローできる。 | `checkActiveCondition`→`LRIG_TEAM_COUNT` (`execUtils.ts:1856-1861`)。 | カード自身のTeam欄は能力使用時に自動参照されず、effect JSONに条件が必要。 | 【チーム】＜アンシエント・サプライズ＞【チーム起】 |
| S027 | WXDi-P05-008-E1 | AUTO | 真バグ＋機構待ち | 固定`count:1`は左右アシストのlevel合計を読まず、既存`ENERGY_CHARGE_PER_LRIG_LEVEL`もセンタールリグ1体だけを参照する。 | 現consumer `execEnergyChargePerLrigLevel:6330-6337`。必要なのはassist L/R top level合計producer。 | センターlevel比例actionを流用すると参照zoneが違い、アシスト2体の和にならない。 | 場にいるアシストルリグのレベルの合計１につき【エナチャージ１】 |
| S028 | WXK10-014-E1 | AUTO | 真バグ | 原文の付与能力3本のうちliveの`GRANT_EFFECT.effect`はエクシード1・能力喪失だけで、エクシード2・DOWN能力は独立actionとしてもSEQUENCEにも存在しない。 | `execGrantEffect`と付与ACTIVATED collector。3本は既存GRANT_EFFECTをSEQUENCE化可能。 | 1つ目の付与effectが引用内の後続2能力まで暗黙実行する仕組みはない。 | 【起】《アタックフェイズアイコン》エクシード２：…それをダウンする |
| S029 | WX20-024-E1 | AUTO | 真バグ | CONTINUOUS耐性にactiveConditionが無く常時有効だが、既存`FIELD_HAS_CARD`相当は`TargetFilter.hasRiseIcon`で自場Rise存在を表せる。 | continuous収集の`checkActiveCondition`＋`matchesFilter.hasRiseIcon` (`effectEngine.ts:719-722`)。 | `GRANT_PROTECTION.target:self`は保護主体を示すだけで、自場の別Rise存在を暗黙確認しない。 | あなたの場に《ライズアイコン》を持つシグニがあるかぎり |
| S030 | WX24-P2-043-E1 | AUTO | 真バグ＋機構待ち | actionは無色1軽減しか保存せず、Grow候補列挙は通常のルリグタイプ適合を通るため、このターン次回assist growだけタイプを無視するstateが無い。 | `GrowModal`/`AssistGrowModal`候補生成と`collectGrowCostReductions`。タイプ無視用turn flagのproducer/consumerが必要。 | `free_grow_this_turn`はコストを0にする別効果で、タイプ条件だけ無視して《無×1》軽減する本件と同値でない。 | 次にアシストルリグにグロウする場合、グロウするためのルリグタイプは無視され |
| S031 | WXDi-D03-004-E1 | AUTO | 真バグ | NoLimitの【チーム常】が無条件CONTINUOUSになり、既存`LRIG_TEAM_COUNT`を常在効果のactiveConditionへ付けていない。 | continuous収集の`checkActiveCondition`→`LRIG_TEAM_COUNT` (`execUtils.ts:1856-1861`)。 | CardData.Teamを効果元ルリグ自身だけで見る慣例では、場のチーム成立数を保証しない。 | 【チーム】＜NoLimit＞【チーム常】 |
| S032 | WXDi-D02-04L-E1 | AUTO | 真バグ | さんばか不成立でもMAIN起動でき、`POWER_MODIFY`のstoryバーチャルfilterは対象シグニ条件であってルリグ3体のチーム成立条件ではない。 | activated候補の既存condition評価→`LRIG_TEAM_COUNT(team:'さんばか')`。 | target.story:'バーチャル'をTeam名「さんばか」の代用にはできない。 | 【チーム】＜さんばか＞【チーム起】 |
| S033 | WXDi-P01-038-E1 | AUTO | 真バグ | うちゅうのはじまりの【チーム自】がON_ATTACK_PHASE_STARTに無条件収集され、場のルリグTeam数を検査しないまま相手手札を捨てる。 | AUTOの既存condition gate→`LRIG_TEAM_COUNT(team:'うちゅうのはじまり')`。 | `triggerScope:'self'`は能力ホスト側の収集範囲であり、チーム成立を示すフラグではない。 | 【チーム】＜うちゅうのはじまり＞【チーム自】 |

## 3. 所見

### 【ライズ】機構の現状カバレッジ

現行は効果JSONとは別に、召喚時 `getRiseFilter(EffectText)` が原文を読み、クリックされた1zoneの既存トップ1枚を `matchesRiseFilter` へ渡す。拾えるのは、(1) 原文が `/【ライズ】(.+?)（この条件/s` に一致し、(2) 単体素材で、(3) ＜クラス＞・ディソナ・文頭色・レベルN以上・ライズアイコンのいずれか、または属性無指定のシグニ1体である場合に限る。今回実際に成立したのは武勇（S003）、原子（S005）、任意シグニ（S007）、文頭「あなたの赤の」（S012）、および通常効果側の悪魔（S017）。

拾えない条件は二層ある。第一に入口regexの形式制約で、括弧「（この条件…）」を持たないS008/S013/S014は条件全体が`null`になり、通常召喚へフォールバックする。第二に条件語彙の狭さで、レベルN以下・Nちょうど、レベルの後に色が来る語順は生成できない。段2ではまず条件抽出を「次の能力見出しまで」へ一般化し、level `{min/max}`・eq `{min:max}`・色の語順を追加する単体Rise parserバッチとして切れる。

構造制約は別バッチにすべきである。`matchesRiseFilter(existingCardNum:string, ...)`と呼出し側の`existingTopNum`は単体前提で、複数field素材、素材間の共通色なし／level相異、別zone素材、複数stackの統合、出現先zone選択を表せない。これらはregex追加では直らず、Rise payment plan（素材source・quota・selection constraint・destination）を作り、召喚確定を原子的に行う必要がある。

### 通常効果群

ライズアイコンの有無は`hasRiseIcon`/`noRiseIcon`/`hasIcon:'ライズ'`が型とconsumerに既にあり、S020〜S023/S029は機構待ちではなく生成不足である。リコレクトのS024は指摘側が公式注記を読み違えていた。チームも`LRIG_TEAM_COUNT`と既存condition評価経路で表現できるため、S031〜S033は機構待ちにせず生成不足とした（第3バッチD028と同じ判断）。

## 4. 機構待ち一覧

| 登録単位 / findings | 不足語彙・機構・配線 |
|---|---|
| 【ハーモニー】 / S001,S002 | 召喚確定時に指定色のアップ状態ルリグを候補化し、支払えばそのルリグをDOWN、不払い／支払不能なら登場シグニをDOWNするHarmony resolver。既存`EffectCost.lrigDown`は能力コスト経路なので使えない。 |
| 複数・他ゾーン【ライズ】 / S004,S006,S009,S010,S011,S015,S016 | Rise payment planを新設し、field/energy/trash source、zone別quota、複数field stack、`eachDistinctColor`/`eachDistinctLevel`の厳密SelectionConstraint、destination zone、stack mergeを召喚処理へ配線。単体`matchesRiseFilter`の拡張だけでは不可。 |
| 色指定Exceed / S018,S019 | `EffectCost.exceedFilter`相当と、全Exceed候補UI・支払確定への`matchesFilter`配線。最も近い既存は`exceed:number`だが色を保持できない。 |
| アシストlevel合計比例 / S027 | 左右assist topのlevel合計を返すCountRefまたは専用`ENERGY_CHARGE_PER_ASSIST_LRIG_LEVEL_SUM`とexecutor。第13バッチ§4 S034の「center LRIG level producer」と近いが、参照zoneと合算対象が異なるため同一登録にはしない。 |
| 次回assist growのルリグタイプ無視 / S030 | turn-scoped producer、Assist grow候補フィルタconsumer、使用時の1回消費。最も近い`free_grow_this_turn`はコスト全免除で意味が違い、`GROW_COST_REDUCTION`は金額しか消費しない。 |

機構待ちは **13 findings、5登録単位**。単体Riseのregex不足（S008/S013/S014）とチーム条件（S031〜S033）は既存語彙・consumerで直せるため登録しない。

## 5. 偽陽性件数についての自己評価

consumer調査前の事前予測は **偽陽性5〜7件**。effects JSONだけでは判定不能な16件について、括弧付き単体クラス2〜3件、任意単体1件、単体色1件が別召喚経路で救済され、通常効果側にも括弧付き単体Riseが1件あると見た。一方、括弧無しカードが想定より多く、S008/S013/S014は条件語彙以前に`null`へ落ちると予測した。

実測は **6/33＝18.2%** で予測帯の中央。内訳は出現条件4件（S003/S005/S007/S012）、通常効果2件（S017/S024）。単体RiseでもS008/S013/S014を救済扱いせず、regex入口まで照合したこと、逆にS024はlive JSONではなく原文末尾注記を優先したことが、JSON不在／存在だけでの一律分類を避けた点である。

## 6. 条件以外で見つけた原文との食い違い

**0件**。各findingの主論点以外に、新たなaction・対象・枚数・期間の差は確認しなかった。

## 7. ゲート・差分・成果物確認

- `npm run gates`：**全緑**。typecheck PASS／golden **2337/0**／smoke **10693・OK 10693・CRASH 0・HANG 0・INVARIANT 0・SKIP 0**／fuzz **CRASH 0・HANG 0・INVARIANT 0・EXPLOSION 0**／census **773/773**／census:stubs **A🔴0・C0**／manual-fields **0**／lint **0 errors・260 warnings**。
- `git status --short`：作業前からのMは `scripts/archive/semanticAuditLedger.mjs` と `scripts/archive/semanticAuditMkBatchSingles.mjs` の2本だけ。`??`は既存の第8〜第14成果物、第15明細/index、および今回新規の本報告書。指定された計器2本には触れていない。
- `git diff --stat`：計器2本だけで、`semanticAuditLedger.mjs | 7 +++++--`、`semanticAuditMkBatchSingles.mjs | 5 ++++-`、合計 **2 files changed, 9 insertions(+), 3 deletions(-)**。今回のtracked差分は0。
- 分類表は33行、根拠列は **33/33ユニーク（100%）** をPowerShellで機械測定した。
- 報告書はUTF-8。先頭20行と末尾20行を再読し、タイトル・2つのサマリ表・§8末尾が欠落なく閉じることを確認した。最終`wc -c`相当（`Get-Item.Length`）は **26439 bytes**。

## 8. ガードレール2・3・4・7で当初見立てから変えた件

- S008/S013/S014：level条件のregex不足だけと見ていたが、先回りメモの抽出regexを実際に開くと3件とも「（この条件…）」を持たず、条件全体が`null`になることを確認。根因を入口形式＋level/語順不足へ修正した。
- S020〜S023/S029：特殊機構軸のためアイコン語彙不足を疑ったが、隣接フィールド`hasRiseIcon`/`noRiseIcon`/`hasIcon:'ライズ'`と`matchesFilter` consumerを確認し、機構待ちから通常真バグへ変更した。
- S024：findingの説明を初見では採用したが、原文のリコレクト注記が「4枚以上のアーツ」と明記し、liveの`cardType:'アーツ'`が正しいため偽陽性へ変更した。
- S025：`targetsTriggerSource`が「それ」を救済する可能性を検討したが、隣接実装はtriggeringCardNum→sourceCardNumだけで起動効果の先行相手対象を保持しない。偽陽性候補から真バグへ戻した。
- S027：既存`ENERGY_CHARGE_PER_LRIG_LEVEL`を流用できると見たが、consumerはcenter top1体しか読まず左右assist合計ではないため機構待ちへ変更した。
- S031〜S033：`LRIG_TEAM_COUNT`の型とconsumerを確認し、第3バッチD028と同様に既存condition経路で表現可能と判断したため、機構待ち候補から通常真バグへ戻した。
- 先回りメモAW〜BAとの事実上の食い違いは**0件**。ただしAYの「5規則」に加えて、実際の成立可否を左右する前段の括弧形式制約がS008/S013/S014で顕在化した。
