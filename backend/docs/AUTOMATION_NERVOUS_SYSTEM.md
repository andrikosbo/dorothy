# Dorothy Automation Nervous System

This extends the existing Dorothy. It does not create a replacement assistant or
change the production `docker-compose.yml`.

## Approved Integrations

### Existing Playwright browser control

Dorothy already has browser eyes and hands in `dorothy-control`. Adding Browser
Use would duplicate browser ownership, profiles, sessions, and action APIs.
Stagehand may be reconsidered later for strongly typed extraction from a small
set of stable portals, but it is not part of this integration.

The existing browser implementation is retained and hardened:

- Explicit URLs reuse only an exact matching URL.
- Generic tab searches still use title/URL aliases.
- Dorothy must verify the returned URL and page state after every action.

### Mem0

Mem0 is used as a local semantic index for facts that the user explicitly asks
Dorothy to remember. It is not an automatic conversation recorder and does not
replace `MEMORY.md`.

Storage policy:

- Store only explicit preferences, project facts, and decisions.
- Never store passwords, API keys, auth tokens, OTPs, banking credentials, or
  raw private conversations.
- Adds and deletes require an explicit user request.
- `infer=False` stores the approved text without an LLM rewriting it.
- Embeddings and vector storage remain local through Ollama and Qdrant.
- Mem0 telemetry is disabled.

### OpenHands

OpenHands is an opt-in coding sidecar, not Dorothy's default executor. It is
appropriate for isolated coding tasks that benefit from a full coding-agent
workspace. Dorothy's existing OpenCode/Codex paths remain the default for normal
coding assistance.

Security boundary:

- The service binds only to `127.0.0.1`.
- It receives one dedicated workspace, not the home directory or all projects.
- It is never started automatically by Dorothy.
- The Docker socket is required by OpenHands and grants high host privilege.
  Start it only for a specific coding session and stop it afterward.
- Do not place `.env`, OpenClaw state, SSH keys, browser profiles, or production
  credentials in its workspace.

## Rejected Integrations

- **Browser Use:** duplicates the current Playwright browser and introduces a
  second browser/session owner.
- **Stagehand:** useful for schema-driven extraction, but currently adds a
  second browser abstraction without a defined portal workflow.
- **Open Interpreter:** overlaps existing local execution and coding tools while
  expanding unrestricted host command risk.
- **OpenMemory:** not used. Dorothy integrates the Mem0 OSS library directly
  through a small headless adapter.

## Start And Stop

Initialize the local environment once:

```bash
./scripts/dorothy-automation.sh init
```

Start local memory:

```bash
./scripts/dorothy-automation.sh start memory
```

Start the coding sidecar only when needed:

```bash
./scripts/dorothy-automation.sh start coding
open http://127.0.0.1:3001
```

In OpenHands advanced LLM settings, a local Ollama configuration can use:

```text
Custom Model: openai/qwen2.5-coder:32b
Base URL: http://host.docker.internal:11434/v1
API Key: local-llm
```

OpenHands requires a large context window for reliable agent behavior. Do not
change the global Ollama service configuration solely for OpenHands without
checking memory pressure and the other Dorothy workloads.

Check status and health:

```bash
./scripts/dorothy-automation.sh status
./scripts/dorothy-automation.sh health
```

Stop one sidecar:

```bash
./scripts/dorothy-automation.sh stop memory
./scripts/dorothy-automation.sh stop coding
```

Kill switch for the full automation compose:

```bash
./scripts/dorothy-automation.sh kill
```

The kill switch removes automation containers and network but preserves named
volumes. It does not touch the production Dorothy compose.

## Verification

```bash
docker compose --env-file .env.automation \
  -f docker-compose.automation.yml \
  --profile memory --profile coding config --quiet

cd openclaw-plugins/dorothy-control
npm test
npm run plugin:build
npm run plugin:validate
```

Mem0 API smoke test:

```bash
TOKEN="$(awk -F= '$1=="MEM0_API_TOKEN"{print $2}' .env.automation)"

curl -fsS -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8765/health

curl -fsS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Use exact URL matching for explicit browser navigation.","scope":"decision"}' \
  http://127.0.0.1:8765/memories

curl -fsS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"browser URL matching","scope":"decision","limit":5}' \
  http://127.0.0.1:8765/memories/search
```
