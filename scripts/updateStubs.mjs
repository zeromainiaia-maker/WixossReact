import fs from 'fs';

// 実際のeffects.jsonからSTUBカウント取得
const raw = fs.readFileSync('public/data/effects.json','utf8');
const data = JSON.parse(raw);
const actualCounts = {};
function search(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(search); return; }
  if (obj.type === 'STUB') actualCounts[obj.id] = (actualCounts[obj.id] || 0) + 1;
  Object.values(obj).forEach(v => { if (v && typeof v === 'object') search(v); });
}
for (const es of Object.values(data)) if (Array.isArray(es)) es.forEach(e => search(e.action));

const md = fs.readFileSync('STUBS.md','utf8');
let lines = md.split('\n');

// 1. ヘッダー更新
lines = lines.map(l => l.includes('最終更新:') ? '最終更新: 2026-06-02 (v0.160)' : l);

// 2. テーブル行の件数更新（全STUB一覧 + ⚡ 部分実装一覧）
const updatedLines = lines.map(l => {
  const m = l.match(/^(\| *)(\d+)( *\|)([^|]*\|[^|]*\|)([A-Z0-9_赤青緑白黑]+)(.*\|?)$/);
  if (!m) return l;
  const id = m[5];
  const newCount = actualCounts[id];
  if (newCount === undefined) return l;
  return m[1] + newCount + m[3] + m[4] + id + m[6];
});

// 3. 削除されたSTUBのエントリを削除（effects.jsonに存在しないもの）
const toDelete = new Set(['ARM_SIGNI_LRIG_PROTECTION','PREVENT_SELF_DOWN_BY_OPP','WEAPON_SIGNI_PREVENT_DOWN','WEAPON_SIGNI_PROTECTION']);
const filtered = updatedLines.filter(l => {
  for (const id of toDelete) {
    if (l.match(new RegExp('\\| *\\d+ *\\|[^|]*\\|[^|]*\\| *' + id + '[ |]'))) return false;
  }
  return true;
});

