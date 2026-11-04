<script lang="ts">
  export let navigate: (path: string) => void;
  export let game: 'tictactoe' | 'dominoes' | 'rummikub';

  const labels: Record<typeof game, string> = {
    tictactoe: 'Tic-Tac-Toe',
    dominoes: 'Dominoes',
    rummikub: 'Rummikub',
  };

  // Single-device play isn't available for every game yet.
  $: singleAvailable = game !== 'rummikub';

  let mode: 'network' | 'single' = 'network';
  // Keep the selection valid if single-device isn't offered for this game.
  $: if (!singleAvailable) mode = 'network';

  function start() {
    navigate(`/${game}?mode=${mode}`);
  }
</script>

<main>
  <button class="back" on:click={() => navigate('/')}>← Games</button>
  <h1>{labels[game]}</h1>
  <p class="subtitle">Game settings</p>

  <fieldset class="options">
    <legend>How will you play?</legend>
    <label class="option">
      <input type="radio" bind:group={mode} value="network" />
      <span class="option-body">
        <span class="option-title">Over the network</span>
        <span class="option-detail">Each player on their own device.</span>
      </span>
    </label>
    <label class="option" class:disabled={!singleAvailable}>
      <input type="radio" bind:group={mode} value="single" disabled={!singleAvailable} />
      <span class="option-body">
        <span class="option-title">On a single device</span>
        <span class="option-detail">
          {singleAvailable
            ? 'Two players share this device, taking turns.'
            : 'Coming soon for this game — online only for now.'}
        </span>
      </span>
    </label>
  </fieldset>

  <button class="start" on:click={start}>Start game</button>
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 360px;
    margin: 2rem auto;
    padding: 0 1rem;
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
  h1 {
    margin: 0.5rem 0 0.25rem;
  }
  .subtitle {
    color: var(--text-dim);
    font-size: 0.95rem;
    margin: 0 0 1.5rem;
  }
  .options {
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    text-align: left;
  }
  .options legend {
    color: var(--text-muted);
    font-size: 0.9rem;
    padding: 0;
    margin-bottom: 0.5rem;
  }
  .option {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
  }
  .option:hover {
    background: var(--surface-2);
  }
  .option.disabled {
    opacity: 0.5;
    cursor: default;
  }
  .option.disabled:hover {
    background: var(--surface);
  }
  .option input {
    margin-top: 0.25rem;
    accent-color: #fbbf24;
  }
  .option-body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .option-title {
    font-size: 1rem;
  }
  .option-detail {
    color: var(--text-dim);
    font-size: 0.85rem;
  }
  .start {
    margin-top: 1.5rem;
    padding: 0.85rem 1rem;
    width: 100%;
    font-size: 1.05rem;
    background: #fbbf24;
    color: #18181b;
    border: 1px solid #fbbf24;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
  }
  .start:hover {
    background: #fcd34d;
  }
</style>
