# PROGRESS.md — postęp przeglądu Reklama

## Faza 1 — Audyt
- [x] Mapa projektu (12 modułów) — AUDIT.md §1
- [x] Błędy i ryzyka B1–B5 — AUDIT.md §2 (B1, B2 potwierdzone testami)
- [x] Słabe punkty — AUDIT.md §3
- [x] Propozycje poprawek P1–P5 — AUDIT.md §4
- [x] Lista „DO MOJEJ DECYZJI" — AUDIT.md

## Faza 2 — Wdrożenie (poprawki niskiego/średniego ryzyka)
- [x] P1: czytelny błąd przy pustym raporcie + bezpieczne `best()` — `models.py`, `analyzer.py`
- [x] P2: `_safe_join` odrzuca ścieżki do korzenia (`.`/`..`) — `builder.py`
- [x] P3: walidacja argumentów CLI (`_dodatnia`, `_nieujemna_cena`, 6 argumentów) — `cli.py`
- [x] P4: język notatek wydania spójny z `listing_language` (param `notes_language`) — `publisher.py`
- [x] P5: `py.typed` + `package-data` + 11 testów regresyjnych — `pyproject.toml`, `tests/`

Testy: **58 zielonych** (było 47; +11). Kompilacja i smoke-testy CLI OK.

## Faza 3 — Podsumowanie

### Co naprawiono i ulepszono
- **P1 (ŚREDNI):** pusty raport okazji nie wywala już `ValueError: max() arg is an empty
  sequence` — `best()` i `analyze_market` dają czytelny komunikat po polsku.
- **P2 (NISKI, hardening):** parser buildera nie przepuszcza ścieżek wskazujących na
  katalog-korzeń (`.`, `a/..`), które wcześniej powodowałyby `IsADirectoryError`.
- **P3 (NISKI, UX):** CLI odrzuca `--ile/--top/--installs ≤ 0` i `--cena < 0` z jasnym błędem.
- **P4 (NISKI, spójność):** notatki wydania dziedziczą język karty sklepu; jawny
  `notes_language` ma pierwszeństwo.
- **P5:** pakiet eksponuje typy (`py.typed`); poprawki pokryte testami regresyjnymi.

Zasada „nie przepisuj działającego" utrzymana — zmiany minimalne i celne
(6 plików, +40/−9 linii). Architektura i publiczne API bez zmian.

### Do mojej decyzji (NIE wdrożono — patrz AUDIT.md „DO MOJEJ DECYZJI")
1. Rozdzielenie zależności Google do `extras` (`reklama[publish]`) — zmiana sposobu instalacji.
2. Generowanie i upload grafik sklepu (ikona/feature graphic) — nowa integracja + zależności.
3. Automatyzacja pętli testerów internal→production — dotyka nieodwracalnych akcji w Play Console.

### TOP 5 następnych kroków (wg priorytetu)
1. `--verbose` z pełnym tracebackiem (debug) — szybka wygrana, niski koszt.
2. Eksport raportu okazji do Markdown/CSV — ułatwia dalszą pracę.
3. Prompt caching wspólnych części promptów (MARKET_FACTS) — niższy koszt API.
4. Decyzja #2: grafiki sklepu + upload `images().upload` w tej samej edycji.
5. Decyzja #1: `extras` dla zależności Google + węższy obraz instalacji.
