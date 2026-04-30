import { randomUUID } from "node:crypto";
import type { DB } from "./sqlite.js";
import type { RecordingSample } from "../recordings/buffer.js";

export interface RecordingRow {
  recording_id: string;
  device_id: string;
  label: string | null;
  started_at: number;
  ended_at: number | null;
}

export interface PersistedSamples {
  channels: string[];
  samples: RecordingSample[];
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

  delete(recordingId: string) {
    this.db.prepare(`DELETE FROM recording_samples WHERE recording_id = ?`).run(recordingId);
    this.db.prepare(`DELETE FROM recordings WHERE recording_id = ?`).run(recordingId);
  }

  // Drop any recording rows that are stale at startup: still flagged active but
  // their in-memory buffer is gone, or finished but never persisted samples.
  // Both are unrecoverable so don't show them to the user.
  pruneOrphans(): number {
    const active = this.db
      .prepare(`DELETE FROM recordings WHERE ended_at IS NULL`)
      .run().changes;
    const empty = this.db
      .prepare(
        `DELETE FROM recordings
           WHERE ended_at IS NOT NULL
             AND recording_id NOT IN (SELECT recording_id FROM recording_samples)`
      )
      .run().changes;
    return active + empty;
  }

  persistSamples(recordingId: string, channelKeys: string[], samples: RecordingSample[]) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO recording_samples (recording_id, sample_count, channels_json, payload)
         VALUES (?, ?, ?, ?)`
      )
      .run(recordingId, samples.length, JSON.stringify(channelKeys), JSON.stringify(samples));
  }

  loadSamples(recordingId: string): PersistedSamples | undefined {
    const row = this.db
      .prepare(`SELECT channels_json, payload FROM recording_samples WHERE recording_id = ?`)
      .get(recordingId) as { channels_json: string; payload: string } | undefined;
    if (!row) return undefined;
    return {
      channels: JSON.parse(row.channels_json) as string[],
      samples: JSON.parse(row.payload) as RecordingSample[],
    };
  }

  sampleCount(recordingId: string): number {
    const row = this.db
      .prepare(`SELECT sample_count FROM recording_samples WHERE recording_id = ?`)
      .get(recordingId) as { sample_count: number } | undefined;
    return row?.sample_count ?? 0;
  }
}
