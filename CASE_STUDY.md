# Case study — building this widget with Claude Code

A short honest retrospective on how this repo was built, because that's the process I get hired for, not the outcome file. It's also the kind of transparency I'd want to see from someone I was thinking about working with.

If you're a recruiter or a client trying to figure out what "AI-first" actually looks like in a working developer's day, this is that.

## The brief (30 seconds)

A drop-in AI chat widget for a company website, with two hard constraints:

1. **The Claude API key must never touch the browser.** A widget that calls `api.anthropic.com` directly from JavaScript leaks the key to anyone who opens DevTools, and the first person to notice will run up your bill overnight. This is a *design constraint*, not an implementation detail — it dictates the entire architecture.
2. **Dependency-free on the frontend.** The widget has to drop into any site (WordPress, plain HTML, someone else's Laravel app) without a build step, a framework, or a version conflict. That means vanilla JS, hand-rolled CSS, one `<script>` tag. Nothing to compile.

Total build: ~90 minutes of active work, one interactive session.

## Where the human work actually happened

### 1. Threat model & architecture (human — before writing any code)

The security decision drove everything downstream. Two options existed:

- **Option A** — widget calls Claude directly from the browser with the key embedded.
- **Option B** — widget calls a small server-side endpoint on the customer's own site, which holds the key and forwards to Claude.

I chose B for the obvious reason (see constraint 1) and drew the shape:

```
Browser (widget.js)  ──POST /server/chat.php──▶  Your server  ──▶  Claude API
        ◀───────────── SSE stream of text ──────────────
```

The SSE decision was also mine — streaming means the user sees words appear immediately (perceived latency), long replies don't hit HTTP timeouts, and it's easier for a proxy to forward than a WebSocket upgrade. I didn't ask an AI about any of this; the tradeoffs are well-known and the wrong choice is easy to spot.

### 2. Pulling the exact SDK shape (human, not AI-guessed)

Before writing a single line of `chat.php`, I loaded Claude Code's `claude-api` skill to get the current PHP SDK bindings. SDK APIs drift, and a model's training data may not reflect the latest release — asking Claude to "write PHP that calls the Anthropic API" without pinning the exact function shape is how you get invented method names that don't exist.

The skill gave me the exact classes I needed:

- `Anthropic\Client` (client constructor with named `apiKey:` arg)
- `Anthropic\Messages\RawContentBlockDeltaEvent` (the streaming event type)
- `Anthropic\Messages\TextDelta` (the delta payload class)
- `->messages->createStream(model:, maxTokens:, system:, messages:)` — camelCase named args (Stainless-generated SDK convention), which becomes snake_case on the wire.

Also confirmed the SDK version pin (`^0.7`) because v0.5.0 changed named args and anything older would break the code.

**Why this matters:** without the exact shape, Claude would have hallucinated something plausible-looking, `php -l` would have passed, and it would have blown up at runtime on the first real request. This is the single most common failure mode of "AI just writes code" — surface-level correctness that fails at the boundary.

### 3. AI-drafted the proxy skeleton (Claude, ~10 min)

With the design locked and the SDK shape pulled, I asked Claude to draft `server/chat.php`. It produced a reasonable first pass — client init, message parsing, `foreach ($stream as $event)` loop with the correct type check, SSE `echo "data: ..."` framing.

### 4. Line-by-line audit + hardening (human, ~20 min)

This is the part that separates "I use AI" from "I use AI well." I read the draft top-to-bottom and rejected two things Claude proposed:

- **Logging the request body** — would log user PII into a plain file. Removed.
- **Falling back to `$_ENV['ANTHROPIC_API_KEY']` if `getenv()` returned false** — unnecessary (`getenv` reads the same source on every hosting stack I've deployed on) and could pick up stale values on some. Removed.

I *added*:

- **Length caps** — `CHAT_MAX_CHARS` per message, `CHAT_MAX_TURNS` per request. LLMs don't cap themselves; a user pasting a 200 KB blob would cost real money.
- **Role validation** — the request body's `role` field is *always* untrusted user input. Anything that isn't literally `"user"` or `"assistant"` gets dropped, not "coerced to user." Trust nothing from the wire.
- **`X-Accel-Buffering: no`** — without it, nginx buffers the SSE stream and the browser sees a long pause followed by a wall of text. Load-bearing header.
- **Prompt caching with `cacheControl`** — on the system prompt block. On a widget with many short requests, this is the difference between $50/mo and $5/mo of API spend. Cost engineering doesn't happen unless a human thinks about it.
- **Try/catch that emits errors as SSE frames**, not as HTTP 500. By the time an upstream error fires, the response headers are already sent and the stream is open. Trying to `http_response_code(500)` at that point does nothing; the frame does.

### 5. AI-drafted the widget (Claude, ~10 min)

Same pattern for the frontend. Claude drafted `widget.js` — floating launcher, panel toggle, message list, form, SSE parsing. Reasonable first draft.

### 6. Widget audit + hardening (human, ~15 min)

Rejected/rewrote:

- **`innerHTML = userText`** — classic XSS. Replaced every user-provided string with `textContent`. If a future edit wants Markdown rendering, it has to happen server-side with a sanitizer, not client-side by string interpolation.
- **A hard-coded 400px width** — replaced with `max-width: calc(100vw - 32px)` so it works on mobile.
- **`Enter` always sends** — changed to "Enter sends, Shift+Enter is a newline." Multi-line questions matter on real widgets.
- **No dark mode** — added `@media (prefers-color-scheme: dark)` and a CSS variable system so the widget respects OS theme automatically.

Added the typing-dots animation because a chat widget without one feels broken during the first-token latency.

### 7. Verified in a real browser (human, ~10 min)

Used Claude Code's browser tools to actually load the widget in Chrome. Not "tested by asking the AI whether it should work" — literally opened the page, clicked the launcher, watched the panel appear, checked the console. **Zero errors, greeting bubble rendered, launcher animated correctly.** This step is non-negotiable — LLMs are extremely good at generating code that lints clean and fails at runtime.

The screenshot verification also caught one thing that neither `php -l` nor visual code review would have: the CSS `z-index: 2147483000` needed to be higher than the site's own overlays. Discovered because on a page with a modal, the launcher hid *behind* it.

### 8. Documentation (human, ~15 min)

I write my own READMEs. LLMs write generic READMEs that could describe any project. This one:

- Opens with **why** (the API-key-in-browser threat model), because that's the whole reason the repo exists.
- Includes an ASCII diagram of the request flow — most readers scan diagrams before prose.
- The **"Production notes"** section is intentionally honest about what's *not* in the repo (rate limiting, logging, RAG). A README that oversells is worse than one that undersells; both readers get burned, only the honest one keeps trust.

## Result

- 3 real files, ~350 lines of production code (`server/chat.php`, `public/widget.js`, `public/index.html`).
- No external dependencies on the frontend, one PHP SDK on the backend, no build step.
- Deploys in 5 minutes on any PHP-capable host.
- MIT-licensed.
- Handles the actual thing: streaming replies with the key kept safe.

## What this shows about the workflow

The AI wrote maybe 60% of the lines. Every load-bearing decision — architecture, security posture, cost engineering, validation strategy, dependency choices, what to *reject* — was human. That's the shape of AI-first work I do: **AI is a fast typist and a reasonable reviewer; the design authority stays with me.** When I hand off design authority to a model, I get a repo that lints cleanly and fails in production.

If you're evaluating me for AI-augmented work, this repo is a working sample. The [`CLAUDE.md`](CLAUDE.md) file in this repo (and in each of my other public repos) documents the same split in a shorter form.

---

*Written by [Dominik Groński / GroDev](https://grodev.pl) — I build custom AI assistants on the Claude API. See [grodev.pl/ai](https://grodev.pl/ai).*
