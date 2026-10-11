import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  ArrowUp,
  Paperclip,
  X,
  MessageSquare,
  ClipboardList,
  Hammer,
  Globe,
  Zap,
  Sparkles,
  Code2,
  Layers,
  Cpu,
  ShieldCheck,
  Download,
  ExternalLink,
  ChevronRight,
  Menu,
  Check,
  Smartphone,
  Monitor,
  Database,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { pageMeta } from "@/lib/page-meta";
import { Logo } from "@/components/brand/Logo";
import { ParentBrandPill } from "@/components/brand/ParentBrandPill";
import { RotatingCube } from "@/components/brand/RotatingCube";
import { generateProjectNameFromIdea } from "@/lib/project-naming";

export const Route = createFileRoute("/")({
  head: () =>
    pageMeta(
      "DevLoadable — Next-Gen AI Fullstack App Builder | Part of ZarGPT",
      "Build full-stack web applications in seconds with DevLoadable by ZarGPT. Powered by ZarGPT Build Max & Mini. Real-time preview, production-ready code, and one-click deployment.",
    ),
  component: Landing,
});

const STARTER_CHIPS = [
  {
    label: "SaaS Analytics Dashboard",
    prompt:
      "Build a dark modern SaaS analytics dashboard with interactive metrics and conversion charts",
  },
  {
    label: "E-Commerce Storefront",
    prompt: "Build a sleek minimal e-commerce clothing shop with product filtering and cart drawer",
  },
  {
    label: "Real-time Kanban Board",
    prompt: "Create a fluid drag-and-drop Kanban board with tags, priorities, and search",
  },
  {
    label: "AI Image Studio",
    prompt:
      "Build an AI image generation playground with gallery, prompt presets, and aspect ratios",
  },
  {
    label: "Dev Portfolio & Blog",
    prompt:
      "Design a high-contrast developer portfolio with project showcases, stats, and markdown blog",
  },
];

const COMPARISON_FEATURES = [
  {
    feature: "Engine Reasoning",
    devloadable: "ZarGPT Build Max & Mini",
    traditional: "Generic Models",
    generic: "Standard Static Models",
  },
  {
    feature: "Full-Stack Code Architecture",
    devloadable: "Production-ready Vite + React + Tailwind",
    traditional: "Static HTML/CSS templates",
    generic: "Boilerplate snippets",
  },
  {
    feature: "Interactive 3D Workspace",
    devloadable: "Diamond Black Resend-Grade Canvas",
    traditional: "Standard UI",
    generic: "Basic console",
  },
  {
    feature: "Instant Public Publishing",
    devloadable: "Sub-second live deployment with custom URLs",
    traditional: "Manual export/deploy",
    generic: "Cloud console setup required",
  },
  {
    feature: "Full Code Export",
    devloadable: "Clean ZIP package with standard Vite + React",
    traditional: "Requires GitHub authorization",
    generic: "Manual file copying",
  },
  {
    feature: "Mobile & Responsive Simulator",
    devloadable: "Adaptive live preview (Desktop, Tablet, Mobile)",
    traditional: "Basic iframe",
    generic: "Desktop preview only",
  },
];

