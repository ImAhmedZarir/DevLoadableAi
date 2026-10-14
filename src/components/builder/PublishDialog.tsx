import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Globe, Check, Copy, ExternalLink, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { publishProject, unpublishProject, checkSlugAvailability } from "@/lib/agent.functions";
import { CANONICAL_BASE_URL } from "@/lib/page-meta";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  existingPub: {
    slug: string;
    published_at: string;
    show_badge?: boolean;
  } | null;
  onPublishedChange?: () => void;
}

export function PublishDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  existingPub,
  onPublishedChange,
}: PublishDialogProps) {
  const publishFn = useServerFn(publishProject);
  const unpublishFn = useServerFn(unpublishProject);
  const checkSlugFn = useServerFn(checkSlugAvailability);

  const defaultSlug =
    (projectName || "my-website")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "my-website";

  const [slug, setSlug] = useState(existingPub?.slug || defaultSlug);
  const [showBadge, setShowBadge] = useState(existingPub?.show_badge ?? true);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(true);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(
    existingPub
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${existingPub.slug}`
      : null,
  );

  useEffect(() => {
    if (existingPub) {
      setSlug(existingPub.slug);
      setShowBadge(existingPub.show_badge ?? true);
      setPublishedUrl(`${window.location.origin}/p/${existingPub.slug}`);
    } else {
      setSlug(defaultSlug);
      setShowBadge(true);
      setPublishedUrl(null);
    }
  }, [existingPub, defaultSlug]);

  // Live availability check
  useEffect(() => {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) {
      setSlugError("Slug cannot be empty");
      setIsSlugAvailable(false);
      return;
    }

    if (trimmed.length < 3 || trimmed.length > 40) {
      setSlugError("Slug must be between 3 and 40 characters");
      setIsSlugAvailable(false);
      return;
    }

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{3,}$/.test(trimmed)) {
      setSlugError("Must contain only lowercase letters, numbers, and hyphens");
      setIsSlugAvailable(false);
      return;
    }

    setSlugError(null);
    setIsCheckingSlug(true);

    const timer = setTimeout(async () => {
      try {
        const res = await checkSlugFn({ data: { projectId, slug: trimmed } });
        setIsSlugAvailable(res.available);
        if (!res.available) {
          setSlugError("This URL is already taken by another project");
        }
      } catch {
        setIsSlugAvailable(true);
      } finally {
        setIsCheckingSlug(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [slug, projectId, checkSlugFn]);

  async function handlePublish() {
    if (!slug || slugError || !isSlugAvailable) return;
    setIsSubmitting(true);
    try {
      const res = await publishFn({
        data: {
          projectId,
          slug: slug.trim().toLowerCase(),
          showBadge,
        },
      });
      const url = `${window.location.origin}/p/${res.slug}`;
      setPublishedUrl(url);
      toast.success(existingPub ? "Website updated!" : "Website published live!");
      onPublishedChange?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUnpublish() {
    if (
      !confirm("Are you sure you want to unpublish this website? The public URL will return 404.")
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      await unpublishFn({ data: { projectId } });
      setPublishedUrl(null);
      toast.success("Website unpublished successfully");
      onPublishedChange?.();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to unpublish");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCopy() {
    if (!publishedUrl) return;
    navigator.clipboard.writeText(publishedUrl);
    setCopied(true);
    toast.success("URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  const origin = typeof window !== "undefined" ? window.location.origin : CANONICAL_BASE_URL;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/80 bg-card p-6 shadow-floating">
        <DialogHeader className="gap-1.5 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient/10 text-brand-from">
              <Globe className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-semibold text-foreground">
              {existingPub ? "Manage publication" : "Publish website"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Share your website with a public link hosted instantly on DevLoadable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Slug input & URL Preview */}
          <div className="space-y-1.5">
            <Label htmlFor="pub-slug" className="text-xs font-medium text-foreground">
              Custom URL slug
            </Label>
            <div className="flex items-center rounded-lg border border-border/80 bg-secondary/40 px-3 py-1.5 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
              <span className="text-xs text-muted-foreground">{origin}/p/</span>
              <input
                id="pub-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="my-portfolio"
                className="flex-1 bg-transparent text-xs font-medium text-foreground outline-none"
                disabled={isSubmitting}
              />
              {isCheckingSlug ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : isSlugAvailable && !slugError ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
              )}
            </div>
            {slugError && <p className="text-[11px] text-rose-400">{slugError}</p>}
          </div>

          {/* Badge toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 p-3">
            <div className="space-y-0.5 pr-2">
              <Label
                htmlFor="badge-toggle"
                className="text-xs font-medium text-foreground cursor-pointer"
              >
                Show &quot;Built with DevLoadable&quot; badge
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Displays a small pill linking to DevLoadable in the bottom right corner.
              </p>
            </div>
            <Switch
              id="badge-toggle"
              checked={showBadge}
              onCheckedChange={setShowBadge}
              disabled={isSubmitting}
            />
          </div>

          {/* Help note */}
          <div className="rounded-lg border border-border/40 bg-secondary/10 p-2.5">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Note:</span> Data saved by your app
              lives only in the visitor&apos;s current session on published links.
            </p>
          </div>

          {/* Published state summary */}
          {existingPub && (
            <div className="flex items-center justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground">
              <span>
                Last published:{" "}
                <span className="text-foreground">
                  {new Date(existingPub.published_at).toLocaleDateString()} at{" "}
                  {new Date(existingPub.published_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
            </div>
          )}

          {/* Success link card if published */}
          {publishedUrl && (
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="min-w-0 pr-2">
                <p className="text-[11px] font-medium text-emerald-400">Live website</p>
                <p className="truncate text-xs text-foreground font-mono">{publishedUrl}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/80 bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy link"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <a
                  href={publishedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/80 bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                  title="Open live website"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-2">
            {existingPub ? (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Unpublish
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg border border-border/80 bg-secondary/40 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                disabled={isSubmitting}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={isSubmitting || !isSlugAvailable || !!slugError}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gradient px-4 py-1.5 text-xs font-medium text-white shadow hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Globe className="h-3.5 w-3.5" />
                    {existingPub ? "Update website" : "Publish website"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
