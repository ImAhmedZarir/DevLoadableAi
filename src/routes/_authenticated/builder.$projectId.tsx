import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  publishProject,
  downloadProjectZip,
  uploadProjectFile,
  bulkUploadProjectFiles,
  startRun,
  runStep,
  cancelRun,
  retryStep,
  skipStep,
  executeRun,
  saveProjectFile,
  deleteProjectFile,
} from "@/lib/agent.functions";
import { toast } from "sonner";
import { pageMeta } from "@/lib/page-meta";
import { extractAppNameFromCode, generateProjectNameFromIdea } from "@/lib/project-naming";
import { MessageSquare, Eye, Code as CodeIcon, ListOrdered, History } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TopBar, type BuilderTab, type DeviceMode } from "@/components/builder/TopBar";
import { ChatPanel } from "@/components/builder/ChatPanel";
import { PreviewPane, type ConsoleMessage } from "@/components/builder/PreviewPane";
import { CodePane } from "@/components/builder/CodePane";
import { LogsPane } from "@/components/builder/LogsPane";
import { VersionsPane } from "@/components/builder/VersionsPane";
import { PublishDialog } from "@/components/builder/PublishDialog";
import type { MessageItem, RunItem } from "@/components/builder/MessageList";
import type { StepItem } from "@/components/builder/PlanCard";
import type { WorkLogItem } from "@/components/builder/ActiveStepBanner";
import type { ProjectFileItem } from "@/components/builder/CodeViewer";
import type { BuilderMode, ModelProvider, AttachedFile } from "@/components/builder/Composer";

export const Route = createFileRoute("/_authenticated/builder/$projectId")({
  component: Builder,
  head: () =>
    pageMeta(
      "Website editor",
      "Build and refine your DevLoadable project with live preview and code. Part of ZarGPT.",
    ),
});

