// シグニ同士のバトルの勝敗（§5.6 `C-2` 前哨・2026-09-17）。
//
// 🔑**バトルの公式ルール**（[タカラトミー ルール解説「バトル」](https://www.takaratomy.co.jp/products/wixoss/library/rule/word_051/)）＝
//   「アタックしているシグニのパワーが**相手のシグニのパワー以上**の場合…相手のシグニをバニッシュします。
//    **未満**の場合…**両方のシグニが残ります**」。
//
//   ⇒ **アタッカーがバトルでバニッシュされることは無い**（同値はアタック側の勝ち／格下で殴っても自分は落ちない）。
//
// 🔴**なぜ純関数に切り出したか**＝この規則は `BattleScreen.tsx`（React）に直書きされており、
//   **golden・census・smoke・fuzz のどれも届かない**。実際 `O-47`（2026-08-24）が
//   「パワーが同じ場合は**両方**バニッシュ」という**誤ったルール注記つき**でアタッカーのバニッシュを足し、
//   **3週間以上だれにも検出されなかった**（2026-09-16 にユーザーが遊んで報告＝`bug_reports` b1039d73）。
//   ⇒ **勝敗の判定はここだけに置き、golden で固定する。** `BattleScreen` は結果を使うだけ。
//
// ⚠**`cpuBoardEval.ts` は最初からこの規則どおりだった**（同じ公式ページを引用している）＝
//   CPU の攻撃価値表と engine の実挙動が食い違っていた。**両方ともこの1本を見る。**

/** バトル1回の帰結。**どちらをバニッシュするか**だけを決める（置換・行き先はここでは決めない）。 */
export interface BattleOutcome {
  /** 防御側（正面のシグニ）をバニッシュするか。 */
  banishDefender: boolean;
  /**
   * アタッカーをバニッシュするか。
   * 🔴**公式ルール上は常に `false`**＝バトルでアタッカーが落ちることは無い。
   *   フィールドとして残してあるのは、呼び出し側が「規則を読んだ結果そうなった」ことを明示するため
   *   （`if (false)` を書かない／将来これを変える札が出たらここだけを直せばよい）。
   */
  banishAttacker: boolean;
}

/**
 * アタッカーと防御側のパワーからバトルの帰結を決める。
 *
 * ⚠**パワーは実効値**（`calcFieldPowers` の結果）を渡す。`∞` は `Infinity` で渡す。
 * ⚠**「正面が空」はここへ来ない**＝あれはバトルではなくライフへのアタック（呼び出し側の別分岐）。
 */
export function battleOutcome(attackerPower: number, defenderPower: number): BattleOutcome {
  return {
    // 「以上」＝同値を含む（`>` ではない）。
    banishDefender: attackerPower >= defenderPower,
    // 「未満の場合…両方のシグニが残ります」＝アタッカーは落ちない。
    banishAttacker: false,
  };
}

/**
 * バトルで防御側に**何が起きたか**（`banishDefender` が true のときの実際の帰結）。
 *   - `'banished'`＝バニッシュされた（行き先がエナ以外に変わっても**バニッシュはバニッシュ**）。
 *   - `'replaced'`＝効果でバニッシュが**別の行動に置き換わった**（身代わり／コストを払って残る／ダウンで残る／下のカードを捨てて残る 等）。
 */
export type DefenderBattleResolution = 'banished' | 'replaced';

/**
 * 【ランサー】【Sランサー】のクラッシュが起きるか（§5.6 `C-9`・2026-09-17）。
 *
 * 🔑**公式ルール**（[用語集 word_063「ランサー」](https://www.takaratomy.co.jp/products/wixoss/library/rule/word_063/)・
 *   word_113「Sランサー」・English Rule Guide ver.1.0.0「Lancer」）＝
 *   「ランサーを持つシグニがバトルでシグニをバニッシュしようとした際に、効果などによって**そのバニッシュが他の行動に置き換わった場合**、
 *    ランサーは条件を満たしておらずライフクロスをクラッシュしません。」（Sランサーも同文）
 *
 * 🔴**旧実装**＝`BattleScreen` はバニッシュ置換の11分岐（身代わり／コスト払い／ダウン代替／チャーム盾／アクセ代替／ライズ代替 …）の
 *   **どれを通っても**ランサーのクラッシュを実行していた＝**シグニが場に残ったのにライフが割れていた**。
 *
 * @param hasLancer アタッカーが（適用条件つきを含め）【ランサー】か【Sランサー】を持つ。
 */
export function lancerCrushTriggers(hasLancer: boolean, resolution: DefenderBattleResolution): boolean {
  return hasLancer && resolution === 'banished';
}

/** ログ用の一言（勝敗の言葉を実装と1箇所に揃える）。 */
export function battleOutcomeLabel(attackerPower: number, defenderPower: number): string {
  return battleOutcome(attackerPower, defenderPower).banishDefender
    ? 'バトルに勝利'
    // 🔴**「敗北」と書かない**＝負けても何も起きない（両方残る）ので、
    //   「敗北」はアタッカーが落ちる誤解を招く（`O-47` はその誤解から入った）。
    : 'パワーが足りず、両方のシグニが残る';
}
