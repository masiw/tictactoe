import { describe, it, expect } from 'vitest';
import { emptyBoard } from './game';
import {
  MOVE_CLOCK_MS,
  isExpired,
  mySymbol,
  normalize,
  planMatch,
  shouldForfeit,
  type GameState,
  type GameWithId,
} from './multiplayer';

const T0 = 1_000_000;

const fresh = (overrides: Partial<GameState> = {}): GameState => ({
  state: 'waiting',
  p1: { id: 'alice' },
  p2: null,
  board: emptyBoard(),
  turn: 'X',
  winner: null,
  createdAt: T0,
  lastMoveAt: T0,
  lastMove: null,
  ...overrides,
});

const game = (id: string, overrides: Partial<GameState> = {}): GameWithId => ({
  id,
  state: fresh(overrides),
});

describe('isExpired', () => {
  it('is false within the move clock', () => {
    expect(isExpired(fresh(), T0 + MOVE_CLOCK_MS - 1)).toBe(false);
  });

  it('is true past the move clock for waiting games', () => {
    expect(isExpired(fresh(), T0 + MOVE_CLOCK_MS + 1)).toBe(true);
  });

  it('is true past the move clock for playing games', () => {
    expect(isExpired(fresh({ state: 'playing' }), T0 + MOVE_CLOCK_MS + 1)).toBe(true);
  });

  it('never expires a finished game', () => {
    expect(isExpired(fresh({ state: 'finished' }), T0 + MOVE_CLOCK_MS * 100)).toBe(false);
  });

  it('resets on every lastMoveAt update', () => {
    const moved = fresh({ state: 'playing', lastMoveAt: T0 + 1_000_000 });
    expect(isExpired(moved, T0 + 1_000_000 + MOVE_CLOCK_MS - 1)).toBe(false);
  });
});

describe('mySymbol', () => {
  it('returns X for p1', () => {
    expect(mySymbol(fresh({ p2: { id: 'bob' } }), 'alice')).toBe('X');
  });
  it('returns O for p2', () => {
    expect(mySymbol(fresh({ p2: { id: 'bob' } }), 'bob')).toBe('O');
  });
  it('returns null for non-participants', () => {
    expect(mySymbol(fresh({ p2: { id: 'bob' } }), 'carol')).toBe(null);
  });
});

describe('shouldForfeit', () => {
  it('returns my symbol when opponent has timed out', () => {
    const g = fresh({ state: 'playing', p2: { id: 'bob' }, turn: 'O' });
    // I am alice (X). It is bob's turn but he hasn't moved in > 2 min.
    expect(shouldForfeit(g, 'alice', T0 + MOVE_CLOCK_MS + 1)).toBe('X');
  });

  it('returns null on my own turn (I cannot declare myself the forfeit-winner)', () => {
    const g = fresh({ state: 'playing', p2: { id: 'bob' }, turn: 'X' });
    expect(shouldForfeit(g, 'alice', T0 + MOVE_CLOCK_MS + 1)).toBe(null);
  });

  it('returns null when within the move clock', () => {
    const g = fresh({ state: 'playing', p2: { id: 'bob' }, turn: 'O' });
    expect(shouldForfeit(g, 'alice', T0 + MOVE_CLOCK_MS - 1)).toBe(null);
  });

  it('returns null in waiting state (no opponent yet)', () => {
    const g = fresh({ state: 'waiting' });
    expect(shouldForfeit(g, 'alice', T0 + MOVE_CLOCK_MS + 1)).toBe(null);
  });

  it('returns null for non-participants', () => {
    const g = fresh({ state: 'playing', p2: { id: 'bob' }, turn: 'O' });
    expect(shouldForfeit(g, 'carol', T0 + MOVE_CLOCK_MS + 1)).toBe(null);
  });
});

