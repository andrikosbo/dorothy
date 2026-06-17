#!/bin/zsh
set -u

PATH="/Users/you/.local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
HOME="/Users/you"
ROOT="/Users/you/Projects/Dorothy/Dorothy"
WEBAPP_ROOT="/Users/you/Projects/Dorothy/dorothy-web"
DESKTOP="$HOME/Desktop"
TASK_FILE="$DESKTOP/nightly_tasks.md"
BACKUP_ROOT="$DESKTOP/Dorothy Nightly Backups"
PROMPT_FILE="$ROOT/config/dorothy-nightly-cli-prompt.md"
CLAUDE="/Users/you/.local/bin/claude"
NIGHTLY_MODEL="${DOROTHY_NIGHTLY_MODEL:-sonnet}"
NIGHTLY_BUDGET_USD="${DOROTHY_NIGHTLY_BUDGET_USD:-3.00}"
LOG_DIR="$HOME/Library/Logs/Dorothy"
LAUNCHD_LOG="$LOG_DIR/nightly-cli.log"
LOCK_DIR="/tmp/com.dorothy.nightly-cli.lock"
RUN_NOW_FILE="/tmp/com.dorothy.nightly-cli.run-now"
DEFAULT_TIMEOUT_SECONDS=3900
TIMEOUT_SECONDS="${DOROTHY_NIGHTLY_TIMEOUT_SECONDS:-$DEFAULT_TIMEOUT_SECONDS}"

export PATH HOME
umask 077

/bin/mkdir -p "$LOG_DIR"
exec >>"$LAUNCHD_LOG" 2>&1

run_mode="${1:-scheduled}"
if [[ -f "$RUN_NOW_FILE" ]]; then
  run_mode="launchd-test"
  /bin/rm -f "$RUN_NOW_FILE"
fi

now_hm=$(/bin/date '+%H%M')
if [[ "$run_mode" == "scheduled" && ( "$now_hm" -lt 2200 || "$now_hm" -gt 2320 ) ]]; then
  echo "[$(/bin/date -Iseconds)] skipped delayed invocation outside 22:00-23:20"
  exit 0
fi

lock_acquired=0
if /bin/mkdir "$LOCK_DIR" 2>/dev/null; then
  lock_acquired=1
else
  lock_mtime=$(/usr/bin/stat -f '%m' "$LOCK_DIR" 2>/dev/null || echo 0)
  now_epoch=$(/bin/date +%s)
  if (( now_epoch - lock_mtime > 7200 )); then
    /bin/rmdir "$LOCK_DIR" 2>/dev/null || true
    if /bin/mkdir "$LOCK_DIR" 2>/dev/null; then
      lock_acquired=1
    fi
  fi
fi

if [[ "$lock_acquired" -ne 1 ]]; then
  echo "[$(/bin/date -Iseconds)] another nightly run is active; duplicate skipped"
  exit 0
fi

claude_pid=""
caffeinate_pid=""
cleanup() {
  [[ -n "$caffeinate_pid" ]] && /bin/kill "$caffeinate_pid" 2>/dev/null || true
  /bin/rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM HUP

run_date=$(/bin/date '+%Y-%m-%d')
run_stamp=$(/bin/date '+%Y%m%dT%H%M%S')
started_at=$(/bin/date -Iseconds)
nightly_log="$DESKTOP/nightly_log_${run_date}.md"
trace_log="$LOG_DIR/nightly-claude-${run_stamp}.jsonl"

if [[ ! -f "$nightly_log" ]]; then
  {
    echo "# Dorothy Nightly Log - $run_date"
    echo
  } >>"$nightly_log"
fi

{
  echo "## CLI invocation - $started_at"
  echo
  echo "- Mode: \`$run_mode\`"
  echo "- Engine: \`claude\` (model \`$NIGHTLY_MODEL\`)"
  echo "- Runner: \`$ROOT/scripts/dorothy-nightly-cli.sh\`"
  echo "- Trace: \`$trace_log\`"
  echo
} >>"$nightly_log"

echo "[$started_at] nightly CLI started mode=$run_mode engine=claude model=$NIGHTLY_MODEL trace=$trace_log"

preflight_error=""
[[ -x "$CLAUDE" ]] || preflight_error="Claude Code CLI is missing at $CLAUDE"
[[ -f "$PROMPT_FILE" ]] || preflight_error="Prompt file is missing at $PROMPT_FILE"
[[ -f "$TASK_FILE" ]] || preflight_error="Task file is missing at $TASK_FILE"

if [[ -z "$preflight_error" ]]; then
  if ! "$CLAUDE" auth status 2>/dev/null | /usr/bin/grep -q '"loggedIn": true'; then
    preflight_error="Claude Code is not authenticated"
  fi
fi

if [[ -n "$preflight_error" ]]; then
  echo "Preflight failed: $preflight_error"
  {
    echo "### Wrapper result"
    echo
    echo "- Status: preflight failed"
    echo "- Error: $preflight_error"
    echo "- Ended: \`$(/bin/date -Iseconds)\`"
    echo
  } >>"$nightly_log"
  exit 1
fi

start_epoch=$(/bin/date +%s)
deadline_epoch=$(( start_epoch + TIMEOUT_SECONDS ))
if [[ "$run_mode" == "scheduled" ]]; then
  scheduled_deadline=$(/bin/date -j -f '%Y-%m-%d %H:%M:%S' "$run_date 23:20:00" '+%s')
  (( scheduled_deadline < deadline_epoch )) && deadline_epoch=$scheduled_deadline
fi

prompt_text="$(/bin/cat "$PROMPT_FILE")"

(
  cd "$ROOT" || exit 1
  "$CLAUDE" -p "$prompt_text" \
    --model "$NIGHTLY_MODEL" \
    --add-dir "$DESKTOP" \
    --add-dir "$WEBAPP_ROOT" \
    --permission-mode bypassPermissions \
    --output-format stream-json \
    --verbose \
    --max-budget-usd "$NIGHTLY_BUDGET_USD" \
    >"$trace_log" 2>&1
) &
claude_pid=$!

/usr/bin/caffeinate -s -w "$claude_pid" >/dev/null 2>&1 &
caffeinate_pid=$!

timed_out=0
while /bin/kill -0 "$claude_pid" 2>/dev/null; do
  if (( $(/bin/date +%s) >= deadline_epoch )); then
    timed_out=1
    echo "[$(/bin/date -Iseconds)] timeout reached; terminating Claude pid=$claude_pid"
    /usr/bin/pkill -TERM -P "$claude_pid" 2>/dev/null || true
    /bin/kill -TERM "$claude_pid" 2>/dev/null || true
    /bin/sleep 5
    /usr/bin/pkill -KILL -P "$claude_pid" 2>/dev/null || true
    /bin/kill -KILL "$claude_pid" 2>/dev/null || true
    break
  fi
  /bin/sleep 5
done

wait "$claude_pid" 2>/dev/null
claude_status=$?
ended_at=$(/bin/date -Iseconds)

if [[ "$timed_out" -eq 1 ]]; then
  result="timed out"
  claude_status=124
elif [[ "$claude_status" -eq 0 ]]; then
  result="completed"
else
  result="failed"
fi

{
  echo "### Wrapper result"
  echo
  echo "- Status: $result"
  echo "- Exit code: \`$claude_status\`"
  echo "- Ended: \`$ended_at\`"
  echo "- Full trace: \`$trace_log\`"
  echo
} >>"$nightly_log"

echo "[$ended_at] nightly CLI $result exit_code=$claude_status"
exit "$claude_status"
