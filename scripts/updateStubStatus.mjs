/**
 * updateStubStatus.mjs
 * STUBS.md の 📝 未実装一覧を execStub.ts の実装状況に基づき更新する
 *
 * 判定基準:
 *   ✅ → needsInteraction / selectOrInteract がブロック内にある、またはゲーム状態を変更するフラグ設置実装がある
 *   ⚡ → done(addLog) のみ、または部分的な処理のみ
 */

import { readFileSync, writeFileSync } from 'fs';

const STUBS_PATH = './STUBS.md';
const EXEC_STUB_PATH = './src/engine/execStub.ts';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 調査済み分類マップ (📝 → ✅ or ⚡)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 各スタブの新しい状態と説明文
 * status: '✅' | '⚡'
 * note: STUBS.mdに追加するコメント
 */
const RECLASSIFY_MAP = {
  // ── 📝→✅ (needsInteraction / 実質的ゲーム状態変更) ──────────────────
  'TRASH_OWN_KEY_OPTIONAL': {
    status: '✅',
    note: '※needsInteraction CHOOSE: キーをルリグトラッシュに置く/スキップ',
  },
  'CHOSEN_TO_ENERGY_OR_HAND': {
    status: '✅',
    note: '※needsInteraction CHOOSE: エナか手札への移動を選択',
  },
  'CLASS_SIGNI_TO_ENERGY': {
    status: '✅',
    note: '※デッキ上クラスシグニをフィルタしてneedsInteraction SEARCHでエナへ',
  },
  'CONDITIONAL_ADD_HAND': {
    status: '✅',
    note: '※フィールドシグニ有無チェック+デッキ上ドロー実装済み',
  },
  'CONDITIONAL_DISCARD': {
    status: '✅',
    note: '※needsInteraction SELECT_TARGET: 条件付き手札選択捨て実装済み',
  },
  'CONDITIONAL_KEYWORD_BY_CENTER_COLOR': {
    status: '✅',
    note: '※センター色チェック+keyword_grants付与実装済み',
  },
  'COUNT_DISTINCT_NAMES': {
    status: '✅',
    note: '※自フィールドシグニ名数×deltaをtemp_power_modsに適用',
  },
  'DECK_REVEAL_UNTIL_CLASS': {
    status: '✅',
    note: '※DECK_REVEAL_UNTILと同ハンドラ: クラスフィルタ付き完全実装',
  },
  'LEAVE_FIELD_TO_DECK_BOTTOM': {
    status: '✅',
    note: '※removeFromField+deckへ追加でデッキ下移動実装済み',
  },
  'NEGATE_ATTACK_ON_TRIGGER': {
    status: '✅',
    note: '※prevent_next_damageフラグ設置でアタック無効化実装済み',
  },
  'NO_ABILITY_SIGNI_TO_DECK_BOTTOM': {
    status: '✅',
    note: '※能力テキスト有無チェック+removeFromField+デッキ下移動実装済み',
  },
  'OPP_SIGNI_LEAVE_TO_TRASH': {
    status: '✅',
    note: '※banish_redirectフラグ設置: BattleScreenのバニッシュ先変更に統合',
  },
  'PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP': {
    status: '✅',
    note: '※prevent_lrig_damageフラグ設置実装済み',
  },
  'PREVENT_DAMAGE_FROM_OPP_EFFECTS': {
    status: '✅',
    note: '※prevent_lrig_damageフラグ設置実装済み',
  },
  'PREVENT_DEFEAT': {
    status: '✅',
    note: '※prevent_defeatフラグ設置: 敗北無効実装済み',
  },
  'PREVENT_LOW_LEVEL_LRIG_DAMAGE': {
    status: '✅',
    note: '※prevent_lrig_damageフラグ設置実装済み',
  },
  'PREVENT_OWN_ARTS_USE': {
    status: '✅',
    note: '※blocked_actionsにUSE_ARTS追加でアーツ使用禁止実装済み',
  },
  'REMOVE_OPP_MULTI_ENA': {
    status: '✅',
    note: '※相手エナの複数色カードをフィルタしてトラッシュへ移動実装済み',
  },
  'REMOVE_OPP_MULTI_ENA_ONLY': {
    status: '✅',
    note: '※REMOVE_OPP_MULTI_ENAと同ハンドラ: 複数色エナ削除実装済み',
  },
  'REVEALED_SIGNI_TO_FIELD_REST_TRASH': {
    status: '✅',
    note: '※lastProcessedCardsのシグニを空きゾーンに配置+残りトラッシュ実装済み',
  },
  'REVERSE_OPP_POWER_MINUS': {
    status: '✅',
    note: '※temp_power_modsの負デルタを正に反転する実装済み',
  },
  'BLOCK_OPP_ZONE_PLACEMENT': {
    status: '✅',
    note: '※disabled_signi_zones配列に指定ゾーンを追加実装済み',
  },
  'CHOOSE_COLOR_FROM_LIST': {
    status: '✅',
    note: '※needsInteraction CHOOSE: エナの色一覧から選択実装済み',
  },
  // ── 追加で✅確認できるもの ──────────────────────────────────────────
  'PLACE_ACCE_SIGNI_TO_ENERGY': {
    status: '✅',
    note: '※signi_acceの全アクセをエナゾーンへ移動実装済み(ACCE_TO_ENERGYと同ハンドラ)',
  },
  'ACCE_BANISH_SELF_TRASH': {
    status: '✅',
    note: '※signi_acceの全アクセをトラッシュへ移動+field更新実装済み',
  },
  'ACCE_SIGNI_GRANT_ABILITY': {
    status: '✅',
    note: '※アクセゾーン対象シグニにkeyword_grants付与実装済み',
  },
  'CLASS_SIGNI_TO_ENERGY': {
    status: '✅',
    note: '※デッキ上クラスシグニをフィルタしneedsInteraction SEARCHでエナへ',
  },
  'CONDITIONAL_SEARCH_IF_FIELD': {
    status: '✅',
    note: '※フィールドシグニ有無チェック+デッキ上3枚からシグニ手札追加実装済み',
  },
  'CONDITIONAL_SEARCH_IF_RESONA': {
    status: '✅',
    note: '※レゾナ有無チェック+needsInteractionでデッキから手札追加実装済み',
  },
  'INFECTED_SIGNI_POWER_DOWN_BY_LEVEL': {
    status: '✅',
    note: '※ウイルスレベル合計×-1000をtemp_power_modsに適用実装済み',
  },
  'LIFE_TO_HAND_OPTIONAL': {
    status: '✅',
    note: '※life_cloth先頭を手札へ移動実装済み',
  },
  'PLACE_SIGNI_UNDER_SIGNI': {
    status: '✅',
    note: '※lastProcessedCardsのシグニをsourceCardNumの下に配置実装済み',
  },
  'POWER_MOD_BY_FIELD_CLASS_LEVEL': {
    status: '✅',
    note: '※フィールドクラスシグニのレベル合計×deltaをtemp_power_modsに適用',
  },
  'HAND_SIGNI_UNDER_SIGNI': {
    status: '✅',
    note: '※needsInteraction SELECT_TARGET: 手札シグニを選択してシグニ下に配置',
  },
  'REVEAL': {
    status: '✅',
    note: '※デッキ上1枚をlastProcessedCardsに格納してログ表示実装済み',
  },
  'REVEALED_CARD_COLOR_DISCARD': {
    status: '✅',
    note: '※needsInteraction: 公開カードの色と同色手札を選択して捨て実装済み',
  },
  'SELECT_NO_COMMON_COLOR': {
    status: '✅',
    note: '※CHOOSE選択で共通色なしパターン実装済み',
  },
  'UPKEEP_OR_NO_UP': {
    status: '✅',
    note: '※needsInteraction CHOOSE: アップキープ or アップなし選択実装済み',
  },
  'USE_SPELL_FROM_TRASH': {
    status: '✅',
    note: '※PLAY_FREEグループに統合: lastProcessedCardsのスペルを無料使用',
  },
  'PLAY_EFFECT_TARGET_CLASS_CHANGE': {
    status: '✅',
    note: '※PLAY_FREEグループに統合: スペル/アーツ効果を実行',
  },

  // ── 📝→⚡ (done(addLog)のみ or ログ改善のみ) ─────────────────────────
  'ADD_CARD_TO_LRIG_DECK_HIDDEN': {
    status: '⚡',
    note: '※lastProcessedCardsのカードをルリグデッキへ追加(カード名解決は部分的)',
  },
  'OPEN_MAGIC_BOX': {
    status: '⚡',
    note: '※done(addLog)のみ（マジックボックス未実装）',
  },
  'TRIGGER_LIFE_BURST': {
    status: '⚡',
    note: '※done(addLog)のみ（ライフバースト特殊トリガー未実装）',
  },
  'BET_CONDITION': {
    status: '⚡',
    note: '※done(addLog)のみ（ベット条件チェック未実装）',
  },
  'COIN_USE_RESTRICTION': {
    status: '⚡',
    note: '※done(addLog)のみ（コイン使用制限未実装）',
  },
  'CONDITIONAL_ALT_POWER_BOOST': {
    status: '⚡',
    note: '※done(addLog)のみ（条件付き代替パワーブースト未実装）',
  },
  'DEPLOY_RESTRICT': {
    status: '⚡',
    note: '※AUTO時はsigni_deploy_power_limitフラグ設置。CONTINUOUS制限はログのみ',
  },
  'PLACE_MAGIC_BOX': {
    status: '⚡',
    note: '※done(addLog)のみ（マジックボックス設置未実装）',
  },
  'REPEAT_EFFECT': {
    status: '⚡',
    note: '※done(addLog)のみ（効果繰り返し未実装）',
  },
  'SIGNI_FLIP_FACEDOWN': {
    status: '⚡',
    note: '※FLIP_FACE_DOWN_SIGNIと同ハンドラ: face_down_signi+abilities_removed設定',
  },
  'ACCE_COST_REDUCTION': {
    status: '⚡',
    note: '※done(addLog)のみ（アクセコスト軽減未実装）',
  },
  'ACCE_OP': {
    status: '⚡',
    note: '※done(addLog)のみ（アクセカウント確認のみ）',
  },
  'ACCE_SIGNI_ALL_COLOR': {
    status: '⚡',
    note: '※done(addLog)のみ（アクセシグニ全色化未実装）',
  },
  'ADD_RESONANCE_CONDITION': {
    status: '⚡',
    note: '※done(addLog)のみ（レゾナ条件追加未実装）',
  },
  'ARM_SIGNI_LRIG_PROTECTION': {
    status: '⚡',
    note: '※done(addLog)のみ（種族保護グループに統合：effectEngine未対応）',
  },
  'ARTS_EXTRA_COST_CONDITION': {
    status: '⚡',
    note: '※done(addLog)のみ（アーツ追加コスト条件未実装）',
  },
  'BEAT_ZONE_OP': {
    status: '⚡',
    note: '※done(addLog)のみ（ビートゾーン対象選択未実装）',
  },
  'CENTER_ZONE_CONDITION': {
    status: '⚡',
    note: '※done(addLog)のみ（センターゾーン条件チェック未実装）',
  },
  'CHOOSE_SAME_OPTION_MULTIPLE': {
    status: '⚡',
    note: '※done(addLog)のみ（同選択肢複数回選択未実装）',
  },
  'COIN_SPEND_CONDITION': {
    status: '⚡',
    note: '※done(addLog)のみ（コイン消費条件チェック未実装）',
  },
  'CONDITIONAL_TRASH_UNDER_SIGNI': {
    status: '⚡',
    note: '※done(addLog)のみ（条件付きシグニ下トラッシュ未実装）',
  },
  'COOKING_BANISH_SUBSTITUTE': {
    status: '⚡',
    note: '※done(addLog)のみ（料理系バニッシュ置換未実装）',
  },
  'COST_COLOR_SELECT': {
    status: '⚡',
    note: '※done(addLog)のみ（コスト色選択未実装）',
  },
  'DECLARE_COLOR_COND_ENERGY_TRASH': {
    status: '⚡',
    note: '※done(addLog)のみ（色宣言→エナトラッシュ条件未実装）',
  },
  'DECLARE_NUMBER_POWER': {
    status: '⚡',
    note: '※done(addLog)のみ（POWER参照数字宣言未実装）',
  },
  'IGNORE_LRIG_RESTRICTION_ARTS': {
    status: '⚡',
    note: '※done(addLog)のみ（ルリグ制限無視フラグ未実装）',
  },
  'INCREASE_ACT_ABILITY_COST': {
    status: '⚡',
    note: '※done(addLog)のみ（起動能力コスト増加未実装）',
  },
  'INHERIT_OPP_LRIG_TYPE': {
    status: '⚡',
    note: '※done(addLog)のみ（属性変更グループ: effectEngine未対応）',
  },
  'INHERIT_UNDER_SIGNI_COLOR': {
    status: '⚡',
    note: '※done(addLog)のみ（属性変更グループ: effectEngine未対応）',
  },
  'LEVEL_BASED_CONDITIONAL': {
    status: '⚡',
    note: '※done(addLog)のみ（センターレベル条件分岐スキップ）',
  },
  'LEVEL_MOD_PER_COUNT': {
    status: '⚡',
    note: '※done(addLog)のみ（カウント基準レベル修正未実装）',
  },
  'LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT': {
    status: '⚡',
    note: '※done(addLog)のみ（属性変更グループ: effectEngine未対応）',
  },
  'LRIG_GAIN_ABILITY': {
    status: '⚡',
    note: '※done(addLog)のみ（ルリグシステムグループ: 未実装）',
  },
  'LRIG_RIDE_SIGNI': {
    status: '⚡',
    note: '※done(addLog)のみ（ルリグシステムグループ: 未実装）',
  },
  'OPP_TRASH_LOSE_COLOR_AND_CLASS': {
    status: '⚡',
    note: '※done(addLog)のみ（移動リダイレクトグループ: effectEngine未対応）',
  },
  'OPP_ZONE_PLACEMENT_RESTRICT': {
    status: '⚡',
    note: '※done(addLog)のみ（相手ゾーン配置制限フラグ未実装）',
  },
  'POWER_MOD_DISTRIBUTE': {
    status: '⚡',
    note: '※done(addLog)のみ（複合パワー修正グループ: 未実装）',
  },
  'PREVENT_ABILITY_CHANGE_BY_OPP': {
    status: '⚡',
    note: '※done(addLog)のみ（保護効果グループ: effectEngine未対応）',
  },
  'PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP': {
    status: '⚡',
    note: '※done(addLog)のみ（effectEngineで動的処理予定）',
  },
  'PREVENT_INFECTED_SIGNI_ACTIVATE': {
    status: '⚡',
    note: '※done(addLog)のみ（保護効果グループ: effectEngine未対応）',
  },
  'PREVENT_NON_FIELD_MOVE_BY_OPP': {
    status: '⚡',
    note: '※done(addLog)のみ（保護効果グループ: effectEngine未対応）',
  },
  'PREVENT_OPP_POWER_PLUS': {
    status: '⚡',
    note: '※done(addLog)のみ（保護効果グループ: effectEngine未対応）',
  },
  'PREVENT_OPP_SIGNI_ABILITY_GAIN': {
    status: '⚡',
    note: '※done(addLog)のみ（保護効果グループ: effectEngine未対応）',
  },
  'PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH': {
    status: '⚡',
    note: '※done(addLog)のみ（保護効果グループ: effectEngine未対応）',
  },
  'PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH': {
    status: '⚡',
    note: '※done(addLog)のみ（保護効果グループ: effectEngine未対応）',
  },
  'REPLACE_PLUS_N': {
    status: '⚡',
    note: '※done(addLog)のみ（+N置換パターン未実装）',
  },
  'RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE': {
    status: '⚡',
    note: '※done(addLog)のみ（ライズ/レゾナ退場置換グループ: 未実装）',
  },
  'RISE_BANISH_SUBSTITUTE': {
    status: '⚡',
    note: '※done(addLog)のみ（ライズバニッシュ置換未実装）',
  },
  'RISE_LEAVE_DISCARD_STACK': {
    status: '⚡',
    note: '※done(addLog)のみ（ライズ退場スタック捨てグループ: 未実装）',
  },
  'SIGNI_PROTECT_MOVE_EXCEPT_ENERGY': {
    status: '⚡',
    note: '※done(addLog)のみ（保護効果グループ: effectEngine未対応）',
  },
  'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH': {
    status: '⚡',
    note: '※done(addLog)のみ（ダメージ代替未実装）',
  },
  'TRASH_FROM_DECK_PER_SIGNI_LEVEL': {
    status: '⚡',
    note: '※ハンドラあり（シグニレベル合計分デッキトラッシュ）',
  },
  'WEAPON_SIGNI_PROTECTION': {
    status: '⚡',
    note: '※done(addLog)のみ（種族保護グループ: effectEngine未対応）',
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const stubsMd = readFileSync(STUBS_PATH, 'utf8');
const lines = stubsMd.split('\n');

let changedCount = 0;
const newLines = lines.map(line => {
  // テーブル行かチェック（全STUB一覧セクションのみ変更）
  // 形式: | 件数 | effectType | 📝 | STUB_ID ...
  const match = line.match(/^\| *(\d+) \| ([^|]+) \| 📝 \| ([A-Z0-9_]+)(.*)\|?$/);
  if (!match) return line;

  const count = match[1];
  const effectType = match[2].trim();
  const stubId = match[3].trim();
  const rest = match[4].trim();

  const reclass = RECLASSIFY_MAP[stubId];
  if (!reclass) return line; // マップにないものはそのまま

  const newStatus = reclass.status;
  const newNote = reclass.note;

  // 行を再構築
  const newLine = `| ${count} | ${effectType} | ${newStatus} | ${stubId} ${newNote} |`;
  changedCount++;
  return newLine;
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 「📝 未実装一覧」セクションを再生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 更新後の全STUB一覧から📝を再集計
const updatedContent = newLines.join('\n');
const updatedLines = updatedContent.split('\n');

// 全STUB一覧から📝行を収集
const notImplementedRows = [];
const partialRows = [];

let inAllStubSection = false;
for (const line of updatedLines) {
  if (line.startsWith('## 全STUB一覧')) {
    inAllStubSection = true;
    continue;
  }
  if (inAllStubSection && line.startsWith('## ') && !line.startsWith('## 全STUB一覧')) {
    inAllStubSection = false;
  }
  if (!inAllStubSection) continue;
  if (!line.startsWith('|')) continue;
  if (line.includes('件数') || line.includes('---')) continue;

  if (line.includes('| 📝 |')) {
    // STUB ID と件数を抽出
    const m = line.match(/^\| *(\d+) \| ([^|]+) \| 📝 \| ([A-Z0-9_]+)/);
    if (m) notImplementedRows.push({ count: parseInt(m[1]), effectType: m[2].trim(), id: m[3].trim(), line });
  }
  if (line.includes('| ⚡ |')) {
    const m = line.match(/^\| *(\d+) \| ([^|]+) \| ⚡ \| ([A-Z0-9_]+)/);
    if (m) partialRows.push({ count: parseInt(m[1]), effectType: m[2].trim(), id: m[3].trim(), line });
  }
}

// 件数順にソート
notImplementedRows.sort((a, b) => b.count - a.count);

// 「📝 未実装一覧」セクションを再構築
const notImplTotal = notImplementedRows.reduce((s, r) => s + r.count, 0);
const notImplSection = [
  '## 📝 未実装一覧（ログのみ・優先実装対象）',
  '',
  'ゲーム状態への影響なし。件数の多い順に並べている。',
  '',
  '| 件数 | effectType | STUB ID |',
  '|-----:|-----------|---------|',
  ...notImplementedRows.map(r => `| ${r.count} | ${r.effectType} | ${r.id} |`),
  '',
  `**合計: ${notImplementedRows.length}種 / 約${notImplTotal}件**` + (notImplTotal > 300 ? `（OPTIONAL_COST ${notImplementedRows.find(r=>r.id==='OPTIONAL_COST')?.count ?? 0}件含む）` : ''),
  '',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 「⚡ 部分実装一覧」セクションを再生成（件数順）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 全STUB一覧から⚡行をすべて収集して件数順
// 既存の⚡テーブルと新規追加分をまとめる
const partialByIdMap = {};
for (const r of partialRows) {
  // STUB IDが重複する場合はスキップ（2行目エントリ）
  if (!partialByIdMap[r.id]) {
    partialByIdMap[r.id] = r;
  }
}
const sortedPartial = Object.values(partialByIdMap).sort((a, b) => b.count - a.count);

// ⚡一覧をSTUBS IDとnoteで表示
const partialSection = [
  '## ⚡ 部分実装一覧（主要動作あり・フォールバックあり）',
  '',
  '主要パターンは動作するが一部ケースはSTUB_LOGのみ。件数の多い順。',
  '',
  '| 件数 | effectType | STUB ID |',
  '|-----:|-----------|---------|',
  ...sortedPartial.map(r => `| ${r.count} | ${r.effectType} | ${r.id} |`),
  '',
  `**合計: ${sortedPartial.length}種**`,
  '',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 集計サマリーを更新
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ✅ / ⚡ / 📝 の件数を全STUB一覧から再集計
let implemented = 0, partial = 0, notImpl = 0;
for (const line of updatedLines) {
  if (!line.startsWith('|')) continue;
  if (line.includes('| ✅ |')) implemented++;
  else if (line.includes('| ⚡ |')) partial++;
  else if (line.includes('| 📝 |')) notImpl++;
}
const total = implemented + partial + notImpl;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 全体を組み立てて置換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let finalContent = updatedLines.join('\n');

// バージョンタグを更新
finalContent = finalContent.replace(
  /最終更新: \d{4}-\d{2}-\d{2} \(v[\d.]+\)/,
  '最終更新: 2026-06-01 (v0.152)'
);

// 「📝 未実装一覧」セクションを置換
{
  const sectionStartRe = /## 📝 未実装一覧[\s\S]*?\*\*合計:.*?\n/;
  finalContent = finalContent.replace(sectionStartRe, notImplSection.join('\n') + '\n');
}

// 「⚡ 部分実装一覧」セクションを置換
{
  const sectionStartRe = /## ⚡ 部分実装一覧[\s\S]*?\*\*合計: \d+種\*\*\n/;
  finalContent = finalContent.replace(sectionStartRe, partialSection.join('\n') + '\n');
}

// 集計サマリーを更新
finalContent = finalContent.replace(
  /## 集計サマリー[\s\S]*?\n\*\*注意事項:\*\*/,
  [
    `## 集計サマリー（v0.152）`,
    '',
    '| カテゴリ | 種数 |',
    '|---------|-----:|',
    `| ✅ 実装済み | ${implemented} |`,
    `| ⚡ 部分実装 | ${partial} |`,
    `| 📝 未実装（ログのみ） | ${notImpl} |`,
    `| **合計** | **${total}** |`,
    '',
    '**注意事項:**',
  ].join('\n')
);

writeFileSync(STUBS_PATH, finalContent, 'utf8');

console.log(`完了: ${changedCount} 件の📝を更新`);
console.log(`  ✅ 新規: ${Object.values(RECLASSIFY_MAP).filter(r=>r.status==='✅').length}件`);
console.log(`  ⚡ 新規: ${Object.values(RECLASSIFY_MAP).filter(r=>r.status==='⚡').length}件`);
console.log(`  📝 残り: ${notImplementedRows.length}種 / 約${notImplTotal}件`);
console.log(`  全体: ✅${implemented} ⚡${partial} 📝${notImpl} (合計${total}種)`);
