import { randomUUID } from "node:crypto";
import type { DB } from "./sqlite.js";

export interface RecordingRow {
  recording_id: string;
  device_id: string;
  label: string | null;
  started_at: number;
  ended_at: number | null;
}

export class RecordingRepo {
  constructor(private readonly db: DB) {}

  start(deviceId: string, label: string | null = null, now = Date.now()): RecordingRow {
    const active = this.activeFor(deviceId);
    if (active) throw new Error(`recording already active for ${deviceId}: ${active.recording_id}`);
    const id = `rec-${randomUUID()}`;
    this.db
      .prepare(`INSERT INTO recordings (recording_id, device_id, label, started_at) VALUES (?, ?, ?, ?)`)
      .run(id, deviceId, label, now);
    return { recording_id: id, device_id: deviceId, label, started_at: now, ended_at: null };
  }

  stop(recordingId: string, now = Date.now()): RecordingRow {
    const r = this.get(recordingId);
    if (!r) throw new Error(`recording ${recordingId} not found`);
    if (r.ended_at) throw new Error(`recording ${recordingId} already ended`);
    this.db.prepare(`UPDATE recordings SET ended_at = ? WHERE recording_id = ?`).run(now, recordingId);
    return { ...r, ended_at: now };
  }

  get(recordingId: string): RecordingRow | undefined {
    return this.db.prepare(`SELECT * FROM recordings WHERE recording_id = ?`).get(recordingId) as RecordingRow | undefined;
  }

  activeFor(deviceId: string): RecordingRow | undefined {
    return this.db
      .prepare(`SELECT * FROM recordings WHERE device_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`)
      .get(deviceId) as RecordingRow | undefined;
  }

  list(deviceId?: string): RecordingRow[] {
    if (deviceId) {
      return this.db.prepare(`SELECT * FROM recordings WHERE device_id = ? ORDER BY started_at DESC`).all(deviceId) as RecordingRow[];
    }
    return this.db.prepare(`SELECT * FROM recordings ORDER BY started_at DESC`).all() as RecordingRow[];
  }
}
