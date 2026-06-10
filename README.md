# Reklama 🪄→📱→💰

Narzędzie, które **dla najmocniejszego modelu flagowego** (Claude Opus 4.8):

1. **analizuje rynek Google Play** i znajduje nisze, na których realnie da się zarobić
   (kalibrowane do realnych benchmarków eCPM AdMob 2025/2026),
2. **generuje gotowy do wklejenia prompt** „zbuduj całą aplikację" na najwyższym poziomie,
3. **opcjonalnie sam buduje kod aplikacji** z tego promptu (kompletny projekt Flutter na dysku),
4. **generuje kartę sklepu (ASO)** — tytuł/opisy w limitach Google Play, frazy kluczowe,
   politykę prywatności i wskazówki do formularza Data Safety,
5. **automatycznie publikuje** gotowy plik aplikacji (AAB) **wraz z opisami sklepu**
   do Google Play.

Pętla docelowa:

```
reklama pipeline "fitness" --build   →  out/prompt-*.txt  +  out/app-<nazwa>/ (kod projektu)
        │
        ▼  (flutter build appbundle wg out/app-<nazwa>/BUILD.md)
   podpisany .aab
        │
        ▼
reklama publish --package com.firma.app --aab app.aab --track internal
```

Bez `--build` dostajesz same prompty — wklejasz je do dowolnego agenta kodującego
(np. Claude Code) i odbierasz aplikację tam.

> **Szczerze o automatyzacji.** Etapy 1–3 (analiza → prompt → kod) są w pełni automatyczne
> z flagą `--build`. Dwa kroki pozostają po Twojej stronie: kompilacja i **podpisanie** AAB
> (`flutter build appbundle` — klucz podpisujący musi być Twój i lokalny) oraz jednorazowa
> konfiguracja konta Google Play Developer + konta serwisowego; pierwsza wersja produkcyjna
> zwykle przechodzi ręczną weryfikację Google. Te ograniczenia wynikają z wymogów
> bezpieczeństwa i polityk Google, nie z narzędzia. Wygenerowany kod zawsze przejrzyj
> przed publikacją.

---

## Instalacja

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt        # lub: pip install -e .
cp .env.example .env                   # i uzupełnij ANTHROPIC_API_KEY
```

## Użycie

```bash
# 1. Sama analiza nisz
reklama analyze "aplikacje dla rodziców" --ile 6

# 2. Analiza + gotowy prompt dla najlepszej niszy
reklama prompt "produktywność"

# 3. Pełny przebieg: analiza + prompty dla top 3 nisz
reklama pipeline "zdrowie i fitness" --top 3

# 3b. Jak wyżej + auto-budowa kodu najlepszej aplikacji
reklama pipeline "zdrowie i fitness" --build

# 3c. Auto-budowa z wcześniej zapisanego promptu
reklama build --prompt out/prompt-moja-apka.json

# 3d. Karta sklepu (ASO) + polityka prywatności z zapisanego promptu
reklama listing --prompt out/prompt-moja-apka.json

# 4. Checklista zgodności przed publikacją
reklama wymogi

# 5. Publikacja gotowego AAB wraz z opisami sklepu
reklama publish --package com.firma.app --aab ./app-release.aab \
    --track internal --notes "Pierwsza wersja" \
    --listing out/listing-moja-apka.json
```

Bez instalacji pakietu można też uruchamiać przez moduł:

```bash
python -m reklama.cli pipeline "fitness"
```

Wyniki lądują w katalogu `out/`:
- `raport-okazji.json` — pełny raport z analizy,
- `prompt-<nazwa>.txt` — **to wklejasz** do agenta kodującego,
- `prompt-<nazwa>.json` — prompt z metadanymi.

---

## Konfiguracja Google Play (jednorazowo)

Aby działała komenda `publish`:

1. Załóż **konto Google Play Developer** (jednorazowa opłata 25 USD).
2. W Play Console utwórz aplikację z tym samym `applicationId`, co Twój AAB.
3. Włącz **Google Play Android Developer API** w Google Cloud Console i utwórz
   **konto serwisowe**; pobierz jego klucz JSON.
4. W Play Console → *Users and permissions* dodaj e-mail konta serwisowego i nadaj
   uprawnienia do publikacji (releases).
5. Ścieżkę do JSON ustaw w `.env` jako `GOOGLE_PLAY_CREDENTIALS`.

Wskazówki:
- Zacznij od `--track internal` (kanał testowy) — szybkie i bez weryfikacji produkcyjnej.
- `--dry-run` wgrywa do edycji, ale jej nie zatwierdza (bezpieczny test konfiguracji).
- Plik musi być **podpisanym** App Bundle `.aab`.

## Wymogi Google Play, które trzeba znać (research: czerwiec 2026)

Pełną checklistę wyświetla komenda `reklama wymogi`. Najważniejsze:

- **Nowe konta osobiste** (utworzone po 13.11.2023) muszą przejść **zamknięty test:
  min. 12 testerów opt-in przez 14 kolejnych dni**, zanim dostaną dostęp do produkcji
  (od 11.12.2024 — wcześniej było 20 testerów). Konta firmowe są zwolnione.
  ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465))
- **Limity karty sklepu:** tytuł ≤30 znaków, krótki opis ≤80, pełny opis ≤4000;
  w tytule zakazane m.in. "free", "#1", "best".
  ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/9898842))
- **Od 31.08.2026 nowe aplikacje muszą celować w Android 16 (API 36).**
  ([Android Developers](https://developer.android.com/google/play/requirements/target-sdk))
- **Formularz Data Safety i polityka prywatności są obowiązkowe** i muszą być spójne —
  rozbieżność blokuje przegląd. Komenda `reklama listing` generuje oba artefakty.
- **Benchmarki AdMob (eCPM, Tier-1):** banner ~0,5–1,5 USD, interstitial ~5–14 USD,
  rewarded ~18–45 USD — analiza nisz używa tych widełek do urealnienia szacunków
  przychodu. ([Playwire](https://www.playwire.com/blog/admob-ecpm-benchmarks-what-publishers-should-expect), [Tenjin](https://tenjin.com/blog/ad-mon-gaming-2026/))

---

## Architektura

```
reklama/
├── analyzer.py          # Etap 1: web search + structured output → raport nisz
├── prompt_generator.py  # Etap 2: gotowy do wklejenia prompt budujący aplikację
├── builder.py           # Etap 2.5: auto-budowa kodu aplikacji z promptu (opcjonalna)
├── aso.py               # Etap 2.7: karta sklepu (ASO) + polityka prywatności
├── knowledge.py         # baza wiedzy: wymogi Google Play i benchmarki eCPM (2026)
├── publisher.py         # Etap 3: upload AAB + opisów sklepu (androidpublisher v3)
├── pipeline / cli.py    # orkiestracja i interfejs CLI
├── _llm.py              # warstwa nad Anthropic SDK (model flagowy)
├── models.py            # modele danych (Pydantic)
├── config.py            # konfiguracja z .env
└── storage.py           # zapis artefaktów
```

Model i poziom „wysiłku" ustawisz w `.env` (`REKLAMA_MODEL`, `REKLAMA_EFFORT`).

## Uwaga prawna / odpowiedzialność

Narzędzie nie gwarantuje przychodu — dostarcza analizę, prompty i automatyzację publikacji.
Odpowiadasz za zgodność aplikacji z [politykami Google Play](https://play.google/developer-content-policy/),
RODO oraz prawami autorskimi. Generuj wyłącznie aplikacje, które masz prawo opublikować.
