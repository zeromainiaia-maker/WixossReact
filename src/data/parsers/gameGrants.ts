/**
 * `GAIN_ABILITY_THIS_GAME`（「このゲームの間、〜」）の宣言を**効果単位の原文から**組み立てる。
 *
 * 🆕**§5.3 `O-60` 第49バッチ（2026-09-03）＝この項目最大の catch-all（A🔴 24行 / live 19効果）を payload 化した。**
 *
 * 🔴**旧実装は `src/engine/execStubPart1.ts` が実行時に `card.EffectText + card.BurstText` を
 *   24本のリテラル regex で読み分けていた**＝
 *   ①**カード全文**なので、同じカードの別の効果やライフバースト文の語句で宣言が立ちうる
 *   ②regex が外れても盤面が動かないだけなので**誰も気づけない**（実測＝`メインフェイズ開始時.*手札.*5枚以下`
 *     は原文が全角「５枚以下」なので**1枚も当たらず**、`WXDi-P11-004` は丸ごと無言 no-op だった）
 *   ③逆翻訳・census・golden・smoke・fuzz が全部緑のまま意味が壊れる。
 * ⇒ **原文を読むのはここ（parser・効果単位の原文）だけ**にし、engine は payload だけを見る。
 *
 * ⚠**ここへ規則を足すときは必ず全角数字を許す**（`[０-９\d]`）＝②の再発防止。
 * ⚠**消費地点は `execStubPart1.ts` の `GAIN_ABILITY_THIS_GAME` 1箇所**（`kind` を1つ足したら必ず対で書く）。
 */
import type { GameGrantSpec } from '../../types/effects';

const toHalfWidth = (s: string): string =>
  s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

