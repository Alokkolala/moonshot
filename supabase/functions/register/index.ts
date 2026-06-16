// Invite-code registration. Public (no JWT): validates + atomically redeems a
// code, then creates the auth user with the service role. Runs on Supabase so it
// works independently of the Codex worker.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { email?: string; password?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  const code = (body.code ?? "").trim();
  if (!email || !password || !code)
    return json({ error: "email, password, code required" }, 400);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Atomically claim a slot on the code.
  const { data: claimed, error: rpcErr } = await db.rpc("redeem_invite_code", {
    p_code: code,
  });
  if (rpcErr) return json({ error: "server", message: rpcErr.message }, 500);
  if (claimed !== true)
    return json({ error: "INVALID_CODE", message: "Invite code is invalid or full." }, 403);

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    await db.rpc("release_invite_code", { p_code: code }); // refund the slot
    return json({ error: "REGISTER_FAILED", message: error?.message ?? "failed" }, 400);
  }

  await db.from("profiles").upsert({ id: data.user.id, email, invite_code: code });
  return json({ ok: true, userId: data.user.id });
});
