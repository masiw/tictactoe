<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import OutcomeOverlay from './OutcomeOverlay.svelte';
  import Pip from './Pip.svelte';
  import {
    dealHands,
    hasAnyPlayable,
    pipSum,
    placeOnLeft,
    placeOnRight,
    removeTile,
    tileEquals,
    tilePlayability,
    type Tile,
  } from './dominoes';

  export let navigate: (path: string) => void;

  type PlayerKey = 'p1' | 'p2';
  type Phase = 'playing' | 'pass-device' | 'finished';

  const OUTCOME_ANIMATION_MS = 3000;

  let p1Hand: Tile[] = [];
  let p2Hand: Tile[] = [];
  let board: Tile[] = [];
  let leftEnd: number | null = null;
  let rightEnd: number | null = null;
  let turn: PlayerKey = 'p1';
  let consecutivePasses = 0;
  let phase: Phase = 'playing';
  let result: PlayerKey | 'draw' | null = null;
  let pendingTile: Tile | null = null;
  let outcomeAnimation: 'fireworks' | 'rain' | null = null;
  let outcomeAnimationTimer: ReturnType<typeof setTimeout> | null = null;

  $: currentHand = turn === 'p1' ? p1Hand : p2Hand;
  $: opponentHandCount = (turn === 'p1' ? p2Hand : p1Hand).length;
  $: canPass =
    phase === 'playing' &&
    board.length > 0 &&
    !hasAnyPlayable(currentHand, leftEnd, rightEnd);
  $: pendingValid = pendingTile
    ? tilePlayability(pendingTile, leftEnd, rightEnd)
    : { left: false, right: false };

  $: status = (() => {
    if (phase === 'finished') {
      if (result === 'draw') return "It's a draw.";
      if (result === 'p1') return 'Player 1 wins!';
      if (result === 'p2') return 'Player 2 wins!';
      return 'Game over.';
    }
    if (phase === 'pass-device') {
      return `Pass device to ${turn === 'p1' ? 'Player 1' : 'Player 2'}.`;
    }
    return `${turn === 'p1' ? "Player 1's" : "Player 2's"} turn`;
  })();

  function dealNewGame() {
    const { p1, p2 } = dealHands();
    p1Hand = p1;
    p2Hand = p2;
    board = [];
    leftEnd = null;
    rightEnd = null;
    turn = 'p1';
    consecutivePasses = 0;
    phase = 'playing';
    result = null;
    pendingTile = null;
    outcomeAnimation = null;
    if (outcomeAnimationTimer) clearTimeout(outcomeAnimationTimer);
  }

  onMount(dealNewGame);

  function play(tile: Tile, side: 'left' | 'right') {
    if (phase !== 'playing') return;
    const hand = turn === 'p1' ? p1Hand : p2Hand;
    if (!hand.some((t) => tileEquals(t, tile))) return;

    if (board.length === 0) {
      board = [tile];
      leftEnd = tile[0];
      rightEnd = tile[1];
    } else if (side === 'right') {
      const r = placeOnRight(board, tile, rightEnd as number);
      if (!r) return;
      board = r.board;
      rightEnd = r.newRightEnd;
    } else {
      const r = placeOnLeft(board, tile, leftEnd as number);
      if (!r) return;
      board = r.board;
      leftEnd = r.newLeftEnd;
    }

    const newHand = removeTile(hand, tile);
    if (turn === 'p1') p1Hand = newHand;
    else p2Hand = newHand;

    consecutivePasses = 0;
    pendingTile = null;

    if (newHand.length === 0) {
      result = turn;
      phase = 'finished';
      triggerOutcome('fireworks');
    } else {
      turn = turn === 'p1' ? 'p2' : 'p1';
      phase = 'pass-device';
    }
  }

  function passTurn() {
    if (phase !== 'playing' || !canPass) return;
    consecutivePasses += 1;
    pendingTile = null;
    if (consecutivePasses >= 2) {
      const p1Pips = pipSum(p1Hand);
      const p2Pips = pipSum(p2Hand);
      result = p1Pips < p2Pips ? 'p1' : p2Pips < p1Pips ? 'p2' : 'draw';
      phase = 'finished';
      if (result !== 'draw') triggerOutcome('fireworks');
    } else {
      turn = turn === 'p1' ? 'p2' : 'p1';
      phase = 'pass-device';
    }
  }

  function ready() {
    if (phase !== 'pass-device') return;
    phase = 'playing';
  }

  function onTileTap(tile: Tile) {
    if (phase !== 'playing') return;
    const hand = turn === 'p1' ? p1Hand : p2Hand;
    if (!hand.some((t) => tileEquals(t, tile))) return;
    if (board.length === 0) {
      play(tile, 'right');
      return;
    }
    const p = tilePlayability(tile, leftEnd, rightEnd);
    if (!p.left && !p.right) return;
    if (p.left && p.right) {
      pendingTile = pendingTile && tileEquals(pendingTile, tile) ? null : tile;
      return;
    }
    play(tile, p.left ? 'left' : 'right');
  }

  function pickSide(side: 'left' | 'right') {
    if (!pendingTile) return;
    play(pendingTile, side);
  }

  function triggerOutcome(kind: 'fireworks' | 'rain') {
    outcomeAnimation = kind;
    if (outcomeAnimationTimer) clearTimeout(outcomeAnimationTimer);
    outcomeAnimationTimer = setTimeout(() => {
      outcomeAnimation = null;
    }, OUTCOME_ANIMATION_MS);
  }

  function tileClass(tile: Tile): { playable: boolean } {
    if (board.length === 0) return { playable: true };
    const p = tilePlayability(tile, leftEnd, rightEnd);
    return { playable: p.left || p.right };
  }

  onDestroy(() => {
    if (outcomeAnimationTimer) clearTimeout(outcomeAnimationTimer);
  });
