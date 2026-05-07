<script lang="ts">
  import { emptyBoard, winner, isDraw, type Cell } from './game';

  let board: Cell[] = emptyBoard();
  let turn: 'X' | 'O' = 'X';

  $: w = winner(board);
  $: draw = isDraw(board);
  $: status = w ? `${w} wins!` : draw ? `It's a draw.` : `${turn}'s turn`;

  function play(i: number) {
    if (board[i] || w) return;
    board[i] = turn;
    turn = turn === 'X' ? 'O' : 'X';
  }

  function reset() {
    board = emptyBoard();
    turn = 'X';
  }
</script>

<main>
  <h1>Tic-Tac-Toe</h1>
  <p class="status">{status}</p>
  <div class="board">
    {#each board as cell, i}
      <button
        class="cell"
        class:x={cell === 'X'}
        class:o={cell === 'O'}
        on:click={() => play(i)}
        aria-label={`cell ${i + 1}`}
      >
        {cell ?? ''}
      </button>
    {/each}
  </div>
  <button class="reset" on:click={reset}>New game</button>
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 320px;
    margin: 2rem auto;
    text-align: center;
  }
  .status {
    font-size: 1.2rem;
    margin: 1rem 0;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .cell {
    aspect-ratio: 1;
    font-size: 2.5rem;
    background: #f4f4f5;
    border: 1px solid #d4d4d8;
    border-radius: 8px;
    cursor: pointer;
  }
  .cell:hover:not(:disabled) {
    background: #e4e4e7;
  }
  .cell.x {
    color: #dc2626;
  }
  .cell.o {
    color: #2563eb;
  }
  .reset {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    font-size: 1rem;
    border-radius: 6px;
    border: 1px solid #d4d4d8;
    background: #fff;
    cursor: pointer;
  }
</style>
