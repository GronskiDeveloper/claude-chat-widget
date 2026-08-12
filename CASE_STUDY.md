# Case study — jak powstał ten widget z Claude Code

Krótka, uczciwa retrospektywa jak zostało to zbudowane, bo za ten proces mnie się zatrudnia, nie za sam plik wyjściowy. To też forma transparentności, której sam bym oczekiwał od kogoś, kogo rozważam do współpracy.

Jeśli jesteś rekruterem albo klientem próbującym rozgryźć, jak „AI-first" wygląda w codziennej pracy developera — to jest to.

## Brief (30 sekund)

Wpinany widget czatu AI na stronę firmową, z dwoma twardymi wymaganiami:

1. **Klucz API do Claude nie może nigdy trafić do browsera.** Widget wołający `api.anthropic.com` bezpośrednio z JavaScriptu wycieka klucz każdemu, kto otworzy DevTools, a pierwsza osoba, która to zauważy, robi Ci rachunek w nocy. To *ograniczenie designu*, nie detal implementacyjny — dyktuje całą architekturę.
2. **Frontend dependency-free.** Widget musi wchodzić na dowolną stronę (WordPress, plain HTML, cudza aplikacja Laravel) bez build stepu, bez frameworka, bez konfliktów wersji. To znaczy vanilla JS, ręcznie napisane CSS, jeden tag `<script>`. Nic do kompilacji.

Cały build: ~90 minut aktywnej pracy, jedna interaktywna sesja.

## Gdzie faktycznie zdarzyła się praca człowieka

### 1. Threat model i architektura (człowiek — przed napisaniem jakiegokolwiek kodu)

Decyzja o bezpieczeństwie napędziła wszystko dalej. Były dwie opcje:

- **Opcja A** — widget woła Claude bezpośrednio z browsera z zaszytym kluczem.
- **Opcja B** — widget woła mały endpoint po stronie serwera klienta, który trzyma klucz i przekazuje dalej do Claude.

Wybrałem B z oczywistego powodu (patrz ograniczenie 1) i narysowałem kształt:

```
Browser (widget.js)  ──POST /server/chat.php──▶  Twój serwer  ──▶  Claude API
        ◀───────────── stream SSE z tekstem ──────────────
```

Decyzja o SSE też była moja — streaming oznacza, że użytkownik widzi słowa pojawiające się od razu (perceived latency), długie odpowiedzi nie wchodzą w timeout HTTP, a proxy łatwiej to forwarduje niż upgrade do WebSocketa. Nie pytałem AI o żadną z tych rzeczy; tradeoffy są znane i zły wybór jest łatwo zauważyć.

### 2. Wyciągnięcie dokładnego kształtu SDK (człowiek, nie zgadywanie AI)

Przed napisaniem pojedynczej linii `chat.php` załadowałem skill `claude-api` w Claude Code, żeby dostać aktualne bindingi PHP SDK. API SDK się zmieniają, a dane treningowe modelu mogą nie odzwierciedlać ostatniego wydania — proszenie Claude o „napisz PHP, który woła API Anthropic" bez zpinowania dokładnego kształtu funkcji to sposób na wymyślone nazwy metod, które nie istnieją.

Skill dał mi dokładne klasy, których potrzebowałem:

- `Anthropic\Client` (konstruktor z named arg `apiKey:`)
- `Anthropic\Messages\RawContentBlockDeltaEvent` (typ eventu streamu)
- `Anthropic\Messages\TextDelta` (klasa payloadu delty)
- `->messages->createStream(model:, maxTokens:, system:, messages:)` — camelCase named args (konwencja Stainless-generated SDK), które stają się snake_case na warstwie sieci.

Potwierdziłem też pin wersji SDK (`^0.7`), bo v0.5.0 zmieniła named args i cokolwiek starszego by się wywaliło.

**Dlaczego to ma znaczenie:** bez dokładnego kształtu Claude wyhalucynowałby coś prawdopodobnie wyglądającego, `php -l` by przeszedł, i wywaliłoby się na pierwszym realnym requeście w runtime. To jest #1 failure mode „AI po prostu pisze kod" — poprawność powierzchniowa, która sypie na granicy.

### 3. AI zrobiło draft szkieletu proxy (Claude, ~10 min)

Z zablokowanym designem i wyciągniętym kształtem SDK poprosiłem Claude o draft `server/chat.php`. Wyprodukował rozsądną pierwszą wersję — init klienta, parsowanie wiadomości, pętla `foreach ($stream as $event)` z poprawnym type-checkiem, framing SSE `echo "data: ..."`.

### 4. Audyt linia po linii + hardening (człowiek, ~20 min)

To jest część, która odróżnia „używam AI" od „używam AI dobrze". Przeczytałem draft od góry do dołu i odrzuciłem dwie rzeczy, które Claude zaproponował:

- **Logowanie request body** — logowałoby dane osobowe użytkownika do plain filea. Usunięte.
- **Fallback do `$_ENV['ANTHROPIC_API_KEY']`, jeśli `getenv()` zwrócił false** — zbędne (`getenv` czyta to samo źródło na każdym stacku hostingu, na jakim wdrażałem), i na niektórych mogłoby złapać stare wartości. Usunięte.

*Dodałem:*

