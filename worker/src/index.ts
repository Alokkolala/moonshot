import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config";
import { bootstrapCodexAuth } from "./bootstrap";
import { readCodexUsage } from "./usage";
import { enqueue, queuePosition, stats, stop } from "./pool";
import {
  countGeneratedDecks,
  createTurn,
  createUser,
  getDeck,
  getProfile,
  getUserFromToken,
  redeemInviteCode,
  releaseInviteCode,
  setDeckPhase,
  turnOwner,
  type AuthedUser,
} from "./supabase";

interface AuthedRequest extends Request {
  user?: AuthedUser;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// ---- invite-code registration (no token yet — must run before auth) ----
app.post("/register", async (req: Request, res: Response) => {
  const { email, password, code } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || typeof code !== "string")
    return res.status(400).json({ error: "email, password, code required" });

  const claimed = await redeemInviteCode(code.trim());
  if (!claimed)
    return res.status(403).json({ error: "INVALID_CODE", message: "Invite code is invalid or full." });

  try {
    const user = await createUser(email, password, code.trim());
    res.json({ ok: true, userId: user.id });
  } catch (e) {
    // Creation failed (e.g. email taken) — return the claimed slot.
    await releaseInviteCode(code.trim());
    res.status(400).json({ error: "REGISTER_FAILED", message: String(e) });
  }
});

// ---- auth: verify the browser's Supabase JWT on every request ----
app.use(async (req: AuthedRequest, res: Response, next: NextFunction) => {
  if (req.path === "/health" || req.path === "/register") return next();
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing bearer token" });
  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ error: "invalid token" });
  req.user = user;
  next();
});

// ---- enqueue a Codex turn for a deck ----
app.post("/decks/:deckId/turn", async (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const { prompt, directive, kind, outlineId, label } = req.body ?? {};

  if (typeof prompt !== "string" || !prompt.trim())
    return res.status(400).json({ error: "prompt required" });
  if (kind !== "outline" && kind !== "slide")
    return res.status(400).json({ error: "kind must be outline|slide" });

  const deck = await getDeck(req.params.deckId);
  if (!deck || deck.user_id !== user.id)
    return res.status(404).json({ error: "deck not found" });
  if (deck.slide_count > config.maxSlides)
    return res.status(400).json({ error: `slide_count exceeds ${config.maxSlides}` });

  // Allowance gate: starting generation on a deck that hasn't been generated yet.
  if (kind === "slide" && deck.phase !== "slides") {
    const used = await countGeneratedDecks(user.id, deck.id);
    const profile = await getProfile(user.id);
    const allowance = profile?.deck_allowance ?? 1;
    if (used >= allowance) {
      return res.status(403).json({
        error: "DECK_LIMIT",
        message: "Deck limit reached — request more capacity from an admin.",
        used,
        allowance,
      });
    }
    await setDeckPhase(deck.id, "slides");
  }

  const turn = await createTurn({
    deckId: deck.id,
    userId: user.id,
    kind,
    label,
    threadId: deck.thread_id,
  });

  // Brand assets the user uploaded for this deck (downloaded per-run by the pool).
  const attachments = Array.isArray(deck.attachments)
    ? (deck.attachments as { name?: string; storage_path?: string }[])
        .filter((a) => a?.name && a?.storage_path)
        .map((a) => ({ name: a.name as string, storagePath: a.storage_path as string }))
    : [];

  enqueue({
    turnId: turn.id,
    deckId: deck.id,
    userId: user.id,
    kind,
    prompt,
    directive: typeof directive === "string" ? directive : "",
    threadId: deck.thread_id ?? null,
    outlineId: typeof outlineId === "string" ? outlineId : undefined,
    attachments,
  });

  res.json({ turnId: turn.id, queuePosition: queuePosition(turn.id) });
});

// ---- stop a running/queued turn (owner only) ----
app.post("/turns/:turnId/stop", async (req: AuthedRequest, res: Response) => {
  const owner = await turnOwner(req.params.turnId);
  if (owner !== req.user!.id) return res.status(404).json({ error: "turn not found" });
  stop(req.params.turnId);
  res.json({ ok: true });
});

// ---- subscription usage scrape ----
app.get("/usage", (_req, res) => {
  res.json(readCodexUsage());
});

// ---- liveness + pool stats ----
app.get("/health", (_req, res) => {
  res.json({ ok: true, ...stats() });
});

bootstrapCodexAuth();

app.listen(config.port, () => {
  console.log(`moonshot worker listening on :${config.port}`);
});
