import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Server-only. Bypasses Row Level Security — never import this from client
// components. Used exclusively by Pinterest server functions that need to
// read/write `pinterest_connections`, a table with no client-reachable RLS
// policy on purpose (see supabase/migrations/20260714130000_*.sql).
export function getServiceSupabase() {
  if (typeof window !== "undefined") {
    throw new Error("getServiceSupabase() must never run in the browser");
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}`);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
