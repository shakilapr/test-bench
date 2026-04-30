<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  type SimStatus = {
    running: boolean;
    pid: number | null;
    started_at: number | null;
    last_error: string | null;
  };

  let status: SimStatus | null = null;
  let busy = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    try {
      const r = await fetch("/api/sim/status");
      if (r.ok) status = await r.json();
    } catch {
      // backend down — leave status as-is so the button greys out gracefully.
    }
  }
  async function toggle() {
    if (busy || !status) return;
    busy = true;
    try {
      const url = status.running ? "/api/sim/stop" : "/api/sim/start";
      const r = await fetch(url, { method: "POST" });
      if (r.ok) status = await r.json();
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    refresh();
    pollTimer = setInterval(refresh, 3000);
  });
  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });
</script>

{#if status}
  <button
    class="sim-btn"
    class:running={status.running}
    on:click={toggle}
    disabled={busy}
    title={status.running
      ? `Stop simulator (pid ${status.pid})`
      : status.last_error
        ? `Start simulator — last error: ${status.last_error}`
        : "Start simulator"}
    data-testid="sim-toggle"
  >
    <span class="icon" aria-hidden="true">
      {#if status.running}
        <!-- Square stop icon -->
        <svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor"/></svg>
      {:else}
        <!-- Triangle play icon -->
        <svg viewBox="0 0 16 16" width="14" height="14"><polygon points="4,3 13,8 4,13" fill="currentColor"/></svg>
      {/if}
    </span>
    <span class="lbl">{status.running ? "Stop sim" : "Start sim"}</span>
  </button>
{/if}

<style>
  .sim-btn {
    display: inline-flex; align-items: center; gap: 0.4rem;
    background: transparent; color: #9aa4b1;
    border: 1px solid #2a3340; border-radius: 4px;
    padding: 0.3rem 0.6rem; font-size: 0.78rem; cursor: pointer;
    font-family: inherit;
  }
  .sim-btn:hover:not(:disabled) { color: #e6e9ef; border-color: #4a5566; }
  .sim-btn:disabled { opacity: 0.5; cursor: wait; }
  .sim-btn.running { color: #ee5e5e; border-color: #5a3030; }
  .sim-btn.running:hover:not(:disabled) { color: #ff8080; border-color: #804040; }
  .icon { display: inline-flex; }
  .lbl { font-variant: small-caps; letter-spacing: 0.04em; }
</style>
