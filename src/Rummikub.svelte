<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { firebaseConfigured } from './firebase';
  import OutcomeOverlay from './OutcomeOverlay.svelte';
  import RummikubTile from './RummikubTile.svelte';
  import {
    MOVE_CLOCK_MS,
    applyAction,
    claimMatch,
    clientId,
    declareForfeit,
    forgetGame,
    myRole as roleOf,
    openingDoneFor,
    shouldForfeit,
    subscribeGame,
    type GameState,
    type Role,
  } from './rummikubMultiplayer';
  import {
    OPENING_MELD_POINTS,
    isValidSet,
    validateCommit,
    type Table,
    type Tile,
  } from './rummikub';

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
  let actionInFlight = false;
  let outcomeAnimation: 'fireworks' | 'rain' | null = null;
  let lastOutcomeGameId: string | null = null;
  let outcomeAnimationTimer: ReturnType<typeof setTimeout> | null = null;

  // Turn workspace (editable copy of the table + my hand while it's my turn).
  let wsSets: Table = [];
  let wsHand: Tile[] = [];
  let selected: { src: 'hand' | number; idx: number } | null = null;
  let wsKey: string | null = null;

  $: displayedGame = liveGame ?? lastKnownGame;
  $: myHand =
    displayedGame && role
      ? (role === 'p1' ? displayedGame.p1?.hand : displayedGame.p2?.hand) ?? []
      : [];
  $: oppHandCount =
    displayedGame && role
      ? ((role === 'p1' ? displayedGame.p2?.hand : displayedGame.p1?.hand) ?? []).length
      : 0;
  $: poolCount = displayedGame?.pool.length ?? 0;
  $: openingDone = displayedGame && role ? openingDoneFor(displayedGame, role) : false;
  $: phase = computePhase(displayedGame, liveGame, now);
  $: myTurn =
    !!displayedGame && displayedGame.state === 'playing' && displayedGame.turn === role;
  $: clockMs = displayedGame
    ? Math.max(0, displayedGame.lastMoveAt + MOVE_CLOCK_MS - now)
    : 0;

  // (Re)initialise the workspace once at the start of each of my turns.
  $: if (myTurn && displayedGame) maybeInitWorkspace(displayedGame);

  $: commitCheck =
    myTurn && displayedGame
      ? validateCommit(displayedGame.table, myHand, wsSets, wsHand, openingDone)
      : null;
  $: canCommit = commitCheck?.ok === true;

  $: maybeTriggerOutcome(displayedGame, role, gameId);

  function maybeInitWorkspace(g: GameState) {
    const key = `${gameId}|${g.lastMoveAt}`;
    if (key === wsKey) return;
    wsKey = key;
    const hand = (role === 'p1' ? g.p1?.hand : g.p2?.hand) ?? [];
    wsSets = g.table.map((s) => [...s]);
    wsHand = [...hand];
    selected = null;
  }

  function computePhase(
    shown: GameState | null,
    live: GameState | null,
    t: number,
  ): 'loading' | 'p1-waiting' | 'p1-expired' | 'playing' | 'finished' {
    if (!shown) return 'loading';
    if (shown.state === 'finished') return 'finished';
    if (!live && lastKnownGame?.state === 'finished') return 'finished';
    if (shown.state === 'waiting') {
      return t - shown.lastMoveAt > MOVE_CLOCK_MS ? 'p1-expired' : 'p1-waiting';
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
        return myTurn ? `Your turn — ${fmt(clockMs)}` : `Opponent's turn — ${fmt(clockMs)}`;
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
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function selectTile(src: 'hand' | number, idx: number) {
    if (!myTurn) return;
    if (selected && selected.src === src && selected.idx === idx) {
      selected = null;
    } else {
      selected = { src, idx };
    }
  }

  function moveSelectedTo(target: 'hand' | 'new' | number) {
    if (!selected) return;
    const newHand = [...wsHand];
    const newSets = wsSets.map((s) => [...s]);
    let tile: Tile;
    if (selected.src === 'hand') {
      tile = newHand[selected.idx];
      newHand.splice(selected.idx, 1);
    } else {
      tile = newSets[selected.src][selected.idx];
      newSets[selected.src].splice(selected.idx, 1);
    }
    if (target === 'hand') newHand.push(tile);
    else if (target === 'new') newSets.push([tile]);
    else newSets[target].push(tile);
    wsSets = newSets.filter((s) => s.length > 0);
    wsHand = newHand;
    selected = null;
  }

  function resetWorkspace() {
    if (!displayedGame) return;
    wsSets = displayedGame.table.map((s) => [...s]);
    wsHand = [...myHand];
    selected = null;
  }

  async function endTurn() {
    if (!gameId || !canCommit || actionInFlight) return;
    actionInFlight = true;
    try {
      await applyAction(
        gameId,
        { kind: 'commit', table: wsSets.filter((s) => s.length > 0), hand: wsHand },
        myId,
        Date.now(),
      );
    } finally {
      actionInFlight = false;
    }
  }

  async function draw() {
    if (!gameId || !myTurn || poolCount === 0 || actionInFlight) return;
    actionInFlight = true;
    try {
      await applyAction(gameId, { kind: 'draw' }, myId, Date.now());
    } finally {
      actionInFlight = false;
    }
  }

  async function pass() {
    if (!gameId || !myTurn || poolCount > 0 || actionInFlight) return;
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

  function maybeTriggerOutcome(g: GameState | null, sym: Role | null, id: string | null) {
    if (!g || g.state !== 'finished' || !sym || !id) return;
    if (lastOutcomeGameId === id) return;
    lastOutcomeGameId = id;
    if (g.winner === sym) outcomeAnimation = 'fireworks';
    else if (g.winner === 'p1' || g.winner === 'p2') outcomeAnimation = 'rain';
    else return;
    if (outcomeAnimationTimer) clearTimeout(outcomeAnimationTimer);
    outcomeAnimationTimer = setTimeout(() => (outcomeAnimation = null), OUTCOME_ANIMATION_MS);
  }

  onMount(async () => {
    if (!firebaseConfigured) {
      initError = 'Firebase is not configured. See SETUP.md for the env vars to set.';
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
</script>

<main>
  <button class="back" on:click={() => navigate('/')}>← Games</button>
  <h1>Rummikub</h1>

  {#if initError}
    <p class="error">{initError}</p>
  {:else if loading || !displayedGame}
    <p class="status">Loading…</p>
  {:else}
    <p class="status">{status}</p>

    {#if displayedGame.state !== 'waiting'}
      <p class="meta">
        Opponent: {oppHandCount} tiles · Pool: {poolCount}
        {#if phase === 'playing' && !openingDone && myTurn} · opening meld needs {OPENING_MELD_POINTS}{/if}
      </p>
    {/if}

    <!-- Table -->
    <section class="table">
      {#if myTurn}
        {#each wsSets as setTiles, si (si)}
          <div class="set" class:invalid={!isValidSet(setTiles)} class:droppable={!!selected} role="group">
            {#each setTiles as t, ti (ti)}
              <RummikubTile
                tile={t}
                selected={selected?.src === si && selected?.idx === ti}
                onClick={() => selectTile(si, ti)}
              />
            {/each}
            {#if selected}
              <button class="drop" on:click={() => moveSelectedTo(si)} aria-label="place tile here">▸</button>
            {/if}
          </div>
        {/each}
        {#if selected}
          <button class="set newset" on:click={() => moveSelectedTo('new')}>
            ＋ New set
          </button>
        {/if}
        {#if wsSets.length === 0 && !selected}
          <p class="empty">No sets on the table yet.</p>
        {/if}
      {:else}
        {#each displayedGame.table as setTiles, si (si)}
          <div class="set readonly" role="group">
            {#each setTiles as t, ti (ti)}
              <RummikubTile tile={t} disabled onClick={null} />
            {/each}
          </div>
        {/each}
        {#if displayedGame.table.length === 0}
          <p class="empty">No sets on the table yet.</p>
        {/if}
      {/if}
    </section>

    <!-- My hand -->
    {#if role}
      <section class="hand-area">
        <div class="hand-head">
          <span class="hand-label">Your tiles</span>
          {#if myTurn && selected && selected.src !== 'hand'}
            <button class="mini" on:click={() => moveSelectedTo('hand')}>↩ to hand</button>
          {/if}
        </div>
        <div class="hand">
          {#each (myTurn ? wsHand : myHand) as t, hi (hi)}
            <RummikubTile
              tile={t}
              selected={myTurn && selected?.src === 'hand' && selected?.idx === hi}
              disabled={!myTurn}
              onClick={myTurn ? () => selectTile('hand', hi) : null}
            />
          {/each}
        </div>
      </section>
    {/if}

    {#if myTurn}
      {#if !canCommit && commitCheck && !commitCheck.ok}
        <p class="hint">{commitCheck.reason}</p>
      {/if}
      <div class="controls">
        <button class="primary" on:click={endTurn} disabled={!canCommit || actionInFlight}>
          End turn
        </button>
        {#if poolCount > 0}
          <button class="secondary" on:click={draw} disabled={actionInFlight}>Draw a tile</button>
        {:else}
          <button class="secondary" on:click={pass} disabled={actionInFlight}>Pass</button>
        {/if}
        <button class="secondary" on:click={resetWorkspace} disabled={actionInFlight}>Reset</button>
      </div>
      <p class="hint subtle">Tap a tile, then tap a set (or ＋ New set) to place it.</p>
    {/if}
  {/if}
</main>

<OutcomeOverlay outcome={outcomeAnimation} />

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 420px;
    margin: 2rem auto;
    padding: 0 0.75rem 3rem;
    text-align: center;
  }
  .back {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    margin-bottom: 0.5rem;
    background: transparent;
    color: var(--text-muted);
    border: none;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .back:hover {
    color: var(--text);
  }
  .status {
    font-size: 1.15rem;
    margin: 0.75rem 0 0.25rem;
    color: var(--text-muted);
  }
  .meta {
    color: var(--text-dim);
    font-size: 0.85rem;
    margin: 0 0 0.75rem;
  }
  .error {
    color: #f87171;
    margin: 1rem 0;
    white-space: pre-wrap;
  }
  .empty {
    color: var(--text-faint);
    font-style: italic;
    margin: 0.75rem 0;
  }
  .table {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    min-height: 56px;
    padding: 0.5rem;
    border: 1px dashed var(--border);
    border-radius: 10px;
    margin-bottom: 0.75rem;
  }
  .set {
    display: flex;
    gap: 3px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface);
  }
  .set.invalid {
    border-color: #f87171;
  }
  .set.droppable {
    border-style: dashed;
    border-color: #fbbf24;
    cursor: pointer;
  }
  .set.readonly {
    background: var(--surface);
  }
  .drop {
    width: 24px;
    height: 40px;
    align-self: center;
    background: #fbbf24;
    color: #18181b;
    border: none;
    border-radius: 5px;
    font-weight: 700;
    cursor: pointer;
  }
  .newset {
    align-items: center;
    color: var(--text-muted);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .newset:hover {
    color: var(--text);
  }
  .hand-area {
    margin-top: 0.5rem;
  }
  .hand-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 0.35rem;
  }
  .hand-label {
    color: var(--text-dim);
    font-size: 0.85rem;
  }
  .mini {
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }
  .hand {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    justify-content: center;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    min-height: 48px;
  }
  .hint {
    color: var(--text-dim);
    font-size: 0.85rem;
    margin: 0.75rem 0 0.25rem;
  }
  .hint.subtle {
    color: var(--text-faint);
    font-size: 0.8rem;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 0.5rem;
  }
  .primary,
  .secondary {
    padding: 0.55rem 1rem;
    font-size: 0.95rem;
    border-radius: 6px;
    cursor: pointer;
  }
  .primary {
    background: #fbbf24;
    color: #18181b;
    border: 1px solid #fbbf24;
    font-weight: 600;
  }
  .primary:disabled {
    background: var(--surface);
    color: var(--text-faint);
    border-color: var(--border);
    cursor: default;
  }
  .secondary {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }
  .secondary:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .secondary:disabled {
    color: var(--text-faint);
    cursor: default;
  }
</style>
