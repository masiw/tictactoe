<script lang="ts">
  import { isJoker, tileColor, tileNumber, type Tile } from './rummikub';

  export let tile: Tile;
  export let selected = false;
  export let disabled = false;
  export let onClick: (() => void) | null = null;

  const colorVar: Record<string, string> = {
    r: '#dc2626',
    b: '#2563eb',
    o: '#ea580c',
    k: 'var(--pip)',
  };

  $: joker = isJoker(tile);
  $: color = joker ? '#7c3aed' : (colorVar[tileColor(tile) as string] ?? 'var(--pip)');
  $: label = joker ? '★' : String(tileNumber(tile));
</script>

<button
  class="rk-tile"
  class:selected
  class:joker
  style="color: {color}"
  {disabled}
  on:click|stopPropagation={() => onClick && onClick()}
  aria-label={joker ? 'joker' : `${tileColor(tile)} ${tileNumber(tile)}`}
>
  {label}
</button>

<style>
  .rk-tile {
    width: 30px;
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
    font-weight: 700;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    background: var(--tile-bg);
    border: 1px solid var(--tile-border);
    border-radius: 5px;
    padding: 0;
    cursor: pointer;
  }
  .rk-tile:disabled {
    cursor: default;
  }
  .rk-tile.joker {
    font-size: 1.3rem;
  }
  .rk-tile.selected {
    outline: 2px solid #fbbf24;
    outline-offset: 1px;
    box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
  }
</style>
