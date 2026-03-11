import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
  resolve(process.cwd(), "../../.env")
];

const envPath = envCandidates.find((candidate) => existsSync(candidate));
export const appRoot = envPath ? dirname(envPath) : resolve(process.cwd(), "../..");

if (envPath) {
  dotenv.config({ path: envPath });
}

const envSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  KUBECONFIG_PATH: z.string().optional(),
  KUBECONFIG_CONTEXT: z.string().optional(),
  PROMETHEUS_BASE_URL: z.string().optional(),
  K8SGPT_COMMAND: z.string().default("k8sgpt"),
  SQLITE_PATH: z.string().default(resolve(appRoot, "data", "cluster-history.sqlite"))
});

export type AppConfig = z.infer<typeof envSchema>;

export const getConfig = (): AppConfig => envSchema.parse(process.env);
