# Moonshot Codex worker — long-lived Node service that spawns the Codex CLI.
# The Codex CLI is an npm package (@openai/codex); we install it globally so the
# pool can `spawn("codex", ...)`. Auth is materialised at boot by bootstrap.ts
# from the CODEX_AUTH_JSON_B64 env var (the owner's logged-in ~/.codex/auth.json).
FROM node:24-slim

# Codex CLI needs git on PATH for repo checks (we pass --skip-git-repo-check, but
# the binary still probes for it) and ca-certificates for the OpenAI endpoints.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install the Codex CLI globally.
RUN npm install -g @openai/codex

WORKDIR /app

# Install worker deps first for layer caching.
COPY package.json ./
RUN npm install

# App source.
COPY tsconfig.json ./
COPY src ./src

# Shared Codex home (auth.json written here at boot; each turn copies it into a
# throwaway per-session CODEX_HOME).
ENV CODEX_AUTH_HOME=/home/app/.codex
ENV PORT=8787
RUN mkdir -p /home/app/.codex

EXPOSE 8787
CMD ["npm", "run", "start"]
