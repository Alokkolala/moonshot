use std::collections::HashSet;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// PIDs of Codex processes spawned by active turns, so a quit can stop them.
fn running_children() -> &'static Mutex<HashSet<u32>> {
    static PIDS: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();
    PIDS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Forcefully kill a process and its whole child tree (Codex spawns cmd → node →
/// codex.exe on Windows, so the tree must be taken down, not just the root PID).
fn kill_pid_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
}

#[derive(Clone, Serialize)]
struct EventPayload {
    line: String,
}

#[derive(Clone, Serialize)]
struct ImagePayload {
    path: String,
    #[serde(rename = "dataUrl")]
    data_url: String,
}

#[derive(Clone, Serialize)]
struct DonePayload {
    code: Option<i32>,
}

#[derive(Clone, Serialize)]
struct ErrorPayload {
    message: String,
}

/// One Codex rate-limit window (e.g. the 5-hour or weekly bucket).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RateWindow {
    used_percent: f64,
    window_minutes: u64,
    /// Unix seconds at which this window resets.
    resets_at: Option<i64>,
}

/// Codex subscription usage, scraped from the latest session rollout file.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageInfo {
    primary: Option<RateWindow>,
    secondary: Option<RateWindow>,
    plan_type: Option<String>,
    /// ISO timestamp of the rate-limit snapshot, for staleness display.
    timestamp: Option<String>,
}

/// Resolve the Codex home directory (`$CODEX_HOME` or `~/.codex`).
fn codex_home() -> PathBuf {
    if let Ok(h) = std::env::var("CODEX_HOME") {
        if !h.trim().is_empty() {
            return PathBuf::from(h);
        }
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".codex")
}

/// Resolve how to invoke the Codex CLI. The `codex` shipped by npm on Windows is
/// a `.cmd` shim, which `Command::new("codex")` cannot launch (Windows only
/// auto-appends `.exe`, never consults `PATHEXT`). So we locate it on `PATH`
/// ourselves and route batch shims through `cmd /C`. A `CODEX_BIN` env override
/// always wins, for non-standard installs.
fn codex_command() -> Command {
    if let Ok(bin) = std::env::var("CODEX_BIN") {
        let bin = bin.trim();
        if !bin.is_empty() {
            return wrap_program(PathBuf::from(bin));
        }
    }
    match find_on_path("codex") {
        Some(found) => wrap_program(found),
        None => Command::new("codex"),
    }
}

/// Build a `Command` for a resolved program path, routing Windows batch shims
/// (`.cmd`/`.bat`) through `cmd /C` since they are not directly executable.
fn wrap_program(path: PathBuf) -> Command {
    let is_batch = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat"))
        .unwrap_or(false);
    if cfg!(windows) && is_batch {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(path);
        c
    } else {
        Command::new(path)
    }
}

/// Search each `PATH` entry for an executable named `name`. On Windows this tries
/// every `PATHEXT` suffix (preferring `.exe`); on Unix it looks for the bare name.
fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        if cfg!(windows) {
            let exts =
                std::env::var("PATHEXT").unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".to_string());
            for ext in exts.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()) {
                let cand = dir.join(format!("{name}{ext}"));
                if cand.is_file() {
                    return Some(cand);
                }
            }
        } else {
            let cand = dir.join(name);
            if cand.is_file() {
                return Some(cand);
            }
        }
    }
    None
}

/// Recursively collect every `*.png` path under `dir`.
fn collect_pngs(dir: &Path, out: &mut HashSet<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_pngs(&path, out);
        } else if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("png"))
            .unwrap_or(false)
        {
            out.insert(path);
        }
    }
}

