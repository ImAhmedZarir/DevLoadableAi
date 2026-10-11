import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { pageMeta } from "@/lib/page-meta";
import { Logo } from "@/components/brand/Logo";
import { ParentBrandPill } from "@/components/brand/ParentBrandPill";
import { Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () =>
    pageMeta(
      "Sign in",
      "Sign in to DevLoadable to create, edit, and publish your applications. Part of ZarGPT.",
    ),
});

export function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  async function handlePostAuthRedirect(authedUser: { id: string }) {
    try {
      const p =
        sessionStorage.getItem("zargpt:first_prompt") ||
        sessionStorage.getItem("loadable:first_prompt");
      if (p) {
        sessionStorage.removeItem("zargpt:first_prompt");
        sessionStorage.removeItem("loadable:first_prompt");
        const { data, error } = await supabase
          .from("projects")
          .insert({ user_id: authedUser.id, name: p.slice(0, 60) })
          .select("id")
          .single();

        if (!error && data?.id) {
          sessionStorage.setItem(`loadable:seed:${data.id}`, p);
          sessionStorage.setItem(
            `loadable:seedopts:${data.id}`,
            JSON.stringify({ mode: "build", provider: "build-max" }),
          );
          navigate({ to: "/builder/$projectId", params: { projectId: data.id }, replace: true });
          return;
        }
      }
    } catch (err) {
      console.error("Failed to process initial prompt", err);
    }
    navigate({ to: "/dashboard", replace: true });
  }

  useEffect(() => {
    if (user) {
      handlePostAuthRedirect(user);
    }
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);
    setGeneralError(null);

    let hasClientError = false;
    if (!email.trim() || !email.includes("@")) {
      setEmailError("Please enter a valid email address.");
      hasClientError = true;
    }
    if (!password || password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      hasClientError = true;
    }

    if (hasClientError) return;

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) {
          setGeneralError(error.message);
          toast.error(error.message);
          return;
        }
        if (data?.user) {
          toast.success("Account created!");
          await handlePostAuthRedirect(data.user);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setGeneralError(error.message);
          toast.error(error.message);
          return;
        }
        if (data?.user) {
          await handlePostAuthRedirect(data.user);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setGeneralError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setGoogleBusy(true);
    setGeneralError(null);
    try {
      const siteUrl = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${siteUrl}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        setGeneralError(error.message);
        toast.error(error.message);
        setGoogleBusy(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google authentication failed";
      setGeneralError(msg);
      toast.error(msg);
      setGoogleBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:grid md:grid-cols-2">
      {/* Left brand panel (desktop only) */}
      <div className="hidden md:flex flex-col justify-between border-r border-border/80 bg-card/60 p-12">
        <div>
          <Logo size="lg" showWordmark={true} />
        </div>

        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Ship a website in minutes
          </h2>

          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500/10 text-emerald-400 flex-shrink-0">
                <Check className="h-3.5 w-3.5" />
              </div>
              <span>Plan, code, and preview websites in real time with an autonomous agent</span>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500/10 text-emerald-400 flex-shrink-0">
                <Check className="h-3.5 w-3.5" />
              </div>
              <span>Deploy and share your live project link in one click</span>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500/10 text-emerald-400 flex-shrink-0">
                <Check className="h-3.5 w-3.5" />
              </div>
              <span>Export clean, production-ready source code as a ZIP anytime</span>
            </div>
          </div>
        </div>

        <div>
          <ParentBrandPill />
        </div>
      </div>

      {/* Right form column */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm rounded-[14px] border border-border/80 bg-card/70 p-8 shadow-floating backdrop-blur">
          {/* Mobile brand header */}
          <div className="mb-6 md:hidden">
            <Logo size="md" showWordmark={true} />
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {mode === "signin" ? "Sign in to ZarGPT DevLoadable" : "Create your account"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "signin"
              ? "Enter your credentials to continue building"
              : "Start creating websites with AI in seconds"}
          </p>

          {/* Continue with Google button */}
          <button
            type="button"
            onClick={google}
            disabled={googleBusy || busy}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg border border-border/80 bg-secondary/50 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {googleBusy ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 48 48">
                <path
                  fill="#FFC107"
                  d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.1 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.1 29 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5 0 9.6-1.9 13-5l-6-5.1C29 35.5 26.6 36.5 24 36.5c-5.3 0-9.7-3.4-11.3-8.1L6.1 33.3C9.4 39.8 16.1 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6 5.1C40.8 35.5 44 30.2 44 24c0-1.2-.1-2.3-.4-3.5z"
                />
              </svg>
            )}
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground/60">
            <div className="h-px flex-1 bg-border/60" /> or{" "}
            <div className="h-px flex-1 bg-border/60" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-foreground mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                placeholder="name@example.com"
                className="w-full rounded-lg border border-border/80 bg-secondary/30 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {emailError && <p className="mt-1 text-xs text-destructive">{emailError}</p>}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-foreground mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(null);
                }}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border/80 bg-secondary/30 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {passwordError && <p className="mt-1 text-xs text-destructive">{passwordError}</p>}
            </div>

            {generalError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                {generalError}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || googleBusy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{mode === "signin" ? "Signing in..." : "Creating account..."}</span>
                </>
              ) : (
                <span>{mode === "signin" ? "Sign in" : "Create account"}</span>
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setEmailError(null);
              setPasswordError(null);
              setGeneralError(null);
            }}
            className="mt-5 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {mode === "signin"
              ? "Don't have an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
