import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "./sqlite.js";
import { DeviceRepo } from "./devices.js";
import { RecordingRepo } from "./recordings.js";
import { CommandRepo } from "./commands.js";

describe("DeviceRepo", () => {
  let repo: DeviceRepo;
  beforeEach(() => { repo = new DeviceRepo(openDb(":memory:")); });

  it("upsertSeen creates then updates last_seen", () => {
    repo.upsertSeen("d1", 100);
    repo.upsertSeen("d1", 200);
    const r = repo.get("d1");
    expect(r?.first_seen).toBe(100);
    expect(r?.last_seen).toBe(200);
  });

  it("applyStatus updates state and boot_id", () => {
    repo.applyStatus({ v: 1, device_id: "d1", boot_id: "b1", state: "online" } as any, 100);
    expect(repo.get("d1")?.last_status).toBe("online");
    expect(repo.get("d1")?.last_boot_id).toBe("b1");
  });

  it("applyMetadata accepts a higher metadata_version", () => {
    repo.applyMetadata({ v: 1, device_id: "d1", metadata_version: 1, channels: [], commands: [], quality_codes: {} } as any);
    repo.applyMetadata({ v: 1, device_id: "d1", metadata_version: 2, channels: [], commands: [], quality_codes: {} } as any);
    expect(repo.get("d1")?.metadata_version).toBe(2);
  });

  it("applyMetadata rejects regressions", () => {
    repo.applyMetadata({ v: 1, device_id: "d1", metadata_version: 5, channels: [], commands: [], quality_codes: {} } as any);
    const ok = repo.applyMetadata({ v: 1, device_id: "d1", metadata_version: 3, channels: [], commands: [], quality_codes: {} } as any);
    expect(ok).toBe(false);
    expect(repo.get("d1")?.metadata_version).toBe(5);
  });
});

describe("RecordingRepo", () => {
  let dev: DeviceRepo, rec: RecordingRepo;
  beforeEach(() => {
    const db = openDb(":memory:");
    dev = new DeviceRepo(db);
    rec = new RecordingRepo(db);
    dev.upsertSeen("d1", 0);
  });
  it("starts and stops a recording", () => {
    const r = rec.start("d1", "test", 100);
    const s = rec.stop(r.recording_id, 200);
    expect(s.ended_at).toBe(200);
  });
  it("rejects double start", () => {
    rec.start("d1", null, 100);
    expect(() => rec.start("d1", null, 200)).toThrow();
  });
  it("rejects double stop", () => {
    const r = rec.start("d1", null, 100);
    rec.stop(r.recording_id, 200);
    expect(() => rec.stop(r.recording_id, 300)).toThrow();
  });

  it("persistSamples + loadSamples round-trips", () => {
    const r = rec.start("d1", null, 100);
    rec.stop(r.recording_id, 200);
    rec.persistSamples(r.recording_id, ["a", "b"], [
      { ts: 1, readings: { a: 1, b: 2 }, quality: { a: 0, b: 0 } },
      { ts: 2, readings: { a: 3, b: 4 }, quality: { a: 0, b: 0 } },
    ]);
    expect(rec.sampleCount(r.recording_id)).toBe(2);
    const loaded = rec.loadSamples(r.recording_id);
    expect(loaded?.channels).toEqual(["a", "b"]);
    expect(loaded?.samples.length).toBe(2);
    expect(loaded?.samples[1].readings.a).toBe(3);
  });

  it("delete removes recording and its samples", () => {
    const r = rec.start("d1", null, 100);
    rec.stop(r.recording_id, 200);
    rec.persistSamples(r.recording_id, ["a"], [{ ts: 1, readings: { a: 1 }, quality: {} }]);
    rec.delete(r.recording_id);
    expect(rec.get(r.recording_id)).toBeUndefined();
    expect(rec.loadSamples(r.recording_id)).toBeUndefined();
  });

  it("pruneOrphans drops active rows and finished-but-empty rows, keeps persisted", () => {
    dev.upsertSeen("d2", 0);
    dev.upsertSeen("d3", 0);
    // d1: active (no ended_at) → drop
    rec.start("d1", null, 100);
    // d2: finished, no samples persisted → drop
    const empty = rec.start("d2", null, 200);
    rec.stop(empty.recording_id, 250);
    // d3: finished WITH samples → keep
    const kept = rec.start("d3", null, 300);
    rec.stop(kept.recording_id, 400);
    rec.persistSamples(kept.recording_id, ["a"], [{ ts: 1, readings: { a: 1 }, quality: {} }]);

    const dropped = rec.pruneOrphans();
    expect(dropped).toBe(2);
    expect(rec.get(kept.recording_id)).toBeDefined();
    expect(rec.get(empty.recording_id)).toBeUndefined();
  });
});

describe("CommandRepo", () => {
  let cmd: CommandRepo;
  beforeEach(() => { cmd = new CommandRepo(openDb(":memory:")); });

  it("inserts and retrieves by cmd_id", () => {
    const r = cmd.insert("c1", "d1", "set_sample_interval", { interval_ms: 200 }, 100);
    expect(r.status).toBe("issued");
    expect(cmd.get("c1")?.type).toBe("set_sample_interval");
  });
  it("updates status preserving issued_at", () => {
    cmd.insert("c1", "d1", "x", {}, 100);
    cmd.updateStatus("c1", "completed", "ok", 200);
    const r = cmd.get("c1");
    expect(r?.status).toBe("completed");
    expect(r?.issued_at).toBe(100);
    expect(r?.updated_at).toBe(200);
  });
});
