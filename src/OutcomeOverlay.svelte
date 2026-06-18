<script lang="ts">
  export let outcome: 'fireworks' | 'rain' | null = null;

  type Sparkle = {
    cx: number;
    cy: number;
    dx: number;
    dy: number;
    color: string;
    delay: number;
  };
  type Drop = {
    x: number;
    delay: number;
    duration: number;
  };

  const ANIMATION_MS = 3000;

  let sparkles: Sparkle[] = [];
  let raindrops: Drop[] = [];
  let lastOutcome: 'fireworks' | 'rain' | null = null;

  $: regenerate(outcome);

  function regenerate(o: typeof outcome) {
    if (o === lastOutcome) return;
    lastOutcome = o;
    if (o === 'fireworks') sparkles = makeFireworks();
    else if (o === 'rain') raindrops = makeRain();
  }

  function makeFireworks(): Sparkle[] {
    const palette = [
      '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#34d399', '#f4f4f5', '#fb923c',
    ];
    const out: Sparkle[] = [];
    const bursts = 3;
    const perBurst = 24;
    for (let b = 0; b < bursts; b++) {
      const cx = 15 + Math.random() * 70;
      const cy = 18 + Math.random() * 35;
      const burstDelay = b * 700;
      for (let i = 0; i < perBurst; i++) {
        const angle = (Math.PI * 2 * i) / perBurst + Math.random() * 0.4;
        const dist = 80 + Math.random() * 90;
        out.push({
          cx,
          cy,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          color: palette[Math.floor(Math.random() * palette.length)],
          delay: burstDelay,
        });
      }
    }
    return out;
  }

  function makeRain(): Drop[] {
    const out: Drop[] = [];
    const count = 60;
    for (let i = 0; i < count; i++) {
      out.push({
        x: Math.random() * 100,
        delay: Math.random() * (ANIMATION_MS - 500),
        duration: 600 + Math.random() * 600,
      });
    }
    return out;
  }
</script>

{#if outcome === 'fireworks'}
  <div class="overlay" aria-hidden="true">
    {#each sparkles as s, i (i)}
      <span
        class="sparkle"
        style="left: {s.cx}%; top: {s.cy}%; background: {s.color}; box-shadow: 0 0 6px {s.color}; --dx: {s.dx}px; --dy: {s.dy}px; animation-delay: {s.delay}ms"
      ></span>
    {/each}
  </div>
{:else if outcome === 'rain'}
  <div class="overlay" aria-hidden="true">
    {#each raindrops as d, i (i)}
      <span
        class="drop"
        style="left: {d.x}vw; animation-delay: {d.delay}ms; animation-duration: {d.duration}ms"
      ></span>
    {/each}
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 10;
    overflow: hidden;
  }
  .sparkle {
    position: absolute;
    width: 6px;
    height: 6px;
    margin: -3px 0 0 -3px;
    border-radius: 50%;
    opacity: 0;
    animation: sparkle-fly 1100ms ease-out forwards;
  }
  @keyframes sparkle-fly {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.4);
    }
    10% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(var(--dx), var(--dy)) scale(1.15);
    }
  }
  .drop {
    position: absolute;
    top: -20px;
    width: 2px;
    height: 14px;
    border-radius: 1px;
    background: linear-gradient(
      180deg,
      rgba(96, 165, 250, 0),
      rgba(96, 165, 250, 0.95)
    );
    animation: drop-fall linear forwards;
  }
  @keyframes drop-fall {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(calc(100vh + 40px));
    }
  }
</style>
