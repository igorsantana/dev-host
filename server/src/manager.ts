import { execSync, spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import pidusage from "pidusage";
import {
  DATA_DIR,
  LOGS_DIR,
  loadConfig,
  resolveProjectPath,
  type ProjectConfig,
} from "./config.js";

export type ProjectStatus = "down" | "starting" | "up" | "stopping" | "error";

export type ProjectMetrics = {
  cpuPercent: number;
  memoryMb: number;
};

export type ProjectRuntime = {
  id: string;
  status: ProjectStatus;
  startedAt: number | null;
  uptimeMs: number;
  pid: number | null;
  error: string | null;
  metrics: ProjectMetrics;
  managed: boolean;
};

type StateEntry = {
  status: ProjectStatus;
  startedAt: number | null;
  pid: number | null;
  managed: boolean;
  error?: string;
};

type PersistedState = Record<string, StateEntry>;

const npmProcesses = new Map<string, ChildProcess>();
const stateFile = path.join(DATA_DIR, "state.json");

function ensureDirs() {
  mkdirSync(LOGS_DIR, { recursive: true });
}

function loadState(): PersistedState {
  ensureDirs();
  if (!existsSync(stateFile)) return {};
  try {
    return JSON.parse(readFileSync(stateFile, "utf-8")) as PersistedState;
  } catch {
    return {};
  }
}

function saveState(state: PersistedState) {
  ensureDirs();
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function logPath(id: string) {
  return path.join(LOGS_DIR, `${id}.log`);
}

function pidPath(id: string) {
  return path.join(DATA_DIR, "pids", `${id}.pid`);
}

function readPid(id: string): number | null {
  const file = pidPath(id);
  if (!existsSync(file)) return null;
  const pid = Number.parseInt(readFileSync(file, "utf-8").trim(), 10);
  return Number.isFinite(pid) ? pid : null;
}

function writePid(id: string, pid: number) {
  mkdirSync(path.join(DATA_DIR, "pids"), { recursive: true });
  writeFileSync(pidPath(id), String(pid));
}

function clearPid(id: string) {
  const file = pidPath(id);
  if (existsSync(file)) unlinkSync(file);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function terminatePid(pid: number) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already dead */
  }
}

async function exec(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      resolve({
        code: 1,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
      });
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function checkHealthUrl(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function checkHealth(project: ProjectConfig): Promise<boolean> {
  if (project.healthCheck.type !== "http") return false;
  return checkHealthUrl(project.healthCheck.url);
}

function webPidKey(projectId: string) {
  return `${projectId}-web`;
}

function webLogPath(id: string) {
  return path.join(LOGS_DIR, `${id}-web.log`);
}

function webRunning(projectId: string): boolean {
  const pid = readPid(webPidKey(projectId));
  return pid !== null && isProcessAlive(pid);
}

async function ensureCyberdeckUiBuilt(webCwd: string): Promise<void> {
  const uiRoot = path.resolve(webCwd, "../../cyberdeck-ui");
  const tokensCss = path.join(uiRoot, "dist/styles/tokens.css");
  if (existsSync(tokensCss)) return;
  const { code, stderr } = await exec("npm", ["run", "build"], uiRoot);
  if (code !== 0) {
    throw new Error(stderr || "Failed to build @cyberdeck/ui");
  }
}

async function startWebDev(project: ProjectConfig): Promise<void> {
  if (!project.web) return;
  const key = webPidKey(project.id);
  if (webRunning(project.id)) return;

  const cwd = path.join(resolveProjectPath(project), project.web.path);
  await ensureCyberdeckUiBuilt(cwd);
  const logFile = webLogPath(project.id);
  const script = project.web.startScript ?? "dev";
  const { code, stdout, stderr } = await exec(
    "sh",
    [
      "-c",
      `npm install --silent && nohup npm run ${script} >> "${logFile}" 2>&1 & echo $!`,
    ],
    cwd,
  );
  if (code !== 0) {
    throw new Error(stderr || "Failed to start web dev server");
  }
  const startedPid = Number.parseInt(stdout.trim(), 10);
  if (!Number.isFinite(startedPid)) {
    throw new Error("Could not read web dev process id");
  }
  writePid(key, startedPid);
}

function stopWebDev(projectId: string) {
  const key = webPidKey(projectId);
  const filePid = readPid(key);
  if (filePid) terminatePid(filePid);
  clearPid(key);
}

async function dockerRunning(project: ProjectConfig): Promise<boolean> {
  const cwd = resolveProjectPath(project);
  const { code, stdout } = await exec(
    "docker",
    ["compose", "ps", "--status", "running", "-q"],
    cwd,
  );
  if (code !== 0) return false;
  return stdout.trim().length > 0;
}

async function getDockerStats(
  project: ProjectConfig,
): Promise<ProjectMetrics | null> {
  const cwd = resolveProjectPath(project);
  const ids = await exec("docker", ["compose", "ps", "-q"], cwd);
  if (ids.code !== 0 || !ids.stdout.trim()) return null;

  const containerIds = ids.stdout.trim().split("\n").filter(Boolean);
  const { code, stdout } = await exec(
    "docker",
    [
      "stats",
      "--no-stream",
      "--format",
      "{{.CPUPerc}}|{{.MemUsage}}",
      ...containerIds,
    ],
    cwd,
  );
  if (code !== 0 || !stdout.trim()) return null;

  let cpuTotal = 0;
  let memTotalMb = 0;
  let count = 0;

  for (const line of stdout.trim().split("\n")) {
    const [cpuRaw, memRaw] = line.split("|");
    const cpu = parseFloat(cpuRaw?.replace("%", "") ?? "0");
    const memMatch = memRaw?.match(/([\d.]+)\s*MiB/i);
    const mem = memMatch ? parseFloat(memMatch[1]) : 0;
    if (!Number.isNaN(cpu)) {
      cpuTotal += cpu;
      memTotalMb += mem;
      count += 1;
    }
  }

  if (count === 0) return null;
  return {
    cpuPercent: Math.round((cpuTotal / count) * 10) / 10,
    memoryMb: Math.round(memTotalMb * 10) / 10,
  };
}

async function getPidMetrics(pid: number): Promise<ProjectMetrics> {
  try {
    const stats = await pidusage(pid);
    return {
      cpuPercent: Math.round(stats.cpu * 10) / 10,
      memoryMb: Math.round((stats.memory / 1024 / 1024) * 10) / 10,
    };
  } catch {
    return { cpuPercent: 0, memoryMb: 0 };
  }
}

export class ProjectManager {
  private state = loadState();

  private getEntry(id: string) {
    if (!this.state[id]) {
      this.state[id] = {
        status: "down",
        startedAt: null,
        pid: null,
        managed: false,
      };
    }
    return this.state[id];
  }

  listProjects(): ProjectConfig[] {
    return loadConfig().projects;
  }

  async getRuntime(project: ProjectConfig): Promise<ProjectRuntime> {
    const entry = this.getEntry(project.id);
    let status = entry.status;
    let pid = entry.pid;
    let metrics: ProjectMetrics = { cpuPercent: 0, memoryMb: 0 };

    if (project.runtime === "docker") {
      const running = await dockerRunning(project);
      if (running) {
        const webOk = project.web ? webRunning(project.id) : true;
        if (webOk) {
          const uiOk = await checkHealth(project);
          const apiOk = project.apiHealthCheck
            ? await checkHealthUrl(project.apiHealthCheck.url)
            : true;
          status = uiOk && apiOk ? "up" : "starting";
        } else {
          status = "starting";
        }
        const dockerMetrics = await getDockerStats(project);
        if (dockerMetrics) metrics = dockerMetrics;
      } else if (entry.managed && entry.status !== "stopping") {
        status = "down";
        entry.managed = false;
        entry.startedAt = null;
      }
    } else {
      const proc = npmProcesses.get(project.id);
      const filePid = readPid(project.id);
      const activePid =
        proc?.pid && !proc.killed ? proc.pid : filePid && isProcessAlive(filePid) ? filePid : null;

      if (activePid) {
        pid = activePid;
        status = (await checkHealth(project)) ? "up" : "starting";
        metrics = await getPidMetrics(activePid);
      } else if (entry.managed && entry.status === "starting") {
        status = "error";
        entry.error ??= "Process exited unexpectedly";
      } else if (!proc) {
        status = entry.status === "stopping" ? "stopping" : "down";
        if (status === "down") {
          entry.pid = null;
          entry.startedAt = null;
          entry.managed = false;
        }
      }
    }

    entry.status = status;
    entry.pid = pid;
    saveState(this.state);

    const uptimeMs =
      entry.startedAt && (status === "up" || status === "starting")
        ? Date.now() - entry.startedAt
        : 0;

    return {
      id: project.id,
      status,
      startedAt: entry.startedAt,
      uptimeMs,
      pid,
      error: entry.error ?? null,
      metrics,
      managed: entry.managed,
    };
  }

  async start(projectId: string): Promise<ProjectRuntime> {
    const project = this.listProjects().find((p) => p.id === projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);

    const entry = this.getEntry(projectId);
    const runtime = await this.getRuntime(project);
    if (runtime.status === "up") {
      return runtime;
    }

    if (project.runtime === "docker" && project.web) {
      const running = await dockerRunning(project);
      if (running && !webRunning(projectId)) {
        entry.managed = true;
        entry.status = "starting";
        entry.startedAt ??= Date.now();
        saveState(this.state);
        try {
          await startWebDev(project);
        } catch (err) {
          entry.status = "error";
          entry.error = err instanceof Error ? err.message : String(err);
          saveState(this.state);
          throw err;
        }
        return this.getRuntime(project);
      }
    }

    if (runtime.status === "starting") {
      return runtime;
    }

    entry.managed = true;
    entry.status = "starting";
    entry.startedAt = Date.now();
    delete entry.error;
    saveState(this.state);

    try {
      const cwd = resolveProjectPath(project);

      if (project.runtime === "docker") {
        const { code, stderr } = await exec(
          "docker",
          ["compose", "up", "-d", "--build"],
          cwd,
        );
        if (code !== 0) {
          entry.status = "error";
          entry.error = stderr || "docker compose failed";
          saveState(this.state);
          throw new Error(entry.error);
        }
        await startWebDev(project);
      } else {
        const logFile = logPath(projectId);
        const script = project.startScript ?? "dev";
        const { code, stdout, stderr } = await exec(
          "sh",
          [
            "-c",
            `nohup npm run ${script} >> "${logFile}" 2>&1 & echo $!`,
          ],
          cwd,
        );
        if (code !== 0) {
          entry.status = "error";
          entry.error = stderr || "Failed to start npm dev server";
          saveState(this.state);
          throw new Error(entry.error);
        }
        const startedPid = Number.parseInt(stdout.trim(), 10);
        if (!Number.isFinite(startedPid)) {
          entry.status = "error";
          entry.error = "Could not read process id";
          saveState(this.state);
          throw new Error(entry.error);
        }
        writePid(projectId, startedPid);
        entry.pid = startedPid;
      }
    } catch (err) {
      entry.status = "error";
      entry.error = err instanceof Error ? err.message : String(err);
      saveState(this.state);
      throw err;
    }

    return this.getRuntime(project);
  }

  async stop(projectId: string): Promise<ProjectRuntime> {
    const project = this.listProjects().find((p) => p.id === projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);

    const entry = this.getEntry(projectId);
    entry.status = "stopping";
    saveState(this.state);

    try {
      const cwd = resolveProjectPath(project);

      if (project.runtime === "docker") {
        stopWebDev(projectId);
        await exec("docker", ["compose", "down"], cwd);
      } else {
        const proc = npmProcesses.get(projectId);
        const filePid = readPid(projectId);
        if (proc?.pid) terminatePid(proc.pid);
        if (filePid) terminatePid(filePid);
        npmProcesses.delete(projectId);
        clearPid(projectId);
      }
    } catch (err) {
      entry.status = "error";
      entry.error = err instanceof Error ? err.message : String(err);
      saveState(this.state);
      throw err;
    }

    entry.status = "down";
    entry.startedAt = null;
    entry.pid = null;
    entry.managed = false;
    saveState(this.state);

    return this.getRuntime(project);
  }

  readLogs(projectId: string, tail = 300): string {
    const project = loadConfig().projects.find((p) => p.id === projectId);
    if (project?.runtime === "docker") {
      const cwd = resolveProjectPath(project);
      try {
        const out = execSync(`docker compose logs --tail=${tail}`, {
          cwd,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        const text = out.trim();
        return text || "(No logs yet — start the project to capture output)";
      } catch {
        return "(No logs yet — start the project to capture output)";
      }
    }

    const file = logPath(projectId);
    if (!existsSync(file)) {
      return "(No logs yet — start the project to capture output)";
    }
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");
    return lines.slice(-tail).join("\n");
  }

  spawnDockerLogs(projectId: string): ChildProcess | null {
    const project = this.listProjects().find((p) => p.id === projectId);
    if (!project || project.runtime !== "docker") return null;
    const cwd = resolveProjectPath(project);
    return spawn("docker", ["compose", "logs", "-f", "--tail", "150"], {
      cwd,
      env: process.env,
    });
  }
}

export const manager = new ProjectManager();
