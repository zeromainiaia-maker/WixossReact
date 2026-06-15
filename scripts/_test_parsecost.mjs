// parseCost の動作を直接テスト
// effectParser.ts をトランスパイルせず、同等ロジックを直接実装して検証

function parseNum(str) {
  if (!str) return 0;
  const s = str.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
  return parseInt(s, 10) || 0;
}

const ENERGY_COLORS = new Set(['白', '赤', '青', '緑', '黒', '無']);
function parseEnergyCosts(str) {
  const costs = [];
  const re = /《([^》]+)》(?:×([０-９\d]+))?/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    if (ENERGY_COLORS.has(m[1])) {
      costs.push({ color: m[1], count: m[2] ? parseNum(m[2]) : 1 });
    }
  }
  return costs;
}

function parseCost(costStr) {
  if (!costStr || costStr === '-') return undefined;
  const cost = {};
  const energy = parseEnergyCosts(costStr);
  if (energy.length > 0) cost.energy = energy;
  if (costStr.includes('《ダウン》')) cost.down_self = true;
  const dm = costStr.match(/手札を([０-９\d]+)枚捨てる/);
  if (dm) cost.discard = parseNum(dm[1]);
  const em = costStr.match(/エクシード([０-９\d]+)/);
  if (em) cost.exceed = parseNum(em[1]);
  const beatM = costStr.match(/(?:他の)?シグニ([０-９\d]+)体を【ビート】にする/);
  if (beatM) cost.beat_signi = parseNum(beatM[1]);
  else if (costStr.includes('シグニ１体を【ビート】にする') || costStr.includes('他のシグニ１体を【ビート】にする')) cost.beat_signi = 1;
  const coinM = costStr.match(/《コインアイコン》/g);
  if (coinM?.length) cost.coin = coinM.length;
  return Object.keys(cost).length > 0 ? cost : undefined;
}

// テストケース
const tests = [
  ['《コインアイコン》', 1],
  ['ピーピング《コインアイコン》《コインアイコン》', 2],
  ['《スペルカットインアイコン》《コインアイコン》', 1],
  ['《ゲーム１回》ディスペア《コインアイコン》', 1],
  ['《ゲーム１回》サイレント《コインアイコン》《コインアイコン》', 2],
  ['《メインフェイズアイコン》《アタックフェイズアイコン》《コインアイコン》《コインアイコン》', 2],
];

let ok = 0, ng = 0;
for (const [costStr, expected] of tests) {
  const result = parseCost(costStr);
  const actual = result?.coin;
  const pass = actual === expected;
  console.log(`${pass ? 'OK' : 'NG'} parseCost("${costStr}") → coin=${actual} (expected=${expected})`);
  if (pass) ok++; else ng++;
}
console.log(`\n結果: OK=${ok} NG=${ng}`);
