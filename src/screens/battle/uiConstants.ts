// フェイズ/じゃんけんのラベル・遷移表とセットアップ画面の共通スタイル。BattleScreen.tsx から Stage 0 で抽出。
import type { CSSProperties } from 'react';
import type { TurnPhase } from '../../types';
import { C } from '../../components/BoardComponents';

export const JANKEN_LABEL: Record<string, string> = { GU: 'グー✊', CHOKI: 'チョキ✌', PA: 'パー✋' };
export const PHASE_LABEL: Record<string, string> = {
  UP: 'アップ', DRAW: 'ドロー', ENERGY: 'エナ', GROW: 'グロウ', MAIN: 'メイン',
  ATTACK_ARTS:    'アーツステップ(自分)',
  ATTACK_ARTS_OP: 'アーツステップ(相手)',
  ATTACK_SIGNI: 'シグニアタック', ATTACK_LRIG: 'ルリグアタック', END: 'エンド',
};

export const PHASE_BTN: Record<TurnPhase, string> = {
  UP: 'ドローフェイズへ', DRAW: 'エナフェイズへ', ENERGY: 'グロウフェイズへ',
  GROW: 'メインフェイズへ', MAIN: 'アタックフェイズへ',
  ATTACK_ARTS:    'アーツ終了→相手へ',
  ATTACK_ARTS_OP: 'アーツ終了',
  ATTACK_SIGNI: 'ルリグアタックへ', ATTACK_LRIG: 'エンドフェイズへ', END: 'ターン終了',
};

export const PHASE_NEXT: Record<TurnPhase, TurnPhase> = {
  UP: 'DRAW', DRAW: 'ENERGY', ENERGY: 'GROW', GROW: 'MAIN',
  MAIN: 'ATTACK_ARTS',
  ATTACK_ARTS: 'ATTACK_ARTS_OP', ATTACK_ARTS_OP: 'ATTACK_SIGNI',
  ATTACK_SIGNI: 'ATTACK_LRIG', ATTACK_LRIG: 'END', END: 'UP',
};

// 非ターンプレイヤーが進行ボタンを持つフェイズ
export const NON_TURN_PLAYER_PHASES: TurnPhase[] = ['ATTACK_ARTS_OP'];

// 待機中メッセージ（自分がボタンを持たないフェイズ）
export const WAITING_MSG: Partial<Record<TurnPhase, string>> = {
  ATTACK_ARTS_OP: '相手のアーツステップ待機中...',
};

export const setupWrap: CSSProperties = {
  position: 'relative',
  height: '100vh', display: 'flex', flexDirection: 'column',
  justifyContent: 'center', alignItems: 'center',
  backgroundColor: C.bgSetup, gap: 20, color: C.textMuted,
  padding: 24, boxSizing: 'border-box',
};

export const primaryBtn: CSSProperties = {
  padding: '12px 32px', borderRadius: 8, border: 'none',
  backgroundColor: C.accent, color: C.text, fontSize: 15,
  fontWeight: 'bold', cursor: 'pointer',
};
