import type { DB } from "./sqlite.js";

export interface CommandRow {
  cmd_id: string;
  device_id: string;
  type: string;
  params_json: string;
  status: string;
  message: string | null;
  issued_at: number;
  updated_at: number;
}

export class CommandRepo {
  constructor(private readonly db: DB) {}

  insert(cmdId: string, deviceId: string, type: string, params: Record<string, unknown>, now = Date.now()): CommandRow {
    const row: CommandRow = {
      cmd_id: cmdId,
      device_id: deviceId,
      type,
      params_json: JSON.stringify(params),
      status: "issued",
      message: null,
      issued_at: now,
      updated_at: now,
    };
    this.db
      .prepare(
        `INSERT INTO commands (cmd_id, device_id, type, params_json, status, message, issued_at, updated_at)
         VALUES (@cmd_id, @device_id, @type, @params_json, @status, @message, @issued_at, @updated_at)`
      )
      .run(row);
    return row;
  }

  updateStatus(cmdId: string, status: string, message: string | null, now = Date.now()) {
    this.db
      .prepare(`UPDATE commands SET status = ?, message = ?, updated_at = ? WHERE cmd_id = ?`)
      .run(status, message, now, cmdId);
  }

  get(cmdId: string): CommandRow | undefined {
    return this.db.prepare(`SELECT * FROM commands WHERE cmd_id = ?`).get(cmdId) as CommandRow | undefined;
  }

  recent(deviceId: string, limit = 50): CommandRow[] {
    return this.db
      .prepare(`SELECT * FROM commands WHERE device_id = ? ORDER BY issued_at DESC LIMIT ?`)
      .all(deviceId, limit) as CommandRow[];
  }
}
