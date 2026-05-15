import {
  Button,
  Pane,
  cn,
} from "@cyberdeck/ui";
import { Cpu, ExternalLink, HardDrive, Play, Square } from "lucide-react";
import type { Project } from "../api";
import { formatUptime } from "../api";
import { StatusBadge } from "./StatusBadge";

type ProjectCardProps = {
  project: Project;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onStart: () => void;
  onStop: () => void;
};

export function ProjectCard({
  project,
  selected,
  busy,
  onSelect,
  onStart,
  onStop,
}: ProjectCardProps) {
  const isUp = project.status === "up";
  const canStart = project.status === "down" || project.status === "error";
  const canStop =
    project.status === "up" ||
    project.status === "starting" ||
    project.status === "stopping";

  return (
    <Pane
      className={cn(
        "hover-lift cursor-pointer bg-card",
        selected && "glow-breathe neon-edge",
      )}
      contentClassName="p-0"
      onClick={onSelect}
    >
      <div className="flex gap-4 p-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          <img
            src={project.image}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <h2 className="truncate font-mono text-sm uppercase tracking-wider text-foreground">
              {project.name}
            </h2>
            <StatusBadge status={project.status} />
          </div>
          <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
            {project.description}
          </p>
          <div className="flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Cpu size={12} className="text-accent" />
              {project.metrics.cpuPercent}%
            </span>
            <span className="inline-flex items-center gap-1">
              <HardDrive size={12} className="text-primary" />
              {project.metrics.memoryMb} MB
            </span>
            <span>uptime {formatUptime(project.uptimeMs)}</span>
            <span>:{project.port}</span>
          </div>
        </div>
      </div>
      <div
        className="flex items-center justify-between gap-2 border-t border-border px-4 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="tactile"
            disabled={busy || !canStart}
            onClick={onStart}
          >
            <Play size={14} />
            Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !canStop}
            onClick={onStop}
          >
            <Square size={14} />
            Stop
          </Button>
        </div>
        {isUp ? (
          <a
            href={project.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
          >
            Open
            <ExternalLink size={12} />
          </a>
        ) : null}
      </div>
    </Pane>
  );
}
