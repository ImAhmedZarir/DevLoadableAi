import React, { useState } from "react";
import {
  Circle,
  CheckCircle2,
  XCircle,
  Minus,
  Loader2,
  HelpCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Clock,
  Send,
  Sparkles,
  Copy,
  Check,
  Code,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import type { StepItem } from "@/components/builder/PlanCard";
import type { WorkLogItem } from "@/components/builder/ActiveStepBanner";

export type MessageItem = {
  id: string;
  role: string;
  content: string;
  kind?: string;
  meta?: Record<string, unknown> | null;
  created_at: string;
};

export type RunItem = {
  id: string;
  project_id: string;
  prompt: string;
  mode: string;
  status: string;
  kind?: string | null;
  error?: string | null;
  created_at: string;
  finished_at?: string | null;
};

interface MessageListProps {
  messages: MessageItem[];
  runs: RunItem[];
  steps: StepItem[];
  logs: WorkLogItem[];
  activeRunId: string | null;
  currentStepIdx: number | null;
  latestStatus: string | null;
  isBusy: boolean;
  onSend: (text: string, displayText?: string) => void;
  onExecutePlan: (runId: string) => void;
  onRetryStep: (runId: string, idx: number) => void;
  onSkipStep: (runId: string, idx: number) => void;
  onOpenFile?: (path: string) => void;
  onStarterClick: (prompt: string) => void;
}

const STARTER_PROMPTS = [
  {
    title: "Coffee shop landing page",
    desc: "Modern hero, menu cards, beans section",
    prompt:
      "Build a sleek coffee roaster and cafe website with a hero section, specialty beans catalogue, and contact info",
  },
  {
    title: "Kanban task board",
    desc: "Drag-drop tasks, column counts, tags",
    prompt:
      "Create an interactive Kanban board app with To Do, In Progress, Done columns and add task modal",
  },
  {
    title: "Photographer portfolio",
    desc: "Masonry photo gallery, about, inquiry form",
    prompt:
      "Build an elegant dark portfolio for an editorial photographer with image grid, client list, and contact modal",
  },
  {
    title: "Pomodoro productivity timer",
    desc: "Focus timer, break cycles, sound alert",
    prompt:
      "Build a clean Pomodoro timer with 25/5 cycles, sound alerts, task list, and streak tracking",
  },
];

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard fail
    }
  };

  const displayLang = language ? language.toUpperCase() : "CODE";

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-white/10 bg-[#0d0d12] shadow-sm">
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground/80">
          {displayLang}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed text-foreground/90 selection:bg-brand-from/30">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderMarkdownRich(text: string) {
  // Split on code fences: ```lang\ncode\n```
  const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      parts.push(renderTextBlocks(textBefore, `tb-${lastIndex}`));
    }
    const lang = match[1] || "";
    const code = match[2];
    parts.push(<CodeBlock key={`cb-${match.index}`} code={code} language={lang} />);
    lastIndex = fenceRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(renderTextBlocks(text.slice(lastIndex), `tb-${lastIndex}`));
  }

  return <div className="space-y-1.5 text-foreground leading-relaxed">{parts}</div>;
}

