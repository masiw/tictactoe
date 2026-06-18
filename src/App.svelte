<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Home from './Home.svelte';
  import TicTacToe from './TicTacToe.svelte';

  let path = '/';

  function navigate(to: string) {
    if (typeof window === 'undefined') return;
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to);
    }
    path = to;
  }

  function onPop() {
    path = window.location.pathname;
  }

  onMount(() => {
    path = window.location.pathname;
    window.addEventListener('popstate', onPop);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', onPop);
    }
  });
</script>

{#if path === '/tictactoe'}
  <TicTacToe {navigate} />
{:else}
  <Home {navigate} />
{/if}

<style>
  :global(html),
  :global(body) {
    background: #09090b;
    color: #f4f4f5;
    margin: 0;
    min-height: 100vh;
  }
</style>