</script>

<main>
  <button class="back" on:click={() => navigate('/')}>← Games</button>
  <h1>Dominoes</h1>
  <p class="status">{status}</p>

  {#if board.length > 0 && phase !== 'finished'}
    <p class="opponent">Other player has {opponentHandCount} {opponentHandCount === 1 ? 'tile' : 'tiles'}.</p>
  {/if}

  <div class="board-wrap">
    {#if board.length === 0}
      <p class="empty-board">No tiles played yet.</p>
    {:else}
      <div class="board" role="list">
        {#each board as tile, i (i)}
          <span class="tile board-tile" role="listitem">
            <span class="half"><Pip value={tile[0]} /></span>
            <span class="half"><Pip value={tile[1]} /></span>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  {#if phase === 'pass-device'}
    <p class="hint">Hands are hidden until the next player taps Ready.</p>
    <button class="ready" on:click={ready}>Ready</button>
  {:else if phase === 'playing'}
    {#if pendingTile && board.length > 0}
      <div class="side-picker">
        <button
          class="side"
          on:click={() => pickSide('left')}
          disabled={!pendingValid.left}
        >
          Play on left ({leftEnd})
        </button>
        <button
          class="side"
          on:click={() => pickSide('right')}
          disabled={!pendingValid.right}
        >
          Play on right ({rightEnd})
        </button>
      </div>
    {/if}

    <div class="hand">
      {#each currentHand as tile, i (i)}
        {@const cls = tileClass(tile)}
        <button
          class="tile hand-tile"
          class:selected={pendingTile && tileEquals(pendingTile, tile)}
          class:dim={!cls.playable}
          on:click={() => onTileTap(tile)}
          disabled={!cls.playable && board.length > 0}
          aria-label={`tile ${tile[0]} ${tile[1]}`}
        >
          <span class="half"><Pip value={tile[0]} /></span>
          <span class="half"><Pip value={tile[1]} /></span>
        </button>
      {/each}
    </div>

    {#if canPass}
      <button class="pass" on:click={passTurn}>Pass turn (no playable tile)</button>
    {/if}
  {:else if phase === 'finished'}
    {#if result === 'draw'}
      <p class="info">P1: {pipSum(p1Hand)} pips · P2: {pipSum(p2Hand)} pips.</p>
    {/if}
    <button class="new-game" on:click={dealNewGame}>New game</button>
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
  .hint {
    color: #71717a;
    font-size: 0.9rem;
    margin: 0.75rem 0;
  }
  .info {
    color: #a1a1aa;
    font-size: 0.95rem;
    margin: 0.75rem 0;
  }
  .empty-board {
    color: #52525b;
    font-style: italic;
    margin: 0.75rem 0;
  }
  .board-wrap {
    margin: 0.5rem 0;
    overflow-x: auto;
    padding: 0.5rem 0;
  }
  .board {
    display: inline-flex;
    gap: 4px;
    padding: 0 0.5rem;
  }
  .tile {
    display: inline-flex;
    height: 44px;
    width: 76px;
    background: #27272a;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    overflow: hidden;
    padding: 0;
    flex-shrink: 0;
  }
  .tile .half {
    flex: 1;
    display: flex;
    align-items: stretch;
    justify-content: center;
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
  .side,
  .pass,
  .ready,
  .new-game {
    padding: 0.55rem 1rem;
    font-size: 0.95rem;
    background: #18181b;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    cursor: pointer;
  }
  .side:hover:not(:disabled),
  .pass:hover,
  .ready:hover,
  .new-game:hover {
    background: #27272a;
  }
  .side:disabled {
    color: #52525b;
    cursor: default;
  }
  .ready {
    margin-top: 0.5rem;
    background: #fbbf24;
    color: #18181b;
    border-color: #fbbf24;
    font-weight: 600;
  }
  .ready:hover {
    background: #fcd34d;
  }
  .new-game {
    margin-top: 1rem;
    background: #fbbf24;
    color: #18181b;
    border-color: #fbbf24;
    font-weight: 600;
  }
  .new-game:hover {
    background: #fcd34d;
  }
  .pass {
    margin-top: 0.75rem;
  }
</style>
