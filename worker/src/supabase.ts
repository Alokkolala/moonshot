import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

/** Service-role client: bypasses RLS. NEVER expose this key to the browser. */
export const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface AuthedUser {
  id: string;
  email?: string;
}

/** Verify a browser-supplied Supabase JWT and return the user it belongs to. */
export async function getUserFromToken(token: string): Promise<AuthedUser | null> {
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

/** Atomically claim a slot on an invite code. False = invalid/inactive/full. */
export async function redeemInviteCode(code: string): Promise<boolean> {
  const { data, error } = await db.rpc("redeem_invite_code", { p_code: code });
  if (error) throw error;
  return data === true;
}

/** Give a redeemed slot back (used when user creation fails afterwards). */
export async function releaseInviteCode(code: string): Promise<void> {
  await db.rpc("release_invite_code", { p_code: code });
}

/** Create an auth user (email pre-confirmed) and tag the code they used. */
export async function createUser(email: string, password: string, code: string) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  // The on-signup trigger creates the profile; record which code was used.
  await db.from("profiles").upsert({ id: data.user.id, email, invite_code: code });
  return data.user;
}

export async function getProfile(userId: string) {
  const { data } = await db
    .from("profiles")
    .select("role, deck_allowance")
    .eq("id", userId)
    .single();
  return data;
}

export async function getDeck(deckId: string) {
  const { data } = await db.from("decks").select("*").eq("id", deckId).single();
  return data;
}

/** Count decks this user has already generated (entered the slides phase). */
export async function countGeneratedDecks(userId: string, exceptDeckId?: string) {
  let q = db
    .from("decks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("phase", "slides");
  if (exceptDeckId) q = q.neq("id", exceptDeckId);
  const { count } = await q;
  return count ?? 0;
}

export async function createTurn(t: {
  deckId: string;
  userId: string;
  kind: "outline" | "slide";
  label?: string;
  threadId?: string | null;
}) {
  const { data, error } = await db
    .from("turns")
    .insert({
      deck_id: t.deckId,
      user_id: t.userId,
      kind: t.kind,
      label: t.label ?? "",
      status: "queued",
      thread_id: t.threadId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTurn(id: string, patch: Record<string, unknown>) {
  await db.from("turns").update(patch).eq("id", id);
}

export async function turnOwner(turnId: string): Promise<string | null> {
  const { data } = await db.from("turns").select("user_id").eq("id", turnId).single();
  return data?.user_id ?? null;
}

export async function insertEvent(e: {
  turnId: string;
  deckId: string;
  userId: string;
  seq: number;
  channel: string;
  payload?: unknown;
}) {
  await db.from("turn_events").insert({
    turn_id: e.turnId,
    deck_id: e.deckId,
    user_id: e.userId,
    seq: e.seq,
    channel: e.channel,
    payload: e.payload ?? {},
  });
}

export async function upsertSlide(s: {
  deckId: string;
  outlineId: string;
  userId: string;
  status: "generating" | "done" | "error";
  storagePath?: string | null;
  error?: string | null;
}) {
  await db.from("slides").upsert({
    deck_id: s.deckId,
    outline_id: s.outlineId,
    user_id: s.userId,
    status: s.status,
    storage_path: s.storagePath ?? null,
    error: s.error ?? null,
  });
}

/** Upload a rendered PNG to the private `slides` bucket, return its object key. */
export async function uploadSlidePng(
  userId: string,
  deckId: string,
  outlineId: string,
  bytes: Buffer
): Promise<string> {
  const key = `${userId}/${deckId}/${outlineId}.png`;
  const { error } = await db.storage
    .from("slides")
    .upload(key, bytes, { contentType: "image/png", upsert: true });
  if (error) throw error;
  return key;
}

export async function setDeckThread(deckId: string, threadId: string) {
  await db.from("decks").update({ thread_id: threadId }).eq("id", deckId);
}

export async function setDeckPhase(deckId: string, phase: "brief" | "outline" | "slides") {
  await db.from("decks").update({ phase }).eq("id", deckId);
}
