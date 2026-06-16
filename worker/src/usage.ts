import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

export interface RateWindow {
  usedPercent: number;
  windowMinutes: number;
  resetsAt: number | null;
}
export interface UsageInfo {
  primary: RateWindow | null;
  secondary: RateWindow | null;
  planType: string | null;
  timestamp: string | null;
}

/** Recursively collect Codex rollout files (rollout-*.jsonl) with their mtime. */
function collectRollouts(dir: string, out: { mtime: number; path: string }[]) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectRollouts(p, out);
    else if (e.name.startsWith("rollout-") && e.name.endsWith(".jsonl")) {
      try {
        out.push({ mtime: fs.statSync(p).mtimeMs, path: p });
      } catch {
        /* ignore */
      }
    }
  }
}

function parseWindow(w: any): RateWindow | null {
  if (!w || typeof w.used_percent !== "number") return null;
  return {
    usedPercent: w.used_percent,
    windowMinutes: typeof w.window_minutes === "number" ? w.window_minutes : 0,
    resetsAt: typeof w.resets_at === "number" ? w.resets_at : null,
  };
}

/** Pull the most recent rate_limits snapshot out of one rollout file. */
function extractUsage(file: string): UsageInfo | null {
  let content: string;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const lines = content.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"rate_limits"')) continue;
    try {
      const v = JSON.parse(lines[i]);
      const rl = v?.payload?.rate_limits;
      if (!rl) continue;
      return {
        primary: parseWindow(rl.primary),
        secondary: parseWindow(rl.secondary),
        planType: typeof rl.plan_type === "string" ? rl.plan_type : null,
        timestamp: typeof v.timestamp === "string" ? v.timestamp : null,
      };
    } catch {
      /* keep scanning */
    }
  }
  return null;
}

/** Remaining-usage scrape: newest rollout that carries a rate_limits snapshot. */
export function readCodexUsage(): UsageInfo | null {
  const files: { mtime: number; path: string }[] = [];
  collectRollouts(path.join(config.codexAuthHome, "sessions"), files);
  files.sort((a, b) => b.mtime - a.mtime);
  for (const f of files.slice(0, 12)) {
    const u = extractUsage(f.path);
    if (u) return u;
  }
  return null;
}

/** True when the weekly window is too depleted to safely start new work. */
export function budgetExhausted(): boolean {
  const u = readCodexUsage();
  return !!u?.secondary && u.secondary.usedPercent >= config.usageBlockPercent;
}
