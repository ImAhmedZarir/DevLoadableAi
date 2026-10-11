import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  ChevronDown,
  Globe,
  Terminal,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Trash2,
  ChevronUp,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Skeleton } from "@/components/ui/skeleton";
import type { DeviceMode } from "@/components/builder/TopBar";
import type { ProjectFileItem } from "@/components/builder/CodeViewer";
import { buildPreviewDoc } from "@/lib/preview-builder";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ConsoleMessage {
  id: string;
  level: "log" | "info" | "warn" | "error" | "debug";
  args: string[];
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: number;
}

interface PreviewPaneProps {
  projectId: string;
  files: ProjectFileItem[];
  previewKey: number;
  isBuilding: boolean;
  deviceMode: DeviceMode;
  onErrorCountChange?: (count: number) => void;
  onFixErrors?: (errors: ConsoleMessage[]) => void;
  onPreviewReload?: () => void;
  onPageChange?: (page: string) => void;
  currentPage?: string;
}

function PreviewPaneComponent({
  projectId,
  files,
  previewKey,
  isBuilding,
  deviceMode,
  onErrorCountChange,
  onFixErrors,
  onPreviewReload,
  onPageChange,
  currentPage: propCurrentPage,
}: PreviewPaneProps) {
  // 1. Pages detection
  const htmlFiles = useMemo(() => {
    return files.filter((f) => f.path.endsWith(".html")).map((f) => f.path);
  }, [files]);

  const [selectedHtml, setSelectedHtml] = useState<string>("");

  const currentHtml = useMemo(() => {
    if (htmlFiles.length === 0) return "";
    const candidate = propCurrentPage || selectedHtml;
    if (candidate && htmlFiles.includes(candidate)) return candidate;
    if (htmlFiles.includes("index.html")) return "index.html";
    return htmlFiles[0] || "";
  }, [htmlFiles, propCurrentPage, selectedHtml]);

  const handleSelectPage = (page: string) => {
    setSelectedHtml(page);
    onPageChange?.(page);
  };

  // 2. Storage bridge state
  const storageKey = `dl-preview-storage:${projectId}`;
  const getSavedStorage = useCallback((): Record<string, string> => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return {};
  }, [storageKey]);

  const [localStore, setLocalStore] = useState<Record<string, string>>(getSavedStorage);

  const clearPreviewData = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setLocalStore({});
    setReloadCounter((k) => k + 1);
  };

  // 3. Double buffered iframes to avoid flashing
  const [reloadCounter, setReloadCounter] = useState(0);
  const [activeBuffer, setActiveBuffer] = useState<"A" | "B">("A");
  const [docA, setDocA] = useState<string>("");
  const [docB, setDocB] = useState<string>("");
  const iframeARef = useRef<HTMLIFrameElement>(null);
  const iframeBRef = useRef<HTMLIFrameElement>(null);

  // 4. Console messages state
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const [consoleTab, setConsoleTab] = useState<"all" | "errors" | "warnings">("all");
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("dl-console-collapsed") !== "false";
    } catch {
      return true;
    }
  });
  const [consoleHeight, setConsoleHeight] = useState<number>(() => {
    try {
      const h = Number(localStorage.getItem("dl-console-height"));
      return h && h >= 120 && h <= 500 ? h : 220;
    } catch {
      return 220;
    }
  });
  const [expandedStacks, setExpandedStacks] = useState<Record<string, boolean>>({});

  const errorMessages = useMemo(
    () => consoleMessages.filter((m) => m.level === "error"),
    [consoleMessages],
  );
  const warningMessages = useMemo(
    () => consoleMessages.filter((m) => m.level === "warn"),
    [consoleMessages],
  );

  // Sync error count to parent (for red dot in TopBar)
  useEffect(() => {
    onErrorCountChange?.(errorMessages.length);
  }, [errorMessages.length, onErrorCountChange]);

  // Toggle console collapse & remember
  const toggleConsole = () => {
    setIsConsoleCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("dl-console-collapsed", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const prevDocRef = useRef<string>("");
  const prevKeyRef = useRef<number>(-1);
  const prevReloadRef = useRef<number>(-1);

  // 5. Debounced doc builder (200ms) with memoized doc check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (files.length === 0) return;

      const nextDoc = buildPreviewDoc({
        files,
        page: currentHtml,
        projectId,
        initialStorage: localStore,
      });

      const isForcedReload =
        previewKey !== prevKeyRef.current || reloadCounter !== prevReloadRef.current;

      if (!isForcedReload && nextDoc === prevDocRef.current) {
        // Document content is identical, do not trigger iframe reloads!
        return;
      }

      prevDocRef.current = nextDoc;
      prevKeyRef.current = previewKey;
      prevReloadRef.current = reloadCounter;

      // Clear console automatically on every rebuild of the document
      setConsoleMessages([]);

      // Stage in the opposite buffer
      if (activeBuffer === "A") {
        setDocB(nextDoc);
      } else {
        setDocA(nextDoc);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [files, currentHtml, projectId, localStore, previewKey, reloadCounter]);

  // 6. Listen to postMessage from sandboxed iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Verify source matches one of our iframes
      const sourceWindow = e.source;
      const iframeAWindow = iframeARef.current?.contentWindow;
      const iframeBWindow = iframeBRef.current?.contentWindow;

      if (sourceWindow !== iframeAWindow && sourceWindow !== iframeBWindow) {
        return;
      }

      const data = e.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "dl-loaded") {
        // Swap buffers once new document finishes loading
        if (sourceWindow === iframeARef.current?.contentWindow) {
          setActiveBuffer("A");
        } else if (sourceWindow === iframeBRef.current?.contentWindow) {
          setActiveBuffer("B");
        }
      } else if (data.type === "dl-navigate") {
        if (data.page && typeof data.page === "string") {
          handleSelectPage(data.page);
        }
      } else if (data.type === "dl-storage") {
        if (data.key === "__all__") {
          try {
            localStorage.removeItem(storageKey);
          } catch {
            /* ignore */
          }
          setLocalStore({});
        } else if (data.key) {
          setLocalStore((prev) => {
            const next = { ...prev };
            if (data.value === null) {
              delete next[data.key];
            } else {
              next[data.key] = String(data.value);
            }
            try {
              localStorage.setItem(storageKey, JSON.stringify(next));
            } catch {
              /* ignore */
            }
            return next;
          });
        }
      } else if (data.type === "dl-console") {
        const msgText = (data.args || []).join(" ") || "Script output";
        const newMsg: ConsoleMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          level: data.level || "log",
          args: data.args || [],
          message: msgText,
          source: data.source,
          line: data.line,
          column: data.column,
          stack: data.stack,
          timestamp: data.timestamp || Date.now(),
        };

        setConsoleMessages((prev) => {
          if (prev.length >= 200) return prev;
          return [...prev, newMsg];
        });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [storageKey]);

  // Console resizer drag handling
  const isDraggingRef = useRef(false);
  const startDragYRef = useRef(0);
  const startHeightRef = useRef(220);

  const onMouseDownResize = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startDragYRef.current = e.clientY;
    startHeightRef.current = consoleHeight;
    document.addEventListener("mousemove", onMouseMoveResize);
    document.addEventListener("mouseup", onMouseUpResize);
  };

  const onMouseMoveResize = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const delta = startDragYRef.current - e.clientY;
    const newH = Math.max(120, Math.min(500, startHeightRef.current + delta));
    setConsoleHeight(newH);
    try {
      localStorage.setItem("dl-console-height", String(newH));
    } catch {
      /* ignore */
    }
  };

  const onMouseUpResize = () => {
    isDraggingRef.current = false;
    document.removeEventListener("mousemove", onMouseMoveResize);
    document.removeEventListener("mouseup", onMouseUpResize);
  };

  const filteredConsole = useMemo(() => {
    if (consoleTab === "errors") return errorMessages;
    if (consoleTab === "warnings") return warningMessages;
    return consoleMessages;
  }, [consoleTab, errorMessages, warningMessages, consoleMessages]);

  const toggleStack = (id: string) => {
    setExpandedStacks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-background"
      style={{
        backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      }}
    >
      {/* Top URL & Page Toolbar above the frame */}
      <div className="z-10 flex shrink-0 items-center justify-between border-b border-border/40 bg-card/60 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          {htmlFiles.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/50 px-3 py-1 text-xs font-mono text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Globe className="h-3 w-3 text-zinc-400" />
                  <span>{currentHtml || "preview"}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-40 font-mono text-xs">
                {htmlFiles.map((path) => (
                  <DropdownMenuItem
                    key={path}
                    onClick={() => handleSelectPage(path)}
                    className={
                      currentHtml === path ? "bg-secondary font-semibold text-foreground" : ""
                    }
                  >
                    {path}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/50 px-3 py-1 text-xs font-mono text-muted-foreground shadow-sm">
              <Globe className="h-3 w-3 text-zinc-400" />
              <span>{currentHtml || "preview"}</span>
            </div>
          )}
        </div>

        {/* Toolbar menu */}
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-secondary/30 px-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>Options</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={() => setReloadCounter((k) => k + 1)}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Reload preview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={clearPreviewData}
                className="text-rose-400 focus:text-rose-400"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Clear preview data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Frame Container */}
      <div className="relative flex flex-1 w-full items-center justify-center overflow-hidden min-h-0 p-3 sm:p-4">
        {isBuilding && files.length === 0 ? (
          <div
            className={`flex flex-col gap-3 rounded-xl border border-border/80 bg-card/60 p-6 shadow-floating ${
              deviceMode === "desktop"
                ? "h-full w-full max-w-4xl"
                : deviceMode === "tablet"
                  ? "h-full w-[820px] max-w-full"
                  : "h-full w-[390px] max-w-full"
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-border/40">
              <Skeleton className="h-6 w-32 rounded-md" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16 rounded-md" />
                <Skeleton className="h-6 w-16 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-40 w-full rounded-lg" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-8 select-none max-w-sm">
            <div className="relative mb-4">
              <div className="relative grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-secondary/80 shadow-lg">
                <Logo size="md" showWordmark={false} />
              </div>
            </div>
            <h4 className="text-sm font-semibold tracking-tight text-foreground">
              Your preview will appear here
            </h4>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              Describe what you want to build in the prompt box to see live updates.
            </p>
          </div>
        ) : (
          <div
            className={`relative transition-all duration-200 h-full overflow-hidden rounded-xl border border-border/80 bg-white shadow-floating ${
              deviceMode === "desktop"
                ? "w-full"
                : deviceMode === "tablet"
                  ? "w-[820px] max-w-full"
                  : "w-[390px] max-w-full"
            }`}
          >
            {/* Double buffer iframe A */}
            <iframe
              ref={iframeARef}
              srcDoc={docA}
              title="Project preview buffer A"
              className={`absolute inset-0 h-full w-full bg-white border-0 transition-opacity duration-150 ${
                activeBuffer === "A" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
              }`}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              referrerPolicy="no-referrer"
            />
            {/* Double buffer iframe B */}
            <iframe
              ref={iframeBRef}
              srcDoc={docB}
              title="Project preview buffer B"
              className={`absolute inset-0 h-full w-full bg-white border-0 transition-opacity duration-150 ${
                activeBuffer === "B" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
              }`}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </div>

      {/* Console Bottom Drawer */}
      <div
        className="z-20 flex flex-col border-t border-border/80 bg-card transition-all"
        style={{ height: isConsoleCollapsed ? 36 : consoleHeight }}
      >
        {/* Drag handle */}
        {!isConsoleCollapsed && (
          <div
            onMouseDown={onMouseDownResize}
            className="group absolute -top-1.5 left-0 right-0 h-3 cursor-row-resize z-30 flex items-center justify-center"
          >
            <div className="h-1 w-12 rounded-full bg-border/60 group-hover:bg-brand-from transition-colors" />
          </div>
        )}

        {/* Console Header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 bg-secondary/30 px-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleConsole}
              className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-brand-from transition-colors"
            >
              <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Console</span>
              <ChevronUp
                className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                  isConsoleCollapsed ? "" : "rotate-180"
                }`}
              />
            </button>

            {/* Filter tabs */}
            {!isConsoleCollapsed && (
              <div className="ml-3 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setConsoleTab("all")}
                  className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                    consoleTab === "all"
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All ({consoleMessages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setConsoleTab("errors")}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors ${
                    consoleTab === "errors"
                      ? "bg-rose-500/10 text-rose-400 font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <AlertCircle className="h-3 w-3 text-rose-400" />
                  Errors ({errorMessages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setConsoleTab("warnings")}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors ${
                    consoleTab === "warnings"
                      ? "bg-amber-500/10 text-amber-400 font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                  Warnings ({warningMessages.length})
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Fix all errors button */}
            {!isConsoleCollapsed && errorMessages.length > 0 && onFixErrors && (
              <button
                type="button"
                onClick={() => onFixErrors(errorMessages)}
                className="inline-flex items-center gap-1 rounded-md bg-brand-gradient px-2.5 py-0.5 text-[11px] font-medium text-white shadow hover:opacity-90 transition-opacity"
              >
                <Sparkles className="h-3 w-3" />
                Fix all errors ({errorMessages.length})
              </button>
            )}

            {!isConsoleCollapsed && (
              <button
                type="button"
                onClick={() => setConsoleMessages([])}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                title="Clear console view"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Console Message List */}
        {!isConsoleCollapsed && (
          <div className="flex-1 overflow-y-auto font-mono text-xs divide-y divide-border/20 p-1">
            {filteredConsole.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No console messages
              </div>
            ) : (
              filteredConsole.map((msg) => {
                const isError = msg.level === "error";
                const isWarn = msg.level === "warn";
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col p-1.5 rounded transition-colors ${
                      isError
                        ? "bg-rose-500/5 text-rose-300 hover:bg-rose-500/10"
                        : isWarn
                          ? "bg-amber-500/5 text-amber-300 hover:bg-amber-500/10"
                          : "text-muted-foreground hover:bg-secondary/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-1.5 min-w-0">
                        {isError ? (
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400 mt-0.5" />
                        ) : isWarn ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400 mt-0.5" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 shrink-0 mt-1.5 ml-1 mr-1" />
                        )}
                        <span className="break-all whitespace-pre-wrap leading-relaxed">
                          {msg.message}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {msg.source && (
                          <span className="text-[10px] text-muted-foreground/80">
                            {msg.source.split("/").pop()}
                            {msg.line ? `:${msg.line}` : ""}
                          </span>
                        )}
                        {isError && onFixErrors && (
                          <button
                            type="button"
                            onClick={() => onFixErrors([msg])}
                            className="inline-flex items-center gap-1 rounded border border-brand/30 bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand-from hover:bg-brand/20 transition-colors"
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            Fix with AI
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Stack trace if present */}
                    {msg.stack && (
                      <div className="mt-1 pl-5">
                        <button
                          type="button"
                          onClick={() => toggleStack(msg.id)}
                          className="text-[10px] text-muted-foreground underline hover:text-foreground"
                        >
                          {expandedStacks[msg.id] ? "Hide stack trace" : "Show stack trace"}
                        </button>
                        {expandedStacks[msg.id] && (
                          <pre className="mt-1 max-h-28 overflow-auto rounded bg-secondary/40 p-1.5 text-[10px] text-muted-foreground whitespace-pre">
                            {msg.stack}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const PreviewPane = React.memo(PreviewPaneComponent);
