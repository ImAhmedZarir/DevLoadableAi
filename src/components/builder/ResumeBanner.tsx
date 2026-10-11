import React from "react";
import { Play, AlertCircle, X } from "lucide-react";

interface ResumeBannerProps {
  completedSteps: number;
  totalSteps: number;
  onResume: () => void;
  onDismiss: () => void;
  isResuming?: boolean;
}

export function ResumeBanner({
  completedSteps,
  totalSteps,
  onResume,
  onDismiss,
  isResuming = false,
}: ResumeBannerProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 overflow-hidden">
        <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-500" />
        <div className="truncate text-foreground">
          <span className="font-semibold text-amber-500">Unfinished build detected: </span>
          <span>
            {completedSteps} of {totalSteps} steps completed. Resume from next step?
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onResume}
          disabled={isResuming}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-50"
        >
          <Play className="h-3 w-3 fill-current" /> Resume build
        </button>
        <button
          onClick={onDismiss}
          className="rounded-lg p-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
