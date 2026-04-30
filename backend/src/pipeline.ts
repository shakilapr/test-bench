import type { EventBus } from "./bus.js";
import type { DeviceRepo } from "./db/devices.js";
import type { RecordingRepo } from "./db/recordings.js";
import type { RecordingBuffer } from "./recordings/buffer.js";
import type { Telemetry, Status, Metadata } from "./protocol.js";

export interface PipelineOptions {
  bus: EventBus;
  devices: DeviceRepo;
  recordings: RecordingRepo;
  buffer: RecordingBuffer;
}

// Wires MQTT-side device events into the SQLite control plane and the in-memory recording buffer.
export function wirePipeline(opts: PipelineOptions) {
  const { bus, devices, recordings, buffer } = opts;

  bus.on("device.status", (raw) => {
    const s = raw as Status;
    devices.applyStatus(s);
    bus.emit("device.updated", { device_id: s.device_id });
  });

  bus.on("device.meta", (raw) => {
    const m = raw as Metadata;
    const accepted = devices.applyMetadata(m);
    if (accepted) bus.emit("device.updated", { device_id: m.device_id });
  });

  bus.on("device.telemetry", (raw) => {
    const t = raw as Telemetry;
    const isNew = !devices.get(t.device_id);
    devices.upsertSeen(t.device_id);
    if (isNew) bus.emit("device.updated", { device_id: t.device_id });
    const active = recordings.activeFor(t.device_id);
    if (active) buffer.append(active.recording_id, t);
    bus.emit("telemetry.broadcast", t);
  });
}
