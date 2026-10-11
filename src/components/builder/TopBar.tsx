import React, { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Eye,
  Code,
  ListOrdered,
  History,
  Monitor,
  Tablet,
  Smartphone,
  RefreshCw,
  ExternalLink,
  Download,
  Globe,
  Check,
  HelpCircle,
  PanelLeft,
  Pause,
  Play,
  Square,
  AlertCircle,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type BuilderTab = "preview" | "code" | "logs" | "versions";
export type DeviceMode = "desktop" | "tablet" | "mobile";

interface TopBarProps {
  projectName: string;
  onRenameProject: (newName: string) => Promise<void>;
  status: "saved" | "building" | "paused" | "waiting" | "error";
  buildingStep?: { current: number; total: number };
  activeTab: BuilderTab;
  onTabChange: (tab: BuilderTab) => void;
  errorCount: number;
  deviceMode: DeviceMode;
  onDeviceModeChange: (mode: DeviceMode) => void;
  onReload: () => void;
  onOpenNewTab: () => void;
  onDownloadZip: () => void;
  onPublish: () => void;
  publishedSlug?: string | null;
  isBuilding: boolean;
  previewErrorCount?: number;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

function TopBarComponent({
  projectName,
  onRenameProject,
  status,
  buildingStep,
  activeTab,
  onTabChange,
  errorCount,
  deviceMode,
  onDeviceModeChange,
  onReload,
  onOpenNewTab,
  onDownloadZip,
  onPublish,
  publishedSlug,
  isBuilding,
  previewErrorCount = 0,
  isChatOpen = true,
  onToggleChat,
  onPause,
  onResume,
  onStop,
}: TopBarProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameInput(projectName);
  }, [projectName]);

  useEffect(() => {
    if (isEditingName) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditingName]);

  const saveName = async () => {
    setIsEditingName(false);
    if (nameInput.trim() && nameInput.trim() !== projectName) {
      await onRenameProject(nameInput.trim());
    } else {
      setNameInput(projectName);
    }
  };

  return (
    <header className="shrink-0 relative z-30 h-12 w-full border-b border-white/[0.08] bg-black/75 backdrop-blur-2xl">
      <div className="flex h-full items-center justify-between px-3 sm:px-4">
        {/* Left: Logo, Toggle, Chevron, Inline Project Name, Status Pill */}
        <div className="flex items-center gap-2 sm:gap-2.5 overflow-hidden max-w-[55%] sm:max-w-[60%]">
          <Link
            to="/dashboard"
            className="flex items-center rounded-lg p-1 text-foreground transition-all hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white shrink-0"
            title="Back to Dashboard"
            aria-label="Back to Dashboard"
          >
            <Logo size="sm" showWordmark={false} />
          </Link>

          {onToggleChat && (
            <button
              type="button"
              onClick={onToggleChat}
              className={`hidden md:inline-flex items-center justify-center h-7 w-7 rounded-lg border transition-colors ${
                isChatOpen
                  ? "border-white/10 bg-white/[0.06] text-foreground hover:bg-white/[0.1]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              }`}
              title={isChatOpen ? "Hide chat panel" : "Show chat panel"}
              aria-label={isChatOpen ? "Hide chat panel" : "Show chat panel"}
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
          )}

          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-zinc-600" />

          {/* Inline editable project name */}
          {isEditingName ? (
            <input
              ref={inputRef}
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setNameInput(projectName);
                  setIsEditingName(false);
                }
              }}
              className="h-6.5 rounded-lg border border-white/30 bg-secondary px-2 text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-white"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingName(true)}
              className="truncate rounded-md px-1.5 py-0.5 text-xs font-semibold text-foreground hover:bg-white/[0.06] transition-colors text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white max-w-[120px] sm:max-w-[200px] md:max-w-xs shrink"
              title="Click to rename"
            >
              {projectName || "Untitled project"}
            </button>
          )}

          {/* Status Pill & Controls */}
          <div aria-live="polite" className="flex items-center flex-shrink-0">
            {status === "building" ? (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  <span className="hidden sm:inline">
                    {buildingStep
                      ? `Building ${buildingStep.current}/${buildingStep.total}`
                      : "Building"}
                  </span>
                  <span className="sm:hidden">
                    {buildingStep ? `${buildingStep.current}/${buildingStep.total}` : "Building"}
                  </span>
                </span>
              </div>
            ) : status === "paused" ? (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                  <Pause className="h-2.5 w-2.5 fill-current" />
                  <span>
                    {buildingStep
                      ? `Paused (${buildingStep.current}/${buildingStep.total})`
                      : "Paused"}
                  </span>
                </span>
                {onResume && (
                  <button
                    type="button"
                    onClick={onResume}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    title="Resume AI build"
                  >
                    <Play className="h-2.5 w-2.5 fill-current" />
                    <span>Resume</span>
                  </button>
                )}
              </div>
            ) : status === "waiting" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                <HelpCircle className="h-3 w-3" />
                <span className="hidden sm:inline">Needs answer</span>
              </span>
            ) : status === "error" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                <AlertCircle className="h-3 w-3" />
                <span className="hidden sm:inline">Error</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/5 bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                <Check className="h-2.5 w-2.5 text-emerald-400" />
                <span className="hidden sm:inline">Saved</span>
              </span>
            )}
          </div>
        </div>

        {/* Center: Segmented Tabs (Desktop only) */}
        <div className="hidden md:flex items-center gap-1 rounded-xl border border-white/[0.08] bg-[#12131a]/90 p-1 backdrop-blur-md shadow-sm">
          <button
            type="button"
            onClick={() => onTabChange("preview")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
              activeTab === "preview"
                ? "bg-secondary text-foreground shadow-sm border border-white/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Preview</span>
            {previewErrorCount > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white leading-none">
                {previewErrorCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onTabChange("code")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
              activeTab === "code"
                ? "bg-secondary text-foreground shadow-sm border border-white/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            }`}
          >
            <Code className="h-3.5 w-3.5" /> Code
          </button>

          <button
            type="button"
            onClick={() => onTabChange("logs")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
              activeTab === "logs"
                ? "bg-secondary text-foreground shadow-sm border border-white/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            }`}
          >
            <ListOrdered className="h-3.5 w-3.5" /> Logs
            {errorCount > 0 && (
              <span className="ml-1 rounded-full bg-destructive/20 px-1.5 py-0.2 text-[10px] font-semibold text-destructive">
                {errorCount}
              </span>
            )}
          </button>

          {/* Versions Tab */}
          <button
            type="button"
            onClick={() => onTabChange("versions")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
              activeTab === "versions"
                ? "bg-secondary text-foreground shadow-sm border border-white/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            }`}
          >
            <History className="h-3.5 w-3.5" /> Versions
          </button>
        </div>

        {/* Right: Device Toggles, Actions, Publish Button */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Device Toggles (Preview tab only, desktop only) */}
          {activeTab === "preview" && (
            <div className="hidden lg:flex items-center gap-0.5 rounded-md border border-border/80 bg-secondary/30 p-0.5 mr-1">
              <button
                type="button"
                onClick={() => onDeviceModeChange("desktop")}
                className={`rounded p-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  deviceMode === "desktop"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Desktop view"
                aria-label="Desktop view"
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeviceModeChange("tablet")}
                className={`rounded p-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  deviceMode === "tablet"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Tablet view (820px)"
                aria-label="Tablet view"
              >
                <Tablet className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeviceModeChange("mobile")}
                className={`rounded p-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  deviceMode === "mobile"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Mobile view (390px)"
                aria-label="Mobile view"
              >
                <Smartphone className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Reload Button */}
          <button
            type="button"
            onClick={onReload}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Reload preview"
            aria-label="Reload preview"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          {/* Open in new tab (if published or preview) */}
          <button
            type="button"
            onClick={onOpenNewTab}
            className="hidden sm:inline-flex rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Open in new tab"
            aria-label="Open in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>

          {/* Download ZIP */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onDownloadZip}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Download project ZIP"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Download ZIP</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Publish Button */}
          <button
            type="button"
            onClick={onPublish}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-black shadow-sm transition-all hover:bg-zinc-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white shrink-0 whitespace-nowrap"
          >
            <Globe className="h-3.5 w-3.5 shrink-0 text-black" />
            <span className="hidden sm:inline">{publishedSlug ? "Republish" : "Publish"}</span>
            {publishedSlug && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"
                title="Published"
              />
            )}
          </button>
        </div>
      </div>

      {/* Signature Indeterminate Sweep Line (2px high, spans whole width while building) */}
      {isBuilding && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden bg-white/5">
          <div className="h-full w-1/2 bg-white/60 animate-sweep" />
        </div>
      )}
    </header>
  );
}

export const TopBar = React.memo(TopBarComponent);
