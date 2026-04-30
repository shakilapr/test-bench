import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  SQLITE_PATH: z.string().default("./data/bench.sqlite"),
  // External broker URL. Used only when EMBED_BROKER=false.
  MQTT_URL: z.string().default("mqtt://localhost:1883"),
  MQTT_USER: z.string().optional(),
  MQTT_PASS: z.string().optional(),
  // Embed an MQTT broker in-process (default). Set to false to use an external broker.
  EMBED_BROKER: z
    .union([z.boolean(), z.string()])
    .default(true)
    .transform((v) => v !== false && v !== "false" && v !== "0"),
  EMBED_BROKER_PORT: z.coerce.number().default(1883),
  UI_DIST: z.string().default("../ui/dist"),
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
