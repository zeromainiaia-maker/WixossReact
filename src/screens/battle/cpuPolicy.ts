/**
 * 🆕**CPU のポリシー**（§5.7 `S-9`・2026-09-19）＝**CPU の判断に使う数値を1つの束にまとめたもの**。
 *
 * ■ なぜ要るか＝`S-5` で `npm run selfplay` は通ったが、**両席とも同じ `cpuTurnAction` が同じ定数を読む**ので、
 *   勝率に出るのは**先攻有利と乱数だけ**だった。⇒ **席ごとに違う数値を当てられる**ようにして初めて
 *   「A より B のほうが強い」が測れる（§5.7 `S-9`）。以降の `S-10`〜`S-18` は**全部この口を通して A/B する**。
 *
 * ■ 規律（§5.6.3 のまま）＝ここにあるのは**数値だけ**。可否の判定も実行も書かない。
 *   🔴**「どう判断するか」の分岐をここへ足さない**＝足すなら「新しい数値（閾値・重み）」の形にする。
 *   分岐を flag で持つと、**どの組み合わせが実際に走ったか**が勝率表から読めなくなる。
 *
 * ■ 既定値の在処＝**ここが唯一の正**。`cpuLookahead.BOARD_WEIGHTS` / `SPELL_GAIN_MIN` /
 *   `cpuBoardEval.CPU_KEEP_GUARDS` は**ここから導出した別名**（既存の import と golden を壊さないために残してある）。
 *   ⚠**値を2か所に書かない**＝片方だけ直すと「画面と自己対戦で違う CPU が動く」になる。
 *
 * ⚠**ポリシーを渡さなければ既定**＝`BattleScreen` は渡さないので、**実機の挙動は1ビットも変わらない**。
 */
// 🔴**型だけの import**＝実行時の依存は `cpuCardStrength` → `cpuPolicy` の一方向（循環しない）。
import type { CardFeatures } from './cpuCardStrength';

/**
 * 🆕§5.7 `S-6` 第2段＝**カードの強さ表の重み**（`cpuCardStrength.WEIGHTS` の実体）。
 * 🔴**`CardFeatures` のキーと1対1**＝特徴量を足したのにここへ入れ忘れると型で落ちる。
 * ⚠`--a-set` では **`strength.` を前に付ける**（`strength.removal=9000`）＝`energy`/`search` が `BoardWeights` と衝突するため。
 */
export type StrengthWeights = Record<keyof CardFeatures, number>;

/**
 * 🆕§5.7 `S-6` 第2段＝**デッキの作戦データ（`S-2`）の足し引き**（`cpuDeckPlan.PLAN_WEIGHTS` の実体）。
 * ⚠`--a-set` では **`plan.` を前に付ける**（`plan.keyKeep=10000`）。
 */
export interface PlanWeights {
  /** キーカードをエナ・捨て札にしない。 */
  keyKeep: number;
  /** コンボのパーツを手元に残す。 */
  comboKeep: number;
  /** 優先して出す。 */
  priorityDeploy: number;
  /** コンボの始動札（相方が手札にある）。 */
  comboFirst: number;
  /** コンボの仕上げ札（始動札が場にある）。 */
  comboThenReady: number;
  /** コンボの仕上げ札を温存（始動札が手札にあって、まだ場にいない）＝**負の値**。 */
  comboThenHold: number;
  /** 🆕§5.7 `S-32`＝**狙う札**（効果の対象に指定された固有のカード）への加点。 */
  targetPrefer: number;
  /** 🆕§5.7 `S-32`＝**狙わない札**への減点＝**負の値**。 */
  targetAvoid: number;
}

