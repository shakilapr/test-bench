import type { FastifyInstance } from "fastify";
import type { DeviceRepo } from "../db/devices.js";
import type { RecordingRepo } from "../db/recordings.js";
import type { CommandRepo } from "../db/commands.js";
import type { Dispatcher } from "../commands/dispatcher.js";
import type { RecordingBuffer } from "../recordings/buffer.js";
import { toCsv } from "../recordings/buffer.js";
import { validateParams } from "../commands/registry.js";

export interface ApiDeps {
  devices: DeviceRepo;
  recordings: RecordingRepo;
  commands: CommandRepo;
  dispatcher: Dispatcher;
  buffer: RecordingBuffer;
}

export async function registerRoutes(app: FastifyInstance, deps: ApiDeps) {
  app.get("/api/health", async () => ({ ok: true, ts: Date.now() }));

  app.get("/api/devices", async () => deps.devices.list().map(toDeviceDto));

  app.get("/api/devices/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = deps.devices.get(id);
    if (!row) return reply.code(404).send({ error: "not found" });
    return toDeviceDto(row);
  });

  app.post("/api/devices/:id/recordings/start", async (req) => {
    const id = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as { label?: string };
    return deps.recordings.start(id, body.label ?? null);
  });

  app.post("/api/devices/:id/recordings/stop", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const active = deps.recordings.activeFor(id);
    if (!active) return reply.code(409).send({ error: "no active recording" });
    return deps.recordings.stop(active.recording_id);
  });

  app.get("/api/devices/:id/recordings", async (req) => {
    const id = (req.params as { id: string }).id;
    return deps.recordings.list(id).map((r) => ({ ...r, sample_count: deps.buffer.size(r.recording_id) }));
  });

  app.get("/api/recordings/:rid/export.csv", async (req, reply) => {
    const rid = (req.params as { rid: string }).rid;
    const row = deps.recordings.get(rid);
    if (!row) return reply.code(404).send({ error: "not found" });
    const dev = deps.devices.get(row.device_id);
    const meta = dev?.metadata_json ? JSON.parse(dev.metadata_json) : null;
    const channels = (meta?.channels ?? []).filter((c: any) => c.recordable !== false);
    const csv = toCsv(channels, deps.buffer.samples(rid));
    const fname = `${rid}${row.label ? `_${row.label.replace(/[^A-Za-z0-9._-]+/g, "_")}` : ""}.csv`;
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="${fname}"`);
    return csv;
  });

  app.post("/api/devices/:id/commands", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as { type: string; params?: Record<string, unknown> };
    if (!body.type) return reply.code(400).send({ error: "type required" });
    const validation = validateParams(body.type, body.params ?? {});
    if (!validation.ok) return reply.code(400).send({ error: validation.error });
    try {
      return await deps.dispatcher.issue({ deviceId: id, type: body.type, params: body.params });
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  });

  app.get("/api/devices/:id/commands", async (req) => {
    const id = (req.params as { id: string }).id;
    return deps.commands.recent(id);
  });
}

function toDeviceDto(row: ReturnType<DeviceRepo["get"]> & object) {
  return {
    device_id: row.device_id,
    last_status: row.last_status,
    last_seen: row.last_seen,
    last_boot_id: row.last_boot_id,
    metadata_version: row.metadata_version,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
  };
}
