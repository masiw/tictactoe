<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Dominoes from './Dominoes.svelte';
  import DominoesSingle from './DominoesSingle.svelte';
  import GameSettings from './GameSettings.svelte';
  import Home from './Home.svelte';
  import TicTacToe from './TicTacToe.svelte';
  import TicTacToeSingle from './TicTacToeSingle.svelte';

  let path = '/';
  let search = '';

  $: mode = new URLSearchParams(search).get('mode');

  function navigate(to: string) {
    if (typeof window === 'undefined') return;
    const current = window.location.pathname + window.location.search;
    if (to !== current) {
      window.history.pushState({}, '', to);
    }
    path = window.location.pathname;
    search = window.location.search;
  }

  function onPop() {
    path = window.location.pathname;
    search = window.location.search;
  }

  onMount(() => {
    path = window.location.pathname;
    search = window.location.search;
    window.addEventListener('popstate', onPop);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', onPop);
    }
  });
</script>

{#if path === '/tictactoe'}
  {#if mode === 'network'}
    <TicTacToe {navigate} />
  {:else if mode === 'single'}
    <TicTacToeSingle {navigate} />
  {:else}
    <GameSettings {navigate} game="tictactoe" />
  {/if}
{:else if path === '/dominoes'}
  {#if mode === 'network'}
    <Dominoes {navigate} />
  {:else if mode === 'single'}
    <DominoesSingle {navigate} />
  {:else}
    <GameSettings {navigate} game="dominoes" />
  {/if}
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
