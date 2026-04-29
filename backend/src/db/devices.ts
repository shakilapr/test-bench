import type { DB } from "./sqlite.js";
import type { Metadata, Status } from "../protocol.js";

export interface DeviceRow {
  device_id: string;
  first_seen: number;
  last_seen: number;
  last_status: string;
  last_boot_id: string | null;
  metadata_version: number;
  metadata_json: string | null;
}

export class DeviceRepo {
  constructor(private readonly db: DB) {}

  upsertSeen(deviceId: string, now = Date.now()) {
    this.db
      .prepare(
        `INSERT INTO devices (device_id, first_seen, last_seen)
         VALUES (?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET last_seen = excluded.last_seen`
      )
      .run(deviceId, now, now);
  }

  applyStatus(s: Status, now = Date.now()) {
    this.upsertSeen(s.device_id, now);
    this.db
      .prepare(
        `UPDATE devices SET last_status = ?, last_boot_id = ?, last_seen = ? WHERE device_id = ?`
      )
      .run(s.state, s.boot_id, now, s.device_id);
  }

  // Returns true if applied, false if regression rejected.
  applyMetadata(m: Metadata, now = Date.now()): boolean {
    this.upsertSeen(m.device_id, now);
    const existing = this.get(m.device_id);
    if (existing && existing.metadata_version > m.metadata_version) {
      console.warn(
        `[devices] metadata regression for ${m.device_id}: existing v${existing.metadata_version} > incoming v${m.metadata_version}; ignoring`
      );
      return false;
    }
    this.db
      .prepare(
        `UPDATE devices SET metadata_version = ?, metadata_json = ?, last_seen = ? WHERE device_id = ?`
      )
      .run(m.metadata_version, JSON.stringify(m), now, m.device_id);
    return true;
  }

  get(deviceId: string): DeviceRow | undefined {
    return this.db.prepare(`SELECT * FROM devices WHERE device_id = ?`).get(deviceId) as DeviceRow | undefined;
  }

  list(): DeviceRow[] {
    return this.db.prepare(`SELECT * FROM devices ORDER BY device_id`).all() as DeviceRow[];
  }
}
