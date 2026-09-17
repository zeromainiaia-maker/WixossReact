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
  { id: 'enaCharge', label: 'エナチャージ', pattern: /^\[CPU\] エナチャージ:/, anchor: '[CPU] エナチャージ:' },
  { id: 'grow', label: 'センターのグロウ', pattern: /^\[CPU\] グロウ:/, anchor: '[CPU] グロウ:' },
  { id: 'signiPlace', label: 'シグニ配置', pattern: /^\[CPU\] シグニ配置:/, anchor: '[CPU] シグニ配置:' },
  { id: 'spell', label: 'スペル', pattern: /^\[CPU\] スペルを発動:/, anchor: '[CPU] スペルを発動:' },
  { id: 'arts', label: 'アーツ', pattern: /^\[CPU\] アーツを使用:/, anchor: '[CPU] アーツを使用:' },
  { id: 'signiActivate', label: 'シグニの【起】', pattern: /^\[CPU\] 【起】を発動:/, anchor: '[CPU] 【起】を発動:' },
  { id: 'lrigActivate', label: 'ルリグの【起】', pattern: /^\[CPU\] ルリグの【起】を発動:/, anchor: '[CPU] ルリグの【起】を発動:' },
  { id: 'assistGrow', label: 'アシストルリグのグロウ', pattern: /^\[CPU\] アシストグロウ:/, anchor: '[CPU] アシストグロウ:' },
  { id: 'resona', label: 'レゾナを出す', pattern: /^\[CPU\] レゾナ:/, anchor: '[CPU] レゾナ:' },
  { id: 'rise', label: 'ライズ', pattern: /^\[CPU\] ライズ:/, anchor: '[CPU] ライズ:' },
  { id: 'piece', label: 'ピース', pattern: /^\[CPU\] ピース:/, anchor: '[CPU] ピース:' },
  { id: 'key', label: 'キー', pattern: /^\[CPU\] キー:/, anchor: '[CPU] キー:' },
  { id: 'signiAttack', label: 'シグニアタック', pattern: /^\[CPU\] .+ がアタック$/, anchor: ' がアタック`' },
  { id: 'lrigAttack', label: 'センタールリグのアタック', pattern: /^\[CPU\] ルリグアタック$/, anchor: '[CPU] ルリグアタック' },
  { id: 'assistAttack', label: 'アシストルリグのアタック', pattern: /^\[CPU\] アシストルリグでアタック$/, anchor: '[CPU] アシストルリグでアタック' },
  { id: 'guard', label: 'ガード', pattern: /^\[CPU\] ガードする（/, anchor: '[CPU] ガードする（' },
  { id: 'lifeBurst', label: 'ライフバースト', pattern: /^\[CPU\] ライフクロスをオープン: .*（ライフバースト発動）$/, anchor: '（ライフバースト発動）' },
  { id: 'handLimit', label: '手札上限の捨て札', pattern: /^\[CPU\] 手札上限:/, anchor: '[CPU] 手札上限:' },
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
