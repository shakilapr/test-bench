import { describe, it, expect } from "vitest";
import { EventBus } from "./bus.js";
import { openDb } from "./db/sqlite.js";
import { DeviceRepo } from "./db/devices.js";
import { RecordingRepo } from "./db/recordings.js";
import { RecordingBuffer } from "./recordings/buffer.js";
import { wirePipeline } from "./pipeline.js";

function setup() {
  const db = openDb(":memory:");
  const bus = new EventBus();
  const devices = new DeviceRepo(db);
  const recordings = new RecordingRepo(db);
  const buffer = new RecordingBuffer();
  return { db, bus, devices, recordings, buffer };
}

describe("pipeline", () => {
  it("status updates devices", () => {
    const { bus, devices, recordings, buffer } = setup();
    wirePipeline({ bus, devices, recordings, buffer });

    bus.emit("device.status", { v: 1, device_id: "d1", boot_id: "b1", state: "online" });
    expect(devices.get("d1")?.last_status).toBe("online");
  });

  it("telemetry appends to buffer when a recording is active", () => {
    const { bus, devices, recordings, buffer } = setup();
    devices.upsertSeen("d1");
    const r = recordings.start("d1", "test");
    wirePipeline({ bus, devices, recordings, buffer });

    bus.emit("device.telemetry", {
      v: 1, device_id: "d1", boot_id: "b1", seq: 1, ms: 10,
      readings: { current_a: 1.0 }, quality: { current_a: 0 },
    });
    expect(buffer.size(r.recording_id)).toBe(1);
  });

  it("telemetry without active recording does not buffer", () => {
    const { bus, devices, recordings, buffer } = setup();
    devices.upsertSeen("d1");
    wirePipeline({ bus, devices, recordings, buffer });

    bus.emit("device.telemetry", {
      v: 1, device_id: "d1", boot_id: "b1", seq: 1, ms: 10,
      readings: { current_a: 1.0 }, quality: { current_a: 0 },
    });
    expect(buffer.size("nope")).toBe(0);
  });

  it("metadata regression is silently ignored", () => {
    const { bus, devices, recordings, buffer } = setup();
    wirePipeline({ bus, devices, recordings, buffer });

    bus.emit("device.meta", { v: 1, device_id: "d1", metadata_version: 5, channels: [], commands: [], quality_codes: {} });
    bus.emit("device.meta", { v: 1, device_id: "d1", metadata_version: 2, channels: [], commands: [], quality_codes: {} });
    expect(devices.get("d1")?.metadata_version).toBe(5);
  });
});
