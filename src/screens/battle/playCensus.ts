// 機構踏破計器（§5.6 `C-3`・2026-09-17）＝**1戦で CPU がどの機構を何回踏んだか**を対戦ログから数える。
//
// 🔑**§5.6 の唯一の進捗指標**＝census／golden／意味照合は静的に読むので、CPU が機構を踏むようになっても動かない。
//   止め時（§5.6.4）＝**この表が全機構 ≥1回** かつ 連続3バッチで新しい型0。
//
// 🔴**ログの文言が契約**＝規則は `BattleScreen.tsx` が出す `[CPU] …` 行の正規表現。文言を変えると**黙って0件**になるので、
//   各規則は `anchor`（ソースにそのまま現れる部分文字列）を持ち、golden がソースに残っていることを確かめる（`§5.6 C-3`）。
//   ⚠規則を足すときは anchor も足す。まだ CPU が踏めない機構は `pending` に `C-nn` を書く（anchor の検査から外れ、表では「未実装」と出る）。
//
// ⚠**CPU 側だけを数える**＝人間の操作は人間が踏むので発見器として要らない（§5.6.0「踏まれないのは CPU 側の半分だけ」）。
//   CPU 戦のログは全部人間のクライアントが書くので `user_id` では区別できない＝`[CPU]` 接頭辞で区別する。

export interface PlayMechanism {
  id: string;
  label: string;
  pattern: RegExp;
  /** `src/screens/` のソースにそのまま現れる部分文字列（文言の変更を golden で捕まえる）。 */
  anchor: string;
  /** CPU がまだこの機構を踏めない（`C-nn`）。表では「未実装」と出し、未踏の判定から外す。 */
  pending?: string;
}

