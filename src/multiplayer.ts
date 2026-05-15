import { onValue, ref, runTransaction } from 'firebase/database';
import { emptyBoard, isDraw, winner, type Cell } from './game';
import { getDb } from './firebase';

export const RESERVATION_MS = 5 * 60 * 1000;
const GAME_PATH = 'game';

export type Player = { id: string };

export type GameState = {
  state: 'waiting' | 'playing' | 'finished';
  p1: Player | null;
  p2: Player | null;
  board: Cell[];
  turn: 'X' | 'O';
  winner: 'X' | 'O' | 'draw' | null;
  createdAt: number;
};

export type Role = 'p1' | 'p2' | 'spectator';

export function isExpired(state: GameState, now: number): boolean {
  return state.state === 'waiting' && now - state.createdAt > RESERVATION_MS;
}

function freshGame(myId: string, now: number): GameState {
  return {
    state: 'waiting',
    p1: { id: myId },
    p2: null,
    board: emptyBoard(),
    turn: 'X',
    winner: null,
    createdAt: now,
  };
}

export type ResolveResult = { role: Role; next: GameState | null };

export function resolveRole(
  current: GameState | null,
  myId: string,
  now: number,
): ResolveResult {
  if (!current || current.state === 'finished' || isExpired(current, now)) {
    return { role: 'p1', next: freshGame(myId, now) };
  }
  if (current.state === 'waiting') {
    if (current.p1?.id === myId) return { role: 'p1', next: null };
    if (!current.p2) {
      return {
        role: 'p2',
        next: {
          ...current,
          p2: { id: myId },
          state: 'playing',
          turn: 'X',
        },
      };
    }
    return { role: 'spectator', next: null };
  }
  if (current.p1?.id === myId) return { role: 'p1', next: null };
  if (current.p2?.id === myId) return { role: 'p2', next: null };
  return { role: 'spectator', next: null };
}

export function clientId(): string {
  const key = 'tictactoe.clientId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

// Firebase RTDB prunes properties whose value is null, and may also turn an
// array with trailing nulls into an object keyed by index. Normalise raw
// snapshot data back into the GameState shape the rest of the code expects.
export function normalize(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.state !== 'waiting' && r.state !== 'playing' && r.state !== 'finished') {
    return null;
  }
  return {
    state: r.state,
    p1: isPlayer(r.p1) ? r.p1 : null,
    p2: isPlayer(r.p2) ? r.p2 : null,
    board: normalizeBoard(r.board),
    turn: r.turn === 'O' ? 'O' : 'X',
    winner:
      r.winner === 'X' || r.winner === 'O' || r.winner === 'draw'
        ? r.winner
        : null,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
  };
}

function isPlayer(v: unknown): v is Player {
  return !!v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string';
}

function normalizeBoard(b: unknown): Cell[] {
  const empty = emptyBoard();
  if (!b || typeof b !== 'object') return empty;
  const indexed = b as Record<string | number, unknown>;
  return empty.map((_, i) => {
    const v = indexed[i] ?? indexed[String(i)];
    return v === 'X' || v === 'O' ? v : null;
  });
}

function gameRef() {
  return ref(getDb(), GAME_PATH);
}

export async function claimRole(myId: string, now: number): Promise<Role> {
  let resolved: Role = 'spectator';
  await runTransaction(gameRef(), (raw: unknown) => {
    const current = normalize(raw);
    const { role, next } = resolveRole(current, myId, now);
    resolved = role;
    return next ?? current ?? raw;
  });
  return resolved;
}

export function subscribeGame(cb: (state: GameState | null) => void): () => void {
  return onValue(gameRef(), (snap) => cb(normalize(snap.val())));
}

export type MoveOutcome = 'ok' | 'not-your-turn' | 'cell-taken' | 'not-playing';

export async function makeMove(
  index: number,
  myId: string,
): Promise<MoveOutcome> {
  let outcome: MoveOutcome = 'ok';
  await runTransaction(gameRef(), (raw: unknown) => {
    const current = normalize(raw);
    if (!current || current.state !== 'playing') {
      outcome = 'not-playing';
      return raw;
    }
    const mySymbol: 'X' | 'O' | null =
      current.p1?.id === myId ? 'X' : current.p2?.id === myId ? 'O' : null;
    if (!mySymbol || current.turn !== mySymbol) {
      outcome = 'not-your-turn';
      return current;
    }
    if (current.board[index]) {
      outcome = 'cell-taken';
      return current;
    }
    const board = current.board.slice();
    board[index] = mySymbol;
    const w = winner(board);
    const draw = !w && isDraw(board);
    return {
      ...current,
      board,
      turn: mySymbol === 'X' ? 'O' : 'X',
      winner: w ?? (draw ? 'draw' : null),
      state: w || draw ? 'finished' : 'playing',
    } as GameState;
  });
  return outcome;
}
