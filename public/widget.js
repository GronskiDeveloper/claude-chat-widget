/*
 * Claude chat widget — dependency-free, ~6 KB.
 *
 * A floating chat launcher that talks to your own /server/chat.php proxy
 * (which holds the Claude API key). No build step, no framework, no external
 * requests — drop the <script> on any page and call ClaudeChatWidget.init().
 *
 * Built by GroDev — https://grodev.pl/ai
 *
 * Usage:
 *   <script src="widget.js"></script>
 *   <script>
 *     ClaudeChatWidget.init({
 *       endpoint: '/server/chat.php',   // your proxy URL
 *       title:    'Ask us anything',
 *       greeting: 'Hi! How can I help?',
 *       accent:   '#1D9E75',
 *     });
 *   </script>
 */
(function (window, document) {
  'use strict';

  var CSS = [
    '.gd-chat-launcher{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border:none;border-radius:50%;background:var(--gd-accent);color:#fff;font-size:26px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:2147483000;transition:transform .15s ease}',
    '.gd-chat-launcher:hover{transform:scale(1.06)}',
    '.gd-chat-panel{position:fixed;bottom:92px;right:24px;width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);background:var(--gd-bg);color:var(--gd-fg);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
    '.gd-chat-panel.gd-open{display:flex}',
    '.gd-chat-header{background:var(--gd-accent);color:#fff;padding:14px 16px;font-weight:600;font-size:15px;display:flex;justify-content:space-between;align-items:center}',
    '.gd-chat-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:0 4px}',
    '.gd-chat-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}',
    '.gd-msg{max-width:82%;padding:9px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}',
    '.gd-msg.gd-user{align-self:flex-end;background:var(--gd-accent);color:#fff;border-bottom-right-radius:4px}',
    '.gd-msg.gd-bot{align-self:flex-start;background:var(--gd-bubble);color:var(--gd-fg);border-bottom-left-radius:4px}',
    '.gd-chat-form{display:flex;gap:8px;padding:12px;border-top:1px solid var(--gd-border)}',
    '.gd-chat-input{flex:1;border:1px solid var(--gd-border);border-radius:10px;padding:9px 12px;font-size:14px;background:var(--gd-bg);color:var(--gd-fg);resize:none;font-family:inherit;max-height:96px}',
    '.gd-chat-input:focus{outline:2px solid var(--gd-accent);outline-offset:-1px}',
    '.gd-chat-send{border:none;background:var(--gd-accent);color:#fff;border-radius:10px;padding:0 16px;font-size:14px;font-weight:600;cursor:pointer}',
    '.gd-chat-send:disabled{opacity:.5;cursor:default}',
    '.gd-typing{display:inline-block}',
    '.gd-typing i{display:inline-block;width:6px;height:6px;margin:0 1px;border-radius:50%;background:currentColor;opacity:.4;animation:gd-blink 1.2s infinite}',
    '.gd-typing i:nth-child(2){animation-delay:.2s}.gd-typing i:nth-child(3){animation-delay:.4s}',
    '@keyframes gd-blink{0%,60%,100%{opacity:.25}30%{opacity:.9}}',
  ].join('');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // textContent escapes HTML — no XSS
    return e;
  }

  function init(opts) {
    opts = opts || {};
    var endpoint = opts.endpoint || '/server/chat.php';
    var title = opts.title || 'Chat with us';
    var greeting = opts.greeting || 'Hi! How can I help you today?';
    var accent = opts.accent || '#1D9E75';

    // Theme variables (light + dark, following the OS preference).
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var vars = document.createElement('style');
    vars.textContent =
      ':root{--gd-accent:' + accent + ';' +
      '--gd-bg:' + (dark ? '#1b1b1f' : '#ffffff') + ';' +
      '--gd-fg:' + (dark ? '#f2f2f5' : '#1a1a1a') + ';' +
      '--gd-bubble:' + (dark ? '#2c2c32' : '#f1f0f5') + ';' +
      '--gd-border:' + (dark ? '#38383f' : '#e4e3ea') + '}';
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(vars);
    document.head.appendChild(style);

    // ----- DOM -----
    var launcher = el('button', 'gd-chat-launcher');
    launcher.setAttribute('aria-label', 'Open chat');
    launcher.innerHTML = '&#128172;'; // speech balloon

    var panel = el('div', 'gd-chat-panel');
    var header = el('div', 'gd-chat-header');
    header.appendChild(el('span', null, title));
    var close = el('button', 'gd-chat-close', '×');
    close.setAttribute('aria-label', 'Close chat');
    header.appendChild(close);

    var log = el('div', 'gd-chat-log');
    var form = el('form', 'gd-chat-form');
    var input = el('textarea', 'gd-chat-input');
    input.rows = 1;
    input.placeholder = 'Type a message…';
    var send = el('button', 'gd-chat-send', 'Send');
    send.type = 'submit';
    form.appendChild(input);
    form.appendChild(send);

    panel.appendChild(header);
    panel.appendChild(log);
    panel.appendChild(form);
    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    // ----- State -----
    var history = [];   // [{role, content}] sent to the server each turn
    var busy = false;
    var greeted = false;

    function scroll() { log.scrollTop = log.scrollHeight; }

    function addBubble(role) {
      var b = el('div', 'gd-msg ' + (role === 'user' ? 'gd-user' : 'gd-bot'));
      log.appendChild(b);
      scroll();
      return b;
    }

    function toggle(open) {
      panel.classList.toggle('gd-open', open);
      if (open) {
        if (!greeted) { addBubble('bot').textContent = greeting; greeted = true; }
        input.focus();
      }
    }

    launcher.addEventListener('click', function () { toggle(!panel.classList.contains('gd-open')); });
    close.addEventListener('click', function () { toggle(false); });

    // Enter sends, Shift+Enter makes a newline.
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text || busy) return;

      input.value = '';
      addBubble('user').textContent = text;
      history.push({ role: 'user', content: text });

      var bot = addBubble('bot');
      var typing = el('span', 'gd-typing');
      typing.innerHTML = '<i></i><i></i><i></i>';
      bot.appendChild(typing);

      busy = true;
      send.disabled = true;

      streamReply(endpoint, history, function onDelta(chunk) {
        if (typing.parentNode) bot.textContent = ''; // drop the typing dots on first token
        bot.textContent += chunk;
        scroll();
      }, function onDone(full, err) {
        busy = false;
        send.disabled = false;
        if (err && !full) { bot.textContent = err; }
        else { history.push({ role: 'assistant', content: full }); }
        input.focus();
      });
    });
  }

  /* Read the SSE stream from the proxy and hand text deltas to the caller. */
  function streamReply(endpoint, messages, onDelta, onDone) {
    var full = '';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages }),
    }).then(function (res) {
      if (!res.ok || !res.body) throw new Error('Request failed (' + res.status + ')');
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) { onDone(full, null); return; }
          buffer += decoder.decode(result.value, { stream: true });

          var frames = buffer.split('\n\n');
          buffer = frames.pop(); // keep the last partial frame

          for (var i = 0; i < frames.length; i++) {
            var line = frames[i].trim();
            if (line.indexOf('data:') !== 0) continue;
            var payload;
            try { payload = JSON.parse(line.slice(5).trim()); } catch (_) { continue; }
            if (payload.text) { full += payload.text; onDelta(payload.text); }
            if (payload.error) { onDone(full, payload.error); return; }
            if (payload.done) { onDone(full, null); return; }
          }
          return pump();
        });
      }
      return pump();
    }).catch(function () {
      onDone(full, 'Sorry, I couldn’t reach the server. Please try again.');
    });
  }

  window.ClaudeChatWidget = { init: init };
})(window, document);
