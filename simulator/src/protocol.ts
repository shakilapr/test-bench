// Pure protocol builders + parsers shared by the simulator and its tests.
// Keeps message shapes in one place so unit tests can assert against them.

export interface TelemetryArgs {
  deviceId: string;
  bootId: string;
  seq: number;
  ms: number;
  readings: Record<string, number>;
  quality: Record<string, number>;
}

export interface CommandPayload {
  v: number;
  cmd_id: string;
  type: string;
  params?: Record<string, unknown>;
}

export function buildTelemetry(args: TelemetryArgs) {
  return {
    v: 1,
    device_id: args.deviceId,
    boot_id: args.bootId,
    seq: args.seq,
    ms: args.ms,
    time_synced: false,
    readings: args.readings,
    quality: args.quality,
  };
}

export function buildMetadata(deviceId: string) {
  return {
    v: 1,
    device_id: deviceId,
    metadata_version: 2,
    channels: [
      {
        key: "current_a",
        label: "Current",
        unit: "A",
        precision: 2,
        kind: "measurement",
        recordable: true,
        chartable: true,
      },
      {
        key: "chip_temp_c",
        label: "Chip Temp",
        unit: "degC",
        precision: 1,
        kind: "health",
        recordable: true,
        chartable: true,
      },
      {
        key: "motor_rpm",
        label: "Motor speed",
        unit: "rpm",
        precision: 0,
        kind: "measurement",
        recordable: true,
        chartable: true,
      },
    ],
    commands: [
      {
        type: "set_sample_interval",
        label: "Sample Interval",
        params: {
          interval_ms: { type: "number", min: 100, max: 10000 },
        },
      },
    ],
    quality_codes: {
      current_a: { "0": "ok", "1": "saturated", "2": "low_snr" },
      chip_temp_c: { "0": "ok", "1": "fault" },
      motor_rpm: { "0": "ok", "1": "sensor fault" },
    },
  };
}

export function buildOnlineStatus(deviceId: string, bootId: string, sampleIntervalMs: number) {
  return {
    v: 1,
    device_id: deviceId,
    boot_id: bootId,
    state: "online",
    fw: "sim-0.1.0",
    sample_interval_ms: sampleIntervalMs,
    reset_reason: "sim_start",
  };
}

export function buildOfflineStatus(deviceId: string, bootId: string) {
  return {
    v: 1,
    device_id: deviceId,
    boot_id: bootId,
    state: "offline",
  };
}

export function buildAck(cmdId: string, status: string, message: string) {
  return { v: 1, cmd_id: cmdId, status, message };
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseCommand(raw: string): ParseResult<CommandPayload> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `invalid json: ${(e as Error).message}` };
  }
  if (!json || typeof json !== "object") return { ok: false, error: "not an object" };
  const obj = json as Record<string, unknown>;
  if (obj.v !== 1) return { ok: false, error: "unsupported v" };
  if (typeof obj.cmd_id !== "string" || obj.cmd_id.length === 0) {
    return { ok: false, error: "missing cmd_id" };
  }
  if (typeof obj.type !== "string" || obj.type.length === 0) {
    return { ok: false, error: "missing type" };
  }
  return {
    ok: true,
    value: {
      v: 1,
      cmd_id: obj.cmd_id,
      type: obj.type,
      params: (obj.params ?? {}) as Record<string, unknown>,
    },
  };
}