/** 盤面の採点の重み（パワー換算）。`S-6` の自己対戦で調整する対象。 */
export interface BoardWeights {
  /** ライフクロス1枚。 */
  life: number;
  /** 手札1枚。 */
  hand: number;
  /** エナ1枚。 */
  energy: number;
  /** 正面が空いている（＝ライフへアタックが通る）シグニ1体。除去の大きな価値はここ。 */
  openLane: number;
  /** 相手の凍結しているシグニ1体（次のアップフェイズに起き上がれない）。 */
  oppFrozen: number;
  /**
   * 🆕§5.7 `S-10`＝**場のシグニの生パワーに掛ける係数**（既定 0.25）。
   * 🔴**1.0 にすると「パワーを上げる効果は必ず満額の得」に戻る**＝旧挙動（`legacy-power`）。
   * 🔑0.25 は `cpuCardStrength.WEIGHTS.powerUp` と同じ値＝**「使う前」と「使った後」で同じ値段にする**のが狙い。
   */
  fieldPowerScale: number;
  /**
   * 🆕§5.7 `S-10`＝**正面とのバトルに勝てているレーン1つ**（`cpuAttackValueOf` の `winBattle`）。
   * 🔑パワーの価値の本体はここ＝**勝敗が反転しないバフは（`fieldPowerScale` のぶんを除いて）0 点**になる。
   * 🔴**`openLane` より小さくする**＝正面が空いている（ライフに通る）ほうが、正面に格上で立っている状態より**常に良い**。
   *   同値にすると「正面を除去する」と「単に格上で立つ」が**同点**になり、**除去の価値が消える**
   *   （2026-09-20 に 3000 で試して golden `§5.7 S-4` が落ちて気付いた＝**除去が決まる盤面と決まらない盤面の差が 450 点**になった）。
   */
  laneWin: number;
  /**
   * 🆕§5.7 `S-18`＝**次のグロウのコストがいま払えるか**（払えるなら加点）。
   * 🔑**なぜ要るか**＝旧の採点は `hand:1500` / `energy:1000` の**線形の枚数**だけで、
   *   「エナを使い切って次のターン何もできない」が1点も映らなかった（`S-16` の探索は**エナチャージを −500 と見て「置かない」を選んだ**＝実測）。
   * ⚠**グロウ先が1枚も無いときは加点しない**（払うものが無い＝この項の対象外）。
   */
  growReady: number;
  /** 🆕§5.7 `S-18`＝**手札が0**（次のターンはドローの2枚だけで動く羽目になる）＝**負の値**を入れる。 */
  handEmpty: number;
  /** 🆕§5.7 `S-18`＝手札に残っている【ガード】1枚（`keepGuards` 枚まで数える）＝守りの札を温存する。 */
  guardKept: number;
  /**
   * 🆕§5.7 `S-18`＝**センタールリグのレベル1つ**（＝リミットと出せるシグニのレベルの上限）。
   * 🔴**これが無いとグロウが「エナを払うだけの損」に見える**＝`S-16` の探索が**グロウしない**を選ぶ（2026-09-20 実測）。
   * ⚠**相手のルリグのレベルも引く**（盤面の採点は差で見る＝先にグロウされたら不利）。
   */
  lrigLevel: number;
  /**
   * 🆕§5.7 `S-21`＝**このターンに通るダメージ**（登録票の案①の安い形・既定 0＝従来どおり）。
   *
   * 🔑**なぜ要るか**＝`openLane` は**左右対称**に数えている（自分の空きレーン − 相手の空きレーン）が、
   *   **ターンは対称ではない**＝いまアタックするのは**手番側だけ**。
   *   ⇒ **手番側の空きレーンにだけ上乗せ**する＝「このターンの終端はアタック後」に近づける安い近似。
   * 🔑**これが `S-21` の本命**＝探索が「打たない」を選ぶのは、**盤面へ出す価値が手札1枚より安い**からで、
   *   その差の実体は「出したシグニは**このターンに殃る**」が1点も入っていないこと。
   * 🔑**ダウン・凍結しているシグニは数えない**（殴れない）＝これが【起】の《ダウン》コスト（live 284効果）の値段になる
   *   （`evaluateBoard` は `signi_down` をどこでも見ておらず、《ダウン》は**タダのコスト**に見えていた）。
   * ⚠**アタック制限の付与までは見ていない**＝そこまで見るのは `S-17`。
   * ⚠`ATTACK_ARTS_OP`（相手のターンの応答）では**相手側に上乗せ**する（`isCpuTurn:false`）。
   */
  turnDamage: number;
}

