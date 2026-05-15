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
import { emptyBoard, isDraw, winner, type Cell } from './game';
import { getDb } from './firebase';

export const MOVE_CLOCK_MS = 2 * 60 * 1000;
const GAMES_PATH = 'games';
const REMEMBERED_GAME_KEY = 'tictactoe.gameId';
const MAX_GAMES_SCAN = 50;

export type Player = { id: string };

export type GameState = {
  state: 'waiting' | 'playing' | 'finished';
  p1: Player | null;
  p2: Player | null;
  board: Cell[];
  turn: 'X' | 'O';
  winner: 'X' | 'O' | 'draw' | null;
  createdAt: number;
  lastMoveAt: number;
};

export type Role = 'p1' | 'p2';

export type GameWithId = { id: string; state: GameState };

export function isExpired(state: GameState, now: number): boolean {
  if (state.state === 'finished') return false;
  return now - state.lastMoveAt > MOVE_CLOCK_MS;
}

export function mySymbol(state: GameState, myId: string): 'X' | 'O' | null {
  if (state.p1?.id === myId) return 'X';
  if (state.p2?.id === myId) return 'O';
  return null;
}

export function shouldForfeit(
  state: GameState,
  myId: string,
  now: number,
): 'X' | 'O' | null {
  if (state.state !== 'playing') return null;
  if (now - state.lastMoveAt <= MOVE_CLOCK_MS) return null;
  const me = mySymbol(state, myId);
  if (!me) return null;
  if (state.turn === me) return null;
  return me;
}

export type MatchAction =
  | { kind: 'rejoin'; gameId: string; role: Role }
  | { kind: 'join'; gameId: string }
  | { kind: 'create' };

export type MatchResult = {
  action: MatchAction;
  toDelete: string[];
};

// games must be ordered newest-first (top of stack first).
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
      mySymbol(mine.state, myId)
    ) {
      const role: Role = mySymbol(mine.state, myId) === 'X' ? 'p1' : 'p2';
      return { action: { kind: 'rejoin', gameId: mine.id, role }, toDelete: [] };
    }
  }

  const toDelete: string[] = [];
  for (const g of games) {
    if (g.state.state === 'finished' || isExpired(g.state, now)) {
      toDelete.push(g.id);
      continue;
    }
    if (
      g.state.state === 'waiting' &&
      !g.state.p2 &&
      g.state.p1?.id !== myId
    ) {
      return { action: { kind: 'join', gameId: g.id }, toDelete };
    }
    break;
  }
  return { action: { kind: 'create' }, toDelete };
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

export function rememberedGameId(): string | null {
  return localStorage.getItem(REMEMBERED_GAME_KEY);
}

export function rememberGame(gameId: string): void {
  localStorage.setItem(REMEMBERED_GAME_KEY, gameId);
}

export function forgetGame(): void {
  localStorage.removeItem(REMEMBERED_GAME_KEY);
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
    p1: isPlayer(r.p1) ? r.p1 : null,
    p2: isPlayer(r.p2) ? r.p2 : null,
    board: normalizeBoard(r.board),
    turn: r.turn === 'O' ? 'O' : 'X',
    winner:
      r.winner === 'X' || r.winner === 'O' || r.winner === 'draw'
        ? r.winner
        : null,
    createdAt,
    lastMoveAt: typeof r.lastMoveAt === 'number' ? r.lastMoveAt : createdAt,
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
  // Firebase push keys are lexicographically time-ordered; newest last.
  list.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return list;
}

function deleteGame(gameId: string): void {
  void set(gameRef(gameId), null).catch(() => {});
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
    lastMoveAt: now,
  };
}

export type ClaimResult = { gameId: string; role: Role };

export async function claimMatch(
  myId: string,
  now: number,
): Promise<ClaimResult> {
  const games = await readGames();
  const plan = planMatch(games, rememberedGameId(), myId, now);

  for (const id of plan.toDelete) deleteGame(id);

  if (plan.action.kind === 'rejoin') {
    rememberGame(plan.action.gameId);
    return { gameId: plan.action.gameId, role: plan.action.role };
  }

  if (plan.action.kind === 'join') {
    const result = await runTransaction(
      gameRef(plan.action.gameId),
      (raw: unknown) => {
        const cur = normalize(raw);
        if (
          !cur ||
          cur.state !== 'waiting' ||
          cur.p2 ||
          cur.p1?.id === myId ||
          isExpired(cur, now)
        ) {
          return; // abort
        }
        return {
          ...cur,
          p2: { id: myId },
          state: 'playing',
          turn: 'X',
          lastMoveAt: now,
        };
      },
    );
    if (result.committed) {
      rememberGame(plan.action.gameId);
      return { gameId: plan.action.gameId, role: 'p2' };
    }
  }

  return createNewGame(myId, now);
}

async function createNewGame(myId: string, now: number): Promise<ClaimResult> {
  const newRef = push(ref(getDb(), GAMES_PATH));
  if (!newRef.key) throw new Error('Firebase push() returned a ref without a key');
  await set(newRef, freshGame(myId, now));
  rememberGame(newRef.key);
  return { gameId: newRef.key, role: 'p1' };
}

export function subscribeGame(
  gameId: string,
  cb: (state: GameState | null) => void,
): () => void {
  return onValue(gameRef(gameId), (snap) => cb(normalize(snap.val())));
}

export type MoveOutcome =
  | 'ok'
  | 'finished'
  | 'not-your-turn'
  | 'cell-taken'
  | 'not-playing';

export async function makeMove(
  gameId: string,
  index: number,
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
    const sym = mySymbol(cur, myId);
    if (!sym || cur.turn !== sym) {
      outcome = 'not-your-turn';
      return cur;
    }
    if (cur.board[index]) {
      outcome = 'cell-taken';
      return cur;
    }
    const board = cur.board.slice();
    board[index] = sym;
    const w = winner(board);
    const draw = !w && isDraw(board);
    const isFinished = !!w || draw;
    if (isFinished) outcome = 'finished';
    return {
      ...cur,
      board,
      turn: sym === 'X' ? 'O' : 'X',
      winner: w ?? (draw ? 'draw' : null),
      state: isFinished ? 'finished' : 'playing',
      lastMoveAt: now,
    } as GameState;
  });
  if ((outcome as MoveOutcome) === 'finished') {
    deleteGame(gameId);
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
    if (!cur || !winnerSym) return cur ?? raw;
    won = true;
    return { ...cur, state: 'finished', winner: winnerSym } as GameState;
  });
  if (won) {
    deleteGame(gameId);
  }
  return won;
}
