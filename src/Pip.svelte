<script lang="ts">
  export let value: number;
  export let orientation: 'horizontal' | 'vertical' = 'horizontal';

  // 3x3 grid layout (positions 1..9 laid out row by row):
  //   1 2 3
  //   4 5 6
  //   7 8 9
  //
  // The vertical map is the horizontal map rotated 90deg clockwise, which
  // matches what you'd see if you physically turned a real domino tile onto
  // its short edge — 2/3 flip from anti-diagonal to diagonal, 6 flips from
  // two columns of three to two rows of three, etc.
  const positionsHorizontal: Record<number, number[]> = {
    0: [],
    1: [5],
    2: [3, 7],
    3: [3, 5, 7],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 4, 7, 3, 6, 9],
  };
  const positionsVertical: Record<number, number[]> = {
    0: [],
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 2, 3, 7, 8, 9],
  };

  $: positions =
    orientation === 'vertical' ? positionsVertical : positionsHorizontal;
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
