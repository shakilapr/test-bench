// Bench ESP32 simulator.
//
// Speaks the same MQTT protocol as the firmware target so the full pipeline
// (broker -> backend -> UI) can be exercised without hardware.

import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import mqtt, { MqttClient } from "mqtt";
import {
  buildTelemetry,
  buildMetadata,
  buildOnlineStatus,
  buildOfflineStatus,
  buildAck,
  parseCommand,
  CommandPayload,
} from "./src/protocol.js";

type CurrentFault = "none" | "saturated";
type MotorFault = "none" | "stall" | "sensor";

interface Options {
  deviceId: string;
  mqttUrl: string;
  intervalMs: number;
  fault: CurrentFault;
  dropAfterSec: number | null;
  dropForSec: number;
  motorTargetRpm: number | null;
  motorTauMs: number;
  motorMaxRpm: number;
  motorFault: MotorFault;
}

function parseOptions(): Options {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "device-id": { type: "string", default: "bench-sim-01" },
      "mqtt-url": { type: "string", default: "mqtt://localhost:1883" },
      "interval-ms": { type: "string", default: "500" },
      fault: { type: "string", default: "none" },
      "drop-after": { type: "string" },
      "drop-for": { type: "string", default: "20" },
      "motor-target-rpm": { type: "string" },
      "motor-tau-ms": { type: "string", default: "1500" },
      "motor-max-rpm": { type: "string", default: "6000" },
      "motor-fault": { type: "string", default: "none" },
    },
  });
  const motorFault = ((): MotorFault => {
    const v = String(values["motor-fault"] ?? "none");
    return v === "stall" || v === "sensor" ? v : "none";
  })();
  return {
    deviceId: String(values["device-id"]),
    mqttUrl: String(values["mqtt-url"]),
    intervalMs: Number(values["interval-ms"]),
    fault: (values.fault === "saturated" ? "saturated" : "none") as CurrentFault,
    dropAfterSec: values["drop-after"] ? Number(values["drop-after"]) : null,
    dropForSec: Number(values["drop-for"]),
    motorTargetRpm: values["motor-target-rpm"] != null
      ? Number(values["motor-target-rpm"])
      : null,
    motorTauMs: Number(values["motor-tau-ms"]),
    motorMaxRpm: Number(values["motor-max-rpm"]),
    motorFault,
  };
}

// Default duty profile: idle → spool-up → cruise → boost → wind-down, looping.
// Returns the *target* RPM for time t (seconds since start). The simulator
// applies a first-order lag toward this target, so the chart shows a
// physically plausible response (no instant jumps).
function defaultMotorProfile(t: number, maxRpm: number): number {
  const period = 60; // seconds for one full cycle
  const phase = t % period;
  if (phase < 5) return 0;                              // idle
  if (phase < 20) return 0.5 * maxRpm;                  // cruise low
  if (phase < 35) return 0.8 * maxRpm;                  // cruise high
  if (phase < 45) return 0.95 * maxRpm;                 // boost
  return 0.2 * maxRpm;                                  // wind-down
}

class Simulator {
  private readonly bootId = randomUUID();
  private seq = 0;
  private intervalMs: number;
  private startedAt = Date.now();
  private timer: NodeJS.Timeout | null = null;
  private client: MqttClient | null = null;
  private recentCmdIds = new Map<string, number>();
  private readonly options: Options;
  private motorRpm = 0;          // current rotor speed (state of the lag model)
  private lastTickMs = Date.now();

  constructor(options: Options) {
    this.options = options;
    this.intervalMs = options.intervalMs;
  }

