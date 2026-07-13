# Contributing to Dorothy

Thanks for your interest in Dorothy. This is a personal, self-hosted assistant
project, but improvements, bug reports, and adaptations for other setups are
welcome.

## Development

```bash
# web/PWA client
cd web && npm install && npm test

# OpenClaw tool plugin
cd plugin && npm install && npm run build && npm test
```

Both `web/test/` and `plugin/src/*.test.ts` run under Node's built-in test
runner and Vitest respectively; CI runs both on every push and pull request.

## Guidelines

- Keep new tools/features **read-only by default**. Anything that sends,
  deletes, or modifies external state must require explicit user confirmation
  in the same turn — see the read-only policies in
  [`plugin/README.md`](plugin/README.md) for the existing pattern.
- Never commit credentials, tokens, or personal data. Configuration is always
  read from `.env` files (see the `.env.example` templates) or the OS
  keychain, never hardcoded.
- Add or update tests alongside any behavioral change.

## Reporting issues

Open a GitHub issue with steps to reproduce, expected vs. actual behavior, and
which component is affected (`web`, `plugin`, or `backend`).
