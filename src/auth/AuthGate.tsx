import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "./AuthContext";
import { registerWithCode } from "../lib/api";

type Tab = "signin" | "register";

/** Full-screen auth screen shown until a session exists. Sign-in goes straight
 *  to Supabase; registration goes through the invite-code edge function. */
export function AuthGate() {
  const { signIn } = useAuth();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (tab === "register") {
        await registerWithCode({ email: email.trim(), password, code: code.trim() });
        // Account exists now — sign in immediately so they land in the studio.
        await signIn(email.trim(), password);
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl"
      >
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Moonshot</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn a brief into an AI-generated deck.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
          {(["signin", "register"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setError(null);
                setNotice(null);
              }}
              className={`rounded-md py-1.5 font-medium transition-colors ${
                tab === t ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t === "signin" ? "Sign in" : "Have a code"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {tab === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="code">Invite code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="LAUNCH20"
                autoCapitalize="characters"
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {notice && <p className="text-sm text-emerald-500">{notice}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy
              ? "Please wait…"
              : tab === "register"
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