function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"chat" | "plan" | "build">("build");
  const [provider, setProvider] = useState<"build-max" | "build-mini">("build-max");
  const [attached, setAttached] = useState<{ name: string; content: string }[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function processFiles(files: File[]) {
    if (!files.length) return;
    for (const f of files) {
      const isZip = f.name.toLowerCase().endsWith(".zip") || f.type.includes("zip");
      if (isZip) {
        try {
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(f);
          const extracted: Array<{ name: string; content: string }> = [];
          for (const relPath of Object.keys(zip.files)) {
            const entry = zip.files[relPath];
            if (
              entry.dir ||
              relPath.startsWith("__MACOSX") ||
              relPath.includes("/.") ||
              relPath.startsWith(".")
            ) {
              continue;
            }
            if (
              /\.(html|htm|css|js|jsx|ts|tsx|json|svg|sql|php|py|md|txt|yaml|yml|xml|csv)$/i.test(
                relPath,
              )
            ) {
              const text = await entry.async("string");
              extracted.push({ name: relPath, content: text });
            }
          }
          if (extracted.length > 0) {
            setAttached((a) => [...a, ...extracted]);
            toast.success(`Extracted ${extracted.length} code file(s) from ${f.name}`);
          } else {
            toast.warning(`No text/code files found in ${f.name}`);
          }
        } catch {
          toast.error(`Failed to unpack zip: ${f.name}`);
        }
        continue;
      }

      const isSvg = f.name.toLowerCase().endsWith(".svg") || f.type === "image/svg+xml";
      const isRaster = f.type.startsWith("image/") && !isSvg;
      if (isRaster) {
        toast.error("Image upload is disabled. Please upload code, text, or zip files.");
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        setAttached((a) => [...a, { name: f.name, content: text }]);
        toast.success(`Attached ${f.name}`);
      };
      reader.readAsText(f);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    processFiles(list);
    e.target.value = "";
  }

  async function startBuild(overridePrompt?: string) {
    const p = (overridePrompt ?? prompt).trim();
    if (!p || busy) return;

    if (!user) {
      try {
        sessionStorage.setItem("loadable:first_prompt", p);
        sessionStorage.setItem("zargpt:first_prompt", p);
      } catch (err) {
        console.error("Failed to write to sessionStorage", err);
      }
      navigate({ to: "/auth" });
      return;
    }

    const projectName = generateProjectNameFromIdea(p);
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .insert({ user_id: user.id, name: projectName })
        .select("id")
        .single();

      if (error || !data) {
        setBusy(false);
        toast.error(error?.message ?? "Failed to create project");
        return;
      }

      sessionStorage.setItem(`loadable:seed:${data.id}`, p);
      sessionStorage.setItem(
        `loadable:seedopts:${data.id}`,
        JSON.stringify({ mode, provider, files: attached }),
      );
      navigate({ to: "/builder/$projectId", params: { projectId: data.id } });
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : "Failed to start build");
    }
  }

  return (
    <div className="min-h-screen bg-[#000000] text-foreground flex flex-col justify-between selection:bg-white/20 selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#000000]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-lg"
              aria-label="DevLoadable Home"
            >
              <Logo size="md" showWordmark={true} />
            </Link>
            <div className="hidden md:flex items-center">
              <ParentBrandPill />
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <a
              href="#features"
              className="text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              Features
            </a>
            <a
              href="#comparison"
              className="text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              Comparison
            </a>

            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.1] px-4 py-2 text-sm font-medium text-foreground transition-all shadow-sm"
              >
                Dashboard
              </Link>
            ) : (
              <div className="flex items-center gap-2.5 pl-2">
                <Link
                  to="/auth"
                  className="rounded-lg px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Sign in
                </Link>
                <Link
                  to="/auth"
                  className="relative group rounded-lg bg-white text-black font-semibold px-4 py-2 text-sm transition-all hover:bg-white/90 active:scale-95 shadow-sm"
                >
                  Start Building Free
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden inline-flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-white/[0.08] bg-[#08080a] px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
            <div className="pb-2 border-b border-white/[0.06]">
              <ParentBrandPill />
            </div>
            <div className="flex flex-col space-y-2 text-sm">
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 text-muted-foreground hover:text-foreground"
              >
                Features & Models
              </a>
              <a
                href="#comparison"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 text-muted-foreground hover:text-foreground"
              >
                Comparison Matrix
              </a>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              {user ? (
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 rounded-lg bg-white/[0.08] text-foreground font-medium text-sm"
                >
                  Open Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/auth"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center py-2.5 rounded-lg border border-white/[0.1] text-foreground text-sm"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/auth"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center py-2.5 rounded-lg bg-white text-black font-semibold text-sm shadow-md"
                  >
                    Get Started Free
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <main className="flex-1 relative overflow-hidden">
        {/* Diamond Black Resend-Style Ambient Lighting */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(255,255,255,0.06),transparent_70%)] pointer-events-none -z-10" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_50%_40%_at_50%_50%,rgba(255,255,255,0.03),transparent_70%)] pointer-events-none -z-10" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_20%,#000_60%,transparent_100%)] pointer-events-none -z-10" />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 sm:pt-16 pb-20 text-center">
          {/* Rotating Cube */}
          <div className="flex justify-center mb-6">
            <RotatingCube size="lg" className="mx-auto" />
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.06] max-w-4xl mx-auto">
            Build fullstack web apps <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/60">
              at the speed of thought.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            The next-generation AI fullstack software architect. Powered by{" "}
            <span className="text-white font-medium">ZarGPT Build Max</span> and{" "}
            <span className="text-white font-medium">ZarGPT Build Mini</span>. Plan, write, preview,
            and deploy production-ready web applications with zero setup.
          </p>

          {/* Elevated Diamond-Black Composer Box */}
          <div className="mt-8 sm:mt-10 w-full max-w-3xl mx-auto text-left">
            <div className="relative rounded-2xl border border-white/[0.14] bg-[#08080c]/90 p-4 sm:p-5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9),0_0_40px_-10px_rgba(255,255,255,0.06)] backdrop-blur-2xl transition-all focus-within:border-white/30 focus-within:ring-1 focus-within:ring-white/20">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onPaste={(e) => {
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    startBuild();
                  }
                }}
                placeholder="Describe your full-stack app, dashboard, or SaaS tool in detail..."
                rows={3}
                className="w-full resize-none bg-transparent px-1 py-1 text-base text-foreground outline-none placeholder:text-muted-foreground/50 leading-relaxed font-sans"
              />

              {/* Attached files chips */}
              {attached.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-1 pb-3">
                  {attached.map((f, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] border border-white/[0.1] px-2.5 py-1 text-xs text-zinc-300"
                    >
                      <Code2 className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="truncate max-w-[150px]">{f.name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        onClick={() => setAttached((a) => a.filter((_, j) => j !== i))}
                        className="hover:text-white p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Toolbar Controls: Single aligned row, no line breaks, no wrapping gaps */}
              <div className="flex items-center justify-between gap-2 px-1 pt-3 border-t border-white/[0.08] w-full">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink">
                  {/* File attach button */}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white border border-white/[0.08] shrink-0"
                    aria-label="Attach code, text, or .zip archive"
                    title="Attach code, text, or .zip archive"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={onPick}
                    accept=".zip,.txt,.md,.json,.html,.css,.js,.jsx,.ts,.tsx,.py,.php,.sql,.csv,.yaml,.yml,.xml,.sh"
                  />

                  {/* Mode Selector */}
                  <div className="flex items-center rounded-lg border border-white/[0.1] bg-white/[0.03] p-0.5 shrink-0">
                    {[
                      { id: "chat", label: "Chat", icon: MessageSquare },
                      { id: "plan", label: "Plan", icon: ClipboardList },
                      { id: "build", label: "Build", icon: Hammer },
                    ].map(({ id, label, icon: ModeIcon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setMode(id as "chat" | "plan" | "build")}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-all shrink-0 ${
                          mode === id
                            ? "bg-white text-black font-semibold shadow-sm"
                            : "text-muted-foreground hover:text-white"
                        }`}
                      >
                        <ModeIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Model Selector */}
                  <div className="relative shrink-0">
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as "build-max" | "build-mini")}
                      aria-label="Select Model"
                      className="rounded-lg border border-white/[0.1] bg-[#0c0c12] px-2 sm:px-2.5 py-1 text-xs text-white font-medium outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer shrink-0"
                    >
                      <option value="build-max">Build Max</option>
                      <option value="build-mini">Build Mini</option>
                    </select>
                  </div>
                </div>

                {/* Submit action button */}
                <button
                  type="button"
                  onClick={() => startBuild()}
                  disabled={busy || (!prompt.trim() && attached.length === 0)}
                  aria-label="Start build"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs transition-all hover:bg-zinc-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0"
                >
                  <span>Build</span>
                  <ArrowUp className="h-3.5 w-3.5 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Inspiration Chips */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-muted-foreground/60 mr-1 hidden sm:inline">
                Suggested templates:
              </span>
              {STARTER_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    setPrompt(chip.prompt);
                    textareaRef.current?.focus();
                  }}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-xs text-muted-foreground transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-white/[0.2] hover:bg-white/[0.08] hover:text-white"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <section id="features" className="border-t border-white/[0.08] bg-[#040406] py-24 relative">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/20 bg-white/5 text-xs font-medium text-white mb-4">
                <Sparkles className="h-3.5 w-3.5" /> Next-Gen Architecture
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                Engineered for serious full-stack developers
              </h2>
              <p className="mt-3 text-muted-foreground text-sm sm:text-base">
                DevLoadable combines intelligent dual-model orchestration with real-time browser
                sandboxes, high-performance compilation, and production deployments.
              </p>
            </div>

            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Feature 1 */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#08080c] p-6 hover:border-white/[0.18] transition-all group">
                <div className="h-12 w-12 rounded-xl bg-white/[0.04] border border-white/[0.08] grid place-items-center text-white group-hover:border-white/40 transition-colors">
                  <Cpu className="h-6 w-6 text-white" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">ZarGPT Build Max & Mini</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Dual high-reasoning intelligence models specifically fine-tuned for multi-file
                  code generation, structural planning, and bug-free execution.
                </p>
                <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs text-muted-foreground">
                  <span>Context window: 64K+ tokens</span>
                  <span className="text-emerald-400 font-mono font-medium">Ultra-low latency</span>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#08080c] p-6 hover:border-white/[0.18] transition-all group">
                <div className="h-12 w-12 rounded-xl bg-white/[0.04] border border-white/[0.08] grid place-items-center text-white group-hover:border-white/40 transition-colors">
                  <Monitor className="h-6 w-6 text-white" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">Instant Real-Time Preview</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Interactive multi-device preview environment with hot reloading. Simulate Desktop, Tablet,
                  and Mobile viewports with live responsive feedback and instant error diagnostics.
                </p>
                <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs text-muted-foreground">
                  <span>Multi-device preview</span>
                  <span className="text-zinc-300 font-mono font-medium">Sub-second updates</span>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#08080c] p-6 hover:border-white/[0.18] transition-all group">
                <div className="h-12 w-12 rounded-xl bg-white/[0.04] border border-white/[0.08] grid place-items-center text-white group-hover:border-emerald-500/50 transition-colors">
                  <Globe className="h-6 w-6 text-emerald-400" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">
                  One-Click Custom Publishing
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Instantly publish your application to a shareable live URL with custom subdomains,
                  or export a clean, unbundled Vite + React ZIP archive.
                </p>
                <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs text-muted-foreground">
                  <span>Custom Slugs (`/p/$slug`)</span>
                  <span className="text-emerald-400 font-mono font-medium">ZIP Export</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Comparison Matrix */}
        <section id="comparison" className="border-t border-white/[0.08] bg-[#000000] py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center max-w-xl mx-auto mb-14">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Competitive Edge
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-white">
                How DevLoadable compares
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Built to outperform conventional web builders with transparent features, production-grade architecture, and superior engineering depth.
              </p>
            </div>

            <div className="text-center sm:hidden mb-2 text-xs text-muted-foreground font-mono">
              Swipe horizontally to compare full table &rarr;
            </div>
            <div className="overflow-x-auto rounded-2xl border border-white/[0.1] bg-[#08080a] shadow-2xl touch-pan-x">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.1] bg-white/[0.02]">
                    <th className="py-4 px-6 font-medium text-muted-foreground">Capability</th>
                    <th className="py-4 px-6 font-semibold text-white bg-white/[0.05] border-x border-white/[0.08]">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-white" />
                        <span>DevLoadable</span>
                        <span className="text-[10px] text-xs font-mono px-1.5 py-0.5 rounded bg-white/10 text-white">
                          ZarGPT
                        </span>
                      </div>
                    </th>
                    <th className="py-4 px-6 font-medium text-muted-foreground">Traditional Builders</th>
                    <th className="py-4 px-6 font-medium text-muted-foreground">
                      Cloud Consoles
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {COMPARISON_FEATURES.map((item, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
                      <td className="py-4 px-6 font-medium text-white">{item.feature}</td>
                      <td className="py-4 px-6 font-semibold text-white bg-white/[0.03] border-x border-white/[0.08]">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                          <span>{item.devloadable}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-muted-foreground">{item.traditional}</td>
                      <td className="py-4 px-6 text-muted-foreground">{item.generic}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Developer Attribution Banner */}
        <section className="border-t border-white/[0.08] py-16 text-center bg-[#000000]">
          <div className="mx-auto max-w-2xl px-4">
            <h3 className="text-xs uppercase font-mono tracking-widest text-muted-foreground">
              Creator & Engineering Lead
            </h3>
            <p className="mt-3 text-lg font-semibold text-white">
              Conceived, designed, and developed by{" "}
              <a
                href="https://ahmedishtiaquezarir.pro.bd/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:underline underline-offset-4 inline-flex items-center gap-1 font-bold"
              >
                Ahmed Ishtiaque Zarir
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Part of the ZarGPT intelligent applications ecosystem. Built with production-ready
              standards.
            </p>
          </div>
        </section>
      </main>

      {/* Modern Diamond-Black Footer */}
      <footer className="border-t border-white/[0.08] bg-[#020204] py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-muted-foreground text-center sm:text-left">
              <Logo size="sm" showWordmark={true} />
              <span className="hidden sm:inline text-white/[0.2]">•</span>
              <span>
                © {new Date().getFullYear()} <strong className="text-white">DevLoadable</strong>.
                All rights reserved.
              </span>
              <span className="hidden sm:inline text-white/[0.2]">•</span>
              <a
                href="https://ahmedishtiaquezarir.pro.bd/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors text-xs text-zinc-400"
              >
                Developed by Ahmed Ishtiaque Zarir
              </a>
            </div>

            <div className="flex items-center gap-5 text-xs text-muted-foreground">
              <Link to="/dashboard" className="hover:text-white transition-colors">
                Dashboard
              </Link>
              <Link to="/auth" className="hover:text-white transition-colors">
                Sign in
              </Link>
              <a
                href="https://ahmedishtiaquezarir.pro.bd/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Portfolio
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
