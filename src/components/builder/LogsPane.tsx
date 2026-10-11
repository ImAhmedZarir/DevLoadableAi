import React, { useState, useMemo } from "react";
import {
  FilePlus,
  FileEdit,
  Trash2,
  Info,
  XCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ListFilter,
} from "lucide-react";
import type { WorkLogItem } from "@/components/builder/ActiveStepBanner";

interface LogsPaneProps {
  logs: WorkLogItem[];
}

type FilterChip = "all" | "files" | "status" | "errors";

export function LogsPane({ logs }: LogsPaneProps) {
  const [filter, setFilter] = useState<FilterChip>("all");
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleLogs = useMemo(() => {
    let list = logs;
    if (clearedAt) {
      list = list.filter((l) => l.created_at > clearedAt);
    }

    if (filter === "files") {
      list = list.filter(
        (l) => l.kind === "created" || l.kind === "edited" || l.kind === "deleted",
      );
    } else if (filter === "status") {
      list = list.filter((l) => l.kind === "status");
    } else if (filter === "errors") {
      list = list.filter((l) => l.kind === "error");
    }

    return list;
  }, [logs, clearedAt, filter]);

  const clearView = () => {
    setClearedAt(new Date().toISOString());
  };

  const resetView = () => {
    setClearedAt(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top filter chips and Clear view action */}
      <div className="flex items-center justify-between border-b border-border/80 bg-card/30 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <ListFilter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
          {(["all", "files", "status", "errors"] as const).map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setFilter(chip)}
              className={`rounded-full px-2.5 py-0.5 text-xs capitalize transition-colors ${
                filter === chip
                  ? "bg-secondary text-foreground font-medium border border-border"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {clearedAt && (
            <button
              type="button"
              onClick={resetView}
              className="text-xs text-brand hover:underline"
            >
              Restore view
            </button>
          )}
          <button
            type="button"
            onClick={clearView}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Clear view</span>
          </button>
        </div>
      </div>

      {/* Timeline list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
        {visibleLogs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {clearedAt ? "View cleared. Activity will appear here." : "No logs recorded yet."}
          </div>
        ) : (
          visibleLogs.map((l) => {
            const isError = l.kind === "error";
            const isCreated = l.kind === "created";
            const isEdited = l.kind === "edited";
            const isDeleted = l.kind === "deleted";
            const isStatus = l.kind === "status";
            const isExpanded = expandedRows.has(l.id);

            return (
              <div
                key={l.id}
                className="rounded-lg border border-border/40 bg-card/30 p-2.5 transition-colors hover:bg-card/60"
              >
                <div
                  className="flex items-start justify-between gap-3 cursor-pointer select-none"
                  onClick={() => l.detail && toggleRow(l.id)}
                >
                  <div className="flex items-start gap-2.5 overflow-hidden">
                    {/* Kind Icon */}
                    <span className="mt-0.5 flex-shrink-0">
                      {isError ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : isCreated ? (
                        <FilePlus className="h-4 w-4 text-emerald-400" />
                      ) : isEdited ? (
                        <FileEdit className="h-4 w-4 text-amber-400" />
                      ) : isDeleted ? (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      ) : isStatus ? (
                        <Info className="h-4 w-4 text-sky-400" />
                      ) : (
                        <Info className="h-4 w-4 text-brand" />
                      )}
                    </span>

                    {/* Label & Step */}
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        {l.step_idx !== null && l.step_idx !== undefined && (
                          <span className="rounded bg-secondary px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground">
                            Step #{l.step_idx + 1}
                          </span>
                        )}
                        <span
                          className={`font-semibold uppercase tracking-wider text-[10px] ${
                            isError
                              ? "text-destructive"
                              : isCreated
                                ? "text-emerald-400"
                                : isEdited
                                  ? "text-amber-400"
                                  : isDeleted
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                          }`}
                        >
                          {l.kind}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-foreground/90 leading-tight">{l.label}</div>
                    </div>
                  </div>

                  {/* Right side: Relative Time & Expand toggle */}
                  <div className="flex items-center gap-2 flex-shrink-0 text-muted-foreground">
                    <span className="text-[11px]">
                      {new Date(l.created_at).toLocaleTimeString()}
                    </span>
                    {l.detail && (
                      <span className="p-0.5">
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Monospace detail text collapsed under each row */}
                {isExpanded && l.detail && (
                  <div className="mt-2 rounded border border-border/30 bg-background/60 p-2 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {l.detail}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