/** 1つの CPU の「強さの設定」＝これを席ごとに変えて勝率を比べる。 */
export interface CpuPolicy {
  /** 勝率表・ログに出る名前（`--a` / `--b` に書く文字列）。 */
  readonly name: string;
  /** 盤面の採点の重み（`cpuLookahead.evaluateBoard`）。 */
  readonly boardWeights: BoardWeights;
  /** スペルを使う価値があるとみなす増分の下限（`cpuSpell.pickCpuMainSpell`）。 */
  readonly spellGainMin: number;
  /** 手札に残す【ガード】の枚数（`cpuBoardEval.pickCpuDeployCard`）。 */
  readonly keepGuards: number;
  /**
   * 🆕§5.7 `S-16`＝**メインフェイズの探索のビーム幅**（`cpuSearch.searchCpuMove`）。**0 なら探索しない**＝従来の優先順。
   * 🔑**分岐 flag ではなく数値**＝どの幅で回した結果かが勝率表から読める（§5.7 `S-9` の規律）。
   * ⚠**既定は 0**＝実機の挙動は変えない。上げる判断は A/B（`--b search`）で行う。
   */
  readonly searchWidth: number;
  /** 🆕§5.7 `S-16`＝探索の深さ（1ターンに続けて打つ手の数の上限）。`searchWidth` が 0 なら使わない。 */
  readonly searchDepth: number;
  /**
   * 🆕§5.7 `S-21`＝**「行動する」側への下駄**（パワー換算・既定 0＝従来どおり）。
   * 登録票の案③「『何もしない』を選ばせない」の**連続版**＝`Infinity` なら候補がある限り必ず打つ。
   * 🔑**案①（`turnDamage`）とは別の軸**＝あちらは「価値の欠落を埋める」、こちらは「欠落を埋めずに行動を優先する」。
   *   **A/B でどちらが効くかを決める**（手で決めない＝登録票）。
   */
  readonly actionBias: number;
  /**
   * 🆕§5.7 `S-17` 第2段＝**アタックの手順も探索で決めるか**（既定 `false`）。
   *
   * 🔴**`searchWidth` と別の switch にした理由（2026-09-20 実測）**＝同じ数値で両方を入切すると
   *   **`S-16`（メイン）と `S-17`（アタック）の勝率を切り分けられない**。
   *   実際、最初に `search` プリセット（＝両方 on）を本物のデッキ（WD13）で A/B したら
   *   **組で 0-4-4＝「A のほうが弱い」**と出たが、**どちらの軸が弱いのか分からなかった**。
   * ⚠**探索が決めるのは順番だけ**（撃つ／撃たないは `cpuTurn.ts` が従来の価値表へ落とす）。
   */
  readonly searchAttacks: boolean;
  /**
   * 🆕§5.7 `S-17` 第3段＝**ライフクロスを1枚割ったときに【ライフバースト】が解決する損**（パワー換算・**既定 0＝見ない**）。
   *
   * 期待損＝`P(バースト) × この値`。確率は**公開ゾーンだけ**から出す（`cpuAttackRisk.lifeBurstProbability`）＝
   * 🔴**伏せ札（相手の山・ライフクロス・手札の中身）は読まない**＝どのバーストが来るかは原理的に分からない。
   * 📏**実測（2026-09-21・実デッキ27／LB 528枚）**＝解決したときの価値は**平均 2,960 / 中央 2,500 / p90 6,000**。
   * ⚠**手で決めない**＝この実測は「A/B に掛ける初期値」であって既定値ではない（`search-attack-burst` プリセット）。
   */
  readonly lifeBurstCost: number;
  /**
   * 🆕§5.7 `S-17` 第3段＝**相手のデッキに入っている【ガード】の想定枚数**（**既定 0＝ガードを見ない**）。
   *
   * ルリグアタックが防がれる確率を**相手の手札の枚数**（公開情報）から出すのに使う（`cpuAttackRisk.guardProbability`）。
   * 📏**実測（2026-09-21・実デッキ27／主デッキ 1,080枚）**＝**204枚（18.9%）＝中央 8/40**。
   * ⚠**全カードの比率（23/6,713＝0.3%）とは桁が違う**＝サーバントは1デッキに固まって入る。
   */
  readonly guardDeckCount: number;
  /**
   * 🆕§5.7 `S-6` 第2段＝**カードの強さ表の重み**（`cpuCardStrength`）。
   * 🔑**なぜ載せたか**＝第1段の篩で**振れるのは49個中20個だけ**と実測した＝**残り29個は調整対象から外れていた**。
   * ⚠**`--a-set` は `strength.` を前に付ける**（`energy`/`search` が `BoardWeights` と同名）。
   */
  readonly strengthWeights: StrengthWeights;
  /**
   * 🆕§5.7 `S-6` 第2段＝**キーワード1つの点数**（`GRANT_KEYWORD` の実測上位）。
   * ⚠**`--a-set` は `keyword.` を前に付ける**（`keyword.ランサー=4000`）。⚠**知らないキーワード名は例外**（打ち間違いを黙って捨てない）。
   */
  readonly keywordValues: Readonly<Record<string, number>>;
  /** 🆕§5.7 `S-6` 第2段＝**作戦データ（`S-2`）の足し引き**。⚠**`--a-set` は `plan.` を前に付ける**。 */
  readonly planWeights: PlanWeights;
  /**
   * 🆕§5.7 `S-6` 第2段＝**手札の【ガード】を手元に置く価値**（`cpuInteraction`＝効果で手札を捨てるときに最後まで残す）。
   * ⚠`keepGuards`（何枚残すか＝召喚側）とは別物。こちらは**捨て札の並び**に効く点数。
   */
  readonly guardKeepValue: number;
  /**
   * 🆕§5.7 `S-26`＝**次のグロウに要る色の札をエナへ回す**優先度（パワー換算・**キープ値からの減点**）。
   * 🔴**なぜ要るか（実測 2026-09-21）**＝**グロウ機会 214 のうち 15（7%）が払えず**、うち**7件は色の問題**
   *   （天使軸1＝エナが無色しか無いのに《白》が要る）。`pickCpuEnergyChargeIndex` は**色を1度も見ていなかった**。
   * 🔑**「グロウしないことがかなりの悪手」**（ユーザー）＝**予約（使わない）だけでなく確保（置きに行く）**が要る。
   */
  readonly chargeGrowColor: number;
  /**
   * 🆕§5.7 `S-26`＝**いまのルリグレベルで出せるシグニが足りないとき、その札を手札に残す**加点（パワー換算）。
   * 🔴**なぜ要るか（実測 2026-09-21）**＝**ターン1（ルリグ Lv0〜1）でレベル1のシグニをエナへ置いている**
   *   （ケトッシー軸＝`Lv1-ルリグLv0` が6回）。結果、**MAIN で空きゾーンがあるのに出せる札が手札に無い盤面が 22/98（22%）**。
   * 🔑**終盤にレベル1を置くのは正しい**（`Lv1-ルリグLv4` は5回＝弱い札）＝**ルリグレベル相対**で決める。
   */
  readonly chargeKeepPlayable: number;
  /**
   * 🆕§5.7 `S-26`＝**当分出せないシグニ**（レベルがルリグレベル＋2以上）のキープ値に掛ける係数。
   * ⚠**旧実装の 0.6 をそのまま数値にしただけ**（既定は挙動不変）。
   */
  readonly chargeFarLevelScale: number;
  /**
   * 🆕§5.7 `S-28`＝**正面に格上がいて場に残しても邪魔なシグニ**を、エナへ回しやすくする減点（パワー換算）。
   * 🔴**0 ならこの機構そのものが止まる**（＝場のシグニは1度もチャージされない＝旧挙動）。
   * 🔑**門は別に2つある**（正面に格上がいる／手札に置き換えがある）＝この数値は**手札と比べる重み**だけを決める。
   * 📏実測＝この条件が立つ ENERGY の盤面は **WD13 56% / WD06 24% / ケトッシー軸 0%**。
   */
  readonly chargeFieldBlocked: number;
  /**
   * 🆕§5.7 `S-22`＝**`thenAction` から損得が読めない対象選択を「置き場（`targetScope`）」で決める**か（0＝旧挙動＝乱数）。
   * 🔴**0 にすると対象宣言が乱数に戻る**（`STUB{SELECT_TARGET_ONLY}` は `thenAction` に印しか持たない）。
   * 📏実測（修正前・本物のデッキ6つ × 1戦）＝CPU が答えた `SELECT_TARGET` **66件のうち32件（48%）が乱数**。
   */
  readonly targetIntentByScope: number;
  /**
   * 🆕§5.7 `S-24`（2026-09-21 ユーザー決定「**マリガンはレベル1を優先して持っておきたい**」）＝
   * **マリガンで確保しに行く「レベル1のシグニ」の枚数**。手札がこれに満たなければ**レベル2のシグニも戻して掘る**。
   * 🔴**0 なら旧規則**（レベル3以上だけを戻す）＝`legacy-mulligan`。
   * ⚠**上げても届かない**＝レベル1は山に12枚しかなく、全部掘っても手札平均2.2枚が上限（実測）。
   */
  readonly mulliganLv1Target: number;
}

