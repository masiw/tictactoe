import { describe, it, expect } from 'vitest';
import { emptyBoard } from './game';
import {
  RESERVATION_MS,
  isExpired,
  normalize,
  resolveRole,
  type GameState,
} from './multiplayer';

const fresh = (overrides: Partial<GameState> = {}): GameState => ({
  state: 'waiting',
  p1: { id: 'alice' },
  p2: null,
  board: emptyBoard(),
  turn: 'X',
  winner: null,
  createdAt: 1_000_000,
  ...overrides,
});

describe('isExpired', () => {
  it('is false right after creation', () => {
    expect(isExpired(fresh(), 1_000_000)).toBe(false);
  });

  it('is true past RESERVATION_MS while still waiting', () => {
    expect(isExpired(fresh(), 1_000_000 + RESERVATION_MS + 1)).toBe(true);
  });

  it('only applies to waiting state', () => {
    const playing = fresh({ state: 'playing' });
    expect(isExpired(playing, 1_000_000 + RESERVATION_MS + 1)).toBe(false);
  });
});

describe('resolveRole', () => {
  it('claims P1 on an empty game', () => {
    const r = resolveRole(null, 'me', 5_000);
    expect(r.role).toBe('p1');
    expect(r.next?.p1).toEqual({ id: 'me' });
    expect(r.next?.state).toBe('waiting');
    expect(r.next?.createdAt).toBe(5_000);
  });

  it('claims P1 when previous game finished', () => {
    const r = resolveRole(fresh({ state: 'finished' }), 'me', 5_000);
    expect(r.role).toBe('p1');
    expect(r.next?.p1).toEqual({ id: 'me' });
  });

  it('claims P1 when previous waiting slot expired', () => {
    const r = resolveRole(fresh(), 'me', 1_000_000 + RESERVATION_MS + 1);
    expect(r.role).toBe('p1');
    expect(r.next?.p1).toEqual({ id: 'me' });
  });

  it('claims P2 when fresh waiting slot has another P1', () => {
    const r = resolveRole(fresh(), 'bob', 1_000_500);
    expect(r.role).toBe('p2');
    expect(r.next?.p2).toEqual({ id: 'bob' });
    expect(r.next?.state).toBe('playing');
    expect(r.next?.turn).toBe('X');
  });

  it('returning P1 keeps slot, does not overwrite', () => {
    const r = resolveRole(fresh(), 'alice', 1_000_500);
    expect(r.role).toBe('p1');
    expect(r.next).toBe(null);
  });

  it('spectates when both slots filled', () => {
    const playing = fresh({
      state: 'playing',
      p2: { id: 'bob' },
    });
    const r = resolveRole(playing, 'carol', 1_000_500);
    expect(r.role).toBe('spectator');
    expect(r.next).toBe(null);
  });

  it('returning player during play keeps their role', () => {
    const playing = fresh({ state: 'playing', p2: { id: 'bob' } });
    expect(resolveRole(playing, 'alice', 1_000_500).role).toBe('p1');
    expect(resolveRole(playing, 'bob', 1_000_500).role).toBe('p2');
  });
});

describe('normalize', () => {
  it('returns null for null / undefined / non-object', () => {
    expect(normalize(null)).toBe(null);
    expect(normalize(undefined)).toBe(null);
    expect(normalize('nope')).toBe(null);
  });

  it('returns null when state field is missing or invalid', () => {
    expect(normalize({ p1: { id: 'a' }, createdAt: 1 })).toBe(null);
    expect(normalize({ state: 'banana' })).toBe(null);
  });

  it('fills in board when Firebase pruned it (waiting game, empty board)', () => {
    // Firebase strips an all-null array; the stored payload has no `board` key.
    const raw = {
      state: 'waiting',
      p1: { id: 'alice' },
      turn: 'X',
      createdAt: 5,
    };
    expect(normalize(raw)?.board).toEqual(emptyBoard());
  });

  it('reconstructs board when Firebase stored it as an index-keyed object', () => {
    const raw = {
      state: 'playing',
      p1: { id: 'a' },
      p2: { id: 'b' },
      board: { 0: 'X', 4: 'O' },
      turn: 'X',
      createdAt: 5,
    };
    expect(normalize(raw)?.board).toEqual([
      'X', null, null, null, 'O', null, null, null, null,
    ]);
  });

  it('coerces missing p2 / winner to null', () => {
    const n = normalize({
      state: 'waiting',
      p1: { id: 'a' },
      turn: 'X',
      createdAt: 5,
    });
    expect(n?.p2).toBe(null);
    expect(n?.winner).toBe(null);
  });

  it('rejects bogus board cell values', () => {
    const n = normalize({
      state: 'playing',
      p1: { id: 'a' },
      p2: { id: 'b' },
      board: ['X', 'Q', 42, null, 'O', null, null, null, null],
      turn: 'O',
      createdAt: 5,
    });
    expect(n?.board).toEqual([
      'X', null, null, null, 'O', null, null, null, null,
    ]);
  });
});
