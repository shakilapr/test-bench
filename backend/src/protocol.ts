import { z } from "zod";

export const TelemetrySchema = z.object({
  v: z.literal(1),
  device_id: z.string().min(1),
  boot_id: z.string().min(1),
  seq: z.number().int().nonnegative(),
  ms: z.number().int().nonnegative(),
  time_synced: z.boolean().optional().default(false),
  time_unix_ms: z.number().int().optional(),
  readings: z.record(z.string(), z.number()),
  quality: z.record(z.string(), z.number().int()).optional().default({}),
});
export type Telemetry = z.infer<typeof TelemetrySchema>;

export const StatusSchema = z.object({
  v: z.literal(1),
  device_id: z.string().min(1),
  boot_id: z.string().min(1),
  state: z.enum(["online", "offline"]),
  fw: z.string().optional(),
  sample_interval_ms: z.number().int().optional(),
  reset_reason: z.string().optional(),
});
export type Status = z.infer<typeof StatusSchema>;

export const MetadataSchema = z.object({
  v: z.literal(1),
  device_id: z.string().min(1),
  metadata_version: z.number().int().nonnegative(),
  channels: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      unit: z.string(),
      precision: z.number().int().optional(),
      kind: z.string(),
      recordable: z.boolean().optional().default(true),
      chartable: z.boolean().optional().default(true),
    })
  ),
  commands: z
    .array(
      z.object({
        type: z.string(),
        label: z.string().optional(),
        params: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional()
    .default([]),
  quality_codes: z.record(z.string(), z.record(z.string(), z.string())).optional().default({}),
});
export type Metadata = z.infer<typeof MetadataSchema>;

export const AckSchema = z.object({
  v: z.literal(1),
  cmd_id: z.string().min(1),
  status: z.enum(["accepted", "sent", "completed", "rejected", "failed", "duplicate", "timed_out"]),
  message: z.string().optional(),
});
export type Ack = z.infer<typeof AckSchema>;

export const CommandSchema = z.object({
  v: z.literal(1),
  cmd_id: z.string().min(1),
  type: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional().default({}),
});
export type Command = z.infer<typeof CommandSchema>;
