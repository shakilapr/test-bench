import { InfluxDB, Point, WriteApi } from "@influxdata/influxdb-client";
import type { Telemetry } from "../protocol.js";
import type { IInfluxWriter } from "./noop.js";

export interface InfluxConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
}

export class InfluxWriter implements IInfluxWriter {
  private writeApi: WriteApi;

  constructor(cfg: InfluxConfig) {
    const client = new InfluxDB({ url: cfg.url, token: cfg.token });
    this.writeApi = client.getWriteApi(cfg.org, cfg.bucket, "ms", {
      flushInterval: 1000,
      batchSize: 500,
      maxRetries: 3,
    });
  }

  writeTelemetry(t: Telemetry, recordingId: string | null = null) {
    const p = new Point("bench_sample").tag("device_id", t.device_id);
    for (const [k, v] of Object.entries(t.readings)) {
      if (Number.isFinite(v)) p.floatField(k, v);
    }
    for (const [k, q] of Object.entries(t.quality ?? {})) {
      p.intField(`${k}_quality`, q);
    }
    p.intField("seq", t.seq);
    p.stringField("boot_id", t.boot_id);
    p.intField("ms_since_boot", t.ms);
    if (recordingId) p.stringField("recording_id", recordingId);
    p.timestamp(t.time_synced && t.time_unix_ms ? t.time_unix_ms : Date.now());
    this.writeApi.writePoint(p);
  }

  writeEvent(deviceId: string, type: string, fields: Record<string, string | number> = {}, recordingId: string | null = null) {
    const p = new Point("bench_event").tag("device_id", deviceId).tag("type", type);
    if (recordingId) p.tag("recording_id", recordingId);
    p.intField("value", 1);
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === "number") p.floatField(k, v);
      else p.stringField(k, v);
    }
    p.timestamp(Date.now());
    this.writeApi.writePoint(p);
  }

  async close() {
    await this.writeApi.close();
  }
}
