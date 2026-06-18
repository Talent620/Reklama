# AUDIT.md — przegląd projektu Reklama

Data: 2026-06-18 · Autor przeglądu: senior architekt (sesja autonomiczna)
Stack: Python 3.10+, Anthropic SDK (model `claude-opus-4-8`), Pydantic v2,
google-api-python-client, Rich, pytest. Uruchomienie testów: `pytest`.

---

## 1. Mapa projektu

Pipeline: **analiza rynku → prompt → (auto-budowa kodu) → karta sklepu/ASO → publikacja**.

| Moduł | Rola | Zależności |
|---|---|---|
| `config.py` | Wczytanie `.env` → `Settings` (klucz API, model, effort, creds Play) | dotenv |
| `models.py` | Modele Pydantic: `AppOpportunity`, `OpportunityReport`, `StoreListing`, `GeneratedPrompt` | pydantic |
| `knowledge.py` | Baza wiedzy: wymogi Google Play 2026 + benchmarki (wstrzykiwana do promptów) | — |
| `_llm.py` | Warstwa nad Anthropic SDK: `research` (web search), `parse_into` (structured), `generate_text` | anthropic |
| `analyzer.py` | Etap 1: research + ekstrakcja do `OpportunityReport` | `_llm`, knowledge, models |
| `prompt_generator.py` | Etap 2: prompt „zbuduj aplikację" | `_llm`, knowledge, models |
| `builder.py` | Etap 2.5: model generuje projekt (format `FILE/END`), zapis na dysk z ochroną traversal | `_llm`, models |
| `aso.py` | Etap 2.7: `StoreListing` + polityka prywatności + Data Safety | `_llm`, knowledge, models |
| `publisher.py` | Etap 3: upload AAB + opisów sklepu (androidpublisher v3), sprzątanie edycji | google-api |
| `economics.py` | Kalkulator realnego przychodu (retencja/konwersja/eCPM), offline | — |
| `storage.py` | Zapis/odczyt raportu i promptów | models |
| `cli.py` | CLI: analyze/prompt/pipeline/build/listing/wymogi/kalkulator/publish | wszystkie |

Przepływ danych jest jednokierunkowy i czysty; brak cykli importów (moduły LLM
importują `make_client` leniwie w funkcjach). Architektura zdrowa.

---

## 2. Błędy i ryzyka (posortowane wg wpływu)

| # | Wpływ | Plik:linia | Problem |
|---|---|---|---|
| B1 | ŚREDNI | `models.py:69` (`best`), `cli.py:48,73` | `OpportunityReport.best()` woła `max()` na liście, która może być pusta → `ValueError: max() arg is an empty sequence`. Osiągalne, gdy model zwróci raport bez nisz; rozbija `analyze/prompt/pipeline` kryptycznym błędem zamiast czytelnego komunikatu. **Potwierdzone testem.** |
| B2 | NISKI | `builder.py:74-83` (`_safe_join`) | Ścieżki `.`, `./`, `sub/..` rozwiązują się do katalogu-korzenia projektu i przechodzą walidację. Gdyby model wyemitował `FILE: .`, kod próbuje `open(<katalog>, "w")` → `IsADirectoryError` i tworzy katalog nadrzędny. **Potwierdzone testem.** Hardening. |
| B3 | NISKI | `cli.py:301,313,336,338` | Brak walidacji argumentów liczbowych: `--ile/--top/--installs` mogą być ≤0, `--cena` ujemna. `--installs -5` jest łapane w `economics` (czytelny błąd), ale `--cena -1` da ujemny przychód, a `--ile 0` zmarnuje wywołanie API. |
| B4 | NISKI | `publisher.py:104` | Język notatek wydania zaszyty na sztywno `"pl-PL"`, mimo parametru `listing_language`. Niespójność, jeśli ktoś publikuje w innym języku. |
| B5 | INFO | `_llm.py:42-59` (`research`) | Jeśli wszystkie 6 iteracji zwróci `pause_turn`, zwracany tekst bywa częściowy; przy `stop_reason == max_tokens` research jest cicho ucinany. Akceptowalna degradacja, ale warta noty. |

Brak realnych dziur bezpieczeństwa: sekrety tylko z env/`.env` (w `.gitignore`),
brak `eval`/`shell=True`, path traversal w builderze już blokowany (poza B2),
publisher sprząta edycję przy wyjątku. Pydantic `model_monetyzacji` **nie**
generuje ostrzeżenia protected-namespace w pydantic 2.13 (sprawdzone) — nie ruszam.

---

## 3. Słabe punkty (jakość/dług techniczny)

- **Brak walidacji wejścia w warstwie CLI** (B3) — argparse przyjmuje dowolne liczby.
- **Brak `py.typed`** — pakiet ma pełne typowanie, ale nie eksponuje go konsumentom.
- **Duplikacja deklaracji zależności** `requirements.txt` vs `pyproject.toml` — akceptowalne, ale do utrzymania ręcznie.
- **`research()` bez retry/backoff na błędy sieci** — SDK robi własny retry (429/5xx), więc OK; jawny brak obsługi twardych błędów daje generyczny komunikat z `main()`.
- **Obsługa błędów CLI** jest scentralizowana (`main()` łapie wszystko) — dobre, ale traci stack trace; dla debugowania przydałby się tryb `--verbose`.

---

## 4. Propozycje poprawek

| ID | Poprawka | Wpływ | Ryzyko | Status |
|---|---|---|---|---|
| P1 | Czytelny błąd przy pustym raporcie: guard w `analyze_market` + bezpieczne `best()` | ŚREDNI | NISKIE | DO WDROŻENIA |
| P2 | `_safe_join` odrzuca ścieżki rozwiązujące się do korzenia (`.`/`..`) | NISKI | NISKIE | DO WDROŻENIA |
| P3 | Walidacja argumentów CLI (dodatnie liczby, nieujemna cena) | NISKI | NISKIE | DO WDROŻENIA |
| P4 | `publisher`: notatki wydania używają `listing_language` (param `notes_language`) | NISKI | NISKIE | DO WDROŻENIA |
| P5 | Dodać `py.typed` + testy regresyjne dla P1–P4 | NISKI | NISKIE | DO WDROŻENIA |

## 5. Pomysły na rozbudowę (od szybkich do ambitnych)

- Szybkie: `--verbose` z pełnym tracebackiem; eksport raportu do Markdown/CSV.
- Średnie: generowanie grafik sklepu (ikona 512×512, feature 1024×500) i upload w tej samej edycji; cache wyników analizy (prompt caching) dla taniości.
- Ambitne: pełna pętla CI testerów (12/14 dni) z automatycznym promowaniem internal→production; integracja RevenueCat/AdMob API do realnych danych zamiast benchmarków.

---

## DO MOJEJ DECYZJI (zmiany duże/ryzykowne — NIE wdrażam bez zgody)

1. **Rozdzielenie zależności Google do `extras`** (`pip install reklama[publish]`) — zmienia sposób instalacji; wymaga decyzji o pakowaniu.
2. **Generowanie i upload grafik sklepu** — nowa integracja (model generujący obrazy lub zewnętrzne API) + nowe zależności; duży zakres.
3. **Automatyzacja pętli testerów internal→production** — dotyka logiki publikacji i może wywołać nieodwracalne akcje w Play Console.
