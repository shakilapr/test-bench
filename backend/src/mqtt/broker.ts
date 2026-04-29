import mqtt, { MqttClient } from "mqtt";
import { TelemetrySchema, StatusSchema, MetadataSchema, AckSchema, type Telemetry, type Status, type Metadata, type Ack, type Command } from "../protocol.js";
import type { EventBus } from "../bus.js";

export interface MqttConfig {
  url: string;
  user?: string;
  pass?: string;
  clientId?: string;
}

export class MqttBroker {
  private client: MqttClient | null = null;
  constructor(private readonly cfg: MqttConfig, private readonly bus: EventBus) {}

  async start() {
    this.client = mqtt.connect(this.cfg.url, {
      username: this.cfg.user,
      password: this.cfg.pass,
      clientId: this.cfg.clientId ?? `bench-backend-${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 2000,
      clean: true,
    });
    this.client.on("connect", () => {
      console.log("[mqtt] connected");
      this.client!.subscribe(["bench/+/telemetry", "bench/+/status", "bench/+/meta", "bench/+/ack"], { qos: 1 });
      this.bus.emit("mqtt.connected", null);
    });
    this.client.on("reconnect", () => console.log("[mqtt] reconnecting"));
    this.client.on("close", () => this.bus.emit("mqtt.disconnected", null));
    this.client.on("error", (err) => console.error("[mqtt] error:", err.message));
    this.client.on("message", (topic, payload) => this.handle(topic, payload));
  }

  private handle(topic: string, payload: Buffer) {
    const parts = topic.split("/");
    if (parts.length !== 3 || parts[0] !== "bench") return;
    const [, deviceId, kind] = parts;
    let json: unknown;
    try { json = JSON.parse(payload.toString("utf8")); }
    catch (e) { console.warn(`[mqtt] bad json on ${topic}: ${(e as Error).message}`); return; }
    switch (kind) {
      case "telemetry": this.dispatch("telemetry", deviceId, TelemetrySchema, json); break;
      case "status": this.dispatch("status", deviceId, StatusSchema, json); break;
      case "meta": this.dispatch("meta", deviceId, MetadataSchema, json); break;
      case "ack": this.dispatch("ack", deviceId, AckSchema, json); break;
    }
  }

  private dispatch<T>(kind: string, deviceId: string, schema: { safeParse: (x: unknown) => { success: boolean; data?: T; error?: unknown } }, json: unknown) {
    const r = schema.safeParse(json);
    if (!r.success) { console.warn(`[mqtt] schema reject on ${kind} for ${deviceId}`); return; }
    this.bus.emit(`device.${kind}`, r.data);
  }

  publishCommand(deviceId: string, cmd: Command): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client?.connected) return reject(new Error("mqtt not connected"));
      this.client.publish(`bench/${deviceId}/cmd`, JSON.stringify(cmd), { qos: 1 }, (err) =>
        err ? reject(err) : resolve()
      );
    });
  }

  async stop() {
    await new Promise<void>((res) => this.client?.end(false, {}, () => res()));
    this.client = null;
  }

  isConnected() { return this.client?.connected ?? false; }
}

export type { Telemetry, Status, Metadata, Ack };
