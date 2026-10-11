import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus,
  ExternalLink,
  Trash2,
  MoreVertical,
  Edit2,
  Copy,
  Search,
  ArrowUp,
  FileCode,
  Layers,
  Sparkles,
  Globe,
  ArrowRight,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { pageMeta } from "@/lib/page-meta";
import { generateProjectNameFromIdea } from "@/lib/project-naming";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () =>
    pageMeta(
      "Your projects",
      "Manage your DevLoadable projects, fullstack code, and published applications. Part of ZarGPT.",
    ),
});

type Project = {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
};

type Pub = { project_id: string; slug: string };

function getProjectGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 50) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 45%, 22%) 0%, hsl(${h2}, 60%, 14%) 100%)`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (name.trim().slice(0, 2) || "PR").toUpperCase();
}

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString();
}

let dashboardDataCache: {
  userId: string;
  projects: Project[];
  pubs: Record<string, string>;
  fileCounts: Record<string, number>;
} | null = null;

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasCache = Boolean(dashboardDataCache && user && dashboardDataCache.userId === user.id);
  const [projects, setProjects] = useState<Project[]>(hasCache ? dashboardDataCache!.projects : []);
  const [pubs, setPubs] = useState<Record<string, string>>(hasCache ? dashboardDataCache!.pubs : {});
  const [fileCounts, setFileCounts] = useState<Record<string, number>>(
    hasCache ? dashboardDataCache!.fileCounts : {},
  );
  const [loading, setLoading] = useState(!hasCache);
  const [quickPrompt, setQuickPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name">("recent");

  // Dialog states
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToRename, setProjectToRename] = useState<Project | null>(null);
  const [renameInput, setRenameInput] = useState("");

  async function load(showSkeleton = false) {
    if (!user) return;
    if (showSkeleton && !hasCache) {
      setLoading(true);
    }
    try {
      const [{ data: p }, { data: pb }, { data: filesData }] = await Promise.all([
        supabase
          .from("projects")
          .select("id,name,description,updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
        supabase.from("publications").select("project_id,slug").eq("user_id", user.id),
        supabase.from("project_files").select("project_id").eq("user_id", user.id),
      ]);

      const loadedProjects = p ?? [];
      const loadedPubs = Object.fromEntries(((pb ?? []) as Pub[]).map((r) => [r.project_id, r.slug]));
      const counts: Record<string, number> = {};
      for (const f of filesData ?? []) {
        counts[f.project_id] = (counts[f.project_id] || 0) + 1;
      }

      setProjects(loadedProjects);
      setPubs(loadedPubs);
      setFileCounts(counts);

      dashboardDataCache = {
        userId: user.id,
        projects: loadedProjects,
        pubs: loadedPubs,
        fileCounts: counts,
      };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
  }, [user]);

  async function createFromPrompt() {
    if (!user) return;
    const p = quickPrompt.trim();
    if (!p) return;
    setCreating(true);

    const projectName = generateProjectNameFromIdea(p);
    try {
      const { data, error } = await supabase
        .from("projects")
        .insert({ user_id: user.id, name: projectName })
        .select("id")
        .single();

      if (error || !data) {
        toast.error(error?.message ?? "Failed to create project");
        setCreating(false);
        return;
      }

      sessionStorage.setItem(`loadable:seed:${data.id}`, p);
      sessionStorage.setItem(
        `loadable:seedopts:${data.id}`,
        JSON.stringify({ mode: "build", provider: "build-max" }),
      );
      navigate({ to: "/builder/$projectId", params: { projectId: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
      setCreating(false);
    }
  }

  async function createBlank() {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("projects")
        .insert({ user_id: user.id, name: "New Project" })
        .select("id")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Failed");
        return;
      }
      navigate({ to: "/builder/$projectId", params: { projectId: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleDelete() {
    if (!projectToDelete) return;
    try {
      const { error } = await supabase.from("projects").delete().eq("id", projectToDelete.id);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Project deleted");
        setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      }
    } finally {
      setProjectToDelete(null);
    }
  }

  async function handleRename() {
    if (!projectToRename || !renameInput.trim()) return;
    try {
      const { error } = await supabase
        .from("projects")
        .update({ name: renameInput.trim(), updated_at: new Date().toISOString() })
        .eq("id", projectToRename.id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Project renamed");
        setProjects((prev) =>
          prev.map((p) => (p.id === projectToRename.id ? { ...p, name: renameInput.trim() } : p)),
        );
      }
    } finally {
      setProjectToRename(null);
    }
  }

  async function handleDuplicate(targetProject: Project) {
    if (!user) return;
    try {
      // 1. Create duplicate project
      const { data: newProj, error: projErr } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name: `${targetProject.name} (Copy)`,
        })
        .select("id")
        .single();

      if (projErr || !newProj) {
        toast.error(projErr?.message || "Failed to duplicate project");
        return;
      }

      // 2. Copy all project files
      const { data: existingFiles } = await supabase
        .from("project_files")
        .select("path, content, is_upload")
        .eq("project_id", targetProject.id);

      if (existingFiles && existingFiles.length > 0) {
        const fileInserts = existingFiles.map((f) => ({
          project_id: newProj.id,
          user_id: user.id,
          path: f.path,
          content: f.content,
          is_upload: f.is_upload,
        }));
        await supabase.from("project_files").insert(fileInserts);
      }

      toast.success("Project duplicated");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate");
    }
  }

  const filteredProjects = useMemo(() => {
    let list = projects.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (sortBy === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list = [...list].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
    }
    return list;
  }, [projects, searchQuery, sortBy]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-4 py-8 flex-1">
        {/* Top greeting and Prompt box */}
        <div className="mb-8 space-y-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Your projects</h1>

          {/* Builder-styled Prompt Box */}
          <div className="relative rounded-2xl border border-white/10 bg-[#0e0e12]/90 p-3 shadow-xl backdrop-blur-xl transition-all focus-within:border-white/30 focus-within:ring-1 focus-within:ring-white/20">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-white shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <input
                value={quickPrompt}
                onChange={(e) => setQuickPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createFromPrompt();
                  }
                }}
                placeholder="Describe what you want to build..."
                className="flex-1 min-w-0 bg-transparent px-1.5 sm:px-2 py-1.5 text-xs sm:text-sm text-foreground outline-none placeholder:text-muted-foreground/60 leading-relaxed"
              />
              <button
                onClick={createFromPrompt}
                disabled={creating || !quickPrompt.trim()}
                aria-label="Create and build project"
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-black hover:bg-zinc-200 active:scale-95 transition-all shadow-sm disabled:opacity-30 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ArrowUp className="h-4 w-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter & Sort Controls */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full rounded-xl border border-white/10 bg-secondary/30 py-2 pl-9 pr-3 text-xs text-foreground outline-none transition-colors focus:border-white/30 focus:ring-1 focus:ring-white/20"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "recent" | "name")}
              className="rounded-xl border border-white/10 bg-secondary/40 px-3 py-1.5 text-xs text-foreground outline-none focus:border-white/30 cursor-pointer"
              aria-label="Sort projects"
            >
              <option value="recent">Recent</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {/* Project Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[230px] rounded-2xl border border-white/10 bg-card/40 p-4 space-y-3"
              >
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-1/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProjects.length === 0 && searchQuery ? (
          <div className="rounded-2xl border border-white/10 bg-card/30 p-12 text-center text-sm text-muted-foreground">
            No projects matching "{searchQuery}"
          </div>
        ) : projects.length === 0 ? (
          /* Empty state: illustration of simple SVG shapes */
          <div className="rounded-2xl border border-dashed border-white/15 bg-card/20 p-12 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary/60">
              <svg
                className="h-10 w-10 text-muted-foreground/60"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="6"
                  y="8"
                  width="28"
                  height="20"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path d="M6 14h28" stroke="currentColor" strokeWidth="2" />
                <circle cx="10" cy="11" r="1" fill="currentColor" />
                <circle cx="13" cy="11" r="1" fill="currentColor" />
                <circle cx="16" cy="11" r="1" fill="currentColor" />
                <rect
                  x="12"
                  y="22"
                  width="16"
                  height="10"
                  rx="2"
                  fill="currentColor"
                  fillOpacity="0.2"
                />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-foreground">No projects yet</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Describe what you want above or click below to start your first build.
            </p>
            <button
              onClick={createBlank}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" /> Start building
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* First Card: Dashed "New project" card */}
            <button
              type="button"
              onClick={createBlank}
              className="group flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-6 text-center transition-all hover:border-white/30 hover:bg-white/[0.04] hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-secondary/80 text-muted-foreground transition-all group-hover:scale-105 group-hover:border-white/30 group-hover:bg-white/10 group-hover:text-white shadow-sm">
                <Plus className="h-5 w-5" />
              </div>
              <span className="mt-3.5 text-sm font-semibold text-foreground group-hover:text-white transition-colors">
                New project
              </span>
              <span className="mt-1 text-xs text-muted-foreground">Create a blank website</span>
            </button>

            {/* Project Cards */}
            {filteredProjects.map((p) => {
              const fileCount = fileCounts[p.id] ?? 0;
              const pubSlug = pubs[p.id];

              return (
                <div
                  key={p.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0e14]/80 backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-[#12131a] hover:shadow-2xl"
                >
                  <div>
                    {/* Website Mockup Preview Header */}
                    <Link
                      to="/builder/$projectId"
                      params={{ projectId: p.id }}
                      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="relative h-32 w-full overflow-hidden border-b border-white/[0.08] bg-[#0c0d14]/90 p-3 flex flex-col justify-between select-none">
                        {/* Ambient subtle glow seeded from project id */}
                        <div
                          className="absolute -top-12 -right-12 h-36 w-36 rounded-full blur-3xl opacity-20"
                          style={{ background: getProjectGradient(p.id) }}
                        />

                        {/* Mini browser chrome */}
                        <div className="flex items-center justify-between z-10">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
                            <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
                            <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
                          </div>
                          <div className="flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/5 px-2 py-0.5 text-[9px] font-mono text-muted-foreground/70">
                            <Globe className="h-2.5 w-2.5 text-zinc-400" />
                            <span>{pubSlug ? `${pubSlug}.dev` : "preview"}</span>
                          </div>
                        </div>

                        {/* Abstract website preview wireframe */}
                        <div className="mt-2 flex-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 flex flex-col justify-between z-10">
                          <div className="flex items-center justify-between">
                            <div className="h-1.5 w-12 rounded bg-white/25" />
                            <div className="flex gap-1">
                              <div className="h-1.5 w-4 rounded bg-white/10" />
                              <div className="h-1.5 w-4 rounded bg-white/10" />
                            </div>
                          </div>
                          <div className="space-y-1 my-auto">
                            <div className="h-2.5 w-24 rounded bg-white/35" />
                            <div className="h-1.5 w-36 rounded bg-white/15" />
                          </div>
                          <div className="flex gap-1.5 pt-1">
                            <div className="h-2 w-7 rounded bg-white/20" />
                            <div className="h-2 w-9 rounded bg-white/10" />
                          </div>
                        </div>
                      </div>
                    </Link>

                    {/* Card Content */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to="/builder/$projectId"
                          params={{ projectId: p.id }}
                          className="font-semibold text-sm text-foreground hover:text-white truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded transition-colors"
                        >
                          {p.name}
                        </Link>

                        {/* Three-dot dropdown menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Actions for ${p.name}`}
                              className="rounded-lg p-1 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground opacity-70 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem
                              onClick={() => {
                                setProjectToRename(p);
                                setRenameInput(p.name);
                              }}
                            >
                              <Edit2 className="mr-2 h-3.5 w-3.5" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(p)}>
                              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setProjectToDelete(p)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(p.updated_at)}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <FileCode className="h-3 w-3" />
                          {fileCount} {fileCount === 1 ? "file" : "files"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="border-t border-white/[0.06] px-4 py-2.5 text-xs flex items-center justify-between bg-white/[0.01]">
                    {pubSlug ? (
                      <a
                        href={`/p/${pubSlug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Live site</span>
                        <ExternalLink className="h-3 w-3 ml-0.5" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground/60 text-xs">Draft</span>
                    )}

                    <Link
                      to="/builder/$projectId"
                      params={{ projectId: p.id }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-white hover:text-zinc-300 transition-colors"
                    >
                      <span>Open</span>
                      <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Rename Dialog */}
      <Dialog open={!!projectToRename} onOpenChange={(open) => !open && setProjectToRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
              }}
              placeholder="Project name"
              className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setProjectToRename(null)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRename}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? All files, messages, and
              logs will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
