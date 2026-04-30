import { describe, it, expect } from "vitest";
import { TelemetrySchema, StatusSchema, MetadataSchema, AckSchema, CommandSchema } from "./protocol.js";

describe("TelemetrySchema", () => {
  it("accepts a valid payload", () => {
    const r = TelemetrySchema.safeParse({
      v: 1, device_id: "d", boot_id: "b", seq: 1, ms: 0,
      readings: { current_a: 1.2 }, quality: { current_a: 0 },
    });
    expect(r.success).toBe(true);
  });
  it("rejects non-integer quality", () => {
    const r = TelemetrySchema.safeParse({
      v: 1, device_id: "d", boot_id: "b", seq: 1, ms: 0,
      readings: { x: 1 }, quality: { x: 0.5 },
    });
    expect(r.success).toBe(false);
  });
  it("rejects missing device_id", () => {
    const r = TelemetrySchema.safeParse({ v: 1, boot_id: "b", seq: 1, ms: 0, readings: {} });
    expect(r.success).toBe(false);
  });
});

describe("StatusSchema", () => {
  it("requires state to be online or offline", () => {
    expect(StatusSchema.safeParse({ v: 1, device_id: "d", boot_id: "b", state: "weird" }).success).toBe(false);
    expect(StatusSchema.safeParse({ v: 1, device_id: "d", boot_id: "b", state: "online" }).success).toBe(true);
  });
});

describe("MetadataSchema", () => {
  it("accepts quality_codes map", () => {
    const r = MetadataSchema.safeParse({
      v: 1, device_id: "d", metadata_version: 1,
      channels: [{ key: "x", label: "X", unit: "A", kind: "measurement" }],
      quality_codes: { x: { "0": "ok" } },
    });
    expect(r.success).toBe(true);
  });
});

describe("StatusSchema (firmware contract)", () => {
  // These are the literal payload shapes produced by
  // firmware/src/bench/Protocol.cpp::buildStatusJson. If they ever stop
  // parsing the firmware will silently fall off the UI.
  it("accepts the firmware online status", () => {
    const r = StatusSchema.safeParse({
      v: 1,
      device_id: "bench-01",
      boot_id: "boot-xyz",
      state: "online",
      fw: "0.1.0",
      sample_interval_ms: 250,
    });
    expect(r.success).toBe(true);
  });
  it("accepts the firmware offline LWT", () => {
    const r = StatusSchema.safeParse({
      v: 1,
      device_id: "bench-01",
      boot_id: "boot-xyz",
      state: "offline",
    });
    expect(r.success).toBe(true);
  });
  it("rejects the legacy {online: bool} shape that broke status flow", () => {
    expect(
      StatusSchema.safeParse({ v: 1, device_id: "bench-01", online: true }).success
    ).toBe(false);
  });
});

describe("MetadataSchema (firmware contract)", () => {
  // Same idea: this is the literal payload from buildMetadataJson.
  it("accepts the firmware metadata frame", () => {
    const r = MetadataSchema.safeParse({
      v: 1,
      device_id: "bench-01",
      metadata_version: 1,
      channels: [
        { key: "current_a", label: "Shunt current", unit: "A",
          kind: "measurement", precision: 2, recordable: true, chartable: true },
        { key: "chip_temp_c", label: "Chip Temp", unit: "C",
          kind: "health", precision: 1, recordable: true, chartable: true },
      ],
    });
    expect(r.success).toBe(true);
  });
  it("rejects channels missing kind (the previous firmware shape)", () => {
    const r = MetadataSchema.safeParse({
      v: 1, device_id: "bench-01", metadata_version: 1,
      channels: [{ key: "current_a", label: "Shunt current", unit: "A" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("AckSchema", () => {
  it("rejects unknown statuses", () => {
    expect(AckSchema.safeParse({ v: 1, cmd_id: "x", status: "weird" }).success).toBe(false);
  });
  it("accepts the sent status", () => {
    expect(AckSchema.safeParse({ v: 1, cmd_id: "x", status: "sent" }).success).toBe(true);
  });
});

describe("CommandSchema", () => {
  it("requires cmd_id and type", () => {
    expect(CommandSchema.safeParse({ v: 1, type: "x" }).success).toBe(false);
    expect(CommandSchema.safeParse({ v: 1, cmd_id: "x", type: "y" }).success).toBe(true);
  });
});