  start() {
    const { deviceId, mqttUrl } = this.options;
    const statusTopic = `bench/${deviceId}/status`;
    const cmdTopic = `bench/${deviceId}/cmd`;

    this.client = mqtt.connect(mqttUrl, {
      clean: true,
      reconnectPeriod: 2000,
      will: {
        topic: statusTopic,
        payload: Buffer.from(JSON.stringify(buildOfflineStatus(deviceId, this.bootId))),
        qos: 1,
        retain: true,
      },
    });

    this.client.on("connect", () => {
      console.log(`[sim] connected to ${mqttUrl} as ${deviceId}`);
      const meta = buildMetadata(deviceId);
      const online = buildOnlineStatus(deviceId, this.bootId, this.intervalMs);
      this.client!.publish(`bench/${deviceId}/meta`, JSON.stringify(meta), { qos: 1, retain: true });
      this.client!.publish(statusTopic, JSON.stringify(online), { qos: 1, retain: true });
      this.client!.subscribe(cmdTopic, { qos: 1 });
      this.scheduleTelemetry();
      if (this.options.dropAfterSec !== null) {
        setTimeout(() => this.simulateDrop(), this.options.dropAfterSec * 1000);
      }
    });

    this.client.on("message", (topic, payload) => {
      if (topic === cmdTopic) this.handleCommand(payload);
    });

    this.client.on("reconnect", () => console.log("[sim] reconnecting..."));
    this.client.on("error", (err) => console.error("[sim] mqtt error:", err.message));

    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());
  }

  private scheduleTelemetry() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.publishTelemetry(), this.intervalMs);
  }

  private publishTelemetry() {
    if (!this.client?.connected) return;
    const now = Date.now();
    const t = (now - this.startedAt) / 1000;
    const dtMs = Math.max(1, now - this.lastTickMs);
    this.lastTickMs = now;

    // ---- Motor model: first-order lag toward a target RPM ----
    // tau is the time constant — physically this is rotor inertia / damping.
    // alpha = 1 - exp(-dt/tau) is the discrete-time blend factor; smaller tau
    // => snappier response, larger tau => sluggish ramp.
    const target = this.options.motorTargetRpm != null
      ? this.options.motorTargetRpm
      : defaultMotorProfile(t, this.options.motorMaxRpm);
    const tau = Math.max(50, this.options.motorTauMs);
    const alpha = 1 - Math.exp(-dtMs / tau);
    this.motorRpm += (target - this.motorRpm) * alpha;
    // Mechanical jitter ~ 0.3% of speed, plus a tiny absolute floor for noise.
    const rpmNoise = (Math.random() - 0.5) * (Math.abs(this.motorRpm) * 0.006 + 4);
    let motorRpm = Math.max(0, this.motorRpm + rpmNoise);
    let motorQ = 0;
    if (this.options.motorFault === "stall") {
      motorRpm = 0;
      this.motorRpm = 0;
    } else if (this.options.motorFault === "sensor") {
      motorQ = 1; // value still emitted, but flagged as sensor fault
    }

    // ---- Current: motor load + ambient oscillation + jitter ----
    // Real motors draw current roughly proportional to speed (no-load) plus a
    // load term — model that as a linear + small quadratic component so the
    // chart visibly tracks RPM changes.
    const loadAmps = (motorRpm / 1000) * 1.8 + Math.pow(motorRpm / 1000, 2) * 0.05;
    const ambient = 1.5 * Math.sin(t * 0.5);
    const currentA = 2.0 + loadAmps + ambient + (Math.random() - 0.5) * 0.1;

    // ---- Chip temp: drifts up with current draw, slow thermal mass ----
    const chipTempC = 38 + (currentA - 2) * 0.25 + Math.sin(t * 0.05) * 0.5
      + (Math.random() - 0.5) * 0.05;

    const saturated = this.options.fault === "saturated";

    this.seq += 1;
    const payload = buildTelemetry({
      deviceId: this.options.deviceId,
      bootId: this.bootId,
      seq: this.seq,
      ms: now - this.startedAt,
      readings: { current_a: currentA, chip_temp_c: chipTempC, motor_rpm: motorRpm },
      quality: { current_a: saturated ? 1 : 0, chip_temp_c: 0, motor_rpm: motorQ },
    });
    this.client.publish(
      `bench/${this.options.deviceId}/telemetry`,
      JSON.stringify(payload),
      { qos: 0 }
    );
  }

  private handleCommand(raw: Buffer) {
    const parsed = parseCommand(raw.toString("utf8"));
    if (!parsed.ok) {
      console.warn("[sim] rejected command:", parsed.error);
      return;
    }
    const cmd = parsed.value;

    if (this.recentCmdIds.has(cmd.cmd_id)) {
      this.publishAck(cmd, "duplicate", "duplicate cmd_id ignored");
      return;
    }
    this.recordCmdId(cmd.cmd_id);

    if (cmd.type !== "set_sample_interval") {
      this.publishAck(cmd, "rejected", `unknown command: ${cmd.type}`);
      return;
    }
    const interval = Number(cmd.params?.interval_ms);
    if (!Number.isFinite(interval) || interval < 100 || interval > 10000) {
      this.publishAck(cmd, "rejected", "interval_ms out of range");
      return;
    }

    this.publishAck(cmd, "accepted", "applying...");
    this.intervalMs = interval;
    this.scheduleTelemetry();
    setTimeout(() => this.publishAck(cmd, "completed", "sample interval updated"), 50);
  }

  private recordCmdId(cmdId: string) {
    const now = Date.now();
    this.recentCmdIds.set(cmdId, now);
    for (const [id, ts] of this.recentCmdIds) {
      if (now - ts > 60_000) this.recentCmdIds.delete(id);
    }
  }

  private publishAck(cmd: CommandPayload, status: string, message: string) {
    if (!this.client?.connected) return;
    const ack = buildAck(cmd.cmd_id, status, message);
    this.client.publish(
      `bench/${this.options.deviceId}/ack`,
      JSON.stringify(ack),
      { qos: 1 }
    );
  }

  private simulateDrop() {
    console.log(`[sim] simulating drop for ${this.options.dropForSec}s`);
    if (this.timer) clearInterval(this.timer);
    this.client?.end(true);
    setTimeout(() => {
      console.log("[sim] reconnecting after drop");
      this.start();
    }, this.options.dropForSec * 1000);
  }

  private shutdown() {
    console.log("[sim] shutting down");
    if (this.timer) clearInterval(this.timer);
    this.client?.publish(
      `bench/${this.options.deviceId}/status`,
      JSON.stringify(buildOfflineStatus(this.options.deviceId, this.bootId)),
      { qos: 1, retain: true },
      () => {
        this.client?.end(false, {}, () => process.exit(0));
      }
    );
  }
}

new Simulator(parseOptions()).start();
