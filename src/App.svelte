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
  let theme: 'dark' | 'light' = 'dark';

  $: mode = new URLSearchParams(search).get('mode');

  function applyTheme(t: 'dark' | 'light') {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#e5e5e7' : '#09090b');
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
  }

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
    applyTheme(theme);
    window.addEventListener('popstate', onPop);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', onPop);
    }
  });
</script>

<button
  class="theme-toggle"
  on:click={toggleTheme}
  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
  {theme === 'dark' ? '☀︎' : '☾'}
</button>

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
  /* Theme tokens. Custom properties inherit through the DOM into every
     component's scoped styles, so defining them here re-themes the whole app.
     Base :root is dark (matches the pre-JS paint); [data-theme="light"] flips. */
  :global(:root) {
    color-scheme: dark;
    --bg: #09090b;
    --surface: #18181b;
    --surface-2: #27272a;
    --border: #3f3f46;
    --text: #f4f4f5;
    --text-muted: #a1a1aa;
    --text-dim: #71717a;
    --text-faint: #52525b;
    --on-accent: #18181b;
    /* Dominoes stay white-with-black-dots in both themes (classic look). */
    --tile-bg: #f4f4f5;
    --tile-border: #d4d4d8;
    --tile-hover: #e4e4e7;
    --pip: #18181b;
  }
  :global(:root[data-theme='light']) {
    color-scheme: light;
    --bg: #e5e5e7;
    --surface: #ffffff;
    --surface-2: #e4e4e7;
    --border: #d4d4d8;
    --text: #18181b;
    --text-muted: #52525b;
    --text-dim: #71717a;
    --text-faint: #a1a1aa;
    --on-accent: #18181b;
    --tile-bg: #ffffff;
    --tile-border: #d4d4d8;
    --tile-hover: #e4e4e7;
    --pip: #18181b;
  }
  :global(html),
  :global(body) {
    background: var(--bg);
    color: var(--text);
    margin: 0;
    min-height: 100vh;
  }

  .theme-toggle {
    position: fixed;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 20;
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    line-height: 1;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
  }
  .theme-toggle:hover {
    background: var(--surface-2);
  }
</style>
