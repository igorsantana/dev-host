export type ProjectStatus =
  | "down"
  | "starting"
  | "up"
  | "stopping"
  | "error";

export type Project = {
  id: string;
  name: string;
  description: string;
  path: string;
  image: string;
  runtime: "docker" | "npm";
  port: number;
  url: string;
  status: ProjectStatus;
  startedAt: number | null;
  uptimeMs: number;
  pid: number | null;
  error: string | null;
  metrics: { cpuPercent: number; memoryMb: number };
  managed: boolean;
};

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("Failed to load projects");
  const data = (await res.json()) as { projects: Project[] };
  return data.projects;
}

export async function startProject(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}/start`, { method: "POST" });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? "Start failed");
  }
  return res.json() as Promise<Project>;
}

export async function stopProject(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}/stop`, { method: "POST" });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? "Stop failed");
  }
  return res.json() as Promise<Project>;
}

export async function fetchLogs(id: string): Promise<string> {
  const res = await fetch(`/api/projects/${id}/logs?tail=400`);
  if (!res.ok) throw new Error("Failed to load logs");
  const data = (await res.json()) as { logs: string };
  return data.logs;
}

export function formatUptime(ms: number): string {
  if (ms <= 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
