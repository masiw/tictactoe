<script lang="ts">
  import { onDestroy } from 'svelte';
  import { emptyBoard, isDraw, winner, type Cell } from './game';
  import OutcomeOverlay from './OutcomeOverlay.svelte';

  export let navigate: (path: string) => void;

  const OUTCOME_ANIMATION_MS = 3000;

  let board: Cell[] = emptyBoard();
  let turn: 'X' | 'O' = 'X';
  let result: 'X' | 'O' | 'draw' | null = null;
  let outcomeAnimation: 'fireworks' | 'rain' | null = null;
  let outcomeAnimationTimer: ReturnType<typeof setTimeout> | null = null;

  $: status =
    result === 'X'
      ? 'X wins!'
      : result === 'O'
        ? 'O wins!'
        : result === 'draw'
          ? "It's a draw."
          : `${turn}'s turn`;

  function play(i: number) {
    if (result !== null || board[i] !== null) return;
    board = board.map((c, j) => (j === i ? turn : c));
    const w = winner(board);
    if (w) {
      result = w;
      triggerOutcome('fireworks');
    } else if (isDraw(board)) {
      result = 'draw';
    } else {
      turn = turn === 'X' ? 'O' : 'X';
    }
  }

  function triggerOutcome(kind: 'fireworks' | 'rain') {
    outcomeAnimation = kind;
    if (outcomeAnimationTimer) clearTimeout(outcomeAnimationTimer);
    outcomeAnimationTimer = setTimeout(() => {
      outcomeAnimation = null;
    }, OUTCOME_ANIMATION_MS);
  }

  function newGame() {
    board = emptyBoard();
    turn = 'X';
    result = null;
    outcomeAnimation = null;
    if (outcomeAnimationTimer) clearTimeout(outcomeAnimationTimer);
  }

  onDestroy(() => {
    if (outcomeAnimationTimer) clearTimeout(outcomeAnimationTimer);
  });
</script>

<main>
  <button class="back" on:click={() => navigate('/')}>← Games</button>
  <h1>Tic-Tac-Toe</h1>
  <p class="status">{status}</p>

  <div class="board">
    {#each board as cell, i (i)}
      <button
        class="cell"
        class:x={cell === 'X'}
        class:o={cell === 'O'}
        on:click={() => play(i)}
        disabled={result !== null || cell !== null}
        aria-label={`cell ${i + 1}`}
      >
        {cell ?? ''}
      </button>
    {/each}
  </div>

  {#if result !== null}
    <button class="new-game" on:click={newGame}>New game</button>
  {/if}
</main>

<OutcomeOverlay outcome={outcomeAnimation} />

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 320px;
    margin: 2rem auto;
    text-align: center;
  }
  .back {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    margin-bottom: 0.5rem;
    background: transparent;
    color: #a1a1aa;
    border: none;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .back:hover {
    color: #f4f4f5;
  }
  .status {
    font-size: 1.2rem;
    margin: 1rem 0;
    color: #a1a1aa;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .cell {
    aspect-ratio: 1;
    font-size: 2.5rem;
    background: #27272a;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    cursor: pointer;
  }
  .cell:hover:not(:disabled) {
    background: #3f3f46;
  }
  .cell:disabled {
    cursor: default;
  }
  .cell.x {
    color: #fbbf24;
    text-shadow:
      0 0 6px rgba(251, 191, 36, 0.9),
      0 0 14px rgba(251, 191, 36, 0.5);
  }
  .cell.o {
    color: #60a5fa;
    text-shadow:
      0 0 6px rgba(96, 165, 250, 0.9),
      0 0 14px rgba(96, 165, 250, 0.5);
  }
  .new-game {
    margin-top: 1.25rem;
    padding: 0.6rem 1rem;
    font-size: 1rem;
    background: #fbbf24;
    color: #18181b;
    border: 1px solid #fbbf24;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
  }
  .new-game:hover {
    background: #fcd34d;
  }
</style>
