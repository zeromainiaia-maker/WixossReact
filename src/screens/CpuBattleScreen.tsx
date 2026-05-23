import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '@supabase/supabase-js';
import type { CardData, PlayerState, TurnPhase, Deck } from '../types';
import { buildEffectsMap } from '../data/effectParser';
import { executeEffect, getCardNum, resumeSelectTarget } from '../engine/effectExecutor';
import { calcFieldPowers } from '../engine/effectEngine';
import { hasKeyword } from '../utils/keywords';
import type { ExecCtx } from '../engine/effectExecutor';
import type { PendingInteractionDef } from '../types';
import { C, PlayerField, HandCards } from '../components/BoardComponents';
import type { CardAction } from '../components/BoardComponents';

// ======= 定数 =======
const CPU_ID = 'cpu';
const HAND_INIT = 5;
const LIFE_DEFAULT = 5;
const CPU_DELAY = 700;

const PHASE_LABEL: Record<TurnPhase, string> = {
  UP: 'アップ', DRAW: 'ドロー', ENERGY: 'エナチャージ', GROW: 'グロウ',
  MAIN: 'メイン', ATTACK_ARTS: 'アーツ', ATTACK_ARTS_OP: 'アーツ（相手）',
  ATTACK_SIGNI: 'シグニアタック', ATTACK_LRIG: 'ルリグアタック', END: 'エンド',
};

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
  const re = /《([白赤青緑黒無])》/g;
  let m;
  while ((m = re.exec(costStr)) !== null) {
    const col = m[1];
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
    for (const c of colors) { energyCounts[c] = (energyCounts[c] ?? 0) + 1; }
  }
  const total = Object.values(energyCounts).reduce((a, b) => a + b, 0);
  let mugenUsed = 0;
  for (const { color, count } of required) {
    if (color === '無') { mugenUsed += count; continue; }
    if ((energyCounts[color] ?? 0) < count) return false;
  }
  const colorConsumed = required.filter(r => r.color !== '無').reduce((s, r) => s + r.count, 0);
  return (total - colorConsumed) >= mugenUsed;
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
  pendingInteraction: PendingInteractionDef | null;
  pendingOwner: 'player' | 'cpu' | null;
  attackingSigniIdx: number | null;
  signiAttackQueue: number[];
  burstCard: string | null;
  burstOwner: 'player' | 'cpu' | null;
  guardPending: boolean;
  guardOwner: 'player' | 'cpu' | null;
}

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
  const [logExpanded, setLogExpanded] = useState(false);
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [effectSelNums, setEffectSelNums] = useState<string[]>([]);
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
    const ctxPowers = calcFieldPowers(owner, other, true, effectsMap, cardMap);
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
    const newFrozen = frozen.map(_f => false) as [boolean, boolean, boolean];
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
    return advancePhase(setMyState(g, newS));
  }, [appendLog, advancePhase]);

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
  }, [appendLog, advancePhase, checkWin]);

  // ======= ENERGY フェイズ =======
  const processEnergy = useCallback((g: CpuGameState, handIdx: number): CpuGameState => {
    const s = myState(g);
    if (handIdx < 0 || handIdx >= s.hand.length) return g;
    const card = s.hand[handIdx];
    const newHand = s.hand.filter((_, i) => i !== handIdx);
    const newS = { ...s, hand: newHand, energy: [...s.energy, card] };
    appendLog(`[${g.turnPlayer === 'player' ? 'P' : 'CPU'}] エナチャージ`);
    return advancePhase(setMyState(g, newS));
  }, [appendLog, advancePhase]);

  // ======= シグニ配置 =======
  const placeSigni = useCallback((g: CpuGameState, handIdx: number, zoneIdx: number): CpuGameState => {
    const s = myState(g);
    const cardInstId = s.hand[handIdx];
    if (!cardInstId) return g;
    const card = cardMap.get(cardInstId);
    if (!card || card.Type !== 'シグニ') return g;
    if (!canPayCost(s.energy, card.Cost, cardMap)) return g;
    const { paid, remaining } = payCost(s.energy, card.Cost, cardMap);
    const newHand = s.hand.filter((_, i) => i !== handIdx);
    const newSigni = [...s.field.signi] as (string[] | null)[];
    const prev = newSigni[zoneIdx];
    const trashed = prev ? [...s.trash, ...prev] : s.trash;
    newSigni[zoneIdx] = [cardInstId];
    const newS: PlayerState = {
      ...s, hand: newHand, energy: remaining,
      trash: [...trashed, ...paid],
      field: { ...s.field, signi: newSigni },
    };
    appendLog(`[${g.turnPlayer === 'player' ? 'P' : 'CPU'}] ${card.CardName} を配置`);
    return setMyState(g, newS);
  }, [cardMap, appendLog]);

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

    const newAttkDown = [...(attacker.field.signi_down ?? [false,false,false])] as [boolean,boolean,boolean];
    newAttkDown[zoneIdx] = true;
    const newAttacker = { ...attacker, field: { ...attacker.field, signi_down: newAttkDown } };

    const defStack = defender.field.signi[zoneIdx];
    const defInstId = defStack?.at(-1);

    if (!defInstId) {
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

      if ((crashedCard?.LifeBurst ?? '0') === '1') {
        const burstOwner = g.turnPlayer === 'player' ? 'cpu' : 'player';
        return { ...ng, burstCard: crashed, burstOwner };
      }
      return ng;
    }

    const defCard = cardMap.get(defInstId);
    const powers = calcFieldPowers(newAttacker, defender, g.turnPlayer === 'player', effectsMap, cardMap);
    const attkPow = powers.get(attkInstId) ?? parseInt(attkCard.Power ?? '0', 10);
    const defPow  = powers.get(defInstId) ?? parseInt(defCard?.Power ?? '0', 10);
    appendLog(`バトル: ${attkCard.CardName}(${attkPow}) vs ${defCard?.CardName ?? defInstId}(${defPow})`);

    let ng = setMyState(g, newAttacker);
    if (attkPow >= defPow) {
      const newDefSigni = [...defender.field.signi] as (string[] | null)[];
      const banished = newDefSigni[zoneIdx] ?? [];
      newDefSigni[zoneIdx] = null;
      const newDefender = { ...defender, field: { ...defender.field, signi: newDefSigni }, trash: [...defender.trash, ...banished] };
      ng = setOppState(ng, newDefender);
      appendLog(`${attkCard.CardName} の勝利`);
    } else {
      appendLog(`${attkCard.CardName} の敗北`);
    }
    return ng;
  }, [cardMap, appendLog, checkWin, effectsMap]);

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
  }, [cardMap, appendLog, checkWin]);

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
      ng = { ...ng, pendingInteraction: result.pending, pendingOwner: g.pendingOwner };
    }
    return ng;
  }, [effectsMap, cardMap, appendLog, checkWin]);

  // ======= CPUの行動 =======
  const cpuAction = useCallback((g: CpuGameState): CpuGameState => {
    const cpu = g.cpu;
    switch (g.phase) {
      case 'UP':    return processUp(g);
      case 'DRAW':  return processDraw(g);
      case 'ENERGY': {
        if (cpu.hand.length === 0) return advancePhase(g);
        const idx = Math.floor(Math.random() * cpu.hand.length);
        return processEnergy(g, idx);
      }
      case 'GROW':
        appendLog('[CPU] グロウスキップ');
        return advancePhase(g);
      case 'MAIN': {
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
      case 'ATTACK_ARTS_OP':
        return advancePhase(g);
      case 'ATTACK_SIGNI': {
        const upZones = [0, 1, 2].filter(i => {
          const stack = cpu.field.signi[i];
          if (!stack?.length) return false;
          return !(cpu.field.signi_down?.[i] ?? false);
        });
        if (upZones.length > 0) {
          const ng = signiAttack(g, upZones[0]);
          return ng.winner || ng.burstCard ? ng : ng;
        }
        appendLog('[CPU] シグニアタック終了');
        return advancePhase(g);
      }
      case 'ATTACK_LRIG': {
        if (!cpu.field.lrig_down) return lrigAttack(g);
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
    if (!gs || gs.winner || gs.pendingInteraction || gs.burstCard || gs.turnPlayer !== 'cpu') return;
    cpuTimerRef.current = setTimeout(() => {
      setGs(prev => {
        if (!prev || prev.winner || prev.pendingInteraction || prev.burstCard || prev.turnPlayer !== 'cpu') return prev;
        return cpuAction(prev);
      });
    }, CPU_DELAY);
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
  }, [gs, cpuAction]);

  // CPU側バーストは自動発動
  useEffect(() => {
    if (!gs || !gs.burstCard || !gs.burstOwner || gs.burstOwner === 'player') return;
    cpuTimerRef.current = setTimeout(() => {
      setGs(prev => prev?.burstCard ? resolveBurst(prev, true) : prev);
    }, CPU_DELAY);
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
  }, [gs?.burstCard, gs?.burstOwner, resolveBurst]);

  // UP/DRAWフェイズ（プレイヤーも自動）
  useEffect(() => {
    if (!gs || gs.winner || gs.turnPlayer !== 'player' || gs.pendingInteraction || gs.burstCard) return;
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
  const handleZoneClick = (zoneIdx: number) => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard) return;
    if (gs.phase === 'MAIN' && selectedHandIdx !== null) {
      setGs(prev => prev ? placeSigni(prev, selectedHandIdx!, zoneIdx) : prev);
      setSelectedHandIdx(null);
    }
  };

  const handleSigniAttackAction = (zoneIdx: number) => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard || gs.pendingInteraction) return;
    if (gs.phase !== 'ATTACK_SIGNI') return;
    const isDown = gs.player.field.signi_down?.[zoneIdx] ?? false;
    const stack = gs.player.field.signi[zoneIdx];
    if (!stack?.length || isDown) return;
    setGs(prev => prev ? signiAttack(prev, zoneIdx) : prev);
  };

  const handleLrigAttackAction = () => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard || gs.pendingInteraction) return;
    if (gs.phase !== 'ATTACK_LRIG' || gs.player.field.lrig_down) return;
    setGs(prev => prev ? lrigAttack(prev) : prev);
  };

  const handleEndPhase = () => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard || gs.pendingInteraction) return;
    setGs(prev => prev ? advancePhase(prev) : prev);
  };

  const handleEnergySelect = (handIdx: number) => {
    if (!gs || gs.phase !== 'ENERGY' || gs.turnPlayer !== 'player') return;
    setGs(prev => prev ? processEnergy(prev, handIdx) : prev);
  };

  const handleBurstActivate = (activate: boolean) => {
    setGs(prev => prev ? resolveBurst(prev, activate) : prev);
  };

  const handleEffectConfirm = () => {
    if (!gs?.pendingInteraction) return;
    setGs(prev => {
      if (!prev?.pendingInteraction) return prev;
      if (prev.pendingInteraction.type === 'SELECT_TARGET') {
        const selected = effectSelNums;
        setEffectSelNums([]);
        return resolveInteraction(prev, selected);
      }
      return { ...prev, pendingInteraction: null, pendingOwner: null };
    });
    setEffectSelNums([]);
  };

  // ======= PlayerField用のアクションゲッター =======
  const getPlayerSigniZoneActions = useCallback((rawZoneIdx: number): CardAction[] => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard || gs.pendingInteraction) return [];
    if (gs.phase === 'ATTACK_SIGNI') {
      const stack = gs.player.field.signi[rawZoneIdx];
      const isDown = gs.player.field.signi_down?.[rawZoneIdx] ?? false;
      if (stack?.length && !isDown) {
        return [{ label: 'アタック', color: C.danger, onClick: () => handleSigniAttackAction(rawZoneIdx) }];
      }
    }
    if (gs.phase === 'MAIN' && selectedHandIdx !== null) {
      return [{ label: '配置', color: C.accent, onClick: () => handleZoneClick(rawZoneIdx) }];
    }
    return [];
  }, [gs, selectedHandIdx]);

  const getPlayerLrigFieldActions = useCallback((): CardAction[] => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard || gs.pendingInteraction) return [];
    if (gs.phase === 'ATTACK_LRIG' && !gs.player.field.lrig_down) {
      return [{ label: 'アタック', color: C.danger, onClick: handleLrigAttackAction }];
    }
    return [];
  }, [gs]);

  const getPlayerHandCardActions = useCallback((cardNum: string, index: number): CardAction[] => {
    if (!gs || gs.turnPlayer !== 'player' || gs.winner || gs.burstCard || gs.pendingInteraction) return [];
    if (gs.phase === 'ENERGY') {
      return [{ label: 'エナチャージ', color: C.accent, onClick: () => handleEnergySelect(index) }];
    }
    if (gs.phase === 'MAIN') {
      const card = cardMap.get(cardNum);
      if (card?.Type === 'シグニ' && canPayCost(gs.player.energy, card.Cost, cardMap)) {
        return [{
          label: selectedHandIdx === index ? '選択解除' : 'セット',
          color: selectedHandIdx === index ? C.textDim : C.success,
          onClick: () => setSelectedHandIdx(prev => prev === index ? null : index),
        }];
      }
    }
    return [];
  }, [gs, selectedHandIdx, cardMap]);

  // ======= パワー計算 =======
  const playerPowers = useMemo(() =>
    gs ? calcFieldPowers(gs.player, gs.cpu, gs.turnPlayer === 'player', effectsMap, cardMap) : new Map<string, number>(),
  [gs, effectsMap, cardMap]);

  const cpuPowers = useMemo(() =>
    gs ? calcFieldPowers(gs.cpu, gs.player, gs.turnPlayer === 'cpu', effectsMap, cardMap) : new Map<string, number>(),
  [gs, effectsMap, cardMap]);

  // ======= UI =======
  if (!gs) return (
    <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: C.bgApp, color: C.text }}>
      読み込み中...
    </div>
  );

  const isPlayerTurn = gs.turnPlayer === 'player';

  const canEndPhase = isPlayerTurn && !gs.winner && !gs.burstCard && !gs.pendingInteraction
    && ['MAIN', 'ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG', 'ENERGY', 'GROW'].includes(gs.phase);

  const phaseBtn: Partial<Record<TurnPhase, string>> = {
    MAIN: 'アタックフェイズへ',
    ATTACK_ARTS: 'アーツ終了',
    ATTACK_ARTS_OP: 'アーツ終了',
    ATTACK_SIGNI: 'ルリグアタックへ',
    ATTACK_LRIG: 'エンドへ',
    GROW: 'グロウスキップ',
    ENERGY: 'エナチャージスキップ',
  };

  return (
    <div style={{ height: '100vh', backgroundColor: C.bgApp, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* 勝敗確定ポップアップ */}
      {gs.winner && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 5000,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 16,
            padding: '40px 32px', width: 'min(88vw, 320px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
            textAlign: 'center',
          }}>
            {gs.winner === 'player' ? (
              <>
                <p style={{ fontSize: 48, margin: 0 }}>🏆</p>
                <p style={{ color: '#ffd700', fontSize: 28, fontWeight: 'bold', margin: 0 }}>勝利！</p>
                <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>おめでとうございます！</p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 48, margin: 0 }}>💀</p>
                <p style={{ color: C.danger, fontSize: 28, fontWeight: 'bold', margin: 0 }}>敗北...</p>
                <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>また挑戦しましょう！</p>
              </>
            )}
            <button onClick={onBack}
              style={{ width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                backgroundColor: C.dangerEnd, color: C.text, fontSize: 15, fontWeight: 'bold', cursor: 'pointer' }}>
              対戦終了
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* ステータスバー */}
      <div style={{
        flexShrink: 0, backgroundColor: C.bgBar, borderBottom: C.borderBar,
        padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <button onClick={onBack} style={{
          padding: '3px 10px', borderRadius: 4, border: C.borderBarBtn,
          backgroundColor: 'transparent', color: C.textVeryFaint, cursor: 'pointer', fontSize: 11,
        }}>← 戻る</button>
        <span style={{ color: C.textMuted, fontWeight: 'bold', fontSize: 13 }}>CPU対戦</span>
        <span style={{ color: isPlayerTurn ? C.accent : C.textDim, fontSize: 12, fontWeight: 'bold' }}>
          {PHASE_LABEL[gs.phase]}
        </span>

        {canEndPhase && (
          <button onClick={handleEndPhase}
            style={{ padding: '5px 16px', borderRadius: 5, border: 'none',
              backgroundColor: gs.phase === 'END' ? C.dangerDark : C.accent,
              color: C.text, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
            {phaseBtn[gs.phase] ?? '次へ'}
          </button>
        )}
        {!isPlayerTurn && (
          <span style={{ fontSize: 11, color: C.textDim }}>CPUの行動中...</span>
        )}
      </div>

      {/* 盤面エリア */}
      <div style={{ flex: 1, overflow: 'hidden', padding: 4, display: 'flex', flexDirection: 'column', gap: 3, boxSizing: 'border-box' }}>

        {/* バトルログ */}
        {logs.length > 0 && (
          <div
            onClick={() => setLogExpanded(v => !v)}
            style={{
              flexShrink: 0, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5,
              padding: '3px 8px', cursor: 'pointer', overflow: 'hidden',
              maxHeight: logExpanded ? 200 : 38, overflowY: logExpanded ? 'auto' : 'hidden',
              border: '1px solid rgba(255,255,255,0.09)', transition: 'max-height 0.2s ease',
              position: 'relative',
            }}
          >
            {[...logs].reverse().slice(0, logExpanded ? 60 : 2).map((log, i) => (
              <div key={i} style={{ fontSize: 10, color: i === 0 ? '#b8d4d4' : '#7a9a9a', lineHeight: '1.6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {log}
              </div>
            ))}
            <div style={{
              position: 'absolute', right: 6, top: '50%', transform: logExpanded ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
              fontSize: 8, color: 'rgba(255,255,255,0.3)', pointerEvents: 'none', transition: 'transform 0.2s',
            }}>▼</div>
          </div>
        )}

        {/* CPU盤面（相手） */}
        <div style={{ border: C.borderPanel, borderRadius: 6, padding: '4px 6px', backgroundColor: C.bgOpponent }}>
          <HandCards cardNums={gs.cpu.hand} cards={cards} faceDown />
          <PlayerField state={gs.cpu} cards={cards} isMe={false} effectivePowers={cpuPowers} />
        </div>

        {/* 中央区切り */}
        <div style={{ height: 2, flexShrink: 0, background: 'linear-gradient(to right, transparent, #007bff33, transparent)' }} />

        {/* プレイヤー盤面 */}
        <div style={{ border: C.borderSelf, borderRadius: 6, padding: '4px 6px', backgroundColor: C.bgSelf }}>
          <PlayerField
            state={gs.player} cards={cards} isMe={true}
            getSigniZoneActions={getPlayerSigniZoneActions}
            getLrigFieldActions={getPlayerLrigFieldActions}
            effectivePowers={playerPowers}
          />
          <HandCards cardNums={gs.player.hand} cards={cards} getCardActions={getPlayerHandCardActions} />
        </div>
      </div>

      {/* ライフバースト確認（プレイヤー側） */}
      {gs.burstCard && gs.burstOwner === 'player' && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4500,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)',
            display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
          }}>
            {(() => {
              const bcard = cards.find(c => c.CardNum === getCardNum(gs.burstCard!));
              return (
                <>
                  <p style={{ color: C.life, fontSize: 15, fontWeight: 'bold', margin: 0 }}>
                    ライフバースト！
                  </p>
                  {bcard && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <img src={bcard.ImgURL} alt={bcard.CardName}
                        style={{ width: 80, height: 112, objectFit: 'cover', borderRadius: 6, boxShadow: `0 0 14px ${C.accent}` }}
                        onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                      <p style={{ color: C.textSub, fontSize: 13, fontWeight: 'bold', margin: 0 }}>{bcard.CardName}</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => handleBurstActivate(false)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                      スキップ
                    </button>
                    <button onClick={() => handleBurstActivate(true)}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: C.accent, color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                      発動する
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* 効果インタラクション（SELECT_TARGET） */}
      {gs.pendingInteraction?.type === 'SELECT_TARGET' && gs.pendingOwner === 'player' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, backgroundColor: 'rgba(0,0,0,0.9)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12, padding: '20px 16px', width: 'min(95vw,380px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: C.textAlt, fontSize: 13, textAlign: 'center', margin: 0 }}>
              対象を選んでください ({gs.pendingInteraction.count}体)
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {(gs.pendingInteraction as any).candidates?.map((rawId: string, idx: number) => {
                const idxStr = String(idx);
                const isSel = effectSelNums.includes(idxStr);
                const c = cards.find(cd => cd.CardNum === getCardNum(rawId));
                return (
                  <div key={idx}
                    onClick={() => setEffectSelNums(prev =>
                      prev.includes(idxStr) ? prev.filter(x => x !== idxStr) :
                      prev.length < (gs.pendingInteraction as any).count ? [...prev, idxStr] : prev
                    )}
                    style={{ width: 56, height: 78, borderRadius: 4, overflow: 'hidden', cursor: 'pointer',
                      border: isSel ? `2px solid ${C.danger}` : C.borderCard, position: 'relative' }}>
                    {c ? <img src={c.ImgURL} alt={c.CardName} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} /> : null}
                    {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: C.text, fontSize: 18 }}>✓</span>
                    </div>}
                  </div>
                );
              })}
            </div>
            <button onClick={handleEffectConfirm}
              style={{ padding: '10px 0', backgroundColor: C.accent, color: C.text, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
              決定
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
