#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.automation"
ENV_EXAMPLE="$ROOT/.env.automation.example"
COMPOSE_FILE="$ROOT/docker-compose.automation.yml"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

require_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    printf 'Missing %s. Run: %s init\n' "$ENV_FILE" "$0" >&2
    exit 1
  fi
  if grep -q '__GENERATE_ME__\|__OPENHANDS_WORKSPACE__' "$ENV_FILE"; then
    printf '%s still contains placeholders. Run: %s init\n' "$ENV_FILE" "$0" >&2
    exit 1
  fi
}

env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
}

init_env() {
  if [[ -f "$ENV_FILE" ]]; then
    printf '%s already exists; leaving it unchanged.\n' "$ENV_FILE"
  else
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    local token workspace escaped_workspace
    token="$(openssl rand -hex 32)"
    workspace="$ROOT/automation/openhands-workspace"
    escaped_workspace="${workspace//\//\\/}"
    sed -i.bak \
      -e "s/__GENERATE_ME__/$token/" \
      -e "s/__OPENHANDS_WORKSPACE__/$escaped_workspace/" \
      "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
    chmod 600 "$ENV_FILE"
    printf 'Created %s with a generated local token.\n' "$ENV_FILE"
  fi
  mkdir -p "$ROOT/automation/openhands-workspace"
}

start_profile() {
  local target="${1:-memory}"
  require_env
  case "$target" in
    memory)
      compose --profile memory up -d --build mem0-qdrant mem0
      ;;
    coding)
      compose --profile coding up -d openhands
      ;;
    all)
      compose --profile memory --profile coding up -d --build
      ;;
    *)
      printf 'Unknown start target: %s\n' "$target" >&2
      exit 2
      ;;
  esac
}

stop_profile() {
  local target="${1:-all}"
  require_env
  case "$target" in
    memory)
      compose --profile memory stop mem0 mem0-qdrant
      ;;
    coding)
      compose --profile coding stop openhands
      ;;
    all)
      compose --profile memory --profile coding stop
      ;;
    *)
      printf 'Unknown stop target: %s\n' "$target" >&2
      exit 2
      ;;
  esac
}

health() {
  require_env
  local token mem0_base openhands_port
  token="$(env_value MEM0_API_TOKEN)"
  mem0_base="$(env_value MEM0_BASE_URL)"
  openhands_port="$(env_value OPENHANDS_PORT)"
  mem0_base="${mem0_base:-http://127.0.0.1:8765}"
  openhands_port="${openhands_port:-3001}"

  printf 'Mem0: '
  curl -fsS -H "Authorization: Bearer $token" "$mem0_base/health" || true
  printf '\nOpenHands: '
  curl -fsS "http://127.0.0.1:$openhands_port/health" || printf 'stopped'
  printf '\n'
}

case "${1:-help}" in
  init)
    init_env
    ;;
  start)
    start_profile "${2:-memory}"
    ;;
  stop)
    stop_profile "${2:-all}"
    ;;
  restart)
    stop_profile "${2:-all}"
    start_profile "${2:-all}"
    ;;
  status)
    require_env
    compose --profile memory --profile coding ps
    ;;
  health)
    health
    ;;
  kill)
    require_env
    compose --profile memory --profile coding down --remove-orphans --timeout 5
    ;;
  *)
    cat <<EOF
Usage:
  $0 init
  $0 start memory|coding|all
  $0 stop memory|coding|all
  $0 restart memory|coding|all
  $0 status
  $0 health
  $0 kill
EOF
    ;;
esac