/**
 * 🔴**既定のポリシー＝いまの CPU そのもの**（`npm run selfplay` も `BattleScreen` もこれで動く）。
 * ⚠**ここの数値を「良くしよう」として触らない**＝触るときは**必ず A/B（`S-9`）で勝率を測ってから**、
 *   かつ**旧値をプリセットとして残す**（`legacy-*`）＝残さないと後から比較できない。
 * 🆕**変更履歴**＝2026-09-19 新設（`S-9`・当時の定数をそのまま移設）／
 *   2026-09-20 `S-10` で `fieldPowerScale: 0.25` と `laneWin: 3000` を追加（旧値は `legacy-power`）。
 */
export const DEFAULT_CPU_POLICY: CpuPolicy = {
  name: 'default',
  boardWeights: {
    life: 7000, hand: 1500, energy: 1000, openLane: 3000, oppFrozen: 2500, fieldPowerScale: 0.25, laneWin: 1500,
    // 🆕§5.7 `S-18`（2026-09-20）＝次のターンの制約。⚠**手で決めた初期値**＝`S-6`／A/B で調整する対象。
    growReady: 2500, handEmpty: -2000, guardKept: 800, lrigLevel: 2500,
    // 🆕§5.7 `S-21`（2026-09-20）＝**既定 0＝入れる前と同じ振る舞い**。値は A/B で決める（`search-damage` ほか）。
    turnDamage: 0,
  },
  spellGainMin: 1000,
  keepGuards: 1,
  // 🆕🔴§5.7 `S-16`／`S-25`＝**2026-09-21 に既定を 4/4 へ上げた（ユーザー決定）**＝**実機の CPU が探索で打つようになった**。
  //   **根拠（`S-25` の実測・`search` vs `default`・6デッキ × 8シード＝96戦・止まり0）**＝
  //   **合算 組 83.3% [66.4, 92.7]**（強い＝ケトッシー軸 8-0-0／天使軸1 6-2-0／WD06 6-2-0／
  //   差なし＝WD15 3-5-0／WD16 2-5-1／**弱い＝WD13 0-4-4 だけ**）。
  //   ⚠**WD13 系は弱くなる**ことを承知のうえで上げている（原因＝盤面の採点に「アップ」の価値が無い＝§5.7 `S-25` ①）。
  //   🔑**旧値は `legacy-greedy` プリセットに残してある**＝いつでも A/B で戻せる。
  //   ⚠コストは1手あたり **2.4〜4.7ms**（実測・`--census-moves`）＝実機では体感ゼロ。
  searchWidth: 4,
  searchDepth: 4,
  // 🆕§5.7 `S-21`＝**既定 0＝「何もしない」と同点なら打たない**（従来どおり）。
  actionBias: 0,
  // 🆕§5.7 `S-17` 第2段＝**既定はアタックを探索しない**＝挙動不変。A/B で勝率を見てから上げる。
  searchAttacks: false,
  // 🆕§5.7 `S-17` 第3段＝**既定 0＝ライフバースト・ガードの期待損を見ない**（＝第2段と同じ楽観的な近似）。
  //   値は A/B で決める（`search-attack-burst` / `search-attack-guard` / `search-attack-risk`）。
  lifeBurstCost: 0,
  guardDeckCount: 0,
  // 🆕§5.7 `S-6` 第2段（2026-09-21）＝**旧 `cpuCardStrength.WEIGHTS` をそのまま移設**（値は1つも変えていない）。
  strengthWeights: {
    removal: 6000, powerDown: 0.5, powerUp: 0.25, draw: 2500, energy: 1500, search: 2500, summon: 3500,
    disrupt: 2500, handDisrupt: 2500, protection: 2000, lifeCrash: 5000, coin: 1000, keyword: 1, misc: 500,
  },
  // 🆕§5.7 `S-6` 第2段＝**旧 `cpuCardStrength.KEYWORD_VALUE` をそのまま移設**。
  keywordValues: {
    'ランサー': 3000, 'Sランサー': 4000, 'ダブルクラッシュ': 4000, 'トリプルクラッシュ': 6000,
    'アサシン': 3500, 'シャドウ': 2500, 'バニッシュされない': 3000, 'シュート': 2000,
  },
  // 🆕§5.7 `S-6` 第2段＝**旧 `cpuDeckPlan.PLAN_WEIGHTS` をそのまま移設**。
  planWeights: {
    keyKeep: 20000, comboKeep: 4000, priorityDeploy: 4000,
    comboFirst: 5000, comboThenReady: 8000, comboThenHold: -8000,
    // 🆕§5.7 `S-32`（2026-09-21 ユーザー要望）＝**対象の狙い方**。
    //   🔑**既定の作戦は空なので挙動は変わらない**（指定したデッキだけ動く）。
    //   値は `keyKeep`（20000＝手元に残す価値）より小さく、`comboThenReady`（8000）より大きい桁に置いた
    //   ＝**「この札を狙え」は強さの差（パワー数千）を覆すが、手元に残す判断ほどは強くない**。
    targetPrefer: 12000, targetAvoid: -12000,
  },
  // 🆕§5.7 `S-6` 第2段＝**旧 `cpuInteraction.CPU_GUARD_KEEP_VALUE` をそのまま移設**。
  guardKeepValue: 8000,
  // 🆕§5.7 `S-26`（2026-09-21）＝**エナチャージの選び方**。🔴**既定を 0 にしない**＝これは調整つまみではなく
  //   **実測したバグの修正**（グロウ機会の7%が払えない／出せる札が無い盤面が最大22%）。
  //   ⚠**実機の挙動が変わる回**＝自己対戦の乱数列も動くので、この回にベースラインを撮り直す。
  //   🔑値の根拠＝どちらも `guardKeepValue`（8000＝【ガード】を手元に置く価値）と同じ桁に置いた＝
  //   **「グロウできない」「出す札が無い」は【ガード】を捨てるのと同じくらい避けたい**、という序列。
  chargeGrowColor: 8000,
  chargeKeepPlayable: 8000,
  // 旧実装の 0.6 をそのまま（挙動不変）。
  chargeFarLevelScale: 0.6,
  // 🆕§5.7 `S-28`（2026-09-21）＝**場のシグニをエナへ置く**。値は `guardKeepValue` と同じ桁に置いた
  //   （＝「バトルで落ちる札を残す」ことは【ガード】を捨てるのと同じくらい避けたい、という序列）。
  chargeFieldBlocked: 8000,
  // 🆕§5.7 `S-22`（2026-09-21）＝**既定で有効**。🔴これは調整つまみではなく**実測したバグの修正**
  //   （対象選択の 48% が乱数で、最大の塊は「宣言の後ろでバニッシュされる相手のシグニ」を乱数で選んでいた）。
  //   ⚠**実機の挙動が変わる回**＝自己対戦の乱数列も動くので、この回にベースラインを撮り直す。
  targetIntentByScope: 1,
  // 🆕§5.7 `S-24`（2026-09-21 ユーザー決定）＝**レベル1を2枚は持っておく**（足りなければレベル2も戻して掘る）。
  mulliganLv1Target: 2,
};

