import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getServiceSupabase } from "@/integrations/supabase/service-client";
import {
  buildAuthorizeUrl,
  exchangeCode,
  getUserAccount,
  refreshAccessToken,
  signOAuthState,
  verifyOAuthState,
} from "@/lib/pinterest-api";

// -------------------------------------------------------------
// Kick off the real Pinterest OAuth authorize round-trip.
// -------------------------------------------------------------

export const startPinterestOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { returnTo: string }) => z.object({ returnTo: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const state = await signOAuthState({ uid: context.userId, returnTo: data.returnTo });
    return { url: buildAuthorizeUrl(state) };
  });

// -------------------------------------------------------------
// Exchange the authorization code, store tokens, mark the profile connected.
// -------------------------------------------------------------

export const completePinterestOAuthCallback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; state: string }) =>
    z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const verified = await verifyOAuthState(data.state, context.userId).catch((e) => {
      throw new Error(
        `OAuth state check failed: ${e instanceof Error ? e.message : e}. Try connecting again from a fresh link — state tokens expire after 10 minutes.`,
      );
    });
    const tokens = await exchangeCode(data.code).catch((e) => {
      throw new Error(
        `Pinterest token exchange failed: ${e instanceof Error ? e.message : e}. Check PINTEREST_APP_ID/PINTEREST_APP_SECRET/PINTEREST_REDIRECT_URI match the Pinterest app dashboard exactly.`,
      );
    });
    const account = await getUserAccount(tokens.access_token).catch((e) => {
      throw new Error(
        `Pinterest account lookup failed right after token exchange: ${e instanceof Error ? e.message : e}. This usually means the connecting Pinterest account isn't authorized for this app's current access tier.`,
      );
    });

    const service = getServiceSupabase();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: connErr } = await service.from("pinterest_connections").upsert(
      {
        user_id: context.userId,
        pinterest_user_id: account.accountId,
        username: account.username,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        scopes: tokens.scope ?? null,
        token_expires_at: expiresAt,
      },
      { onConflict: "user_id" },
    );
    if (connErr) throw new Error(connErr.message);

    const { error: profileErr } = await service
      .from("profiles")
      .update({
        pinterest_connected: true,
        pinterest_username: account.username,
        source_platform: "pinterest",
      })
      .eq("id", context.userId);
    if (profileErr) throw new Error(profileErr.message);

    return { username: account.username, returnTo: verified.returnTo };
  });

// -------------------------------------------------------------
// Disconnect: drop the stored token and clear the profile flags.
// -------------------------------------------------------------

export const disconnectPinterest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const service = getServiceSupabase();
    const { error: delErr } = await service
      .from("pinterest_connections")
      .delete()
      .eq("user_id", context.userId);
    if (delErr) throw new Error(delErr.message);

    const { error: profileErr } = await service
      .from("profiles")
      .update({ pinterest_connected: false, pinterest_username: null })
      .eq("id", context.userId);
    if (profileErr) throw new Error(profileErr.message);

    return { disconnected: true };
  });

// -------------------------------------------------------------
// Internal helper (not a serverFn) — used by pinterest.functions.ts to get a
// live, non-expired access token, refreshing and persisting it if needed.
// -------------------------------------------------------------

export async function getValidPinterestToken(userId: string): Promise<string> {
  const service = getServiceSupabase();
  const { data: conn, error } = await service
    .from("pinterest_connections")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conn) throw new Error("Pinterest is not connected for this account");

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const nearlyExpired = expiresAt - Date.now() < 5 * 60_000; // refresh with 5 min to spare
  if (!nearlyExpired) return conn.access_token;

  if (!conn.refresh_token) {
    throw new Error(
      "Pinterest access token expired and no refresh token is available — reconnect Pinterest",
    );
  }

  const refreshed = await refreshAccessToken(conn.refresh_token).catch((e) => {
    throw new Error(
      `Pinterest token refresh failed: ${e instanceof Error ? e.message : e}. Reconnect Pinterest from Settings.`,
    );
  });
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const { error: updErr } = await service
    .from("pinterest_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? conn.refresh_token,
      token_expires_at: newExpiresAt,
    })
    .eq("user_id", userId);
  if (updErr) throw new Error(updErr.message);

  return refreshed.access_token;
}
