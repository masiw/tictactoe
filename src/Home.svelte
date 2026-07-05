<script lang="ts">
  export let navigate: (path: string) => void;

  type GameEntry = { label: string; path: string };

  const games: GameEntry[] = [
    { label: 'Tic-Tac-Toe', path: '/tictactoe' },
    { label: 'Dominoes', path: '/dominoes' },
  ];
</script>

<main>
  <h1>Tic-Tac-Toe Games</h1>
  <p class="subtitle">Pick a game to start or join.</p>
  <nav class="games">
    {#each games as g}
      <button class="game" on:click={() => navigate(g.path)}>
        {g.label}
      </button>
    {/each}
  </nav>
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 320px;
    margin: 2rem auto;
    text-align: center;
  }
  .subtitle {
    color: var(--text-dim);
    font-size: 0.95rem;
    margin: 0.5rem 0 1.5rem;
  }
  .games {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .game {
    padding: 0.85rem 1rem;
    font-size: 1.05rem;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    text-align: center;
  }
  .game:hover {
    background: var(--surface-2);
  }
</style>
