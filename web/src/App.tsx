import { AppShell, Toolbar } from "@cyberdeck/ui";
import { RefreshCw, Terminal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  fetchProjects,
  startProject,
  stopProject,
  type Project,
} from "./api";
import { LogPanel } from "./components/LogPanel";
import { ProjectCard } from "./components/ProjectCard";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchProjects();
      setProjects(list);
      setError(null);
      setSelectedId((cur) => cur ?? list[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  const handleStart = async (id: string) => {
    setBusyId(id);
    try {
      await startProject(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleStop = async (id: string) => {
    setBusyId(id);
    try {
      await stopProject(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell
      toolbar={
        <Toolbar
          className="scanline"
          title="Dev Host"
          actions={
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-accent hover:text-accent/80"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          }
        >
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Terminal size={14} />
            development workspace
          </span>
        </Toolbar>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="animate-stagger-in grid min-h-0 flex-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              selected={project.id === selectedId}
              busy={busyId === project.id}
              onSelect={() => setSelectedId(project.id)}
              onStart={() => void handleStart(project.id)}
              onStop={() => void handleStop(project.id)}
            />
          ))}
        </div>

        <LogPanel project={selected} />
      </div>
    </AppShell>
  );
}
