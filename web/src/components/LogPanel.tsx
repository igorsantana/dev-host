import { Pane, ScrollArea, cn } from "@cyberdeck/ui";
import { useEffect, useRef, useState } from "react";
import type { Project } from "../api";
import { fetchLogs } from "../api";

export function LogPanel({
  project,
  className,
}: {
  project: Project | null;
  className?: string;
}) {
  const [logs, setLogs] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project) {
      setLogs("");
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const text = await fetchLogs(project.id);
        if (!cancelled) setLogs(text);
      } catch {
        if (!cancelled) setLogs("(Failed to load logs)");
      }
    };

    void load();

    const es = new EventSource(`/api/projects/${project.id}/logs/stream`);
    es.onmessage = (ev) => {
      try {
        const { line } = JSON.parse(ev.data) as { line: string };
        setLogs((prev) => (prev ? `${prev}\n${line}` : line));
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
    };

    const poll = setInterval(() => void load(), 8000);

    return () => {
      cancelled = true;
      es.close();
      clearInterval(poll);
    };
  }, [project?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <Pane
      className={cn("animate-fade-in flex min-h-0 flex-col bg-card", className)}
      header={
        <span className="font-mono text-xs uppercase tracking-widest text-foreground/80">
          {project ? `Logs · ${project.name}` : "Logs"}
        </span>
      }
      contentClassName="min-h-0 flex-1 p-0"
    >
      <ScrollArea className="h-[min(420px,40vh)] w-full">
        <pre className="whitespace-pre-wrap break-all p-4 font-mono text-[11px] leading-relaxed text-foreground/90">
          {project
            ? logs || "(Waiting for output…)"
            : "Select a project to view logs."}
          <div ref={bottomRef} />
        </pre>
      </ScrollArea>
    </Pane>
  );
}
