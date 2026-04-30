import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { openDb } from "../db/sqlite.js";
import { DeviceRepo } from "../db/devices.js";
import { RecordingRepo } from "../db/recordings.js";
import { CommandRepo } from "../db/commands.js";
import { Dispatcher } from "../commands/dispatcher.js";
import { EventBus } from "../bus.js";
import { registerRoutes } from "../api/routes.js";
import { RecordingBuffer } from "../recordings/buffer.js";

function buildApp() {
  const db = openDb(":memory:");
  const devices = new DeviceRepo(db);
  const recordings = new RecordingRepo(db);
  const commands = new CommandRepo(db);
  const bus = new EventBus();
  const broker = { publishCommand: async () => {} } as any;
  const dispatcher = new Dispatcher(broker, commands, bus);
  const buffer = new RecordingBuffer();
  const app = Fastify();
  registerRoutes(app, { devices, recordings, commands, dispatcher, buffer, grafanaUrl: "http://g" });
  return { app, devices, recordings, bus, commands, broker, buffer };
}

describe("REST API", () => {
  let ctx: ReturnType<typeof buildApp>;
  beforeEach(() => { ctx = buildApp(); });

  it("GET /api/health returns ok", async () => {
    const r = await ctx.app.inject({ method: "GET", url: "/api/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });

  it("GET /api/devices/:id 404s for unknown device", async () => {
    const r = await ctx.app.inject({ method: "GET", url: "/api/devices/nope" });
    expect(r.statusCode).toBe(404);
  });

  it("start/stop recording round trip", async () => {
    ctx.devices.upsertSeen("d1");
    const start = await ctx.app.inject({ method: "POST", url: "/api/devices/d1/recordings/start", payload: { label: "t" } });
    expect(start.statusCode).toBe(200);
    const stop = await ctx.app.inject({ method: "POST", url: "/api/devices/d1/recordings/stop" });
    expect(stop.statusCode).toBe(200);
    expect(stop.json().ended_at).toBeTruthy();
  });

  it("rejects stop with no active recording", async () => {
    ctx.devices.upsertSeen("d1");
    const r = await ctx.app.inject({ method: "POST", url: "/api/devices/d1/recordings/stop" });
    expect(r.statusCode).toBe(409);
  });

  it("rejects unknown command type", async () => {
    const r = await ctx.app.inject({ method: "POST", url: "/api/devices/d1/commands", payload: { type: "bogus" } });
    expect(r.statusCode).toBe(400);
  });

  it("rejects out-of-range params", async () => {
    const r = await ctx.app.inject({ method: "POST", url: "/api/devices/d1/commands", payload: { type: "set_sample_interval", params: { interval_ms: 50 } } });
    expect(r.statusCode).toBe(400);
  });

  it("issues a valid command and stores it", async () => {
    const r = await ctx.app.inject({ method: "POST", url: "/api/devices/d1/commands", payload: { type: "set_sample_interval", params: { interval_ms: 200 } } });
    expect(r.statusCode).toBe(200);
    const cmdId = r.json().cmd_id;
    expect(cmdId).toMatch(/^cmd-/);
    expect(ctx.commands.get(cmdId)?.status).toBe("issued");
  });

  it("exports a recording as CSV using metadata channels for header order", async () => {
    ctx.devices.upsertSeen("d1");
    ctx.devices.applyMetadata({
      v: 1, device_id: "d1", metadata_version: 1, quality_codes: {}, commands: [],
      channels: [
        { key: "current_a", label: "Current", unit: "A", kind: "gauge", recordable: true, chartable: true },
        { key: "chip_temp_c", label: "Temp", unit: "degC", kind: "gauge", recordable: true, chartable: true },
      ],
    } as any);
    const start = await ctx.app.inject({ method: "POST", url: "/api/devices/d1/recordings/start", payload: { label: "run-1" } });
    const rid = start.json().recording_id;
    ctx.buffer.append(rid, { v: 1, device_id: "d1", boot_id: "b", seq: 0, ms: 0, readings: { current_a: 1.25, chip_temp_c: 42 }, quality: { current_a: 0, chip_temp_c: 0 }, time_synced: false } as any, 1700000000000);
    const r = await ctx.app.inject({ method: "GET", url: `/api/recordings/${rid}/export.csv` });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    expect(r.headers["content-disposition"]).toMatch(/attachment; filename="rec-.*\.csv"/);
    const lines = r.body.trim().split("\n");
    expect(lines[0]).toBe("ts_ms,iso,current_a,chip_temp_c,current_a_q,chip_temp_c_q");
    expect(lines[1]).toContain("1.25,42,0,0");
  });

  it("export.csv 404s for unknown recording", async () => {
    const r = await ctx.app.inject({ method: "GET", url: "/api/recordings/nope/export.csv" });
    expect(r.statusCode).toBe(404);
  });

  it("list recordings includes sample_count from buffer", async () => {
    ctx.devices.upsertSeen("d1");
    const start = await ctx.app.inject({ method: "POST", url: "/api/devices/d1/recordings/start", payload: {} });
    const rid = start.json().recording_id;
    ctx.buffer.append(rid, { v: 1, device_id: "d1", boot_id: "b", seq: 0, ms: 0, readings: { current_a: 1 }, quality: {}, time_synced: false } as any);
    ctx.buffer.append(rid, { v: 1, device_id: "d1", boot_id: "b", seq: 1, ms: 1, readings: { current_a: 1 }, quality: {}, time_synced: false } as any);
    const r = await ctx.app.inject({ method: "GET", url: "/api/devices/d1/recordings" });
    expect(r.json()[0].sample_count).toBe(2);
  });
});
