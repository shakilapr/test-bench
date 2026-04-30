import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Spawns and supervises the bench simulator as a child process so the UI can
// kick off "demo data" without the user having to open another terminal.
//
// We invoke `npm --workspace simulator run sim` from the repository root. That
// keeps a single source of truth for *how* the simulator is run (the sim
// workspace's own scripts) and works in both dev and production installs.
export class SimController {
  private child: ChildProcess | null = null;
  private startedAt: number | null = null;
  private lastError: string | null = null;
  private readonly cwd: string;
  private readonly mqttUrl: string;

  constructor(opts: { cwd?: string; mqttUrl: string } = { mqttUrl: "mqtt://localhost:1883" }) {
    // The repo root is one level up from the backend workspace.
    this.cwd = opts.cwd ?? resolve(process.cwd(), "..");
    this.mqttUrl = opts.mqttUrl;
  }

  status() {
    return {
      running: this.child !== null && this.child.exitCode === null,
      pid: this.child?.pid ?? null,
      started_at: this.startedAt,
      last_error: this.lastError,
    };
  }

  start(deviceId = "bench-sim-01"): { ok: boolean; error?: string } {
    if (this.child && this.child.exitCode === null) {
      return { ok: true };
    }
    if (!existsSync(resolve(this.cwd, "simulator", "package.json"))) {
      const error = `simulator workspace not found at ${this.cwd}/simulator`;
      this.lastError = error;
      return { ok: false, error };
    }
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    try {
      const child = spawn(
        npmCmd,
        [
          "--workspace", "simulator", "run", "sim", "--",
          "--device-id", deviceId,
          "--mqtt-url", this.mqttUrl,
        ],
        {
          cwd: this.cwd,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env },
          windowsHide: true,
        }
      );
      child.stdout?.on("data", (b) => process.stdout.write(`[sim] ${b}`));
      child.stderr?.on("data", (b) => process.stderr.write(`[sim] ${b}`));
      child.on("exit", (code, signal) => {
        if (this.child === child) {
          this.child = null;
          this.startedAt = null;
          if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
            this.lastError = `simulator exited with code=${code} signal=${signal}`;
          }
        }
      });
      child.on("error", (err) => { this.lastError = err.message; });
      this.child = child;
      this.startedAt = Date.now();
      this.lastError = null;
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      return { ok: false, error: msg };
    }
  }

  stop(): { ok: boolean } {
    const child = this.child;
    if (!child || child.exitCode !== null) return { ok: true };
    // SIGTERM lets the simulator publish its retained offline status before
    // exiting (see Simulator.shutdown). On Windows ChildProcess.kill() falls
    // back to a hard terminate which is fine for our purposes.
    child.kill("SIGTERM");
    return { ok: true };
  }

  async stopAndWait(timeoutMs = 3000): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((res) => {
      const t = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
        res();
      }, timeoutMs);
      child.once("exit", () => { clearTimeout(t); res(); });
    });
  }
}
