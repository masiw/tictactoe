export type Tile = [number, number];

export const PIPS = 6;
export const HAND_SIZE = 7;
export const SET_SIZE = 28;

export function fullSet(): Tile[] {
  const tiles: Tile[] = [];
  for (let a = 0; a <= PIPS; a++) {
    for (let b = a; b <= PIPS; b++) {
      tiles.push([a, b]);
    }
  }
  return tiles;
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function dealHands(rand: () => number = Math.random): { p1: Tile[]; p2: Tile[] } {
  const shuffled = shuffle(fullSet(), rand);
  return {
    p1: shuffled.slice(0, HAND_SIZE),
    p2: shuffled.slice(HAND_SIZE, HAND_SIZE * 2),
  };
}

export function tileEquals(a: Tile, b: Tile): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

export function pipSum(hand: Tile[]): number {
  return hand.reduce((s, t) => s + t[0] + t[1], 0);
}

export type Playability = { left: boolean; right: boolean };

export function tilePlayability(
  tile: Tile,
  leftEnd: number | null,
  rightEnd: number | null,
): Playability {
  if (leftEnd === null || rightEnd === null) return { left: true, right: true };
  return {
    left: tile[0] === leftEnd || tile[1] === leftEnd,
    right: tile[0] === rightEnd || tile[1] === rightEnd,
  };
}

export function hasAnyPlayable(
  hand: Tile[],
  leftEnd: number | null,
  rightEnd: number | null,
): boolean {
  if (leftEnd === null || rightEnd === null) return hand.length > 0;
  return hand.some(
    (t) =>
      t[0] === leftEnd ||
      t[1] === leftEnd ||
      t[0] === rightEnd ||
      t[1] === rightEnd,
  );
}

export function removeTile(hand: Tile[], tile: Tile): Tile[] {
  const idx = hand.findIndex((t) => tileEquals(t, tile));
  if (idx === -1) return hand;
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

// Returns the tile oriented so its right end matches the given board right end,
// and the new exposed right end. Returns null if the tile can't be placed.
export function placeOnRight(
  board: Tile[],
  tile: Tile,
  rightEnd: number,
): { board: Tile[]; newRightEnd: number } | null {
  let oriented: Tile;
  if (tile[0] === rightEnd) oriented = [tile[0], tile[1]];
  else if (tile[1] === rightEnd) oriented = [tile[1], tile[0]];
  else return null;
  return { board: [...board, oriented], newRightEnd: oriented[1] };
}

export function placeOnLeft(
  board: Tile[],
  tile: Tile,
  leftEnd: number,
): { board: Tile[]; newLeftEnd: number } | null {
  let oriented: Tile;
  if (tile[1] === leftEnd) oriented = [tile[0], tile[1]];
  else if (tile[0] === leftEnd) oriented = [tile[1], tile[0]];
  else return null;
  return { board: [oriented, ...board], newLeftEnd: oriented[0] };
}

export function serializeTile(t: Tile): string {
  return `${t[0]}-${t[1]}`;
}

export function parseTile(s: unknown): Tile | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d)-(\d)$/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (a < 0 || a > PIPS || b < 0 || b > PIPS) return null;
  return [a, b];
}

export function serializeTiles(tiles: Tile[]): string {
  return tiles.map(serializeTile).join('|');
}

export function parseTiles(raw: unknown): Tile[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const out: Tile[] = [];
  for (const part of raw.split('|')) {
    const t = parseTile(part);
    if (t) out.push(t);
  }
  return out;
}
