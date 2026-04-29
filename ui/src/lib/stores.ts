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

export const devices = writable<DeviceDto[]>([]);
export const liveReadings = writable<Record<string, Reading>>({});
export const recordings = writable<Record<string, any>>({});
export const wsConnected = writable(false);
export const grafanaUrl = writable<string | null>(null);

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

export function applyTelemetry(t: any) {
  liveReadings.update((cur) => {
    cur[t.device_id] = {
      device_id: t.device_id,
      ts: Date.now(),
      readings: t.readings ?? {},
      quality: t.quality ?? {},
    };
    return cur;
  });
}
