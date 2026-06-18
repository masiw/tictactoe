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
  dealHands,
  hasAnyPlayable,
  parseTiles,
  pipSum,
  placeOnLeft,
  placeOnRight,
  removeTile,
  serializeTiles,
  tileEquals,
  type Tile,
} from './dominoes';

export const MOVE_CLOCK_MS = 2 * 60 * 1000;
export const FINISHED_VISIBILITY_MS = 3000;
const GAMES_PATH = 'dominoes';
const REMEMBERED_GAME_KEY = 'dominoes.gameId';
const MAX_GAMES_SCAN = 50;

export type Role = 'p1' | 'p2';

export type Player = { id: string; hand: Tile[] };

export type GameState = {
  state: 'waiting' | 'playing' | 'finished';
  p1: Player | null;
  p2: Player | null;
  board: Tile[];
  leftEnd: number | null;
  rightEnd: number | null;
  turn: Role;
  winner: Role | 'draw' | null;
  createdAt: number;
  lastMoveAt: number;
  consecutivePasses: number;
};

export type GameWithId = { id: string; state: GameState };

export type Action =
  | { kind: 'place'; tile: Tile; side: 'left' | 'right' }
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

export function shouldForfeit(
  state: GameState,
  myId: string,
  now: number,
): Role | null {
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

// games sorted newest-first (top of stack first).
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
  // Shared with TicTacToe — same person, same id.
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
    board: parseTiles(r.board),
    leftEnd: pipOrNull(r.leftEnd),
    rightEnd: pipOrNull(r.rightEnd),
    turn: r.turn === 'p2' ? 'p2' : 'p1',
    winner:
      r.winner === 'p1' || r.winner === 'p2' || r.winner === 'draw'
        ? r.winner
        : null,
    createdAt,
    lastMoveAt: typeof r.lastMoveAt === 'number' ? r.lastMoveAt : createdAt,
    consecutivePasses:
      typeof r.consecutivePasses === 'number' &&
      r.consecutivePasses >= 0 &&
      r.consecutivePasses <= 2
        ? Math.floor(r.consecutivePasses)
        : 0,
  };
}

function isPlayer(v: unknown): v is Player {
  if (!v || typeof v !== 'object') return false;
  const o = v as { id?: unknown; hand?: unknown };
  if (typeof o.id !== 'string' || o.id.length === 0) return false;
  return true;
}

function pipOrNull(v: unknown): number | null {
  if (typeof v !== 'number') return null;
  if (v < 0 || v > 6) return null;
  return Math.floor(v);
}

function parsePlayer(p: Player | null): Player | null {
  if (!p) return null;
  const handStr = (p as unknown as { hand?: unknown }).hand;
  return { id: p.id, hand: parseTiles(handStr) };
}

function serializePlayer(p: Player): Record<string, unknown> {
  return { id: p.id, hand: serializeTiles(p.hand) };
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
    const stateForList = normalize(raw);
    if (stateForList) {
      // We need parsed hands too, since planMatch consults them via myRole.
      stateForList.p1 = parsePlayer(stateForList.p1);
      stateForList.p2 = parsePlayer(stateForList.p2);
      list.push({ id, state: stateForList });
    }
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
  const { p1 } = dealHands();
  return {
    state: 'waiting',
    p1: { id: myId, hand: p1 },
    p2: null,
    board: [],
    leftEnd: null,
    rightEnd: null,
    turn: 'p1',
    winner: null,
    createdAt: now,
    lastMoveAt: now,
    consecutivePasses: 0,
  };
}

