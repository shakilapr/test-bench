<script lang="ts">
  import type { DeviceDto } from "./stores.js";
  export let device: DeviceDto;

  interface CmdSpec {
    type: string;
    label?: string;
    params?: Record<string, { type?: string; min?: number; max?: number; default?: number | string; description?: string }>;
  }

  $: cmds = ((device.metadata?.commands ?? []) as CmdSpec[]);

  // values[type][paramKey] = value (string or number)
  let values: Record<string, Record<string, any>> = {};
  let busy: Record<string, boolean> = {};
  let result: Record<string, string> = {};

  $: for (const c of cmds) {
    if (!values[c.type]) {
      const init: Record<string, any> = {};
      for (const [k, p] of Object.entries(c.params ?? {})) {
        init[k] = (p as any).default ?? "";
      }
      values[c.type] = init;
    }
  }

  async function send(c: CmdSpec) {
    busy = { ...busy, [c.type]: true };
    result = { ...result, [c.type]: "" };
    try {
      const params: Record<string, any> = {};
      for (const [k, raw] of Object.entries(values[c.type] ?? {})) {
        const spec = (c.params ?? {})[k] as any;
        if (raw === "" || raw === null || raw === undefined) continue;
        params[k] = spec?.type === "number" ? Number(raw) : raw;
      }
      const r = await fetch(`/api/devices/${device.device_id}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: c.type, params }),
      });
      const j = await r.json();
      result = { ...result, [c.type]: r.ok ? `Issued ${j.cmd_id}` : `Error: ${j.error}` };
    } catch (e) {
      result = { ...result, [c.type]: `Error: ${(e as Error).message}` };
    } finally {
      busy = { ...busy, [c.type]: false };
    }
  }
</script>

<section class="card">
  <h3>Commands</h3>
  {#if cmds.length === 0}
    <p class="muted">No commands declared in metadata.</p>
  {/if}
  {#each cmds as c (c.type)}
    <div class="cmd" data-testid="cmd-{c.type}">
      <div class="cmd-head">
        <strong>{c.label ?? c.type}</strong>
        <code>{c.type}</code>
      </div>
      <div class="cmd-fields">
        {#each Object.entries(c.params ?? {}) as [k, spec]}
          <label>
            <span class="lbl">{k}{(spec)?.unit ? ` (${(spec).unit})` : ""}</span>
            {#if (spec)?.type === "number"}
              <input
                type="number"
                min={(spec).min}
                max={(spec).max}
                bind:value={values[c.type][k]}
                data-testid="cmd-{c.type}-{k}"
              />
            {:else}
              <input type="text" bind:value={values[c.type][k]} data-testid="cmd-{c.type}-{k}" />
            {/if}
          </label>
        {/each}
        <button
          class="primary"
          on:click={() => send(c)}
          disabled={busy[c.type]}
          data-testid="cmd-{c.type}-send"
        >{busy[c.type] ? "Sending…" : "Send"}</button>
      </div>
      {#if result[c.type]}<p class="result" data-testid="cmd-{c.type}-result">{result[c.type]}</p>{/if}
    </div>
  {/each}
</section>

<style>
  h3 { margin: 0 0 0.5rem 0; font-size: 1rem; }
  .cmd { border-top: 1px solid #222; padding: 0.5rem 0; }
  .cmd:first-of-type { border-top: 0; }
  .cmd-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 0.4rem; }
  .cmd-head code { color: #9aa4b1; font-size: 0.75rem; }
  .cmd-fields { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end; }
  .cmd-fields label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.75rem; }
  .cmd-fields input { width: 9rem; }
  .lbl { color: #9aa4b1; }
  .primary { background: #1f3a5c; border-color: var(--accent); }
  .result { font-size: 0.85rem; color: #9aa4b1; margin: 0.25rem 0 0; }
  .muted { color: #888; }
</style>
