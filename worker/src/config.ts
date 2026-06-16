import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),

  supabaseUrl: required("SUPABASE_URL"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  /** Shared Codex home holding the one logged-in subscription's auth.json. */
  codexAuthHome: required("CODEX_AUTH_HOME"),
  codexBin: process.env.CODEX_BIN ?? "codex",

  // ---- guardrails ----
  /** Max Codex processes running at once (protects host + subscription). */
  maxConcurrent: Number(process.env.MAX_CONCURRENT ?? 3),
  /** Kill a turn that hasn't completed in this long (frees its slot). */
  turnTimeoutMs: Number(process.env.TURN_TIMEOUT_MS ?? 6 * 60_000),
  /** Hold the queue when the weekly (secondary) usage window is at/over this. */
  usageBlockPercent: Number(process.env.USAGE_BLOCK_PERCENT ?? 95),
  /** Hard slide cap, mirrored from the DB check constraint. */
  maxSlides: 8,
};
