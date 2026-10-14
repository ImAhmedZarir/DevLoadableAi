import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    async function handleCallback() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          toast.error(`Authentication error: ${error.message}`);
          navigate({ to: "/auth", replace: true });
          return;
        }

        if (data?.session) {
          toast.success("Successfully signed in!");
          navigate({ to: "/dashboard", replace: true });
        } else {
          // Listen for onAuthStateChange in case session is being processed from hash
          const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session && mounted) {
              toast.success("Successfully signed in!");
              authListener.subscription.unsubscribe();
              navigate({ to: "/dashboard", replace: true });
            }
          });
        }
      } catch (err) {
        toast.error("Failed to complete sign in.");
        navigate({ to: "/auth", replace: true });
      }
    }

    handleCallback();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
        <h2 className="text-sm font-medium text-foreground">Completing sign in...</h2>
        <p className="text-xs text-muted-foreground">Redirecting to your DevLoadable workspace.</p>
      </div>
    </div>
  );
}
