import cors from "cors";
import express from "express";
import { loadConfig } from "./config.js";
import { manager } from "./manager.js";

const cfg = loadConfig();
const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/projects", async (_req, res) => {
  const projects = manager.listProjects();
  const runtimes = await Promise.all(
    projects.map(async (p) => {
      const runtime = await manager.getRuntime(p);
      return {
        ...p,
        ...runtime,
      };
    }),
  );
  res.json({ projects: runtimes });
});

app.post("/api/projects/:id/start", async (req, res) => {
  try {
    const runtime = await manager.start(req.params.id);
    res.json(runtime);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/projects/:id/stop", async (req, res) => {
  try {
    const runtime = await manager.stop(req.params.id);
    res.json(runtime);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/api/projects/:id/logs", (req, res) => {
  const tail = Number(req.query.tail ?? 300);
  res.json({ logs: manager.readLogs(req.params.id, tail) });
});

app.get("/api/projects/:id/logs/stream", (req, res) => {
  const project = manager.listProjects().find((p) => p.id === req.params.id);
  if (!project) {
    res.status(404).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (line: string) => {
    res.write(`data: ${JSON.stringify({ line })}\n\n`);
  };

  if (project.runtime === "docker") {
    const child = manager.spawnDockerLogs(req.params.id);
    if (!child) {
      send("Failed to attach to docker logs");
      res.end();
      return;
    }

    child.stdout?.on("data", (chunk) => {
      chunk
        .toString()
        .split("\n")
        .filter(Boolean)
        .forEach((line: string) => send(line));
    });
    child.stderr?.on("data", (chunk) => {
      chunk
        .toString()
        .split("\n")
        .filter(Boolean)
        .forEach((line: string) => send(line));
    });

    req.on("close", () => {
      child.kill("SIGTERM");
    });
    return;
  }

  const tail = manager.readLogs(req.params.id, 200);
  if (tail) {
    tail.split("\n").forEach((line) => send(line));
  }

  const interval = setInterval(() => {
    const chunk = manager.readLogs(req.params.id, 40);
    const lines = chunk.split("\n").slice(-5);
    lines.filter(Boolean).forEach((line) => send(line));
  }, 2000);

  req.on("close", () => clearInterval(interval));
});

const port = cfg.hostPort;
app.listen(port, () => {
  console.log(`dev-host API listening on http://localhost:${port}`);
});
