import { readFileSync, writeFileSync } from 'fs';

let txt = readFileSync('./STUBS.md', 'utf8');

// 1. ヘッダー更新
txt = txt.replace('最終更新: 2026-06-02 (v0.160)', '最終更新: 2026-06-02 (v0.166)');

// 2. ⚡ 部分実装一覧から削除（全STUB一覧に ✅ として登録済みのもの）
const removeFromPartial = [
  /^\| 2 \| AUTO \| RIDE_ON \|\n/m,
  /^\| 1 \| ACTIVATED \| CENTER_LRIG_RIDES_ON_SIGNI \|\n/m,
  /^\| 1 \| AUTO \| LOOK_TOP_ONE_RETURN_REST_BOTTOM \|\n/m,
  /^\| 1 \| AUTO\/ACTIVATED \| LRIG_RIDE_SIGNI \|\n/m,
  /^\| 1 \| ACTIVATED \| MULTI_DAMAGE_ON_LRIG_ATTACK \|\n/m,
  /^\| 1 \| AUTO \| MULTI_SIGNI_TO_ENERGY \|\n/m,
  /^\| 1 \| AUTO \| POWER_DOWN_BY_ZONE_CARD_COUNT \|\n/m,
  /^\| 1 \| AUTO \| POWER_MOD_BY_COLOR_VARIETY \|\n/m,
  /^\| 1 \| ACTIVATED \| POWER_MOD_BY_TRASHED_SIGNI_LEVEL \|\n/m,
  /^\| 1 \| AUTO \| POWER_MOD_BY_UNDER_COUNT \|\n/m,
  /^\| 1 \| AUTO\/ACTIVATED \| POWER_MOD_DISTRIBUTE \|\n/m,
  /^\| 2 \| ACTIVATED \| POWER_MOD_MIRROR \|\n/m,
];
for (const re of removeFromPartial) {
  txt = txt.replace(re, '');
}

// 3. 全STUB一覧 ⚡ 欄 → ✅ に変更
txt = txt.replace(
  /\| 2 \| AUTO \| ⚡ \| CRASH_TO_TRASH_INSTEAD .*\|/,
  '| 2 | AUTO | ✅ | CRASH_TO_TRASH_INSTEAD ※v0.166: crash_to_trash_insteadフラグ追加。handleBurstActivateでop側フラグをチェック→エナ→トラッシュへ（WX19-034） |',
);
txt = txt.replace(
  /\| 6 \| AUTO \| ⚡ \| NEGATE_NTH_ATTACK .*\|/,
  '| 2 | AUTO | ✅ | NEGATE_NTH_ATTACK ※v0.166: negate_opp_signi_attacks_untilフラグ追加。handleSigniAttackでop側フラグをチェック→アタック自動無効化（WX17-006） |',
);
txt = txt.replace(
  /\| 1 \| AUTO \| ⚡ \| POWER_MOD_DOUBLE_DIFF .*\|/,
  '| 1 | AUTO | ✅ | POWER_MOD_DOUBLE_DIFF ※v0.166: lastProcessedCards[0]の基本パワーと自パワーの差×2でマイナス（WX24-P4-054） |',
);
txt = txt.replace(
  /\| 1 \| AUTO \| ⚡ \| SUPPRESS_CENTER_ON_PLAY .*\|/,
  '| 1 | AUTO | ✅ | SUPPRESS_CENTER_ON_PLAY ※v0.166: suppress_center_on_playフラグ追加。グロウ時のルリグ【出】効果発動を抑制（WX12-011） |',
);

writeFileSync('./STUBS.md', txt, 'utf8');
console.log('STUBS.md 更新完了');
