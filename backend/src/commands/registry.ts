// Static command registry. Live commands per device come from device metadata.
// This list is the backend's allow-list of command types it knows how to issue.

export interface CommandSpec {
  type: string;
  paramsSchema: Record<string, { type: "number" | "string" | "boolean"; min?: number; max?: number }>;
}

export const COMMAND_REGISTRY: Record<string, CommandSpec> = {
  set_sample_interval: {
    type: "set_sample_interval",
    paramsSchema: { interval_ms: { type: "number", min: 100, max: 10000 } },
  },
};

export function validateParams(type: string, params: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  const spec = COMMAND_REGISTRY[type];
  if (!spec) return { ok: false, error: `unknown command type: ${type}` };
  for (const [key, schema] of Object.entries(spec.paramsSchema)) {
    const v = params[key];
    if (schema.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, error: `${key} must be a number` };
      if (schema.min !== undefined && v < schema.min) return { ok: false, error: `${key} below min ${schema.min}` };
      if (schema.max !== undefined && v > schema.max) return { ok: false, error: `${key} above max ${schema.max}` };
    } else if (schema.type === "string" && typeof v !== "string") {
      return { ok: false, error: `${key} must be a string` };
    } else if (schema.type === "boolean" && typeof v !== "boolean") {
      return { ok: false, error: `${key} must be a boolean` };
    }
  }
  return { ok: true };
}
