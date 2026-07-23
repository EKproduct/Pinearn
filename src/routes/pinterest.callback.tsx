import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { completePinterestOAuthCallback } from "@/lib/pinterest-oauth.functions";

const searchSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const Route = createFileRoute("/pinterest/callback")({
  validateSearch: (s) => searchSchema.parse(s),
  component: PinterestCallbackPage,
});

function PinterestCallbackPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const complete = useServerFn(completePinterestOAuthCallback);
  const [error, setError] = useState<string | null>(
    search.error_description || search.error || null,
  );
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (error) return;
    if (!search.code || !search.state) {
      setError("Pinterest didn't return an authorization code. Please try connecting again.");
      return;
    }
    complete({ data: { code: search.code, state: search.state } })
      .then((res) => {
        const dest = res.returnTo || "/onboarding";
        // Hard navigation: forces the `_authenticated` route guard to
        // re-check the now-updated `pinterest_connected` flag from scratch.
        window.location.href = dest.includes("?") ? dest : `${dest}?connected=1`;
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Couldn't finish connecting Pinterest.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      {error ? (
        <>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-destructive/15 text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-semibold">Couldn't connect Pinterest</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate({ to: "/onboarding" })}
            className="mt-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            Back to Pinearn
          </button>
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <h1 className="font-display text-xl font-semibold">Connecting your Pinterest…</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Hang tight, this only takes a moment.
          </p>
        </>
      )}
    </div>
  );
}
