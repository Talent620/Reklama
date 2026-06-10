# Reklama 🪄→📱→💰

Narzędzie, które **dla najmocniejszego modelu flagowego** (Claude Opus 4.8):

1. **analizuje rynek Google Play** i znajduje nisze, na których realnie da się zarobić,
2. **generuje gotowy do wklejenia prompt** „zbuduj całą aplikację" na najwyższym poziomie,
3. **automatycznie publikuje** gotowy plik aplikacji (AAB) do Google Play.

Pętla docelowa:

```
reklama pipeline "fitness"   →  out/prompt-*.txt
        │
        ▼  (wklejasz prompt do agenta kodującego, np. Claude Code)
   gotowa aplikacja  →  build do podpisanego .aab
        │
        ▼
reklama publish --package com.firma.app --aab app.aab --track internal
```

> **Szczerze o automatyzacji.** Etapy 1–2 (analiza + prompt) są w pełni automatyczne.
> Etap „wklej i odbierz aplikację" wykonuje agent kodujący, do którego wklejasz prompt —
> to celowy, kontrolowany krok (sprawdzasz i budujesz kod). Etap 3 (upload do Google Play)
> jest automatyczny, ale wymaga jednorazowej konfiguracji konta dewelopera i konta serwisowego,
> a pierwsza wersja produkcyjna zwykle przechodzi ręczną weryfikację Google. Te ograniczenia
> wynikają z polityk Google, nie z narzędzia.

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

# 4. Publikacja gotowego AAB
reklama publish --package com.firma.app --aab ./app-release.aab \
    --track internal --notes "Pierwsza wersja"
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

---

## Architektura

```
reklama/
├── analyzer.py          # Etap 1: web search + structured output → raport nisz
├── prompt_generator.py  # Etap 2: gotowy do wklejenia prompt budujący aplikację
├── publisher.py         # Etap 3: upload AAB do Google Play (androidpublisher v3)
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
