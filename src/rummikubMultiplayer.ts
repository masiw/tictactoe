import {
  get,
  limitToLast,
  onValue,
  orderByKey,
  push,
  query,
  ref,
  runTransaction,
  set,
} from 'firebase/database';
import { getDb } from './firebase';
import {
  HAND_SIZE,
  deal,
  handScore,
  parseTable,
  parseTiles,
  serializeTable,
  serializeTiles,
  validateCommit,
  type Table,
  type Tile,
} from './rummikub';

export const MOVE_CLOCK_MS = 2 * 60 * 1000;
export const FINISHED_VISIBILITY_MS = 4000;
const GAMES_PATH = 'rummikub';
const REMEMBERED_GAME_KEY = 'rummikub.gameId';
const MAX_GAMES_SCAN = 50;

export type Role = 'p1' | 'p2';

export type Player = { id: string; hand: Tile[] };

export type GameState = {
  state: 'waiting' | 'playing' | 'finished';
  p1: Player | null;
  p2: Player | null;
  table: Table;
  pool: Tile[];
  turn: Role;
  openingP1: boolean;
  openingP2: boolean;
  winner: Role | 'draw' | null;
  createdAt: number;
  lastMoveAt: number;
  consecutivePasses: number;
};

export type GameWithId = { id: string; state: GameState };

export type Action =
  | { kind: 'commit'; table: Table; hand: Tile[] }
  | { kind: 'draw' }
  | { kind: 'pass' };

export function isExpired(state: GameState, now: number): boolean {
  if (state.state === 'finished') return false;
  return now - state.lastMoveAt > MOVE_CLOCK_MS;
}

export function myRole(state: GameState, myId: string): Role | null {
  if (state.p1?.id === myId) return 'p1';
  if (state.p2?.id === myId) return 'p2';
  return null;
}

export function openingDoneFor(state: GameState, role: Role): boolean {
  return role === 'p1' ? state.openingP1 : state.openingP2;
}

export function shouldForfeit(state: GameState, myId: string, now: number): Role | null {
  if (state.state !== 'playing') return null;
  if (now - state.lastMoveAt <= MOVE_CLOCK_MS) return null;
  const me = myRole(state, myId);
  if (!me) return null;
  if (state.turn === me) return null;
  return me;
}

export type MatchAction =
  | { kind: 'rejoin'; gameId: string; role: Role }
  | { kind: 'join'; gameId: string }
  | { kind: 'create' };

export type MatchResult = { action: MatchAction; toDelete: string[] };

export function planMatch(
  games: GameWithId[],
  rememberedGameId: string | null,
  myId: string,
  now: number,
): MatchResult {
  if (rememberedGameId) {
    const mine = games.find((g) => g.id === rememberedGameId);
    if (
      mine &&
      mine.state.state !== 'finished' &&
      !isExpired(mine.state, now) &&
      myRole(mine.state, myId)
    ) {
      const role = myRole(mine.state, myId) as Role;
      return { action: { kind: 'rejoin', gameId: mine.id, role }, toDelete: [] };
    }
  }
  const toDelete: string[] = [];
  for (const g of games) {
    if (g.state.state === 'finished' || isExpired(g.state, now)) {
      toDelete.push(g.id);
      continue;
    }
    if (g.state.state === 'waiting' && !g.state.p2 && g.state.p1?.id !== myId) {
      return { action: { kind: 'join', gameId: g.id }, toDelete };
    }
    break;
  }
  return { action: { kind: 'create' }, toDelete };
}

export function clientId(): string {
  // Shared with the other games — same person, same id.
  const key = 'tictactoe.clientId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function rememberedGameId(): string | null {
  return localStorage.getItem(REMEMBERED_GAME_KEY);
}
export function rememberGame(gameId: string): void {
  localStorage.setItem(REMEMBERED_GAME_KEY, gameId);
}
export function forgetGame(): void {
  localStorage.removeItem(REMEMBERED_GAME_KEY);
}

function isPlayer(v: unknown): v is Player {
  if (!v || typeof v !== 'object') return false;
  const o = v as { id?: unknown };
  return typeof o.id === 'string' && o.id.length > 0;
}

function parsePlayer(p: Player | null): Player | null {
  if (!p) return null;
  const handStr = (p as unknown as { hand?: unknown }).hand;
  return { id: p.id, hand: parseTiles(handStr) };
}

function serializePlayer(p: Player): Record<string, unknown> {
  return { id: p.id, hand: serializeTiles(p.hand) };
}

