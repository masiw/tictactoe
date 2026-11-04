// Pure Rummikub logic: tiles, dealing, set validation (groups & runs with
// jokers), opening-meld + full table-manipulation commit validation, scoring,
// and string serialization for Firebase. No Firebase imports here.

export type Color = 'r' | 'b' | 'o' | 'k'; // red, blue, orange, black
export const COLORS: Color[] = ['r', 'b', 'o', 'k'];
export const JOKER = 'j';
export const MIN_NUMBER = 1;
export const MAX_NUMBER = 13;
export const HAND_SIZE = 14;
export const OPENING_MELD_POINTS = 30;
export const JOKER_PENALTY = 30;

// A tile is a short string: `${color}${number}` (e.g. "r7", "k13") or "j".
export type Tile = string;

export type SetGroup = Tile[];
export type Table = SetGroup[];

const TILE_RE = /^(?:[rbok](?:1[0-3]|[1-9])|j)$/;

export function isJoker(tile: Tile): boolean {
  return tile === JOKER;
}

export function tileColor(tile: Tile): Color | null {
  if (isJoker(tile)) return null;
  return tile[0] as Color;
}

export function tileNumber(tile: Tile): number | null {
  if (isJoker(tile)) return null;
  return parseInt(tile.slice(1), 10);
}

