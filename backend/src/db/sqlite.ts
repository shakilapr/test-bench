import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = Database.Database;

export function openDb(path: string): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      last_status TEXT NOT NULL DEFAULT 'unknown',
      last_boot_id TEXT,
      metadata_version INTEGER DEFAULT 0,
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS recordings (
      recording_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      label TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      FOREIGN KEY (device_id) REFERENCES devices(device_id)
    );

    CREATE TABLE IF NOT EXISTS recording_samples (
      recording_id TEXT PRIMARY KEY,
      sample_count INTEGER NOT NULL,
      channels_json TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (recording_id) REFERENCES recordings(recording_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commands (
      cmd_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      type TEXT NOT NULL,
      params_json TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      issued_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      type TEXT NOT NULL,
      details_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_recordings_device ON recordings(device_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_events_device ON events(device_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_id, issued_at);
  `);
}
