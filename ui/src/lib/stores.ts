import { writable, derived, get } from "svelte/store";

export interface DeviceDto {
  device_id: string;
  last_status: string;
  last_seen: number;
  last_boot_id: string | null;
  metadata_version: number;
  metadata: any | null;
}

export interface Reading {
  device_id: string;
  ts: number;
  readings: Record<string, number>;
  quality: Record<string, number>;
}

export interface RecordingRow {
  recording_id: string;
  device_id: string;
  label: string | null;
  started_at: number;
  ended_at: number | null;
  sample_count?: number;
}

export const SPARK_WINDOW = 120;

export const devices = writable<DeviceDto[]>([]);
export const liveReadings = writable<Record<string, Reading>>({});
// Per-device, per-channel ring of recent values for sparklines.
export const recentReadings = writable<Record<string, Record<string, number[]>>>({});
export const wsConnected = writable(false);
export const grafanaUrl = writable<string | null>(null);
export const recordings = writable<Record<string, RecordingRow[]>>({});
export const activeRecording = writable<Record<string, RecordingRow | null>>({});

export const selectedDeviceId = writable<string | null>(null);
export const selectedDevice = derived([devices, selectedDeviceId], ([$d, $id]) => $d.find((x) => x.device_id === $id) ?? null);

export async function refreshDevices() {
  const r = await fetch("/api/devices");
  if (r.ok) {
    const list: DeviceDto[] = await r.json();
    devices.set(list);
    if (!get(selectedDeviceId) && list[0]) selectedDeviceId.set(list[0].device_id);
  }
}

export async function refreshGrafanaUrl() {
  const r = await fetch("/api/grafana-url");
  if (r.ok) {
    const j = await r.json();
    grafanaUrl.set(j.url ?? null);
  }
}

export async function refreshRecordings(deviceId: string) {
  const r = await fetch(`/api/devices/${deviceId}/recordings`);
  if (!r.ok) return;
  const list: RecordingRow[] = await r.json();
  recordings.update((m) => ({ ...m, [deviceId]: list }));
  const act = list.find((x) => !x.ended_at) ?? null;
  activeRecording.update((m) => ({ ...m, [deviceId]: act }));
}

export function applyTelemetry(t: any) {
  const ts = Date.now();
  liveReadings.update((cur) => {
    cur[t.device_id] = {
      device_id: t.device_id,
      ts,
      readings: t.readings ?? {},
      quality: t.quality ?? {},
    };
    return cur;
  });
  recentReadings.update((cur) => {
    const d = cur[t.device_id] ?? {};
    for (const [k, v] of Object.entries(t.readings ?? {})) {
      const arr = d[k] ?? [];
      arr.push(v as number);
      if (arr.length > SPARK_WINDOW) arr.splice(0, arr.length - SPARK_WINDOW);
      d[k] = arr;
    }
    cur[t.device_id] = d;
    return cur;
  });
}
