import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  SQLITE_PATH: z.string().default("./data/bench.sqlite"),
  MQTT_URL: z.string().default("mqtt://localhost:1883"),
  MQTT_USER: z.string().optional(),
  MQTT_PASS: z.string().optional(),
  INFLUX_URL: z.string().default("http://localhost:8086"),
  INFLUX_TOKEN: z.string().default("dev-token"),
  INFLUX_ORG: z.string().default("bench"),
  INFLUX_BUCKET: z.string().default("bench"),
  GRAFANA_URL: z.string().default("http://localhost:3001"),
  UI_DIST: z.string().default("../ui/dist"),
  EMBED_BROKER: z
    .union([z.boolean(), z.string()])
    .default(false)
    .transform((v) => v === true || v === "true" || v === "1"),
  EMBED_BROKER_PORT: z.coerce.number().default(1883),
  INFLUX_DISABLED: z
    .union([z.boolean(), z.string()])
    .default(false)
    .transform((v) => v === true || v === "true" || v === "1"),
});

export type Config = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = Schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}
