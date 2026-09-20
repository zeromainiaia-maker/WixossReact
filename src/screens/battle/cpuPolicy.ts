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