export function normalize(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.state !== 'waiting' && r.state !== 'playing' && r.state !== 'finished') {
    return null;
  }
  const createdAt = typeof r.createdAt === 'number' ? r.createdAt : 0;
  return {
    state: r.state,
    p1: isPlayer(r.p1) ? parsePlayer(r.p1 as Player) : null,
    p2: isPlayer(r.p2) ? parsePlayer(r.p2 as Player) : null,
    table: parseTable(r.table),
    pool: parseTiles(r.pool),
    turn: r.turn === 'p2' ? 'p2' : 'p1',
    openingP1: r.openingP1 === true,
    openingP2: r.openingP2 === true,
    winner:
      r.winner === 'p1' || r.winner === 'p2' || r.winner === 'draw' ? r.winner : null,
    createdAt,
    lastMoveAt: typeof r.lastMoveAt === 'number' ? r.lastMoveAt : createdAt,
    consecutivePasses:
      typeof r.consecutivePasses === 'number' && r.consecutivePasses >= 0
        ? Math.floor(r.consecutivePasses)
        : 0,
  };
}

function gameRef(gameId: string) {
  return ref(getDb(), `${GAMES_PATH}/${gameId}`);
}

async function readGames(): Promise<GameWithId[]> {
  const snap = await get(
    query(ref(getDb(), GAMES_PATH), orderByKey(), limitToLast(MAX_GAMES_SCAN)),
  );
  const val = snap.val() as Record<string, unknown> | null;
  if (!val) return [];
  const list: GameWithId[] = [];
  for (const [id, raw] of Object.entries(val)) {
    const state = normalize(raw);
    if (state) list.push({ id, state });
  }
  list.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return list;
}

function deleteGame(gameId: string): void {
  void set(gameRef(gameId), null).catch(() => {});
}

function scheduleFinishedDelete(gameId: string): void {
  setTimeout(() => deleteGame(gameId), FINISHED_VISIBILITY_MS);
}

function freshGame(myId: string, now: number): GameState {
  const { hand, pool } = deal();
  return {
    state: 'waiting',
    p1: { id: myId, hand },
    p2: null,
    table: [],
    pool,
    turn: 'p1',
    openingP1: false,
    openingP2: false,
    winner: null,
    createdAt: now,
    lastMoveAt: now,
    consecutivePasses: 0,
  };
}

function toWire(state: GameState): Record<string, unknown> {
  return {
    state: state.state,
    p1: state.p1 ? serializePlayer(state.p1) : null,
    p2: state.p2 ? serializePlayer(state.p2) : null,
    table: serializeTable(state.table),
    pool: serializeTiles(state.pool),
    turn: state.turn,
    openingP1: state.openingP1,
    openingP2: state.openingP2,
    winner: state.winner,
    createdAt: state.createdAt,
    lastMoveAt: state.lastMoveAt,
    consecutivePasses: state.consecutivePasses,
  };
}

export type ClaimResult = { gameId: string; role: Role };

export async function claimMatch(myId: string, now: number): Promise<ClaimResult> {
  const games = await readGames();
  const plan = planMatch(games, rememberedGameId(), myId, now);

  for (const id of plan.toDelete) deleteGame(id);

  if (plan.action.kind === 'rejoin') {
    rememberGame(plan.action.gameId);
    return { gameId: plan.action.gameId, role: plan.action.role };
  }

  if (plan.action.kind === 'join') {
    const joinId = plan.action.gameId;
    // Keep an active listener so runTransaction's first call sees real data,
    // not a cache-miss null (see multiplayer.ts for the full rationale).
    let releaseListener: () => void = () => {};
    await new Promise<void>((resolve) => {
      releaseListener = onValue(gameRef(joinId), () => resolve());
    });
    try {
      const result = await runTransaction(gameRef(joinId), (raw: unknown) => {
        const cur = normalize(raw);
        if (
          !cur ||
          cur.state !== 'waiting' ||
          cur.p2 ||
          cur.p1?.id === myId ||
          isExpired(cur, now)
        ) {
          return;
        }
        // Draw P2's hand off the top of the pool.
        const p2Hand = cur.pool.slice(0, HAND_SIZE);
        const next: GameState = {
          ...cur,
          p2: { id: myId, hand: p2Hand },
          pool: cur.pool.slice(HAND_SIZE),
          state: 'playing',
          turn: 'p1',
          lastMoveAt: now,
        };
        return toWire(next);
      });
      if (result.committed) {
        rememberGame(joinId);
        return { gameId: joinId, role: 'p2' };
      }
    } finally {
      releaseListener();
    }
  }

  return createNewGame(myId, now);
}

