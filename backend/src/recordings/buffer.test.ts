import { describe, it, expect } from "vitest";
import { RecordingBuffer, toCsv } from "./buffer.js";
import type { Telemetry } from "../protocol.js";

function sample(seq: number): Telemetry {
  return {
    v: 1, device_id: "d1", boot_id: "b1", seq, ms: seq * 100,
    readings: { current_a: seq * 0.1, chip_temp_c: 40 + seq },
    quality: { current_a: 0, chip_temp_c: 0 },
    time_synced: false,
  };
}

describe("RecordingBuffer", () => {
  it("appends per recording_id and evicts beyond maxSamples", () => {
    const b = new RecordingBuffer(3);
    for (let i = 0; i < 5; i++) b.append("rec1", sample(i), 1000 + i);
    expect(b.size("rec1")).toBe(3);
    const s = b.samples("rec1");
    expect(s.map((x) => x.ts)).toEqual([1002, 1003, 1004]);
  });

  it("isolates recordings from each other", () => {
    const b = new RecordingBuffer();
    b.append("rec1", sample(0));
    b.append("rec2", sample(1));
    expect(b.size("rec1")).toBe(1);
    expect(b.size("rec2")).toBe(1);
  });
});

describe("toCsv", () => {
  it("emits stable columns from channel metadata even when a sample omits keys", () => {
    const b = new RecordingBuffer();
    b.append("r", { ...sample(0), readings: { current_a: 1.5 }, quality: {} } as Telemetry, 1000);
    b.append("r", sample(1), 1100);
    const csv = toCsv(
      [{ key: "current_a", unit: "A" }, { key: "chip_temp_c", unit: "degC" }],
      b.samples("r")
    );
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("ts_ms,iso,current_a,chip_temp_c,current_a_q,chip_temp_c_q");
    expect(lines[1]).toMatch(/^1000,.*,1\.5,,,/);
    expect(lines[2]).toMatch(/^1100,.*,0\.1,41,0,0$/);
  });
});
