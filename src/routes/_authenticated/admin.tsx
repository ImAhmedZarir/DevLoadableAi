import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListUsers,
  adminDeleteUser,
  adminSetRole,
  adminGetSettings,
  adminUpdateSetting,
  adminListSkills,
  adminListRuns,
} from "@/lib/admin.functions";
import { SiteHeader } from "@/components/site-header";
import { toast } from "sonner";
import { pageMeta } from "@/lib/page-meta";
import { useAuth } from "@/hooks/use-auth";
import {
  Users,
  Cpu,
  Sparkles,
  Sliders,
  History,
  Shield,
  ShieldOff,
  Trash2,
  MoreVertical,
  Search,
  Save,
  RotateCcw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
  head: () =>
    pageMeta(
      "Admin panel",
      "Manage ZarGPT DevLoadable users, agent models, skills, limits, and build runs.",
    ),
});

type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  roles: string[];
};

type SkillItem = {
  name: string;
  type: "always" | "optional" | "ignored";
  size: number;
};

type BuildRunItem = {
  id: string;
  project_id: string;
  user_id: string;
  user_email?: string;
  prompt: string;
  mode: string;
  status: string;
  error?: string | null;
  created_at: string;
  finished_at?: string | null;
};

const MODEL_DESCRIPTIONS: Record<string, { name: string; desc: string }> = {
  "build-max": {
    name: "ZarGPT Build Max",
    desc: "Default flagship polyglot model. Highest reasoning intelligence, complete multi-step file generation, and deep architectural planning.",
  },
  "build-mini": {
    name: "ZarGPT Build Mini",
    desc: "High-speed agent model for rapid iterations, lightweight styling changes, and real-time prototypes.",
  },
};

