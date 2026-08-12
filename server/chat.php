<?php

declare(strict_types=1);

/**
 * Claude chat proxy.
 *
 * A thin server-side endpoint that sits between the browser widget and the
 * Claude API. Its whole job is to keep your ANTHROPIC_API_KEY on the server:
 * the browser talks to THIS file, never to api.anthropic.com directly, so the
 * key is never shipped to the client.
 *
 * It reads the conversation from the request body, forwards it to Claude with
 * a system prompt, and streams the reply back to the browser over SSE.
 *
 * Built by GroDev — https://grodev.pl — we build AI assistants and custom web
 * apps on the Claude API. See https://grodev.pl/ai
 */

require __DIR__ . '/../vendor/autoload.php';

use Anthropic\Client;
use Anthropic\Messages\RawContentBlockDeltaEvent;
use Anthropic\Messages\TextDelta;
use Anthropic\Core\Exceptions\APIStatusException;

/* --------------------------------------------------------------------------
 * Configuration (all via environment variables — never hard-code the key).
 * ------------------------------------------------------------------------ */

$apiKey        = getenv('ANTHROPIC_API_KEY') ?: '';
$model         = getenv('ANTHROPIC_MODEL') ?: 'claude-opus-5';
$allowedOrigin = getenv('CHAT_ALLOWED_ORIGIN') ?: '*';
$maxTurns      = (int) (getenv('CHAT_MAX_TURNS') ?: 20);     // messages kept per request
$maxChars      = (int) (getenv('CHAT_MAX_CHARS') ?: 4000);   // per-message length cap

$systemPrompt = getenv('CHAT_SYSTEM_PROMPT') ?: <<<'PROMPT'
You are the assistant on a company's website. Answer questions about the
company's products and services clearly and concisely. Be friendly and
helpful. If you don't know something or the visitor needs a person, tell
them how to get in touch rather than guessing. Keep replies short — this is
a chat widget, not an essay.
PROMPT;

/* --------------------------------------------------------------------------
 * Small helpers.
 * ------------------------------------------------------------------------ */

/** Send an SSE data frame and flush it to the browser immediately. */
function sse(array $payload): void
{
    echo 'data: ' . json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n\n";
    if (ob_get_level() > 0) {
        ob_flush();
    }
    flush();
}

/** Fail early with a normal JSON error (before the stream has started). */
function fail(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

/* --------------------------------------------------------------------------
 * CORS + method handling.
 * ------------------------------------------------------------------------ */

header('Access-Control-Allow-Origin: ' . $allowedOrigin);
header('Vary: Origin');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    fail(405, 'Method not allowed. Use POST.');
}

if ($apiKey === '') {
    fail(500, 'Server is not configured: ANTHROPIC_API_KEY is missing.');
}

/* --------------------------------------------------------------------------
 * Parse and validate the incoming conversation.
 *
 * Expected body: {"messages": [{"role": "user"|"assistant", "content": "..."}]}
 * ------------------------------------------------------------------------ */

$raw  = file_get_contents('php://input') ?: '';
$data = json_decode($raw, true);

if (!is_array($data) || !isset($data['messages']) || !is_array($data['messages'])) {
    fail(400, 'Expected a JSON body with a "messages" array.');
}

$messages = [];
foreach ($data['messages'] as $message) {
    $role    = is_array($message) ? ($message['role'] ?? '') : '';
    $content = is_array($message) ? ($message['content'] ?? '') : '';

    if (!in_array($role, ['user', 'assistant'], true) || !is_string($content)) {
        continue; // skip anything malformed rather than trusting the client
    }

    $content = trim($content);
    if ($content === '') {
        continue;
    }
    if (mb_strlen($content) > $maxChars) {
        $content = mb_substr($content, 0, $maxChars);
    }

    $messages[] = ['role' => $role, 'content' => $content];
}

// Keep only the most recent turns to bound cost, and require a real question.
if (count($messages) > $maxTurns) {
    $messages = array_slice($messages, -$maxTurns);
}
if ($messages === [] || $messages[array_key_last($messages)]['role'] !== 'user') {
    fail(400, 'The conversation must end with a user message.');
}

/* --------------------------------------------------------------------------
 * Stream the reply.
 *
 * We stream so the visitor sees words appear immediately, and so long replies
 * never hit an HTTP timeout. The system prompt carries a cache breakpoint, so
 * on repeat requests it is billed at the cheap cache-read rate.
 * ------------------------------------------------------------------------ */

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('X-Accel-Buffering: no'); // stop nginx/proxies from buffering the stream

while (ob_get_level() > 0) {
    ob_end_flush();
}

$client = new Client(apiKey: $apiKey);

try {
    $stream = $client->messages->createStream(
        model: $model,
        maxTokens: 1024,
        system: [
            ['type' => 'text', 'text' => $systemPrompt, 'cacheControl' => ['type' => 'ephemeral']],
        ],
        messages: $messages,
    );

    foreach ($stream as $event) {
        if ($event instanceof RawContentBlockDeltaEvent && $event->delta instanceof TextDelta) {
            sse(['text' => $event->delta->text]);
        }
    }

    sse(['done' => true]);
} catch (APIStatusException $e) {
    // The stream may already be open, so report the error as an SSE frame.
    sse(['error' => 'Upstream error (' . ($e->type?->value ?? 'api_error') . '). Please try again.']);
    sse(['done' => true]);
} catch (\Throwable $e) {
    sse(['error' => 'Something went wrong. Please try again.']);
    sse(['done' => true]);
}
