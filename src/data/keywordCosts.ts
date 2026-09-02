// カードに**印刷されたキーワードコスト**（【アンコール】ほか）を原文から読む。
//
// 🆕**2026-09-02（§5.3 `O-86` 第2バッチ）で `src/screens/battle/costs.ts` からここへ移した。**
// 🔴**なぜ移したか**＝印字は「効果本文」ではなく**カード単位の事実**なのに、UI 層が
//   支払いのたびに `card.EffectText` を読み直していた（`census:costtext` の A群）。
//   parser が build 時に1度だけ読んで `EffectCost.encoreCost` へ刻み、UI は JSON だけを見る。
// ⚠**ここに新しい「意味」を足さない**＝原文の読み取りだけを置く場所（engine も UI も import しない）。
import type { BetCostSpec, EffectCost, EnergyCost, EncoreCostSpec } from '../types/effects';

const toHalfWidthDigits = (t: string): string =>
  t.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));

/**
 * アンコールコスト。
 *
 * 🆕**2026-09-02（§5.3 `O-199`）＝アイコン形だけでなく「テキスト形」も読む**（実測5枚）。
 * 🔴従来は `《…》` しか読まず `null`（＝コスト無し）へ落ちていたため、**アンコールの選択肢そのものが
 *   出ない**（`canEncore` が false）＝5枚が永久にアンコールできなかった（過小の側）。
 * ⚠**テキスト形と判定するのは「－の直後が `《` でない」ときだけ**＝
 *   `アンコール－《黒》このターン、…` のようにアイコンの後ろへ**アーツ本文**が続く形を
 *   コストと読み違えない（読み違えると払わされる側＝過剰になる）。
 * 対応する3形＝①センタールリグの下からN枚をルリグトラッシュ（＝既存 `exceed` の受け皿）
 *   ②キー1枚を場からルリグトラッシュ（＝既存 `trash_key`）③手札から＜X＞のシグニをN枚捨てる。
 */
export function parseEncoreCostText(effectText: string): EncoreCostSpec | null {
  if (!effectText.startsWith('アンコール－')) return null;
  const afterDash = effectText.slice('アンコール－'.length);
  // ── テキスト形（－の直後が `《` でない）＝アイコンを1つも持たない5枚（§5.3 `O-199`）──
  if (!afterDash.startsWith('《')) {
    const num = (t: string) => parseInt(toHalfWidthDigits(t), 10) || 0;
    const exM = afterDash.match(/^あなたの(?:センター)?ルリグの下からカード([０-９\d]+)枚をルリグトラッシュに置く/);
    if (exM) return { energy: [], coins: 0, exceed: num(exM[1]) };
    if (/^キー([０-９\d]+)枚を場から(?:ルリグ)?トラッシュに置く/.test(afterDash)) {
      return { energy: [], coins: 0, trashOwnKey: true };
    }
    const hdM = afterDash.match(/^手札から(?:＜([^＞]+)＞の)?シグニを([０-９\d]+)枚捨てる/);
    if (hdM) return { energy: [], coins: 0, handDiscardSigni: { count: num(hdM[2]), ...(hdM[1] ? { story: hdM[1] } : {}) } };
    return null;
  }
  // 「（」か漢字テキストの直前まで（アイコン部分のみ）
  const beforeContent = afterDash.split(/[（。【]/)[0];
  const ENERGY_COLORS = new Set<EnergyCost['color']>(['白', '赤', '青', '緑', '黒', '無']);
  const energy: EnergyCost[] = [];
  let coins = 0;
  const re = /《([^》]+)》/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(beforeContent)) !== null) {
    if (m[1] === 'コインアイコン') { coins++; continue; }
    if (ENERGY_COLORS.has(m[1] as EnergyCost['color'])) { energy.push({ color: m[1] as EnergyCost['color'], count: 1 }); continue; }
    const inner = m[1].match(/^([白赤青緑黒無])×([０-９0-9]+)$/);
    if (inner) {
      const cnt = parseInt(inner[2].replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0x30 - 0xFEE0)));
      energy.push({ color: inner[1] as EnergyCost['color'], count: isNaN(cnt) ? parseInt(inner[2]) : cnt });
    }
  }
  return (energy.length > 0 || coins > 0) ? { energy, coins } : null;
}

