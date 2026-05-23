import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '@supabase/supabase-js';
import type { CardData, PlayerState, TurnPhase, Deck } from '../types';
import { buildEffectsMap } from '../data/effectParser';
import { executeEffect, getCardNum } from '../engine/effectExecutor';
import { calcFieldPowers } from '../engine/effectEngine';
import { hasKeyword } from '../utils/keywords';
import type { ExecCtx } from '../engine/effectExecutor';
import type { PendingInteractionDef } from '../types';

// ======= 定数 =======
const CPU_ID = 'cpu';
const HAND_INIT = 5;
const LIFE_DEFAULT = 5;
const CPU_DELAY = 700; // CPU行動のディレイ（ms）

// ======= ユーティリティ =======
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignInstanceIds(cards: string[]): string[] {
  const counts: Record<string, number> = {};
  return cards.map(cn => {
    counts[cn] = (counts[cn] ?? 0) + 1;
    return `${cn}#${counts[cn]}`;
  });
}

class InstanceMap<V> extends Map<string, V> {
  override get(id: string): V | undefined { return super.get(getCardNum(id)); }
  override has(id: string): boolean       { return super.has(getCardNum(id)); }
}

function makeEmptyPlayerState(): PlayerState {
  return {
    deck: [], lrig_deck: [], hand: [], life_cloth: [], trash: [], lrig_trash: [],
    energy: [], coins: 0,
    field: { lrig: [], signi: [null, null, null], signi_down: [false,false,false], signi_frozen: [false,false,false], lrig_down: false },
    temp_power_mods: [], keyword_grants: {}, blocked_actions: [], actions_done: [],
    pending_crashed_cards: [],
  };
}

function parseEnergyCost(costStr: string): Array<{color: string; count: number}> {
  if (!costStr || costStr === '-') return [];
  const result: Array<{color: string; count: number}> = [];
  const colorMap: Record<string, string> = { '白': '白', '赤': '赤', '青': '青', '緑': '緑', '黒': '黒', '無': '無' };
  const re = /《([白赤青緑黒無])》/g;
  let m;
  while ((m = re.exec(costStr)) !== null) {
    const col = colorMap[m[1]] ?? '無';
    const existing = result.find(r => r.color === col);
    if (existing) existing.count++;
    else result.push({ color: col, count: 1 });
  }
  return result;
}

function canPayCost(energyNums: string[], costStr: string, cardMap: Map<string, CardData>): boolean {
  const required = parseEnergyCost(costStr);
  if (required.length === 0) return true;
  const energyCounts: Record<string, number> = {};
  for (const num of energyNums) {
    const card = cardMap.get(num);
    if (!card) continue;
    const colors = card.Color?.split('/') ?? ['無'];
    for (const c of colors) {
      energyCounts[c] = (energyCounts[c] ?? 0) + 1;
    }
  }
  const availMugen = Object.values(energyCounts).reduce((a, b) => a + b, 0);
  let mugenUsed = 0;
  for (const { color, count } of required) {
    if (color === '無') { mugenUsed += count; continue; }
    if ((energyCounts[color] ?? 0) < count) return false;
  }
  return (availMugen - Object.entries(required).filter(([,{color}]:any) => color !== '無').reduce((s, [,{count}]:any) => s + count, 0)) >= mugenUsed;
}

function payCost(energyNums: string[], costStr: string, cardMap: Map<string, CardData>): { paid: string[]; remaining: string[] } {
  const required = parseEnergyCost(costStr);
  if (required.length === 0) return { paid: [], remaining: [...energyNums] };
  const remaining = [...energyNums];
  const paid: string[] = [];
  for (const { color, count } of required.filter(r => r.color !== '無')) {
    let left = count;
    for (let i = remaining.length - 1; i >= 0 && left > 0; i--) {
      const card = cardMap.get(remaining[i]);
      if (card?.Color?.includes(color)) { paid.push(remaining.splice(i, 1)[0]); left--; }
    }
  }
  const mugenCount = required.filter(r => r.color === '無').reduce((s, r) => s + r.count, 0);
  for (let left = mugenCount; left > 0 && remaining.length > 0; left--) {
    paid.push(remaining.splice(remaining.length - 1, 1)[0]);
  }
  return { paid, remaining };
}

// ======= ゲーム状態型 =======
interface CpuGameState {
  phase: TurnPhase;
  turnPlayer: 'player' | 'cpu';
  player: PlayerState;
  cpu: PlayerState;
  logs: string[];
  winner: 'player' | 'cpu' | null;
  // 効果インタラクション
  pendingInteraction: PendingInteractionDef | null;
  pendingOwner: 'player' | 'cpu' | null;
  // シグニアタック管理
  attackingSigniIdx: number | null; // 現在アタック中のシグニゾーンindex
  signiAttackQueue: number[];       // アタック待ちのシグニゾーンindexリスト
  // ライフバースト
  burstCard: string | null;
  burstOwner: 'player' | 'cpu' | null;
  // ガード
  guardPending: boolean;
  guardOwner: 'player' | 'cpu' | null;
}

// ======= カード選択UIの状態 =======
type SelectingFor = { zone: number } | null;

interface Props {
  user: User;
  myDeckId: string;
  decks: Deck[];
  cards: CardData[];
  onBack: () => void;
}

