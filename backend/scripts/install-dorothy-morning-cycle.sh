#!/bin/zsh
set -euo pipefail

ROOT="/Users/you/Projects/Dorothy/Dorothy"
HELPER_SOURCE="$ROOT/scripts/dorothy-power-helper.sh"
MORNING_SCRIPT="$ROOT/scripts/dorothy-morning-cycle.sh"
DAYTIME_AGENT_SOURCE="$ROOT/scripts/com.dorothy.daytime-awake.plist"
HELPER_TARGET="/usr/local/sbin/dorothy-power"
SUDOERS_TARGET="/etc/sudoers.d/dorothy-power"
LAUNCH_AGENT="/Users/you/Library/LaunchAgents/com.dorothy.morning-cycle.plist"
DAYTIME_AGENT="/Users/you/Library/LaunchAgents/com.dorothy.daytime-awake.plist"

/bin/chmod 755 "$HELPER_SOURCE" "$MORNING_SCRIPT"

admin_script="$(/usr/bin/mktemp /tmp/dorothy-power-install.XXXXXX)"
cat >"$admin_script" <<EOF
#!/bin/zsh
set -e
/bin/mkdir -p /usr/local/sbin
/usr/bin/install -o root -g wheel -m 755 "$HELPER_SOURCE" "$HELPER_TARGET"
cat >"$SUDOERS_TARGET" <<'SUDOERS'
you ALL=(root) NOPASSWD: /usr/local/sbin/dorothy-power *
SUDOERS
/usr/sbin/chown root:wheel "$SUDOERS_TARGET"
/bin/chmod 440 "$SUDOERS_TARGET"
/usr/sbin/visudo -cf "$SUDOERS_TARGET"
"$HELPER_TARGET" install-wake-schedule
EOF
/bin/chmod 700 "$admin_script"

/usr/bin/osascript -e "do shell script quoted form of \"$admin_script\" with administrator privileges"
/bin/rm -f "$admin_script"

cat >"$LAUNCH_AGENT" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dorothy.morning-cycle</string>
  <key>ProgramArguments</key>
  <array>
    <string>$MORNING_SCRIPT</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>6</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>/Users/you/Library/Logs/Dorothy/morning-launchd.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/you/Library/Logs/Dorothy/morning-launchd.log</string>
</dict>
</plist>
EOF

/usr/bin/plutil -lint "$LAUNCH_AGENT"
/bin/cp "$DAYTIME_AGENT_SOURCE" "$DAYTIME_AGENT"
/usr/bin/plutil -lint "$DAYTIME_AGENT"
/bin/launchctl bootout "gui/$UID/com.dorothy.morning-cycle" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$UID" "$LAUNCH_AGENT"
/bin/launchctl bootout "gui/$UID/com.dorothy.daytime-awake" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$UID" "$DAYTIME_AGENT"

echo "Dorothy morning cycle installed."