function Builder() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();

  // Server functions
  const pubFn = useServerFn(publishProject);
  const zipFn = useServerFn(downloadProjectZip);
  const uploadFn = useServerFn(uploadProjectFile);
  const bulkUploadFn = useServerFn(bulkUploadProjectFiles);
  const startRunFn = useServerFn(startRun);
  const runStepFn = useServerFn(runStep);
  const cancelRunFn = useServerFn(cancelRun);
  const retryStepFn = useServerFn(retryStep);
  const skipStepFn = useServerFn(skipStep);
  const executeRunFn = useServerFn(executeRun);
  const saveFileFn = useServerFn(saveProjectFile);
  const deleteFileFn = useServerFn(deleteProjectFile);

  // Core state
  const [project, setProject] = useState<{ name: string; agent_notes?: string | null } | null>(
    null,
  );
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [logs, setLogs] = useState<WorkLogItem[]>([]);
  const [files, setFiles] = useState<ProjectFileItem[]>([]);
  const [pub, setPub] = useState<{
    slug: string;
    published_at: string;
    show_badge?: boolean;
  } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [mode, setMode] = useState<BuilderMode>("build");
  const [provider, setProvider] = useState<ModelProvider>("build-max");
  const [tab, setTab] = useState<BuilderTab>("preview");
  const [mobileTab, setMobileTab] = useState<"chat" | "preview" | "code" | "logs" | "versions">(
    "chat",
  );
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [previewKey, setPreviewKey] = useState(0);
  const [selectedCodePath, setSelectedCodePath] = useState<string | null>(null);
  const [previewErrorCount, setPreviewErrorCount] = useState(0);
  const [latestConsoleErrors, setLatestConsoleErrors] = useState<ConsoleMessage[]>([]);
  const [currentPage, setCurrentPage] = useState<string>("index.html");
  const [isChatOpen, setIsChatOpen] = useState(true);

  const [autoFixEnabled, setAutoFixEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("zargpt:autofix_enabled") !== "false";
    } catch {
      return true;
    }
  });

  const handleAutoFixToggle = (enabled: boolean) => {
    setAutoFixEnabled(enabled);
    try {
      localStorage.setItem("zargpt:autofix_enabled", String(enabled));
    } catch {
      // ignore storage access error
    }
  };

  const autoFixedRunsRef = useRef<Set<string>>(new Set());
  const prevLatestRunRef = useRef<{ id: string; status: string } | null>(null);

  // Active run & steps state
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState<number | null>(null);
  const [latestStatus, setLatestStatus] = useState<string | null>(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Map<string, "created" | "edited">>(
    new Map(),
  );
  const [showResumeBanner, setShowResumeBanner] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  // Track active execution loop ref and cancellation/pause controllers
  const isExecutingRef = useRef(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const pauseRequestedRef = useRef(false);

  // Load project data
  async function load() {
    const [
      { data: p },
      { data: m },
      { data: l },
      { data: f },
      { data: pb },
      { data: r },
      { data: s },
    ] = await Promise.all([
      supabase.from("projects").select("name,agent_notes").eq("id", projectId).maybeSingle(),
      supabase
        .from("messages")
        .select("id,role,content,kind,meta,created_at")
        .eq("project_id", projectId)
        .order("created_at"),
      supabase
        .from("work_logs")
        .select("id,kind,label,detail,created_at,run_id,step_idx")
        .eq("project_id", projectId)
        .order("created_at"),
      supabase
        .from("project_files")
        .select("path,content,is_upload")
        .eq("project_id", projectId)
        .order("path"),
      supabase
        .from("publications")
        .select("slug,published_at,show_badge")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("build_runs")
        .select("id,project_id,prompt,mode,kind,parent_run_id,status,error,created_at,finished_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("build_steps")
        .select("id,run_id,idx,title,description,status,summary")
        .eq("project_id", projectId)
        .order("idx"),
    ]);

    if (!p) {
      navigate({ to: "/dashboard" });
      return;
    }

    const currentName = p.name || "";
    const isGenericName =
      !currentName ||
      /^(untitled|untitled project|new project)$/i.test(currentName.trim()) ||
      currentName.toLowerCase().startsWith("build ") ||
      currentName.toLowerCase().startsWith("create ");

    if (isGenericName && f && f.length > 0) {
      const indexFile = (f as ProjectFileItem[]).find((file) => file.path === "index.html");
      if (indexFile) {
        const fromCode = extractAppNameFromCode(indexFile.content, "index.html");
        if (fromCode && fromCode !== currentName) {
          p.name = fromCode;
          supabase.from("projects").update({ name: fromCode }).eq("id", projectId).then();
        }
      }
    }

    setProject(p as unknown as { name: string; agent_notes?: string | null });

    setMessages((prev) => {
      const loaded = (m as MessageItem[]) ?? [];
      if (
        prev.length === loaded.length &&
        prev.length > 0 &&
        prev[prev.length - 1].id === loaded[loaded.length - 1]?.id
      ) {
        return prev;
      }
      return loaded;
    });

    setLogs((prev) => {
      const loaded = (l as WorkLogItem[]) ?? [];
      if (
        prev.length === loaded.length &&
        prev.length > 0 &&
        prev[prev.length - 1].id === loaded[loaded.length - 1]?.id
      ) {
        return prev;
      }
      return loaded;
    });

    // Resilient file merge: ensure live files are not wiped out by transient empty query
    setFiles((prev) => {
      const loaded = (f as ProjectFileItem[]) ?? [];
      if (loaded.length === 0 && prev.length > 0) {
        return prev;
      }
      const merged = new Map<string, ProjectFileItem>();
      for (const file of loaded) {
        merged.set(file.path, file);
      }
      for (const prevFile of prev) {
        if (!merged.has(prevFile.path)) {
          merged.set(prevFile.path, prevFile);
        }
      }
      if (prev.length === merged.size) {
        let same = true;
        for (const item of prev) {
          const match = merged.get(item.path);
          if (!match || match.content !== item.content || match.is_upload !== item.is_upload) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path));
    });

    setPub((pb as { slug: string; published_at: string; show_badge?: boolean }) ?? null);
    setRuns((r as RunItem[]) ?? []);
    setSteps((s as StepItem[]) ?? []);

    // Update recently updated files map from logs
    const recentMap = new Map<string, "created" | "edited">();
    for (const log of (l as WorkLogItem[]) || []) {
      if (log.kind === "created" || log.kind === "edited") {
        const match = log.label.match(/(?:Created|Edited)\s+(.+)/i);
        if (match && match[1]) {
          recentMap.set(match[1].trim(), log.kind as "created" | "edited");
        }
      }
    }
    setRecentlyUpdated(recentMap);

    // Update latest status from logs
    const statusLogs = ((l as WorkLogItem[]) || []).filter((item) => item.kind === "status");
    if (statusLogs.length > 0) {
      setLatestStatus(statusLogs[statusLogs.length - 1].label);
    }
  }

  useEffect(() => {
    load();
  }, [projectId]);

  // Set up Supabase Realtime with fallback to 3s polling
  useEffect(() => {
    let fallbackInterval: NodeJS.Timeout | null = null;
    let isSubscribed = false;

    const channel = supabase
      .channel(`project-live-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "build_runs", filter: `project_id=eq.${projectId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "build_steps",
          filter: `project_id=eq.${projectId}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_logs", filter: `project_id=eq.${projectId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_files",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          load();
          setPreviewKey((k) => k + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `project_id=eq.${projectId}` },
        () => load(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          isSubscribed = true;
          if (fallbackInterval) {
            clearInterval(fallbackInterval);
            fallbackInterval = null;
          }
        }
      });

    const timer = setTimeout(() => {
      if (!isSubscribed) {
        fallbackInterval = setInterval(() => {
          load();
        }, 3000);
      }
    }, 3000);

    return () => {
      clearTimeout(timer);
      if (fallbackInterval) clearInterval(fallbackInterval);
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Handle seed params from session storage
  useEffect(() => {
    const seed =
      sessionStorage.getItem(`loadable:seed:${projectId}`) ||
      sessionStorage.getItem(`zargpt:seed:${projectId}`);

    if (seed) {
      sessionStorage.removeItem(`loadable:seed:${projectId}`);
      sessionStorage.removeItem(`zargpt:seed:${projectId}`);

      const rawOpts =
        sessionStorage.getItem(`loadable:seedopts:${projectId}`) ||
        sessionStorage.getItem(`zargpt:seedopts:${projectId}`) ||
        "{}";
      sessionStorage.removeItem(`loadable:seedopts:${projectId}`);
      sessionStorage.removeItem(`zargpt:seedopts:${projectId}`);

      const opts = JSON.parse(rawOpts);
      if (opts.mode) setMode(opts.mode);
      if (opts.provider) setProvider(opts.provider);

      (async () => {
        for (const f of (opts.files ?? []) as { name: string; content: string }[]) {
          try {
            await uploadFn({ data: { projectId, path: f.name, content: f.content } });
          } catch (e) {
            toast.error(`Upload failed: ${f.name}`);
          }
        }
        setTimeout(() => send(seed, opts.mode, opts.provider), 100);
      })();
    }
  }, [projectId]);

  // Find incomplete run for resume banner
  const incompleteRun = useMemo(() => {
    const r = runs[0];
    if (!r) return null;
    if (r.status === "running") return r;
    const runSteps = steps.filter((s) => s.run_id === r.id);
    const hasPending = runSteps.some((s) => s.status === "pending" || s.status === "running");
    if (hasPending && r.status !== "done" && r.status !== "cancelled") {
      return r;
    }
    return null;
  }, [runs, steps]);

  const incompleteRunSteps = useMemo(() => {
    if (!incompleteRun) return [];
    return steps.filter((s) => s.run_id === incompleteRun.id);
  }, [incompleteRun, steps]);

  const completedStepCount = useMemo(() => {
    return incompleteRunSteps.filter((s) => s.status === "done").length;
  }, [incompleteRunSteps]);

  // Sequential execution of a build run's steps with real-time SSE streaming
  async function executeRunSteps(runId: string, stepList: StepItem[]) {
    if (isExecutingRef.current) return;
    isExecutingRef.current = true;
    stopRequestedRef.current = false;
    pauseRequestedRef.current = false;
    setIsPaused(false);
    setBusy(true);
    setActiveRunId(runId);

    try {
      const sorted = [...stepList].sort((a, b) => a.idx - b.idx);
      for (const step of sorted) {
        if (stopRequestedRef.current || pauseRequestedRef.current) break;
        if (step.status === "done" || step.status === "skipped") continue;

        setCurrentStepIdx(step.idx);
        setLatestStatus(`Starting: ${step.title}`);

        let stepSucceeded = false;
        let stepWaiting = false;
        let isLast = false;

        // 1. Try real-time streaming SSE via /api/stream-step
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token && !stopRequestedRef.current && !pauseRequestedRef.current) {
            const stepAbort = new AbortController();
            activeAbortControllerRef.current = stepAbort;

            const resp = await fetch("/api/stream-step", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ runId, idx: step.idx }),
              signal: stepAbort.signal,
            });

            if (resp.ok && resp.body) {
              const reader = resp.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";

              while (true) {
                if (stopRequestedRef.current || pauseRequestedRef.current) {
                  try {
                    await reader.cancel();
                  } catch {
                    // ignore
                  }
                  break;
                }
                const { done: streamDone, value } = await reader.read();
                if (streamDone) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith("data:")) continue;
                  const jsonStr = trimmed.slice(5).trim();
                  if (!jsonStr) continue;
                  try {
                    const evt = JSON.parse(jsonStr);
                    if (evt.type === "status") {
                      setLatestStatus(evt.status);
                    } else if (evt.type === "file_saved") {
                      // Live file update in file tree & CodePane!
                      setFiles((prev) => {
                        const existingIdx = prev.findIndex((f) => f.path === evt.path);
                        if (existingIdx >= 0) {
                          const copy = [...prev];
                          copy[existingIdx] = { ...copy[existingIdx], content: evt.content };
                          return copy;
                        }
                        return [
                          ...prev,
                          { path: evt.path, content: evt.content, is_upload: false },
                        ].sort((a, b) => a.path.localeCompare(b.path));
                      });
                      setRecentlyUpdated((prev) => new Map(prev).set(evt.path, "edited"));
                      setPreviewKey((k) => k + 1);
                    } else if (evt.type === "file_deleted") {
                      setFiles((prev) => prev.filter((f) => f.path !== evt.path));
                      setPreviewKey((k) => k + 1);
                    } else if (evt.type === "project_renamed" && evt.name) {
                      setProject((prev) => (prev ? { ...prev, name: evt.name } : { name: evt.name }));
                      toast.info(`Project named: ${evt.name}`);
                    } else if (evt.type === "waiting") {
                      stepWaiting = true;
                      toast.info("Agent is waiting for your response.");
                      break;
                    } else if (evt.type === "done") {
                      stepSucceeded = true;
                      isLast = !!evt.isLastStep;
                    } else if (evt.type === "error") {
                      toast.error(`Step error: ${evt.error}`);
                    }
                  } catch {
                    // ignore chunk parse error
                  }
                }

                if (stepWaiting || stopRequestedRef.current || pauseRequestedRef.current) break;
              }

              activeAbortControllerRef.current = null;

              if (stopRequestedRef.current || pauseRequestedRef.current) {
                break;
              }

              if (stepWaiting) {
                await load();
                break;
              }

              if (stepSucceeded) {
                await load();
                setPreviewKey((k) => k + 1);
                if (isLast) {
                  toast.success("Build plan completed!");
                  break;
                }
                continue;
              }
            }
          }
        } catch (streamErr) {
          if (stopRequestedRef.current || pauseRequestedRef.current) {
            break;
          }
          console.warn("SSE stream failed, falling back to serverFn:", streamErr);
        }

        activeAbortControllerRef.current = null;

        if (stopRequestedRef.current || pauseRequestedRef.current) {
          break;
        }

        // 2. Fallback to standard serverFn
        const res = await runStepFn({ data: { runId, idx: step.idx } });

        if (res.cancelled) {
          toast.info("Build was cancelled.");
          break;
        }

        if (res.waiting) {
          toast.info("Agent is waiting for your response.");
          break;
        }

        const resObj = res as Record<string, unknown>;
        if (!res.done && (resObj.error || resObj.status === "error")) {
          toast.error(
            `Step ${step.idx + 1} failed: ${String(resObj.error || resObj.message || "Unknown error")}`,
          );
          break;
        }

        await load();
        setPreviewKey((k) => k + 1);

        if (res.isLastStep) {
          toast.success("Build plan completed!");
          break;
        }
      }
    } catch (err) {
      if (!stopRequestedRef.current && !pauseRequestedRef.current) {
        toast.error(err instanceof Error ? err.message : "Run execution failed");
      }
    } finally {
      activeAbortControllerRef.current = null;
      isExecutingRef.current = false;
      if (!pauseRequestedRef.current) {
        setBusy(false);
        setActiveRunId(null);
        setCurrentStepIdx(null);
        setLatestStatus(null);
      }
      await load();
      setPreviewKey((k) => k + 1);
    }
  }

  // VS Code-style File actions
  async function handleSaveFile(path: string, content: string) {
    try {
      await saveFileFn({ data: { projectId, path, content } });
      setFiles((prev) =>
        prev.map((f) => (f.path === path ? { ...f, content } : f)),
      );
      setRecentlyUpdated((prev) => new Map(prev).set(path, "edited"));
      setPreviewKey((k) => k + 1);
      toast.success(`Saved ${path}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save file");
      throw err;
    }
  }

  async function handleCreateFile(path: string, content = "") {
    try {
      await saveFileFn({ data: { projectId, path, content } });
      setFiles((prev) => {
        const filtered = prev.filter((f) => f.path !== path);
        return [...filtered, { path, content, is_upload: false }].sort((a, b) =>
          a.path.localeCompare(b.path),
        );
      });
      setRecentlyUpdated((prev) => new Map(prev).set(path, "created"));
      setSelectedCodePath(path);
      setPreviewKey((k) => k + 1);
      toast.success(`Created ${path}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create file");
      throw err;
    }
  }

  async function handleDeleteFile(path: string) {
    try {
      await deleteFileFn({ data: { projectId, path } });
      setFiles((prev) => prev.filter((f) => f.path !== path));
      if (selectedCodePath === path) {
        setSelectedCodePath(null);
      }
      setPreviewKey((k) => k + 1);
      toast.success(`Deleted ${path}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete file");
      throw err;
    }
  }

  async function handleUploadFileToCode(path: string, content: string) {
    try {
      await saveFileFn({ data: { projectId, path, content } });
      setFiles((prev) => {
        const filtered = prev.filter((f) => f.path !== path);
        return [...filtered, { path, content, is_upload: true }].sort((a, b) =>
          a.path.localeCompare(b.path),
        );
      });
      setRecentlyUpdated((prev) => new Map(prev).set(path, "created"));
      setSelectedCodePath(path);
      setPreviewKey((k) => k + 1);
      toast.success(`Uploaded ${path}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload file");
      throw err;
    }
  }

  async function handleZipImport(
    extracted: Array<{ path: string; content: string }>,
    zipName: string,
  ) {
    if (!extracted || extracted.length === 0) return;
    const toastId = toast.loading(`Importing ${extracted.length} file(s) from ${zipName}...`);
    try {
      const CHUNK_SIZE = 250;
      for (let i = 0; i < extracted.length; i += CHUNK_SIZE) {
        const chunk = extracted.slice(i, i + CHUNK_SIZE);
        await bulkUploadFn({
          data: {
            projectId,
            files: chunk.map((c) => ({ path: c.path, content: c.content })),
          },
        });
      }

      await load();
      setPreviewKey((k) => k + 1);
      toast.success(`Imported ${extracted.length} file(s) from ${zipName} into workspace`, {
        id: toastId,
      });

      // Attach a single compact card representing the archive manifest
      const totalBytes = extracted.reduce((acc, f) => acc + f.content.length, 0);
      const manifestSample = extracted
        .slice(0, 50)
        .map((e) => `- ${e.path} (${Math.round(e.content.length / 1024) || 1}KB)`)
        .join("\n");
      const moreCount = extracted.length > 50 ? `\n...and ${extracted.length - 50} more files` : "";

      setAttachedFiles((prev) => [
        ...prev,
        {
          name: zipName,
          content: `[IMPORTED ZIP ARCHIVE: ${zipName} containing ${extracted.length} files (${Math.round(totalBytes / 1024)}KB) imported into project workspace]\n\nArchive Manifest:\n${manifestSample}${moreCount}`,
          size: totalBytes,
          type: "application/zip",
        },
      ]);
    } catch (err) {
      toast.error(`Failed to import zip: ${err instanceof Error ? err.message : String(err)}`, {
        id: toastId,
      });
    }
  }

  // Handle user send
  async function send(
    text?: string,
    m?: BuilderMode,
    pv?: ModelProvider,
    kind?: "user" | "autofix",
    parentRunId?: string,
    customLabel?: string,
    displayText?: string,
  ) {
    const rawText = (text ?? input).trim();
    if ((!rawText && attachedFiles.length === 0) || busy) return;
    setBusy(true);
    setInput("");

    const currentAttached = [...attachedFiles];
    setAttachedFiles([]);

    // If user attached code files, auto-upload to project_files so the workspace immediately has them
    for (const f of currentAttached) {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      const isCode = ["html", "htm", "css", "js", "jsx", "ts", "tsx", "json", "svg", "txt", "md"].includes(ext);
      if (isCode && !f.type?.startsWith("image/")) {
        try {
          await uploadFn({ data: { projectId, path: f.name, content: f.content } });
        } catch (err) {
          console.warn("Failed to auto-upload attached file to project:", err);
        }
      }
    }

    let userDisplayContent = displayText || rawText;
    if (!userDisplayContent && currentAttached.length > 0) {
      userDisplayContent = `Attached reference file(s): ${currentAttached.map((f) => f.name).join(", ")}`;
    }

    let promptToSend =
      rawText ||
      "Please review the attached reference file(s) and use them to build or improve the project.";
    if (currentAttached.length > 0) {
      const fileContext = currentAttached
        .map(
          (f) =>
            `[USER ATTACHED CODE / REFERENCE FILE: ${f.name}]\nFile: ${f.name}\n\n${f.content}\n[END OF ATTACHED FILE: ${f.name}]`,
        )
        .join("\n\n");
      promptToSend = `${fileContext}\n\nUser Request: ${
        rawText ||
        "Please use and build upon the attached file(s) for the project."
      }\n\nCRITICAL INSTRUCTION: Read the attached file(s) carefully. If the user provided code, templates, or HTML/CSS/JS, USE IT AS THE FOUNDATION and adapt/improve it directly for this project!`;
    }

    // Detect app name from prompt or user text and persist it
    const detectedNameMatch =
      promptToSend.match(
        /(?:app|project|website|product)\s*(?:name|title)\s*[:=\-]\s*["']?([a-zA-Z0-9_\-\s]{2,40}?)["']?(?:\.|\n|$|,)/i,
      ) ||
      promptToSend.match(/(?:named|called)\s*["']([a-zA-Z0-9_\-\s]{2,40})["']/i) ||
      promptToSend.match(/(?:named|called)\s+([A-Z][a-zA-Z0-9_\-]{2,30})/i);

    let targetAppName: string | null = null;
    if (detectedNameMatch && detectedNameMatch[1]) {
      const extractedName = detectedNameMatch[1].trim();
      if (
        !["a", "an", "the", "this", "new", "devloadable", "loadable"].includes(
          extractedName.toLowerCase(),
        )
      ) {
        targetAppName = extractedName;
      }
    }

    const isGenericCurrentName =
      !project?.name ||
      /^(untitled|untitled project|new project)$/i.test(project.name.trim()) ||
      project.name.toLowerCase().startsWith("build ") ||
      project.name.toLowerCase().startsWith("create ");

    if (!targetAppName && isGenericCurrentName) {
      const derived = generateProjectNameFromIdea(rawText || promptToSend);
      if (derived && derived !== "New Project" && derived !== "Untitled project") {
        targetAppName = derived;
      }
    }

    if (targetAppName) {
      try {
        await supabase
          .from("projects")
          .update({
            name: targetAppName,
            agent_notes: `Target App Name: ${targetAppName}\nBrand Mandate: The application being built MUST be named "${targetAppName}". Use this name across all titles, headers, and UI copy. Never use "DevLoadable".`,
          })
          .eq("id", projectId);
        setProject((prev) =>
          prev
            ? { ...prev, name: targetAppName!, agent_notes: `Target App Name: ${targetAppName}` }
            : prev,
        );
      } catch (e) {
        console.warn("Could not persist detected app name:", e);
      }
    }

    const currentMode = m ?? mode;
    const currentProvider = pv ?? provider;
    const currentKind = kind ?? "user";

    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-u-${Date.now()}`,
        role: "user",
        content: userDisplayContent,
        kind: currentKind,
        meta: {
          kind: currentKind,
          label: customLabel,
          attachedFiles: currentAttached.map((f) => f.name),
        },
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const res = await startRunFn({
        data: {
          projectId,
          prompt: promptToSend,
          displayPrompt: userDisplayContent,
          attachedFiles: currentAttached.map((f) => f.name),
          mode: currentMode,
          provider: currentProvider,
          kind: currentKind,
          parentRunId: parentRunId || undefined,
        },
      });

      await load();

      if (res.mode === "chat") {
        setBusy(false);
        return;
      }

      if (res.runId && res.steps && res.steps.length > 0) {
        if (currentMode === "build") {
          const stepItems: StepItem[] = res.steps.map((st) => ({
            id: "",
            run_id: res.runId!,
            idx: st.idx,
            title: st.title,
            description: st.description,
            status: "pending",
          }));
          await executeRunSteps(res.runId, stepItems);
        } else {
          toast.success("Build plan created. Review and click 'Build this plan' to run.");
          setBusy(false);
        }
      } else {
        setBusy(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start run");
      await load();
      setBusy(false);
    }
  }

  // Handle "Fix with AI" (manual)
  function handleFixErrors(errors: ConsoleMessage[]) {
    if (errors.length === 0 || busy) return;
    const errorList = errors
      .map(
        (e) =>
          `- ${e.message}${e.source ? ` (${e.source}${e.line ? `:${e.line}` : ""})` : ""}${
            e.stack ? `\n  Stack: ${e.stack.slice(0, 300)}` : ""
          }`,
      )
      .join("\n\n");

    const promptText = `The preview shows these runtime errors. Fix them with minimal edits and do not change the design.\n\n${errorList}`;
    send(promptText, "build", provider, "user", undefined, `Fix errors (${errors.length})`);
  }

  // Auto-fix monitor
  const latestRun = runs[0];
  useEffect(() => {
    if (!latestRun) return;
    const prev = prevLatestRunRef.current;
    prevLatestRunRef.current = { id: latestRun.id, status: latestRun.status };

    // When run status reaches 'done'
    if (prev && prev.id === latestRun.id && prev.status !== "done" && latestRun.status === "done") {
      if (
        autoFixEnabled &&
        !autoFixedRunsRef.current.has(latestRun.id) &&
        latestRun.kind !== "autofix"
      ) {
        // Wait dl-loaded plus 2 seconds
        const timer = setTimeout(() => {
          // Check console errors
          const realErrors = latestConsoleErrors.filter((e) => {
            if (e.level !== "error") return false;
            const text = (e.message || "").toLowerCase();
            const src = (e.source || "").toLowerCase();
            if (text.includes("favicon") || src.includes("favicon")) return false;
            if (src.startsWith("http://") || src.startsWith("https://")) {
              if (typeof window !== "undefined" && !src.includes(window.location.host)) {
                return false;
              }
            }
            return true;
          });

          if (realErrors.length > 0 && !busy) {
            autoFixedRunsRef.current.add(latestRun.id);
            toast.info(
              `Auto-fixing ${realErrors.length} ${realErrors.length === 1 ? "error" : "errors"}...`,
            );
            const errorList = realErrors
              .map(
                (e) =>
                  `- ${e.message}${e.source ? ` (${e.source}${e.line ? `:${e.line}` : ""})` : ""}${
                    e.stack ? `\n  Stack: ${e.stack.slice(0, 300)}` : ""
                  }`,
              )
              .join("\n\n");
            const fixPrompt = `The preview shows these runtime errors. Fix them with minimal edits and do not change the design.\n\n${errorList}`;
            send(fixPrompt, "build", provider, "autofix", latestRun.id, "Auto-fix");
          }
        }, 2000);
        return () => clearTimeout(timer);
      } else if (latestRun.kind === "autofix") {
        // If autofix run finished and errors remain, notify once without looping
        const timer = setTimeout(() => {
          if (previewErrorCount > 0) {
            toast.warning("Some errors remain. Review them in the console.");
          }
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [latestRun, autoFixEnabled, latestConsoleErrors, previewErrorCount, busy, provider]);

  async function handleStop() {
    stopRequestedRef.current = true;
    activeAbortControllerRef.current?.abort();
    activeAbortControllerRef.current = null;
    setIsStopping(true);

    const rId = activeRunId || incompleteRun?.id;
    try {
      if (rId) {
        await cancelRunFn({ data: { runId: rId } });
      }
      toast.info("Build stopped");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel run");
    } finally {
      setIsStopping(false);
      setBusy(false);
      setIsPaused(false);
      setActiveRunId(null);
      setCurrentStepIdx(null);
      setLatestStatus(null);
      isExecutingRef.current = false;
    }
  }

  async function handlePause() {
    pauseRequestedRef.current = true;
    activeAbortControllerRef.current?.abort();
    activeAbortControllerRef.current = null;
    setIsPaused(true);
    setBusy(false);
    isExecutingRef.current = false;
    setShowResumeBanner(true);
    toast.info("Build paused. Inspect your code or click Resume to continue.");
    await load();
  }

  async function handleExecutePlan(runId: string) {
    try {
      setBusy(true);
      await executeRunFn({ data: { runId } });
      await load();
      const runSteps = steps.filter((s) => s.run_id === runId);
      await executeRunSteps(runId, runSteps);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to execute plan");
      setBusy(false);
    }
  }

  async function handleRetryStep(runId: string, idx: number) {
    try {
      await retryStepFn({ data: { runId, idx } });
      await load();
      const runSteps = steps.filter((s) => s.run_id === runId);
      await executeRunSteps(runId, runSteps);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to retry step");
    }
  }

  async function handleSkipStep(runId: string, idx: number) {
    try {
      await skipStepFn({ data: { runId, idx } });
      await load();
      const runSteps = steps.filter((s) => s.run_id === runId);
      await executeRunSteps(runId, runSteps);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to skip step");
    }
  }

  async function handleResume() {
    const targetRun = incompleteRun || runs.find((r) => r.id === activeRunId);
    if (!targetRun) return;
    pauseRequestedRef.current = false;
    stopRequestedRef.current = false;
    setIsPaused(false);
    setShowResumeBanner(false);
    const runSteps = steps.filter((s) => s.run_id === targetRun.id);
    await executeRunSteps(targetRun.id, runSteps);
  }

  async function handleRenameProject(newName: string) {
    try {
      const { error } = await supabase
        .from("projects")
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (error) {
        toast.error(error.message);
      } else {
        setProject((prev) => (prev ? { ...prev, name: newName } : { name: newName }));
        toast.success("Project renamed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    }
  }

  async function publish() {
    const slug = prompt(
      "Choose a slug (lowercase, dashes):",
      pub?.slug ??
        project?.name
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40),
    );
    if (!slug) return;
    try {
      const r = await pubFn({ data: { projectId, slug } });
      setPub({ slug: r.slug, published_at: new Date().toISOString() });
      toast.success(`Published at /p/${r.slug}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function download() {
    try {
      const { base64, filename } = await zipFn({ data: { projectId } });
      const bin = atob(base64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([buf], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    await uploadFn({ data: { projectId, path: f.name, content: text } });
    toast.success(`Uploaded ${f.name}`);
    load();
  }

  function handleOpenNewTab() {
    if (pub?.slug) {
      window.open(`/p/${pub.slug}`, "_blank");
    } else {
      const indexFile = files.find((f) => f.path === "index.html");
      if (indexFile) {
        const blobUrl = URL.createObjectURL(
          new Blob([indexFile.content], { type: "text/html;charset=utf-8" }),
        );
        window.open(blobUrl, "_blank");
      }
    }
  }

  const handleOpenFileInCode = (path: string) => {
    setSelectedCodePath(path);
    setTab("code");
    setMobileTab("code");
  };

  // Status for TopBar pill
  const builderStatus: "saved" | "building" | "paused" | "waiting" | "error" = busy
    ? "building"
    : isPaused
      ? "paused"
      : incompleteRun && incompleteRun.status === "error"
        ? "error"
        : messages.length > 0 && messages[messages.length - 1].kind === "question"
          ? "waiting"
          : "saved";

  const buildingStep =
    currentStepIdx !== null && currentStepIdx !== undefined
      ? {
          current: currentStepIdx + 1,
          total: steps.filter((s) => s.run_id === (activeRunId || incompleteRun?.id)).length || 1,
        }
      : undefined;

  const errorCount = useMemo(() => {
    return logs.filter((l) => l.kind === "error").length;
  }, [logs]);

  return (
    <div className="fixed inset-0 flex h-[100dvh] w-full flex-col bg-background text-foreground overflow-hidden overscroll-none">
      {/* Row 1: TopBar (48px) */}
      <TopBar
        projectName={project?.name || "Loading..."}
        onRenameProject={handleRenameProject}
        status={builderStatus}
        buildingStep={buildingStep}
        activeTab={tab}
        onTabChange={(t) => {
          setTab(t);
          if (t !== "versions") setMobileTab(t);
        }}
        errorCount={errorCount}
        previewErrorCount={previewErrorCount}
        deviceMode={deviceMode}
        onDeviceModeChange={setDeviceMode}
        onReload={() => setPreviewKey((k) => k + 1)}
        onOpenNewTab={handleOpenNewTab}
        onDownloadZip={download}
        onPublish={() => setPublishOpen(true)}
        publishedSlug={pub?.slug}
        isBuilding={busy}
        isChatOpen={isChatOpen}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
      />

      {/* Row 2 Desktop: Resizable Panels Layout */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {isChatOpen ? (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize="38%" minSize="28%" maxSize="55%">
              <ChatPanel
                projectNotes={project?.agent_notes}
                messages={messages}
                runs={runs}
                steps={steps}
                logs={logs}
                activeRunId={activeRunId}
                currentStepIdx={currentStepIdx}
                latestStatus={latestStatus}
                isBusy={busy}
                isStopping={isStopping}
                incompleteRun={incompleteRun}
                incompleteRunSteps={incompleteRunSteps}
                completedStepCount={completedStepCount}
                showResumeBanner={showResumeBanner}
                onDismissResumeBanner={() => setShowResumeBanner(false)}
                onResumeBuild={handleResume}
                onStopBuild={handleStop}
                onPauseBuild={handlePause}
                input={input}
                onInputChange={setInput}
                onSend={send}
                mode={mode}
                onModeChange={setMode}
                provider={provider}
                onProviderChange={setProvider}
                attachedFiles={attachedFiles}
                onFileAttach={(f) => setAttachedFiles((prev) => [...prev, f])}
                onFileRemove={(idx) => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                onClearFiles={() => setAttachedFiles([])}
                onZipImport={handleZipImport}
                onExecutePlan={handleExecutePlan}
                onRetryStep={handleRetryStep}
                onSkipStep={handleSkipStep}
                onOpenFile={handleOpenFileInCode}
                onFileUpload={onFilePick}
                autoFixEnabled={autoFixEnabled}
                onAutoFixChange={handleAutoFixToggle}
              />
            </ResizablePanel>

            <ResizableHandle
              withHandle
              className="hover:bg-white/30 transition-colors w-1 bg-border/80"
            />

            <ResizablePanel defaultSize="62%" minSize="45%">
              <div className="flex h-full flex-col overflow-hidden">
                <div className={`h-full flex-col overflow-hidden ${tab === "preview" ? "flex" : "hidden"}`}>
                  <PreviewPane
                    projectId={projectId}
                    files={files}
                    previewKey={previewKey}
                    isBuilding={busy}
                    deviceMode={deviceMode}
                    onErrorCountChange={(count) => setPreviewErrorCount(count)}
                    onFixErrors={handleFixErrors}
                    onPreviewReload={() => setPreviewKey((k) => k + 1)}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                  />
                </div>

                <div className={`h-full flex-col overflow-hidden ${tab === "code" ? "flex" : "hidden"}`}>
                  <CodePane
                    files={files}
                    recentlyUpdated={recentlyUpdated}
                    initialSelectedPath={selectedCodePath}
                    onSaveFile={handleSaveFile}
                    onCreateFile={handleCreateFile}
                    onDeleteFile={handleDeleteFile}
                    onUploadFile={handleUploadFileToCode}
                  />
                </div>

                <div className={`h-full flex-col overflow-hidden ${tab === "logs" ? "flex" : "hidden"}`}>
                  <LogsPane logs={logs} />
                </div>

                <div className={`h-full flex-col overflow-hidden ${tab === "versions" ? "flex" : "hidden"}`}>
                  <VersionsPane projectId={projectId} isBuilding={busy} onVersionRestored={load} />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="flex h-full w-full flex-col overflow-hidden">
            <div className={`h-full flex-col overflow-hidden ${tab === "preview" ? "flex" : "hidden"}`}>
              <PreviewPane
                projectId={projectId}
                files={files}
                previewKey={previewKey}
                isBuilding={busy}
                deviceMode={deviceMode}
                onErrorCountChange={(count) => setPreviewErrorCount(count)}
                onFixErrors={handleFixErrors}
                onPreviewReload={() => setPreviewKey((k) => k + 1)}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
              />
            </div>

            <div className={`h-full flex-col overflow-hidden ${tab === "code" ? "flex" : "hidden"}`}>
              <CodePane
                files={files}
                recentlyUpdated={recentlyUpdated}
                initialSelectedPath={selectedCodePath}
                onSaveFile={handleSaveFile}
                onCreateFile={handleCreateFile}
                onDeleteFile={handleDeleteFile}
                onUploadFile={handleUploadFileToCode}
              />
            </div>

            <div className={`h-full flex-col overflow-hidden ${tab === "logs" ? "flex" : "hidden"}`}>
              <LogsPane logs={logs} />
            </div>

            <div className={`h-full flex-col overflow-hidden ${tab === "versions" ? "flex" : "hidden"}`}>
              <VersionsPane projectId={projectId} isBuilding={busy} onVersionRestored={load} />
            </div>
          </div>
        )}
      </div>

      {/* Row 2 Mobile (< 768px): Single active pane + 56px bottom tab bar */}
      <div className="flex flex-1 flex-col md:hidden overflow-hidden">
        {/* Main active view on mobile */}
        <div className="flex-1 overflow-hidden relative">
          <div className={`h-full flex-col overflow-hidden ${mobileTab === "chat" ? "flex" : "hidden"}`}>
            <ChatPanel
              projectNotes={project?.agent_notes}
              messages={messages}
              runs={runs}
              steps={steps}
              logs={logs}
              activeRunId={activeRunId}
              currentStepIdx={currentStepIdx}
              latestStatus={latestStatus}
              isBusy={busy}
              isStopping={isStopping}
              incompleteRun={incompleteRun}
              incompleteRunSteps={incompleteRunSteps}
              completedStepCount={completedStepCount}
              showResumeBanner={showResumeBanner}
              onDismissResumeBanner={() => setShowResumeBanner(false)}
              onResumeBuild={handleResume}
              onStopBuild={handleStop}
              input={input}
              onInputChange={setInput}
              onSend={send}
              mode={mode}
              onModeChange={setMode}
              provider={provider}
              onProviderChange={setProvider}
              attachedFiles={attachedFiles}
              onFileAttach={(f) => setAttachedFiles((prev) => [...prev, f])}
              onFileRemove={(idx) => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
              onClearFiles={() => setAttachedFiles([])}
              onZipImport={handleZipImport}
              onExecutePlan={handleExecutePlan}
              onRetryStep={handleRetryStep}
              onSkipStep={handleSkipStep}
              onOpenFile={handleOpenFileInCode}
              onFileUpload={onFilePick}
              autoFixEnabled={autoFixEnabled}
              onAutoFixChange={handleAutoFixToggle}
            />
          </div>

          <div className={`h-full flex-col overflow-hidden ${mobileTab === "preview" ? "flex" : "hidden"}`}>
            <PreviewPane
              projectId={projectId}
              files={files}
              previewKey={previewKey}
              isBuilding={busy}
              deviceMode="mobile"
              onErrorCountChange={(count) => setPreviewErrorCount(count)}
              onFixErrors={handleFixErrors}
              onPreviewReload={() => setPreviewKey((k) => k + 1)}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </div>

          <div className={`h-full flex-col overflow-hidden ${mobileTab === "code" ? "flex" : "hidden"}`}>
            <CodePane
              files={files}
              recentlyUpdated={recentlyUpdated}
              initialSelectedPath={selectedCodePath}
              onSaveFile={handleSaveFile}
              onCreateFile={handleCreateFile}
              onDeleteFile={handleDeleteFile}
              onUploadFile={handleUploadFileToCode}
            />
          </div>

          <div className={`h-full flex-col overflow-hidden ${mobileTab === "logs" ? "flex" : "hidden"}`}>
            <LogsPane logs={logs} />
          </div>

          <div className={`h-full flex-col overflow-hidden ${mobileTab === "versions" ? "flex" : "hidden"}`}>
            <VersionsPane projectId={projectId} isBuilding={busy} onVersionRestored={load} />
          </div>
        </div>

        {/* 56px Mobile Bottom Tab Bar */}
        <nav
          aria-label="Mobile Navigation"
          className="shrink-0 flex h-14 w-full items-center justify-around border-t border-white/[0.08] bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl z-30"
        >
          <button
            type="button"
            onClick={() => setMobileTab("chat")}
            className={`flex flex-col items-center justify-center min-h-[40px] px-3 py-1 text-[11px] font-medium transition-colors ${
              mobileTab === "chat" ? "text-white font-semibold" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Chat</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileTab("preview");
              setTab("preview");
            }}
            className={`flex flex-col items-center justify-center min-h-[40px] px-3 py-1 text-[11px] font-medium transition-colors ${
              mobileTab === "preview" ? "text-white font-semibold" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Eye className="h-4 w-4" />
            <span>Preview</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileTab("code");
              setTab("code");
            }}
            className={`flex flex-col items-center justify-center min-h-[40px] px-3 py-1 text-[11px] font-medium transition-colors ${
              mobileTab === "code" ? "text-white font-semibold" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <CodeIcon className="h-4 w-4" />
            <span>Code</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileTab("logs");
              setTab("logs");
            }}
            className={`relative flex flex-col items-center justify-center min-h-[40px] px-3 py-1 text-[11px] font-medium transition-colors ${
              mobileTab === "logs" ? "text-white font-semibold" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <ListOrdered className="h-4 w-4" />
            <span>Logs</span>
            {errorCount > 0 && (
              <span className="absolute top-1 right-2 h-2 w-2 rounded-full bg-destructive" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileTab("versions");
              setTab("versions");
            }}
            className={`flex flex-col items-center justify-center min-h-[40px] px-3 py-1 text-[11px] font-medium transition-colors ${
              mobileTab === "versions" ? "text-white font-semibold" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <History className="h-4 w-4" />
            <span>Versions</span>
          </button>
        </nav>
      </div>

      {/* Publish Dialog */}
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        projectId={projectId}
        projectName={project?.name || ""}
        existingPub={pub}
        onPublishedChange={load}
      />
    </div>
  );
}
