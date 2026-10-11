import React, { useState } from "react";
import {
  Loader2,
  Square,
  Pause,
  ChevronDown,
  ChevronUp,
  FileCode,
  FilePlus,
  FileEdit,
  Trash2,
  Info,
} from "lucide-react";

export type WorkLogItem = {
  id: string;
  kind: string;
  label: string;
  detail?: string | null;
  created_at: string;
  run_id?: string | null;
  step_idx?: number | null;
};

interface ActiveStepBannerProps {
  currentStepTitle?: string;
  currentStepIdx?: number | null;
  totalSteps?: number;
  latestStatus?: string | null;
  logs: WorkLogItem[];
  runId?: string | null;
  onStop: () => void;
  onPause?: () => void;
  isStopping?: boolean;
}

export function ActiveStepBanner({
  currentStepTitle,
  currentStepIdx,
  totalSteps,
  latestStatus,
  logs,
  runId,
  onStop,
  onPause,
  isStopping = false,
}: ActiveStepBannerProps) {
  const [logsExpanded, setLogsExpanded] = useState(false);

  // Filter logs for this run/step
  const stepLogs = logs.filter((l) => {
    if (runId && l.run_id && l.run_id !== runId) return false;
    if (
      currentStepIdx !== null &&
      currentStepIdx !== undefined &&
      l.step_idx !== null &&
      l.step_idx !== undefined
    ) {
      return l.step_idx === currentStepIdx;
    }
    return true;
  });

  return (
    <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary" />
          <div className="truncate">
            <div className="font-semibold text-foreground">
              {currentStepIdx !== null && currentStepIdx !== undefined && totalSteps
                ? `Step ${currentStepIdx + 1} of ${totalSteps}: `
                : "Building: "}
              <span className="font-medium text-foreground/90">
                {currentStepTitle || "Executing build plan..."}
              </span>
            </div>
            {latestStatus && (
              <div className="text-[11px] text-primary/90 truncate">{latestStatus}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setLogsExpanded(!logsExpanded)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary/60"
            title="Toggle live logs"
          >
            <span>{stepLogs.length} updates</span>
            {logsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {onPause && (
            <button
              onClick={onPause}
              disabled={isStopping}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
              title="Pause build execution"
            >
              <Pause className="h-3 w-3 fill-current" /> Pause
            </button>
          )}

          <button
            onClick={onStop}
            disabled={isStopping}
            className="inline-flex items-center gap-1 rounded-lg bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/25 disabled:opacity-50 transition-colors"
            title="Stop build execution"
          >
            <Square className="h-3 w-3 fill-current" /> Stop
          </button>
        </div>
      </div>

      {logsExpanded && (
        <div className="mt-2.5 max-h-40 overflow-y-auto rounded-lg border border-border/40 bg-background/60 p-2 font-mono text-[11px]">
          {stepLogs.length === 0 ? (
            <div className="text-muted-foreground">Waiting for activity...</div>
          ) : (
            <div className="space-y-1">
              {stepLogs.slice(-15).map((l) => (
                <div key={l.id} className="flex items-start gap-1.5 leading-tight">
                  <span className="mt-0.5 flex-shrink-0">
                    {l.kind === "created" ? (
                      <FilePlus className="h-3 w-3 text-emerald-400" />
                    ) : l.kind === "edited" ? (
                      <FileEdit className="h-3 w-3 text-amber-400" />
                    ) : l.kind === "deleted" ? (
                      <Trash2 className="h-3 w-3 text-destructive" />
                    ) : (
                      <Info className="h-3 w-3 text-fuchsia-400" />
                    )}
                  </span>
                  <span className="text-foreground/90">{l.label}</span>
                  {l.detail && <span className="text-muted-foreground truncate">— {l.detail}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
