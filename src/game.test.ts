import { describe, it, expect } from 'vitest';
import { emptyBoard, winner, isDraw } from './game';

describe('game', () => {
  it('starts with no winner', () => {
    expect(winner(emptyBoard())).toBe(null);
  });

  it('detects a row win', () => {
    const b = emptyBoard();
    b[0] = 'X'; b[1] = 'X'; b[2] = 'X';
    expect(winner(b)).toBe('X');
  });

  it('detects a diagonal win', () => {
    const b = emptyBoard();
    b[0] = 'O'; b[4] = 'O'; b[8] = 'O';
    expect(winner(b)).toBe('O');
  });

  it('detects a draw', () => {
    const b: ('X' | 'O')[] = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
    expect(isDraw(b)).toBe(true);
    expect(winner(b)).toBe(null);
  });
});
