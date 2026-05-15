import { Badge, cn } from "@cyberdeck/ui";
import type { ProjectStatus } from "../api";

const LABELS: Record<ProjectStatus, string> = {
  down: "Down",
  starting: "Starting",
  up: "Up",
  stopping: "Stopping",
  error: "Error",
};

const STYLES: Record<ProjectStatus, string> = {
  down: "text-muted-foreground border-border",
  starting: "pulse-soft text-accent border-accent/40 bg-accent/10",
  up: "text-primary border-primary/40 bg-primary/10",
  stopping: "text-muted-foreground border-border animate-pulse",
  error: "text-destructive border-destructive/40 bg-destructive/10",
};

export function StatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-mono text-[10px] uppercase tracking-widest", STYLES[status], className)}
    >
      {LABELS[status]}
    </Badge>
  );
}
