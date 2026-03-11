import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppConfig } from "../config.js";

const execFileAsync = promisify(execFile);
const K8SGPT_TIMEOUT_MS = 60000;

export interface K8sGptFinding {
  name: string;
  kind?: string;
  namespace?: string;
  details?: string;
}

export interface K8sGptConnector {
  analyze(): Promise<K8sGptFinding[]>;
}

export class LiveK8sGptConnector implements K8sGptConnector {
  constructor(private readonly config: AppConfig) {}

  async analyze(): Promise<K8sGptFinding[]> {
    const env = {
      ...process.env,
      ...(this.config.KUBECONFIG_PATH ? { KUBECONFIG: this.config.KUBECONFIG_PATH } : {})
    };
    const { stdout } = await execFileAsync(
      this.config.K8SGPT_COMMAND,
      ["analyze", "--output", "json"],
      {
        env,
        maxBuffer: 10 * 1024 * 1024,
        timeout: K8SGPT_TIMEOUT_MS
      }
    );
    const parsed = JSON.parse(stdout) as { results?: unknown[] } | unknown[];
    const results = Array.isArray(parsed) ? parsed : parsed.results ?? [];

    return results.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const item = entry as Record<string, unknown>;
      const rawName = String(item.name ?? item.resource ?? "unknown");
      const [nameNamespace, nameOnly] = rawName.includes("/")
        ? rawName.split("/", 2)
        : [undefined, rawName];
      const firstError = Array.isArray(item.error) ? item.error[0] : undefined;
      const detailFromError =
        firstError && typeof firstError === "object" && "Text" in firstError
          ? String((firstError as { Text?: unknown }).Text ?? "")
          : undefined;

      return [
        {
          name: nameOnly,
          kind: typeof item.kind === "string" ? item.kind : undefined,
          namespace:
            typeof item.namespace === "string"
              ? item.namespace
              : nameNamespace,
          details:
            typeof item.details === "string"
              ? item.details || detailFromError
              : typeof item.message === "string"
                ? item.message
                : detailFromError
        }
      ];
    });
  }
}
