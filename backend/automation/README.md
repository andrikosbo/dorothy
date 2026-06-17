# Dorothy Automation Sidecars

These services extend the existing Dorothy. They do not replace it and do not
modify the production `docker-compose.yml`.

## Profiles

- `memory`: local Mem0 adapter with Ollama embeddings and Qdrant storage.
- `coding`: isolated, opt-in OpenHands workspace.

## Commands

```bash
./scripts/dorothy-automation.sh init
./scripts/dorothy-automation.sh start memory
./scripts/dorothy-automation.sh start coding
./scripts/dorothy-automation.sh status
./scripts/dorothy-automation.sh health
./scripts/dorothy-automation.sh stop memory
./scripts/dorothy-automation.sh stop coding
./scripts/dorothy-automation.sh kill
```

OpenHands is deliberately stopped by default because it requires Docker socket
access. Start it only for a specific coding task and stop it afterward.

See [`docs/AUTOMATION_NERVOUS_SYSTEM.md`](../docs/AUTOMATION_NERVOUS_SYSTEM.md)
for architecture, security policy, configuration, and verification details.
