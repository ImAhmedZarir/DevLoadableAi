import React, { useRef, useState, useEffect } from "react";
import { FileText, ChevronDown, ChevronUp, ArrowDown } from "lucide-react";
import { MessageList, type MessageItem, type RunItem } from "@/components/builder/MessageList";
import {
  Composer,
  type BuilderMode,
  type ModelProvider,
  type AttachedFile,
} from "@/components/builder/Composer";
import { ActiveStepBanner, type WorkLogItem } from "@/components/builder/ActiveStepBanner";
import { ResumeBanner } from "@/components/builder/ResumeBanner";
import type { StepItem } from "@/components/builder/PlanCard";

interface ChatPanelProps {
  projectNotes?: string | null;
  messages: MessageItem[];
  runs: RunItem[];
  steps: StepItem[];
  logs: WorkLogItem[];
  activeRunId: string | null;
  currentStepIdx: number | null;
  latestStatus: string | null;
  isBusy: boolean;
  isStopping: boolean;
  incompleteRun: RunItem | null;
  incompleteRunSteps: StepItem[];
  completedStepCount: number;
  showResumeBanner: boolean;
  onDismissResumeBanner: () => void;
  onResumeBuild: () => void;
  onStopBuild: () => void;
  onPauseBuild?: () => void;
  input: string;
  onInputChange: (val: string) => void;
  onSend: (
    text?: string,
    m?: BuilderMode,
    p?: ModelProvider,
    kind?: "user" | "autofix",
    parentRunId?: string,
    customLabel?: string,
    displayText?: string,
  ) => void;
  mode: BuilderMode;
  onModeChange: (m: BuilderMode) => void;
  provider: ModelProvider;
  onProviderChange: (p: ModelProvider) => void;
  attachedFiles?: AttachedFile[];
  onFileAttach?: (file: AttachedFile) => void;
  onFileRemove?: (index: number) => void;
  onClearFiles?: () => void;
  onZipImport?: (files: Array<{ path: string; content: string }>, zipName: string) => Promise<void>;
  onExecutePlan: (runId: string) => void;
  onRetryStep: (runId: string, idx: number) => void;
  onSkipStep: (runId: string, idx: number) => void;
  onOpenFile?: (path: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoFixEnabled?: boolean;
  onAutoFixChange?: (enabled: boolean) => void;
}

export function ChatPanel({
  projectNotes,
  messages,
  runs,
  steps,
  logs,
  activeRunId,
  currentStepIdx,
  latestStatus,
  isBusy,
  isStopping,
  incompleteRun,
  incompleteRunSteps,
  completedStepCount,
  showResumeBanner,
  onDismissResumeBanner,
  onResumeBuild,
  onStopBuild,
  onPauseBuild,
  input,
  onInputChange,
  onSend,
  mode,
  onModeChange,
  provider,
  onProviderChange,
  attachedFiles,
  onFileAttach,
  onFileRemove,
  onClearFiles,
  onZipImport,
  onExecutePlan,
  onRetryStep,
  onSkipStep,
  onOpenFile,
  onFileUpload,
  autoFixEnabled = true,
  onAutoFixChange,
}: ChatPanelProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowJumpToBottom(distanceFromBottom > 160);
  };

  const scrollToBottom = (smooth = true) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  useEffect(() => {
    if (!showJumpToBottom) {
      scrollToBottom(false);
    }
  }, [messages, logs, isBusy]);

  const activeStep = React.useMemo(() => {
    if (currentStepIdx === null || currentStepIdx === undefined) return null;
    return steps.find(
      (s) => s.run_id === (activeRunId || incompleteRun?.id) && s.idx === currentStepIdx,
    );
  }, [steps, activeRunId, incompleteRun, currentStepIdx]);

  return (
    <div className="relative flex h-full flex-col bg-background overflow-hidden">
      {/* Collapsible Project Notes (neutral colors, collapsed by default) */}
      {projectNotes && (
        <div className="border-b border-border/80 bg-secondary/30">
          <button
            type="button"
            onClick={() => setShowNotes(!showNotes)}
            className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span>Project notes</span>
            </div>
            {showNotes ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {showNotes && (
            <div className="border-t border-border/60 bg-secondary/20 px-4 py-3 text-xs">
              <pre className="whitespace-pre-wrap font-sans text-muted-foreground leading-relaxed max-h-48 overflow-y-auto">
                {projectNotes}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
      >
        {/* Resume banner for unfinished run */}
        {incompleteRun && !isBusy && showResumeBanner && (
          <ResumeBanner
            completedSteps={completedStepCount}
            totalSteps={incompleteRunSteps.length}
            onResume={onResumeBuild}
            onDismiss={onDismissResumeBanner}
            isResuming={isBusy}
          />
        )}

        {/* Active step banner with Stop button */}
        {isBusy && (
          <ActiveStepBanner
            currentStepTitle={activeStep?.title}
            currentStepIdx={currentStepIdx}
            totalSteps={
              steps.filter((s) => s.run_id === (activeRunId || incompleteRun?.id)).length ||
              undefined
            }
            latestStatus={latestStatus}
            logs={logs}
            runId={activeRunId || incompleteRun?.id}
            onStop={onStopBuild}
            onPause={onPauseBuild}
            isStopping={isStopping}
          />
        )}

        {/* Messages List */}
        <MessageList
          messages={messages}
          runs={runs}
          steps={steps}
          logs={logs}
          activeRunId={activeRunId}
          currentStepIdx={currentStepIdx}
          latestStatus={latestStatus}
          isBusy={isBusy}
          onSend={(text, displayText) =>
            onSend(text, undefined, undefined, undefined, undefined, undefined, displayText)
          }
          onExecutePlan={onExecutePlan}
          onRetryStep={onRetryStep}
          onSkipStep={onSkipStep}
          onOpenFile={onOpenFile}
          onStarterClick={(p) => {
            onInputChange(p);
          }}
        />
      </div>

      {/* Floating Jump to latest button */}
      {showJumpToBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-floating backdrop-blur hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          <span>Jump to latest</span>
        </button>
      )}

      {/* Floating Composer at bottom */}
      <div className="shrink-0 p-3 border-t border-border/40 bg-background/60 backdrop-blur-sm">
        <Composer
          input={input}
          onInputChange={onInputChange}
          onSend={() => onSend()}
          onStop={onStopBuild}
          onPause={onPauseBuild}
          isBusy={isBusy}
          mode={mode}
          onModeChange={onModeChange}
          provider={provider}
          onProviderChange={onProviderChange}
          attachedFiles={attachedFiles}
          onFileAttach={onFileAttach}
          onFileRemove={onFileRemove}
          onClearFiles={onClearFiles}
          onFileUpload={onFileUpload}
          onZipImport={onZipImport}
          autoFixEnabled={autoFixEnabled}
          onAutoFixChange={onAutoFixChange}
        />
      </div>
    </div>
  );
}
