#!/bin/zsh
set -u

# Dorothy proactive notifications watcher.
# Runs the main OpenClaw agent on a schedule; the agent scans calendar, mail,
# finance and personal dates and calls dorothy_notify ONLY for what genuinely
# deserves your attention. Reaches only the user (Telegram self-channel);
# never messages a third party. See config/dorothy-proactive-prompt.md.

PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
HOME="/Users/you"
export PATH HOME
umask 077

ROOT="/Users/you/Projects/Dorothy/Dorothy"
PROMPT_FILE="$ROOT/config/dorothy-proactive-prompt.md"
OPENCLAW="/opt/homebrew/bin/openclaw"
LOG_DIR="$HOME/Library/Logs/Dorothy"
LOG_FILE="$LOG_DIR/proactive.log"
LOCK_DIR="/tmp/com.dorothy.proactive.lock"
AGENT_TIMEOUT_SECONDS="${DOROTHY_PROACTIVE_TIMEOUT_SECONDS:-280}"
# Optional model override. Leave empty to use the main agent's own model
# (gpt-4.1-mini). To use a stronger model, first add it to the main agent's
# allowlist in openclaw.json, then set e.g. DOROTHY_PROACTIVE_MODEL=ollama/qwen3.5:9b
PROACTIVE_MODEL="${DOROTHY_PROACTIVE_MODEL:-}"

/bin/mkdir -p "$LOG_DIR"
exec >>"$LOG_FILE" 2>&1

started_at=$(/bin/date -Iseconds)
echo "[$started_at] proactive watcher started"

# Single-flight: skip if another run is active (stale lock cleared after 1h).
if ! /bin/mkdir "$LOCK_DIR" 2>/dev/null; then
  lock_mtime=$(/usr/bin/stat -f '%m' "$LOCK_DIR" 2>/dev/null || echo 0)
  now_epoch=$(/bin/date +%s)
  if (( now_epoch - lock_mtime > 3600 )); then
    /bin/rmdir "$LOCK_DIR" 2>/dev/null || true
    /bin/mkdir "$LOCK_DIR" 2>/dev/null || { echo "lock contended; skipping"; exit 0; }
  else
    echo "another proactive run is active; duplicate skipped"
    exit 0
  fi
fi
trap '/bin/rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT INT TERM HUP

# Preflight.
if [[ ! -x "$OPENCLAW" ]]; then echo "openclaw CLI missing at $OPENCLAW"; exit 1; fi
if [[ ! -f "$PROMPT_FILE" ]]; then echo "prompt file missing at $PROMPT_FILE"; exit 1; fi

prompt="$(/bin/cat "$PROMPT_FILE")"

# Run one agent turn. The agent decides what (if anything) to notify.
model_args=()
[[ -n "$PROACTIVE_MODEL" ]] && model_args=(--model "$PROACTIVE_MODEL")
reply="$("$OPENCLAW" agent --agent main "${model_args[@]}" --timeout "$AGENT_TIMEOUT_SECONDS" --message "$prompt" 2>&1)"
run_status=$?

ended_at=$(/bin/date -Iseconds)
# Keep only the tail of the reply in the log (last non-empty line is the summary).
summary="$(printf '%s\n' "$reply" | /usr/bin/grep -v '^[[:space:]]*$' | /usr/bin/tail -1)"
echo "[$ended_at] proactive watcher done exit=$run_status summary=${summary:-<none>}"
exit "$run_status"
