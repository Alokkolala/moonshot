import { supabase } from "./supabase";

// Calls to the Codex worker (Railway) and the Supabase edge function. The worker
// is the only thing allowed to drive Codex; the browser just enqueues turns and
// then watches Supabase Realtime for the streamed results.
const WORKER_URL = (import.meta.env.VITE_WORKER_URL as string | undefined)?.replace(/\/$/, "");
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "");

/** Attach the signed-in user's Supabase JWT so the worker can verify identity. */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function workerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!WORKER_URL) throw new Error("Worker URL not configured (VITE_WORKER_URL).");
  const headers = { ...(await authHeaders()), ...(init.headers ?? {}) };
  return fetch(`${WORKER_URL}${path}`, { ...init, headers });
}

export interface StartTurnArgs {
  deckId: string;
  prompt: string;
  directive: string;
  kind: "outline" | "slide";
  outlineId?: string;
  label?: string;
}

/** Enqueue one Codex turn on the worker. Returns the turn id to watch. */
export async function startTurn(args: StartTurnArgs): Promise<{ turnId: string; queuePosition: number }> {
  const { deckId, ...body } = args;
  const res = await workerFetch(`/decks/${deckId}/turn`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await asError(res);
  return res.json();
}

/** Stop a running or queued turn (owner only). */
export async function stopTurn(turnId: string): Promise<void> {
  const res = await workerFetch(`/turns/${turnId}/stop`, { method: "POST" });
  if (!res.ok) throw await asError(res);
}

/** Scrape the shared Codex subscription's remaining rate-limit budget. */
export async function fetchUsage(): Promise<unknown> {
  const res = await workerFetch(`/usage`);
  if (!res.ok) throw await asError(res);
  return res.json();
}

export interface RegisterArgs {
  email: string;
  password: string;
  code: string;
}

/** Invite-code registration via the public Supabase edge function (no JWT). */
export async function registerWithCode(args: RegisterArgs): Promise<{ userId: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? body?.error ?? "Registration failed.");
  return { userId: body.userId };
}

/**
 * Upload a brand asset to the private `attachments` bucket. The key is
 * `{userId}/{deckId}/{file}` so RLS scopes it to the owner; the worker later
 * downloads it into the Codex session's working dir as `assets/{name}`.
 */
export async function uploadAttachment(
  deckId: string,
  file: File
): Promise<{ storagePath: string }> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) throw new Error("Not signed in.");
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${userId}/${deckId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage
    .from("attachments")
    .upload(key, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return { storagePath: key };
}

/** Short-lived signed URL for previewing an uploaded image attachment. */
export async function signedAttachmentUrl(storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from("attachments")
    .createSignedUrl(storagePath, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Normalise a non-2xx worker response into an Error carrying its message + code. */
async function asError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  const err = new Error(body?.message ?? body?.error ?? `Request failed (${res.status})`) as Error & {
    code?: string;
    status?: number;
  };
  err.code = body?.error;
  err.status = res.status;
  return err;
}
