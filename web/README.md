# Dorothy Web

A small private web/PWA client for Dorothy/OpenClaw.

It is designed to run on the Mac where Dorothy already runs.

Current version: **3.3.0**

## Security model

Default is local-only:

```bash
HOST=127.0.0.1
PORT=3030
```

Remote devices use Tailscale Serve. The Node server remains bound to
`127.0.0.1`; do **not** expose it publicly or bind it to every interface.

The UI requires a bearer token stored in `.env`.

## Install

```bash
cd dorothy-web
cp .env.example .env
openssl rand -hex 32
# paste the generated token into DOROTHY_WEB_TOKEN
npm install
npm start
```

Open:

```text
http://127.0.0.1:3030
```

## Tailscale access

With Tailscale connected, open the same private HTTPS URL from Mac, iPhone,
or Android:

```text
https://dorothy.your-tailnet.ts.net
```

For quick browser entry, `http://dorothy` redirects to the canonical HTTPS URL.

Tailscale Serve proxies that URL to `http://127.0.0.1:3030`. Do not use the
Mac's Tailscale IP with port `3030`.

## Current backend call

The server calls:

```bash
openclaw agent "your message"
```

Change this in `.env` if your OpenClaw command differs:

```bash
OPENCLAW_AGENT_CMD=openclaw agent
```

## Features

- extensible chat modes: Dorothy and personal AI
- per-conversation Gemini or Ollama model selection in AI mode
- Gemini API key setup from the web settings, stored in macOS Keychain and the
  local OpenClaw auth store
- isolated AI agent with web search and simple image generation tools only
- mobile-first chat UI
- token gate
- quick actions
- silent Mail observation every three minutes with local classification into
  work, personal, OTP, security, transaction, notification, marketing, noise,
  and unknown
- persistent communication state with priority, likely next action, OTP expiry,
  and a dedicated pending view; read messages are not automatically treated as
  completed by the intelligence layer
- relevance-ranked communications views with a grouped daily email digest
- Elorus credential settings stored server-side in macOS Keychain
- browser speech-to-text button where supported
- text-to-speech playback
- PWA manifest
- network-authoritative refreshes with automatic stale-build recovery
- live Elorus revenue sync combined with MyDash costs and explicit source labels
- personal stock portfolio read from Dorothy's structured user memory, with
  cached market prices, daily movement, and graceful provider fallback
- read-only Enable Banking foundation with RSA JWT authentication, one-time callback
  state, and local storage of sessions and masked account identifiers
- encrypted read-only bank balance and transaction sync with consolidated cash flow,
  spending categories, account balances, and recent activity in the finance dashboard
- Today workspace combining calendar, communications, reminders, finance, files,
  projects, and reviewed browser actions
- Dorothy Spotlight across chats, email, Apple Notes, local files, projects,
  uploaded documents, and shared items
- Communication Copilot, document OCR/extraction, PWA share target, Meeting
  Assistant, persistent Projects, Browser Action Mode, and conversational voice mode
- no public exposure by default

The observer never sends, deletes, archives, creates tasks, or pushes
notifications. iMessage remains available on demand through OpenClaw; continuous
iMessage indexing requires Full Disk Access for the background runtime.