/**
 * 【ベット】で支払えるコイン枚数の選択肢。
 *  - 固定（「ベット―《コイン》《コイン》」）→ `{ options:[2], variable:false }`
 *  - 段階（「ベット―《コイン》or《コイン》《コイン》」）→ `{ options:[1,2], variable:false }`
 *  - 可変（「ベット―好きな枚数の《コイン》」）→ `{ options:[], variable:true }`（UIで1..所持枚数を提示）
 *
 * 🆕**2026-09-02（§5.3 `O-86` 第3バッチ）で `src/screens/battle/costs.ts` からここへ移した。**
 * ⚠**ベットではないカードは `null`**（従来の `{options:[],variable:false}` と同義）＝payload を刻まない。
 */
export function parseBetOptionsText(effectText: string): BetCostSpec | null {
  if (!effectText) return null;
  const m = effectText.match(/ベット[―─]\s*([\s\S]*)/);
  if (!m) return null;
  const seg = m[1];
  if (/^好きな枚数/.test(seg)) return { options: [], variable: true };
  // 先頭の《コインアイコン》/or の連続部分だけを取り出して段階を数える
  const prefix = (seg.match(/^(?:《コインアイコン》|or)+/) ?? [''])[0];
  const tiers = prefix.split('or').map(t => (t.match(/《コインアイコン》/g) ?? []).length).filter(n => n > 0);
  return tiers.length > 0 ? { options: tiers, variable: false } : null;
}

/**
 * 【ブースト】の任意追加エナコスト（先頭の「ブースト―《色》…」）。
 *
 * 🆕**2026-09-02（§5.3 `O-86` 第4バッチ）で `src/screens/battle/costs.ts` からここへ移した**（5枚）。
 * ⚠アーツ本体 `cost.energy` とは分離する＝宣言時だけ `ArtsModal` の支払い検証へ加える
 *   （本体へ足すと**ブーストしなくても払わされる**＝過剰の側）。
 */
export function parseBoostCostText(effectText: string): EnergyCost[] | null {
  const m = effectText.match(/^ブースト[―─]((?:《[白赤青緑黒無]》)+)/);
  if (!m) return null;
  const counts = new Map<EnergyCost['color'], number>();
  for (const icon of m[1].matchAll(/《([白赤青緑黒無])》/g)) {
    const color = icon[1] as EnergyCost['color'];
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  const out = [...counts].map(([color, count]) => ({ color, count }));
  return out.length > 0 ? out : null;
}

/**
 * カード原文から**印字キーワードコスト**をまとめて読む（【アンコール】【ベット】【ブースト】）。
 *
 * 🔑**これはカード単位の事実**＝効果本文の解釈ではないので、
 *   ①`parseCardEffects` が先頭効果へ刻み（fresh 側の正）
 *   ②`buildEffectsJson.ts` が**収穫マージの後から**同じものを重ねる（`manualEffects.ts` が
 *     本文を手書きしたカードでも失われない＝実測でアンコール9枚／ベット21枚が該当）。
 *   両方を同じ関数から作ることで「fresh と live で別の値になる」経路を構造的に消している。
 */
export function printedKeywordCosts(effectText: string | undefined): Pick<EffectCost, 'encoreCost' | 'betOptions' | 'boostCost'> {
  const encoreCost = parseEncoreCostText(effectText ?? '');
  const betOptions = parseBetOptionsText(effectText ?? '');
  const boostCost = parseBoostCostText(effectText ?? '');
  return {
    ...(encoreCost ? { encoreCost } : {}),
    ...(betOptions ? { betOptions } : {}),
    ...(boostCost ? { boostCost } : {}),
  };
}

/** 印字キーワードコストのキー一覧（重ねる側／除外する側の両方がこれを使う）。 */
export const PRINTED_KEYWORD_COST_KEYS = ['encoreCost', 'betOptions', 'boostCost'] as const;
