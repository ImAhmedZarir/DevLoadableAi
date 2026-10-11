import React from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  SkipForward,
  Play,
  RotateCw,
} from "lucide-react";

export type StepItem = {
  id: string;
  run_id: string;
  idx: number;
  title: string;
  description: string;
  status: string; // 'pending' | 'running' | 'done' | 'error' | 'skipped'
  summary?: string | null;
};

interface PlanCardProps {
  intro: string;
  runId: string;
  runStatus?: string; // 'planning' | 'planned' | 'running' | 'waiting' | 'done' | 'error' | 'cancelled'
  steps: StepItem[];
  currentStepIdx?: number | null;
  onExecutePlan?: (runId: string) => void;
  onRetryStep?: (runId: string, idx: number) => void;
  onSkipStep?: (runId: string, idx: number) => void;
  isExecuting?: boolean;
}

export function PlanCard({
  intro,
  runId,
  runStatus,
  steps,
  currentStepIdx,
  onExecutePlan,
  onRetryStep,
  onSkipStep,
  isExecuting = false,
}: PlanCardProps) {
  const isPlanned = runStatus === "planned";

  return (
    <div className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-3 text-sm text-foreground/90">{intro}</div>

      <div className="space-y-2">
        {steps.map((step) => {
          const isCurrent = currentStepIdx === step.idx || step.status === "running";
          const isDone = step.status === "done";
          const isError = step.status === "error";
          const isSkipped = step.status === "skipped";
          const isPending = step.status === "pending" && !isCurrent;

          return (
            <div
              key={step.id || step.idx}
              className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors ${
                isCurrent
                  ? "border-primary/50 bg-primary/5"
                  : isDone
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : isError
                      ? "border-destructive/30 bg-destructive/5"
                      : isSkipped
                        ? "border-border/40 bg-muted/20 opacity-60"
                        : "border-border/50 bg-background/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex-shrink-0">
                    {isCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : isError ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : isSkipped ? (
                      <SkipForward className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground/60" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        #{step.idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-foreground">{step.title}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isError && (
                    <>
                      {onRetryStep && (
                        <button
                          onClick={() => onRetryStep(runId, step.idx)}
                          disabled={isExecuting}
                          className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-secondary/80 disabled:opacity-50"
                        >
                          <RotateCw className="h-3 w-3" /> Retry
                        </button>
                      )}
                      {onSkipStep && (
                        <button
                          onClick={() => onSkipStep(runId, step.idx)}
                          disabled={isExecuting}
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <SkipForward className="h-3 w-3" /> Skip
                        </button>
                      )}
                    </>
                  )}
                  {isDone && (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400">
                      Done
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                      Running
                    </span>
                  )}
                </div>
              </div>

              {step.summary && (
                <div className="mt-1 border-t border-border/30 pt-1 text-[11px] text-muted-foreground italic">
                  {step.summary}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isPlanned && onExecutePlan && (
        <div className="mt-4 flex items-center justify-end">
          <button
            onClick={() => onExecutePlan(runId)}
            disabled={isExecuting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-rose-500 px-4 py-2 text-xs font-medium text-white shadow hover:opacity-95 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5 fill-current" /> Build this plan
          </button>
        </div>
      )}
    </div>
  );
}
