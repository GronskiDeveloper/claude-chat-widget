# Zgłaszanie podatności

Bezpieczeństwo tego projektu jest dla mnie ważne — jeśli znalazłeś podatność, zgłoś ją **prywatnie** zamiast otwierać publicznego issue.

## Kanały zgłoszenia

- **Preferowany:** [Security Advisory na GitHubie](https://github.com/GronskiDeveloper/claude-chat-widget/security/advisories/new) (prywatny, tylko dla mnie do przejrzenia).
- **Alternatywnie:** e-mail bezpośrednio na **dominik@grodev.pl** z tematem `[SECURITY] claude-chat-widget`.

## Co warto zawrzeć w zgłoszeniu

- Opis podatności (co jest do wykorzystania, jak).
- Kroki reprodukcji (albo minimalny PoC).
- Ocena wpływu (co atakujący może zrobić — kradzież danych, wykonanie kodu, DoS itd.).
- Ewentualnie sugerowany fix.

## Reakcja

- **Potwierdzenie odbioru:** w ciągu 72h.
- **Wstępna ocena:** w ciągu 7 dni.
- **Fix + release:** zależnie od skali (krytyczne — priorytetowo).

Podziękuję imiennie w release notes / CHANGELOG (o ile nie prosisz o anonimowość).


## Kontekst tego projektu

Ten widget przenosi klucz Anthropic API przez proxy PHP. **Najkrytyczniejsze podatności to takie, które pozwalają wyciec klucz z serwera do browsera lub loga** — np. reflected XSS w treści odpowiedzi, header injection, path traversal do plików konfiguracyjnych, RCE w handlerze SSE.

Autor: [Dominik Groński / GroDev](https://grodev.pl)