const num = (raw: string | undefined, fallback: number): number => {
  const n = parseInt(toHalfWidth(raw ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * 効果単位の原文から「このゲームの間」宣言を全部取り出す。
 * 🔑**順序は原文の出現順ではなく規則の並び順**＝engine は集合として適用するので順序に意味は無い。
 */
export function buildGameGrants(text: string): GameGrantSpec[] {
  const t = text ?? '';
  const out: GameGrantSpec[] = [];

  // ---- グロウ禁止 ----
  if (/あなたはグロウできない/.test(t)) out.push({ kind: 'noGrow', player: 'self' });
  if (/対戦相手はグロウできない/.test(t)) out.push({ kind: 'noGrow', player: 'opponent' });

  // ---- センタールリグへのキーワード付与 ----
  // ⚠「【ダブルクラッシュ】を得て、あなたはグロウできない」のような連用中止形があるので `得` までで切る。
  for (const m of t.matchAll(/センタールリグは【([^】]+)】を得/g)) {
    out.push({ kind: 'centerLrigKeyword', keyword: m[1] });
  }

  // ---- カード名の使用禁止 ----
  const blocked = t.match(/このゲームの間、あなたは《([^》]+)》を使用できない/);
  if (blocked) out.push({ kind: 'blockCardName', cardName: blocked[1] });

  // ---- ライフバースト全無効 ----
  if (/ライフバーストは発動しない/.test(t)) out.push({ kind: 'suppressLifeBurst' });

  // ---- 各フェイズ開始時のドロー ----
  // 🔴旧 engine の regex は `5枚以下`（半角）で、原文の全角「５枚以下」に1枚も当たらなかった。
  const mainDraw = t.match(/メインフェイズ開始時[^。]*手札が([０-９\d]+)枚以下[^。]*カードを[０-９\d]*枚?引く/);
  if (mainDraw) out.push({ kind: 'mainPhaseDrawIfHandLte', handLte: num(mainDraw[1], 5) });
  if (/グロウしたとき[^。]*カードを[^。]*引く/.test(t)) out.push({ kind: 'growDraw' });
  // 🆕**§5.3 `O-242`（2026-09-04）＝そのターンの**最初のグロウ**限定のエナチャージ（`WXDi-P03-002-E1`）。**
  //   ⚠**条件（最初のグロウ）を落として `growDraw` 側へ寄せない**＝グロウのたびに発火する過大実行になる。
  const firstGrowEna = t.match(/グロウしたとき[^。]*最初のグロウである場合[^。]*【エナチャージ([０-９\d]+)】/);
  if (firstGrowEna) out.push({ kind: 'firstGrowEnergyCharge', count: num(firstGrowEna[1], 1) });
  if (/エナフェイズ開始時[^。]*カードを[^。]*引く/.test(t)) out.push({ kind: 'energyPhaseDraw' });

  // ---- 手札上限 ----
  const handBonus = t.match(/手札の枚数の上限は([０-９\d]+)増える/);
  if (handBonus) out.push({ kind: 'handSizeBonus', value: num(handBonus[1], 2) });

  // ---- デッキ内シグニのレベル読み替え ----
  const deckLv = t.match(/デッキにある＜([^＞]+)＞のシグニのレベルは([０-９\d]+)になる/);
  if (deckLv) out.push({ kind: 'deckSigniLevelOverride', cardClass: deckLv[1], level: num(deckLv[2], 4) });

  // ---- コイン ----
  if (/《コインアイコン》を得られない/.test(t)) out.push({ kind: 'noCoinGain' });

  // ---- 宣言したシグニ（`WXK09-001`）----
  if (/宣言したシグニの基本レベルは０になり/.test(t)) out.push({ kind: 'declaredSigniLevelZero' });
  if (/限定条件を無視して場に出せる/.test(t)) out.push({ kind: 'declaredSigniIgnoreRestriction' });

  // ---- ガード周り ----
  const oppGuardHand = t.match(/対戦相手は追加で手札を([０-９\d]+)枚捨てるか《無》を支払わないかぎり【ガード】ができない/);
  if (oppGuardHand) out.push({ kind: 'oppGuardExtraHandOrColorless', handCount: num(oppGuardHand[1], 1) });
  else if (/対戦相手は追加で《無》を支払わないかぎり【ガード】ができない/.test(t)) {
    // ⚠**手札版と排他**＝「手札N枚捨てるか《無》」は《無》単独版の regex にも当たる（部分文字列）。
    out.push({ kind: 'oppGuardExtraColorless' });
  }
  const guardAlt = t.match(/【ガード】する際[^。]*代わりに手札を([０-９\d]+)枚捨ててもよい/);
  if (guardAlt) out.push({ kind: 'guardAltHand', handCount: num(guardAlt[1], 3) });
  if (/手札から《ガードアイコン》を持つシグニを[^。]*捨てる[^。]*【ルリグバリア】/.test(t)) {
    out.push({ kind: 'guardBarrierAct' });
  }

  // ---- ターン終了時にトラッシュから回収 ----
  const turnEnd = t.match(/ターン終了時、[^。]*トラッシュから＜([^＞]+)＞のシグニ([０-９\d]*)枚[^。]*を手札に加える/);
  if (turnEnd) out.push({ kind: 'turnEndTrashToHand', cardClass: turnEnd[1], count: num(turnEnd[2], 1) });

  // ---- リミット加算（グロウフェイズ開始時・累積）----
  const limitPlus = t.match(/このゲームの間[^。]*リミットを＋([０-９\d]+)する/);
  if (limitPlus) out.push({ kind: 'growPhaseLimitPlus', value: num(limitPlus[1], 1) });

  // ---- `WXK03-003A` ----
  if (/基本レベルと基本リミットは[^。]*対象の対戦相手のセンタールリグ[^。]*と同じ値になる/.test(t)) {
    out.push({ kind: 'lrigCopyOppLevelLimit' });
  }
  const nthUse = t.match(/この【起】を使用したのが([０-９\d]+)回目である場合/);
  if (nthUse) out.push({ kind: 'nthActivationFlip', count: num(nthUse[1], 5) });

  // ---- 見出し文（盤面は動かさない）----
  // ⚠**先頭に置く**＝逆翻訳が「このゲームの間、あなたは以下の能力を得る。〈中身〉」の語順で読めるようにする
  //   （末尾に置くと「〜引く。あなたは以下の能力を得る」と倒置して読めなくなる）。engine は集合として扱う。
  if (/このゲームの間、あなたは以下の能力を得る/.test(t)) out.unshift({ kind: 'abilityBlockHeader' });

  return out;
}