/// Read a file once it has stopped growing, then base64-encode it as a data URL.
fn read_stable_image(path: &Path) -> Option<String> {
    let mut last = 0u64;
    for _ in 0..25 {
        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if size > 0 && size == last {
            break;
        }
        last = size;
        std::thread::sleep(Duration::from_millis(120));
    }
    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

/// Run one Codex turn. Spawns (or resumes) `codex exec --json`, streams JSONL
/// events back to the UI, and watches the generated-images folder so any new
/// slide is pushed as an image event. Returns immediately; work runs on threads.
///
/// `directive` is the system/instruction text the frontend prepends to the user
/// prompt (e.g. the JSON-planner directive for outlines, or the image-rendering
/// directive for slides). It is owned by the UI/Settings so all of Moonshot's
/// behaviour is driven purely by prompts.
#[tauri::command]
fn send_message(
    app: AppHandle,
    prompt: String,
    thread_id: Option<String>,
    directive: Option<String>,
) -> Result<(), String> {
    std::thread::spawn(move || {
        run_turn(app, prompt, thread_id, directive.unwrap_or_default());
    });
    Ok(())
}

fn run_turn(app: AppHandle, prompt: String, thread_id: Option<String>, directive: String) {
    let images_dir = codex_home().join("generated_images");
    let _ = std::fs::create_dir_all(&images_dir);

    // Snapshot existing images so we only surface ones produced by this turn.
    let mut seen: HashSet<PathBuf> = HashSet::new();
    collect_pngs(&images_dir, &mut seen);

    let mut cmd = codex_command();
    cmd.arg("exec")
        .arg("--json")
        .arg("--skip-git-repo-check")
        .arg("-s")
        .arg("workspace-write")
        .arg("--dangerously-bypass-approvals-and-sandbox");

    if let Some(id) = thread_id.as_ref().filter(|s| !s.is_empty()) {
        cmd.arg("resume").arg(id).arg("-");
    } else {
        cmd.arg("-");
    }

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit(
                "codex://error",
                ErrorPayload {
                    message: format!(
                        "Could not start Codex CLI ({e}). Make sure `codex` is installed and on PATH."
                    ),
                },
            );
            let _ = app.emit("codex://done", DonePayload { code: None });
            return;
        }
    };

    let pid = child.id();
    if let Ok(mut set) = running_children().lock() {
        set.insert(pid);
    }

    // Feed the prompt via stdin, prefixed with the directive supplied by the UI
    // (a JSON-planner directive for outlines, or an image-rendering directive for
    // slides). All behaviour is driven by these prompts, not by Codex tools.
    if let Some(mut stdin) = child.stdin.take() {
        if !directive.is_empty() {
            let _ = stdin.write_all(directive.as_bytes());
            let _ = stdin.write_all(b"\n\n");
        }
        let _ = stdin.write_all(prompt.as_bytes());
        // dropping stdin closes it, signalling EOF
    }

    let running = Arc::new(AtomicBool::new(true));

    // ---- Image-watcher thread ----
    let watcher = {
        let app = app.clone();
        let running = running.clone();
        let images_dir = images_dir.clone();
        let mut seen = seen.clone();
        std::thread::spawn(move || {
            while running.load(Ordering::Relaxed) {
                emit_new_images(&app, &images_dir, &mut seen);
                std::thread::sleep(Duration::from_millis(400));
            }
            // Final sweep after the process exits.
            emit_new_images(&app, &images_dir, &mut seen);
        })
    };

    // ---- stderr collector ----
    let stderr_handle = child.stderr.take().map(|stderr| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                buf.push_str(&line);
                buf.push('\n');
            }
            buf
        })
    });

    // ---- stdout reader (this thread) ----
    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            let _ = app.emit("codex://event", EventPayload { line });
        }
    }

    let status = child.wait();
    if let Ok(mut set) = running_children().lock() {
        set.remove(&pid);
    }
    running.store(false, Ordering::Relaxed);
    let _ = watcher.join();

    let code = status.as_ref().ok().and_then(|s| s.code());
    let success = status.as_ref().map(|s| s.success()).unwrap_or(false);

    if !success {
        let detail = stderr_handle
            .and_then(|h| h.join().ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Codex exited unexpectedly.".to_string());
        let _ = app.emit("codex://error", ErrorPayload { message: detail });
    }

    let _ = app.emit("codex://done", DonePayload { code });
}

