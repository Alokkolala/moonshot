import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "./config";

export interface CodexCallbacks {
  /** One parsed JSONL event line (or {type:"raw",line} for non-JSON). */
  onLine: (event: any, raw: string) => void;
  /** A freshly produced PNG, read once its size is stable. */
  onImage: (filePath: string, bytes: Buffer) => void;
  /** Process exit — code 0 = success; stderr carries the failure detail. */
  onExit: (code: number | null, stderr: string) => void;
}

export interface CodexHandle {
  kill: () => void;
}

/**
 * Run one Codex turn in an ISOLATED per-session CODEX_HOME (seeded with the
 * shared auth) and a READ-ONLY sandbox — the two changes that make the desktop
 * orchestration safe to run for many users on one box. Mirrors the desktop
 * `run_turn`: spawn `codex exec --json`, stream events, watch generated_images.
 */
export interface SessionAsset {
  name: string;
  bytes: Buffer;
}

export function runCodexTurn(
  opts: {
    prompt: string;
    threadId?: string | null;
    directive: string;
    /** Brand assets to drop into the session's `assets/` dir before running. */
    assets?: SessionAsset[];
  },
  cb: CodexCallbacks
): CodexHandle {
  // Per-session home isolates this user's images + session rollouts from others.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-"));
  seedAuth(home);
  writeAssets(home, opts.assets ?? []);
  const imagesDir = path.join(home, "generated_images");
  fs.mkdirSync(imagesDir, { recursive: true });
  const seen = new Set<string>(); // fresh home → nothing seen yet

  const args = ["exec", "--json", "--skip-git-repo-check", "-s", "read-only"];
  if (opts.threadId) args.push("resume", opts.threadId, "-");
  else args.push("-");

  const child = spawnCodex(args, home);

  // Feed directive + prompt via stdin, then EOF (mirrors the desktop bridge).
  if (opts.directive) child.stdin!.write(opts.directive + "\n\n");
  child.stdin!.write(opts.prompt);
  child.stdin!.end();

  let stderr = "";
  child.stderr!.on("data", (d) => (stderr += d.toString()));

  // Line-buffered stdout → parsed events.
  let buf = "";
  child.stdout!.on("data", (chunk) => {
    buf += chunk.toString();
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        cb.onLine(JSON.parse(line), line);
      } catch {
        cb.onLine({ type: "raw", line }, line);
      }
    }
  });

  // Poll the images folder (mirrors the desktop watcher cadence).
  const watcher = setInterval(() => emitNewImages(imagesDir, seen, cb.onImage), 400);

  child.on("close", (code) => {
    clearInterval(watcher);
    emitNewImages(imagesDir, seen, cb.onImage); // final sweep
    cb.onExit(code, stderr);
    try {
      fs.rmSync(home, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  return { kill: () => killTree(child) };
}

/** Write downloaded brand assets into `<home>/assets/<name>` (prompt-referenced). */
function writeAssets(home: string, assets: SessionAsset[]) {
  if (!assets.length) return;
  const dir = path.join(home, "assets");
  fs.mkdirSync(dir, { recursive: true });
  for (const a of assets) {
    const safe = a.name.replace(/[\\/]/g, "_");
    try {
      fs.writeFileSync(path.join(dir, safe), a.bytes);
    } catch {
      /* skip a single bad asset rather than failing the whole turn */
    }
  }
}

/** Copy the shared auth (and config) into the session home so Codex is logged in. */
function seedAuth(home: string) {
  for (const f of ["auth.json", "config.toml"]) {
    const src = path.join(config.codexAuthHome, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(home, f));
  }
}

/** Spawn the Codex CLI, routing the Windows .cmd shim through cmd /C. */
function spawnCodex(args: string[], home: string): ChildProcess {
  const env = { ...process.env, CODEX_HOME: home };
  if (process.platform === "win32") {
    return spawn("cmd", ["/C", config.codexBin, ...args], { env, cwd: home });
  }
  return spawn(config.codexBin, args, { env, cwd: home });
}

function killTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

function emitNewImages(
  dir: string,
  seen: Set<string>,
  onImage: (p: string, bytes: Buffer) => void
) {
  for (const p of walkPngs(dir).sort()) {
    if (seen.has(p)) continue;
    const bytes = readStable(p);
    if (bytes) {
      onImage(p, bytes);
      seen.add(p);
    }
  }
}

function walkPngs(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkPngs(p));
    else if (e.name.toLowerCase().endsWith(".png")) out.push(p);
  }
  return out;
}

/** Wait for a file to stop growing, then read it (avoids half-written PNGs). */
function readStable(p: string): Buffer | null {
  let last = -1;
  for (let i = 0; i < 25; i++) {
    let size = 0;
    try {
      size = fs.statSync(p).size;
    } catch {
      return null;
    }
    if (size > 0 && size === last) break;
    last = size;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120); // sleep 120ms
  }
  try {
    const bytes = fs.readFileSync(p);
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}
