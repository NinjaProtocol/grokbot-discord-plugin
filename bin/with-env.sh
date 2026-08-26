#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

set -a
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.env"
fi
if [[ -f "$ROOT/.runtime-webhook.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.runtime-webhook.env"
fi
set +a

if [[ -z "${DISCORD_TOKEN:-}" && -n "${DISCORD_TOKEN_FILE:-}" && -f "$DISCORD_TOKEN_FILE" ]]; then
  DISCORD_TOKEN="$(tr -d '\r\n' < "$DISCORD_TOKEN_FILE")"
  export DISCORD_TOKEN
fi

is-loopback-webhook() {
  local url="${GROK_WEBHOOK_URL:-}"
  [[ "$url" =~ ^https?://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]+)?(/|$) ]]
}

webhook-port() {
  local url="${GROK_WEBHOOK_URL:-}"
  if [[ "$url" =~ ^https?://[^/]+:([0-9]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return
  fi
  printf '8787\n'
}

port-open() {
  local port="$1"
  node -e '
    const net = require("net");
    const port = Number(process.argv[1]);
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.end();
      process.exit(0);
    });
    socket.setTimeout(400, () => {
      socket.destroy();
      process.exit(1);
    });
    socket.on("error", () => process.exit(1));
  ' "$port"
}

if is-loopback-webhook && [[ -n "${GROK_WEBHOOK_UPSTREAM:-}" ]]; then
  port="$(webhook-port)"
  export GROK_WEBHOOK_FORWARD_PORT="$port"
  if ! port-open "$port"; then
    mkdir -p "${GROK_DISCORD_RUNTIME_DIR:-$HOME/.grok-discord}"
    log="${GROK_DISCORD_RUNTIME_DIR:-$HOME/.grok-discord}/webhook-forward.log"
    nohup node "$ROOT/bin/webhook-forward.mjs" >>"$log" 2>&1 &
    disown || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      if port-open "$port"; then
        break
      fi
      sleep 0.1
    done
  fi
fi

exec "$@"
