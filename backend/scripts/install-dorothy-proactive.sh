#!/bin/zsh
set -eu

# Installs the Dorothy proactive notifications LaunchAgent (com.dorothy.proactive).
# Idempotent: re-running re-copies the plist and reloads the agent.

ROOT="/Users/you/Projects/Dorothy/Dorothy"
LABEL="com.dorothy.proactive"
SRC_PLIST="$ROOT/scripts/$LABEL.plist"
DEST_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT="$ROOT/scripts/dorothy-proactive.sh"
GUI="gui/$(/usr/bin/id -u)"

[[ -f "$SRC_PLIST" ]] || { echo "Missing $SRC_PLIST"; exit 1; }
[[ -f "$SCRIPT" ]] || { echo "Missing $SCRIPT"; exit 1; }

/bin/chmod +x "$SCRIPT"
/bin/mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/Dorothy"
/bin/cp "$SRC_PLIST" "$DEST_PLIST"

# Reload cleanly.
/bin/launchctl bootout "$GUI/$LABEL" 2>/dev/null || true
/bin/launchctl bootstrap "$GUI" "$DEST_PLIST"
/bin/launchctl enable "$GUI/$LABEL"

echo "Installed $LABEL (runs 08:30, 13:30, 18:30 daily)."
echo "Run now:   launchctl kickstart -k $GUI/$LABEL"
echo "Logs:      ~/Library/Logs/Dorothy/proactive.log"
echo "Uninstall: launchctl bootout $GUI/$LABEL && rm $DEST_PLIST"