// Firebase write payload: replace tile arrays with serialized strings, players
// with their {id, hand: string} shape. Nullable numeric ends are omitted by
// returning undefined-equivalent so RTDB drops the field.
function toWire(state: GameState): Record<string, unknown> {
  const out: Record<string, unknown> = {
    state: state.state,
    p1: state.p1 ? serializePlayer(state.p1) : null,
    p2: state.p2 ? serializePlayer(state.p2) : null,
    board: serializeTiles(state.board),
    turn: state.turn,
    winner: state.winner,
    createdAt: state.createdAt,
    lastMoveAt: state.lastMoveAt,
    consecutivePasses: state.consecutivePasses,
  };
  if (state.leftEnd !== null) out.leftEnd = state.leftEnd;
  if (state.rightEnd !== null) out.rightEnd = state.rightEnd;
  return out;
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
    const joinId = plan.action.gameId;
    // Keep an active onValue so runTransaction's first call sees the real
    // value, not a cache-miss null. See multiplayer.ts for the full rationale.
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
        // Deal P2 a fresh hand from the remaining tiles. We re-shuffle here
        // (without seeing p1's hand on the wire) because re-running the deal
        // server-side from cur.p1.hand keeps the boneyard distinct from p1.
        const p1Player = parsePlayer(cur.p1);
        if (!p1Player) return;
        const used = new Set(p1Player.hand.map((t) => `${t[0]}-${t[1]}`));
        const remaining: Tile[] = [];
        for (let a = 0; a <= 6; a++) {
          for (let b = a; b <= 6; b++) {
            if (!used.has(`${a}-${b}`)) remaining.push([a, b]);
          }
        }
        // Shuffle remaining
        for (let i = remaining.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
        const p2Hand = remaining.slice(0, HAND_SIZE);
        const next: GameState = {
          ...cur,
          p1: p1Player,
          p2: { id: myId, hand: p2Hand },
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
  return onValue(gameRef(gameId), (snap) => {
    const norm = normalize(snap.val());
    if (norm) {
      norm.p1 = parsePlayer(norm.p1);
      norm.p2 = parsePlayer(norm.p2);
    }
    cb(norm);
  });
}

export type MoveOutcome =
  | 'ok'
  | 'finished'
  | 'not-your-turn'
  | 'invalid-move'
  | 'not-playing';

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
    cur.p1 = parsePlayer(cur.p1);
    cur.p2 = parsePlayer(cur.p2);
    const sym = myRole(cur, myId);
    if (!sym || cur.turn !== sym) {
      outcome = 'not-your-turn';
      return cur ? toWire(cur) : raw;
    }
    const me = sym === 'p1' ? cur.p1 : cur.p2;
    const opp = sym === 'p1' ? cur.p2 : cur.p1;
    if (!me || !opp) {
      outcome = 'invalid-move';
      return toWire(cur);
    }

    const next: GameState = { ...cur };

    if (action.kind === 'pass') {
      // Pass only allowed if nothing in hand matches either end.
      if (hasAnyPlayable(me.hand, cur.leftEnd, cur.rightEnd)) {
        outcome = 'invalid-move';
        return toWire(cur);
      }
      next.consecutivePasses = cur.consecutivePasses + 1;
    } else {
      // place
      const tile = action.tile;
      if (!me.hand.some((t) => tileEquals(t, tile))) {
        outcome = 'invalid-move';
        return toWire(cur);
      }
      if (cur.board.length === 0) {
        // First move — any tile, side ignored.
        next.board = [tile];
        next.leftEnd = tile[0];
        next.rightEnd = tile[1];
      } else if (action.side === 'right') {
        const placed = placeOnRight(cur.board, tile, cur.rightEnd as number);
        if (!placed) {
          outcome = 'invalid-move';
          return toWire(cur);
        }
        next.board = placed.board;
        next.rightEnd = placed.newRightEnd;
      } else {
        const placed = placeOnLeft(cur.board, tile, cur.leftEnd as number);
        if (!placed) {
          outcome = 'invalid-move';
          return toWire(cur);
        }
        next.board = placed.board;
        next.leftEnd = placed.newLeftEnd;
      }
      const newHand = removeTile(me.hand, tile);
      const updatedMe: Player = { id: me.id, hand: newHand };
      if (sym === 'p1') next.p1 = updatedMe;
      else next.p2 = updatedMe;
      next.consecutivePasses = 0;
    }

    next.lastMoveAt = now;
    next.turn = sym === 'p1' ? 'p2' : 'p1';

    // End-of-game detection.
    const meAfter = sym === 'p1' ? next.p1! : next.p2!;
    if (meAfter.hand.length === 0) {
      next.state = 'finished';
      next.winner = sym;
      outcome = 'finished';
    } else if (next.consecutivePasses >= 2) {
      // Blocked game: lower pip total wins; tie → draw.
      const p1Pips = next.p1 ? pipSum(next.p1.hand) : 0;
      const p2Pips = next.p2 ? pipSum(next.p2.hand) : 0;
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
    cur.p1 = parsePlayer(cur.p1);
    cur.p2 = parsePlayer(cur.p2);
    won = true;
    return toWire({ ...cur, state: 'finished', winner: winnerSym });
  });
  if (won) scheduleFinishedDelete(gameId);
  return won;
}