export function fullSet(): Tile[] {
  const tiles: Tile[] = [];
  for (const c of COLORS) {
    for (let n = MIN_NUMBER; n <= MAX_NUMBER; n++) {
      tiles.push(`${c}${n}`);
      tiles.push(`${c}${n}`);
    }
  }
  tiles.push(JOKER, JOKER);
  return tiles; // 104 + 2 = 106
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Deal the opening player's hand and leave the rest as the (shuffled) pool.
// The second player's hand is drawn off the top of the pool at join time.
export function deal(rand: () => number = Math.random): { hand: Tile[]; pool: Tile[] } {
  const shuffled = shuffle(fullSet(), rand);
  return { hand: shuffled.slice(0, HAND_SIZE), pool: shuffled.slice(HAND_SIZE) };
}

// --- Set validation ---

export function isValidGroup(tiles: Tile[]): boolean {
  if (tiles.length < 3 || tiles.length > 4) return false;
  const nonJokers = tiles.filter((t) => !isJoker(t));
  if (nonJokers.length === 0) return false;
  const n = tileNumber(nonJokers[0]);
  if (nonJokers.some((t) => tileNumber(t) !== n)) return false;
  const colors = nonJokers.map((t) => tileColor(t));
  if (new Set(colors).size !== colors.length) return false;
  return true;
}

export function isValidRun(tiles: Tile[]): boolean {
  const len = tiles.length;
  if (len < 3 || len > MAX_NUMBER) return false;
  const nonJokers = tiles.filter((t) => !isJoker(t));
  if (nonJokers.length === 0) return false;
  const color = tileColor(nonJokers[0]);
  if (nonJokers.some((t) => tileColor(t) !== color)) return false;
  const nums = nonJokers.map((t) => tileNumber(t) as number);
  if (new Set(nums).size !== nums.length) return false;
  // A window of `len` consecutive numbers in [1,13] must contain every real
  // number; jokers fill the remaining positions.
  for (let start = MIN_NUMBER; start <= MAX_NUMBER - len + 1; start++) {
    const end = start + len - 1;
    if (nums.every((x) => x >= start && x <= end)) return true;
  }
  return false;
}

export function isValidSet(tiles: Tile[]): boolean {
  return isValidGroup(tiles) || isValidRun(tiles);
}

// Point value of a valid set, with jokers taking the value of the tile they
// stand for. Runs with free (end) jokers take their highest legal placement.
export function setValue(tiles: Tile[]): number {
  if (isValidGroup(tiles)) {
    const n = tileNumber(tiles.filter((t) => !isJoker(t))[0]) as number;
    return n * tiles.length;
  }
  if (isValidRun(tiles)) {
    const len = tiles.length;
    const nums = tiles.filter((t) => !isJoker(t)).map((t) => tileNumber(t) as number);
    let best = 0;
    for (let start = MIN_NUMBER; start <= MAX_NUMBER - len + 1; start++) {
      const end = start + len - 1;
      if (nums.every((x) => x >= start && x <= end)) {
        let sum = 0;
        for (let v = start; v <= end; v++) sum += v;
        if (sum > best) best = sum;
      }
    }
    return best;
  }
  return 0;
}

// Sum of a hand for end-of-game scoring: number tiles at face value, jokers 30.
export function handScore(hand: Tile[]): number {
  return hand.reduce((s, t) => s + (isJoker(t) ? JOKER_PENALTY : (tileNumber(t) as number)), 0);
}

// --- multiset helpers ---

function counts(tiles: Tile[]): Map<Tile, number> {
  const m = new Map<Tile, number>();
  for (const t of tiles) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function countsEqual(a: Map<Tile, number>, b: Map<Tile, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

function canonicalSet(tiles: Tile[]): string {
  return tiles.slice().sort().join(',');
}

function setMultiset(table: Table): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of table) {
    const key = canonicalSet(s);
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

// --- turn commit validation ---

export type CommitResult =
  | { ok: true; openingPoints: number }
  | { ok: false; reason: string };

// Validate a player's proposed new table + remaining hand against the state at
// the start of their turn. Enforces tile conservation, that at least one tile
// was played from hand, that every set is valid, and — before the player's
// opening meld — that the table was untouched and the newly-placed sets total
// at least 30 points.
export function validateCommit(
  prevTable: Table,
  prevHand: Tile[],
  newTable: Table,
  newHand: Tile[],
  openingDone: boolean,
): CommitResult {
  const table = newTable.filter((s) => s.length > 0);

  const before = counts([...prevTable.flat(), ...prevHand]);
  const after = counts([...table.flat(), ...newHand]);
  if (!countsEqual(before, after)) {
    return { ok: false, reason: 'Tiles on the table must match the tiles in play.' };
  }

  if (newHand.length >= prevHand.length) {
    return { ok: false, reason: 'Play at least one tile from your hand.' };
  }

  for (const s of table) {
    if (!isValidSet(s)) {
      return { ok: false, reason: 'Every set must be a valid group or run of 3+.' };
    }
  }

  if (!openingDone) {
    const prevMs = setMultiset(prevTable);
    const newMs = setMultiset(table);
    // Every prior set must still be present unchanged.
    for (const [key, n] of prevMs) {
      if ((newMs.get(key) ?? 0) < n) {
        return {
          ok: false,
          reason: `You can't rearrange the table until your first meld of ${OPENING_MELD_POINTS}.`,
        };
      }
    }
    // The newly added sets are everything beyond the prior table.
    const added: Table = [];
    const remaining = new Map(prevMs);
    for (const s of table) {
      const key = canonicalSet(s);
      const left = remaining.get(key) ?? 0;
      if (left > 0) remaining.set(key, left - 1);
      else added.push(s);
    }
    const points = added.reduce((sum, s) => sum + setValue(s), 0);
    if (points < OPENING_MELD_POINTS) {
      return {
        ok: false,
        reason: `Opening meld must total ${OPENING_MELD_POINTS} (currently ${points}).`,
      };
    }
    return { ok: true, openingPoints: points };
  }

  return { ok: true, openingPoints: 0 };
}

// --- serialization (Firebase stores strings to dodge array-of-object quirks) ---

export function parseTile(s: unknown): Tile | null {
  if (typeof s !== 'string') return null;
  return TILE_RE.test(s) ? s : null;
}

export function serializeTiles(tiles: Tile[]): string {
  return tiles.join(',');
}

export function parseTiles(raw: unknown): Tile[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const out: Tile[] = [];
  for (const part of raw.split(',')) {
    const t = parseTile(part);
    if (t) out.push(t);
  }
  return out;
}

export function serializeTable(table: Table): string {
  return table
    .filter((s) => s.length > 0)
    .map((s) => s.join(','))
    .join(';');
}

export function parseTable(raw: unknown): Table {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const out: Table = [];
  for (const chunk of raw.split(';')) {
    const set = parseTiles(chunk);
    if (set.length > 0) out.push(set);
  }
  return out;
}
