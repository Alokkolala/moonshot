import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

/**
 * Materialise the shared Codex login at boot. Railway containers are ephemeral
 * and `codex login` is interactive, so the owner logs in ONCE locally and pastes
 * the resulting `~/.codex/auth.json` (base64) as CODEX_AUTH_JSON_B64. We write it
 * into CODEX_AUTH_HOME so every spawned session is already authenticated.
 *
 * If a real auth.json is already present (e.g. a mounted volume) we leave it be.
 */
export function bootstrapCodexAuth(): void {
  fs.mkdirSync(config.codexAuthHome, { recursive: true });
  fs.mkdirSync(path.join(config.codexAuthHome, "sessions"), { recursive: true });

  writeFromEnv("CODEX_AUTH_JSON_B64", path.join(config.codexAuthHome, "auth.json"));
  writeFromEnv("CODEX_CONFIG_TOML_B64", path.join(config.codexAuthHome, "config.toml"));

  const authPath = path.join(config.codexAuthHome, "auth.json");
  if (!fs.existsSync(authPath)) {
    console.warn(
      "[bootstrap] No Codex auth.json present. Set CODEX_AUTH_JSON_B64 " +
        "(base64 of your local ~/.codex/auth.json) or mount one into CODEX_AUTH_HOME."
    );
  } else {
    console.log(`[bootstrap] Codex auth ready at ${authPath}`);
  }
}

function writeFromEnv(envName: string, dest: string): void {
  const b64 = process.env[envName];
  if (!b64) return;
  try {
    fs.writeFileSync(dest, Buffer.from(b64, "base64"));
    console.log(`[bootstrap] wrote ${path.basename(dest)} from ${envName}`);
  } catch (e) {
    console.error(`[bootstrap] failed to write ${dest}:`, e);
  }
}
