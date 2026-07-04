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

// --- Snake board layout ---
//
// The chain grows horizontally until adding another tile would exceed the
// container width. It then turns "downward" with two vertical tiles and
// continues horizontally in the opposite direction. When that row would
// exceed the container again it turns down again and reverses. Since tile
// matching only cares about pip values, not orientation, the snake respects
// the game rules — it's purely a spatial layout.

export type TileOrientation = 'horizontal' | 'vertical';

export type TilePlacement = {
  x: number;
  y: number;
  orientation: TileOrientation;
  // For horizontal tiles going leftward, the two halves swap visually so
  // that the "connect-back" pip (tile[0]) still faces the previous tile.
  reverse: boolean;
};

export type SnakeLayout = {
  placements: TilePlacement[];
  width: number;
  height: number;
};

export const TILE_HORIZ_WIDTH = 76;
export const TILE_HORIZ_HEIGHT = 44;
export const TILE_VERT_WIDTH = 44;
export const TILE_VERT_HEIGHT = 76;
export const TILE_GAP = 4;

export function snakeLayout(count: number, containerWidth: number): SnakeLayout {
  if (count === 0) return { placements: [], width: 0, height: 0 };

  const HW = TILE_HORIZ_WIDTH;
  const HH = TILE_HORIZ_HEIGHT;
  const VW = TILE_VERT_WIDTH;
  const VH = TILE_VERT_HEIGHT;
  const GAP = TILE_GAP;

  // How many horizontal tiles fit across the container in one row.
  const K = Math.max(1, Math.floor((containerWidth + GAP) / (HW + GAP)));

  const placements: TilePlacement[] = [];
  let i = 0;
  let direction: 1 | -1 = 1; // 1 = rightward, -1 = leftward
  let currentY = 0;
  // Where the first horizontal tile of the current segment sits.
  let firstHorizontalX = 0;

  while (i < count) {
    const segmentSize = Math.min(K, count - i);
    for (let j = 0; j < segmentSize; j++) {
      const x = firstHorizontalX + direction * j * (HW + GAP);
      placements.push({
        x,
        y: currentY,
        orientation: 'horizontal',
        reverse: direction === -1,
      });
      i++;
    }
    if (i >= count) break;

    // Turn: two vertical tiles stacked below the segment's end.
    const lastHorizontalX =
      firstHorizontalX + direction * (segmentSize - 1) * (HW + GAP);
    const verticalX =
      direction === 1 ? lastHorizontalX + HW - VW : lastHorizontalX;

    const firstVerticalY = currentY + HH + GAP;
    placements.push({
      x: verticalX,
      y: firstVerticalY,
      orientation: 'vertical',
      reverse: false,
    });
    i++;
    if (i >= count) break;

    const secondVerticalY = firstVerticalY + VH + GAP;
    placements.push({
      x: verticalX,
      y: secondVerticalY,
      orientation: 'vertical',
      reverse: false,
    });
    i++;
    if (i >= count) break;

    direction = (direction === 1 ? -1 : 1) as 1 | -1;
    currentY = secondVerticalY + VH + GAP;
    firstHorizontalX = direction === 1 ? verticalX : verticalX + VW - HW;
  }

  let maxX = 0;
  let maxY = 0;
  for (const p of placements) {
    const w = p.orientation === 'horizontal' ? HW : VW;
    const h = p.orientation === 'horizontal' ? HH : VH;
    if (p.x + w > maxX) maxX = p.x + w;
    if (p.y + h > maxY) maxY = p.y + h;
  }
  return { placements, width: maxX, height: maxY };
}
