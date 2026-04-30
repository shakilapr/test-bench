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

export interface Sample {
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

// Keep ~2 minutes of samples client-side for the live charts (240 @ 500ms).
export const SAMPLE_WINDOW = 240;

export const devices = writable<DeviceDto[]>([]);
export const liveReadings = writable<Record<string, Reading>>({});
export const recentSamples = writable<Record<string, Sample[]>>({});
export const wsConnected = writable(false);
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

export async function refreshRecordings(deviceId: string) {
  const r = await fetch(`/api/devices/${deviceId}/recordings`);
  if (!r.ok) return;
  const list: RecordingRow[] = await r.json();
  recordings.update((m) => ({ ...m, [deviceId]: list }));
  const act = list.find((x) => !x.ended_at) ?? null;
  activeRecording.update((m) => ({ ...m, [deviceId]: act }));
}

export async function deleteRecording(recordingId: string, deviceId: string) {
  const r = await fetch(`/api/recordings/${recordingId}`, { method: "DELETE" });
  if (r.ok) await refreshRecordings(deviceId);
  return r.ok;
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
  recentSamples.update((cur) => {
    const arr = cur[t.device_id] ?? [];
    arr.push({ ts, readings: t.readings ?? {}, quality: t.quality ?? {} });
    if (arr.length > SAMPLE_WINDOW) arr.splice(0, arr.length - SAMPLE_WINDOW);
    cur[t.device_id] = arr;
    return cur;
  });
}
