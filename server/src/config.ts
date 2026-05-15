import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type HealthCheck = {
  type: "http";
  url: string;
};

export type WebDevConfig = {
  path: string;
  startScript?: string;
};

export type ProjectConfig = {
  id: string;
  name: string;
  description: string;
  path: string;
  image: string;
  runtime: "docker" | "npm";
  port: number;
  url: string;
  startScript?: string;
  /** Host-side Vite/etc. dev server (e.g. Finance News web/ on :5173). */
  web?: WebDevConfig;
  /** Backend health when `web` is set (docker API). */
  apiHealthCheck?: HealthCheck;
  healthCheck: HealthCheck;
};

export type HostConfig = {
  developmentRoot: string;
  hostPort: number;
  projects: ProjectConfig[];
};

const configPath = path.resolve(__dirname, "../../projects.json");

export function loadConfig(): HostConfig {
  const raw = JSON.parse(readFileSync(configPath, "utf-8")) as HostConfig;
  return raw;
}

export function resolveProjectPath(project: ProjectConfig): string {
  const cfg = loadConfig();
  return path.resolve(configPath, "..", cfg.developmentRoot, project.path);
}

export const DATA_DIR = path.resolve(configPath, "..", ".data");
export const LOGS_DIR = path.join(DATA_DIR, "logs");
