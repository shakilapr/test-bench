import { describe, it, expect, vi } from "vitest";
import { EventBus } from "./bus.js";
import { openDb } from "./db/sqlite.js";
import { DeviceRepo } from "./db/devices.js";
import { RecordingRepo } from "./db/recordings.js";
import { wirePipeline } from "./pipeline.js";

function makeFakeInflux() {
  return {
    writeTelemetry: vi.fn(),
    writeEvent: vi.fn(),
    close: vi.fn(),
  };
}

describe("pipeline", () => {
  it("status updates devices and writes an event", () => {
    const db = openDb(":memory:");
    const bus = new EventBus();
    const influx = makeFakeInflux();
    const devices = new DeviceRepo(db);
    const recordings = new RecordingRepo(db);
    wirePipeline({ bus, devices, recordings, influx: influx as any });

    bus.emit("device.status", { v: 1, device_id: "d1", boot_id: "b1", state: "online" });
    expect(devices.get("d1")?.last_status).toBe("online");
    expect(influx.writeEvent).toHaveBeenCalledWith("d1", "status_online");
  });

  it("telemetry tags recording_id when a recording is active", () => {
    const db = openDb(":memory:");
    const bus = new EventBus();
    const influx = makeFakeInflux();
    const devices = new DeviceRepo(db);
    const recordings = new RecordingRepo(db);
    devices.upsertSeen("d1");
    const r = recordings.start("d1", "test");
    wirePipeline({ bus, devices, recordings, influx: influx as any });

    bus.emit("device.telemetry", {
      v: 1, device_id: "d1", boot_id: "b1", seq: 1, ms: 10,
      readings: { current_a: 1.0 }, quality: { current_a: 0 },
    });
    expect(influx.writeTelemetry).toHaveBeenCalledWith(expect.any(Object), r.recording_id);
  });

  it("metadata regression is silently ignored", () => {
    const db = openDb(":memory:");
    const bus = new EventBus();
    const influx = makeFakeInflux();
    const devices = new DeviceRepo(db);
    const recordings = new RecordingRepo(db);
    wirePipeline({ bus, devices, recordings, influx: influx as any });

    bus.emit("device.meta", { v: 1, device_id: "d1", metadata_version: 5, channels: [], commands: [], quality_codes: {} });
    bus.emit("device.meta", { v: 1, device_id: "d1", metadata_version: 2, channels: [], commands: [], quality_codes: {} });
    expect(devices.get("d1")?.metadata_version).toBe(5);
  });
});