/** ポリシーを1項目だけ差し替える（プリセットの定義用）。 */
const variant = (name: string, over: Partial<Omit<CpuPolicy, 'name'>>): CpuPolicy =>
  ({ ...DEFAULT_CPU_POLICY, ...over, name });

/**
 * 名前つきプリセット。
 *
 * ■ 2種類ある（混ぜない）
 *   - **自己検査用**（`no-spell` / `no-guard-keep` / `ignore-life`）＝**強い CPU の候補ではない**。
 *     どれも既定より弱くなるはずの方向へ振ってあり、**A/B が「差を検出できる」ことを確かめる**ために使う
 *     （差が出ないなら配線が死んでいる）。
 *   - 🆕**旧実装**（`legacy-*`）＝**その項目を入れる前の CPU**。A/B の A 側。⚠**消さない**。
 * 🔑**新しい候補を足すときは、ここに名前つきで足して `--b <名前>` で当てる。**
 */
export const CPU_POLICIES: Record<string, CpuPolicy> = {
  default: DEFAULT_CPU_POLICY,
  /** スペルを一切使わない（増分がこの下限に届かない）＝配線の自己検査用。 */
  'no-spell': variant('no-spell', { spellGainMin: Number.POSITIVE_INFINITY }),
  /** 【ガード】を手札に残さず全部場に出す＝配線の自己検査用。 */
  'no-guard-keep': variant('no-guard-keep', { keepGuards: 0 }),
  /** ライフの価値を見ない（盤面の物量だけで判断する）＝配線の自己検査用。 */
  'ignore-life': variant('ignore-life', { boardWeights: { ...DEFAULT_CPU_POLICY.boardWeights, life: 0 } }),
  /**
   * 🆕§5.7 `S-10` の **A 側＝2026-09-20 以前の盤面の採点そのもの**（生パワーを係数1.0 で加算・バトルの閾値項なし）。
   * 🔴**これは自己検査用ではなく「旧実装」**＝`S-10` の A/B（`--a legacy-power --b default`）で使う。
   * ⚠**消さない**＝消すと `S-10` の判断が再現できなくなる（`S-6` が重みを動かしたあとでも旧点との比較が要る）。
   */
  'legacy-power': variant('legacy-power', {
    boardWeights: { ...DEFAULT_CPU_POLICY.boardWeights, fieldPowerScale: 1, laneWin: 0 },
  }),
  /**
   * 🆕§5.7 `S-18` の **A 側＝「次のターン」項を入れる前の採点**（枚数の線形だけ）。
   * ⚠**消さない**＝`S-18` の A/B（`--a legacy-nextturn --b default`）で使う。
   */
  /**
   * 🆕§5.7 `S-16` の **B 側＝メインフェイズをビーム探索で決める CPU**（幅4・深さ4＝`--census-moves` の実測値）。
   * ⚠**探索が扱えない手**（アシストグロウ・レゾナ・ライズ・キー／ピース）は**従来の優先順のまま**。
   */
  search: variant('search', { searchWidth: 4, searchDepth: 4 }),
  /**
   * 🆕🔴§5.7 `S-25`（2026-09-21）＝**探索を入れる前の CPU（貪欲な優先順）**＝**既定を 4/4 へ上げたときの A 側**。
   * ⚠**消さない**＝「探索を入れて弱くなった」を後から測り直す唯一の口（`--a legacy-greedy --b default`）。
   */
  'legacy-greedy': variant('legacy-greedy', { searchWidth: 0, searchDepth: 0 }),
  /**
   * 🆕§5.7 `S-17` 第2段＝**メインの探索に加えてアタックの手順も探索する**。
   * 🔑**A/B の相手は `search`**（`default` ではない）＝**アタック探索だけの差**が出る。
   */
  'search-attack': variant('search-attack', { searchWidth: 4, searchDepth: 4, searchAttacks: true }),
  /**
   * 🆕§5.7 `S-17` 第3段＝**アタックの期待損を確率で見る**3本。🔑**A/B の相手は `search-attack`**（`default` ではない）
   *   ＝**第3段だけの差**が出る（第2段の混入を避ける＝`searchAttacks` を別 switch にしたのと同じ理由）。
   * ⚠**数値は実測の中央値**（LB の解決価値 2,500／デッキのガード 8枚）＝**手で「良さそうな値」を選んでいない**。
   */
  'search-attack-burst': variant('search-attack-burst', { searchWidth: 4, searchDepth: 4, searchAttacks: true, lifeBurstCost: 2500 }),
  'search-attack-guard': variant('search-attack-guard', { searchWidth: 4, searchDepth: 4, searchAttacks: true, guardDeckCount: 8 }),
  'search-attack-risk': variant('search-attack-risk', { searchWidth: 4, searchDepth: 4, searchAttacks: true, lifeBurstCost: 2500, guardDeckCount: 8 }),
  /** 🆕幅を広げた版（コストと勝率の関係を見る用）。 */
  'search-wide': variant('search-wide', { searchWidth: 8, searchDepth: 6 }),
  /**
   * 🆕§5.7 `S-16`＝**探索 ＋ 場のシグニを満額で数える**（`fieldPowerScale: 1`）。
   * 🔑**仮説の切り分け用**＝探索を入れると弱くなる（実測 27.5%）原因が「**召喚が損に見える**
   *   （手札 1500 ＞ 生パワー3000 の 0.25 倍＝750）」なのかを確かめる。
   */
  'search-power': variant('search-power', {
    searchWidth: 4, searchDepth: 4,
    boardWeights: { ...DEFAULT_CPU_POLICY.boardWeights, fieldPowerScale: 1 },
  }),
  /**
   * 🆕🔴§5.7 `S-26`（2026-09-21）＝**エナチャージが「強さだけ」で選んでいた頃の CPU**＝A/B の A 側。
   * ⚠**消さない**＝「ターンをまたいだチャージにして弱くなった」を後から測り直す唯一の口
   *   （`--a legacy-charge --b default`）。
   * 📏直した根拠＝**グロウ機会 214 のうち 15（7%）が払えず**（色7／枚数8）、
   *   **MAIN で空きゾーンがあるのに出せる札が手札に無い盤面が 22/98（22%）**（ケトッシー軸）。
   */
  'legacy-charge': variant('legacy-charge', { chargeGrowColor: 0, chargeKeepPlayable: 0, chargeFieldBlocked: 0 }),
  /**
   * 🆕§5.7 `S-28`＝**場のシグニをエナへ置く前の CPU**＝A/B の A 側（`--a legacy-fieldcharge --b default`）。
   * ⚠**消さない**＝この機構だけを切り分けて測り直す唯一の口。
   */
  'legacy-fieldcharge': variant('legacy-fieldcharge', { chargeFieldBlocked: 0 }),
  /** 🆕§5.7 `S-22` を入れる前＝`thenAction` で読めない対象選択は乱数（対象宣言が全部ここに落ちていた）。 */
  'legacy-targetrandom': variant('legacy-targetrandom', { targetIntentByScope: 0 }),
  /** 🆕§5.7 `S-24` を入れる前のマリガン規則＝レベル3以上だけを戻す（レベル2は掘らない）。 */
  'legacy-mulligan': variant('legacy-mulligan', { mulliganLv1Target: 0 }),
  'legacy-nextturn': variant('legacy-nextturn', {
    boardWeights: { ...DEFAULT_CPU_POLICY.boardWeights, growReady: 0, handEmpty: 0, guardKept: 0, lrigLevel: 0 },
  }),
  // ─── 🆕§5.7 `S-21`＝探索の目的関数の候補（どれも `search` を A 側にして比べる）───
  /**
   * 🆕**案①＝このターンに通るダメージを終端に入れる**（`turnDamage`）。
   * 🔑**手番側の空きレーンにだけ上乗せ**する＝「出したシグニはこのターンに殴る」を価格に入れる。
   * 初期値 3000＝`openLane` と同額（合計 6000＝ライフ 7000 の 0.86枚分）。⚠**手で決めた初期値**。
   */
  'search-damage': variant('search-damage', {
    searchWidth: 4, searchDepth: 4,
    boardWeights: { ...DEFAULT_CPU_POLICY.boardWeights, turnDamage: 3000 },
  }),
  /**
   * 🆕**案③＝「何もしない」を選ばせない**（`actionBias: Infinity`）。
   * 🔑**候補が1つでも適用できたら必ず打つ**＝行動の中の最善だけを比べる。
   * ⚠**上限の検査**でもある＝これが負けるなら「打つこと自体が損」の盤面が実在する。
   */
  'search-act': variant('search-act', { searchWidth: 4, searchDepth: 4, actionBias: Number.POSITIVE_INFINITY }),
  /** 🆕**案③の控えめ版**＝「少しぐらい損でも打つ」（手札1枚分＝1500）。 */
  'search-act-mild': variant('search-act-mild', { searchWidth: 4, searchDepth: 4, actionBias: 1500 }),
  /** 🆕**案①＋③**＝価値の欠落を埋めつつ、同点なら打つ側へ寄せる。 */
  'search-damage-act': variant('search-damage-act', {
    searchWidth: 4, searchDepth: 4, actionBias: 1500,
    boardWeights: { ...DEFAULT_CPU_POLICY.boardWeights, turnDamage: 3000 },
  }),
  /**
   * 🆕**案①を探索なしで**＝`turnDamage` は `evaluateBoard` の項なので
   *   **従来の貪欲な選択（召喚・スペル・アーツ）にも効く**。探索の効果と分けて測るための側。
   */
  'damage-only': variant('damage-only', {
    boardWeights: { ...DEFAULT_CPU_POLICY.boardWeights, turnDamage: 3000 },
  }),
};

