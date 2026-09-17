import type { PlayerState } from '../../types';
import { cloneAcceSlots } from '../../utils/acce';

export interface ZoneLeaveResult {
  field: PlayerState['field'];
  /** トラッシュへ置くカード（【チャーム】【アクセ】）。 */
  trash: string[];
  /** ルリグトラッシュへ置くカード（【ソウル】）。 */
  lrigTrash: string[];
}

/**
 * **シグニが場を離れたあとのゾーンの後始末**（§5.6 `C-9`・台帳 [RULES.md](../../../docs/RULES.md) `R-41`）。
 *
 * 公式ルール（JP-094・097）＝シグニが場を離れたら、そのシグニに付いている**【チャーム】【アクセ】はトラッシュ**へ、
 * **【ソウル】はルリグトラッシュ**へ置かれる。ダウン・凍結はそのシグニの状態なので、ゾーンには残らない。
 *
 * 🔴**2026-09-17 の棚卸しで見つけた穴**＝同じ後始末が4箇所にあり、**リムーブ（メインフェイズの自分のシグニを
 *   トラッシュに置く）だけが1つも行っていなかった**＝`field.signi[zi] = null` にするだけだったので、
 *   ①【チャーム】【アクセ】【ソウル】が**どのゾーンにも属さないまま浮いて残り**（カードが消える）
 *   ②`signi_down` / `signi_frozen` が立ったままになり、**次にそのゾーンへ置いたシグニがいきなりダウン／凍結**する。
 *
 * 🔑**残る2つの写経**＝バトルのバニッシュ解決（`BattleScreen` のインライン。蓄積配列の途中で組み立てるため
 *   そのまま）と【ライズ】の潰したゾーン（`riseFoldZones`）。**新しく場を離れる経路を書くときはこの関数を呼ぶ。**
 * ⚠**ウィルス（`signi_virus`）とトラップ（`signi_traps`）は触らない**＝あれは**ゾーン**に置かれるものなので、
 *   シグニが離れても残る（既存3経路のどれも触っていない）。
 * ⚠**元から未設定のキーを作らない**＝`signi_charms` などが無い盤面で配列を生やすと state の形が変わる。
 */
export function clearZoneOnSigniLeave(field: PlayerState['field'], zoneIndex: number): ZoneLeaveResult {
  const trash: string[] = [];
  const lrigTrash: string[] = [];
  const down = [...(field.signi_down ?? [false, false, false])];
  const frozen = [...(field.signi_frozen ?? [false, false, false])];
  down[zoneIndex] = false;
  frozen[zoneIndex] = false;
  const charms = field.signi_charms ? [...field.signi_charms] as (string | null)[] : undefined;
  if (charms?.[zoneIndex]) { trash.push(charms[zoneIndex]!); charms[zoneIndex] = null; }
  // ⚠旧形式（素の string）を `[...cards]` で複製すると1文字ずつの配列に化けるので必ず正規化を通す。
  const acce = field.signi_acce ? cloneAcceSlots(field) : undefined;
  if (acce?.[zoneIndex]?.length) { trash.push(...acce[zoneIndex]!); acce[zoneIndex] = null; }
  const soul = field.signi_soul ? [...field.signi_soul] as (string | null)[] : undefined;
  if (soul?.[zoneIndex]) { lrigTrash.push(soul[zoneIndex]!); soul[zoneIndex] = null; }
  return {
    field: {
      ...field, signi_down: down, signi_frozen: frozen,
      ...(charms ? { signi_charms: charms } : {}),
      ...(acce ? { signi_acce: acce } : {}),
      ...(soul ? { signi_soul: soul } : {}),
    },
    trash,
    lrigTrash,
  };
}
