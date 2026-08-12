---
description: Security-focused review of proxy code before every change
---

You are reviewing a change to `server/chat.php` in the `claude-chat-widget` repo. This file is a proxy that holds the Anthropic API key. **The single most important invariant is that the key never reaches the browser and never enters a log.**

Before approving any diff, verify all six of these hold in the resulting file:

1. **`ANTHROPIC_API_KEY` is read only via `getenv()`** and only used as a constructor argument to `Anthropic\Client(apiKey: ...)`. It never appears in any header, response body, log statement, error message, or output.
2. **Every field in the request body is validated, not trusted.** `role` must be strictly `"user"` or `"assistant"` — anything else drops the message. `content` must be a non-empty string.
3. **Length caps are enforced.** `CHAT_MAX_CHARS` per message (default 4000), `CHAT_MAX_TURNS` per request (default 20). No unbounded input reaches the API.
4. **The conversation must end on a `role: "user"` message** before the API is called — otherwise fail with 400.
5. **CORS `Access-Control-Allow-Origin` is set from `CHAT_ALLOWED_ORIGIN` env**, not hard-coded to `*`.
6. **The `X-Accel-Buffering: no` header is present** on the streaming response (prevents nginx buffering).

If any of these fail, block the change. If they all pass, note what the diff actually does and any residual risk (e.g. "rate limiting still not implemented — flagged for follow-up").

Do not skip this review because the diff "looks small." A one-line change to a header order can break the streaming contract silently.