function formatDuration(start: string, end?: string | null): string {
  if (!end) return "in progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

function Admin() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  // Server functions
  const listUsers = useServerFn(adminListUsers);
  const delUser = useServerFn(adminDeleteUser);
  const setRole = useServerFn(adminSetRole);
  const getSettings = useServerFn(adminGetSettings);
  const updateSetting = useServerFn(adminUpdateSetting);
  const listSkillsFn = useServerFn(adminListSkills);
  const listRunsFn = useServerFn(adminListRuns);

  // Active tab
  const [activeTab, setActiveTab] = useState<
    "users" | "model-prompt" | "skills" | "limits" | "runs"
  >("users");

  // State
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [masterPrompt, setMasterPrompt] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [showDefaultPrompt, setShowDefaultPrompt] = useState(false);
  const [copiedDefaultPrompt, setCopiedDefaultPrompt] = useState(false);
  const [provider, setProvider] = useState("build-max");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [unlimitedRequests, setUnlimitedRequests] = useState(false);
  const [dailyMessageLimit, setDailyMessageLimit] = useState("1000");
  const [savingLimits, setSavingLimits] = useState(false);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [disabledSkills, setDisabledSkills] = useState<string[]>([]);
  const [updatingSkill, setUpdatingSkill] = useState<string | null>(null);

  // Runs tab state
  const [runs, setRuns] = useState<BuildRunItem[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runStatusFilter, setRunStatusFilter] = useState<string>("all");
  const [runUserFilter, setRunUserFilter] = useState<string>("all");

  // Dialog states for user management
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<AdminUser | null>(null);
  const [confirmRoleUser, setConfirmRoleUser] = useState<{
    user: AdminUser;
    grantAdmin: boolean;
  } | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const [u, s, sk] = await Promise.all([listUsers({}), getSettings({}), listSkillsFn({})]);
      setUsers(u);
      setMasterPrompt(s.master_prompt ?? "");
      setDefaultPrompt(s.default_system_prompt ?? "");
      setUnlimitedRequests((s.agent_unlimited_requests ?? "true") === "true");
      setDailyMessageLimit(s.daily_message_limit ?? "5");
      const saved = (s.agent_provider ?? "build-max").toLowerCase();
      setProvider(saved.includes("mini") ? "build-mini" : "build-max");
      setSkills(sk);

      try {
        setDisabledSkills(JSON.parse(s.disabled_skills || "[]"));
      } catch {
        setDisabledSkills([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Access denied");
      navigate({ to: "/dashboard" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  // Load runs on demand when tab changes to runs
  useEffect(() => {
    if (activeTab === "runs") {
      setRunsLoading(true);
      listRunsFn({})
        .then((r) => setRuns(r as BuildRunItem[]))
        .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load runs"))
        .finally(() => setRunsLoading(false));
    }
  }, [activeTab]);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase().trim();
    return users.filter(
      (u) =>
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.display_name && u.display_name.toLowerCase().includes(q)),
    );
  }, [users, userSearch]);

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (runStatusFilter !== "all" && r.status !== runStatusFilter) return false;
      if (runUserFilter === "me") return r.user_id === currentUser?.id;
      if (runUserFilter !== "all") return r.user_id === runUserFilter;
      return true;
    });
  }, [runs, runStatusFilter, runUserFilter, currentUser?.id]);

  const handleCopyDefaultPrompt = async () => {
    await navigator.clipboard.writeText(defaultPrompt);
    setCopiedDefaultPrompt(true);
    setTimeout(() => setCopiedDefaultPrompt(false), 2000);
  };

  const handleSaveMasterPrompt = async () => {
    setSavingPrompt(true);
    try {
      await updateSetting({ data: { key: "master_prompt", value: masterPrompt } });
      toast.success("Additional instructions saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save prompt");
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleResetPrompt = async () => {
    setSavingPrompt(true);
    try {
      setMasterPrompt("");
      await updateSetting({ data: { key: "master_prompt", value: "" } });
      toast.success("Reset to default system prompt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset prompt");
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleSaveLimits = async () => {
    const num = parseInt(dailyMessageLimit, 10);
    if (isNaN(num) || num < 1) {
      toast.error("Please enter a valid positive number");
      return;
    }

    setSavingLimits(true);
    try {
      await Promise.all([
        updateSetting({
          data: { key: "agent_unlimited_requests", value: unlimitedRequests ? "true" : "false" },
        }),
        updateSetting({
          data: { key: "daily_message_limit", value: String(num) },
        }),
      ]);
      toast.success("Limits updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save limits");
    } finally {
      setSavingLimits(false);
    }
  };

  const handleToggleSkill = async (skillName: string, currentlyDisabled: boolean) => {
    const next = currentlyDisabled
      ? disabledSkills.filter((s) => s !== skillName)
      : [...disabledSkills, skillName];

    setUpdatingSkill(skillName);
    try {
      await updateSetting({
        data: {
          key: "disabled_skills",
          value: JSON.stringify(next),
        },
      });
      setDisabledSkills(next);
      toast.success(`${skillName} ${currentlyDisabled ? "enabled" : "disabled"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle skill");
    } finally {
      setUpdatingSkill(null);
    }
  };

  const executeDeleteUser = async () => {
    if (!confirmDeleteUser) return;
    try {
      await delUser({ data: { userId: confirmDeleteUser.id } });
      toast.success("User deleted");
      setUsers((prev) => prev.filter((u) => u.id !== confirmDeleteUser.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setConfirmDeleteUser(null);
    }
  };

  const executeRoleChange = async () => {
    if (!confirmRoleUser) return;
    try {
      await setRole({
        data: {
          userId: confirmRoleUser.user.id,
          role: "admin",
          grant: confirmRoleUser.grantAdmin,
        },
      });
      toast.success(`Admin role ${confirmRoleUser.grantAdmin ? "granted" : "revoked"}`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setConfirmRoleUser(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-4 py-8 flex-1">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Admin panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage system settings, users, AI prompt rules, skills, limits, and build runs.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-border/80 overflow-x-auto gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === "users"
                ? "border-white text-white font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-4 w-4" /> Users
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("model-prompt")}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === "model-prompt"
                ? "border-white text-white font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Cpu className="h-4 w-4" /> Model & Prompt
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("skills")}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === "skills"
                ? "border-white text-white font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4" /> Skills
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("limits")}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === "limits"
                ? "border-white text-white font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sliders className="h-4 w-4" /> Limits
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("runs")}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === "runs"
                ? "border-white text-white font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="h-4 w-4" /> Runs
          </button>
        </div>

        {/* Tab 1: Users */}
        {activeTab === "users" && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users by email or name..."
                  className="w-full rounded-lg border border-border/80 bg-secondary/30 py-1.5 pl-8 pr-3 text-xs text-foreground outline-none focus:border-ring"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"}
              </div>
            </div>

            <div className="overflow-hidden rounded-[14px] border border-border/80 bg-card/40">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/60 bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">User</th>
                    <th className="p-3.5">Roles</th>
                    <th className="p-3.5">Joined</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        <td className="p-3.5">
                          <Skeleton className="h-4 w-48" />
                        </td>
                        <td className="p-3.5">
                          <Skeleton className="h-4 w-16" />
                        </td>
                        <td className="p-3.5">
                          <Skeleton className="h-4 w-20" />
                        </td>
                        <td className="p-3.5 text-right">
                          <Skeleton className="h-4 w-8 ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isAdmin = u.roles.includes("admin");
                      const isSelf = currentUser?.id === u.id;
                      const initials =
                        u.display_name?.slice(0, 2).toUpperCase() ||
                        u.email?.slice(0, 2).toUpperCase() ||
                        "U";

                      return (
                        <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="grid h-7 w-7 place-items-center rounded-full bg-secondary font-semibold text-xs text-muted-foreground select-none">
                                {initials}
                              </div>
                              <div>
                                <div className="font-medium text-foreground flex items-center gap-1.5">
                                  <span>{u.email || "No email"}</span>
                                  {isSelf && (
                                    <span className="rounded bg-secondary px-1 text-[10px] text-muted-foreground">
                                      You
                                    </span>
                                  )}
                                </div>
                                {u.display_name && (
                                  <div className="text-[11px] text-muted-foreground">
                                    {u.display_name}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5">
                            <div className="flex flex-wrap gap-1">
                              {isAdmin ? (
                                <Badge className="bg-white/10 text-white border-white/20 hover:bg-white/15">
                                  admin
                                </Badge>
                              ) : (
                                <Badge variant="secondary">user</Badge>
                              )}
                            </div>
                          </td>

                          <td className="p-3.5 text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>

                          <td className="p-3.5 text-right">
                            {isSelf ? (
                              <span className="text-muted-foreground/40 text-[11px]">—</span>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    aria-label="User actions"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40 text-xs">
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setConfirmRoleUser({
                                        user: u,
                                        grantAdmin: !isAdmin,
                                      })
                                    }
                                  >
                                    {isAdmin ? (
                                      <>
                                        <ShieldOff className="mr-2 h-3.5 w-3.5" />
                                        <span>Remove admin</span>
                                      </>
                                    ) : (
                                      <>
                                        <Shield className="mr-2 h-3.5 w-3.5" />
                                        <span>Make admin</span>
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => setConfirmDeleteUser(u)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    <span>Delete user</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Model & Prompt */}
        {activeTab === "model-prompt" && (
          <div className="mt-6 space-y-6">
            {/* Model Selection Card */}
            <div className="rounded-[14px] border border-border/80 bg-card/40 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-white" />
                <h3 className="text-sm font-semibold text-foreground">Default Agent Model</h3>
              </div>

              <div className="max-w-md">
                <select
                  value={provider}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setProvider(val);
                    try {
                      await updateSetting({ data: { key: "agent_provider", value: val } });
                      toast.success("Model updated");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed");
                    }
                  }}
                  className="w-full rounded-lg border border-border/80 bg-secondary/50 px-3 py-2 text-xs text-foreground outline-none focus:border-ring"
                >
                  <option value="build-max">ZarGPT Build Max (Default flagship)</option>
                  <option value="build-mini">ZarGPT Build Mini (High-speed build)</option>
                </select>
              </div>

              {/* Short description of selected model */}
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-3 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">
                  {MODEL_DESCRIPTIONS[provider]?.name}
                </div>
                <p className="mt-1 leading-relaxed">{MODEL_DESCRIPTIONS[provider]?.desc}</p>
              </div>
            </div>

            {/* Read-Only Built-In Default Prompt (Collapsible) */}
            <div className="rounded-[14px] border border-border/80 bg-card/40 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Built-in Default System Prompt
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    The core baseline system prompt built into the agent framework (read-only).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyDefaultPrompt}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {copiedDefaultPrompt ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>{copiedDefaultPrompt ? "Copied" : "Copy"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDefaultPrompt(!showDefaultPrompt)}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {showDefaultPrompt ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    <span>{showDefaultPrompt ? "Hide" : "View"}</span>
                  </button>
                </div>
              </div>

              {showDefaultPrompt && (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border/60 bg-background/80 p-3 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {defaultPrompt || "No default prompt found."}
                </div>
              )}
            </div>

            {/* Editable Additional Instructions (Master Prompt) */}
            <div className="rounded-[14px] border border-border/80 bg-card/40 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Additional Instructions (Master prompt)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Custom rules appended to the default system prompt on every agent run.
                  </p>
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  {masterPrompt.length.toLocaleString()} characters
                </div>
              </div>

              <textarea
                value={masterPrompt}
                onChange={(e) => setMasterPrompt(e.target.value)}
                placeholder="Enter custom instructions to append to the default system prompt..."
                rows={10}
                className="w-full resize-y rounded-lg border border-border/80 bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-ring"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={savingPrompt || !masterPrompt}
                  onClick={handleResetPrompt}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-secondary/40 px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to default
                </button>

                <button
                  type="button"
                  disabled={savingPrompt}
                  onClick={handleSaveMasterPrompt}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" /> Save instructions
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Skills */}
        {activeTab === "skills" && (
          <div className="mt-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Injected Agent Skills</h3>
              <p className="text-xs text-muted-foreground">
                Specialized skills loaded into the agent context based on their policy.
              </p>
            </div>

            <div className="overflow-hidden rounded-[14px] border border-border/80 bg-card/40">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/60 bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">Skill Name</th>
                    <th className="p-3.5">Trigger Policy</th>
                    <th className="p-3.5">Size</th>
                    <th className="p-3.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {skills.map((skill) => {
                    const isDisabled = disabledSkills.includes(skill.name);
                    const isUpdating = updatingSkill === skill.name;

                    return (
                      <tr key={skill.name} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-3.5 font-mono font-medium text-foreground">
                          {skill.name}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              skill.type === "always"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-sky-500/10 text-sky-400"
                            }`}
                          >
                            {skill.type === "always" ? "Always injected" : "Keyword match"}
                          </span>
                        </td>
                        <td className="p-3.5 text-muted-foreground">
                          {(skill.size / 1024).toFixed(1)} KB ({skill.size.toLocaleString()} chars)
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-[11px] text-muted-foreground">
                              {isDisabled ? "Off" : "On"}
                            </span>
                            <Switch
                              checked={!isDisabled}
                              disabled={isUpdating}
                              onCheckedChange={() => handleToggleSkill(skill.name, isDisabled)}
                              aria-label={`Toggle ${skill.name}`}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Limits */}
        {activeTab === "limits" && (
          <div className="mt-6 space-y-6">
            <div className="rounded-[14px] border border-border/80 bg-card/40 p-6 space-y-6">
              {/* Unlimited Requests Switch */}
              <div className="flex items-center justify-between pb-6 border-b border-border/60">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">Unlimited Requests</div>
                  <p className="text-xs text-muted-foreground">
                    Allow unlimited agent build and chat requests for all authenticated users.
                  </p>
                </div>
                <Switch
                  checked={unlimitedRequests}
                  onCheckedChange={setUnlimitedRequests}
                  aria-label="Unlimited requests switch"
                />
              </div>

              {/* Daily Message Limit Input */}
              <div className="space-y-2">
                <label htmlFor="dailyLimit" className="block text-sm font-semibold text-foreground">
                  Daily Message Limit Per User
                </label>
                <p className="text-xs text-muted-foreground">
                  Applied when unlimited requests is turned off. Evaluates user messages sent per UTC calendar day (resets daily at 00:00:00 UTC). Default is 1,000.
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <input
                    id="dailyLimit"
                    type="number"
                    min="1"
                    max="50000"
                    value={dailyMessageLimit}
                    onChange={(e) => setDailyMessageLimit(e.target.value)}
                    className="w-28 rounded-lg border border-border/80 bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring"
                  />
                  <span className="text-xs text-muted-foreground">messages / UTC day</span>
                </div>
              </div>

              {/* Save Limits Action */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={savingLimits}
                  onClick={handleSaveLimits}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" /> Save limits
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Runs (new, read-only table of latest 50 build_runs) */}
        {activeTab === "runs" && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Latest 50 Build Runs</h3>
                <p className="text-xs text-muted-foreground">
                  Audit log of recent agent execution runs across all projects.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* User Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">User:</span>
                  <select
                    value={runUserFilter}
                    onChange={(e) => setRunUserFilter(e.target.value)}
                    className="rounded-lg border border-border/80 bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-white/40"
                    aria-label="Filter runs by user"
                  >
                    <option value="all">All users</option>
                    <option value="me">My builds only</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email || u.display_name || u.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <select
                    value={runStatusFilter}
                    onChange={(e) => setRunStatusFilter(e.target.value)}
                    className="rounded-lg border border-border/80 bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-white/40"
                    aria-label="Filter runs by status"
                  >
                    <option value="all">All statuses</option>
                    <option value="done">Done</option>
                    <option value="running">Running</option>
                    <option value="planned">Planned</option>
                    <option value="waiting">Waiting</option>
                    <option value="error">Error</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[14px] border border-border/80 bg-card/40">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="border-b border-border/60 bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">Time</th>
                    <th className="p-3.5">User</th>
                    <th className="p-3.5">Prompt</th>
                    <th className="p-3.5">Mode</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Duration</th>
                    <th className="p-3.5">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono text-[11px]">
                  {runsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td className="p-3.5">
                          <Skeleton className="h-4 w-24" />
                        </td>
                        <td className="p-3.5">
                          <Skeleton className="h-4 w-32" />
                        </td>
                        <td className="p-3.5">
                          <Skeleton className="h-4 w-48" />
                        </td>
                        <td className="p-3.5">
                          <Skeleton className="h-4 w-12" />
                        </td>
                        <td className="p-3.5">
                          <Skeleton className="h-4 w-16" />
                        </td>
                        <td className="p-3.5">
                          <Skeleton className="h-4 w-12" />
                        </td>
                        <td className="p-3.5">
                          <Skeleton className="h-4 w-16" />
                        </td>
                      </tr>
                    ))
                  ) : filteredRuns.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground font-sans">
                        No build runs found.
                      </td>
                    </tr>
                  ) : (
                    filteredRuns.map((r) => {
                      const isDone = r.status === "done";
                      const isError = r.status === "error";
                      const isRunning = r.status === "running";
                      const isCancelled = r.status === "cancelled";

                      return (
                        <tr key={r.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-3.5 text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </td>

                          <td className="p-3.5 text-foreground/90 max-w-[160px] truncate">
                            {r.user_email || r.user_id.slice(0, 8)}
                          </td>

                          <td
                            className="p-3.5 font-sans text-foreground max-w-[240px] truncate"
                            title={r.prompt}
                          >
                            {r.prompt.length > 60 ? `${r.prompt.slice(0, 60)}…` : r.prompt}
                          </td>

                          <td className="p-3.5">
                            <span className="rounded bg-secondary/80 px-1.5 py-0.5 text-[10px] uppercase font-semibold text-muted-foreground">
                              {r.mode}
                            </span>
                          </td>

                          <td className="p-3.5">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                isDone
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : isError
                                    ? "bg-destructive/15 text-destructive"
                                    : isRunning
                                      ? "bg-white/10 text-white animate-pulse"
                                      : isCancelled
                                        ? "bg-muted text-muted-foreground"
                                        : "bg-secondary text-foreground"
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>

                          <td className="p-3.5 text-muted-foreground">
                            {formatDuration(r.created_at, r.finished_at)}
                          </td>

                          <td
                            className="p-3.5 text-destructive max-w-[180px] truncate"
                            title={r.error || ""}
                          >
                            {r.error || "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Role Change Confirmation Dialog */}
      <AlertDialog
        open={!!confirmRoleUser}
        onOpenChange={(open) => !open && setConfirmRoleUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmRoleUser?.grantAdmin ? "Grant admin role?" : "Revoke admin role?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRoleUser?.grantAdmin
                ? `Are you sure you want to grant admin privileges to ${confirmRoleUser.user.email}? They will have full access to system settings.`
                : `Are you sure you want to revoke admin privileges from ${confirmRoleUser?.user.email}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeRoleChange}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog
        open={!!confirmDeleteUser}
        onOpenChange={(open) => !open && setConfirmDeleteUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete user "{confirmDeleteUser?.email}"? This action cannot
              be undone and will delete their authentication account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
