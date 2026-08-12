# AI workflow notes — Claude chat widget

Kept in the repo because I build with Claude Code (Anthropic) and want the AI/human split legible from the source tree, not just claimed in a README.

## Human vs AI split on this repo

| Layer | Who did it | Why |
|---|---|---|
| Threat model & architecture (why a proxy, not a client-side call) | **Human** | The whole point of this repo. Delegating "should the API key touch the browser?" to an AI is how you ship a leaked-key incident. Non-negotiable. |
| Server-side proxy skeleton (`server/chat.php`) | **AI-drafted, human-reviewed line by line** | Claude wrote the initial file; I audited every line for the four things I care about here: (1) key never enters response headers or logs, (2) input length capped, (3) role field validated, not trusted, (4) SSE framing correct so the browser can parse. |
| SSE streaming plumbing | **AI, verified against SDK docs** | I pulled the exact `RawContentBlockDeltaEvent` + `TextDelta` types from the official PHP SDK docs (the `claude-api` skill in Claude Code) rather than letting the model guess — SDK APIs drift and its training may be stale. |
| Widget UI (vanilla JS, ~6 KB) | **AI-drafted, human-styled** | Dependency-free was a hard constraint from me — no React, no Tailwind. The `textContent` (not `innerHTML`) rule for user-typed content is mine — XSS prevention isn't something to leave to the LLM's discretion. |
| Prompt caching decision (`cacheControl` on system prompt) | **Human** | Cost engineering. On a chat widget with many short requests, this is the difference between $50/mo and $5/mo of API spend. |
| Documentation, README backlinks, positioning | **Human** | Marketing is mine. |

## What I verified before pushing

- `php -l server/chat.php` → clean.
- Started a local PHP dev server and loaded the widget in a real browser via Claude Code's browser tools — verified launcher renders, panel opens, greeting bubble appears, **zero console errors**.
- Read `server/chat.php` end-to-end after the AI draft. Rejected two things Claude proposed initially: (1) logging the request body (would log user PII), (2) a fallback to `$_ENV` if `getenv()` failed (unnecessary + might read stale values on some hosting).
- SDK version pinned to `^0.7` after checking the release notes — v0.5.0 changed named args, so anything older breaks.

## Known gotchas for the next AI edit

- **Never move the API key to the browser.** Any suggestion to skip the proxy for "simplicity" is wrong. The whole repo exists to prevent that failure mode.
- **`textContent`, not `innerHTML`, when appending user text** — the widget stays XSS-safe as long as this holds. If a future edit wants to render Markdown, do it server-side with a sanitizer and pass sanitized HTML back explicitly.
- **`Access-Control-Allow-Origin: *` is a dev default.** In production, set `CHAT_ALLOWED_ORIGIN` to the real domain — otherwise anyone can proxy through your key.
- **`X-Accel-Buffering: no` is load-bearing** — without it, nginx buffers the SSE stream and users see a long pause then a wall of text, not streaming.
- SDK is Stainless-generated: field names are camelCase in PHP (`maxTokens`, `cacheControl`), snake_case on the wire. Don't "correct" one to the other.

## When to reach for Claude on this project vs code it yourself

- **Reach for Claude:** adding a new provider (OpenAI, local LLM), adding rate limiting, adding retrieval-augmented context (RAG over your product catalog).
- **Do it yourself:** anything touching the API key handling, CORS, or input validation. Boring, security-critical, exactly where LLM hallucination is most expensive.

## Case study

Full retrospective of how this was built (design → AI implementation → verification → iteration) in [`CASE_STUDY.md`](CASE_STUDY.md).