fn emit_new_images(app: &AppHandle, images_dir: &Path, seen: &mut HashSet<PathBuf>) {
    let mut current: HashSet<PathBuf> = HashSet::new();
    collect_pngs(images_dir, &mut current);
    let mut fresh: Vec<PathBuf> = current.difference(seen).cloned().collect();
    fresh.sort();
    for path in fresh {
        if let Some(data_url) = read_stable_image(&path) {
            let _ = app.emit(
                "codex://image",
                ImagePayload {
                    path: path.to_string_lossy().to_string(),
                    data_url,
                },
            );
        }
        seen.insert(path);
    }
}

/// Recursively collect Codex session rollout files with their modified time.
fn collect_rollouts(dir: &Path, out: &mut Vec<(std::time::SystemTime, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_rollouts(&path, out);
        } else if path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with("rollout-") && n.ends_with(".jsonl"))
            .unwrap_or(false)
        {
            if let Ok(mtime) = entry.metadata().and_then(|m| m.modified()) {
                out.push((mtime, path));
            }
        }
    }
}

/// Pull the most recent `rate_limits` snapshot out of a rollout file, if any.
fn extract_usage(path: &Path) -> Option<UsageInfo> {
    let content = std::fs::read_to_string(path).ok()?;
    // The newest snapshot is the last line that carries rate_limits.
    let line = content
        .lines()
        .rev()
        .find(|l| l.contains("\"rate_limits\""))?;
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    let rl = v.get("payload")?.get("rate_limits")?;

    let parse_window = |w: &serde_json::Value| -> Option<RateWindow> {
        Some(RateWindow {
            used_percent: w.get("used_percent")?.as_f64()?,
            window_minutes: w.get("window_minutes").and_then(|x| x.as_u64()).unwrap_or(0),
            resets_at: w.get("resets_at").and_then(|x| x.as_i64()),
        })
    };

    Some(UsageInfo {
        primary: rl.get("primary").and_then(parse_window),
        secondary: rl.get("secondary").and_then(parse_window),
        plan_type: rl
            .get("plan_type")
            .and_then(|x| x.as_str())
            .map(String::from),
        timestamp: v
            .get("timestamp")
            .and_then(|x| x.as_str())
            .map(String::from),
    })
}

/// Read Codex's remaining-usage rate limits from the latest session rollout file.
/// The Codex CLI records `rate_limits` (5h + weekly windows) on every turn, so the
/// most recently modified rollout that contains one holds the current usage.
#[tauri::command]
fn codex_usage() -> Option<UsageInfo> {
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    collect_rollouts(&codex_home().join("sessions"), &mut files);
    files.sort_by(|a, b| b.0.cmp(&a.0));
    files
        .into_iter()
        .take(12)
        .find_map(|(_, path)| extract_usage(&path))
}

/// Copy a generated image to a user-chosen destination.
#[tauri::command]
fn save_image_as(src: String, dest: String) -> Result<(), String> {
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

/// Read a previously-rendered slide PNG off disk and return it as a data URL.
/// Used to rehydrate decks after reload (data URLs aren't persisted, paths are).
#[tauri::command]
fn read_image(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Err("empty image file".into());
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{b64}"))
}

/// Write raw bytes to a path — used to save the exported PDF the UI builds.
#[tauri::command]
fn write_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())
}

/// Stop the currently-running Codex session (kills its process tree). Only one
/// generation runs at a time, so this stops the active deck's work.
#[tauri::command]
fn stop_codex() {
    if let Ok(mut set) = running_children().lock() {
        for pid in set.drain() {
            kill_pid_tree(pid);
        }
    }
}

/// Stop all running Codex work and quit the app.
#[tauri::command]
fn quit_app(app: AppHandle) {
    if let Ok(mut set) = running_children().lock() {
        for pid in set.drain() {
            kill_pid_tree(pid);
        }
    }
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            send_message,
            save_image_as,
            read_image,
            write_file,
            codex_usage,
            stop_codex,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running Moonshot");
}
