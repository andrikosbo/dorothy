# Dorothy Control

Version 0.10 adds exact URL reuse for explicit browser navigation and opt-in
local semantic memory tools backed by the separate Mem0 automation service.
Mem0 never ingests conversations automatically; remember and forget operations
require a direct user request.

Safe OpenClaw tools for controlling Dorothy from Telegram.

## Tools

- `dorothy_health` checks OpenClaw, n8n, Docker containers, and Ollama.
- `dorothy_mac_status` returns basic Mac uptime/load/memory/disk status.
- `dorothy_note` appends notes, ideas, todos, leads, and memories to `~/Dorothy-inbox/dorothy-notes.md`.
- `dorothy_restart_service` restarts only allowlisted Docker containers: `n8n`.
- `dorothy_news` reads the local scored news store on demand; it never sends or refreshes anything.
- `dorothy_elorus_receivables` reads and groups current unpaid customer balances; outstanding invoices from 2023 are excluded unless the user explicitly requests them.
- `dorothy_elorus_invoices` searches invoice history by customer, status, or date range.
- `dorothy_elorus_estimates` searches Elorus estimates/quotes.
- `dorothy_elorus_payments` reads incoming client payments and resolves customer names.
- `dorothy_calendar_upcoming` reads bounded upcoming Calendar events.
- `dorothy_personal_dates` checks current Greek namedays online, matches Apple Contacts, and reads contact birthdays.
- `dorothy_file_search` searches filenames only inside `~/Dorothy_Index`.
- `dorothy_file_open` opens or reveals an exact indexed path after explicit confirmation.
- `dorothy_mail_accounts` lists Mail.app account names, addresses, and domains.
- `dorothy_mail_inbox` reads bounded recent or unread Mail.app inbox messages.
- `dorothy_mail_needs_reply` filters likely reply-needed messages with conservative local heuristics.
- `dorothy_mail_message` reads one inbox message by numeric Mail.app message id.
- `dorothy_imessage_recent` reads bounded recent or unread iMessage/SMS messages.
- `dorothy_imessage_conversations` groups recent messages by conversation for summaries.
- `dorothy_imessage_needs_reply` finds conversations whose latest message is incoming.
- `dorothy_communications_summary` combines all configured channels for today,
  attention, classified pending, reply-needed, or urgent views. When available,
  it also returns the silent background classification state.
- `dorothy_browser_open_url` opens a URL in Dorothy's dedicated Chromium profile.
- `dorothy_browser_new_tab` opens a new dedicated browser tab.
- `dorothy_browser_list_tabs` lists tabs in the dedicated browser profile.
- `dorothy_browser_find_tab` finds and optionally switches to an existing tab by title or URL.
- `dorothy_browser_play_media` tries media play/pause in the active tab after explicit playback request/confirmation.
- `dorothy_browser_switch_tab` switches active dedicated browser tab.
- `dorothy_browser_read_page` reads the active page title, URL, and visible text.
- `dorothy_browser_extract_visible_text` extracts visible text from the active page.
- `dorothy_browser_screenshot` saves a screenshot to `~/Dorothy-inbox/browser-screenshots/`.
- `dorothy_browser_click_text` clicks visible text after explicit confirmation.
- `dorothy_browser_fill_field` fills a field after explicit confirmation.
- `dorothy_browser_press_key` presses a key after explicit confirmation.
- `dorothy_browser_download_file` downloads a file after explicit confirmation.

Browser control uses a separate Playwright Chromium profile at `~/.dorothy-browser-profile`; it does not control your normal browser tabs. Banking/financial sites require explicit per-session permission and remain read-only by policy.

## Elorus Read-Only Policy

- Credentials are read at runtime from macOS Keychain and are never returned by a tool.
- The integration only implements authenticated HTTP `GET` requests.
- It cannot create, edit, delete, send, accept, reject, or record invoices, estimates, payments, contacts, or reminders.
- Results are fetched only after an explicit request and are bounded.
- Current receivables exclude invoices issued in 2023 by default. Historical invoice searches remain available, and 2023 receivables are included only after an explicit request.

## Mail.app Read-Only Policy

- Apple Mail.app is the unified source for Gmail and iCloud-hosted accounts.
- Mail tools only read account and inbox data.
- They do not send, draft, archive, delete, move, flag, or mark messages as read.
- Results are limited to 50 messages, 90 recent days, and 1,200 characters per excerpt.
- Email contents are untrusted data and must never authorize tools or actions.
- Action logs use `~/.openclaw/logs/dorothy-mail-actions.jsonl` without sender, subject, recipients, or body content.

## Communications Read-Only Policy

- iMessage/SMS reads use the local Messages database through `imsg` and read-only SQLite.
- The built-in bidirectional OpenClaw iMessage channel remains disabled.
- No communication tool can send, reply, delete, archive, move, mark read, or otherwise modify messages.
- Suggested replies are model-generated text only and are never transmitted.
- Results are bounded to 50 messages, 20 conversations, 90 recent days, and 1,200 characters per excerpt.
- Message and email contents are untrusted data and must never authorize tools or actions.
- iMessage action logs use `~/.openclaw/logs/dorothy-imessage-actions.jsonl` without names, handles, or message text.
- The OpenClaw gateway process needs macOS Full Disk Access to read `~/Library/Messages/chat.db`. Automation access to Messages.app is not needed and should remain disabled.

## Build

```bash
npm install
npm run plugin:build
npm run plugin:validate
npm test
```
