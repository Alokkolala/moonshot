import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Ticket, Users, Inbox, Check, X, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";

interface ProfileRow {
  id: string;
  email: string | null;
  role: "user" | "admin";
  deck_allowance: number;
  invite_code: string | null;
}
interface InviteRow {
  id: string;
  code: string;
  max_uses: number;
  uses: number;
  active: boolean;
  note: string | null;
}
interface RequestRow {
  id: string;
  user_id: string;
  requested_decks: number;
  reason: string | null;
  status: "pending" | "approved" | "denied";
  created_at: string;
}

/** Admin console: mint invite codes, decide deck-capacity requests, see users. */
export function AdminView() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [codes, setCodes] = useState<InviteRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [newCode, setNewCode] = useState("");
  const [newMax, setNewMax] = useState(20);
  const [newNote, setNewNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: p }, { data: c }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: true }),
      supabase.from("invite_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("deck_requests").select("*").order("created_at", { ascending: false }),
    ]);
    setProfiles((p as ProfileRow[]) ?? []);
    setCodes((c as InviteRow[]) ?? []);
    setRequests((r as RequestRow[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const emailFor = (id: string) => profiles.find((p) => p.id === id)?.email ?? id.slice(0, 8);

  const mintCode = async (e: FormEvent) => {
    e.preventDefault();
    const code = newCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    const { error } = await supabase.from("invite_codes").insert({
      code,
      max_uses: Math.max(1, newMax),
      note: newNote.trim() || null,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (!error) {
      setNewCode("");
      setNewNote("");
      setNewMax(20);
      void load();
    } else {
      alert(error.message);
    }
  };

  const toggleCode = async (c: InviteRow) => {
    await supabase.from("invite_codes").update({ active: !c.active }).eq("id", c.id);
    void load();
  };

  const decide = async (r: RequestRow, status: "approved" | "denied") => {
    await supabase.from("deck_requests").update({ status }).eq("id", r.id);
    void load();
  };

  const setRole = async (p: ProfileRow, role: "user" | "admin") => {
    await supabase.from("profiles").update({ role }).eq("id", p.id);
    void load();
  };

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
          <Button variant="ghost" size="sm" onClick={() => void load()} className="gap-1.5">
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>

        {/* Invite codes */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Ticket className="size-4" /> Invite codes
          </h2>
          <form
            onSubmit={mintCode}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card/60 p-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="LAUNCH20"
                className="w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max">Max uses</Label>
              <Input
                id="max"
                type="number"
                min={1}
                value={newMax}
                onChange={(e) => setNewMax(Number(e.target.value))}
                className="w-24"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="e.g. beta cohort"
              />
            </div>
            <Button type="submit" disabled={busy} className="gap-1.5">
              <Plus className="size-4" /> Mint
            </Button>
          </form>

          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">Uses</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="px-4 py-2 font-mono">{c.code}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {c.uses}/{c.max_uses}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{c.note ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={c.active ? "text-emerald-500" : "text-muted-foreground"}>
                        {c.active ? "active" : "disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => void toggleCode(c)}>
                        {c.active ? "Disable" : "Enable"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {codes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      No codes yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Deck requests */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Inbox className="size-4" /> Deck requests
            {pending.length > 0 && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                {pending.length} pending
              </span>
            )}
          </h2>
          <div className="space-y-2">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    <span className="font-medium">{emailFor(r.user_id)}</span>
                    <span className="text-muted-foreground"> · +{r.requested_decks} decks</span>
                  </p>
                  {r.reason && (
                    <p className="truncate text-xs text-muted-foreground">{r.reason}</p>
                  )}
                </div>
                {r.status === "pending" ? (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => void decide(r, "approved")} className="gap-1.5">
                      <Check className="size-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void decide(r, "denied")}
                      className="gap-1.5"
                    >
                      <X className="size-3.5" /> Deny
                    </Button>
                  </div>
                ) : (
                  <span
                    className={
                      r.status === "approved"
                        ? "text-sm text-emerald-500"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    {r.status}
                  </span>
                )}
              </div>
            ))}
            {requests.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                No requests.
              </p>
            )}
          </div>
        </section>

        {/* Users */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="size-4" /> Users
          </h2>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Allowance</th>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-t border-border/60">
                    <td className="px-4 py-2">{p.email ?? "—"}</td>
                    <td className="px-4 py-2">{p.role}</td>
                    <td className="px-4 py-2 tabular-nums">{p.deck_allowance}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {p.invite_code ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void setRole(p, p.role === "admin" ? "user" : "admin")}
                      >
                        {p.role === "admin" ? "Demote" : "Make admin"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
