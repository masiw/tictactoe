<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { firebaseConfigured } from './firebase';
  import {
    MOVE_CLOCK_MS,
    applyAction,
    claimMatch,
    clientId,
    declareForfeit,
    forgetGame,
    myRole as roleOf,
    shouldForfeit,
    subscribeGame,
    type GameState,
    type Role,
  } from './dominoesMultiplayer';
  import {
    hasAnyPlayable,
    tileEquals,
    tilePlayability,
    type Tile,
  } from './dominoes';
  import OutcomeOverlay from './OutcomeOverlay.svelte';

  export let navigate: (path: string) => void;

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
  let lastOutcomeGameId: string | null = null;
  let outcomeAnimationTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTile: Tile | null = null;
  let actionInFlight = false;

  $: displayedGame = liveGame ?? lastKnownGame;
  $: myHand = displayedGame
    ? role === 'p1'
      ? displayedGame.p1?.hand ?? []
      : role === 'p2'
        ? displayedGame.p2?.hand ?? []
        : []
    : [];
  $: oppHandCount = displayedGame
    ? role === 'p1'
      ? displayedGame.p2?.hand.length ?? 0
      : role === 'p2'
        ? displayedGame.p1?.hand.length ?? 0
        : 0
    : 0;
  $: phase = computePhase(displayedGame, liveGame, now);
  $: myTurn = !!displayedGame && displayedGame.state === 'playing' && displayedGame.turn === role;
  $: clockMs = displayedGame
    ? Math.max(0, displayedGame.lastMoveAt + MOVE_CLOCK_MS - now)
    : 0;
  $: canPass =
    myTurn &&
    !!displayedGame &&
    displayedGame.board.length > 0 &&
    !hasAnyPlayable(myHand, displayedGame.leftEnd, displayedGame.rightEnd);

  $: maybeTriggerOutcomeAnimation(displayedGame, role, gameId);

  // Pending-tile validity tracks the current ends. The side-picker buttons
  // disable themselves based on these flags, so a tile that becomes invalid
  // after an opponent move stays selectable in the UI but neither side fires.
  $: pendingValid = pendingTile && displayedGame
    ? tilePlayability(pendingTile, displayedGame.leftEnd, displayedGame.rightEnd)
    : { left: false, right: false };

  function computePhase(
    shown: GameState | null,
    live: GameState | null,
    t: number,
  ): 'loading' | 'p1-waiting' | 'p1-expired' | 'playing' | 'finished' {
    if (!shown) return 'loading';
    if (shown.state === 'finished') return 'finished';
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
        return `Waiting for opponent… (${fmt(clockMs)})`;
      case 'p1-expired':
        return 'No one joined. Refresh to start a new game.';
      case 'playing':
        return myTurn
          ? `Your turn — ${fmt(clockMs)} to play`
          : `Opponent's turn — ${fmt(clockMs)} left`;
      case 'finished': {
        const w = displayedGame?.winner;
        if (w === 'draw') return "It's a draw. Refresh for a new game.";
        if (w === role) return 'You win! Refresh for a new game.';
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

  function maybeTriggerOutcomeAnimation(
    g: GameState | null,
    sym: Role | null,
    id: string | null,
  ) {
    if (!g || g.state !== 'finished' || !sym || !id) return;
    if (lastOutcomeGameId === id) return;
    lastOutcomeGameId = id;
    if (g.winner === sym) {
      outcomeAnimation = 'fireworks';
    } else if (g.winner === 'p1' || g.winner === 'p2') {
      outcomeAnimation = 'rain';
    } else {
      return;
    }
    if (outcomeAnimationTimer) clearTimeout(outcomeAnimationTimer);
    outcomeAnimationTimer = setTimeout(() => {
      outcomeAnimation = null;
    }, OUTCOME_ANIMATION_MS);
  }

  async function onTileTap(tile: Tile) {
    if (!gameId || !myTurn || actionInFlight) return;
    if (!displayedGame) return;
    // First move: any tile works, side is irrelevant.
    if (displayedGame.board.length === 0) {
      await runPlace(tile, 'right');
      return;
    }
    const play = tilePlayability(tile, displayedGame.leftEnd, displayedGame.rightEnd);
    if (!play.left && !play.right) return;
    if (play.left && play.right) {
      pendingTile =
        pendingTile && tileEquals(pendingTile, tile) ? null : tile;
      return;
    }
    await runPlace(tile, play.left ? 'left' : 'right');
  }

  async function runPlace(tile: Tile, side: 'left' | 'right') {
    if (!gameId || actionInFlight) return;
    actionInFlight = true;
    try {
      await applyAction(gameId, { kind: 'place', tile, side }, myId, Date.now());
      pendingTile = null;
    } finally {
      actionInFlight = false;
    }
  }

  async function onPickSide(side: 'left' | 'right') {
    if (!pendingTile) return;
    await runPlace(pendingTile, side);
  }

  async function onPass() {
    if (!gameId || !canPass || actionInFlight) return;
    actionInFlight = true;
    try {
      await applyAction(gameId, { kind: 'pass' }, myId, Date.now());
    } finally {
      actionInFlight = false;
    }
  }

  async function maybeForfeit() {
    if (!gameId || forfeitInFlight || !liveGame) return;
    if (!roleOf(liveGame, myId)) return;
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
          if (s.state === 'finished') forgetGame();
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

  function tileClassFor(tile: Tile, g: GameState | null): {
    canLeft: boolean;
    canRight: boolean;
    playable: boolean;
  } {
    if (!g) return { canLeft: false, canRight: false, playable: false };
    if (g.board.length === 0) return { canLeft: true, canRight: true, playable: true };
    const p = tilePlayability(tile, g.leftEnd, g.rightEnd);
    return { canLeft: p.left, canRight: p.right, playable: p.left || p.right };
  }
</script>

<main>
  <button class="back" on:click={() => navigate('/')}>← Games</button>
  <h1>Dominoes</h1>

  {#if initError}
    <p class="error">{initError}</p>
  {:else if loading || !displayedGame}
    <p class="status">Loading…</p>
  {:else}
    <p class="status">{status}</p>

    {#if displayedGame.state !== 'waiting'}
      <p class="opponent">Opponent has {oppHandCount} {oppHandCount === 1 ? 'tile' : 'tiles'}.</p>
    {/if}

    <div class="board-wrap">
      {#if displayedGame.board.length === 0}
        <p class="empty-board">No tiles played yet.</p>
      {:else}
        <div class="board" role="list">
          {#each displayedGame.board as tile, i (i)}
            <span class="tile board-tile" role="listitem">
              <span class="half">{tile[0]}</span>
              <span class="half">{tile[1]}</span>
            </span>
          {/each}
        </div>
      {/if}
    </div>

    {#if pendingTile && displayedGame.board.length > 0}
      <div class="side-picker">
        <button
          class="side"
          on:click={() => onPickSide('left')}
          disabled={!pendingValid.left || actionInFlight}
        >
          Play on left ({displayedGame.leftEnd})
        </button>
        <button
          class="side"
          on:click={() => onPickSide('right')}
          disabled={!pendingValid.right || actionInFlight}
        >
          Play on right ({displayedGame.rightEnd})
        </button>
      </div>
    {/if}

    {#if role}
      <p class="role">You are P{role === 'p1' ? '1' : '2'}.</p>
    {/if}

    {#if displayedGame.state === 'playing'}
      <div class="hand">
        {#each myHand as tile, i (i)}
          {@const cls = tileClassFor(tile, displayedGame)}
          <button
            class="tile hand-tile"
            class:selected={pendingTile && tileEquals(pendingTile, tile)}
            class:dim={!cls.playable && myTurn}
            on:click={() => onTileTap(tile)}
            disabled={!myTurn || (!cls.playable && displayedGame.board.length > 0) || actionInFlight}
            aria-label={`tile ${tile[0]} ${tile[1]}`}
          >
            <span class="half">{tile[0]}</span>
            <span class="half">{tile[1]}</span>
          </button>
        {/each}
      </div>
    {:else if displayedGame.state === 'finished' && myHand.length > 0}
      <div class="hand">
        {#each myHand as tile, i (i)}
          <span class="tile hand-tile dim">
            <span class="half">{tile[0]}</span>
            <span class="half">{tile[1]}</span>
          </span>
        {/each}
      </div>
    {/if}

    {#if canPass}
      <button class="pass" on:click={onPass} disabled={actionInFlight}>
        Pass turn (no playable tile)
      </button>
    {/if}
  {/if}
</main>

<OutcomeOverlay outcome={outcomeAnimation} />

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 360px;
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
    font-size: 1.15rem;
    margin: 1rem 0 0.5rem;
    color: #a1a1aa;
  }
  .opponent {
    color: #71717a;
    font-size: 0.9rem;
    margin: 0 0 1rem;
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
  .board-wrap {
    margin: 0.5rem 0;
    overflow-x: auto;
    padding: 0.5rem 0;
  }
  .empty-board {
    color: #52525b;
    font-style: italic;
    margin: 0.75rem 0;
  }
  .board {
    display: inline-flex;
    gap: 4px;
    padding: 0 0.5rem;
  }
  .tile {
    display: inline-flex;
    height: 32px;
    min-width: 56px;
    background: #27272a;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    overflow: hidden;
  }
  .tile .half {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.05rem;
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .tile .half + .half {
    border-left: 1px solid #3f3f46;
  }
  .board-tile {
    background: #18181b;
  }
  .hand {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin: 0.75rem 0;
  }
  .hand-tile {
    cursor: pointer;
    padding: 0;
  }
  .hand-tile:hover:not(:disabled) {
    background: #3f3f46;
  }
  .hand-tile:disabled {
    cursor: default;
  }
  .hand-tile.dim {
    opacity: 0.35;
  }
  .hand-tile.selected {
    border-color: #fbbf24;
    box-shadow: 0 0 8px rgba(251, 191, 36, 0.55);
  }
  .side-picker {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin: 0.5rem 0;
  }
  .side {
    padding: 0.5rem 0.75rem;
    font-size: 0.95rem;
    background: #18181b;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    cursor: pointer;
  }
  .side:hover:not(:disabled) {
    background: #27272a;
  }
  .side:disabled {
    color: #52525b;
    cursor: default;
  }
  .pass {
    margin-top: 1rem;
    padding: 0.55rem 1rem;
    font-size: 0.95rem;
    background: #18181b;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    cursor: pointer;
  }
  .pass:hover:not(:disabled) {
    background: #27272a;
  }
  .pass:disabled {
    color: #52525b;
    cursor: default;
  }
</style>
