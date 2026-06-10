"""Etap 2 — generowanie gotowego do wklejenia promptu budującego całą aplikację.

Wynik to jeden, samowystarczalny prompt na najwyższym poziomie, który wklejasz
do narzędzia kodującego (np. Claude Code / agent), żeby odebrać kompletny,
gotowy do zbudowania projekt aplikacji Android wraz z monetyzacją.
"""

from __future__ import annotations

import anthropic

from ._llm import generate_text
from .config import Settings
from .knowledge import MARKET_FACTS
from .models import AppOpportunity, GeneratedPrompt

DEFAULT_STACK = "Flutter (Dart) + Material 3, gotowy build do AAB"

_SYSTEM = f"""\
Jesteś światowej klasy inżynierem promptów i architektem aplikacji mobilnych. \
Tworzysz JEDEN, samowystarczalny prompt, który po wklejeniu do agenta kodującego \
zwróci KOMPLETNĄ, gotową do zbudowania i opublikowania aplikację Android.

{MARKET_FACTS}

Prompt, który tworzysz, musi:
- być napisany jako polecenie do wykonawcy (drugi model/agent), nie jako opis dla człowieka,
- zawierać pełną specyfikację: ekrany, nawigację, modele danych, logikę, stany puste/błędów,
- precyzyjnie opisać monetyzację (np. integracja AdMob z konkretnymi miejscami reklam,
  ekran subskrypcji / IAP) i zgodność z politykami Google Play oraz wymóg polityki prywatności,
- wymusić konkretny stack, strukturę projektu, jakość kodu, brak placeholderów/TODO,
- wymagać, by wynik dał się zbudować do podpisanego AAB (instrukcje build/release),
- zawierać metadane do sklepu: tytuł, krótki/długi opis, słowa kluczowe ASO, kategorię.

Zwróć WYŁĄCZNIE treść promptu — bez komentarzy, bez bloków ``` i bez wstępu."""

_USER = """\
Zbuduj prompt "wklej i odbierz gotową aplikację" dla poniższej okazji.

Stack docelowy: {stack}

Okazja:
- Nazwa robocza: {nazwa}
- Nisza: {nisza}
- Pomysł: {pomysl}
- Grupa docelowa: {grupa}
- Model monetyzacji: {model_monet} — {szczegoly_monet}
- Szacowany przychod/mies.: {przychod}
- Kluczowe funkcje: {funkcje}
- Ryzyka do obejścia: {ryzyka}

Prompt ma być tak dobry, że jego wklejenie wystarczy do otrzymania kompletnej, \
publikowalnej aplikacji generującej przychód. Pisz po polsku."""


def generate_prompt(
    settings: Settings,
    opportunity: AppOpportunity,
    *,
    stack: str = DEFAULT_STACK,
    client: anthropic.Anthropic | None = None,
) -> GeneratedPrompt:
    """Tworzy gotowy do wklejenia prompt dla danej okazji."""
    from ._llm import make_client

    client = client or make_client(settings)

    prompt_text = generate_text(
        client,
        settings,
        system=_SYSTEM,
        prompt=_USER.format(
            stack=stack,
            nazwa=opportunity.nazwa,
            nisza=opportunity.nisza,
            pomysl=opportunity.pomysl,
            grupa=opportunity.grupa_docelowa,
            model_monet=opportunity.model_monetyzacji,
            szczegoly_monet=opportunity.szczegoly_monetyzacji,
            przychod=opportunity.szac_miesieczny_przychod_usd,
            funkcje="; ".join(opportunity.kluczowe_funkcje),
            ryzyka="; ".join(opportunity.ryzyka),
        ),
    )

    return GeneratedPrompt(
        nazwa_aplikacji=opportunity.nazwa,
        okazja=opportunity,
        prompt=prompt_text,
        stack=stack,
    )
