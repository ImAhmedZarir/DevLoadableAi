import React, { useState, useMemo, useEffect } from "react";
import {
  FileCode,
  FileText,
  FileJson,
  Folder,
  FolderOpen,
  Copy,
  Check,
  Download,
  File,
  Code,
  Palette,
  Globe,
  Image,
  X,
} from "lucide-react";

export type ProjectFileItem = {
  path: string;
  content: string;
  is_upload?: boolean;
};

interface CodeViewerProps {
  files: ProjectFileItem[];
  recentlyUpdated?: Map<string, "created" | "edited">;
  onDownloadZip: () => void;
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
      return <Globe className="h-3.5 w-3.5 text-orange-400" />;
    case "css":
      return <Palette className="h-3.5 w-3.5 text-sky-400" />;
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
      return <Code className="h-3.5 w-3.5 text-amber-400" />;
    case "json":
      return <FileJson className="h-3.5 w-3.5 text-emerald-400" />;
    case "svg":
      return <Image className="h-3.5 w-3.5 text-pink-400" />;
    case "md":
    case "txt":
      return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <FileCode className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export function CodeViewer({ files, recentlyUpdated = new Map(), onDownloadZip }: CodeViewerProps) {
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [mobileShowFiles, setMobileShowFiles] = useState(false);

  // Set default selected file to index.html if present, or first file
  useEffect(() => {
    if (files.length === 0) return;
    if (!selectedPath || !files.some((f) => f.path === selectedPath)) {
      const indexFile = files.find((f) => f.path === "index.html");
      setSelectedPath(indexFile ? indexFile.path : files[0].path);
    }
  }, [files, selectedPath]);

  const selectedFile = useMemo(() => {
    return files.find((f) => f.path === selectedPath) || files[0] || null;
  }, [files, selectedPath]);

  // Compute total size
  const totalSize = useMemo(() => {
    return files.reduce((acc, f) => acc + (f.content?.length || 0), 0);
  }, [files]);

  // Build directory tree
  const treeRoot = useMemo(() => {
    const root: TreeNode = {
      name: "root",
      path: "",
      isFolder: true,
      children: new Map(),
    };

    for (const file of files) {
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
  }, [files]);

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const copyContent = async () => {
    if (!selectedFile) return;
    await navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSingleFile = () => {
    if (!selectedFile) return;
    const blob = new Blob([selectedFile.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedFile.path.split("/").pop() || "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const lines = useMemo(() => {
    if (!selectedFile) return [];
    return selectedFile.content.split("\n");
  }, [selectedFile]);

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
              onClick={() => toggleFolder(child.path)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-medium text-foreground/80 hover:bg-secondary/60"
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

      const isSelected = child.path === selectedPath;
      const status = recentlyUpdated.get(child.path);

      return (
        <button
          key={child.path}
          onClick={() => {
            setSelectedPath(child.path);
            setMobileShowFiles(false);
          }}
          className={`group flex w-full items-center justify-between gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors ${
            isSelected
              ? "bg-primary/15 font-medium text-foreground"
              : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            {getFileIcon(child.path)}
            <span className="truncate">{name}</span>
          </div>
          {status && (
            <span
              className={`rounded px-1 py-0.2 text-[9px] font-semibold uppercase tracking-wider ${
                status === "created"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}
            >
              {status === "created" ? "New" : "Edit"}
            </span>
          )}
        </button>
      );
    });
  };

  return (
    <div className="flex flex-col md:grid md:grid-cols-[240px_1fr] h-full divide-y md:divide-y-0 md:divide-x divide-border/60 bg-card/20 overflow-hidden relative">
      {/* Left pane: File tree (toggleable on mobile) */}
      <div
        className={`${mobileShowFiles ? "flex" : "hidden"} md:flex h-full flex-col overflow-hidden bg-card/40 w-full md:w-auto shrink-0`}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs">
          <div className="font-semibold text-foreground">Project Files</div>
          <div className="flex items-center gap-2">
            <div className="font-mono text-[11px] text-muted-foreground">
              {files.length} {files.length === 1 ? "file" : "files"} ({formatBytes(totalSize)})
            </div>
            <button
              type="button"
              onClick={() => setMobileShowFiles(false)}
              className="md:hidden rounded p-1 hover:bg-secondary hover:text-foreground"
              title="Close file list"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

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

      {/* Right pane: Code content with line numbers */}
      <div
        className={`${!mobileShowFiles ? "flex" : "hidden"} md:flex h-full flex-col overflow-hidden bg-background/50 min-w-0`}
      >
        {selectedFile ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-border/60 bg-card/30 px-3 sm:px-4 py-2 text-xs gap-2">
              <div className="flex items-center gap-2 overflow-hidden font-mono min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileShowFiles(true)}
                  className="md:hidden inline-flex items-center gap-1 rounded border border-border/60 bg-secondary/50 px-2 py-1 text-xs font-sans text-muted-foreground hover:text-foreground shrink-0"
                  title="View file list"
                >
                  <Folder className="h-3.5 w-3.5" />
                  <span className="text-[11px]">Files</span>
                </button>
                {getFileIcon(selectedFile.path)}
                <span className="font-semibold text-foreground truncate">{selectedFile.path}</span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline shrink-0">
                  ({lines.length} lines, {formatBytes(selectedFile.content.length)})
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={copyContent}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Copy file contents"
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
                  onClick={downloadSingleFile}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Download this file"
                >
                  <Download className="h-3.5 w-3.5" /> File
                </button>

                <button
                  onClick={onDownloadZip}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Download all files as ZIP"
                >
                  <Download className="h-3.5 w-3.5" /> ZIP
                </button>
              </div>
            </div>

            {/* Code lines */}
            <div className="flex-1 overflow-auto font-mono text-xs leading-relaxed">
              <div className="flex min-w-full">
                {/* Line numbers gutter */}
                <div className="select-none border-r border-border/40 bg-card/20 px-3 py-3 text-right font-mono text-[11px] text-muted-foreground/50">
                  {lines.map((_, i) => (
                    <div key={i} className="leading-5">
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Code text */}
                <pre className="flex-1 overflow-x-auto p-3 font-mono text-[12px] leading-5 text-foreground/90">
                  <code>
                    {lines.map((line, i) => (
                      <div key={i} className="whitespace-pre">
                        {line || "\n"}
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted-foreground p-4 text-center">
            <div>
              <p>Select a file on the left to view code.</p>
              <button
                type="button"
                onClick={() => setMobileShowFiles(true)}
                className="mt-3 md:hidden inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs text-foreground"
              >
                <Folder className="h-3.5 w-3.5" />
                <span>Open Files</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
