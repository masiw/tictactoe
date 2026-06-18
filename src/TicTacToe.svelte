<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Cell } from './game';
  import { firebaseConfigured } from './firebase';
  import {
    MOVE_CLOCK_MS,
    claimMatch,
    clientId,
    declareForfeit,
    forgetGame,
    makeMove,
    mySymbol as symbolOf,
    revealPreviousMove,
    shouldForfeit,
    subscribeGame,
    type GameState,
    type Role,
  } from './multiplayer';

  export let navigate: (path: string) => void;

  type Sparkle = {
    cx: number;
    cy: number;
    dx: number;
    dy: number;
    color: string;
    delay: number;
  };
  type Drop = {
    x: number;
    delay: number;
    duration: number;
  };

  const OUTCOME_ANIMATION_MS = 3000;

  let gameId: string | null = null;
  let role: Role | null = null;
  let liveGame: GameState | null = null;
  let lastKnownGame: GameState | null = null;
  let myId = '';
  let now = Date.now();
  let loading = true;
  let initError = '';
  let unsubscribe: (() => void) | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;
  let forfeitInFlight = false;
  let outcomeAnimation: 'fireworks' | 'rain' | null = null;
  let sparkles: Sparkle[] = [];
  let raindrops: Drop[] = [];
  let lastOutcomeGameId: string | null = null;
  let outcomeAnimationTimer: ReturnType<typeof setTimeout> | null = null;

  $: displayedGame = liveGame ?? lastKnownGame;
  $: mySym = role === 'p1' ? 'X' : role === 'p2' ? 'O' : null;
  $: phase = computePhase(displayedGame, liveGame, now);
  $: myTurn = !!displayedGame && displayedGame.state === 'playing' && displayedGame.turn === mySym;
  $: clockMs = displayedGame
    ? Math.max(0, displayedGame.lastMoveAt + MOVE_CLOCK_MS - now)
    : 0;
  $: showRevealButton =
    !!mySym &&
    !!displayedGame &&
    (displayedGame.state === 'playing' || displayedGame.state === 'finished');
  $: canRevealPrevious =
    !!displayedGame &&
    displayedGame.previousMove !== null &&
    !displayedGame.previousMoveRevealed;

  $: maybeTriggerOutcomeAnimation(displayedGame, mySym, gameId);

  function makeFireworks(): Sparkle[] {
    const palette = [
      '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#34d399', '#f4f4f5', '#fb923c',
    ];
    const out: Sparkle[] = [];
    const bursts = 3;
    const perBurst = 24;
    for (let b = 0; b < bursts; b++) {
      const cx = 15 + Math.random() * 70;
      const cy = 18 + Math.random() * 35;
      const burstDelay = b * 700;
      for (let i = 0; i < perBurst; i++) {
        const angle = (Math.PI * 2 * i) / perBurst + Math.random() * 0.4;
        const dist = 80 + Math.random() * 90;
        out.push({
          cx,
          cy,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          color: palette[Math.floor(Math.random() * palette.length)],
          delay: burstDelay,
        });
      }
    }
    return out;
  }

  function makeRain(): Drop[] {
    const out: Drop[] = [];
    const count = 60;
    for (let i = 0; i < count; i++) {
      out.push({
        x: Math.random() * 100,
        delay: Math.random() * (OUTCOME_ANIMATION_MS - 500),
        duration: 600 + Math.random() * 600,
      });
    }
    return out;
  }

  function maybeTriggerOutcomeAnimation(
    g: GameState | null,
    sym: string | null,
    id: string | null,
  ) {
    if (!g || g.state !== 'finished' || !sym || !id) return;
    if (lastOutcomeGameId === id) return;
    lastOutcomeGameId = id;
    if (g.winner === sym) {
      sparkles = makeFireworks();
      outcomeAnimation = 'fireworks';
    } else if (g.winner === 'X' || g.winner === 'O') {
      raindrops = makeRain();
      outcomeAnimation = 'rain';
    } else {
      return;
    }
    if (outcomeAnimationTimer) clearTimeout(outcomeAnimationTimer);
    outcomeAnimationTimer = setTimeout(() => {
      outcomeAnimation = null;
    }, OUTCOME_ANIMATION_MS);
  }

  function computePhase(
    shown: GameState | null,
    live: GameState | null,
    t: number,
  ): 'loading' | 'p1-waiting' | 'p1-expired' | 'playing' | 'finished' {
    if (!shown) return 'loading';
    if (shown.state === 'finished') return 'finished';
    // Game was deleted from DB after finishing — keep the cached final view.
    if (!live && lastKnownGame?.state === 'finished') return 'finished';
    if (shown.state === 'waiting') {
      const expired = t - shown.lastMoveAt > MOVE_CLOCK_MS;
      return expired ? 'p1-expired' : 'p1-waiting';
    }
    return 'playing';
  }

  $: status = (() => {
    switch (phase) {
      case 'loading':
        return 'Loading…';
      case 'p1-waiting':
        return `You're X. Waiting for opponent… (${fmt(clockMs)})`;
      case 'p1-expired':
        return 'No one joined. Refresh to start a new game.';
      case 'playing':
        return myTurn
          ? `Your turn — ${fmt(clockMs)} to move`
          : `Opponent's turn — ${fmt(clockMs)} left`;
      case 'finished': {
        const w = displayedGame?.winner;
        if (w === 'draw') return "It's a draw. Refresh for a new game.";
        if (w === mySym) return 'You win! Refresh for a new game.';
        if (w) return 'You lose. Refresh for a new game.';
        return 'Game over. Refresh for a new game.';
      }
    }
  })();

  function fmt(ms: number): string {
    const s = Math.ceil(ms / 1000);
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function cellSymbol(c: Cell): string {
    return c ?? '';
  }

  function onCellClick(i: number) {
    if (!gameId || phase !== 'playing' || !myTurn) return;
    void makeMove(gameId, i, myId, Date.now());
  }

  function onRevealPrevious() {
    if (!gameId || !canRevealPrevious) return;
    void revealPreviousMove(gameId, myId);
  }

  async function maybeForfeit() {
    if (!gameId || forfeitInFlight || !liveGame) return;
    if (!symbolOf(liveGame, myId)) return;
    if (!shouldForfeit(liveGame, myId, Date.now())) return;
    forfeitInFlight = true;
    try {
      await declareForfeit(gameId, myId, Date.now());
    } finally {
      forfeitInFlight = false;
    }
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
      const result = await claimMatch(myId, Date.now());
      gameId = result.gameId;
      role = result.role;
      unsubscribe = subscribeGame(gameId, (s) => {
        if (s) {
          liveGame = s;
          lastKnownGame = s;
          if (s.state === 'finished') {
            // We don't need to remember this game across reloads.
            forgetGame();
          }
        } else {
          liveGame = null;
        }
      });
      tick = setInterval(() => {
        now = Date.now();
        void maybeForfeit();
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
    if (outcomeAnimationTimer) clearTimeout(outcomeAnimationTimer);
  });
</script>

<main>
  <button class="back" on:click={() => navigate('/')}>← Games</button>
  <h1>Tic-Tac-Toe</h1>

  {#if initError}
    <p class="error">{initError}</p>
  {:else if loading || !displayedGame}
    <p class="status">Loading…</p>
  {:else}
    <p class="status">{status}</p>
    <div class="board">
      {#each displayedGame.board as cell, i}
        <button
          class="cell"
          class:x={cell === 'X'}
          class:o={cell === 'O'}
          class:last={cell !== null
            && displayedGame.previousMove === i
            && displayedGame.previousMoveRevealed}
          on:click={() => onCellClick(i)}
          disabled={phase !== 'playing' || !myTurn || !!cell}
          aria-label={`cell ${i + 1}`}
        >
          {cellSymbol(cell)}
        </button>
      {/each}
    </div>
    {#if mySym}
      <p class="role">You are {mySym}.</p>
    {/if}
    {#if showRevealButton}
      <button
        class="reveal"
        on:click={onRevealPrevious}
        disabled={!canRevealPrevious}
      >
        Show previous move
      </button>
    {/if}
  {/if}
</main>

{#if outcomeAnimation === 'fireworks'}
  <div class="overlay" aria-hidden="true">
    {#each sparkles as s, i (i)}
      <span
        class="sparkle"
        style="left: {s.cx}%; top: {s.cy}%; background: {s.color}; box-shadow: 0 0 6px {s.color}; --dx: {s.dx}px; --dy: {s.dy}px; animation-delay: {s.delay}ms"
      ></span>
    {/each}
  </div>
{:else if outcomeAnimation === 'rain'}
  <div class="overlay" aria-hidden="true">
    {#each raindrops as d, i (i)}
      <span
        class="drop"
        style="left: {d.x}vw; animation-delay: {d.delay}ms; animation-duration: {d.duration}ms"
      ></span>
    {/each}
  </div>
{/if}

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
  .cell.last {
    color: #f87171;
    text-shadow:
      0 0 8px rgba(248, 113, 113, 0.95),
      0 0 18px rgba(248, 113, 113, 0.6);
  }
  .reveal {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    font-size: 0.95rem;
    background: #18181b;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    cursor: pointer;
  }
  .reveal:hover:not(:disabled) {
    background: #27272a;
  }
  .reveal:disabled {
    color: #52525b;
    cursor: default;
  }
  .overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 10;
    overflow: hidden;
  }
  .sparkle {
    position: absolute;
    width: 6px;
    height: 6px;
    margin: -3px 0 0 -3px;
    border-radius: 50%;
    opacity: 0;
    animation: sparkle-fly 1100ms ease-out forwards;
  }
  @keyframes sparkle-fly {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.4);
    }
    10% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(var(--dx), var(--dy)) scale(1.15);
    }
  }
  .drop {
    position: absolute;
    top: -20px;
    width: 2px;
    height: 14px;
    border-radius: 1px;
    background: linear-gradient(
      180deg,
      rgba(96, 165, 250, 0),
      rgba(96, 165, 250, 0.95)
    );
    animation: drop-fall linear forwards;
  }
  @keyframes drop-fall {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(calc(100vh + 40px));
    }
  }
</style>
