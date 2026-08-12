# Claude Chat Widget (PHP)

A drop-in **AI chat widget** for any website, powered by the [Claude API](https://docs.anthropic.com/). Two small pieces:

1. **A server-side PHP proxy** (`server/chat.php`) that holds your API key and talks to Claude — the browser never sees the key.
2. **A dependency-free vanilla-JS widget** (`public/widget.js`, ~6 KB) — a floating chat launcher with streaming replies, no build step, no framework.

Built by **[GroDev](https://grodev.pl)** — we build **AI assistants and custom web apps on the Claude API**. See [grodev.pl/ai](https://grodev.pl/ai).

## Why a proxy?

Your Claude API key must **never** ship to the browser — anyone could read it in DevTools and run up your bill. So the widget talks to a small endpoint on *your* server, and that endpoint talks to Claude. The key stays on the server, in an environment variable. This repo gives you both halves, wired together and streaming.

```
Browser (widget.js)  ──POST /server/chat.php──▶  Your server (holds the key)  ──▶  Claude API
        ◀───────────── SSE stream of text ──────────────
```

## Install

```bash
composer require grodev/claude-chat-widget
# or clone this repo and run:  composer install
```

Then set your key:

```bash
cp .env.example .env
# edit .env and put your real ANTHROPIC_API_KEY in it
```

The proxy reads configuration with `getenv()`, so a real environment variable works too (systemd, Docker, your host's control panel, Laravel's `.env`, etc.).

## Run the demo

```bash
ANTHROPIC_API_KEY=sk-ant-... php -S localhost:8000 -t .
```

Open <http://localhost:8000/public/> and click the balloon in the bottom-right corner.

## Embed on your site

Drop two lines on any page (adjust `endpoint` to wherever you deployed `chat.php`):

```html
<script src="/path/to/widget.js"></script>
<script>
  ClaudeChatWidget.init({
    endpoint: '/server/chat.php',      // your proxy URL
    title:    'Chat with us',
    greeting: 'Hi! How can I help?',
    accent:   '#1D9E75',               // your brand colour
  });
</script>
```

That's it — the launcher, panel, streaming, light/dark theme, and Enter-to-send are all handled.

## Configuration

All via environment variables (see `.env.example`):

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(required)* | Your Claude API key |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Which model answers. `claude-haiku-4-5` is cheaper/faster for high-volume support; `claude-sonnet-5` is a middle ground |
| `CHAT_SYSTEM_PROMPT` | *(a generic website-assistant prompt)* | The assistant's persona and instructions |
| `CHAT_ALLOWED_ORIGIN` | `*` | CORS — set to your domain in production |
| `CHAT_MAX_TURNS` | `20` | Most recent messages kept per request (bounds cost) |
| `CHAT_MAX_CHARS` | `4000` | Per-message length cap |

### Give it a personality

The single most useful thing you can set is `CHAT_SYSTEM_PROMPT` — this is where the assistant learns what your business does:

```bash
CHAT_SYSTEM_PROMPT="You are the assistant for Example Co, a bakery in Poznań.
Answer questions about our opening hours, cakes, and custom orders. For orders
over 20 people, tell the visitor to email hello@example.com. Keep replies short."
```

## How it works

- **Streaming (SSE).** `chat.php` uses the official [`anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-php) `createStream()` and forwards each text delta to the browser as a `data:` frame, so words appear as they're generated and long replies never hit a timeout.
- **Prompt caching.** The system prompt carries a cache breakpoint, so on repeat requests it's billed at the cheap cache-read rate.
- **Validation.** The proxy validates roles, trims and length-caps each message, keeps only the most recent turns, and requires the conversation to end on a user message before calling the API.

## Production notes

This is a clean, working foundation. A production deployment usually adds:

- **Rate limiting** — cap requests per IP/session (a few lines with Redis or even a file lock) so nobody can burn your quota.
- **Restrict CORS** — set `CHAT_ALLOWED_ORIGIN` to your domain.
- **Logging / analytics** — persist conversations if you want to learn what visitors ask.
- **Tools / retrieval** — connect the assistant to your product catalogue, booking system, or knowledge base so it answers with *your* data, not just general knowledge.

That last one is where a chatbot becomes genuinely useful — and it's exactly the kind of thing we build. If you want an AI assistant wired into your real business data, see **[grodev.pl/ai](https://grodev.pl/ai)** or reach out at **[grodev.pl](https://grodev.pl)**.

## License

MIT.

---

*Made by [Dominik Groński / GroDev](https://grodev.pl) · Poznań, Poland · Claude API · PHP · AI assistants*
