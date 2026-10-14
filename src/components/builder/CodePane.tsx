import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  FileCode,
  FileText,
  FileJson,
  Folder,
  FolderOpen,
  Copy,
  Check,
  Download,
  Code,
  Palette,
  Globe,
  Image,
  Search,
  X,
  Plus,
  Trash2,
  Upload,
  Save,
  FilePlus,
  FolderPlus,
} from "lucide-react";
import type { ProjectFileItem } from "@/components/builder/CodeViewer";

export interface CodePaneProps {
  files: ProjectFileItem[];
  recentlyUpdated?: Map<string, "created" | "edited">;
  initialSelectedPath?: string | null;
  onSaveFile?: (path: string, content: string) => Promise<void>;
  onCreateFile?: (path: string, content?: string) => Promise<void>;
  onDeleteFile?: (path: string) => Promise<void>;
  onUploadFile?: (path: string, content: string) => Promise<void>;
  readOnly?: boolean;
}

type TreeNode = {
  name: string;
  path: string;
  isFolder: boolean;
  children: Map<string, TreeNode>;
  file?: ProjectFileItem;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return <Globe className="h-3.5 w-3.5 text-orange-400" />;
    case "css":
    case "scss":
      return <Palette className="h-3.5 w-3.5 text-sky-400" />;
    case "js":
    case "mjs":
    case "cjs":
    case "ts":
    case "jsx":
    case "tsx":
      return <Code className="h-3.5 w-3.5 text-amber-400" />;
    case "json":
      return <FileJson className="h-3.5 w-3.5 text-emerald-400" />;
    case "svg":
      return <Image className="h-3.5 w-3.5 text-pink-400" />;
    case "php":
      return <FileCode className="h-3.5 w-3.5 text-indigo-400" />;
    case "py":
      return <FileCode className="h-3.5 w-3.5 text-blue-400" />;
    case "sql":
      return <FileCode className="h-3.5 w-3.5 text-violet-400" />;
    case "md":
    case "txt":
      return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <FileCode className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getLanguageLabel(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "HTML";
    case "css":
      return "CSS";
    case "js":
    case "mjs":
      return "JavaScript";
    case "jsx":
      return "React JSX";
    case "ts":
      return "TypeScript";
    case "tsx":
      return "React TSX";
    case "json":
      return "JSON";
    case "svg":
      return "SVG";
    case "php":
      return "PHP";
    case "py":
      return "Python";
    case "sql":
      return "SQL";
    case "md":
      return "Markdown";
    default:
      return "Plain Text";
  }
}

