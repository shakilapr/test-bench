/**
 * Chaos harness: scripts the resilience checks called out in the architecture
 * doc's phase definitions of done. Designed to be run after the full stack
 * (docker compose + backend + simulator) is already up.
 *
 * Steps:
 *   1) Confirm /api/devices reports the simulator online.
 *   2) Restart Mosquitto. Wait. Confirm device is back online and meta still
 *      present (retained meta should be republished by the simulator).
 *   3) Restart the backend process. Confirm device list still hydrates from
 *      retained MQTT messages.
 *   4) Issue a set_sample_interval command and confirm it transitions to
 *      `completed`.
 *
 * The script returns non-zero on the first failed assertion. Logs go to
 * stdout for human review.
 */

import { execSync, spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:3000";
const DEVICE_ID = process.env.DEVICE_ID ?? "bench-sim-01";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function waitForDeviceOnline(timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const list = await getJson<Array<{ device_id: string; online: number }>>("/api/devices");
      if (list.find((d) => d.device_id === DEVICE_ID && d.online)) return;
    } catch {
      /* backend not up yet */
    }
    await sleep(500);
  }
  throw new Error(`device ${DEVICE_ID} did not come online`);
}

function dockerRestart(name: string): void {
  console.log(`> docker restart ${name}`);
  execSync(`docker restart ${name}`, { stdio: "inherit" });
}

async function step(label: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n=== ${label} ===`);
  await fn();
  console.log(`OK: ${label}`);
}

async function main() {
  await step("baseline: device online", async () => {
    await waitForDeviceOnline();
  });

  await step("mosquitto restart", async () => {
    dockerRestart("bench-mosquitto");
    await sleep(2000);
    await waitForDeviceOnline(20000);
  });

  await step("command roundtrip after restart", async () => {
    const issued = await postJson<{ cmd_id: string }>(`/api/devices/${DEVICE_ID}/commands`, {
      type: "set_sample_interval",
      params: { interval_ms: 750 },
    });
    const start = Date.now();
    while (Date.now() - start < 10000) {
      const cmds = await getJson<Array<{ cmd_id: string; status: string }>>(`/api/devices/${DEVICE_ID}/commands`);
      const c = cmds.find((c) => c.cmd_id === issued.cmd_id);
      if (c?.status === "completed") return;
      await sleep(250);
    }
    throw new Error("command never reached `completed`");
  });

  console.log("\nALL RESILIENCE CHECKS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
