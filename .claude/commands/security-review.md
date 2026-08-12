---
description: Audyt bezpieczeństwa proxy przed każdą zmianą w server/chat.php
---

Recenzujesz zmianę w `server/chat.php` w repo `claude-chat-widget`. Ten plik to proxy trzymające klucz API do Anthropic. **Najważniejszy niezmiennik: klucz nie może nigdy trafić do browsera ani do loga.**

Zanim zaakceptujesz diff, upewnij się, że wszystkie sześć poniższych warunków zachodzi w wynikowym pliku:

1. **`ANTHROPIC_API_KEY` jest czytane wyłącznie przez `getenv()`** i używane tylko jako argument konstruktora `Anthropic\Client(apiKey: ...)`. Nie pojawia się w żadnym headerze, response body, log statement, error message ani outputcie.
2. **Każde pole request body jest walidowane, nie zaufane.** `role` musi być ściśle `"user"` albo `"assistant"` — cokolwiek innego dropuje wiadomość. `content` musi być niepustym stringiem.
3. **Limity długości są egzekwowane.** `CHAT_MAX_CHARS` per wiadomość (domyślnie 4000), `CHAT_MAX_TURNS` per request (domyślnie 20). Żaden nieograniczony input nie dociera do API.
4. **Rozmowa musi kończyć się na wiadomości `role: "user"`** przed wywołaniem API — inaczej zwrócić 400.
5. **CORS `Access-Control-Allow-Origin` jest ustawiane z env `CHAT_ALLOWED_ORIGIN`**, nie hardkodowane do `*`.
6. **Header `X-Accel-Buffering: no` jest obecny** na odpowiedzi streamującej (zapobiega buforowaniu przez nginx).

Jeśli którykolwiek z tych warunków nie zachodzi, zablokuj zmianę. Jeśli wszystkie zachodzą, opisz co diff faktycznie robi i jakie ryzyko rezydualne pozostaje (np. „rate limiting nadal niezaimplementowany — flagged do follow-up").

Nie pomijaj tego review, bo diff „wygląda mały". Jednoliniowa zmiana kolejności headerów może po cichu złamać kontrakt streamingu.
