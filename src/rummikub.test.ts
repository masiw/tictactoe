import { describe, it, expect } from 'vitest';
import {
  HAND_SIZE,
  deal,
  fullSet,
  handScore,
  isValidGroup,
  isValidRun,
  parseTable,
  parseTiles,
  serializeTable,
  serializeTiles,
  setValue,
  shuffle,
  validateCommit,
  type Table,
  type Tile,
} from './rummikub';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('fullSet', () => {
  it('has 106 tiles: 2 of each number/colour plus 2 jokers', () => {
    const set = fullSet();
    expect(set.length).toBe(106);
    expect(set.filter((t) => t === 'j').length).toBe(2);
    expect(set.filter((t) => t === 'r7').length).toBe(2);
    expect(set.filter((t) => t === 'k13').length).toBe(2);
    expect(set.filter((t) => !t.startsWith('j')).length).toBe(104);
  });
});

describe('deal', () => {
  it('deals 14 to the opener and leaves the other 92 in the pool', () => {
    const { hand, pool } = deal(mulberry32(1));
    expect(hand.length).toBe(HAND_SIZE);
    expect(pool.length).toBe(106 - HAND_SIZE);
    expect([...hand, ...pool].slice().sort()).toEqual(fullSet().slice().sort());
  });
});

describe('shuffle', () => {
  it('preserves the multiset and does not mutate input', () => {
    const inp = [1, 2, 3, 4, 5];
    const out = shuffle(inp, mulberry32(9));
    expect(out.slice().sort()).toEqual(inp);
    expect(inp).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('isValidGroup', () => {
  it('accepts 3 or 4 same-number distinct-colour tiles', () => {
    expect(isValidGroup(['r5', 'b5', 'o5'])).toBe(true);
    expect(isValidGroup(['r5', 'b5', 'o5', 'k5'])).toBe(true);
  });
  it('rejects duplicate colours, wrong sizes, mismatched numbers', () => {
    expect(isValidGroup(['r5', 'r5', 'o5'])).toBe(false);
    expect(isValidGroup(['r5', 'b5'])).toBe(false);
    expect(isValidGroup(['r5', 'b5', 'o5', 'k5', 'r5'])).toBe(false);
    expect(isValidGroup(['r5', 'b6', 'o5'])).toBe(false);
  });
  it('lets a joker stand in for a colour', () => {
    expect(isValidGroup(['r5', 'b5', 'j'])).toBe(true);
    expect(isValidGroup(['r5', 'j', 'j'])).toBe(true);
  });
});

describe('isValidRun', () => {
  it('accepts consecutive same-colour runs of 3+', () => {
    expect(isValidRun(['r3', 'r4', 'r5'])).toBe(true);
    expect(isValidRun(['b10', 'b11', 'b12', 'b13'])).toBe(true);
  });
  it('rejects mixed colours, gaps, duplicates, out-of-range length', () => {
    expect(isValidRun(['r3', 'b4', 'r5'])).toBe(false);
    expect(isValidRun(['r3', 'r5', 'r6'])).toBe(false);
    expect(isValidRun(['r3', 'r3', 'r4'])).toBe(false);
    expect(isValidRun(['r3', 'r4'])).toBe(false);
  });
  it('fills gaps and ends with jokers', () => {
    expect(isValidRun(['r3', 'j', 'r5'])).toBe(true); // joker = r4
    expect(isValidRun(['r1', 'r2', 'j'])).toBe(true); // joker = r3
    expect(isValidRun(['j', 'r12', 'r13'])).toBe(true); // joker = r11
    expect(isValidRun(['r12', 'r13', 'j'])).toBe(true); // joker = r11 (fills low end)
    expect(isValidRun(['r1', 'r13', 'j'])).toBe(false); // 1 and 13 can't share a 3-window
  });
});

describe('setValue', () => {
  it('values a group as number x size', () => {
    expect(setValue(['r5', 'b5', 'o5'])).toBe(15);
    expect(setValue(['r5', 'b5', 'o5', 'j'])).toBe(20);
  });
  it('values a run as the sum of its numbers (joker included)', () => {
    expect(setValue(['r3', 'r4', 'r5'])).toBe(12);
    expect(setValue(['r3', 'j', 'r5'])).toBe(12); // 3+4+5
  });
});

describe('handScore', () => {
  it('scores number tiles at face value and jokers at 30', () => {
    expect(handScore(['r5', 'b10', 'k1'])).toBe(16);
    expect(handScore(['j', 'r7'])).toBe(37);
    expect(handScore([])).toBe(0);
  });
});

describe('serialization round-trips', () => {
  it('round-trips a hand', () => {
    const hand: Tile[] = ['r5', 'j', 'k13', 'o1'];
    expect(parseTiles(serializeTiles(hand))).toEqual(hand);
  });
  it('round-trips a table of sets', () => {
    const table: Table = [
      ['r3', 'r4', 'r5'],
      ['b5', 'o5', 'k5'],
    ];
    expect(parseTable(serializeTable(table))).toEqual(table);
  });
  it('drops bogus tiles and empty sets', () => {
    expect(parseTiles('r5,zz,j,r99')).toEqual(['r5', 'j']);
    expect(parseTable('r3,r4,r5;;junk')).toEqual([['r3', 'r4', 'r5']]);
  });
});

describe('validateCommit', () => {
  const opener: Tile[] = ['r10', 'b10', 'o10', 'r3', 'r4', 'r5'];

  it('accepts a legal opening meld of 30+ from hand', () => {
    const newTable: Table = [['r10', 'b10', 'o10']]; // 30
    const newHand: Tile[] = ['r3', 'r4', 'r5'];
    const r = validateCommit([], opener, newTable, newHand, false);
    expect(r.ok).toBe(true);
  });

  it('rejects an opening meld worth less than 30', () => {
    const newTable: Table = [['r3', 'r4', 'r5']]; // 12
    const newHand: Tile[] = ['r10', 'b10', 'o10'];
    const r = validateCommit([], opener, newTable, newHand, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Opening meld/);
  });

  it('rejects touching the table before the opening meld', () => {
    const prevTable: Table = [['r3', 'r4', 'r5']];
    const prevHand: Tile[] = ['r6', 'b10', 'o10', 'r10'];
    // Player tries to extend the existing run before melding 30.
    const newTable: Table = [['r3', 'r4', 'r5', 'r6'], ['b10', 'o10', 'r10']];
    const newHand: Tile[] = [];
    const r = validateCommit(prevTable, prevHand, newTable, newHand, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/rearrange the table/);
  });

  it('allows table manipulation once the opening meld is done', () => {
    // Existing run r3-r4-r5; player adds r6 from hand by extending it.
    const prevTable: Table = [['r3', 'r4', 'r5']];
    const prevHand: Tile[] = ['r6', 'k1'];
    const newTable: Table = [['r3', 'r4', 'r5', 'r6']];
    const newHand: Tile[] = ['k1'];
    const r = validateCommit(prevTable, prevHand, newTable, newHand, true);
    expect(r.ok).toBe(true);
  });

  it('rejects inventing or losing tiles (conservation)', () => {
    const prevHand: Tile[] = ['r3', 'r4', 'r5'];
    const newTable: Table = [['r3', 'r4', 'r6']]; // r5 -> r6 is cheating
    const r = validateCommit([], prevHand, newTable, [], true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/match the tiles/);
  });

  it('requires at least one tile to be played from hand', () => {
    const prevTable: Table = [['r3', 'r4', 'r5']];
    const prevHand: Tile[] = ['k1'];
    // Rearranged nothing, played nothing.
    const r = validateCommit(prevTable, prevHand, prevTable, prevHand, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/at least one tile/);
  });

  it('rejects an invalid set on the table', () => {
    const prevHand: Tile[] = ['r3', 'r4', 'b9'];
    const newTable: Table = [['r3', 'r4', 'b9']]; // not a group or run
    const r = validateCommit([], prevHand, newTable, [], true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/valid group or run/);
  });
});
