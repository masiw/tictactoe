<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Cell } from './game';
  import { firebaseConfigured } from './firebase';
  import {
    RESERVATION_MS,
    claimRole,
    clientId,
    isExpired,
    makeMove,
    subscribeGame,
    type GameState,
    type Role,
  } from './multiplayer';

  let game: GameState | null = null;
  let role: Role | null = null;
  let myId = '';
  let now = Date.now();
  let loading = true;
  let initError = '';
  let unsubscribe: (() => void) | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;

  $: mySymbol = role === 'p1' ? 'X' : role === 'p2' ? 'O' : null;
  $: expired = game ? isExpired(game, now) : false;
  $: myTurn =
    !!game && game.state === 'playing' && mySymbol === game.turn;

  $: phase = computePhase(game, role, expired);

  function computePhase(
    g: GameState | null,
    r: Role | null,
    isExp: boolean,
  ): 'loading' | 'p1-waiting' | 'p1-expired' | 'playing' | 'finished' | 'spectating' {
    if (!g || !r) return 'loading';
    if (g.state === 'waiting') {
      if (r === 'p1') return isExp ? 'p1-expired' : 'p1-waiting';
      return 'spectating';
    }
    if (g.state === 'playing') {
      return r === 'spectator' ? 'spectating' : 'playing';
    }
    return 'finished';
  }

  $: status = (() => {
    switch (phase) {
      case 'loading':
        return 'Loading…';
      case 'p1-waiting':
        return `You're X. Waiting for opponent… (${countdown(game!, now)})`;
      case 'p1-expired':
        return 'No one joined. Refresh to try again.';
      case 'playing':
        return myTurn ? 'Your turn.' : "Opponent's turn.";
      case 'finished': {
        const w = game?.winner;
        const result =
          w === 'draw' ? "It's a draw." : w ? `${w} wins!` : 'Game over.';
        return role === 'spectator'
          ? `${result} Refresh to play next.`
          : `${result} Refresh for a new game.`;
      }
      case 'spectating':
        return 'Spectating — game in progress.';
    }
  })();

  function countdown(g: GameState, t: number): string {
    const ms = Math.max(0, g.createdAt + RESERVATION_MS - t);
    const s = Math.ceil(ms / 1000);
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function cellSymbol(c: Cell): string {
    return c ?? '';
  }

  function onCellClick(i: number) {
    if (phase !== 'playing' || !myTurn) return;
    void makeMove(i, myId);
  }

  onMount(async () => {
    if (!firebaseConfigured) {
      initError =
        'Firebase is not configured. See SETUP.md for the env vars to set.';
      loading = false;
      return;
    }
    try {
      myId = clientId();
      now = Date.now();
      role = await claimRole(myId, now);
      unsubscribe = subscribeGame((s) => {
        game = s;
      });
      tick = setInterval(() => {
        now = Date.now();
      }, 1000);
    } catch (e) {
      initError = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  });

  onDestroy(() => {
    unsubscribe?.();
    if (tick) clearInterval(tick);
  });
</script>

<main>
  <h1>Tic-Tac-Toe</h1>

  {#if initError}
    <p class="error">{initError}</p>
  {:else if loading || !game}
    <p class="status">Loading…</p>
  {:else}
    <p class="status">{status}</p>
    <div class="board">
      {#each game.board as cell, i}
        <button
          class="cell"
          class:x={cell === 'X'}
          class:o={cell === 'O'}
          on:click={() => onCellClick(i)}
          disabled={phase !== 'playing' || !myTurn || !!cell}
          aria-label={`cell ${i + 1}`}
        >
          {cellSymbol(cell)}
        </button>
      {/each}
    </div>
    {#if role && role !== 'spectator'}
      <p class="role">You are {mySymbol}.</p>
    {/if}
  {/if}
</main>

<style>
  :global(html),
  :global(body) {
    background: #09090b;
    color: #f4f4f5;
    margin: 0;
    min-height: 100vh;
  }
  main {
    font-family: system-ui, sans-serif;
    max-width: 320px;
    margin: 2rem auto;
    text-align: center;
  }
  .status {
    font-size: 1.2rem;
    margin: 1rem 0;
    color: #a1a1aa;
  }
  .role {
    margin-top: 1rem;
    color: #71717a;
    font-size: 0.9rem;
  }
  .error {
    color: #f87171;
    margin: 1rem 0;
    white-space: pre-wrap;
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
    color: #f87171;
  }
  .cell.o {
    color: #60a5fa;
  }
</style>
