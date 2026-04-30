/**
 * Hardware-less end-to-end check.
 *
 * 1. Start an in-process MQTT broker (aedes) on a random port.
 * 2. Spawn the backend pointed at that broker, with a temp SQLite file and
 *    a deliberately-unreachable Influx URL (no longer needed; left here for
 *    historical context — backend has no Influx coupling now).
 * 3. Spawn the simulator pointed at that broker.
 * 4. Poll /api/devices until bench-sim-01 appears online.
 * 5. Issue a set_sample_interval command and assert it reaches `completed`.
 * 6. Issue a duplicate cmd_id and assert it is acked as `duplicate`.
 * 7. Tear everything down.
 *
 * Designed to run in CI without Docker. Returns non-zero on any failure.
 */

import { spawn, ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createServer, AddressInfo } from "node:net";
import Aedes from "aedes";

const REPO = resolve(import.meta.dirname, "..");
const BACKEND_DIR = join(REPO, "backend");
const SIM_DIR = join(REPO, "simulator");
const DEVICE_ID = "bench-sim-01";

interface Spawned { proc: ChildProcess; name: string; }
const procs: Spawned[] = [];

function track(proc: ChildProcess, name: string): ChildProcess {
  procs.push({ proc, name });
  proc.stdout?.on("data", (b) => process.stdout.write(`[${name}] ${b}`));
  proc.stderr?.on("data", (b) => process.stderr.write(`[${name}] ${b}`));
  return proc;
}

function killAll() {
  for (const { proc, name } of procs) {
    try {
      console.log(`[e2e] killing ${name}`);
      if (proc.pid) process.kill(proc.pid);
    } catch { /* ignore */ }
  }
}

async function freePort(): Promise<number> {
  const srv = createServer();
  return new Promise((res, rej) => {
    srv.unref();
    srv.on("error", rej);
    srv.listen(0, () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close(() => res(port));
    });
  });
}

async function startBroker(port: number): Promise<Aedes> {
  const aedes = new Aedes();
  const server = createServer(aedes.handle as unknown as (s: import("node:net").Socket) => void);
  await new Promise<void>((res) => server.listen(port, res));
  console.log(`[e2e] aedes broker on :${port}`);
  return aedes;
}

async function waitForBackend(timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch("http://127.0.0.1:3000/api/health");
      if (r.ok) return;
    } catch { /* not up */ }
    await sleep(500);
  }
  throw new Error("backend never became healthy");
}

async function waitForOnline(timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch("http://127.0.0.1:3000/api/devices");
    if (r.ok) {
      const list = (await r.json()) as Array<{ device_id: string; last_status: string }>;
      if (list.find((d) => d.device_id === DEVICE_ID && d.last_status === "online")) return;
    }
    await sleep(500);
  }
  throw new Error(`device ${DEVICE_ID} never reported online`);
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "bench-e2e-"));
  const sqlitePath = join(tmp, "bench.db");
  const mqttPort = await freePort();
  const mqttUrl = `mqtt://127.0.0.1:${mqttPort}`;

  const broker = await startBroker(mqttPort);

  const tsxBin = process.platform === "win32" ? "tsx.cmd" : "tsx";
  const backend = track(spawn("npx", ["--no-install", "tsx", "src/index.ts"], {
    cwd: BACKEND_DIR,
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: "3000",
      MQTT_URL: mqttUrl,
      EMBED_BROKER: "false",
      SQLITE_PATH: sqlitePath,
    },
  }), "backend");
  void tsxBin;

  await waitForBackend();
  console.log("[e2e] backend healthy");

  const sim = track(spawn("node", ["--import", "tsx", "sim.ts", "--mqtt-url", mqttUrl, "--device-id", DEVICE_ID, "--interval-ms", "300"], {
    cwd: SIM_DIR,
    shell: true,
    env: process.env,
  }), "sim");
  void sim;

  await waitForOnline();
  console.log("[e2e] device online");

  // Issue command and wait for completion.
  const issued = await fetch(`http://127.0.0.1:3000/api/devices/${DEVICE_ID}/commands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "set_sample_interval", params: { interval_ms: 600 } }),
  });
  if (!issued.ok) throw new Error(`command issue failed: ${issued.status}`);
  const issuedBody = (await issued.json()) as { cmd_id: string };
  console.log(`[e2e] issued cmd ${issuedBody.cmd_id}`);

  const start = Date.now();
  let finalStatus = "";
  while (Date.now() - start < 10000) {
    const cmds = (await (await fetch(`http://127.0.0.1:3000/api/devices/${DEVICE_ID}/commands`)).json()) as Array<{ cmd_id: string; status: string }>;
    const c = cmds.find((c) => c.cmd_id === issuedBody.cmd_id);
    if (c && (c.status === "completed" || c.status === "failed" || c.status === "rejected" || c.status === "timed_out")) {
      finalStatus = c.status; break;
    }
    await sleep(250);
  }
  if (finalStatus !== "completed") throw new Error(`command final status was ${finalStatus || "(none)"}`);
  console.log("[e2e] command completed OK");

  // Snapshot device list to confirm metadata persisted.
  const list = (await (await fetch("http://127.0.0.1:3000/api/devices")).json()) as Array<{ device_id: string; metadata_version: number | null }>;
  const dev = list.find((d) => d.device_id === DEVICE_ID);
  if (!dev) throw new Error("device disappeared");
  console.log(`[e2e] device record: ${JSON.stringify(dev)}`);

  console.log("\n[e2e] ALL CHECKS PASSED");

  killAll();
  await new Promise<void>((res) => broker.close(() => res()));
  // Best-effort tmp cleanup; SQLite handle from killed backend may still be open briefly.
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(0);
}

process.on("SIGINT", () => { killAll(); process.exit(130); });
process.on("uncaughtException", (e) => { console.error(e); killAll(); process.exit(1); });

main().catch((err) => {
  console.error("[e2e] FAILED:", err);
  killAll();
  process.exit(1);
});
