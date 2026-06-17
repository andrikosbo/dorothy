#!/bin/zsh
set -u

PATH="/Users/you/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
LOG_DIR="/Users/you/Library/Logs/Dorothy"
LOG_FILE="$LOG_DIR/morning-cycle.log"
CLAUDE="/Users/you/.local/bin/claude"
POWER_HELPER="/usr/local/sbin/dorothy-power"
HEALTHCHECK_DIR="/tmp/dorothy-claude-healthcheck"
LOCK_DIR="/tmp/dorothy-morning-cycle.lock"
CLAUDE_TIMEOUT_SECONDS=30
tmp_output=""

/bin/mkdir -p "$LOG_DIR"
exec >>"$LOG_FILE" 2>&1

echo "[$(/bin/date -Iseconds)] morning cycle started"

if ! /bin/mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Morning cycle already running; duplicate invocation skipped"
  exit 0
fi

cleanup() {
  [[ -n "$tmp_output" ]] && /bin/rm -f "$tmp_output"
  /bin/rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM HUP

claude_ok=0
claude_failure=""

if [[ "${DOROTHY_SKIP_CLAUDE_CHECK:-0}" == "1" ]]; then
  claude_ok=1
  echo "Claude Code check skipped by explicit test override"
elif [[ ! -x "$CLAUDE" ]]; then
  claude_failure="Claude Code is not installed at $CLAUDE"
elif ! "$CLAUDE" auth status 2>/dev/null | /usr/bin/grep -q '"loggedIn": true'; then
  claude_failure="Claude Code is not authenticated"
else
  /bin/mkdir -p "$HEALTHCHECK_DIR"
  tmp_output="$(/usr/bin/mktemp /tmp/dorothy-claude-ok.XXXXXX)"
  claude_started_at=$(/bin/date +%s)

  (
    cd "$HEALTHCHECK_DIR"
    "$CLAUDE" \
      -p "Return exactly ΟΚ." \
      --model haiku \
      --effort low \
      --system-prompt "You are a minimal health-check endpoint. Return exactly ΟΚ and nothing else." \
      --tools "" \
      --disable-slash-commands \
      --no-chrome \
      --strict-mcp-config \
      --mcp-config '{"mcpServers":{}}' \
      --no-session-persistence \
      --max-turns 1 \
      --max-budget-usd 0.002 \
      --permission-mode dontAsk \
      --output-format json \
      >"$tmp_output" 2>&1
  ) &
  claude_pid=$!

  for ((elapsed = 0; elapsed < CLAUDE_TIMEOUT_SECONDS; elapsed++)); do
    if ! /bin/kill -0 "$claude_pid" 2>/dev/null; then
      break
    fi
    /bin/sleep 1
  done

  if /bin/kill -0 "$claude_pid" 2>/dev/null; then
    /bin/kill "$claude_pid" 2>/dev/null || true
    /bin/sleep 1
    /bin/kill -9 "$claude_pid" 2>/dev/null || true
    wait "$claude_pid" 2>/dev/null || true
    claude_failure="Claude Code timed out after ${CLAUDE_TIMEOUT_SECONDS} seconds"
  else
    wait "$claude_pid"
    claude_status=$?
    claude_reply=$(/usr/bin/jq -r '.result // empty' "$tmp_output" 2>/dev/null)

    if [[ "$claude_status" -eq 0 && "$claude_reply" == "ΟΚ" ]]; then
      claude_ok=1
      claude_model=$(/usr/bin/jq -r '.modelUsage | keys[0] // "unknown"' "$tmp_output")
      claude_input=$(/usr/bin/jq -r '.modelUsage | to_entries[0].value.inputTokens // .usage.input_tokens // 0' "$tmp_output")
      claude_output=$(/usr/bin/jq -r '.modelUsage | to_entries[0].value.outputTokens // .usage.output_tokens // 0' "$tmp_output")
      claude_cache=$(/usr/bin/jq -r '.modelUsage | to_entries[0].value.cacheCreationInputTokens // .usage.cache_creation_input_tokens // 0' "$tmp_output")
      claude_cost=$(/usr/bin/jq -r '.total_cost_usd // 0' "$tmp_output")
      claude_duration=$(( $(/bin/date +%s) - claude_started_at ))
      echo "Claude Code check: ΟΚ model=$claude_model input=$claude_input output=$claude_output cache_create=$claude_cache cost_usd=$claude_cost duration_seconds=$claude_duration"
    else
      claude_failure="Claude check failed: status=$claude_status reply=${claude_reply:-<empty>}"
    fi
  fi
fi

if [[ "$claude_ok" -ne 1 ]]; then
  echo "$claude_failure"
  echo "Power cycle will continue so the Mac is not left awake after a Claude failure"
fi

if [[ "${DOROTHY_DRY_RUN:-0}" == "1" ]]; then
  echo "Dry run complete; wake scheduling and sleep skipped"
  [[ "$claude_ok" -eq 1 ]]
  exit $?
fi

if [[ "$(/bin/date '+%H%M')" -ge 755 ]]; then
  wake_date=$(/bin/date -v+1d '+%m/%d/%Y')
else
  wake_date=$(/bin/date '+%m/%d/%Y')
fi

if /usr/bin/pmset -g sched | /usr/bin/grep -Fq "wakeorpoweron at $wake_date 07:55:00"; then
  echo "07:55 wake already scheduled for $wake_date"
elif ! /usr/bin/sudo -n "$POWER_HELPER" schedule-second-wake; then
  echo "Could not schedule 07:55 wake; sleep skipped"
  exit 1
else
  echo "07:55 wake scheduled for $wake_date"
fi

# Claude Desktop currently holds a NoIdleSleepAssertion while open.
/usr/bin/osascript -e 'tell application "Claude" to quit' >/dev/null 2>&1 || true
/bin/sleep 3

echo "Requesting sleep"
if ! /usr/bin/sudo -n "$POWER_HELPER" sleep; then
  echo "Sleep request failed"
  exit 1
fi

[[ "$claude_ok" -eq 1 ]]
exit $?
