#!/bin/zsh
set -euo pipefail

ROOT="/Users/you/Projects/Dorothy/Dorothy"
RUNNER="$ROOT/scripts/dorothy-nightly-cli.sh"
PLIST_SOURCE="$ROOT/scripts/com.dorothy.nightly-cli.plist"
PLIST_TARGET="/Users/you/Library/LaunchAgents/com.dorothy.nightly-cli.plist"
LOG_DIR="/Users/you/Library/Logs/Dorothy"
LABEL="com.dorothy.nightly-cli"

/bin/chmod 755 "$RUNNER" "$ROOT/scripts/install-dorothy-nightly-cli.sh"
/usr/bin/plutil -lint "$PLIST_SOURCE"
/bin/mkdir -p "$LOG_DIR" "/Users/you/Library/LaunchAgents"
/bin/cp "$PLIST_SOURCE" "$PLIST_TARGET"
/usr/bin/plutil -lint "$PLIST_TARGET"

/bin/launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$UID" "$PLIST_TARGET"
/bin/launchctl print "gui/$UID/$LABEL" >/dev/null

echo "Installed $LABEL for 22:15 daily."
echo "Runner: $RUNNER"
echo "Log: $LOG_DIR/nightly-cli.log"