export const PLAY_MECHANISMS: PlayMechanism[] = [
  { id: 'mulligan', label: 'マリガン（引き直し）', pattern: /^\[CPU\] 引き直し/, anchor: '[CPU] 引き直し' },
  { id: 'assistPlace', label: 'アシストルリグの配置', pattern: /^\[CPU\] アシストルリグを配置:/, anchor: '[CPU] アシストルリグを配置:' },
  // 🆕🔴§5.7 `S-26`（2026-09-21）＝**グロウ先はあるのにエナで払えなかった回数**＝**0 が正**（多いほど悪い）。
  //   🔑**「グロウしないことがかなりの悪手」**（ユーザー）なのに、この失敗はどの計器にも映っていなかった。
  //   実測（修正前・6デッキ × 4戦）＝**グロウ機会 214 のうち 15（7%）**（色7／枚数8）。
  { id: 'growUnpayable', label: '🔴グロウできない（エナ不足）＝少ないほど良い', pattern: /^\[CPU\] グロウできない（エナ不足）/, anchor: '[CPU] グロウできない（エナ不足）' },
  // 🆕🔴§5.7 `S-22`（2026-09-21）＝**効果の意味も置き場も読めず乱数で決めた対象選択**＝**0 が正**（多いほど悪い）。
  //   実測（修正前・本物のデッキ6つ × 1戦）＝CPU が答えた `SELECT_TARGET` **66件のうち32件（48%）が乱数**
  //   （選ぶ余地があったのは22件）。最大の塊は**対象宣言**（`thenAction` が `INTERNAL_NOOP`＝帰結は後続のステップ）。
  { id: 'targetRandom', label: '🔴対象を乱数で選んだ＝少ないほど良い', pattern: /^\[CPU\] 対象を乱数で選んだ/, anchor: '[CPU] 対象を乱数で選んだ' },
  { id: 'enaCharge', label: 'エナチャージ', pattern: /^\[CPU\] エナチャージ:/, anchor: '[CPU] エナチャージ:' },
  // 🆕🔴§5.7 `S-28`（2026-09-21・ユーザー指摘）＝**場のシグニをエナへ置いた回数**＝
  //   **人間は前から出来たのに CPU は一度も踏んだことが無かった**機構。
  //   🔑**正面に格上がいて邪魔なシグニ**をチャージに回すと、**手札を減らさずレーンを空けられる**。
  { id: 'enaChargeField', label: '🆕エナチャージ（場のシグニ）', pattern: /^\[CPU\] エナチャージ（場のシグニ:/, anchor: '[CPU] エナチャージ（場のシグニ:' },
  { id: 'grow', label: 'センターのグロウ', pattern: /^\[CPU\] グロウ:/, anchor: '[CPU] グロウ:' },
  { id: 'signiPlace', label: 'シグニ配置', pattern: /^\[CPU\] シグニ配置:/, anchor: '[CPU] シグニ配置:' },
  { id: 'spell', label: 'スペル', pattern: /^\[CPU\] スペルを発動:/, anchor: '[CPU] スペルを発動:' },
  { id: 'arts', label: 'アーツ', pattern: /^\[CPU\] アーツを使用:/, anchor: '[CPU] アーツを使用:' },
  { id: 'signiActivate', label: 'シグニの【起】', pattern: /^\[CPU\] 【起】を発動:/, anchor: '[CPU] 【起】を発動:' },
  { id: 'lrigActivate', label: 'ルリグの【起】', pattern: /^\[CPU\] ルリグの【起】を発動:/, anchor: '[CPU] ルリグの【起】を発動:' },
  // 🆕§5.7 `S-7`＝場以外の【起】（トラッシュ／手札／エナゾーン）。
  { id: 'offFieldActivate', label: '場以外の【起】（トラッシュ・手札・エナ）', pattern: /^\[CPU\] (トラッシュ|手札|エナゾーン)の【起】を発動:/, anchor: '[CPU] ${zoneJa}の【起】を発動:' },
  // 🆕§5.6 `C-10` 第2段（2026-09-22）＝**スペル／ピースへのカットイン応答**。
  //   🔴旧は「CPU は常にパス」＝**この窓ごと踏んでいなかった**（61カード／ユーザー作27デッキ中7デッキが該当）。
  { id: 'cutin', label: 'カットイン応答', pattern: /^\[CPU\] カットイン:/, anchor: '[CPU] カットイン:' },
  { id: 'assistGrow', label: 'アシストルリグのグロウ', pattern: /^\[CPU\] アシストグロウ:/, anchor: '[CPU] アシストグロウ:' },
  { id: 'resona', label: 'レゾナを出す', pattern: /^\[CPU\] レゾナ:/, anchor: '[CPU] レゾナ:' },
  { id: 'rise', label: 'ライズ', pattern: /^\[CPU\] ライズ:/, anchor: '[CPU] ライズ:' },
  { id: 'piece', label: 'ピース', pattern: /^\[CPU\] ピース:/, anchor: '[CPU] ピース:' },
  { id: 'key', label: 'キー', pattern: /^\[CPU\] キー:/, anchor: '[CPU] キー:' },
  { id: 'signiAttack', label: 'シグニアタック', pattern: /^\[CPU\] .+ がアタック$/, anchor: ' がアタック`' },
  { id: 'lrigAttack', label: 'センタールリグのアタック', pattern: /^\[CPU\] ルリグアタック$/, anchor: '[CPU] ルリグアタック' },
  // 🆕§5.7 `S-17` 第3段＝**「撃たない」判断の回数**（登録票の止め時＝これが測れること）。
  // 🔴**`pending` の意味がここだけ違う**＝実装は在る（`cpuTurn.ts`）が、**既定のポリシーが期待損を見ない**
  //   （`lifeBurstCost: 0` / `guardDeckCount: 0`）ので**踏まない**＝未踏に数えると §5.6 の止め時が永久に閉じない。
  //   ⚠その代わり anchor はここでは検査されないので、**golden `§5.7 S-17 第3段` が別に固定している**。
  { id: 'attackDecline', label: 'アタックしない判断（§5.7 S-17 第3段・既定オフ）', pattern: /^\[CPU\] アタックしない（損と判定/, anchor: '[CPU] アタックしない（損と判定: ', pending: 'S-17' },
  { id: 'assistAttack', label: 'アシストルリグのアタック', pattern: /^\[CPU\] アシストルリグでアタック$/, anchor: '[CPU] アシストルリグでアタック' },
  { id: 'guard', label: 'ガード', pattern: /^\[CPU\] ガードする（/, anchor: '[CPU] ガードする（' },
  { id: 'lifeBurst', label: 'ライフバースト', pattern: /^\[CPU\] ライフクロスをオープン: .*（ライフバースト発動）$/, anchor: '（ライフバースト発動）' },
  { id: 'handLimit', label: '手札上限の捨て札', pattern: /^\[CPU\] 手札上限:/, anchor: '[CPU] 手札上限:' },
  // 🆕§5.6 `C-8`＝対話の選択肢の**両側**（する／断る）。旧実装は「押せる先頭」固定で片側しか踏まなかった。
  { id: 'chooseAccept', label: '選択肢：する側', pattern: /^\[CPU\] 選択: (?!.*（断る）$)/, anchor: '[CPU] 選択: ' },
  { id: 'chooseDecline', label: '選択肢：断る側', pattern: /^\[CPU\] 選択: .*（断る）$/, anchor: "'（断る）'" },
];

export interface PlayCensusRow {
  mechanism: PlayMechanism;
  count: number;
}

/** ログの行（`GameLog.action`）を機構ごとに数える。1行は最初に当たった1機構だけに数える。 */
export function tallyPlayMechanisms(lines: string[]): PlayCensusRow[] {
  const counts = new Map<string, number>(PLAY_MECHANISMS.map(m => [m.id, 0]));
  for (const line of lines) {
    const hit = PLAY_MECHANISMS.find(m => m.pattern.test(line));
    if (hit) counts.set(hit.id, (counts.get(hit.id) ?? 0) + 1);
  }
  return PLAY_MECHANISMS.map(mechanism => ({ mechanism, count: counts.get(mechanism.id) ?? 0 }));
}

/** 未踏（実装済みなのに0回）の機構。§5.6.4 の止め時①は「これが空」。 */
export function unvisitedMechanisms(rows: PlayCensusRow[]): PlayMechanism[] {
  return rows.filter(r => r.count === 0 && !r.mechanism.pending).map(r => r.mechanism);
}