export default function CpuBattleScreen({ user: _user, myDeckId, decks, cards, onBack }: Props) {
  const [gs, setGs] = useState<CpuGameState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [selectingFor, setSelectingFor] = useState<SelectingFor>(null);
  const [effectSelNums, setEffectSelNums] = useState<string[]>([]);
  const [expandedImg, setExpandedImg] = useState<string | null>(null);
  const cpuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gsRef = useRef<CpuGameState | null>(null);
  gsRef.current = gs;

  const cardMap = useMemo(() => {
    const m = new InstanceMap<CardData>();
    for (const c of cards) m.set(c.CardNum, c);
    return m;
  }, [cards]);

  const effectsMap = useMemo(() => new InstanceMap(buildEffectsMap(cards)), [cards]);

  const appendLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-60), msg]);
  }, []);

  // ======= 初期化 =======
  useEffect(() => {
    const myDeck = decks.find(d => d.id === myDeckId);
    if (!myDeck) return;

    // CPUは別のデッキを選ぶ（なければ同じデッキ）
    const cpuDeck = decks.find(d => d.id !== myDeckId) ?? myDeck;

    const initPlayer = (deck: Deck, name: string): PlayerState => {
      const main = assignInstanceIds(shuffle([...deck.mainDeck]));
      const lrig = assignInstanceIds([...deck.lrigDeck]);
      const lrigCard = cardMap.get(lrig[0] ?? '');
      const limit = parseInt(lrigCard?.Limit ?? String(LIFE_DEFAULT), 10);
      const lifeCount = isNaN(limit) || limit <= 0 ? LIFE_DEFAULT : Math.min(limit, 12);
      const life = main.splice(0, lifeCount);
      const hand = main.splice(0, HAND_INIT);
      appendLog(`[${name}] 初期化: ライフ${life.length}枚`);
      return {
        ...makeEmptyPlayerState(),
        deck: main,
        lrig_deck: lrig,
        hand,
        life_cloth: life,
        field: { ...makeEmptyPlayerState().field, lrig: lrig[0] ? [lrig[0]] : [] },
      };
    };

    const player = initPlayer(myDeck, 'プレイヤー');
    const cpu    = initPlayer(cpuDeck, 'CPU');

    setGs({
      phase: 'DRAW', turnPlayer: 'player',
      player, cpu, logs: [],
      winner: null,
      pendingInteraction: null, pendingOwner: null,
      attackingSigniIdx: null, signiAttackQueue: [],
      burstCard: null, burstOwner: null,
      guardPending: false, guardOwner: null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ======= ゲーム終了チェック =======
  const checkWin = useCallback((g: CpuGameState): CpuGameState => {
    if (g.player.life_cloth.length === 0 && g.winner === null)
      return { ...g, winner: 'cpu' };
    if (g.cpu.life_cloth.length === 0 && g.winner === null)
      return { ...g, winner: 'player' };
    return g;
  }, []);

  // ======= ターン所有者のstate取得 =======
  const myState   = (g: CpuGameState) => g.turnPlayer === 'player' ? g.player : g.cpu;
  const oppState  = (g: CpuGameState) => g.turnPlayer === 'player' ? g.cpu    : g.player;
  const setMyState  = (g: CpuGameState, s: PlayerState): CpuGameState =>
    g.turnPlayer === 'player' ? { ...g, player: s } : { ...g, cpu: s };
  const setOppState = (g: CpuGameState, s: PlayerState): CpuGameState =>
    g.turnPlayer === 'player' ? { ...g, cpu: s }    : { ...g, player: s };

  // ======= 効果実行ヘルパー =======
  const execEffect = useCallback((g: CpuGameState, cardNum: string, effectType: string): CpuGameState => {
    const effs = effectsMap.get(cardNum) ?? [];
    const eff = effs.find(e => e.effectType === effectType);
    if (!eff) return g;
    const owner   = g.turnPlayer === 'player' ? g.player : g.cpu;
    const other   = g.turnPlayer === 'player' ? g.cpu    : g.player;
    const isMyTurn = true;
    const ctxPowers = calcFieldPowers(owner, other, isMyTurn, effectsMap, cardMap);
    const ctx: ExecCtx = { ownerState: owner, otherState: other, cardMap, logs: [], effectivePowers: ctxPowers, sourceCardNum: cardNum };
    const result = executeEffect(eff, ctx);
    for (const l of result.logs) appendLog(l);
    let ng = g.turnPlayer === 'player'
      ? { ...g, player: result.ownerState, cpu: result.otherState }
      : { ...g, cpu: result.ownerState, player: result.otherState };
    if (!result.done && result.pending) {
      ng = { ...ng, pendingInteraction: result.pending, pendingOwner: g.turnPlayer };
    }
    return ng;
  }, [effectsMap, cardMap, appendLog]);

  // ======= フェーズ自動進行 =======
  const advancePhase = useCallback((g: CpuGameState): CpuGameState => {
    const phaseOrder: TurnPhase[] = ['UP', 'DRAW', 'ENERGY', 'GROW', 'MAIN', 'ATTACK_ARTS', 'ATTACK_SIGNI', 'ATTACK_LRIG', 'END'];
    const idx = phaseOrder.indexOf(g.phase);
    const next = phaseOrder[idx + 1] ?? 'UP';
    if (next === 'UP') {
      // ターンチェンジ
      const nextPlayer = g.turnPlayer === 'player' ? 'cpu' : 'player';
      appendLog(`--- ${nextPlayer === 'player' ? 'プレイヤー' : 'CPU'} のターン ---`);
      return { ...g, phase: 'UP', turnPlayer: nextPlayer };
    }
    return { ...g, phase: next };
  }, [appendLog]);

  // ======= UP フェイズ処理 =======
  const processUp = useCallback((g: CpuGameState): CpuGameState => {
    const s = myState(g);
    const newSigniDown = [false, false, false] as [boolean, boolean, boolean];
    const frozen = s.field.signi_frozen ?? [false, false, false];
    const newFrozen = frozen.map(f => false) as [boolean, boolean, boolean];
    const newS: PlayerState = {
      ...s,
      field: {
        ...s.field,
        signi_down: newSigniDown,
        signi_frozen: newFrozen,
        lrig_down: (s.field.lrig_down ?? false) && (s.field.lrig_frozen ?? false),
        lrig_frozen: false,
      },
      temp_power_mods: [],
      keyword_grants: {},
      blocked_actions: [],
      actions_done: [],
    };
    appendLog(`[${g.turnPlayer === 'player' ? 'P' : 'CPU'}] アップフェイズ`);
    return setMyState(advancePhase(setMyState(g, newS)), newS);
  }, [appendLog, advancePhase, setMyState]);

  // ======= DRAW フェイズ =======
  const processDraw = useCallback((g: CpuGameState): CpuGameState => {
    const s = myState(g);
    if (s.deck.length === 0) {
      appendLog(`[${g.turnPlayer}] デッキ切れ → 敗北`);
      return checkWin({ ...g, winner: g.turnPlayer === 'player' ? 'cpu' : 'player' });
    }
    const [drawn, ...rest] = s.deck;
    const newS = { ...s, deck: rest, hand: [...s.hand, drawn] };
    appendLog(`[${g.turnPlayer === 'player' ? 'P' : 'CPU'}] ドロー`);
    return advancePhase(setMyState(g, newS));
  }, [appendLog, advancePhase, checkWin, setMyState]);

  // ======= ENERGY フェイズ =======
  const processEnergy = useCallback((g: CpuGameState, handIdx: number): CpuGameState => {
    const s = myState(g);
    if (handIdx < 0 || handIdx >= s.hand.length) return g;
    const card = s.hand[handIdx];
    const newHand = s.hand.filter((_, i) => i !== handIdx);
    const newS = { ...s, hand: newHand, energy: [...s.energy, card] };
    appendLog(`[${g.turnPlayer === 'player' ? 'P' : 'CPU'}] エナチャージ`);
    return advancePhase(setMyState(g, newS));
  }, [appendLog, advancePhase, setMyState]);

  // ======= シグニ配置 =======
  const placeSigni = useCallback((g: CpuGameState, handIdx: number, zoneIdx: number): CpuGameState => {
    const s = myState(g);
    const cardInstId = s.hand[handIdx];
    if (!cardInstId) return g;
    const card = cardMap.get(cardInstId);
    if (!card || card.Type !== 'シグニ') return g;

    // コスト支払い
    if (!canPayCost(s.energy, card.Cost, cardMap)) return g;
    const { paid, remaining } = payCost(s.energy, card.Cost, cardMap);
    const newHand = s.hand.filter((_, i) => i !== handIdx);
    const newSigni = [...s.field.signi] as (string[] | null)[];

    // 既存シグニをトラッシュへ
    const prev = newSigni[zoneIdx];
    const trashed = prev ? [...s.trash, ...prev] : s.trash;
    newSigni[zoneIdx] = [cardInstId];

    const newS: PlayerState = {
      ...s, hand: newHand, energy: remaining,
      trash: [...trashed, ...paid],
      field: { ...s.field, signi: newSigni },
    };
    appendLog(`[${g.turnPlayer === 'player' ? 'P' : 'CPU'}] ${card.CardName} を配置`);

    // 出現効果
    let ng = setMyState(g, newS);
    // 簡易：出現効果は効果エンジンで処理（コールバックはUIに委ねる）
    return ng;
  }, [cardMap, appendLog, setMyState]);

  // ======= シグニアタック =======
  const signiAttack = useCallback((g: CpuGameState, zoneIdx: number): CpuGameState => {
    const attacker = myState(g);
    const defender = oppState(g);
    const attkStack = attacker.field.signi[zoneIdx];
    if (!attkStack?.length) return g;
    const attkInstId = attkStack[attkStack.length - 1];
    const attkCard = cardMap.get(attkInstId);
    if (!attkCard) return g;

    const isDown = attacker.field.signi_down?.[zoneIdx] ?? false;
    const hasSleeperAttacker = hasKeyword(attkInstId, cardMap, attacker.keyword_grants ?? {}, 'スリープアタッカー');
    if (isDown && !hasSleeperAttacker) return g;

    // アタッカーをダウン
    const newAttkDown = [...(attacker.field.signi_down ?? [false,false,false])] as [boolean,boolean,boolean];
    newAttkDown[zoneIdx] = true;
    const newAttacker = { ...attacker, field: { ...attacker.field, signi_down: newAttkDown } };

    const defStack = defender.field.signi[zoneIdx];
    const defInstId = defStack?.at(-1);

    if (!defInstId) {
      // 空きゾーン → ライフクラッシュ
      if (defender.life_cloth.length === 0) {
        appendLog(`${attkCard.CardName} がアタック → 相手ライフなし`);
        return checkWin(setMyState(setOppState(g, defender), newAttacker));
      }
      const crashed = defender.life_cloth[defender.life_cloth.length - 1];
      const newLife = defender.life_cloth.slice(0, -1);
      const crashedCard = cardMap.get(crashed);
      appendLog(`${attkCard.CardName} がアタック → ライフクラッシュ: ${crashedCard?.CardName ?? crashed}`);
      const newDefender = { ...defender, life_cloth: newLife, energy: [...defender.energy, crashed] };

      let ng = setOppState(setMyState(g, newAttacker), newDefender);
      ng = checkWin(ng);
      if (ng.winner) return ng;

      // バースト確認
      if ((crashedCard?.LifeBurst ?? '0') === '1') {
        const burstOwner = g.turnPlayer === 'player' ? 'cpu' : 'player';
        return { ...ng, burstCard: crashed, burstOwner };
      }
      return ng;
    }

    // バトル
    const defCard = cardMap.get(defInstId);
    const powers = calcFieldPowers(newAttacker, defender, g.turnPlayer === 'player', effectsMap, cardMap);
    const attkPow = powers.get(attkInstId) ?? parseInt(attkCard.Power ?? '0', 10);
    const defPow  = powers.get(defInstId) ?? parseInt(defCard?.Power ?? '0', 10);
    appendLog(`バトル: ${attkCard.CardName}(${attkPow}) vs ${defCard?.CardName ?? defInstId}(${defPow})`);

    let ng = setMyState(g, newAttacker);
    if (attkPow >= defPow) {
      // 攻撃側勝利 → 守備シグニをバニッシュ
      const newDefSigni = [...defender.field.signi] as (string[] | null)[];
      const banished = newDefSigni[zoneIdx] ?? [];
      newDefSigni[zoneIdx] = null;
      const newDefender = { ...defender, field: { ...defender.field, signi: newDefSigni }, trash: [...defender.trash, ...banished] };
      ng = setOppState(ng, newDefender);
      appendLog(`${attkCard.CardName} の勝利`);
    } else {
      appendLog(`${attkCard.CardName} の敗北（バニッシュなし）`);
    }
    return ng;
  }, [cardMap, appendLog, checkWin, effectsMap, setMyState, setOppState, myState, oppState]);

  // ======= ルリグアタック =======
  const lrigAttack = useCallback((g: CpuGameState): CpuGameState => {
    const attacker = myState(g);
    const defender = oppState(g);
    if (attacker.field.lrig_down) return g;
    if (!attacker.field.lrig.length) return g;

    const lrigInstId = attacker.field.lrig.at(-1)!;
    const lrigCard = cardMap.get(lrigInstId);
    const newAttacker = { ...attacker, field: { ...attacker.field, lrig_down: true } };

    if (defender.life_cloth.length === 0) {
      appendLog(`ルリグアタック → 相手ライフなし → 勝利`);
      return checkWin({ ...setMyState(g, newAttacker), winner: g.turnPlayer });
    }
    const crashed = defender.life_cloth[defender.life_cloth.length - 1];
    const newLife = defender.life_cloth.slice(0, -1);
    const crashedCard = cardMap.get(crashed);
    appendLog(`${lrigCard?.CardName ?? 'ルリグ'} がアタック → ライフクラッシュ: ${crashedCard?.CardName ?? crashed}`);
    const newDefender = { ...defender, life_cloth: newLife, energy: [...defender.energy, crashed] };

    let ng = setOppState(setMyState(g, newAttacker), newDefender);
    ng = checkWin(ng);
    if (ng.winner) return ng;

    if ((crashedCard?.LifeBurst ?? '0') === '1') {
      const burstOwner = g.turnPlayer === 'player' ? 'cpu' : 'player';
      return { ...ng, burstCard: crashed, burstOwner };
    }
    return ng;
  }, [cardMap, appendLog, checkWin, setMyState, setOppState, myState, oppState]);

  // ======= バースト処理 =======
  const resolveBurst = useCallback((g: CpuGameState, activate: boolean): CpuGameState => {
    const { burstCard, burstOwner } = g;
    const cleared = { ...g, burstCard: null, burstOwner: null };
    if (!activate || !burstCard || !burstOwner) return cleared;

    const effs = effectsMap.get(burstCard) ?? [];
    const burstEff = effs.find(e => e.effectType === 'LIFE_BURST');
    if (!burstEff) return cleared;

    const owner   = burstOwner === 'player' ? cleared.player : cleared.cpu;
    const other   = burstOwner === 'player' ? cleared.cpu    : cleared.player;
    const ctxPowers = calcFieldPowers(owner, other, false, effectsMap, cardMap);
    const ctx: ExecCtx = { ownerState: owner, otherState: other, cardMap, logs: [], effectivePowers: ctxPowers, sourceCardNum: burstCard };
    const result = executeEffect(burstEff, ctx);
    for (const l of result.logs) appendLog(l);

    let ng: CpuGameState = burstOwner === 'player'
      ? { ...cleared, player: result.ownerState, cpu: result.otherState }
      : { ...cleared, cpu: result.ownerState, player: result.otherState };
    ng = checkWin(ng);

    if (!result.done && result.pending) {
      return { ...ng, pendingInteraction: result.pending, pendingOwner: burstOwner };
    }
    return ng;
  }, [effectsMap, cardMap, appendLog, checkWin]);

  // ======= 効果インタラクション解決 =======
  const resolveInteraction = useCallback((g: CpuGameState, selectedNums: string[]): CpuGameState => {
    if (!g.pendingInteraction || !g.pendingOwner) return g;
    const inter = g.pendingInteraction;
    const owner  = g.pendingOwner === 'player' ? g.player : g.cpu;
    const other  = g.pendingOwner === 'player' ? g.cpu    : g.player;

    let result;
    if (inter.type === 'SELECT_TARGET') {
      const { resumeSelectTarget } = require('../engine/effectExecutor');
      const ctxPowers = calcFieldPowers(owner, other, false, effectsMap, cardMap);
      const ctx: ExecCtx = { ownerState: owner, otherState: other, cardMap, logs: [], effectivePowers: ctxPowers, sourceCardNum: '' };
      result = resumeSelectTarget(selectedNums, inter, ctx);
    } else {
      return { ...g, pendingInteraction: null, pendingOwner: null };
    }

    for (const l of result.logs) appendLog(l);
    let ng: CpuGameState = g.pendingOwner === 'player'
      ? { ...g, player: result.ownerState, cpu: result.otherState }
      : { ...g, cpu: result.ownerState, player: result.otherState };
    ng = { ...ng, pendingInteraction: null, pendingOwner: null };
    ng = checkWin(ng);

    if (!result.done && result.pending) {
      const continuation = (inter as any).continuation;
      ng = { ...ng, pendingInteraction: result.pending, pendingOwner: g.pendingOwner };
      if (continuation) ng = { ...ng, pendingInteraction: { ...result.pending, continuation } };
    }
    return ng;
  }, [effectsMap, cardMap, appendLog, checkWin]);

  // ======= CPUの行動 =======
  const cpuAction = useCallback((g: CpuGameState): CpuGameState => {
    const cpu = g.cpu;
    switch (g.phase) {
      case 'UP':
        return processUp(g);

      case 'DRAW':
        return processDraw(g);

      case 'ENERGY': {
        // ランダムに手札1枚をエナへ
        if (cpu.hand.length === 0) return advancePhase(g);
        const idx = Math.floor(Math.random() * cpu.hand.length);
        return processEnergy(g, idx);
      }

      case 'GROW':
        // グロウは未実装 → スキップ
        appendLog('[CPU] グロウスキップ');
        return advancePhase(g);

      case 'MAIN': {
        // コストが払えるシグニをランダムに配置
        const emptyZones = [0, 1, 2].filter(i => !cpu.field.signi[i]?.length);
        const signiInHand = cpu.hand.map((h, i) => ({ h, i }))
          .filter(({ h }) => cardMap.get(h)?.Type === 'シグニ' && canPayCost(cpu.energy, cardMap.get(h)?.Cost ?? '', cardMap));
        if (emptyZones.length > 0 && signiInHand.length > 0) {
          const zone = emptyZones[Math.floor(Math.random() * emptyZones.length)];
          const { i } = signiInHand[Math.floor(Math.random() * signiInHand.length)];
          return placeSigni(g, i, zone);
        }
        appendLog('[CPU] メインフェイズ終了');
        return advancePhase(g);
      }

      case 'ATTACK_ARTS':
        return advancePhase(g);

      case 'ATTACK_SIGNI': {
        // アップ状態のシグニでアタック
        const upZones = [0, 1, 2].filter(i => {
          const stack = cpu.field.signi[i];
          if (!stack?.length) return false;
          const down = cpu.field.signi_down?.[i] ?? false;
          return !down;
        });
        if (upZones.length > 0) {
          const zone = upZones[0];
          let ng = signiAttack(g, zone);
          if (ng.winner || ng.burstCard) return ng;
          return ng;
        }
        appendLog('[CPU] シグニアタック終了');
        return advancePhase(g);
      }

      case 'ATTACK_LRIG': {
        if (!cpu.field.lrig_down) {
          let ng = lrigAttack(g);
          return ng;
        }
        appendLog('[CPU] ルリグアタック終了');
        return advancePhase(g);
      }

      case 'END':
        return advancePhase(g);

      default:
        return advancePhase(g);
    }
  }, [processUp, processDraw, advancePhase, appendLog, cardMap, processEnergy, placeSigni, signiAttack, lrigAttack]);

  // ======= CPUターンのuseEffect =======
  useEffect(() => {
    if (!gs || gs.winner) return;
    if (gs.pendingInteraction || gs.burstCard) return;

    if (gs.turnPlayer !== 'cpu') return;

    cpuTimerRef.current = setTimeout(() => {
      setGs(prev => {
        if (!prev || prev.winner || prev.pendingInteraction || prev.burstCard || prev.turnPlayer !== 'cpu') return prev;
        return cpuAction(prev);
      });
    }, CPU_DELAY);

    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
  }, [gs, cpuAction]);

  // バースト処理（CPU側は自動発動）
  useEffect(() => {
    if (!gs || !gs.burstCard || !gs.burstOwner) return;
    if (gs.burstOwner === 'player') return; // プレイヤー側はUIで処理

    // CPU側は自動発動
    cpuTimerRef.current = setTimeout(() => {
      setGs(prev => {
        if (!prev || !prev.burstCard) return prev;
        return resolveBurst(prev, true);
      });
    }, CPU_DELAY);
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
  }, [gs?.burstCard, gs?.burstOwner, resolveBurst]);

  // UP/DRAW/ENERGYフェイズ（プレイヤーも自動）
  useEffect(() => {
    if (!gs || gs.winner) return;
    if (gs.turnPlayer !== 'player') return;
    if (gs.pendingInteraction || gs.burstCard) return;
    if (gs.phase !== 'UP' && gs.phase !== 'DRAW') return;

    cpuTimerRef.current = setTimeout(() => {
      setGs(prev => {
        if (!prev || prev.winner) return prev;
        if (prev.phase === 'UP')   return processUp(prev);
        if (prev.phase === 'DRAW') return processDraw(prev);
        return prev;
      });
    }, 200);
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
  }, [gs?.phase, gs?.turnPlayer, gs?.winner, processUp, processDraw]);

  // ======= プレイヤー操作ハンドラ =======
  const handleHandClick = (idx: number) => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard || gs.pendingInteraction) return;
    const card = cardMap.get(gs.player.hand[idx]);
    if (!card || card.Type !== 'シグニ') return;
    if (gs.phase !== 'MAIN') return;
    if (!canPayCost(gs.player.energy, card.Cost, cardMap)) return;
    setSelectedHandIdx(prev => prev === idx ? null : idx);
    setSelectingFor(null);
  };

  const handleZoneClick = (zoneIdx: number) => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard) return;
    if (gs.phase !== 'MAIN') return;
    if (selectedHandIdx === null) return;
    setGs(prev => {
      if (!prev || selectedHandIdx === null) return prev;
      return placeSigni(prev, selectedHandIdx, zoneIdx);
    });
    setSelectedHandIdx(null);
    setSelectingFor(null);
  };

  const handleSigniAttack = (zoneIdx: number) => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard || gs.pendingInteraction) return;
    if (gs.phase !== 'ATTACK_SIGNI') return;
    const isDown = gs.player.field.signi_down?.[zoneIdx] ?? false;
    const stack = gs.player.field.signi[zoneIdx];
    if (!stack?.length || isDown) return;
    setGs(prev => prev ? signiAttack(prev, zoneIdx) : prev);
  };

  const handleLrigAttack = () => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard || gs.pendingInteraction) return;
    if (gs.phase !== 'ATTACK_LRIG') return;
    if (gs.player.field.lrig_down) return;
    setGs(prev => prev ? lrigAttack(prev) : prev);
  };

  const handleEndPhase = () => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard || gs.pendingInteraction) return;
    setGs(prev => prev ? advancePhase(prev) : prev);
  };

  const handleEnergySelect = (idx: number) => {
    if (!gs || gs.phase !== 'ENERGY' || gs.turnPlayer !== 'player') return;
    setGs(prev => prev ? processEnergy(prev, idx) : prev);
  };

  const handleBurstActivate = (activate: boolean) => {
    setGs(prev => prev ? resolveBurst(prev, activate) : prev);
  };

  const handleEffectConfirm = () => {
    if (!gs || !gs.pendingInteraction) return;
    setGs(prev => {
      if (!prev) return prev;
      const inter = prev.pendingInteraction;
      if (!inter) return prev;
      if (inter.type === 'SELECT_TARGET') {
        const selected = effectSelNums;
        setEffectSelNums([]);
        return resolveInteraction(prev, selected);
      }
      return { ...prev, pendingInteraction: null, pendingOwner: null };
    });
    setEffectSelNums([]);
  };

  // ======= UI =======
  if (!gs) return <div style={{ color: '#fff', backgroundColor: '#000', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>読み込み中...</div>;

  const C = {
    bg: '#0a0a0f', panel: '#0f0f1a', border: '1px solid #222',
    accent: '#007bff', danger: '#e33', text: '#eee', textSub: '#888',
    green: '#1a7a3a',
  };

  const phaseLabel: Record<TurnPhase, string> = {
    UP: 'アップ', DRAW: 'ドロー', ENERGY: 'エナチャージ', GROW: 'グロウ',
    MAIN: 'メイン', ATTACK_ARTS: 'アーツ', ATTACK_SIGNI: 'シグニアタック',
    ATTACK_LRIG: 'ルリグアタック', END: 'エンド',
  };

  const renderCard = (instId: string, size = 52, onClick?: () => void, highlight?: boolean, onLongPress?: () => void) => {
    const card = cardMap.get(instId);
    const longPressTimer = { current: null as ReturnType<typeof setTimeout> | null };
    return (
      <div
        key={instId}
        style={{ width: size, height: size * 1.4, borderRadius: 4, overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
          border: highlight ? '2px solid #f44' : '1px solid #333', flexShrink: 0, position: 'relative' }}
        onPointerDown={() => {
          if (onLongPress) longPressTimer.current = setTimeout(() => { setExpandedImg(card?.ImgURL ?? null); }, 500);
        }}
        onPointerUp={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
        onPointerLeave={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
        onContextMenu={e => e.preventDefault()}
        onClick={onClick}
      >
        {card ? (
          <img src={card.ImgURL} alt={card.CardName} draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
        ) : (
          <div style={{ width: '100%', height: '100%', backgroundColor: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#555' }}>?</div>
        )}
      </div>
    );
  };

  const renderSigniZone = (instIds: string[] | null, zoneIdx: number, isDown: boolean, isPlayer: boolean, powers: Map<string, number>) => {
    const topInst = instIds?.at(-1);
    const topCard = topInst ? cardMap.get(topInst) : null;
    const pow = topInst ? (powers.get(topInst) ?? parseInt(topCard?.Power ?? '0', 10)) : 0;
    const canAtk = isPlayer && gs!.phase === 'ATTACK_SIGNI' && !!topInst && !isDown && gs!.turnPlayer === 'player';
    const canPlace = isPlayer && gs!.phase === 'MAIN' && gs!.turnPlayer === 'player' && selectedHandIdx !== null;

    return (
      <div key={zoneIdx}
        onClick={() => { if (canAtk) handleSigniAttack(zoneIdx); else if (canPlace) handleZoneClick(zoneIdx); }}
        style={{ width: 62, height: 90, border: canAtk ? '2px solid #f44' : canPlace ? '2px dashed #007bff' : '1px solid #333',
          borderRadius: 4, overflow: 'hidden', cursor: (canAtk || canPlace) ? 'pointer' : 'default',
          position: 'relative', backgroundColor: '#111', transform: isDown ? 'rotate(90deg)' : 'none' }}>
        {topInst ? (
          <>
            {renderCard(topInst, 62, undefined, false, () => {})}
            {topCard?.Power && topCard.Power !== '-' && (
              <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center',
                fontSize: 11, fontWeight: 'bold', color: '#fff',
                textShadow: '-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000', pointerEvents: 'none' }}>
                {pow.toLocaleString()}
              </div>
            )}
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 11 }}>
            {canPlace ? '▶' : zoneIdx + 1}
          </div>
        )}
      </div>
    );
  };

  const renderPlayerField = (state: PlayerState, isPlayer: boolean, powers: Map<string, number>) => {
    const lrigInst = state.field.lrig.at(-1);
    const lrigCard = lrigInst ? cardMap.get(lrigInst) : null;
    const lrigDown = state.field.lrig_down ?? false;
    const canLrigAtk = isPlayer && gs!.phase === 'ATTACK_LRIG' && gs!.turnPlayer === 'player' && !lrigDown && !!lrigInst;

    return (
      <div style={{ display: 'flex', flexDirection: isPlayer ? 'row' : 'row-reverse', alignItems: 'center', gap: 8, padding: '4px 0' }}>
        {/* ルリグ */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 52, height: 73, borderRadius: 4, overflow: 'hidden', border: canLrigAtk ? '2px solid #f44' : '1px solid #555',
            cursor: canLrigAtk ? 'pointer' : 'default', transform: lrigDown ? 'rotate(90deg)' : 'none' }}
            onClick={canLrigAtk ? handleLrigAttack : undefined}>
            {lrigCard ? (
              <img src={lrigCard.ImgURL} alt={lrigCard.CardName} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
            ) : <div style={{ width: '100%', height: '100%', backgroundColor: '#1a1a2e' }} />}
          </div>
          <span style={{ fontSize: 9, color: '#888' }}>
            {isPlayer ? 'P' : 'CPU'} ライフ:{state.life_cloth.length}
          </span>
        </div>

        {/* シグニゾーン */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map(i => {
            const stack = state.field.signi[i];
            const down = state.field.signi_down?.[i] ?? false;
            return renderSigniZone(stack, i, down, isPlayer, powers);
          })}
        </div>

        {/* エナ・手札枚数 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#888', minWidth: 40 }}>
          <span>手:{state.hand.length}</span>
          <span>エ:{state.energy.length}</span>
          <span>デ:{state.deck.length}</span>
        </div>
      </div>
    );
  };

  const playerPowers = calcFieldPowers(gs.player, gs.cpu, gs.turnPlayer === 'player', effectsMap, cardMap);
  const cpuPowers    = calcFieldPowers(gs.cpu, gs.player, gs.turnPlayer === 'cpu', effectsMap, cardMap);

  const isPlayerTurn = gs.turnPlayer === 'player';
  const canEndPhase = isPlayerTurn && !gs.winner && !gs.burstCard && !gs.pendingInteraction
    && (gs.phase === 'MAIN' || gs.phase === 'ATTACK_ARTS' || gs.phase === 'ATTACK_SIGNI' || gs.phase === 'ATTACK_LRIG' || gs.phase === 'ENERGY' || gs.phase === 'GROW');

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', color: C.text, display: 'flex', flexDirection: 'column', padding: '8px', gap: 6, userSelect: 'none' }}>

      {/* 勝敗オーバーレイ */}
      {gs.winner && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <div style={{ fontSize: 48, fontWeight: 'bold', color: gs.winner === 'player' ? '#4af' : '#f44' }}>
            {gs.winner === 'player' ? '勝利！' : '敗北…'}
          </div>
          <button onClick={onBack} style={{ padding: '12px 40px', fontSize: 16, backgroundColor: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            戻る
          </button>
        </div>
      )}

      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onBack} style={{ padding: '4px 10px', fontSize: 12, backgroundColor: 'transparent', color: '#666', border: '1px solid #333', borderRadius: 4, cursor: 'pointer' }}>
          ← 戻る
        </button>
        <span style={{ fontSize: 13, color: isPlayerTurn ? C.accent : '#aaa' }}>
          {isPlayerTurn ? 'あなたのターン' : 'CPUのターン'} — {phaseLabel[gs.phase]}
        </span>
      </div>

      {/* CPUフィールド */}
      <div style={{ backgroundColor: C.panel, borderRadius: 6, padding: '6px 8px', border: C.border }}>
        {renderPlayerField(gs.cpu, false, cpuPowers)}
        {/* CPU手札（裏向き） */}
        <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
          {gs.cpu.hand.map((_, i) => (
            <div key={i} style={{ width: 36, height: 50, borderRadius: 3, backgroundColor: '#1a1a3e', border: '1px solid #333' }} />
          ))}
        </div>
      </div>

      {/* バースト確認 */}
      {gs.burstCard && gs.burstOwner === 'player' && (() => {
        const bcard = cardMap.get(gs.burstCard);
        return (
          <div style={{ backgroundColor: '#1a1a2e', borderRadius: 6, padding: 12, border: '1px solid #66f', textAlign: 'center' }}>
            <p style={{ color: '#aaf', fontSize: 13, marginBottom: 8 }}>ライフバースト: {bcard?.CardName}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => handleBurstActivate(true)}
                style={{ padding: '8px 24px', backgroundColor: C.accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                発動する
              </button>
              <button onClick={() => handleBurstActivate(false)}
                style={{ padding: '8px 24px', backgroundColor: 'transparent', color: '#888', border: '1px solid #444', borderRadius: 6, cursor: 'pointer' }}>
                スキップ
              </button>
            </div>
          </div>
        );
      })()}

      {/* エナチャージ選択（プレイヤーターン） */}
      {gs.phase === 'ENERGY' && gs.turnPlayer === 'player' && (
        <div style={{ backgroundColor: '#1a1a2e', borderRadius: 6, padding: 8, border: '1px solid #555', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>エナチャージ: 手札から1枚選択</p>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            {gs.player.hand.map((h, i) => {
              const c = cardMap.get(h);
              return (
                <div key={i} onClick={() => handleEnergySelect(i)}
                  style={{ width: 44, height: 62, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', border: '1px solid #555' }}>
                  {c ? <img src={c.ImgURL} alt={c.CardName} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                  : <div style={{ width: '100%', height: '100%', backgroundColor: '#1a1a2e' }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* プレイヤーフィールド */}
      <div style={{ backgroundColor: C.panel, borderRadius: 6, padding: '6px 8px', border: `1px solid ${isPlayerTurn ? '#224' : '#222'}` }}>
        {renderPlayerField(gs.player, true, playerPowers)}
      </div>

      {/* プレイヤー手札 */}
      {gs.phase !== 'ENERGY' && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflowX: 'auto', padding: '4px 0' }}>
          {gs.player.hand.map((h, i) => {
            const c = cardMap.get(h);
            const canSelect = gs.phase === 'MAIN' && gs.turnPlayer === 'player' && c?.Type === 'シグニ' && canPayCost(gs.player.energy, c.Cost, cardMap);
            const isSelected = selectedHandIdx === i;
            return (
              <div key={i}
                onPointerDown={() => {
                  const timer = setTimeout(() => setExpandedImg(c?.ImgURL ?? null), 500);
                  (window as any).__longPressTimer = timer;
                }}
                onPointerUp={() => { clearTimeout((window as any).__longPressTimer); }}
                onPointerLeave={() => { clearTimeout((window as any).__longPressTimer); }}
                onContextMenu={e => e.preventDefault()}
                onClick={() => handleHandClick(i)}
                style={{ width: 52, height: 73, borderRadius: 4, overflow: 'hidden', flexShrink: 0,
                  border: isSelected ? '2px solid #4af' : canSelect ? '2px solid #007bff' : '1px solid #333',
                  cursor: canSelect ? 'pointer' : 'default', opacity: canSelect || !c ? 1 : 0.6 }}>
                {c ? <img src={c.ImgURL} alt={c.CardName} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                : <div style={{ width: '100%', height: '100%', backgroundColor: '#1a1a2e' }} />}
              </div>
            );
          })}
        </div>
      )}

      {/* フェーズ操作ボタン */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {canEndPhase && (
          <button onClick={handleEndPhase}
            style={{ flex: 1, padding: '10px 0', backgroundColor: '#334', color: C.text, border: '1px solid #445', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            {gs.phase === 'MAIN' ? 'アタックフェイズへ' :
             gs.phase === 'ATTACK_SIGNI' ? 'ルリグアタックへ' :
             gs.phase === 'ATTACK_LRIG' ? 'エンドへ' :
             gs.phase === 'GROW' ? 'グロウスキップ' :
             '次へ →'}
          </button>
        )}
        {!isPlayerTurn && (
          <div style={{ flex: 1, padding: '10px 0', backgroundColor: '#1a1a1a', color: '#555', border: '1px solid #222', borderRadius: 6, textAlign: 'center', fontSize: 13 }}>
            CPUの行動中...
          </div>
        )}
      </div>

      {/* 効果インタラクション（SELECT_TARGET） */}
      {gs.pendingInteraction?.type === 'SELECT_TARGET' && gs.pendingOwner === 'player' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, backgroundColor: 'rgba(0,0,0,0.9)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: 12, padding: '20px 16px', width: 'min(95vw,380px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', margin: 0 }}>対象を選んでください ({gs.pendingInteraction.count}体)</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {(gs.pendingInteraction as any).candidates?.map((rawId: string, idx: number) => {
                const idxStr = String(idx);
                const isSel = effectSelNums.includes(idxStr);
                const c = cardMap.get(rawId);
                return (
                  <div key={idx}
                    onClick={() => setEffectSelNums(prev => prev.includes(idxStr) ? prev.filter(x => x !== idxStr) : prev.length < (gs.pendingInteraction as any).count ? [...prev, idxStr] : prev)}
                    style={{ width: 56, height: 78, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', border: isSel ? '2px solid #f44' : '1px solid #444', position: 'relative' }}>
                    {c ? <img src={c.ImgURL} alt={c.CardName} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} /> : null}
                    {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18 }}>✓</span></div>}
                  </div>
                );
              })}
            </div>
            <button onClick={handleEffectConfirm}
              style={{ padding: '10px 0', backgroundColor: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
              決定
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ログ */}
      <div style={{ backgroundColor: '#0a0a0a', borderRadius: 4, padding: '6px 8px', fontSize: 11, color: '#666', maxHeight: 80, overflowY: 'auto' }}>
        {[...logs].reverse().slice(0, 10).map((l, i) => <div key={i}>{l}</div>)}
      </div>

      {/* 拡大表示 */}
      {expandedImg && createPortal(
        <div onPointerDown={() => setExpandedImg(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <img src={expandedImg} alt="" draggable={false} style={{ maxWidth: '85vw', maxHeight: '80vh', borderRadius: 8 }} />
        </div>,
        document.body
      )}
    </div>
  );
}
