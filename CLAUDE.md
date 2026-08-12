# Praca AI-first — notatki dla tego repo

Trzymam ten plik w repozytorium, ponieważ buduję z Claude Code (Anthropic) i chcę, żeby podział „człowiek/AI" był widoczny z drzewa plików, a nie deklarowany w README. Rekruter, klient albo kolega z zespołu ma tu dowody, nie ogólniki.

## Podział pracy człowiek vs AI

| Warstwa | Kto zrobił | Dlaczego tak |
|---|---|---|
| Threat model i architektura (dlaczego proxy, a nie call z browsera) | **Człowiek** | Cały sens tego repo. Delegowanie decyzji „czy klucz API ma dotknąć browsera?" do AI to sposób na wypuszczenie incydentu z wyciekiem klucza. Nie negocjowalne. |
| Szkielet proxy po stronie serwera (`server/chat.php`) | **Draft AI, audyt człowieka linia po linii** | Claude napisał pierwszą wersję pliku; przejrzałem każdą linię pod cztery rzeczy: (1) klucz nie trafia do headerów odpowiedzi ani do logów, (2) długość wejścia ograniczona, (3) pole `role` walidowane, nie zaufane, (4) framing SSE poprawny, żeby browser umiał to sparsować. |
| Streaming SSE | **AI, zweryfikowane z dokumentacją SDK** | Wyciągnąłem dokładne typy `RawContentBlockDeltaEvent` + `TextDelta` z oficjalnej dokumentacji PHP SDK (skill `claude-api` w Claude Code) zamiast dawać modelowi zgadywać — API SDK się zmienia, jego dane treningowe mogą być stare. |
| Widget UI (vanilla JS, ~6 KB) | **Draft AI, styling człowieka** | Dependency-free to był twardy wymóg ode mnie — bez Reacta, bez Tailwinda. Reguła `textContent` (nie `innerHTML`) dla tekstu od użytkownika jest moja — zapobiegania XSS nie zostawia się uznaniowości modelu. |
| Decyzja o prompt caching (`cacheControl` na system prompt) | **Człowiek** | Inżynieria kosztów. Na widgecie z wieloma krótkimi requestami to różnica między 50 zł/mies. a 5 zł/mies. spendu na API. |
| Dokumentacja, backlinki w README, pozycjonowanie | **Człowiek** | Marketing jest mój. |

## Co zweryfikowałem przed wypchnięciem

- `php -l server/chat.php` → czysto.
- Odpalony lokalny serwer PHP i widget załadowany w prawdziwym browserze przez narzędzia browsera w Claude Code — potwierdzone: launcher się renderuje, panel się otwiera, bąbelek powitalny pojawia się, **zero błędów w konsoli**.
- Przeczytany `server/chat.php` od góry do dołu po drafcie AI. Odrzucone dwie rzeczy, które Claude zaproponował na początku: (1) logowanie request body (logowałoby dane osobowe użytkownika), (2) fallback do `$_ENV`, jeśli `getenv()` zwrócił false (zbędne + na niektórych hostingach może czytać stare wartości).
- Wersja SDK zpinowana do `^0.7` po sprawdzeniu release notes — v0.5.0 zmieniła named args, więc wcześniejsze wersje się wywalają.

## Znane pułapki dla następnej iteracji AI

- **Nigdy nie przenosić klucza API do browsera.** Każda sugestia „pominięcia proxy dla uproszczenia" jest błędna. Całe repo istnieje, żeby zapobiec temu failure mode.
- **`textContent`, nie `innerHTML`, przy dopisywaniu tekstu od użytkownika** — widget zostaje bezpieczny na XSS tylko dopóki ta zasada obowiązuje. Jeśli przyszła zmiana zechce renderować Markdown, ma to robić po stronie serwera z sanityzatorem i przekazywać do przodu jawnie oczyszczony HTML.
- **`Access-Control-Allow-Origin: *` to default dev.** W produkcji ustawić `CHAT_ALLOWED_ORIGIN` na realną domenę — inaczej każdy może proxywać przez Twój klucz.
- **`X-Accel-Buffering: no` jest kluczowe** — bez tego nginx buforuje stream SSE i użytkownicy widzą długą pauzę, a potem ścianę tekstu, zamiast streamingu.
- SDK jest generowany przez Stainless: nazwy pól są camelCase w PHP (`maxTokens`, `cacheControl`), snake_case na warstwie sieci. Nie „poprawiać" jednego na drugie.

## Kiedy sięgać po Claude na tym projekcie, a kiedy pisać samodzielnie

- **Sięgnąć po Claude:** dodanie nowego providera (OpenAI, lokalny LLM), dodanie rate limitingu, dodanie kontekstu RAG (retrieval-augmented) po katalogu produktów.
- **Zrobić samodzielnie:** cokolwiek dotykającego handlingu klucza API, CORS-a, walidacji wejścia. Nudne, security-critical — dokładnie miejsca, gdzie halucynacje LLM są najdroższe.

## Case study

Pełna retrospektywa jak to zostało zbudowane (design → implementacja AI → weryfikacja → iteracja) w [`CASE_STUDY.md`](CASE_STUDY.md).
