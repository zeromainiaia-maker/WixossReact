import { collectTrashTriggers as pureCollectTrashTriggers, type TrigCtx } from '../../../engine/triggerCollect';
import { getCardNum } from '../../../engine/execUtils';
import type { CardData, PlayerState, StackEntry } from '../../../types';
import { clearEndOfAttackEffects } from '../attackDuration';
import { clearZoneOnSigniLeave } from '../leaveFieldZone';

/**
 * 🆕**リムーブの実行**（2026-10-25・CPU がリムーブを使うために `BattleScreen.handleRemove` から逐語で移設）＝
 *   メインフェイズに自分のシグニを好きな数だけ場からトラッシュに置く（ルール処理）。
 *
 * ■ ⚠**ここは純関数**（DB も画面も触らない）＝呼び出し側が `persist.commit` する（`performEnergyCharge` と同じ形）。
 * ■ 🔴**人間と CPU は同じこの関数**（DESIGN §4・§8 `O-1`）＝CPU 用に写経しない。
 * ■ 可否（`SELF_SIGNI_TRASH` 封じ）は呼び出し側で見る（人間は警告を出すため）。
 * ■ 🔴§5.6 `C-9` `R-41`＝ゾーンの後始末（【チャーム】【アクセ】【ソウル】・ダウン・凍結）は `clearZoneOnSigniLeave`。
 * ■ リムーブはルール処理＝コスト/効果起因ではない（「場からトラッシュに置かれたとき」のうち by コスト/効果 は誘発しない。G204）。
 */
export interface RemoveResult {
  /** リムーブした側の新しい状態。 */
  me: PlayerState;
  /** 相手側（watcher の usageLimit を消費したときだけ変わる）。 */
  opp: PlayerState;
  /** 相手側が変わったか。 */
  oppChanged: boolean;
  /** 「場からトラッシュに置かれたとき」の誘発。 */
  entries: StackEntry[];
  logs: string[];
}

export function performRemove(p: {
  me: PlayerState; opp: PlayerState;
  /** リムーブする側のプレイヤーID。 */
  meId: string;
  /** リムーブする側が host か（誘発の収集は host/guest 順で渡す）。 */
  meIsHost: boolean;
  zones: Iterable<number>;
  cardMap: Map<string, CardData>;
  trigCtx: TrigCtx;
}): RemoveResult {
  const { me: my, opp: op } = p;
  const newSigni = [...my.field.signi] as (string[] | null)[];
  let newTrash = [...my.trash];
  let newLrigTrash = [...my.lrig_trash];
  let removeField = my.field;
  const removedSigniNums: string[] = [];
  for (const zi of p.zones) {
    const stack = my.field.signi[zi] ?? [];
    const top = stack.at(-1);
    if (top) removedSigniNums.push(top);
    newTrash = [...newTrash, ...stack];
    newSigni[zi] = null;
    const cleaned = clearZoneOnSigniLeave(removeField, zi);
    removeField = cleaned.field;
    newTrash = [...newTrash, ...cleaned.trash];
    newLrigTrash = [...newLrigTrash, ...cleaned.lrigTrash];
  }
  const newMyState: PlayerState = clearEndOfAttackEffects({
    ...my,
    field: { ...removeField, signi: newSigni },
    trash: newTrash,
    lrig_trash: newLrigTrash,
    actions_done: [...(my.actions_done ?? []), 'REMOVE'],
  });
  const entries: StackEntry[] = [];
  // ⚠ 引数は host/guest 順（my/op 順ではない）。ゲスト側で my/op を渡すと watcher の場走査が相手側にすり替わる。
  let myAfter = newMyState;
  let opAfter = op;
  for (const cn of removedSigniNums) {
    const tt = pureCollectTrashTriggers(p.trigCtx, cn, p.meId,
      p.meIsHost ? myAfter : opAfter, p.meIsHost ? opAfter : myAfter, false, false, false);
    entries.push(...tt.entries);
    // self/any_ally は自分側、any_opp は相手側の watcher。両側の usageLimit をそれぞれ永続化する。
    const usedMine = p.meIsHost ? tt.usedHostIds : tt.usedGuestIds;
    const usedOpp = p.meIsHost ? tt.usedGuestIds : tt.usedHostIds;
    if (usedMine.length > 0) myAfter = { ...myAfter, actions_done: [...(myAfter.actions_done ?? []), ...usedMine] };
    if (usedOpp.length > 0) opAfter = { ...opAfter, actions_done: [...(opAfter.actions_done ?? []), ...usedOpp] };
  }
  // 🆕🔴**リムーブのログ**（2026-09-22 バグ報告 `5658e3f6`）＝ルール処理なので engine のログ経路を通らない＝ここで書く。
  const logs = removedSigniNums.map(cn => `${p.cardMap.get(getCardNum(cn))?.CardName ?? cn}をリムーブ（場からトラッシュ）`);
  return { me: myAfter, opp: opAfter, oppChanged: opAfter !== op, entries, logs };
}