function renderTextBlocks(text: string, keyPrefix: string): React.ReactNode {
  const lines = text.split("\n");
  return (
    <div key={keyPrefix} className="space-y-1">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Headings
        if (line.startsWith("### ")) {
          return (
            <h4 key={idx} className="pt-2 text-sm font-semibold text-foreground tracking-tight">
              {formatInline(line.slice(4))}
            </h4>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h3 key={idx} className="pt-2.5 text-base font-semibold text-foreground tracking-tight">
              {formatInline(line.slice(3))}
            </h3>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <h2 key={idx} className="pt-3 text-lg font-bold text-foreground tracking-tight">
              {formatInline(line.slice(2))}
            </h2>
          );
        }

        // Blockquotes
        if (line.startsWith("> ")) {
          return (
            <blockquote
              key={idx}
              className="border-l-2 border-brand-from/60 pl-3 italic text-muted-foreground text-sm"
            >
              {formatInline(line.slice(2))}
            </blockquote>
          );
        }

        // Bullets
        const bulletMatch = line.match(/^(\*|-)\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-1 text-sm leading-relaxed">
              <span className="text-brand-from select-none mt-1 text-[10px]">●</span>
              <span>{formatInline(bulletMatch[2])}</span>
            </div>
          );
        }

        // Numbered list
        const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-1 text-sm leading-relaxed">
              <span className="font-mono text-xs text-muted-foreground select-none">
                {numMatch[1]}.
              </span>
              <span>{formatInline(numMatch[2])}</span>
            </div>
          );
        }

        return (
          <p key={idx} className="text-sm leading-relaxed text-foreground/90">
            {formatInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function formatInline(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-secondary/90 px-1.5 py-0.5 font-mono text-[12.5px] text-brand-to font-normal border border-white/5"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function formatDuration(start: string, end?: string | null): string {
  if (!end) return "a moment";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

function MessageCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard fail
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy message"
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-400" />
          <span className="text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

export function MessageList({
  messages,
  runs,
  steps,
  logs,
  activeRunId,
  currentStepIdx,
  latestStatus,
  isBusy,
  onSend,
  onExecutePlan,
  onRetryStep,
  onSkipStep,
  onOpenFile,
  onStarterClick,
}: MessageListProps) {
  const [customAnswer, setCustomAnswer] = useState<Record<string, string>>({});
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  const toggleRunLogs = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  // Empty state: completely clean without suggested prompts
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="space-y-5 px-1 py-2">
      {messages.map((m) => {
        const isUser = m.role === "user";
        const isQuestion = m.kind === "question";
        const isPlan = m.kind === "plan";
        const options: string[] =
          isQuestion && Array.isArray(m.meta?.options) ? m.meta.options : [];
        const planRunId =
          isPlan && typeof m.meta?.runId === "string" ? m.meta.runId : null;

        // User message: right-aligned bubble, bg-secondary, rounded-2xl rounded-br-md, max-w 85%
        if (isUser) {
          const isAutofix = m.kind === "autofix" || m.meta?.kind === "autofix";
          const label = (m.meta?.label as string) || (m.meta?.customLabel as string);
          const attachedFiles = (m.meta?.attachedFiles as string[]) || [];

          return (
            <div key={m.id} className="group flex justify-end items-start gap-2">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity pt-2">
                <MessageCopyButton content={m.content} />
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-sm text-foreground shadow-sm">
                {isAutofix && (
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                      Auto-fix
                    </span>
                  </div>
                )}
                {label && !isAutofix && (
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                      {label}
                    </span>
                  </div>
                )}
                {attachedFiles.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {attachedFiles.map((fn, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded bg-background/60 border border-white/10 px-2 py-0.5 text-[11px] text-muted-foreground font-medium"
                      >
                        <FileText className="h-3 w-3 text-zinc-400" />
                        <span className="truncate max-w-[160px]">{fn}</span>
                      </span>
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              </div>
            </div>
          );
        }

        // Plan message card: 14px radius, bg-card
        if (isPlan && planRunId) {
          const runObj = runs.find((r) => r.id === planRunId);
          const runSteps = steps.filter((s) => s.run_id === planRunId);
          const doneSteps = runSteps.filter((s) => s.status === "done").length;
          const totalSteps = runSteps.length || 1;
          const progressPercent = Math.round((doneSteps / totalSteps) * 100);
          const isPlanned = runObj?.status === "planned";

          return (
            <div key={m.id} className="w-full">
              <div className="rounded-[14px] border border-border/80 bg-card p-4 shadow-sm">
                {/* Plan Header */}
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                      Plan
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {doneSteps} of {runSteps.length} done
                    </span>
                  </div>
                  {isPlanned && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onExecutePlan(planRunId)}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-gradient px-3 py-1 text-xs font-medium text-white shadow hover:opacity-90 disabled:opacity-50"
                    >
                      Build this plan
                    </button>
                  )}
                </div>

                {/* Thin progress bar in brand gradient */}
                <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-brand-gradient transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Step rows (approx 40px high) */}
                <div className="space-y-1.5 divide-y divide-border/20">
                  {runSteps.map((step) => {
                    const isRunning =
                      step.status === "running" ||
                      (activeRunId === planRunId && currentStepIdx === step.idx);
                    const isDone = step.status === "done";
                    const isError = step.status === "error";
                    const isSkipped = step.status === "skipped";

                    // File chips associated with this step
                    const stepLogs = logs.filter(
                      (l) =>
                        l.run_id === planRunId &&
                        l.step_idx === step.idx &&
                        (l.kind === "created" || l.kind === "edited"),
                    );

                    return (
                      <div key={step.id || step.idx} className="pt-2 first:pt-0">
                        <div className="flex items-start justify-between gap-3 min-h-[40px]">
                          <div className="flex items-start gap-2.5 overflow-hidden">
                            {/* Status Icon */}
                            <div className="mt-0.5 flex-shrink-0">
                              {isRunning ? (
                                <Loader2 className="h-4 w-4 animate-spin text-brand" />
                              ) : isDone ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                              ) : isError ? (
                                <XCircle className="h-4 w-4 text-destructive" />
                              ) : isSkipped ? (
                                <Minus className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground/40" />
                              )}
                            </div>

                            <div className="truncate">
                              <div
                                className={`text-sm font-medium ${
                                  isRunning
                                    ? "text-white font-semibold"
                                    : isDone
                                      ? "text-foreground"
                                      : "text-foreground/90"
                                }`}
                              >
                                {step.title}
                              </div>
                              <div className="text-[12px] text-muted-foreground truncate">
                                {step.description}
                              </div>

                              {/* Latest status in Geist Mono for running step */}
                              {isRunning && latestStatus && (
                                <div className="mt-1 font-mono text-[12px] text-muted-foreground italic truncate">
                                  ↳ {latestStatus}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Step Actions */}
                          {isError && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => onRetryStep(planRunId, step.idx)}
                                className="text-xs font-medium text-foreground hover:underline disabled:opacity-50"
                              >
                                Retry
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => onSkipStep(planRunId, step.idx)}
                                className="text-xs font-medium text-muted-foreground hover:underline disabled:opacity-50"
                              >
                                Skip
                              </button>
                            </div>
                          )}
                        </div>

                        {/* File chips under the step */}
                        {stepLogs.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1 pl-6">
                            {stepLogs.map((log) => {
                              const match = log.label.match(/(?:Created|Edited)\s+(.+)/i);
                              const filePath = match ? match[1].trim() : log.label;
                              return (
                                <button
                                  key={log.id}
                                  type="button"
                                  onClick={() => onOpenFile?.(filePath)}
                                  className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:border-white/30 hover:text-foreground transition-colors"
                                  title={`Open ${filePath} in Code tab`}
                                >
                                  <FileText className="h-3 w-3 text-muted-foreground" />
                                  <span>{filePath}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* After run: collapsed "Worked for 38s · 6 files" row */}
              {runObj?.status === "done" && (
                <div className="mt-2 rounded-xl border border-border/60 bg-secondary/20 p-2.5 text-xs">
                  <button
                    type="button"
                    onClick={() => toggleRunLogs(planRunId)}
                    className="flex w-full items-center justify-between text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <Clock className="h-3.5 w-3.5 text-emerald-400" />
                      <span>
                        Worked for {formatDuration(runObj.created_at, runObj.finished_at)} ·{" "}
                        {
                          new Set(
                            logs
                              .filter(
                                (l) =>
                                  l.run_id === planRunId &&
                                  (l.kind === "created" || l.kind === "edited"),
                              )
                              .map((l) => l.label),
                          ).size
                        }{" "}
                        files
                      </span>
                    </span>
                    {expandedRuns.has(planRunId) ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {expandedRuns.has(planRunId) && (
                    <div className="mt-2 space-y-1 border-t border-border/30 pt-2 font-mono text-[11px] max-h-40 overflow-y-auto">
                      {logs
                        .filter((l) => l.run_id === planRunId)
                        .map((l) => (
                          <div key={l.id} className="text-muted-foreground truncate">
                            <span className="text-foreground/80">[{l.kind}]</span> {l.label}
                            {l.detail && <span className="opacity-60"> — {l.detail}</span>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }

        // Question message: card with help icon, question, options + custom input
        if (isQuestion) {
          const handleAnswerQuestion = (answer: string) => {
            // Find prior user prompt in message history that led to this question
            const priorUserMsg = [...messages]
              .filter((msg) => msg.role === "user" && msg.content && !msg.content.startsWith("Clarification choice:"))
              .pop();

            const priorContext = priorUserMsg?.content
              ? `Original User Request: "${priorUserMsg.content}"\n`
              : "";

            const contextualPrompt = `${priorContext}Clarification Question: "${m.content}"\nUser Selected Answer: "${answer}"\n\nInstructions: Proceed to plan and build the project fulfilling the user's original request with this specified choice.`;

            onSend(contextualPrompt, answer);
          };

          return (
            <div key={m.id} className="w-full">
              <div className="rounded-[14px] border border-amber-500/30 bg-card p-4 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 grid h-6 w-6 place-items-center rounded-lg bg-amber-500/10 text-amber-400 flex-shrink-0">
                    <HelpCircle className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="text-sm font-medium text-foreground leading-relaxed">
                      {m.content}
                    </div>

                    {/* Option buttons */}
                    {options.length > 0 && (
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                        {options.map((opt, i) => (
                          <button
                            key={i}
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAnswerQuestion(opt)}
                            className="w-full sm:w-auto rounded-lg border border-border/80 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand hover:bg-secondary disabled:opacity-50 text-left"
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Or type your answer */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Or type your answer..."
                        value={customAnswer[m.id] || ""}
                        disabled={isBusy}
                        onChange={(e) =>
                          setCustomAnswer((prev) => ({ ...prev, [m.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && customAnswer[m.id]?.trim()) {
                            handleAnswerQuestion(customAnswer[m.id].trim());
                            setCustomAnswer((prev) => ({ ...prev, [m.id]: "" }));
                          }
                        }}
                        className="flex-1 rounded-lg border border-border/80 bg-secondary/30 px-3 py-1.5 text-xs text-foreground outline-none focus:border-ring"
                      />
                      <button
                        type="button"
                        disabled={isBusy || !customAnswer[m.id]?.trim()}
                        onClick={() => {
                          if (customAnswer[m.id]?.trim()) {
                            handleAnswerQuestion(customAnswer[m.id].trim());
                            setCustomAnswer((prev) => ({ ...prev, [m.id]: "" }));
                          }
                        }}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                      >
                        <Send className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // Assistant standard text message: no bubble, full width, 24px Logo avatar at left, text 14px/1.6
        return (
          <div key={m.id} className="group flex items-start gap-3 w-full">
            <div className="mt-1 flex-shrink-0">
              <Logo size="sm" showWordmark={false} />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              {renderMarkdownRich(m.content)}
              <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <MessageCopyButton content={m.content} />
                <span className="text-[11px] text-muted-foreground/50">ZarGPT Build V1</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
