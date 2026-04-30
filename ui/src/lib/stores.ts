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

// Hard cap on retained samples per device. At 500 ms cadence this is ~16 minutes;
// at 100 ms it's ~3 minutes. The chart filters this slice by the selected time
// window for display.
export const MAX_SAMPLES = 2000;

export interface ChartWindow {
  label: string;
  ms: number | null; // null = unlimited (show every retained sample)
}
export const WINDOWS: ChartWindow[] = [
  { label: "60s", ms: 60_000 },
  { label: "5m", ms: 300_000 },
  { label: "10m", ms: 600_000 },
  { label: "30m", ms: 1_800_000 },
  { label: "All", ms: null },
];
const WINDOW_STORAGE_KEY = "bench.chartWindow";

function loadWindow(): string {
  if (typeof localStorage === "undefined") return "60s";
  const v = localStorage.getItem(WINDOW_STORAGE_KEY);
  return v && WINDOWS.some((w) => w.label === v) ? v : "60s";
}

export const devices = writable<DeviceDto[]>([]);
export const liveReadings = writable<Record<string, Reading>>({});
export const recentSamples = writable<Record<string, Sample[]>>({});
export const wsConnected = writable(false);
export const recordings = writable<Record<string, RecordingRow[]>>({});
export const activeRecording = writable<Record<string, RecordingRow | null>>({});
export const chartWindow = writable<string>(loadWindow());
chartWindow.subscribe((v) => {
  if (typeof localStorage !== "undefined") localStorage.setItem(WINDOW_STORAGE_KEY, v);
});

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
    cur[t.device_id] = appendSample(cur[t.device_id] ?? [], {
      ts,
      readings: t.readings ?? {},
      quality: t.quality ?? {},
    }, MAX_SAMPLES);
    return cur;
  });
}

// Clears retained samples for one device (or all devices if id omitted).
export function resetSamples(deviceId?: string) {
  recentSamples.update((cur) => {
    if (!deviceId) return {};
    const next = { ...cur };
    delete next[deviceId];
    return next;
  });
}

// Pure helpers (exported for unit tests).

export function appendSample(buf: Sample[], s: Sample, cap: number): Sample[] {
  const next = buf.length >= cap ? buf.slice(buf.length - cap + 1) : buf.slice();
  next.push(s);
  return next;
}

// Returns the suffix of `samples` whose ts is within `windowMs` of `now`.
// If `windowMs` is null, returns the input as-is (unlimited window).
// Uses binary search since samples are sorted by ts.
export function filterByWindow<T extends { ts: number }>(
  samples: T[],
  windowMs: number | null,
  now: number,
): T[] {
  if (windowMs === null || samples.length === 0) return samples;
  const cutoff = now - windowMs;
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].ts < cutoff) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? samples : samples.slice(lo);
}

export function windowMsFor(label: string): number | null {
  const w = WINDOWS.find((x) => x.label === label);
  return w ? w.ms : 60_000;
}
