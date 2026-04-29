import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { openDb } from "../db/sqlite.js";
import { DeviceRepo } from "../db/devices.js";
import { RecordingRepo } from "../db/recordings.js";
import { CommandRepo } from "../db/commands.js";
import { Dispatcher } from "../commands/dispatcher.js";
import { EventBus } from "../bus.js";
import { registerRoutes } from "../api/routes.js";

function buildApp(): { app: FastifyInstance; devices: DeviceRepo; recordings: RecordingRepo; bus: EventBus; commands: CommandRepo; broker: any } {
  const db = openDb(":memory:");
  const devices = new DeviceRepo(db);
  const recordings = new RecordingRepo(db);
  const commands = new CommandRepo(db);
  const bus = new EventBus();
  const broker = { publishCommand: async () => {} } as any;
  const dispatcher = new Dispatcher(broker, commands, bus);
  const app = Fastify();
  registerRoutes(app, { devices, recordings, commands, dispatcher, grafanaUrl: "http://g" });
  return { app, devices, recordings, bus, commands, broker };
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
});
