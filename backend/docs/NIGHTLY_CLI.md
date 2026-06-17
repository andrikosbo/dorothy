# Dorothy Nightly CLI

The nightly maintenance job runs through Claude Code. macOS `launchd` starts
`claude -p` every day at 22:15 Europe/Athens. (Migrated off `codex exec` on
2026-06-16.)

Model and budget are configurable via environment:

- `DOROTHY_NIGHTLY_MODEL` (default `sonnet`) — e.g. `opus` for harder tasks.
- `DOROTHY_NIGHTLY_BUDGET_USD` (default `3.00`) — hard per-run spend cap.

## Runtime

- LaunchAgent: `com.dorothy.nightly-cli`
- Runner: `scripts/dorothy-nightly-cli.sh`
- Prompt: `config/dorothy-nightly-cli-prompt.md`
- Task input: `~/Desktop/nightly_tasks.md`
- Daily report: `~/Desktop/nightly_log_YYYY-MM-DD.md`
- Detailed traces: `~/Library/Logs/Dorothy/nightly-claude-*.jsonl`
- Wrapper log: `~/Library/Logs/Dorothy/nightly-cli.log`

The runner requires the Mac to be powered on, network access, and an active
Claude Code CLI login (`claude auth status`).

## Safety

The runner uses `--permission-mode bypassPermissions` (no interactive
approvals), a per-run budget cap, a single-run lock, and a hard deadline. Scheduled invocations outside 22:00-23:20 are skipped, so a missed
run is not replayed the next morning. The prompt forbids secrets, outbound
messages, user-data changes, database changes, migrations, and unrequested
cleanup.

## Operations

Install or refresh the LaunchAgent:

```bash
./scripts/install-dorothy-nightly-cli.sh
```

Check status:

```bash
launchctl print "gui/$UID/com.dorothy.nightly-cli"
claude auth status
```

Run directly for maintenance:

```bash
./scripts/dorothy-nightly-cli.sh --run-now
```

To exercise the exact LaunchAgent path, create the one-shot test marker and
kickstart the job:

```bash
touch /tmp/com.dorothy.nightly-cli.run-now
launchctl kickstart -k "gui/$UID/com.dorothy.nightly-cli"
```
