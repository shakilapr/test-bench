import { describe, it, expect } from "vitest";
import {
  buildTelemetry,
  buildMetadata,
  buildAck,
  parseCommand,
} from "./protocol.js";

describe("buildTelemetry", () => {
  it("matches the architecture protocol shape with integer quality codes", () => {
    const t = buildTelemetry({
      deviceId: "bench-sim-01",
      bootId: "00000000-0000-0000-0000-000000000001",
      seq: 42,
      ms: 1234,
      readings: { current_a: 12.34, chip_temp_c: 41.8 },
      quality: { current_a: 0, chip_temp_c: 0 },
    });
    expect(t.v).toBe(1);
    expect(t.device_id).toBe("bench-sim-01");
    expect(t.seq).toBe(42);
    expect(typeof t.quality.current_a).toBe("number");
    expect(t.quality.current_a).toBe(0);
    expect(t.readings.current_a).toBe(12.34);
  });

  it("flips quality to 1 when fault is saturated", () => {
    const t = buildTelemetry({
      deviceId: "d",
      bootId: "b",
      seq: 1,
      ms: 0,
      readings: { current_a: 99 },
      quality: { current_a: 1 },
    });
    expect(t.quality.current_a).toBe(1);
  });
});

describe("buildMetadata", () => {
  it("includes channels, commands, and quality_codes", () => {
    const m = buildMetadata("bench-sim-01");
    expect(m.metadata_version).toBe(2);
    expect(m.channels.map((c) => c.key)).toContain("current_a");
    expect(m.channels.map((c) => c.key)).toContain("motor_rpm");
    expect(m.commands.map((c) => c.type)).toContain("set_sample_interval");
    expect(m.quality_codes.current_a["1"]).toBe("saturated");
    expect(m.quality_codes.motor_rpm["1"]).toBe("sensor fault");
  });
});

describe("buildAck", () => {
  it("includes cmd_id, status, and message", () => {
    const a = buildAck("abc", "completed", "ok");
    expect(a).toEqual({ v: 1, cmd_id: "abc", status: "completed", message: "ok" });
  });
});

describe("parseCommand", () => {
  it("rejects invalid json", () => {
    const r = parseCommand("{not json");
    expect(r.ok).toBe(false);
  });
  it("rejects missing cmd_id", () => {
    const r = parseCommand(JSON.stringify({ v: 1, type: "set_sample_interval" }));
    expect(r.ok).toBe(false);
  });
  it("rejects unsupported v", () => {
    const r = parseCommand(JSON.stringify({ v: 2, cmd_id: "x", type: "y" }));
    expect(r.ok).toBe(false);
  });
  it("accepts a valid command", () => {
    const r = parseCommand(
      JSON.stringify({ v: 1, cmd_id: "x", type: "set_sample_interval", params: { interval_ms: 200 } })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.cmd_id).toBe("x");
      expect(r.value.params?.interval_ms).toBe(200);
    }
  });
});
