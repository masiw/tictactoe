<script lang="ts">
  export let value: number;

  // Dot positions in a 3x3 grid laid out top-to-bottom, left-to-right:
  //   1 2 3
  //   4 5 6
  //   7 8 9
  // 2 / 3 use the anti-diagonal (3, 7) so they read like a real die.
  // 6 uses two columns of three so the half doesn't look squashed when the
  // tile half is taller than it is wide.
  const positions: Record<number, number[]> = {
    0: [],
    1: [5],
    2: [3, 7],
    3: [3, 5, 7],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 4, 7, 3, 6, 9],
  };

  $: dots = new Set(positions[value] ?? []);
</script>

<div class="pip" aria-label={String(value)}>
  {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as pos (pos)}
    <span class="slot" class:on={dots.has(pos)}></span>
  {/each}
</div>

<style>
  .pip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    width: 100%;
    height: 100%;
    padding: 4px;
    box-sizing: border-box;
  }
  .slot {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .slot.on::after {
    content: '';
    display: block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f4f4f5;
  }
</style>
