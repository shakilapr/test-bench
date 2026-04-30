import type { Telemetry } from "../protocol.js";

export interface RecordingSample {
  ts: number;
  readings: Record<string, number>;
  quality: Record<string, number>;
}

// In-memory ring buffer per recording. Independent of Influx so CSV export
// works in dev (INFLUX_DISABLED=true) and survives Influx outages. Bounded:
// when a recording exceeds maxSamples, oldest samples are dropped.
export class RecordingBuffer {
  private readonly buffers = new Map<string, RecordingSample[]>();

  constructor(private readonly maxSamples = 60_000) {}

  append(recordingId: string, t: Telemetry, ts = Date.now()) {
    let buf = this.buffers.get(recordingId);
    if (!buf) {
      buf = [];
      this.buffers.set(recordingId, buf);
    }
    buf.push({ ts, readings: t.readings, quality: t.quality ?? {} });
    if (buf.length > this.maxSamples) buf.splice(0, buf.length - this.maxSamples);
  }

  size(recordingId: string): number {
    return this.buffers.get(recordingId)?.length ?? 0;
  }

  samples(recordingId: string): RecordingSample[] {
    return this.buffers.get(recordingId) ?? [];
  }

  drop(recordingId: string) {
    this.buffers.delete(recordingId);
  }

  clear() {
    this.buffers.clear();
  }
}

// CSV header + rows for a recording. Channels list comes from device
// metadata so columns are stable even if a sample is missing a key.
export function toCsv(channels: Array<{ key: string; unit: string }>, samples: RecordingSample[]): string {
  const cols = channels.map((c) => c.key);
  const header = ["ts_ms", "iso", ...cols, ...cols.map((c) => `${c}_q`)].join(",");
  const lines = [header];
  for (const s of samples) {
    const iso = new Date(s.ts).toISOString();
    const vals = cols.map((k) => {
      const v = s.readings[k];
      return v === undefined ? "" : String(v);
    });
    const q = cols.map((k) => {
      const v = s.quality[k];
      return v === undefined ? "" : String(v);
    });
    lines.push([s.ts, iso, ...vals, ...q].join(","));
  }
  return lines.join("\n") + "\n";
}