/** 名前からポリシーを引く。⚠**知らない名前は黙って既定に落とさない**（A と B が同じものになって勝率が無意味になる）。 */
export function resolveCpuPolicy(name: string): CpuPolicy {
  const p = CPU_POLICIES[name];
  if (!p) throw new Error(`unknown CPU policy: ${name}（使えるのは ${Object.keys(CPU_POLICIES).join(' / ')}）`);
  return p;
}

/**
 * 🆕§5.7 `S-25` ①／`S-6`＝**ポリシーの数値を名前で差し替える**（`"fieldPowerScale=1,openLane=1500"`）。
 *
 * 🔑**なぜ要るか**＝いままで仮説を1つ試すたびに `CPU_POLICIES` へプリセットを足していた＝
 *   **コードを変えないと測れない**＝重みの調整（`S-6`）が1歩も進まない。
 * 🔴**知らないキーは例外**（`resolveCpuPolicy` と同じ規律）＝打ち間違いが「既定のまま測った」に化けない。
 * ⚠**`boardWeights` のキーが先**（`life`／`openLane`／`fieldPowerScale` …）＝同名はポリシー側に無い。
 * ⚠**数値だけ**（`searchAttacks` のような真偽値は `1`／`0` で書く）。
 * ⚠**名前は `<元の名前>+<差分>`** になる＝勝率表にどの数値で回したかが残る（`S-9` の規律）。
 */