describe('planMatch', () => {
  it('creates a new game when stack is empty', () => {
    const r = planMatch([], null, 'me', T0);
    expect(r.action.kind).toBe('create');
    expect(r.toDelete).toEqual([]);
  });

  it('joins the top waiting game as P2', () => {
    const top = game('g2', { state: 'waiting' });
    const r = planMatch([top, game('g1', { state: 'playing', p2: { id: 'bob' } })], null, 'me', T0);
    expect(r.action).toEqual({ kind: 'join', gameId: 'g2' });
    expect(r.toDelete).toEqual([]);
  });

  it('skips and deletes a finished game at the top, joining the next waiting one', () => {
    const finished = game('g3', { state: 'finished', winner: 'X', p2: { id: 'bob' } });
    const waiting = game('g2', { state: 'waiting', p1: { id: 'carol' } });
    const r = planMatch([finished, waiting], null, 'me', T0);
    expect(r.action).toEqual({ kind: 'join', gameId: 'g2' });
    expect(r.toDelete).toEqual(['g3']);
  });

  it('skips and deletes an expired waiting game, creating a fresh game when the next one is an active playing game', () => {
    const expired = game('g3', { state: 'waiting' });
    const playing = game('g2', {
      state: 'playing',
      p2: { id: 'bob' },
      lastMoveAt: T0 + MOVE_CLOCK_MS, // recent enough to still be active at the check time
    });
    const r = planMatch([expired, playing], null, 'me', T0 + MOVE_CLOCK_MS + 10);
    expect(r.action).toEqual({ kind: 'create' });
    expect(r.toDelete).toEqual(['g3']);
  });

  it('creates a new game when the top is a playing game with both slots taken', () => {
    const playing = game('g1', { state: 'playing', p2: { id: 'bob' }, lastMoveAt: T0 });
    const r = planMatch([playing], null, 'me', T0 + 1000);
    expect(r.action).toEqual({ kind: 'create' });
    expect(r.toDelete).toEqual([]);
  });

  it('creates a new game when the only waiting slot is my own (avoids re-claiming P2 of my own game)', () => {
    const mine = game('g1', { state: 'waiting', p1: { id: 'me' } });
    const r = planMatch([mine], null, 'me', T0 + 1000);
    expect(r.action).toEqual({ kind: 'create' });
    expect(r.toDelete).toEqual([]);
  });

  it('rejoins my remembered game when it is still alive and I am in it', () => {
    const buried = game('g1', { state: 'playing', p1: { id: 'me' }, p2: { id: 'bob' }, lastMoveAt: T0 });
    const top = game('g2', { state: 'waiting', p1: { id: 'carol' } });
    const r = planMatch([top, buried], 'g1', 'me', T0 + 1000);
    expect(r.action).toEqual({ kind: 'rejoin', gameId: 'g1', role: 'p1' });
    expect(r.toDelete).toEqual([]);
  });

  it('ignores a remembered game that has finished', () => {
    const finished = game('g1', { state: 'finished', p1: { id: 'me' }, p2: { id: 'bob' }, winner: 'X' });
    const r = planMatch([finished], 'g1', 'me', T0 + 1000);
    expect(r.action.kind).not.toBe('rejoin');
  });

  it('ignores a remembered game that has expired', () => {
    const expired = game('g1', { state: 'playing', p1: { id: 'me' }, p2: { id: 'bob' }, lastMoveAt: T0 });
    const r = planMatch([expired], 'g1', 'me', T0 + MOVE_CLOCK_MS + 10);
    expect(r.action.kind).not.toBe('rejoin');
  });
});

describe('normalize', () => {
  it('returns null for non-objects', () => {
    expect(normalize(null)).toBe(null);
    expect(normalize('nope')).toBe(null);
  });

  it('returns null when state is missing or invalid', () => {
    expect(normalize({ p1: { id: 'a' }, createdAt: 1 })).toBe(null);
    expect(normalize({ state: 'banana' })).toBe(null);
  });

  it('defaults lastMoveAt to createdAt when missing', () => {
    const n = normalize({ state: 'waiting', p1: { id: 'a' }, turn: 'X', createdAt: 42 });
    expect(n?.lastMoveAt).toBe(42);
  });

  it('rebuilds an empty board when Firebase pruned it', () => {
    const n = normalize({ state: 'waiting', p1: { id: 'a' }, turn: 'X', createdAt: 1, lastMoveAt: 1 });
    expect(n?.board).toEqual(emptyBoard());
  });

  it('rebuilds an index-keyed board object', () => {
    const n = normalize({
      state: 'playing',
      p1: { id: 'a' },
      p2: { id: 'b' },
      board: { 0: 'X', 4: 'O' },
      turn: 'X',
      createdAt: 1,
      lastMoveAt: 2,
    });
    expect(n?.board).toEqual(['X', null, null, null, 'O', null, null, null, null]);
  });

  it('parses lastMove only when it is an integer in [0, 8]', () => {
    const valid = normalize({
      state: 'playing',
      p1: { id: 'a' },
      p2: { id: 'b' },
      turn: 'O',
      createdAt: 1,
      lastMoveAt: 2,
      lastMove: 4,
    });
    expect(valid?.lastMove).toBe(4);

    const negative = normalize({
      state: 'waiting',
      p1: { id: 'a' },
      turn: 'X',
      createdAt: 1,
      lastMoveAt: 1,
      lastMove: -1,
    });
    expect(negative?.lastMove).toBe(null);

    const fraction = normalize({
      state: 'waiting',
      p1: { id: 'a' },
      turn: 'X',
      createdAt: 1,
      lastMoveAt: 1,
      lastMove: 3.5,
    });
    expect(fraction?.lastMove).toBe(null);

    const missing = normalize({
      state: 'waiting',
      p1: { id: 'a' },
      turn: 'X',
      createdAt: 1,
      lastMoveAt: 1,
    });
    expect(missing?.lastMove).toBe(null);
  });

  it('rejects bogus cell values', () => {
    const n = normalize({
      state: 'playing',
      p1: { id: 'a' },
      p2: { id: 'b' },
      board: ['X', 'Q', 42, null, 'O', null, null, null, null],
      turn: 'O',
      createdAt: 1,
      lastMoveAt: 1,
    });
    expect(n?.board).toEqual(['X', null, null, null, 'O', null, null, null, null]);
  });
});
