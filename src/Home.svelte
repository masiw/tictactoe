<script lang="ts">
  export let navigate: (path: string) => void;

  type GameEntry = { label: string; path: string };

  const games: GameEntry[] = [
    { label: 'Tic-Tac-Toe', path: '/tictactoe' },
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
    color: #71717a;
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
    background: #18181b;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    cursor: pointer;
    text-align: center;
  }
  .game:hover {
    background: #27272a;
  }
</style>