// 4. 新規STUBエントリ
const newEntries = [
  { count: 1, type: 'AUTO', status: 'done', id: 'ADJACENT_SIGNI_POWER_MOD', note: '※隣接ゾーンシグニにtemp_power_mods追加（ON_PLAY AUTO効果）' },
  { count: 1, type: 'AUTO', status: 'done', id: 'ALL_PLAYER_MILL', note: '※各プレイヤーがデッキ上N枚をトラッシュ実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'COPY_ABILITY', note: '※granted_effectsにparseCardEffectsした効果を追加' },
  { count: 1, type: 'AUTO', status: 'done', id: 'COPY_CARD', note: '※card_identity_overridesにコピー元CardNumを設定' },
  { count: 1, type: 'AUTO', status: 'done', id: 'CRASH_LIFE_TO_HAND', note: '※ライフクロス上→手札追加実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'CRASH_TO_TRASH_INSTEAD', note: '※crash_to_trash_insteadフラグ設定・BattleScreen handleLifeBurstResponseで消費' },
  { count: 1, type: 'AUTO', status: 'done', id: 'DECK_MILL_UNTIL_CLASS', note: '※デッキ上からクラス一致まで公開トラッシュ実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'DECLARE_CLASS', note: '※クラスCHOOSE→declared_classに保存実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'END_ATTACK_IF_EXTRA_TURN', note: '※extra_turnフラグ確認後blocked_actionsにATTACK_SIGNI/ATTACK_LRIG追加' },
  { count: 2, type: 'CONT', status: 'done', id: 'ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白', note: '※effectEngine.collectEnergyColorSubsで動的処理' },
  { count: 2, type: 'CONT', status: 'done', id: 'GROW_COST_ZERO', note: '※グロウコスト0: CONDITIONAL_FREE_GROW同ハンドラ実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'LIMIT_OPP_ATTACK_ONCE', note: '※LIMIT_OPP_SIGNI_ATTACKS_ONCE/OPP_SIGNI_ONE_ATTACK_TOTALと同ハンドラ: 1回制限フラグ設置' },
  { count: 1, type: 'CONT', status: 'done', id: 'LRIG_LIMIT_MODIFY', note: '※lrig_limit_modフィールドで修正量設定実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'NEGATE_ABILITY', note: '※SELECT_TARGET→INTERNAL_NEGATE_ABILITY→abilities_removed追加実装済み' },
  { count: 2, type: 'AUTO', status: 'done', id: 'NEGATE_NTH_ATTACK', note: '※negate_opp_signi_attacks_untilフラグ設定・BattleScreen signiAttack処理で消費' },
  { count: 1, type: 'AUTO', status: 'done', id: 'OPTIONAL_DISCARD_GUARD', note: '※optional_discard_guard_enabledフラグ設定・BattleScreenガードUI統合済み' },
  { count: 1, type: 'CONT', status: 'done', id: 'POWER_EQUAL_TO_SELF_POWER', note: '※自シグニのパワーに等しくなるよう修正値計算実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'POWER_MINUS_PER_OWN_LEVEL', note: '※自レベル×値: SELECT_TARGET(相手シグニ)+temp_power_mods実装済み' },
  { count: 1, type: 'CONT', status: 'done', id: 'POWER_MOD_BY_LRIG_LEVEL', note: '※ルリグレベル×delta: effectEngine+execStub両方で実装済み' },
  { count: 2, type: 'AUTO', status: 'done', id: 'POWER_MOD_BY_TRASH_CLASS_COUNT', note: '※トラッシュクラス枚数×deltaをtemp_power_modsに適用実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'POWER_MOD_DOUBLE_DIFF', note: '※(対象パワー-自パワー)×2のマイナスをtemp_power_modsに追加' },
  { count: 2, type: 'CONT', status: 'done', id: 'PREVENT_SIGNI_ABILITY_LOSS_BY_OPP', note: '※v0.111: collectAbilityProtectedSigni+otherProtectedSigniNumsでfilter' },
  { count: 1, type: 'CONT', status: 'done', id: 'PREVENT_SIGNI_DOWN_BY_OPP', note: '※PREVENT_SIGNI_DOWN_BY_OPP_ALL同グループ: collectDownProtectedSigni+execDownに保護フィルター統合' },
  { count: 1, type: 'AUTO', status: 'done', id: 'SEED_BLOOM_OPTIONAL', note: '※v0.109: SEED_BLOOMと同ハンドラ（任意フラグON）実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'SEED_FLOWER_OP', note: '※別シード1枚開花+デッキ上をシード設置実装済み（ヤマレンゲ系）' },
  { count: 1, type: 'AUTO', status: 'done', id: 'SEED_HAND_AND_BLOOM_FROM_DECK_TOP', note: '※シード手札追加+デッキ上シード設置実装済み' },
  { count: 1, type: 'ACTIVATED', status: 'done', id: 'SHUFFLE_DECK_POWER_HALF', note: '※デッキシャッフル+自パワー半減適用実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'SKIP_MAIN_PHASE', note: '※blocked_actionsにMAIN_PHASEを追加実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'SUPPRESS_CENTER_ON_PLAY', note: '※suppress_center_on_playフラグ設定・BattleScreen ルリグ展開時に確認' },
  { count: 1, type: 'CONT', status: 'done', id: 'SUPPRESS_GAIN_ABILITY', note: '※保護効果グループ: abilities_removed追加で能力無効化実装済み' },
  { count: 1, type: 'CONT', status: 'done', id: 'SUPPRESS_LIFEBURST_COLOR_CONDITION', note: '※ライフバースト色条件抑制実装済み' },
  { count: 1, type: 'ACTIVATED', status: 'done', id: 'SUPPRESS_OPP_SIGNI_ABILITIES', note: '※相手フィールド全シグニのabilities_removed追加実装済み' },
  { count: 1, type: 'AUTO', status: 'done', id: 'TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE', note: '※SELECT_TARGET→INTERNAL_TOSFC_AFTER_SELECT(CHOOSE:バウンス/トラッシュ)の2段階' },
  { count: 1, type: 'AUTO', status: 'done', id: 'TRAP_TO_SIGNI_IF_ZONE_EMPTY', note: '※ゾーン空き確認+signi_traps->field.signi移動実装済み' },
];

const statusIcon = { done: '✅', partial: '⚡' };

// 全STUB一覧の末尾（---の前）にnewEntriesを挿入
let result = filtered.join('\n');

// 全STUB一覧セクションの最後の行を見つけてそこに追加
const fullListEnd = result.lastIndexOf('| 1 |');
const afterFullList = result.indexOf('\n---', fullListEnd);
const insertPos = afterFullList >= 0 ? afterFullList : result.lastIndexOf('| 1 |') + result.substring(result.lastIndexOf('| 1 |')).indexOf('\n') + 1;

// 既存エントリとの重複を避ける
const existingIds = new Set((result.match(/\| *\d+ *\|[^|]*\|[^|]*\| *([A-Z][A-Z0-9_赤青緑白黑]+)/g) || []).map(m => m.replace(/.*\| */, '')));
const dedupedEntries = newEntries.filter(e => !existingIds.has(e.id));

const newEntryLines = dedupedEntries.map(e =>
  `| ${e.count} | ${e.type} | ${statusIcon[e.status]} | ${e.id} ${e.note} |`
).join('\n');

if (newEntryLines) result = result.substring(0, insertPos) + '\n' + newEntryLines + result.substring(insertPos);

// ⚡セクションにも新規⚡エントリ追加（「**合計:」行の前）
const partialSectionEnd = result.indexOf('\n**合計:');
const newPartialLines = dedupedEntries.filter(e => e.status === 'partial').map(e =>
  `| ${e.count} | ${e.type} | ${statusIcon['partial']} | ${e.id} ${e.note} |`
).join('\n');
if (newPartialLines) result = result.substring(0, partialSectionEnd) + '\n' + newPartialLines + result.substring(partialSectionEnd);

// 合計種数を更新
const partialCount = (result.match(/\| *\d+ *\|[^|]*\| *⚡ *\|/g)||[]).length;
result = result.replace(/\*\*合計: \d+種\*\*/, `**合計: ${partialCount}種**`);

// 集計サマリー更新
const checkCount = (result.match(/\| *\d+ *\|[^|]*\| *✅ *\|/g)||[]).length;
const partialCount2 = (result.match(/\| *\d+ *\|[^|]*\| *⚡ *\|/g)||[]).length;
const totalCount = checkCount + partialCount2;

result = result
  .replace(/\| ✅ 実装済み \| \d+ \|/, `| ✅ 実装済み | ${checkCount} |`)
  .replace(/\| ⚡ 部分実装 \| \d+ \|/, `| ⚡ 部分実装 | ${partialCount2} |`)
  .replace(/\| \*\*合計\*\* \| \*\*\d+\*\* \|/, `| **合計** | **${totalCount}** |`)
  .replace(/## 集計サマリー（v0\.\d+）/, '## 集計サマリー（v0.160）');

// 実装履歴に新エントリ追加
const histHeader = '| 日付 | 実装内容 | 対象STUB |';
const histIdx = result.indexOf(histHeader);
if (histIdx >= 0) {
  const sepEnd = result.indexOf('\n', result.indexOf('\n', histIdx) + 1) + 1;
  const newHist = '| 2026-06-02 v0.160 | 34件新規追加: ✅化(ALL_PLAYER_MILL/CRASH_LIFE_TO_HAND/DECK_MILL_UNTIL_CLASS/DECLARE_CLASS/GROW_COST_ZERO/LIMIT_OPP_ATTACK_ONCE/LRIG_LIMIT_MODIFY/NEGATE_ABILITY/POWER_EQUAL_TO_SELF_POWER/POWER_MINUS_PER_OWN_LEVEL/POWER_MOD_BY_LRIG_LEVEL/POWER_MOD_BY_TRASH_CLASS_COUNT/PREVENT_SIGNI_ABILITY_LOSS_BY_OPP/PREVENT_SIGNI_DOWN_BY_OPP/SEED_BLOOM_OPTIONAL/SEED_FLOWER_OP/SEED_HAND_AND_BLOOM_FROM_DECK_TOP/SHUFFLE_DECK_POWER_HALF/SKIP_MAIN_PHASE/SUPPRESS_GAIN_ABILITY/SUPPRESS_LIFEBURST_COLOR_CONDITION/SUPPRESS_OPP_SIGNI_ABILITIES/TRAP_TO_SIGNI_IF_ZONE_EMPTY/ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白)。ENERGY_*_TRASH_*エナ代替4件✅。カウント70件更新。削除4件 | 38件 |\n';
  result = result.substring(0, sepEnd) + newHist + result.substring(sepEnd);
}

fs.writeFileSync('STUBS.md', result, 'utf8');
console.log('✅ STUBS.md更新完了');
console.log('✅種数:', checkCount, '⚡種数:', partialCount2, '合計:', totalCount);
