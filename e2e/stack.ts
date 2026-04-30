// Long-running stack: aedes broker + backend + simulator. UI dev server is started separately.
import Aedes from "aedes";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MQTT_PORT = 1885;
const HTTP_PORT = 3000;
const DEVICE_ID = "bench-sim-01";

const aedes = new Aedes();
const server = createServer(aedes.handle as any);
server.listen(MQTT_PORT, () => console.log(`[stack] mqtt on :${MQTT_PORT}`));

const tmp = mkdtempSync(join(tmpdir(), "bench-live-"));

const backend = spawn("npx", ["--no-install", "tsx", "src/index.ts"], {
  cwd: "../backend",
  shell: true,
  env: {
    ...process.env,
    HTTP_PORT: String(HTTP_PORT),
    MQTT_URL: `mqtt://127.0.0.1:${MQTT_PORT}`,
    SQLITE_PATH: join(tmp, "bench.db"),
    INFLUX_URL: "http://127.0.0.1:8086",
    INFLUX_TOKEN: "dev",
    INFLUX_ORG: "bench",
    INFLUX_BUCKET: "bench",
    UI_DIST_PATH: "../ui/dist",
    LOG_LEVEL: "warn",
  },
});
backend.stdout?.on("data", (d) => process.stdout.write(`[be] ${d}`));
backend.stderr?.on("data", (d) => process.stderr.write(`[be!] ${d}`));

setTimeout(() => {
  const sim = spawn("node", ["--import", "tsx", "sim.ts"], {
    cwd: "../simulator",
    shell: true,
    env: {
      ...process.env,
      MQTT_URL: `mqtt://127.0.0.1:${MQTT_PORT}`,
      DEVICE_ID,
      SAMPLE_INTERVAL_MS: "500",
    },
  });
  sim.stdout?.on("data", (d) => process.stdout.write(`[sim] ${d}`));
  sim.stderr?.on("data", (d) => process.stderr.write(`[sim!] ${d}`));
}, 2500);

process.on("SIGINT", () => { backend.kill(); process.exit(0); });