function CodePaneComponent({
  files,
  recentlyUpdated = new Map(),
  initialSelectedPath,
  onSaveFile,
  onCreateFile,
  onDeleteFile,
  onUploadFile,
  readOnly = false,
}: CodePaneProps) {
  const [filterQuery, setFilterQuery] = useState("");
  const [activePath, setActivePath] = useState<string>("");
  const [mobileShowExplorer, setMobileShowExplorer] = useState(false);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Unsaved changes buffer per file
  const [unsavedMap, setUnsavedMap] = useState<Map<string, string>>(new Map());

  // New file input state
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize tabs and active file
  useEffect(() => {
    if (files.length === 0) {
      setActivePath("");
      setOpenTabs([]);
      return;
    }
    const defaultFile =
      initialSelectedPath && files.some((f) => f.path === initialSelectedPath)
        ? initialSelectedPath
        : files.some((f) => f.path === "index.html")
          ? "index.html"
          : files[0].path;

    setActivePath((prev) => (files.some((f) => f.path === prev) ? prev : defaultFile));
    setOpenTabs((prev) => {
      const valid = prev.filter((p) => files.some((f) => f.path === p));
      return valid.length === 0 ? [defaultFile] : valid;
    });
  }, [files, initialSelectedPath]);

  // When initialSelectedPath changes externally
  useEffect(() => {
    if (initialSelectedPath && files.some((f) => f.path === initialSelectedPath)) {
      openFile(initialSelectedPath);
    }
  }, [initialSelectedPath]);

  // Focus new file input when shown
  useEffect(() => {
    if (isCreatingFile) {
      setTimeout(() => newFileInputRef.current?.focus(), 50);
    }
  }, [isCreatingFile]);

  const openFile = (path: string) => {
    setActivePath(path);
    setMobileShowExplorer(false);
    setOpenTabs((prev) => {
      if (prev.includes(path)) return prev;
      if (prev.length >= 8) {
        return [...prev.slice(1), path];
      }
      return [...prev, path];
    });
  };

  const closeTab = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    setOpenTabs((prev) => {
      const next = prev.filter((p) => p !== path);
      if (activePath === path && next.length > 0) {
        setActivePath(next[next.length - 1]);
      }
      return next;
    });
  };

  const originalFile = useMemo(() => {
    return files.find((f) => f.path === activePath) || null;
  }, [files, activePath]);

  // Content shown in the editor: unsaved edit buffer or original content
  const currentContent = useMemo(() => {
    if (unsavedMap.has(activePath)) {
      return unsavedMap.get(activePath)!;
    }
    return originalFile ? originalFile.content : "";
  }, [unsavedMap, activePath, originalFile]);

  const isDirty = useMemo(() => {
    if (!originalFile) return false;
    if (!unsavedMap.has(activePath)) return false;
    return unsavedMap.get(activePath) !== originalFile.content;
  }, [unsavedMap, activePath, originalFile]);

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setUnsavedMap((prev) => {
      const next = new Map(prev);
      if (originalFile && val === originalFile.content) {
        next.delete(activePath);
      } else {
        next.set(activePath, val);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!activePath || !onSaveFile || !isDirty || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveFile(activePath, currentContent);
      setUnsavedMap((prev) => {
        const next = new Map(prev);
        next.delete(activePath);
        return next;
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePath, currentContent, isDirty, isSaving]);

  // Handle Tab key in editor to insert 2 spaces
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      const newVal = val.substring(0, start) + "  " + val.substring(end);

      setUnsavedMap((prev) => {
        const next = new Map(prev);
        next.set(activePath, newVal);
        return next;
      });

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  // Create new file
  const handleConfirmCreateFile = async () => {
    const clean = newFilePath.trim().replace(/^\/+/, "");
    if (!clean) {
      setIsCreatingFile(false);
      return;
    }
    if (onCreateFile) {
      await onCreateFile(clean, "");
      openFile(clean);
    }
    setNewFilePath("");
    setIsCreatingFile(false);
  };

  // Upload file into codebase
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    if (onUploadFile) {
      await onUploadFile(f.name, text);
      openFile(f.name);
    }
    e.target.value = "";
  };

  // Delete file
  const handleDelete = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    if (!onDeleteFile) return;
    if (window.confirm(`Are you sure you want to delete ${path}?`)) {
      await onDeleteFile(path);
      setOpenTabs((prev) => prev.filter((p) => p !== path));
      setUnsavedMap((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
    }
  };

  // Filtered files for the tree
  const filteredFiles = useMemo(() => {
    if (!filterQuery.trim()) return files;
    return files.filter((f) => f.path.toLowerCase().includes(filterQuery.toLowerCase().trim()));
  }, [files, filterQuery]);

  // Build directory tree
  const treeRoot = useMemo(() => {
    const root: TreeNode = {
      name: "root",
      path: "",
      isFolder: true,
      children: new Map(),
    };

    for (const file of filteredFiles) {
      const parts = file.path.split("/");
      let current = root;
      let currentPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = i === parts.length - 1;

        if (isLast) {
          current.children.set(part, {
            name: part,
            path: currentPath,
            isFolder: false,
            children: new Map(),
            file,
          });
        } else {
          if (!current.children.has(part)) {
            current.children.set(part, {
              name: part,
              path: currentPath,
              isFolder: true,
              children: new Map(),
            });
          }
          current = current.children.get(part)!;
        }
      }
    }

    return root;
  }, [filteredFiles]);

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const copyContent = async () => {
    await navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSingleFile = () => {
    const blob = new Blob([currentContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activePath.split("/").pop() || "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const lines = useMemo(() => {
    return currentContent.split("\n");
  }, [currentContent]);

  const renderTree = (node: TreeNode, depth = 0) => {
    const sortedEntries = Array.from(node.children.entries()).sort(([, a], [, b]) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    return sortedEntries.map(([name, child]) => {
      if (child.isFolder) {
        const isCollapsed = collapsedFolders.has(child.path);
        return (
          <div key={child.path}>
            <button
              type="button"
              onClick={() => toggleFolder(child.path)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-medium text-foreground/80 hover:bg-secondary/60 transition-colors"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              {isCollapsed ? (
                <Folder className="h-3.5 w-3.5 text-muted-foreground/70" />
              ) : (
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="truncate">{name}</span>
            </button>
            {!isCollapsed && renderTree(child, depth + 1)}
          </div>
        );
      }

      const isSelected = child.path === activePath;
      const isUpdated = recentlyUpdated.has(child.path);
      const isFileDirty = unsavedMap.has(child.path);
      const fileSize = child.file ? formatBytes(child.file.content.length) : "";

      return (
        <div
          key={child.path}
          onClick={() => openFile(child.path)}
          className={`group flex w-full items-center justify-between gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors cursor-pointer ${
            isSelected
              ? "bg-secondary text-foreground font-medium"
              : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            {getFileIcon(child.path)}
            <span className="truncate">{name}</span>
            {isFileDirty && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes" />
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isUpdated && (
              <span className="h-1.5 w-1.5 rounded-full bg-brand" title="Changed in latest run" />
            )}
            <span className="text-[10px] text-muted-foreground/60 group-hover:hidden">
              {fileSize}
            </span>
            {onDeleteFile && !readOnly && (
              <button
                type="button"
                onClick={(e) => handleDelete(e, child.path)}
                className="hidden group-hover:inline-flex rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                title={`Delete ${name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col md:grid md:grid-cols-[250px_1fr] h-full divide-y md:divide-y-0 md:divide-x divide-border/80 bg-background overflow-hidden relative">
      {/* Left File Tree (250px on desktop, full-width toggleable on mobile) */}
      <div
        className={`${mobileShowExplorer ? "flex" : "hidden"} md:flex h-full flex-col overflow-hidden bg-card/40 w-full md:w-[250px] shrink-0`}
      >
        {/* Explorer Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          <span>Explorer</span>
          <div className="flex items-center gap-1">
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => setIsCreatingFile(true)}
                  className="rounded p-1 hover:bg-secondary hover:text-foreground transition-colors"
                  title="New File (e.g. api.js or components/header.html)"
                >
                  <FilePlus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="rounded p-1 hover:bg-secondary hover:text-foreground transition-colors"
                  title="Upload File to Codebase"
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
                <input
                  ref={uploadInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </>
            )}
            <button
              type="button"
              onClick={() => setMobileShowExplorer(false)}
              className="md:hidden rounded p-1 hover:bg-secondary hover:text-foreground transition-colors"
              title="Close Explorer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Filter input */}
        <div className="border-b border-border/80 p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter files..."
              className="w-full rounded-md border border-border/60 bg-secondary/30 py-1 pl-8 pr-2 text-xs text-foreground outline-none focus:border-ring"
            />
          </div>
        </div>

        {/* Inline New File input */}
        {isCreatingFile && (
          <div className="border-b border-border/80 p-2 bg-secondary/30">
            <div className="flex items-center gap-1.5 w-full">
              <input
                ref={newFileInputRef}
                type="text"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirmCreateFile();
                  if (e.key === "Escape") setIsCreatingFile(false);
                }}
                placeholder="path/file.ext..."
                className="flex-1 min-w-0 rounded border border-white/20 bg-background px-2.5 py-1 text-xs text-foreground outline-none font-mono focus:border-white/50"
              />
              <button
                type="button"
                onClick={handleConfirmCreateFile}
                className="rounded bg-white text-black font-semibold px-2.5 py-1 text-xs hover:bg-zinc-200 shrink-0 transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingFile(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Tree Container */}
        <div className="flex-1 overflow-y-auto p-1.5 font-mono">
          {files.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No files in project yet.
            </div>
          ) : (
            renderTree(treeRoot)
          )}
        </div>
      </div>

      {/* Right Pane: Open File Tabs + VS Code-style Interactive Editor */}
      <div
        className={`${!mobileShowExplorer ? "flex" : "hidden"} md:flex h-full flex-col overflow-hidden bg-[#0d0d12] min-w-0`}
      >
        {/* Open File Tabs */}
        {openTabs.length > 0 && (
          <div className="flex items-center overflow-x-auto border-b border-border/80 bg-card/30 px-2 pt-1.5 select-none">
            {openTabs.map((tabPath) => {
              const isActive = tabPath === activePath;
              const fileName = tabPath.split("/").pop() || tabPath;
              const isTabDirty = unsavedMap.has(tabPath);
              return (
                <div
                  key={tabPath}
                  onClick={() => setActivePath(tabPath)}
                  className={`group flex items-center gap-1.5 rounded-t-lg border-t border-x px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer ${
                    isActive
                      ? "border-border/80 bg-[#0d0d12] text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                  }`}
                >
                  {getFileIcon(tabPath)}
                  <span className="truncate max-w-[130px]">{fileName}</span>
                  {isTabDirty && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-amber-400"
                      title="Unsaved changes"
                    />
                  )}
                  {openTabs.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => closeTab(e, tabPath)}
                      className="ml-1 rounded p-0.5 opacity-50 hover:opacity-100 hover:text-foreground"
                      aria-label={`Close ${fileName}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Code Content View */}
        {activePath ? (
          <>
            {/* Header Toolbar: Path, Save button, Copy button, Download button */}
            <div className="flex items-center justify-between border-b border-border/60 bg-card/20 px-3 sm:px-4 py-2 text-xs gap-2">
              <div className="flex items-center gap-2 overflow-hidden font-mono min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileShowExplorer(true)}
                  className="md:hidden inline-flex items-center gap-1 rounded border border-border/60 bg-secondary/50 px-2 py-1 text-xs font-sans text-muted-foreground hover:text-foreground shrink-0"
                  title="View files"
                >
                  <Folder className="h-3.5 w-3.5" />
                  <span className="text-[11px]">Files</span>
                </button>
                <span className="font-semibold text-foreground truncate">{activePath}</span>
                {isDirty && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300 font-sans shrink-0">
                    Unsaved
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground hidden sm:inline shrink-0">
                  ({lines.length} lines, {formatBytes(currentContent.length)})
                </span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {onSaveFile && !readOnly && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!isDirty || isSaving}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                      isDirty
                        ? "bg-brand text-white shadow-sm hover:opacity-90 active:scale-95"
                        : "border border-border/60 bg-secondary/30 text-muted-foreground/50 cursor-not-allowed"
                    }`}
                    title="Save Changes (Ctrl+S / Cmd+S)"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{isSaving ? "Saving..." : "Save"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={copyContent}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={downloadSingleFile}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* VS Code Interactive Code Editor with synchronized gutter */}
            <div className="relative flex-1 overflow-hidden flex bg-[#09090d]">
              {/* Line Numbers Gutter */}
              <div
                className="select-none border-r border-border/40 bg-card/20 px-3 py-3 text-right font-mono text-[12px] text-muted-foreground/40 overflow-hidden"
                style={{ width: `${Math.max(40, String(lines.length).length * 10 + 20)}px` }}
              >
                {lines.map((_, i) => (
                  <div key={i} className="leading-6">
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Editable Textarea */}
              <textarea
                ref={editorTextareaRef}
                value={currentContent}
                onChange={handleEditorChange}
                onKeyDown={handleEditorKeyDown}
                readOnly={readOnly}
                spellCheck={false}
                wrap="off"
                className="flex-1 resize-none bg-transparent p-3 font-mono text-[13px] leading-6 text-foreground/90 outline-none select-text overflow-auto font-normal tab-4 focus:ring-0"
              />
            </div>

            {/* VS Code Bottom Status Bar */}
            <div className="flex items-center justify-between border-t border-border/60 bg-card/40 px-3 py-1 text-[11px] font-mono text-muted-foreground/70 select-none whitespace-nowrap overflow-hidden">
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <span>Ln {lines.length}, Col 1</span>
                <span className="hidden sm:inline">Spaces: 2</span>
                <span className="hidden sm:inline">UTF-8</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="truncate max-w-[100px] sm:max-w-none">
                  {getLanguageLabel(activePath)}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted-foreground p-6 text-center select-none">
            <div className="max-w-xs space-y-2">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-400">
                <FileCode className="h-6 w-6" />
              </div>
              <p className="font-medium text-foreground text-sm">
                {files.length === 0 ? "No files created yet" : "No file selected"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {files.length === 0
                  ? "Describe your app in Chat to generate the project files."
                  : "Select a file from the explorer to view or edit its source code."}
              </p>
              {files.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMobileShowExplorer(true)}
                  className="mt-3 md:hidden inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-secondary px-3 py-1.5 text-xs text-foreground"
                >
                  <Folder className="h-3.5 w-3.5" />
                  <span>Open Files</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const CodePane = React.memo(CodePaneComponent);
