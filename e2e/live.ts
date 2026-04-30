// Long-running broker + backend (production, serving UI dist) + simulator.
// Used so a real browser (via Chrome DevTools MCP) can exercise the UI.

import { spawn, ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createServer } from "node:net";
import Aedes from "aedes";

const REPO = resolve(import.meta.dirname, "..");
const BACKEND_DIR = join(REPO, "backend");
const SIM_DIR = join(REPO, "simulator");

const MQTT_PORT = 1885;
const HTTP_PORT = 3000;
const DEVICE_ID = process.env.DEVICE_ID ?? "bench-sim-01";

const procs: { proc: ChildProcess; name: string }[] = [];
function track(proc: ChildProcess, name: string) {
  procs.push({ proc, name });
  proc.stdout?.on("data", (b) => process.stdout.write(`[${name}] ${b}`));
  proc.stderr?.on("data", (b) => process.stderr.write(`[${name}] ${b}`));
  return proc;
}
function killAll() {
  for (const { proc, name } of procs) {
    try {
      console.log(`[live] killing ${name}`);
      if (proc.pid) process.kill(proc.pid);
    } catch { /* ignore */ }
  }
}
process.on("SIGINT", () => { killAll(); process.exit(0); });
process.on("SIGTERM", () => { killAll(); process.exit(0); });

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "bench-live-"));
  const sqlitePath = join(tmp, "bench.db");

  const aedes = new Aedes();
  const server = createServer(aedes.handle as unknown as (s: import("node:net").Socket) => void);
  await new Promise<void>((res) => server.listen(MQTT_PORT, res));
  console.log(`[live] aedes broker on :${MQTT_PORT}`);

  track(spawn("npx", ["--no-install", "tsx", "src/index.ts"], {
    cwd: BACKEND_DIR,
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(HTTP_PORT),
      MQTT_URL: `mqtt://127.0.0.1:${MQTT_PORT}`,
      EMBED_BROKER: "false",
      SQLITE_PATH: sqlitePath,
      UI_DIST: resolve(REPO, "ui", "dist"),
    },
  }), "backend");

  const start = Date.now();
  while (Date.now() - start < 30_000) {
    try {
      const r = await fetch(`http://127.0.0.1:${HTTP_PORT}/api/health`);
      if (r.ok) break;
    } catch { /* not yet */ }
    await sleep(400);
  }
  console.log("[live] backend healthy");

  track(spawn("node", ["--import", "tsx", "sim.ts",
    "--mqtt-url", `mqtt://127.0.0.1:${MQTT_PORT}`,
    "--device-id", DEVICE_ID,
    "--interval-ms", "500"], {
    cwd: SIM_DIR,
    shell: true,
    env: process.env,
  }), "sim");

  console.log(`[live] open http://127.0.0.1:${HTTP_PORT}/`);
}

main().catch((err) => {
  console.error("[live] FAILED:", err);
  killAll();
  process.exit(1);
});
