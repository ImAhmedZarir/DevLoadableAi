import React, { useRef, useEffect, useState } from "react";
import JSZip from "jszip";
import {
  Paperclip,
  ArrowUp,
  Square,
  MessageSquare,
  ClipboardList,
  Hammer,
  ChevronDown,
  X,
  FileText,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";

export type BuilderMode = "chat" | "plan" | "build";
export type ModelProvider = "build-max" | "build-mini";

export interface AttachedFile {
  name: string;
  content: string;
  size?: number;
  type?: string;
}

interface ComposerProps {
  input: string;
  onInputChange: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
  onPause?: () => void;
  isBusy: boolean;
  mode: BuilderMode;
  onModeChange: (m: BuilderMode) => void;
  provider: ModelProvider;
  onProviderChange: (p: ModelProvider) => void;
  attachedFiles?: AttachedFile[];
  onFileAttach?: (file: AttachedFile) => void;
  onFileRemove?: (index: number) => void;
  onClearFiles?: () => void;
  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onZipImport?: (files: Array<{ path: string; content: string }>, zipName: string) => Promise<void>;
  autoFixEnabled?: boolean;
  onAutoFixChange?: (enabled: boolean) => void;
}

export const PROVIDER_NAMES: Record<ModelProvider, string> = {
  "build-max": "Build Max",
  "build-mini": "Build Mini",
};

export const AVAILABLE_PROVIDERS: ModelProvider[] = ["build-max", "build-mini"];

export function Composer({
  input,
  onInputChange,
  onSend,
  onStop,
  onPause,
  isBusy,
  mode,
  onModeChange,
  provider = "build-max",
  onProviderChange,
  attachedFiles = [],
  onFileAttach,
  onFileRemove,
  onClearFiles,
  onFileUpload,
  onZipImport,
  autoFixEnabled = true,
  onAutoFixChange,
}: ComposerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = (files: File[]) => {
    if (!files || files.length === 0) return;
    for (const f of files) {
      const isZip = f.name.toLowerCase().endsWith(".zip") || f.type.includes("zip");
      if (isZip) {
        (async () => {
          try {
            const zip = await JSZip.loadAsync(f);
            const extracted: Array<{ path: string; content: string }> = [];
            const entries = Object.keys(zip.files);
            for (const relPath of entries) {
              const entry = zip.files[relPath];
              if (
                entry.dir ||
                relPath.startsWith("__MACOSX") ||
                relPath.includes("/.") ||
                relPath.startsWith(".")
              ) {
                continue;
              }
              const isText =
                /\.(html|htm|css|js|jsx|ts|tsx|json|svg|sql|php|py|md|txt|yaml|yml|xml|csv)$/i.test(
                  relPath,
                );
              if (isText) {
                const text = await entry.async("string");
                extracted.push({ path: relPath, content: text });
              }
            }

            if (extracted.length === 0) {
              toast.warning(`No text/code files found in ${f.name}`);
              return;
            }

            // Normalize common single top-level directory prefix (e.g. "my-project/index.html" -> "index.html")
            const paths = extracted.map((e) => e.path);
            const firstSlashIdx = paths[0]?.indexOf("/");
            if (firstSlashIdx > 0) {
              const commonPrefix = paths[0].slice(0, firstSlashIdx + 1);
              if (paths.every((p) => p.startsWith(commonPrefix))) {
                for (const item of extracted) {
                  item.path = item.path.slice(commonPrefix.length);
                }
              }
            }

            if (onZipImport) {
              await onZipImport(extracted, f.name);
            } else {
              toast.success(`Extracted ${extracted.length} code file(s) from ${f.name}`);
              onFileAttach?.({
                name: f.name,
                content: `[ZIP ARCHIVE: ${f.name} containing ${extracted.length} files]\n${extracted
                  .slice(0, 50)
                  .map((e) => `- ${e.path} (${e.content.length}b)`)
                  .join(
                    "\n",
                  )}${extracted.length > 50 ? `\n...and ${extracted.length - 50} more files` : ""}`,
                size: f.size,
                type: "application/zip",
              });
            }
          } catch (err) {
            toast.error(`Failed to unpack zip: ${f.name}`);
          }
        })();
        continue;
      }

      const isSvg = f.name.toLowerCase().endsWith(".svg") || f.type === "image/svg+xml";
      const isRasterImage = f.type.startsWith("image/") && !isSvg;

      if (isRasterImage) {
        toast.error("Image upload is disabled. Please upload code, text, or zip files.");
        continue;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        toast.error(`Failed to read file ${f.name}`);
      };
      reader.onload = () => {
        let text = String(reader.result || "").replace(/\0/g, "");
        const MAX_TEXT_BUDGET = 120_000;
        if (text.length > MAX_TEXT_BUDGET) {
          text =
            text.slice(0, MAX_TEXT_BUDGET) +
            `\n\n[... Truncated for AI context budget, original size: ${Math.round(f.size / 1024)}KB ...]`;
        }
        onFileAttach?.({
          name: f.name || `file-${Date.now()}.txt`,
          content: text,
          size: f.size,
          type: f.type,
        });
        toast.success(`Attached ${f.name}`);
      };
      reader.readAsText(f);
    }
  };

  // Auto-grow textarea between 1 and 8 rows (approx 24px to 192px)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 240;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 40), maxHeight)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isBusy && (input.trim() || attachedFiles.length > 0)) {
        onSend();
      }
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (isBusy) return;
        const files = Array.from(e.dataTransfer.files || []);
        processFiles(files);
      }}
      className={`@container relative w-full shrink-0 rounded-2xl border p-3 shadow-2xl backdrop-blur-2xl transition-all ${
        isDragging
          ? "border-white/40 bg-white/[0.06] ring-1 ring-white/30"
          : "border-white/10 bg-[#0e0e12]/95 focus-within:border-white/30 focus-within:ring-1 focus-within:ring-white/20"
      }`}
    >
      {/* Attached Files Pills (constrained max-height & summary for large batches) */}
      {attachedFiles.length > 0 && (
        <div className="mb-2 max-h-24 overflow-y-auto px-1">
          {attachedFiles.length > 4 ? (
            <div className="flex items-center justify-between rounded-lg bg-white/[0.04] border border-white/10 px-2.5 py-1 text-xs text-zinc-300">
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <FileText className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span className="font-medium text-foreground truncate">
                  {attachedFiles.length} files attached
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  (
                  {Math.round(
                    attachedFiles.reduce((acc, f) => acc + (f.size || f.content.length), 0) / 1024,
                  )}
                  KB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onClearFiles) {
                    onClearFiles();
                  } else if (onFileRemove) {
                    for (let i = attachedFiles.length - 1; i >= 0; i--) {
                      onFileRemove(i);
                    }
                  }
                }}
                className="text-[11px] text-zinc-400 hover:text-white underline cursor-pointer shrink-0 ml-2"
              >
                Clear all
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {attachedFiles.map((file, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#18181b] border border-white/10 px-2 py-0.5 text-xs text-zinc-300 shrink-0"
                >
                  <FileText className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate max-w-[130px] font-medium text-foreground/90">
                    {file.name}
                  </span>
                  {file.size ? (
                    <span className="text-[10px] text-muted-foreground/70 shrink-0">
                      ({Math.round(file.size / 1024) || 1}KB)
                    </span>
                  ) : null}
                  {onFileRemove && (
                    <button
                      type="button"
                      onClick={() => onFileRemove(idx)}
                      className="rounded p-0.5 hover:text-white"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auto-growing Textarea */}
      <textarea
        ref={textareaRef}
        value={input}
        disabled={isBusy}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={(e) => {
          if (isBusy) return;
          const items = Array.from(e.clipboardData?.items || []);
          const files: File[] = [];
          for (const item of items) {
            if (item.kind === "file") {
              const f = item.getAsFile();
              if (f) {
                if (f.type.startsWith("image/") && !f.name.toLowerCase().endsWith(".svg")) {
                  toast.error("Image pasting is disabled. Please upload code, text, or zip files.");
                  continue;
                }
                files.push(f);
              }
            }
          }
          if (files.length > 0) {
            e.preventDefault();
            processFiles(files);
          }
        }}
        placeholder={
          isBusy
            ? "Building... press Stop to cancel"
            : attachedFiles.length > 0
              ? "Describe what to do with the attached file(s), or press Enter to analyze..."
              : "Ask DevLoadable to build or change something..."
        }
        rows={1}
        className="w-full resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-60 leading-relaxed font-normal overflow-y-auto"
      />

      {/* Bottom Controls Bar: Perfectly aligned single row, no line breaks, no overflow clipping */}
      <div className="mt-2 flex items-center justify-between gap-1.5 sm:gap-2 border-t border-white/[0.08] pt-2 w-full">
        {/* Left: Attach button + Mode switch pills */}
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink">
          {/* File Attach */}
          <button
            type="button"
            disabled={isBusy}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white shrink-0"
            title="Attach code, text, or .zip archive"
            aria-label="Attach code, text, or .zip archive"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".zip,.txt,.md,.json,.html,.css,.js,.jsx,.ts,.tsx,.py,.php,.sql,.csv,.yaml,.yml,.xml,.sh"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              processFiles(files);
              e.target.value = "";
            }}
          />

          {/* Mode switch pills with tooltips */}
          <TooltipProvider>
            <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] p-0.5 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onModeChange("chat")}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors disabled:opacity-50 shrink-0 ${
                      mode === "chat"
                        ? "bg-white text-black font-semibold shadow-sm"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    {mode === "chat" && <span className="font-medium text-[11px]">Chat</span>}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Ask questions or discuss the code without editing</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onModeChange("plan")}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors disabled:opacity-50 shrink-0 ${
                      mode === "plan"
                        ? "bg-white text-black font-semibold shadow-sm"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                    {mode === "plan" && <span className="font-medium text-[11px]">Plan</span>}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Generate a multi-step execution plan first</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onModeChange("build")}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors disabled:opacity-50 shrink-0 ${
                      mode === "build"
                        ? "bg-white text-black font-semibold shadow-sm"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <Hammer className="h-3.5 w-3.5 shrink-0" />
                    {mode === "build" && <span className="font-medium text-[11px]">Build</span>}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Plan and build code automatically in real time</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>

        {/* Right: Model Picker Popover, Send/Stop Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Model picker popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={isBusy}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white shrink-0"
              >
                <span className="max-w-[72px] truncate">{PROVIDER_NAMES[provider]}</span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-52 p-1.5 shadow-floating bg-[#121215] border-white/10"
            >
              <div className="space-y-0.5">
                {AVAILABLE_PROVIDERS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onProviderChange(key)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-left transition-colors ${
                      provider === key
                        ? "bg-white/10 text-white font-medium"
                        : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <span>{PROVIDER_NAMES[key]}</span>
                    {provider === key && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </button>
                ))}
              </div>

              <div className="mt-1.5 border-t border-white/10 pt-2 px-1 pb-0.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-medium text-foreground">Auto-fix errors</span>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Automatically fix runtime errors after runs
                    </p>
                  </div>
                  <Switch
                    checked={autoFixEnabled}
                    onCheckedChange={(checked) => onAutoFixChange?.(checked)}
                    className="scale-75 origin-right shrink-0"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Send / Stop Controls */}
          {isBusy ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop build"
                className="grid h-8 w-8 place-items-center rounded-full bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white shrink-0"
                title="Stop build execution"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!input.trim() && attachedFiles.length === 0}
              aria-label="Send message"
              className="shrink-0 grid h-8 w-8 place-items-center rounded-full bg-white text-black hover:bg-zinc-200 active:scale-95 transition-all shadow-sm disabled:opacity-25 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ArrowUp className="h-4 w-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