async function createNewGame(myId: string, now: number): Promise<ClaimResult> {
  const newRef = push(ref(getDb(), GAMES_PATH));
  if (!newRef.key) throw new Error('Firebase push() returned a ref without a key');
  await set(newRef, toWire(freshGame(myId, now)));
  rememberGame(newRef.key);
  return { gameId: newRef.key, role: 'p1' };
}

export function subscribeGame(
  gameId: string,
  cb: (state: GameState | null) => void,
): () => void {
  return onValue(gameRef(gameId), (snap) => cb(normalize(snap.val())));
}

export type MoveOutcome = 'ok' | 'finished' | 'not-your-turn' | 'invalid-move' | 'not-playing';

export async function applyAction(
  gameId: string,
  action: Action,
  myId: string,
  now: number,
): Promise<MoveOutcome> {
  let outcome: MoveOutcome = 'ok';
  await runTransaction(gameRef(gameId), (raw: unknown) => {
    const cur = normalize(raw);
    if (!cur || cur.state !== 'playing') {
      outcome = 'not-playing';
      return raw;
    }
    const sym = myRole(cur, myId);
    if (!sym || cur.turn !== sym) {
      outcome = 'not-your-turn';
      return toWire(cur);
    }
    const me = sym === 'p1' ? cur.p1 : cur.p2;
    if (!me) {
      outcome = 'invalid-move';
      return toWire(cur);
    }

    const next: GameState = { ...cur };

    if (action.kind === 'commit') {
      const check = validateCommit(
        cur.table,
        me.hand,
        action.table,
        action.hand,
        openingDoneFor(cur, sym),
      );
      if (!check.ok) {
        outcome = 'invalid-move';
        return toWire(cur);
      }
      next.table = action.table.filter((s) => s.length > 0);
      const updatedMe: Player = { id: me.id, hand: action.hand };
      if (sym === 'p1') {
        next.p1 = updatedMe;
        next.openingP1 = true;
      } else {
        next.p2 = updatedMe;
        next.openingP2 = true;
      }
      next.consecutivePasses = 0;
    } else if (action.kind === 'draw') {
      if (cur.pool.length === 0) {
        outcome = 'invalid-move';
        return toWire(cur);
      }
      const drawn = cur.pool[0];
      const updatedMe: Player = { id: me.id, hand: [...me.hand, drawn] };
      if (sym === 'p1') next.p1 = updatedMe;
      else next.p2 = updatedMe;
      next.pool = cur.pool.slice(1);
      next.consecutivePasses = 0;
    } else {
      // pass — only legal when the pool is empty (otherwise you must draw)
      if (cur.pool.length > 0) {
        outcome = 'invalid-move';
        return toWire(cur);
      }
      next.consecutivePasses = cur.consecutivePasses + 1;
    }

    next.lastMoveAt = now;
    next.turn = sym === 'p1' ? 'p2' : 'p1';

    const meAfter = sym === 'p1' ? next.p1! : next.p2!;
    if (meAfter.hand.length === 0) {
      next.state = 'finished';
      next.winner = sym;
      outcome = 'finished';
    } else if (next.consecutivePasses >= 2) {
      const p1Pips = next.p1 ? handScore(next.p1.hand) : 0;
      const p2Pips = next.p2 ? handScore(next.p2.hand) : 0;
      next.state = 'finished';
      next.winner = p1Pips < p2Pips ? 'p1' : p2Pips < p1Pips ? 'p2' : 'draw';
      outcome = 'finished';
    }

    return toWire(next);
  });
  if ((outcome as MoveOutcome) === 'finished') {
    scheduleFinishedDelete(gameId);
  }
  return outcome;
}

export async function declareForfeit(
  gameId: string,
  myId: string,
  now: number,
): Promise<boolean> {
  let won = false;
  await runTransaction(gameRef(gameId), (raw: unknown) => {
    const cur = normalize(raw);
    const winnerSym = cur ? shouldForfeit(cur, myId, now) : null;
    if (!cur || !winnerSym) return cur ? toWire(cur) : raw;
    won = true;
    return toWire({ ...cur, state: 'finished', winner: winnerSym });
  });
  if (won) scheduleFinishedDelete(gameId);
  return won;
}
