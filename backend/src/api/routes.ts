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
    const stopped = deps.recordings.stop(active.recording_id);
    const dev = deps.devices.get(id);
    const meta = dev?.metadata_json ? JSON.parse(dev.metadata_json) : null;
    const channelKeys = ((meta?.channels ?? []) as Array<{ key: string; recordable?: boolean }>)
      .filter((c) => c.recordable !== false)
      .map((c) => c.key);
    deps.recordings.persistSamples(stopped.recording_id, channelKeys, deps.buffer.samples(stopped.recording_id));
    return stopped;
  });

  app.delete("/api/recordings/:rid", async (req, reply) => {
    const rid = (req.params as { rid: string }).rid;
    const row = deps.recordings.get(rid);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (!row.ended_at) return reply.code(409).send({ error: "stop the recording first" });
    deps.buffer.drop(rid);
    deps.recordings.delete(rid);
    return { ok: true };
  });

  app.get("/api/devices/:id/recordings", async (req) => {
    const id = (req.params as { id: string }).id;
    return deps.recordings.list(id).map((r) => ({
      ...r,
      sample_count: deps.buffer.size(r.recording_id) || deps.recordings.sampleCount(r.recording_id),
    }));
  });

  app.get("/api/recordings/:rid/export.csv", async (req, reply) => {
    const rid = (req.params as { rid: string }).rid;
    const row = deps.recordings.get(rid);
    if (!row) return reply.code(404).send({ error: "not found" });
    const dev = deps.devices.get(row.device_id);
    const meta = dev?.metadata_json ? JSON.parse(dev.metadata_json) : null;
    const metaChannels = ((meta?.channels ?? []) as Array<{ key: string; unit: string; recordable?: boolean }>)
      .filter((c) => c.recordable !== false);

    let samples = deps.buffer.samples(rid);
    let channels = metaChannels;
    if (samples.length === 0) {
      const persisted = deps.recordings.loadSamples(rid);
      if (persisted) {
        samples = persisted.samples;
        // Use persisted column order, fall back to metadata for units.
        const unitByKey = new Map(metaChannels.map((c) => [c.key, c.unit]));
        channels = persisted.channels.map((k) => ({ key: k, unit: unitByKey.get(k) ?? "" }));
      }
    }

    const csv = toCsv(channels, samples);
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