- **Length caps** — `CHAT_MAX_CHARS` per wiadomość, `CHAT_MAX_TURNS` per request. LLM-y się same nie ograniczają; user paste'ujący 200 KB blob kosztowałby realne pieniądze.
- **Walidację role** — pole `role` w request body to *zawsze* nieufny input użytkownika. Cokolwiek, co nie jest literalnie `"user"` albo `"assistant"`, dropowane, nie „coerce'owane na user". Nic z sieci nie jest zaufane.
- **`X-Accel-Buffering: no`** — bez tego nginx buforuje stream SSE i browser widzi długą pauzę, a potem ścianę tekstu. Kluczowy header.
- **Prompt caching z `cacheControl`** — na bloku system promptu. Na widgecie z wieloma krótkimi requestami to różnica między 50 zł/mies. a 5 zł/mies. spendu na API. Inżynieria kosztów nie dzieje się bez człowieka, który o niej pomyśli.
- **Try/catch, który emituje błędy jako frame'y SSE**, nie jako HTTP 500. Do czasu, gdy błąd upstreamu zafunkcjonuje, headery odpowiedzi są już wysłane i stream jest otwarty. Próba `http_response_code(500)` w tym momencie nic nie robi; frame — tak.

### 5. AI zrobiło draft widgeta (Claude, ~10 min)

Ten sam wzorzec dla frontendu. Claude zrobił draft `widget.js` — floating launcher, toggle panelu, lista wiadomości, formularz, parsowanie SSE. Rozsądna pierwsza wersja.

### 6. Audyt widgeta + hardening (człowiek, ~15 min)

Odrzucone/przepisane:

- **`innerHTML = userText`** — klasyczny XSS. Zamieniłem każdy string od użytkownika na `textContent`. Jeśli przyszła zmiana zechce renderować Markdown, ma to zrobić po stronie serwera z sanityzatorem, nie po stronie klienta przez interpolację stringów.
- **Hardkodowane 400px szerokości** — zamienione na `max-width: calc(100vw - 32px)`, żeby działało na mobile.
- **`Enter` zawsze wysyła** — zmienione na „Enter wysyła, Shift+Enter to nowa linia". Wieloliniowe pytania mają znaczenie na realnych widgetach.
- **Brak dark mode** — dodane `@media (prefers-color-scheme: dark)` i system zmiennych CSS, żeby widget respektował motyw OS automatycznie.

Dodałem animację kropek pisania, bo widget czatu bez niej daje wrażenie zepsutego w pierwszej sekundzie latency.

### 7. Weryfikacja w prawdziwym browserze (człowiek, ~10 min)

Użyłem narzędzi browsera w Claude Code, żeby faktycznie załadować widget w Chrome. Nie „przetestowane przez zapytanie AI, czy powinno działać" — dosłownie otwarta strona, kliknięty launcher, obserwacja pojawienia się panelu, sprawdzona konsola. **Zero błędów, bąbelek powitalny się wyrenderował, launcher animował się poprawnie.** Ten krok jest nienegocjowalny — LLM-y są ekstremalnie dobre w generowaniu kodu, który lintuje się czysto i sypie w runtime.

Weryfikacja screenshotem złapała też jedną rzecz, której nie złapałby ani `php -l`, ani code review: CSS `z-index: 2147483000` musiał być wyższy niż overlay strony. Odkryte dlatego, że na stronie z modalem launcher chował się *za* nim.

### 8. Dokumentacja (człowiek, ~15 min)

Piszę własne README. LLM-y piszą generyczne README, które mogłyby opisywać dowolny projekt. Ten:

- Zaczyna się od **dlaczego** (threat model klucza-w-browserze), bo to cały powód istnienia repo.
- Zawiera diagram ASCII flow requesta — większość czytelników skanuje diagramy przed prozą.
- Sekcja **„Production notes"** jest specjalnie uczciwa co do tego, czego *nie ma* w repo (rate limiting, logowanie, RAG). README, które sprzedaje ponad miarę, jest gorsze niż to, które sprzedaje poniżej; obu czytelników zawodzi, tylko uczciwy zachowuje zaufanie.

## Wynik

- 3 realne pliki, ~350 linii production code (`server/chat.php`, `public/widget.js`, `public/index.html`).
- Brak zewnętrznych zależności na frontendzie, jeden PHP SDK na backendzie, brak build stepu.
- Deploy w 5 minut na dowolnym hoście PHP.
- Licencja MIT.
- Obsługuje realną rzecz: streamujące odpowiedzi z kluczem trzymanym bezpiecznie.

## Co to mówi o workflow

AI napisało może 60% linii. Każda kluczowa decyzja — architektura, postawa bezpieczeństwa, inżynieria kosztów, strategia walidacji, dobór zależności, co **odrzucić** — była człowiekiem. To jest kształt AI-first pracy, którą robię: **AI to szybki pisarz i rozsądny recenzent; autorytet designowy zostaje po mojej stronie.** Kiedy oddaję autorytet designowy modelowi, dostaję repo, które lintuje się czysto i sypie w produkcji.

Jeśli oceniasz mnie pod pracę AI-augmented, to repo to działający sample. Plik [`CLAUDE.md`](CLAUDE.md) w tym repo (i w każdym z moich pozostałych publicznych repo) dokumentuje ten sam podział w krótszej formie.

---

*Autor: [Dominik Groński / GroDev](https://grodev.pl) — buduję asystenty AI na zamówienie na Claude API. Zobacz [grodev.pl/ai](https://grodev.pl/ai).*