export function patchCpuPolicy(base: CpuPolicy, spec: string): CpuPolicy {
  const parts = spec.split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length === 0) return base;
  let weights = { ...base.boardWeights };
  // 🆕§5.7 `S-6` 第2段＝接頭辞つきの3群（`BoardWeights` と同名のキーがあるので名前空間を分ける）。
  let strength = { ...base.strengthWeights };
  let keywords = { ...base.keywordValues };
  let planW = { ...base.planWeights };
  const top: Record<string, number | boolean> = {};
  for (const part of parts) {
    const [rawKey, rawVal] = part.split('=');
    const key = (rawKey ?? '').trim();
    const num = Number((rawVal ?? '').trim());
    if (!key || rawVal === undefined || !Number.isFinite(num)) {
      throw new Error(`CPU policy override の書き方: "key=数値[,key=数値…]"（受け取った: ${part}）`);
    }
    // 🔴**接頭辞つきは「知らない名前なら例外」**＝打ち間違いが「既定のまま測った」に化けない（下の既定の規律と同じ）。
    if (key.startsWith('strength.')) {
      const k = key.slice('strength.'.length);
      if (!(k in strength)) throw new Error(`unknown strength weight: ${k}（${Object.keys(strength).join(' / ')}）`);
      strength = { ...strength, [k]: num }; continue;
    }
    if (key.startsWith('keyword.')) {
      const k = key.slice('keyword.'.length);
      if (!(k in keywords)) throw new Error(`unknown keyword: ${k}（${Object.keys(keywords).join(' / ')}）`);
      keywords = { ...keywords, [k]: num }; continue;
    }
    if (key.startsWith('plan.')) {
      const k = key.slice('plan.'.length);
      if (!(k in planW)) throw new Error(`unknown plan weight: ${k}（${Object.keys(planW).join(' / ')}）`);
      planW = { ...planW, [k]: num }; continue;
    }
    if (key in weights) { weights = { ...weights, [key]: num }; continue; }
    if (key === 'searchWidth' || key === 'searchDepth' || key === 'spellGainMin' || key === 'keepGuards' || key === 'actionBias'
      || key === 'lifeBurstCost' || key === 'guardDeckCount' || key === 'guardKeepValue'
      || key === 'chargeGrowColor' || key === 'chargeKeepPlayable' || key === 'chargeFarLevelScale'
      || key === 'chargeFieldBlocked' || key === 'targetIntentByScope' || key === 'mulliganLv1Target') {
      top[key] = num; continue;
    }
    if (key === 'searchAttacks') { top[key] = num !== 0; continue; }
    throw new Error(`unknown CPU policy key: ${key}（重み＝${Object.keys(base.boardWeights).join(' / ')}`
      + ` ／ ポリシー＝searchWidth / searchDepth / spellGainMin / keepGuards / actionBias / searchAttacks`
      + ` / lifeBurstCost / guardDeckCount / guardKeepValue / chargeGrowColor / chargeKeepPlayable / chargeFarLevelScale / chargeFieldBlocked / targetIntentByScope / mulliganLv1Target`
      + ` ／ 接頭辞つき＝strength.<${Object.keys(base.strengthWeights).join('|')}>`
      + ` / plan.<${Object.keys(base.planWeights).join('|')}> / keyword.<キーワード名>）`);
  }
  return {
    ...base, ...top, boardWeights: weights, strengthWeights: strength, keywordValues: keywords, planWeights: planW,
    name: `${base.name}+${parts.join(',')}`,
  };
}
