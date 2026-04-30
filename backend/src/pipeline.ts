import type { EventBus } from "./bus.js";
import type { DeviceRepo } from "./db/devices.js";
import type { RecordingRepo } from "./db/recordings.js";
import type { IInfluxWriter } from "./influx/noop.js";
import type { Telemetry, Status, Metadata } from "./protocol.js";

export interface PipelineOptions {
  bus: EventBus;
  devices: DeviceRepo;
  recordings: RecordingRepo;
  influx: IInfluxWriter;
}

// Wires MQTT-side device events into the SQLite control plane and InfluxDB write path.
export function wirePipeline(opts: PipelineOptions) {
  const { bus, devices, recordings, influx } = opts;

  bus.on("device.status", (raw) => {
    const s = raw as Status;
    devices.applyStatus(s);
    influx.writeEvent(s.device_id, `status_${s.state}`);
    bus.emit("device.updated", { device_id: s.device_id });
  });

  bus.on("device.meta", (raw) => {
    const m = raw as Metadata;
    const accepted = devices.applyMetadata(m);
    if (accepted) bus.emit("device.updated", { device_id: m.device_id });
  });

  bus.on("device.telemetry", (raw) => {
    const t = raw as Telemetry;
    devices.upsertSeen(t.device_id);
    const active = recordings.activeFor(t.device_id);
    influx.writeTelemetry(t, active?.recording_id ?? null);
    bus.emit("telemetry.broadcast", t);
  });
}
