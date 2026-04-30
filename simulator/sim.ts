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

interface Options {
  deviceId: string;
  mqttUrl: string;
  intervalMs: number;
  fault: "none" | "saturated";
  dropAfterSec: number | null;
  dropForSec: number;
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
    },
  });
  return {
    deviceId: String(values["device-id"]),
    mqttUrl: String(values["mqtt-url"]),
    intervalMs: Number(values["interval-ms"]),
    fault: (values.fault === "saturated" ? "saturated" : "none") as Options["fault"],
    dropAfterSec: values["drop-after"] ? Number(values["drop-after"]) : null,
    dropForSec: Number(values["drop-for"]),
  };
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
    const t = (Date.now() - this.startedAt) / 1000;
    const currentA = 12 + 2 * Math.sin(t * 0.5) + (Math.random() - 0.5) * 0.1;
    const chipTempC = 41 + Math.sin(t * 0.05) * 0.5 + (Math.random() - 0.5) * 0.05;
    // Synthetic motor: nominal 3000 rpm with slow modulation + jitter.
    const motorRpm = 3000 + 400 * Math.sin(t * 0.2) + (Math.random() - 0.5) * 30;
    const saturated = this.options.fault === "saturated";

    this.seq += 1;
    const payload = buildTelemetry({
      deviceId: this.options.deviceId,
      bootId: this.bootId,
      seq: this.seq,
      ms: Date.now() - this.startedAt,
      readings: { current_a: currentA, chip_temp_c: chipTempC, motor_rpm: motorRpm },
      quality: { current_a: saturated ? 1 : 0, chip_temp_c: 0, motor_rpm: 0 },
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
