import React, { useState, useEffect } from "react";
import {
  History,
  RotateCcw,
  Eye,
  Loader2,
  FileCode,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  listVersions,
  getVersionDetails,
  revertToVersion,
  type VersionItem,
} from "@/lib/version.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { buildPreviewDoc } from "@/lib/preview-builder";

interface VersionsPaneProps {
  projectId: string;
  isBuilding: boolean;
  onVersionRestored?: () => void;
}

export function VersionsPane({ projectId, isBuilding, onVersionRestored }: VersionsPaneProps) {
  const listVersionsFn = useServerFn(listVersions);
  const getVersionDetailsFn = useServerFn(getVersionDetails);
  const revertFn = useServerFn(revertToVersion);

  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmVersion, setConfirmVersion] = useState<VersionItem | null>(null);

  // Preview modal state
  const [previewVersion, setPreviewVersion] = useState<VersionItem | null>(null);
  const [previewFiles, setPreviewFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [previewDoc, setPreviewDoc] = useState<string>("");
  const [loadingPreview, setLoadingPreview] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await listVersionsFn({ data: { projectId } });
      setVersions(res ?? []);
    } catch (err: unknown) {
      console.error("Failed to load versions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const handleOpenPreview = async (v: VersionItem) => {
    setPreviewVersion(v);
    setLoadingPreview(true);
    try {
      const details = await getVersionDetailsFn({ data: { versionId: v.id } });
      setPreviewFiles(details.files);
      const doc = buildPreviewDoc({
        files: details.files,
        page: "index.html",
        projectId,
      });
      setPreviewDoc(doc);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Failed to load version preview: " + msg);
      setPreviewVersion(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!confirmVersion) return;
    setRestoringId(confirmVersion.id);
    try {
      await revertFn({ data: { versionId: confirmVersion.id } });
      toast.success(`Restored version: ${confirmVersion.label}`);
      setConfirmVersion(null);
      await load();
      onVersionRestored?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to restore version";
      toast.error(msg);
    } finally {
      setRestoringId(null);
    }
  };

  function formatRelative(dateStr: string): string {
    const d = new Date(dateStr);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/80 bg-card/60 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-brand-from" />
          <h3 className="text-xs font-semibold text-foreground">Version history</h3>
          <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] text-muted-foreground font-medium">
            {versions.length} snapshots
          </span>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {/* Timeline body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-brand-from" />
            <span>Loading version history...</span>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center p-6 select-none">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary/60">
              <History className="h-6 w-6 text-muted-foreground" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">No versions yet</h4>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              Automatic snapshots are saved before and after each build run.
            </p>
          </div>
        ) : (
          <div className="relative border-l border-border/60 ml-4 space-y-6">
            {versions.map((v, index) => {
              const isCurrent = index === 0;
              const isRestoring = restoringId === v.id;

              return (
                <div key={v.id} className="relative pl-6">
                  {/* Timeline dot */}
                  <div
                    className={`absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-background transition-colors ${
                      isCurrent
                        ? "bg-brand-from ring-2 ring-brand-from/20"
                        : "bg-muted-foreground/60"
                    }`}
                  />

                  {/* Card */}
                  <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm hover:border-border transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {v.label}
                          </span>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-from/15 px-2 py-0.5 text-[10px] font-medium text-brand-from">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Current
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span>{formatRelative(v.createdAt)}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <FileCode className="h-3 w-3" />
                            {v.fileCount} {v.fileCount === 1 ? "file" : "files"}
                          </span>
                          {v.changedCount > 0 && !isCurrent && (
                            <>
                              <span>·</span>
                              <span className="text-emerald-400">
                                {v.changedCount} files modified
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(v)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-secondary/40 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Eye className="h-3 w-3" />
                          Preview
                        </button>

                        {!isCurrent && (
                          <button
                            type="button"
                            disabled={isBuilding || isRestoring}
                            onClick={() => setConfirmVersion(v)}
                            className="inline-flex items-center gap-1 rounded-lg border border-brand/30 bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-from hover:bg-brand/20 transition-colors disabled:opacity-50"
                          >
                            {isRestoring ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Restore Confirmation AlertDialog */}
      <AlertDialog
        open={!!confirmVersion}
        onOpenChange={(open) => !open && setConfirmVersion(null)}
      >
        <AlertDialogContent className="border-border/80 bg-card shadow-floating">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Restore this version?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
              This replaces your current project files with &ldquo;{confirmVersion?.label}&rdquo;. A
              backup snapshot will be automatically saved as &ldquo;Before revert&rdquo; first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/80 bg-secondary/40 text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRestore}
              className="bg-brand-gradient text-xs text-white shadow hover:opacity-90"
            >
              Restore version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Snapshot Preview Modal (80vh read-only) */}
      <Dialog open={!!previewVersion} onOpenChange={(open) => !open && setPreviewVersion(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 border-border/80 bg-card overflow-hidden shadow-floating">
          <DialogHeader className="flex h-12 flex-row items-center justify-between border-b border-border/60 px-4 py-0">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-brand-from" />
              <DialogTitle className="text-xs font-semibold text-foreground">
                Preview snapshot: {previewVersion?.label}
              </DialogTitle>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                Read-only
              </span>
            </div>
          </DialogHeader>

          <div className="flex-1 bg-white relative overflow-hidden">
            {loadingPreview ? (
              <div className="flex h-full w-full items-center justify-center bg-card text-xs text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-brand-from" />
                <span>Generating preview...</span>
              </div>
            ) : (
              <iframe
                srcDoc={previewDoc}
                title="Snapshot preview"
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
